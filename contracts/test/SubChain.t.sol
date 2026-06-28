// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SubChain, ISubscriptionAllowance} from "../src/SubChain.sol";
import {SubscriptionAllowance} from "../src/SubscriptionAllowance.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract SubChainTest is Test {
    SubChain internal subChain;
    SubscriptionAllowance internal allowance;
    MockUSDC internal usdc;
    MockUSDC internal otherToken;

    address internal merchant = address(0xBEEF);
    address internal alice = address(0xA11CE);
    bytes32 internal serviceId = keccak256("research-feed");
    bytes32 internal metadataHash = keccak256("ipfs://research-feed");

    function setUp() public {
        subChain = new SubChain();
        allowance = new SubscriptionAllowance();
        usdc = new MockUSDC();
        otherToken = new MockUSDC();
        usdc.mint(alice, 1_000e6);
    }

    function testSubscribePaysFirstInvoiceAndGrantsEntitlement() public {
        uint256 planId = _createMonthlyPlan();
        uint256 subscriptionId = _subscribe(planId);

        SubChain.Subscription memory subscription = subChain.getSubscription(subscriptionId);
        assertEq(subscription.owner, alice);
        assertEq(subscription.planId, planId);
        assertEq(uint8(subscription.status), uint8(SubChain.SubscriptionStatus.Active));
        assertEq(subscription.periodIndex, 1);
        assertEq(subscription.nextChargeAt, block.timestamp + 30 days);
        assertTrue(subChain.hasEntitlement(alice, serviceId));
        assertEq(subChain.merchantBalances(merchant, usdc), 10e6);
        assertEq(usdc.balanceOf(alice), 990e6);
    }

    function testKeeperCanChargeWhenDue() public {
        uint256 planId = _createMonthlyPlan();
        uint256 subscriptionId = _subscribe(planId);

        vm.warp(block.timestamp + 30 days);
        subChain.chargeSubscription(subscriptionId);

        SubChain.Subscription memory subscription = subChain.getSubscription(subscriptionId);
        assertEq(subscription.periodIndex, 2);
        assertEq(subChain.merchantBalances(merchant, usdc), 20e6);
        assertEq(usdc.balanceOf(alice), 980e6);
    }

    function testKeeperCanChargeWithPurposeBoundAllowance() public {
        uint256 planId = _createMonthlyPlan();
        uint256 subscriptionId = _subscribe(planId);
        uint256 permissionId = _grantAllowance();

        vm.warp(block.timestamp + 30 days);
        subChain.chargeSubscriptionWithAllowance(subscriptionId, ISubscriptionAllowance(address(allowance)), permissionId);

        SubChain.Subscription memory subscription = subChain.getSubscription(subscriptionId);
        assertEq(subscription.periodIndex, 2);
        SubscriptionAllowance.Permission memory permission = allowance.getPermission(permissionId);
        assertEq(permission.totalSpent, 10e6);
    }

    function testDuplicateChargeForSamePeriodRevertsAfterSettlement() public {
        uint256 planId = _createMonthlyPlan();
        uint256 subscriptionId = _subscribe(planId);

        bytes32 key = subChain.invoiceKey(subscriptionId, 1);
        assertEq(subChain.invoiceIdsByKey(key), 1);

        vm.expectRevert(SubChain.NotDue.selector);
        subChain.chargeSubscription(subscriptionId);
    }

    function testPastDueKeepsGraceEntitlementThenSuspends() public {
        uint256 planId = _createMonthlyPlan();
        uint256 subscriptionId = _subscribe(planId);

        vm.warp(block.timestamp + 30 days);
        subChain.markPastDue(subscriptionId, "balance");

        assertTrue(subChain.hasEntitlement(alice, serviceId));
        SubChain.Subscription memory pastDue = subChain.getSubscription(subscriptionId);
        assertEq(uint8(pastDue.status), uint8(SubChain.SubscriptionStatus.PastDue));

        vm.warp(block.timestamp + 4 days);
        subChain.chargeSubscription(subscriptionId);

        SubChain.Subscription memory suspended = subChain.getSubscription(subscriptionId);
        assertEq(uint8(suspended.status), uint8(SubChain.SubscriptionStatus.Suspended));
        assertFalse(subChain.hasEntitlement(alice, serviceId));
    }

    function testPastDueRetryReusesInvoiceKey() public {
        uint256 planId = _createMonthlyPlan();
        uint256 subscriptionId = _subscribe(planId);

        vm.warp(block.timestamp + 30 days);
        uint256 failedInvoiceId = subChain.markPastDue(subscriptionId, "balance");
        uint256 invoiceCountBefore = subChain.invoiceCount();

        vm.startPrank(alice);
        usdc.approve(address(subChain), 100e6);
        vm.stopPrank();

        subChain.chargeSubscription(subscriptionId);

        assertEq(subChain.invoiceCount(), invoiceCountBefore);
        SubChain.Invoice memory invoice = subChain.getInvoice(failedInvoiceId);
        assertEq(uint8(invoice.status), uint8(SubChain.InvoiceStatus.Paid));
    }

    function testCancelStopsRenewalButKeepsPaidPeriodEntitlement() public {
        uint256 planId = _createMonthlyPlan();
        uint256 subscriptionId = _subscribe(planId);

        vm.prank(alice);
        subChain.cancelSubscription(subscriptionId);

        assertTrue(subChain.hasEntitlement(alice, serviceId));
        vm.warp(block.timestamp + 30 days);
        assertFalse(subChain.hasEntitlement(alice, serviceId));

        vm.expectRevert(SubChain.AlreadyFinalized.selector);
        subChain.chargeSubscription(subscriptionId);
    }

    function testIncludedUnitsAreEnforced() public {
        uint256 planId = _createMonthlyPlan();
        uint256 subscriptionId = _subscribe(planId);

        subChain.recordUsage(subscriptionId, 29);
        subChain.recordUsage(subscriptionId, 1);

        vm.expectRevert(SubChain.IncludedUnitsExceeded.selector);
        subChain.recordUsage(subscriptionId, 1);
    }

    function testMerchantCanRefundPaidInvoice() public {
        uint256 planId = _createMonthlyPlan();
        _subscribe(planId);

        vm.prank(merchant);
        subChain.refundInvoice(1);

        assertEq(subChain.merchantBalances(merchant, usdc), 0);
        assertEq(usdc.balanceOf(alice), 1_000e6);
    }

    function testAllowanceConsumesOnlyPurposeBoundCharge() public {
        uint256 permissionId = _grantAllowance();

        vm.prank(address(subChain));
        allowance.validateAndConsume(permissionId, 7, address(usdc), merchant, 1, 10e6, 1);

        SubscriptionAllowance.Permission memory permission = allowance.getPermission(permissionId);
        assertEq(permission.totalSpent, 10e6);
    }

    function testAllowanceRejectsWrongTokenMerchantAndPlan() public {
        uint256 permissionId = _grantAllowance();

        vm.startPrank(address(subChain));
        vm.expectRevert(SubscriptionAllowance.WrongToken.selector);
        allowance.validateAndConsume(permissionId, 7, address(otherToken), merchant, 1, 10e6, 1);

        vm.expectRevert(SubscriptionAllowance.WrongMerchant.selector);
        allowance.validateAndConsume(permissionId, 7, address(usdc), address(0xBAD), 1, 10e6, 1);

        vm.expectRevert(SubscriptionAllowance.WrongPlan.selector);
        allowance.validateAndConsume(permissionId, 7, address(usdc), merchant, 2, 10e6, 1);
        vm.stopPrank();
    }

    function testAllowanceRejectsCapsExpiryTooEarlyAndRevoke() public {
        uint256 permissionId = _grantAllowance();

        vm.prank(address(subChain));
        vm.expectRevert(SubscriptionAllowance.ChargeTooHigh.selector);
        allowance.validateAndConsume(permissionId, 7, address(usdc), merchant, 1, 11e6, 1);

        vm.prank(address(subChain));
        allowance.validateAndConsume(permissionId, 7, address(usdc), merchant, 1, 10e6, 1);

        vm.prank(address(subChain));
        vm.expectRevert(SubscriptionAllowance.TooEarly.selector);
        allowance.validateAndConsume(permissionId, 7, address(usdc), merchant, 1, 10e6, 2);

        vm.prank(alice);
        allowance.revokeAllowance(permissionId);

        vm.warp(block.timestamp + 30 days);
        vm.prank(address(subChain));
        vm.expectRevert(SubscriptionAllowance.Revoked.selector);
        allowance.validateAndConsume(permissionId, 7, address(usdc), merchant, 1, 10e6, 2);

        uint256 expiring = _grantAllowance();
        vm.warp(block.timestamp + 91 days);
        vm.prank(address(subChain));
        vm.expectRevert(SubscriptionAllowance.Expired.selector);
        allowance.validateAndConsume(expiring, 7, address(usdc), merchant, 1, 10e6, 1);
    }

    function _createMonthlyPlan() internal returns (uint256 planId) {
        vm.prank(merchant);
        planId = subChain.createPlan(usdc, 10e6, 30 days, 30, 3 days, serviceId, metadataHash, "ipfs://research-feed");
    }

    function _subscribe(uint256 planId) internal returns (uint256 subscriptionId) {
        vm.startPrank(alice);
        usdc.approve(address(subChain), 100e6);
        subscriptionId = subChain.subscribe(planId);
        vm.stopPrank();
    }

    function _grantAllowance() internal returns (uint256 permissionId) {
        SubscriptionAllowance.Permission memory permission = SubscriptionAllowance.Permission({
            owner: alice,
            token: address(usdc),
            subChain: address(subChain),
            merchant: merchant,
            planId: 1,
            perChargeCap: 10e6,
            periodCap: 10e6,
            totalCap: 30e6,
            minInterval: uint64(30 days),
            expiry: uint64(block.timestamp + 90 days),
            lastChargeAt: 0,
            spentThisPeriod: 0,
            totalSpent: 0,
            periodIndex: 0,
            revoked: false
        });

        vm.prank(alice);
        permissionId = allowance.grantAllowance(permission);
    }
}
