// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {HookMiner} from "v4-periphery/test/shared/HookMiner.sol";
import {LaunchHook} from "../src/LaunchHook.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";
import {LaunchRouter} from "../src/LaunchRouter.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";

contract LaunchpadTest is Test {
    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    int24 constant START_TICK = 200_200;

    LaunchHook hook;
    LaunchFactory factory;
    LaunchRouter router;

    address owner = makeAddr("owner");
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.createSelectFork(vm.envOr("FORK_RPC", string("https://rpc.testnet.chain.robinhood.com")));
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
                | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        bytes memory args = abi.encode(PM, owner);
        (address hookAddr, bytes32 salt) = HookMiner.find(address(this), flags, type(LaunchHook).creationCode, args);
        hook = new LaunchHook{salt: salt}(PM, owner);
        assertEq(address(hook), hookAddr);
        factory = new LaunchFactory(PM, hook, START_TICK);
        router = new LaunchRouter(PM, factory);
        vm.startPrank(owner);
        hook.setFactory(address(factory));
        hook.setTrustedRouter(address(router), true);
        vm.stopPrank();
        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _launch(uint256 firstBuy, bool rewards) internal returns (address token) {
        vm.prank(creator);
        token = factory.launch{value: firstBuy}("Hood Cat", "HCAT", "ipfs://meta", rewards, 0);
    }

    function test_launchSeedsWholeSupply() public {
        address token = _launch(0, true);
        uint256 burned = LaunchToken(token).balanceOf(factory.DEAD());
        assertEq(LaunchToken(token).balanceOf(address(PM)) + burned, factory.SUPPLY());
        assertLt(burned, 1e18);
        assertEq(factory.tokenCount(), 1);
        LaunchHook.PoolInfo memory p = hook.poolInfo(token);
        assertEq(p.creator, creator);
        assertTrue(p.creatorRewards);
    }

    function test_buySellFeesAndClaims() public {
        address token = _launch(0, true);
        vm.warp(block.timestamp + 10);

        (uint256 qIn, uint256 qOut) = router.quoteBuy(token, 1 ether);
        assertEq(qIn, 1 ether);

        vm.prank(alice);
        uint256 out = router.buy{value: 1 ether}(token, 0, alice, block.timestamp);
        assertEq(out, qOut);
        assertEq(LaunchToken(token).balanceOf(alice), out);
        // start FDV ~2 ETH: 1 ETH (minus 1% fee) buys roughly a third of supply
        assertGt(out, 300_000_000 ether);
        assertLt(out, 340_000_000 ether);
        assertEq(hook.platformAccrued(), 0.0075 ether);
        assertEq(hook.creatorAccrued(token), 0.0025 ether);

        uint256 half = out / 2;
        (, uint256 qEth) = router.quoteSell(token, half);
        vm.startPrank(alice);
        LaunchToken(token).approve(address(router), half);
        uint256 balBefore = alice.balance;
        uint256 ethOut = router.sell(token, half, qEth, alice, block.timestamp);
        vm.stopPrank();
        assertEq(ethOut, qEth);
        assertEq(alice.balance - balBefore, ethOut);
        assertGt(ethOut, 0.5 ether);

        uint256 creatorFees = hook.creatorAccrued(token);
        assertGt(creatorFees, 0.0025 ether);
        uint256 cBefore = creator.balance;
        vm.prank(creator);
        hook.claimCreatorFees(token);
        assertEq(creator.balance - cBefore, creatorFees);
        assertEq(hook.creatorAccrued(token), 0);

        vm.expectRevert(LaunchHook.NotCreator.selector);
        vm.prank(alice);
        hook.claimCreatorFees(token);

        uint256 plat = hook.platformAccrued();
        vm.prank(owner);
        hook.withdrawPlatformFees(owner);
        assertEq(owner.balance, plat);
    }

    function test_creatorRewardsOffChargesOnlyPlatform() public {
        address token = _launch(0, false);
        vm.warp(block.timestamp + 10);
        vm.prank(alice);
        router.buy{value: 1 ether}(token, 0, alice, block.timestamp);
        assertEq(hook.platformAccrued(), 0.0075 ether);
        assertEq(hook.creatorAccrued(token), 0);
    }

    function test_snipeTaxDecays() public {
        address token = _launch(0, true);
        (uint256 t0,) = hook.feeRates(token, true, alice);
        assertEq(t0, 9_900);
        vm.prank(alice);
        uint256 sniped = router.buy{value: 1 ether}(token, 0, alice, block.timestamp);

        address token2 = _launch(0, true);
        vm.warp(block.timestamp + 3);
        (uint256 t3,) = hook.feeRates(token2, true, alice);
        assertEq(t3, 100);
        vm.prank(bob);
        uint256 normal = router.buy{value: 1 ether}(token2, 0, bob, block.timestamp);
        assertLt(sniped * 50, normal);
        // sells are never taxed
        (uint256 s0,) = hook.feeRates(token2, false, alice);
        assertEq(s0, 100);
    }

    function test_launchBuyExemptFromSnipe() public {
        address token = _launch(1 ether, true);
        uint256 got = LaunchToken(token).balanceOf(creator);
        assertGt(got, 300_000_000 ether);
        assertEq(hook.platformAccrued(), 0.0075 ether);
    }

    function test_graduation() public {
        address token = _launch(0, true);
        vm.warp(block.timestamp + 10);
        vm.prank(alice);
        router.buy{value: 3 ether}(token, 0, alice, block.timestamp);
        assertFalse(hook.poolInfo(token).graduated);
        vm.prank(bob);
        router.buy{value: 4 ether}(token, 0, bob, block.timestamp);
        LaunchHook.PoolInfo memory p = hook.poolInfo(token);
        assertTrue(p.graduated);
        assertGe(p.netSold * 10_000, p.supply * 7_386);
    }

    function test_onlyFactoryCanCreatePoolsAndAddLiquidity() public {
        LaunchToken t = new LaunchToken("X", "X", 1e18, address(this));
        PoolKey memory key = PoolKey(CurrencyLibrary.ADDRESS_ZERO, Currency.wrap(address(t)), 0, 200, IHooks(address(hook)));
        vm.expectRevert();
        PM.initialize(key, TickMath.getSqrtPriceAtTick(START_TICK));
    }

    function test_slippageGuard() public {
        address token = _launch(0, true);
        vm.warp(block.timestamp + 10);
        (, uint256 q) = router.quoteBuy(token, 1 ether);
        vm.expectRevert(LaunchRouter.InsufficientOutput.selector);
        vm.prank(alice);
        router.buy{value: 1 ether}(token, q + 1, alice, block.timestamp);
    }

    function test_exactOutputSwapsChargeSameShare() public {
        address token = _launch(0, true);
        vm.warp(block.timestamp + 10);
        PoolSwapTest swapper = new PoolSwapTest(PM);
        PoolKey memory key = factory.poolKeyOf(token);
        PoolSwapTest.TestSettings memory ts = PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false});

        // exact-out buy: receive 100M tokens
        vm.prank(alice);
        BalanceDelta d = swapper.swap{value: 1 ether}(
            key, SwapParams(true, int256(100_000_000 ether), TickMath.MIN_SQRT_PRICE + 1), ts, ""
        );
        uint256 paid = uint256(uint128(-d.amount0()));
        assertEq(uint256(uint128(d.amount1())), 100_000_000 ether);
        uint256 fee1 = hook.platformAccrued() + hook.creatorAccrued(token);
        assertApproxEqAbs(fee1 * 10_000, paid * 100, 10_000);

        // exact-out sell: receive 0.1 ETH
        vm.startPrank(alice);
        LaunchToken(token).approve(address(swapper), type(uint256).max);
        uint256 before = alice.balance;
        d = swapper.swap(key, SwapParams(false, int256(0.1 ether), TickMath.MAX_SQRT_PRICE - 1), ts, "");
        vm.stopPrank();
        assertEq(alice.balance - before, 0.1 ether);
        uint256 fee2 = hook.platformAccrued() + hook.creatorAccrued(token) - fee1;
        // fee is 1% of the gross ETH the pool released (0.1 ETH + fee)
        assertApproxEqAbs(fee2 * 10_000, (0.1 ether + fee2) * 100, 10_000);
    }
}
