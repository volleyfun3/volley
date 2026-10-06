// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "v4-periphery/test/shared/HookMiner.sol";
import {LaunchHook} from "../src/LaunchHook.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";
import {LaunchRouter} from "../src/LaunchRouter.sol";

/// forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast --private-key $DEPLOYER_KEY
contract Deploy is Script {
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);

    function run() external {
        int24 startTick = int24(vm.envOr("START_TICK", int256(200_200)));
        vm.startBroadcast();
        address owner = vm.envOr("OWNER", msg.sender);
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
                | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        // deploy with msg.sender as temporary owner so we can wire it up, then hand over
        (address hookAddr, bytes32 salt) =
            HookMiner.find(CREATE2_DEPLOYER, flags, type(LaunchHook).creationCode, abi.encode(PM, msg.sender));
        LaunchHook hook = new LaunchHook{salt: salt}(PM, msg.sender);
        require(address(hook) == hookAddr, "hook address mismatch");
        LaunchFactory factory = new LaunchFactory(PM, hook, startTick);
        LaunchRouter router = new LaunchRouter(PM, factory);
        hook.setFactory(address(factory));
        hook.setTrustedRouter(address(router), true);
        if (owner != msg.sender) hook.transferOwnership(owner);
        vm.stopBroadcast();

        string memory json = "deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "startBlock", block.number);
        vm.serializeAddress(json, "poolManager", address(PM));
        vm.serializeAddress(json, "hook", address(hook));
        vm.serializeAddress(json, "factory", address(factory));
        string memory out = vm.serializeAddress(json, "router", address(router));
        vm.writeJson(out, string.concat("./deployments/", vm.toString(block.chainid), ".json"));
        console2.log("hook", address(hook));
        console2.log("factory", address(factory));
        console2.log("router", address(router));
    }
}
