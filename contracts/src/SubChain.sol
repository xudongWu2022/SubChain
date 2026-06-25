// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SubChain is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum InvoiceStatus {
        Unpaid,
        Paid,
        Refunded,
        Failed
    }

    struct Plan {
        address merchant;
        IERC20 token;
        uint256 amount;
        uint256 interval;
        uint256 gracePeriod;
        string metadataURI;
        bool active;
    }

    struct Subscription {
        uint256 planId;
        address subscriber;
        uint256 startedAt;
        uint256 currentPeriodStart;
        uint256 nextChargeAt;
        bool canceled;
    }

    struct Invoice {
        uint256 subscriptionId;
        uint256 planId;
        address subscriber;
        address merchant;
        IERC20 token;
        uint256 amount;
        uint256 dueAt;
        uint256 paidAt;
        InvoiceStatus status;
    }

    uint256 public constant MIN_INTERVAL = 1 days;
    uint256 public planCount;
    uint256 public subscriptionCount;
    uint256 public invoiceCount;

    mapping(uint256 => Plan) public plans;
    mapping(uint256 => Subscription) public subscriptions;
    mapping(uint256 => Invoice) public invoices;
    mapping(address merchant => mapping(IERC20 token => uint256 amount)) public merchantBalances;

    event PlanCreated(
        uint256 indexed planId,
        address indexed merchant,
        address indexed token,
        uint256 amount,
        uint256 interval,
        uint256 gracePeriod,
        string metadataURI
    );
    event PlanStatusChanged(uint256 indexed planId, bool active);
    event SubscriptionCreated(
        uint256 indexed subscriptionId,
        uint256 indexed planId,
        address indexed subscriber,
        uint256 nextChargeAt
    );
    event SubscriptionCanceled(uint256 indexed subscriptionId, address indexed subscriber, uint256 canceledAt);
    event InvoicePaid(
        uint256 indexed invoiceId,
        uint256 indexed subscriptionId,
        uint256 indexed planId,
        address subscriber,
        address merchant,
        address token,
        uint256 amount,
        uint256 paidAt,
        uint256 nextChargeAt
    );
    event InvoiceFailed(uint256 indexed invoiceId, uint256 indexed subscriptionId, string reason);
    event InvoiceRefunded(uint256 indexed invoiceId, address indexed subscriber, uint256 amount);
    event MerchantWithdrawal(address indexed merchant, address indexed token, uint256 amount);

    error InvalidPlan();
    error InvalidInterval();
    error PlanInactive();
    error NotSubscriber();
    error NotMerchant();
    error AlreadyCanceled();
    error NotDue();
    error GracePeriodExpired();
    error InvoiceNotPaid();
    error InsufficientMerchantBalance();

    modifier onlyPlanMerchant(uint256 planId) {
        if (plans[planId].merchant != msg.sender) revert NotMerchant();
        _;
    }

    function createPlan(
        IERC20 token,
        uint256 amount,
        uint256 interval,
        uint256 gracePeriod,
        string calldata metadataURI
    ) external returns (uint256 planId) {
        if (address(token) == address(0) || amount == 0) revert InvalidPlan();
        if (interval < MIN_INTERVAL) revert InvalidInterval();

        planId = ++planCount;
        plans[planId] = Plan({
            merchant: msg.sender,
            token: token,
            amount: amount,
            interval: interval,
            gracePeriod: gracePeriod,
            metadataURI: metadataURI,
            active: true
        });

        emit PlanCreated(planId, msg.sender, address(token), amount, interval, gracePeriod, metadataURI);
    }

    function setPlanActive(uint256 planId, bool active) external onlyPlanMerchant(planId) {
        plans[planId].active = active;
        emit PlanStatusChanged(planId, active);
    }

    function subscribe(uint256 planId) external nonReentrant returns (uint256 subscriptionId) {
        Plan storage plan = plans[planId];
        if (plan.merchant == address(0)) revert InvalidPlan();
        if (!plan.active) revert PlanInactive();

        subscriptionId = ++subscriptionCount;
        uint256 nowTs = block.timestamp;
        subscriptions[subscriptionId] = Subscription({
            planId: planId,
            subscriber: msg.sender,
            startedAt: nowTs,
            currentPeriodStart: nowTs,
            nextChargeAt: nowTs + plan.interval,
            canceled: false
        });

        emit SubscriptionCreated(subscriptionId, planId, msg.sender, nowTs + plan.interval);
        _payInvoice(subscriptionId, nowTs, nowTs + plan.interval);
    }

    function chargeSubscription(uint256 subscriptionId) external nonReentrant returns (uint256 invoiceId) {
        Subscription storage subscription = subscriptions[subscriptionId];
        Plan storage plan = plans[subscription.planId];

        if (subscription.subscriber == address(0)) revert InvalidPlan();
        if (subscription.canceled) revert AlreadyCanceled();
        if (!plan.active) revert PlanInactive();
        if (block.timestamp < subscription.nextChargeAt) revert NotDue();
        if (block.timestamp > subscription.nextChargeAt + plan.gracePeriod) revert GracePeriodExpired();

        uint256 dueAt = subscription.nextChargeAt;
        uint256 nextChargeAt = dueAt + plan.interval;
        invoiceId = _payInvoice(subscriptionId, dueAt, nextChargeAt);
        subscription.currentPeriodStart = dueAt;
        subscription.nextChargeAt = nextChargeAt;
    }

    function cancelSubscription(uint256 subscriptionId) external {
        Subscription storage subscription = subscriptions[subscriptionId];
        if (subscription.subscriber != msg.sender) revert NotSubscriber();
        if (subscription.canceled) revert AlreadyCanceled();

        subscription.canceled = true;
        emit SubscriptionCanceled(subscriptionId, msg.sender, block.timestamp);
    }

    function refundInvoice(uint256 invoiceId) external nonReentrant {
        Invoice storage invoice = invoices[invoiceId];
        if (invoice.merchant != msg.sender) revert NotMerchant();
        if (invoice.status != InvoiceStatus.Paid) revert InvoiceNotPaid();

        uint256 balance = merchantBalances[msg.sender][invoice.token];
        if (balance < invoice.amount) revert InsufficientMerchantBalance();

        merchantBalances[msg.sender][invoice.token] = balance - invoice.amount;
        invoice.status = InvoiceStatus.Refunded;
        invoice.token.safeTransfer(invoice.subscriber, invoice.amount);

        emit InvoiceRefunded(invoiceId, invoice.subscriber, invoice.amount);
    }

    function withdraw(IERC20 token, uint256 amount) external nonReentrant {
        uint256 balance = merchantBalances[msg.sender][token];
        if (balance < amount) revert InsufficientMerchantBalance();

        merchantBalances[msg.sender][token] = balance - amount;
        token.safeTransfer(msg.sender, amount);

        emit MerchantWithdrawal(msg.sender, address(token), amount);
    }

    function getSubscription(uint256 subscriptionId) external view returns (Subscription memory) {
        return subscriptions[subscriptionId];
    }

    function _payInvoice(
        uint256 subscriptionId,
        uint256 dueAt,
        uint256 nextChargeAt
    ) internal returns (uint256 invoiceId) {
        Subscription storage subscription = subscriptions[subscriptionId];
        Plan storage plan = plans[subscription.planId];

        invoiceId = ++invoiceCount;
        invoices[invoiceId] = Invoice({
            subscriptionId: subscriptionId,
            planId: subscription.planId,
            subscriber: subscription.subscriber,
            merchant: plan.merchant,
            token: plan.token,
            amount: plan.amount,
            dueAt: dueAt,
            paidAt: block.timestamp,
            status: InvoiceStatus.Paid
        });

        plan.token.safeTransferFrom(subscription.subscriber, address(this), plan.amount);
        merchantBalances[plan.merchant][plan.token] += plan.amount;

        emit InvoicePaid(
            invoiceId,
            subscriptionId,
            subscription.planId,
            subscription.subscriber,
            plan.merchant,
            address(plan.token),
            plan.amount,
            block.timestamp,
            nextChargeAt
        );
    }
}
