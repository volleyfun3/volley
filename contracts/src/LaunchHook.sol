// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {Owned} from "solmate/src/auth/Owned.sol";

/// @notice Fee + anti-snipe hook for launchpad pools (native ETH / token).
/// Charges the trading fee in ETH on every swap, adds a decaying tax on buys in the first seconds
/// after launch, tracks net tokens sold for graduation, and only lets the factory create pools and add liquidity.
contract LaunchHook is IHooks, IUnlockCallback, Owned {
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    error NotPoolManager();
    error NotFactory();
    error NotCreator();
    error UnknownPool();
    error HookNotImplemented();
    error FactoryAlreadySet();

    struct PoolInfo {
        address token;
        address creator;
        uint40 launchedAt;
        bool creatorRewards;
        bool graduated;
        uint256 netSold;
        uint256 supply;
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant PLATFORM_FEE_BPS = 75;
    uint256 public constant CREATOR_FEE_BPS = 25;
    uint256 public constant GRADUATION_BPS = 7_386;
    uint256 public constant MAX_TOTAL_BPS = 9_900;
    uint256 public constant SNIPE_WINDOW = 3;

    IPoolManager public immutable poolManager;
    address public factory;

    mapping(PoolId => PoolInfo) public pools;
    mapping(address token => PoolId) public poolIdOf;
    mapping(address token => uint256) public creatorAccrued;
    mapping(address => bool) public trustedRouter;
    uint256 public platformAccrued;

    event FactorySet(address factory);
    event RouterTrusted(address router, bool trusted);
    event Trade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint256 platformFee,
        uint256 creatorFee,
        uint160 sqrtPriceX96,
        uint256 netSold
    );
    event Graduated(address indexed token, uint256 netSold);
    event CreatorFeesClaimed(address indexed token, address indexed creator, uint256 amount);
    event PlatformFeesWithdrawn(address indexed to, uint256 amount);
    event CreatorTransferred(address indexed token, address indexed from, address indexed to);

    constructor(IPoolManager _poolManager, address _owner) Owned(_owner) {
        poolManager = _poolManager;
        Hooks.validateHookPermissions(
            this,
            Hooks.Permissions({
                beforeInitialize: true,
                afterInitialize: false,
                beforeAddLiquidity: true,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: true,
                afterSwapReturnDelta: true,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            })
        );
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    // ---------------------------------------------------------------- admin

    function setFactory(address _factory) external onlyOwner {
        if (factory != address(0)) revert FactoryAlreadySet();
        factory = _factory;
        emit FactorySet(_factory);
    }

    function setTrustedRouter(address router, bool trusted) external onlyOwner {
        trustedRouter[router] = trusted;
        emit RouterTrusted(router, trusted);
    }

    function register(PoolKey calldata key, address token, address creator, bool creatorRewards, uint256 supply)
        external
    {
        if (msg.sender != factory) revert NotFactory();
        PoolId id = key.toId();
        pools[id] = PoolInfo({
            token: token,
            creator: creator,
            launchedAt: uint40(block.timestamp),
            creatorRewards: creatorRewards,
            graduated: false,
            netSold: 0,
            supply: supply
        });
        poolIdOf[token] = id;
    }

    // ---------------------------------------------------------------- views

    function poolInfo(address token) external view returns (PoolInfo memory) {
        return pools[poolIdOf[token]];
    }

    /// @notice Extra tax on buys right after launch, 99% * (e^(-1.33t) - e^(-3.99)) / (1 - e^(-3.99)):
    /// 99% in the launch second, 24.81% at 1s, 5.19% at 2s, nothing from 3s. Tax + fee is capped at 99%.
    function snipeTaxBps(uint256 launchedAt) public view returns (uint256) {
        uint256 elapsed = block.timestamp - launchedAt;
        if (elapsed == 0) return 9_900;
        if (elapsed == 1) return 2_481;
        if (elapsed == 2) return 519;
        return 0;
    }

    /// @notice Fee rates (bps of the gross ETH moved) that a trade would pay right now.
    function feeRates(address token, bool isBuy, address sender)
        public
        view
        returns (uint256 totalBps, uint256 creatorBps)
    {
        PoolInfo storage p = pools[poolIdOf[token]];
        return _feeRates(p, isBuy, sender);
    }

    function _feeRates(PoolInfo storage p, bool isBuy, address sender)
        internal
        view
        returns (uint256 totalBps, uint256 creatorBps)
    {
        creatorBps = p.creatorRewards ? CREATOR_FEE_BPS : 0;
        totalBps = PLATFORM_FEE_BPS + creatorBps;
        if (isBuy && sender != factory) totalBps += snipeTaxBps(p.launchedAt);
        if (totalBps > MAX_TOTAL_BPS) totalBps = MAX_TOTAL_BPS;
    }

    // ---------------------------------------------------------------- hook callbacks

    function beforeInitialize(address sender, PoolKey calldata, uint160) external view onlyPoolManager returns (bytes4) {
        if (sender != factory) revert NotFactory();
        return IHooks.beforeInitialize.selector;
    }

    function beforeAddLiquidity(address sender, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != factory) revert NotFactory();
        return IHooks.beforeAddLiquidity.selector;
    }

    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolInfo storage p = pools[key.toId()];
        if (p.token == address(0)) revert UnknownPool();
        bool isBuy = params.zeroForOne;
        bool exactIn = params.amountSpecified < 0;
        // ETH is the specified side on exact-in buys and exact-out sells: take the fee before the swap.
        if (isBuy == exactIn) {
            (uint256 totalBps, uint256 creatorBps) = _feeRates(p, isBuy, sender);
            uint256 amount = exactIn ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
            uint256 fee = exactIn ? amount * totalBps / BPS : amount * totalBps / (BPS - totalBps);
            _accrue(p, fee, totalBps, creatorBps);
            return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(fee)), 0), 0);
        }
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4, int128) {
        PoolId id = key.toId();
        PoolInfo storage p = pools[id];
        bool isBuy = params.zeroForOne;
        bool exactIn = params.amountSpecified < 0;
        (uint256 totalBps, uint256 creatorBps) = _feeRates(p, isBuy, sender);

        int128 amount0 = delta.amount0();
        int128 amount1 = delta.amount1();
        uint256 ethPool = uint256(uint128(amount0 < 0 ? -amount0 : amount0));

        uint256 fee;
        int128 hookDelta;
        if (isBuy == exactIn) {
            // already charged in beforeSwap; recompute for accounting/event
            uint256 amount = exactIn ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
            fee = exactIn ? amount * totalBps / BPS : amount * totalBps / (BPS - totalBps);
        } else {
            // ETH is unspecified: exact-out buys (ETH in) and exact-in sells (ETH out)
            fee = isBuy ? ethPool * totalBps / (BPS - totalBps) : ethPool * totalBps / BPS;
            _accrue(p, fee, totalBps, creatorBps);
            hookDelta = int128(int256(fee));
        }

        uint256 tokenAmount;
        uint256 ethAmount;
        if (isBuy) {
            tokenAmount = uint256(uint128(amount1));
            ethAmount = ethPool + fee;
            p.netSold += tokenAmount;
        } else {
            tokenAmount = uint256(uint128(-amount1));
            ethAmount = ethPool - fee;
            p.netSold = tokenAmount > p.netSold ? 0 : p.netSold - tokenAmount;
        }

        if (!p.graduated && p.netSold * BPS >= p.supply * GRADUATION_BPS) {
            p.graduated = true;
            emit Graduated(p.token, p.netSold);
        }

        address trader = tx.origin;
        if ((sender == factory || trustedRouter[sender]) && hookData.length == 32) {
            trader = abi.decode(hookData, (address));
        }
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(id);
        uint256 creatorFee = totalBps == 0 ? 0 : fee * creatorBps / totalBps;
        emit Trade(p.token, trader, isBuy, ethAmount, tokenAmount, fee - creatorFee, creatorFee, sqrtPriceX96, p.netSold);

        return (IHooks.afterSwap.selector, hookDelta);
    }

    function _accrue(PoolInfo storage p, uint256 fee, uint256 totalBps, uint256 creatorBps) internal {
        if (fee == 0) return;
        uint256 creatorFee = fee * creatorBps / totalBps;
        creatorAccrued[p.token] += creatorFee;
        platformAccrued += fee - creatorFee;
        poolManager.mint(address(this), CurrencyLibrary.ADDRESS_ZERO.toId(), fee);
    }

    // ---------------------------------------------------------------- fee claims

    function claimCreatorFees(address token) external returns (uint256 amount) {
        PoolInfo storage p = pools[poolIdOf[token]];
        if (msg.sender != p.creator) revert NotCreator();
        amount = creatorAccrued[token];
        if (amount == 0) return 0;
        creatorAccrued[token] = 0;
        poolManager.unlock(abi.encode(msg.sender, amount));
        emit CreatorFeesClaimed(token, msg.sender, amount);
    }

    function transferCreator(address token, address newCreator) external {
        PoolInfo storage p = pools[poolIdOf[token]];
        if (msg.sender != p.creator) revert NotCreator();
        p.creator = newCreator;
        emit CreatorTransferred(token, msg.sender, newCreator);
    }

    function withdrawPlatformFees(address to) external onlyOwner returns (uint256 amount) {
        amount = platformAccrued;
        if (amount == 0) return 0;
        platformAccrued = 0;
        poolManager.unlock(abi.encode(to, amount));
        emit PlatformFeesWithdrawn(to, amount);
    }

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (address to, uint256 amount) = abi.decode(data, (address, uint256));
        poolManager.burn(address(this), CurrencyLibrary.ADDRESS_ZERO.toId(), amount);
        poolManager.take(CurrencyLibrary.ADDRESS_ZERO, to, amount);
        return "";
    }

    // ---------------------------------------------------------------- unused hooks

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
