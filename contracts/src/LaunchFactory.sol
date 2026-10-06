// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/src/libraries/FixedPoint96.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {LaunchToken} from "./LaunchToken.sol";
import {LaunchHook} from "./LaunchHook.sol";

/// @notice Deploys a fixed-supply token, opens its native-ETH Uniswap v4 pool and seeds it with the whole supply
/// as single-sided liquidity. The position is owned by this contract, which has no way to remove it.
contract LaunchFactory is IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;
    using CurrencyLibrary for Currency;

    error NotPoolManager();
    error InvalidStartTick();
    error InvalidName();
    error InsufficientOutput();

    uint256 public constant SUPPLY = 1_000_000_000 ether;
    int24 public constant TICK_SPACING = 200;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IPoolManager public immutable poolManager;
    LaunchHook public immutable hook;
    /// @dev Upper tick of the launch position (= initial price, in tokens per ETH).
    int24 public immutable startTick;

    address[] public allTokens;
    mapping(address token => PoolKey) internal _keys;

    event TokenLaunched(
        address indexed token,
        address indexed creator,
        PoolId indexed poolId,
        string name,
        string symbol,
        string metadataURI,
        bool creatorRewards,
        uint256 launchBuyEth,
        uint256 launchBuyTokens,
        uint256 tokensBurned
    );

    constructor(IPoolManager _poolManager, LaunchHook _hook, int24 _startTick) {
        if (_startTick % TICK_SPACING != 0 || _startTick <= TickMath.minUsableTick(TICK_SPACING)) {
            revert InvalidStartTick();
        }
        poolManager = _poolManager;
        hook = _hook;
        startTick = _startTick;
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function poolKeyOf(address token) external view returns (PoolKey memory) {
        return _keys[token];
    }

    /// @param minTokensOut Slippage guard for the optional launch buy (msg.value).
    function launch(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        bool creatorRewards,
        uint256 minTokensOut
    ) external payable returns (address token) {
        if (bytes(name).length == 0 || bytes(name).length > 64 || bytes(symbol).length == 0 || bytes(symbol).length > 16)
        {
            revert InvalidName();
        }
        token = address(
            new LaunchToken{salt: keccak256(abi.encode(msg.sender, allTokens.length))}(
                name, symbol, SUPPLY, address(this)
            )
        );
        PoolKey memory key = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(token),
            fee: 0,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });
        _keys[token] = key;
        allTokens.push(token);

        hook.register(key, token, msg.sender, creatorRewards, SUPPLY);
        poolManager.initialize(key, TickMath.getSqrtPriceAtTick(startTick));

        (uint256 boughtTokens) =
            abi.decode(poolManager.unlock(abi.encode(key, msg.sender, msg.value, minTokensOut)), (uint256));

        uint256 leftover = LaunchToken(token).balanceOf(address(this));
        if (leftover > 0) LaunchToken(token).transfer(DEAD, leftover);

        emit TokenLaunched(
            token, msg.sender, key.toId(), name, symbol, metadataURI, creatorRewards, msg.value, boughtTokens, leftover
        );
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (PoolKey memory key, address creator, uint256 ethIn, uint256 minTokensOut) =
            abi.decode(data, (PoolKey, address, uint256, uint256));

        int24 tickLower = TickMath.minUsableTick(TICK_SPACING);
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(startTick);
        uint128 liquidity = uint128(FullMath.mulDiv(SUPPLY, FixedPoint96.Q96, sqrtUpper - sqrtLower));

        (BalanceDelta addDelta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: startTick,
                liquidityDelta: int256(uint256(liquidity)),
                salt: bytes32(0)
            }),
            ""
        );
        uint256 owed = uint256(uint128(-addDelta.amount1()));
        poolManager.sync(key.currency1);
        LaunchToken(Currency.unwrap(key.currency1)).transfer(address(poolManager), owed);
        poolManager.settle();

        uint256 bought;
        if (ethIn > 0) {
            BalanceDelta d = poolManager.swap(
                key,
                SwapParams({
                    zeroForOne: true,
                    amountSpecified: -int256(ethIn),
                    sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
                }),
                abi.encode(creator)
            );
            poolManager.settle{value: uint256(uint128(-d.amount0()))}();
            bought = uint256(uint128(d.amount1()));
            if (bought < minTokensOut) revert InsufficientOutput();
            poolManager.take(key.currency1, creator, bought);
        }
        return abi.encode(bought);
    }
}
