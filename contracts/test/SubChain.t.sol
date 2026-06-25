// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SubChain} from "../src/SubChain.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract SubChainTest is Test {
    SubChain internal subChain;
    MockUSDC internal usdc;

    address internal merchant = address(0xBEEF);
    address internal alice = address(0xA11CE);

    function setUp() public {
        subChain = new SubChain();
        usdc = new MockUSDC();
        usdc.mint(alice, 1_000e6);
    }

    function testSubscribePaysFirstInvoice() public {
        uint256 planId = _createMonthlyPlan();

        vm.startPrank(alice);
        usdc.approve(address(subChain), 100e6);
        uint256 subscriptionId = subChain.subscribe(planId);
        vm.stopPrank();

        (, address subscriber,, uint256 currentPeriodStart, uint256 nextChargeAt, bool canceled) =
            subChain.subscriptions(subscriptionId);

        assertEq(subscriber, alice);
        assertEq(currentPeriodStart, block.timestamp);
        assertEq(nextChargeAt, block.timestamp + 30 days);
        assertFalse(canceled);
        assertEq(subChain.merchantBalances(merchant, usdc), 10e6);
        assertEq(usdc.balanceOf(alice), 990e6);
    }

    function testKeeperCanChargeWhenDue() public {
        uint256 planId = _createMonthlyPlan();

        vm.startPrank(alice);
        usdc.approve(address(subChain), 100e6);
        uint256 subscriptionId = subChain.subscribe(planId);
        vm.stopPrank();

        vm.warp(block.timestamp + 30 days);
        subChain.chargeSubscription(subscriptionId);

        assertEq(subChain.merchantBalances(merchant, usdc), 20e6);
        assertEq(usdc.balanceOf(alice), 980e6);
    }

    function testSubscriberCanCancel() public {
        uint256 planId = _createMonthlyPlan();

        vm.startPrank(alice);
        usdc.approve(address(subChain), 100e6);
        uint256 subscriptionId = subChain.subscribe(planId);
        subChain.cancelSubscription(subscriptionId);
        vm.stopPrank();

        (,,,,, bool canceled) = subChain.subscriptions(subscriptionId);
        assertTrue(canceled);
    }

    function testMerchantCanRefundPaidInvoice() public {
        uint256 planId = _createMonthlyPlan();

        vm.startPrank(alice);
        usdc.approve(address(subChain), 100e6);
        subChain.subscribe(planId);
        vm.stopPrank();

        vm.prank(merchant);
        subChain.refundInvoice(1);

        assertEq(subChain.merchantBalances(merchant, usdc), 0);
        assertEq(usdc.balanceOf(alice), 1_000e6);
    }

    function _createMonthlyPlan() internal returns (uint256 planId) {
        vm.prank(merchant);
        planId = subChain.createPlan(usdc, 10e6, 30 days, 3 days, "ipfs://pro-plan");
    }
}

