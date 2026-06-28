// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SubChain} from "../src/SubChain.sol";
import {SubscriptionAllowance} from "../src/SubscriptionAllowance.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        MockUSDC usdc = new MockUSDC();
        SubChain subChain = new SubChain();
        SubscriptionAllowance subscriptionAllowance = new SubscriptionAllowance();

        usdc.mint(msg.sender, 1_000_000e6);

        vm.stopBroadcast();

        console2.log("MockUSDC:", address(usdc));
        console2.log("SubChain:", address(subChain));
        console2.log("SubscriptionAllowance:", address(subscriptionAllowance));
    }
}
