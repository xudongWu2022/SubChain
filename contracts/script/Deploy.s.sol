// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SubChain} from "../src/SubChain.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0));
        if (deployerKey == 0) {
            vm.startBroadcast();
        } else {
            vm.startBroadcast(deployerKey);
        }

        MockUSDC usdc = new MockUSDC();
        SubChain subChain = new SubChain();

        usdc.mint(msg.sender, 1_000_000e6);

        vm.stopBroadcast();

        console2.log("MockUSDC:", address(usdc));
        console2.log("SubChain:", address(subChain));
    }
}

