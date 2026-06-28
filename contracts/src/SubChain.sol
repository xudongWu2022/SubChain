// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ISubscriptionAllowance {
    function validateAndConsume(
        uint256 permissionId,
        uint256 subscriptionId,
        address token,
        address merchant,
        uint256 planId,
        uint128 amount,
        uint32 periodIndex
    ) external;
}

contract SubChain is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum SubscriptionStatus {
        PendingActivation,
        Active,
        PastDue,
        Suspended,
        Cancelled,
        Expired
    }

    enum InvoiceStatus {
        Unpaid,
        Paid,
        Refunded,
        Failed
    }

    struct Plan {
        address merchant;
        IERC20 token;
        uint128 price;
        uint64 period;
        uint32 includedUnits;
        uint32 gracePeriod;
        uint32 version;
        bytes32 serviceId;
        bytes32 serviceMetadataHash;
        string metadataURI;
        bool active;
    }

    struct Subscription {
        address owner;
        uint256 planId;
        uint32 planVersion;
        uint64 startedAt;
        uint64 currentPeriodStart;
        uint64 nextChargeAt;
        uint64 graceEndsAt;
        uint32 periodIndex;
        uint32 usedUnits;
        SubscriptionStatus status;
    }

    struct Invoice {
        bytes32 invoiceKey;
        uint256 subscriptionId;
        uint256 planId;
        uint32 periodIndex;
        address subscriber;
        address merchant;
        IERC20 token;
        uint128 amount;
        uint64 dueAt;
        uint64 paidAt;
        InvoiceStatus status;
    }

    struct Entitlement {
        uint256 subscriptionId;
        SubscriptionStatus status;
        uint64 currentPeriodStart;
        uint64 nextChargeAt;
        uint32 remainingUnits;
    }

    uint64 public constant MIN_PERIOD = 1 days;
    uint256 public planCount;
    uint256 public subscriptionCount;
    uint256 public invoiceCount;

    mapping(uint256 => Plan) public plans;
    mapping(uint256 => Subscription) public subscriptions;
    mapping(uint256 => Invoice) public invoices;
    mapping(bytes32 => uint256) public invoiceIdsByKey;
    mapping(address owner => mapping(bytes32 serviceId => uint256 subscriptionId)) public activeSubscriptionByService;
    mapping(address merchant => mapping(IERC20 token => uint256 amount)) public merchantBalances;

    event PlanCreated(
        uint256 indexed planId,
        address indexed merchant,
        address indexed token,
        uint128 price,
        uint64 period,
        uint32 includedUnits,
        uint32 gracePeriod,
        uint32 version,
        bytes32 serviceId,
        bytes32 serviceMetadataHash,
        string metadataURI
    );
    event PlanStatusChanged(uint256 indexed planId, bool active);
    event SubscriptionCreated(
        uint256 indexed subscriptionId,
        uint256 indexed planId,
        address indexed owner,
        uint32 planVersion,
        uint64 nextChargeAt,
        bytes32 serviceId
    );
    event SubscriptionStatusChanged(
        uint256 indexed subscriptionId,
        SubscriptionStatus status,
        uint64 nextChargeAt,
        uint64 graceEndsAt
    );
    event SubscriptionCanceled(uint256 indexed subscriptionId, address indexed owner, uint256 canceledAt);
    event UsageRecorded(uint256 indexed subscriptionId, bytes32 indexed serviceId, uint32 units, uint32 usedUnits);
    event InvoiceReserved(
        uint256 indexed invoiceId,
        bytes32 indexed invoiceKey,
        uint256 indexed subscriptionId,
        uint32 periodIndex,
        uint64 dueAt
    );
    event InvoicePaid(
        uint256 indexed invoiceId,
        bytes32 indexed invoiceKey,
        uint256 indexed subscriptionId,
        uint256 planId,
        address subscriber,
        address merchant,
        address token,
        uint128 amount,
        uint64 paidAt,
        uint64 nextChargeAt
    );
    event InvoiceFailed(
        uint256 indexed invoiceId,
        bytes32 indexed invoiceKey,
        uint256 indexed subscriptionId,
        string reason,
        uint64 graceEndsAt
    );
    event InvoiceRefunded(uint256 indexed invoiceId, address indexed subscriber, uint128 amount);
    event MerchantWithdrawal(address indexed merchant, address indexed token, uint256 amount);

    error InvalidPlan();
    error InvalidPeriod();
    error PlanInactive();
    error NotSubscriber();
    error NotMerchant();
    error InvalidSubscription();
    error AlreadyFinalized();
    error NotDue();
    error NotEntitled();
    error IncludedUnitsExceeded();
    error InvoiceNotPaid();
    error InsufficientMerchantBalance();

    modifier onlyPlanMerchant(uint256 planId) {
        if (plans[planId].merchant != msg.sender) revert NotMerchant();
        _;
    }

    function createPlan(
        IERC20 token,
        uint128 price,
        uint64 period,
        uint32 includedUnits,
        uint32 gracePeriod,
        bytes32 serviceId,
        bytes32 serviceMetadataHash,
        string calldata metadataURI
    ) external returns (uint256 planId) {
        if (address(token) == address(0) || price == 0 || serviceId == bytes32(0)) revert InvalidPlan();
        if (period < MIN_PERIOD) revert InvalidPeriod();

        planId = ++planCount;
        plans[planId] = Plan({
            merchant: msg.sender,
            token: token,
            price: price,
            period: period,
            includedUnits: includedUnits,
            gracePeriod: gracePeriod,
            version: 1,
            serviceId: serviceId,
            serviceMetadataHash: serviceMetadataHash,
            metadataURI: metadataURI,
            active: true
        });

        emit PlanCreated(
            planId,
            msg.sender,
            address(token),
            price,
            period,
            includedUnits,
            gracePeriod,
            1,
            serviceId,
            serviceMetadataHash,
            metadataURI
        );
    }

    function setPlanActive(uint256 planId, bool active) external onlyPlanMerchant(planId) {
        plans[planId].active = active;
        emit PlanStatusChanged(planId, active);
    }

    function subscribe(uint256 planId) external nonReentrant returns (uint256 subscriptionId) {
        Plan storage plan = plans[planId];
        if (plan.merchant == address(0)) revert InvalidPlan();
        if (!plan.active) revert PlanInactive();

        uint64 nowTs = uint64(block.timestamp);
        subscriptionId = ++subscriptionCount;
        subscriptions[subscriptionId] = Subscription({
            owner: msg.sender,
            planId: planId,
            planVersion: plan.version,
            startedAt: nowTs,
            currentPeriodStart: nowTs,
            nextChargeAt: nowTs + plan.period,
            graceEndsAt: 0,
            periodIndex: 0,
            usedUnits: 0,
            status: SubscriptionStatus.PendingActivation
        });

        emit SubscriptionCreated(subscriptionId, planId, msg.sender, plan.version, nowTs + plan.period, plan.serviceId);

        uint256 invoiceId = _reserveInvoice(subscriptionId, nowTs);
        _settleInvoice(invoiceId, nowTs + plan.period);

        subscriptions[subscriptionId].status = SubscriptionStatus.Active;
        activeSubscriptionByService[msg.sender][plan.serviceId] = subscriptionId;
        emit SubscriptionStatusChanged(subscriptionId, SubscriptionStatus.Active, nowTs + plan.period, 0);
    }

    function chargeSubscription(uint256 subscriptionId) external nonReentrant returns (uint256 invoiceId) {
        return _chargeSubscription(subscriptionId, address(0), 0, false);
    }

    function chargeSubscriptionWithAllowance(
        uint256 subscriptionId,
        ISubscriptionAllowance subscriptionAllowance,
        uint256 permissionId
    ) external nonReentrant returns (uint256 invoiceId) {
        return _chargeSubscription(subscriptionId, address(subscriptionAllowance), permissionId, true);
    }

    function _chargeSubscription(
        uint256 subscriptionId,
        address subscriptionAllowance,
        uint256 permissionId,
        bool usePermission
    ) internal returns (uint256 invoiceId) {
        Subscription storage subscription = subscriptions[subscriptionId];
        if (subscription.owner == address(0)) revert InvalidSubscription();
        if (
            subscription.status == SubscriptionStatus.Cancelled || subscription.status == SubscriptionStatus.Suspended
                || subscription.status == SubscriptionStatus.Expired
        ) revert AlreadyFinalized();

        Plan storage plan = plans[subscription.planId];
        if (!plan.active) revert PlanInactive();
        if (block.timestamp < subscription.nextChargeAt) revert NotDue();

        if (
            subscription.status == SubscriptionStatus.PastDue && subscription.graceEndsAt > 0
                && block.timestamp > subscription.graceEndsAt
        ) {
            subscription.status = SubscriptionStatus.Suspended;
            activeSubscriptionByService[subscription.owner][plan.serviceId] = 0;
            emit SubscriptionStatusChanged(subscriptionId, SubscriptionStatus.Suspended, subscription.nextChargeAt, subscription.graceEndsAt);
            return invoiceIdsByKey[invoiceKey(subscriptionId, subscription.periodIndex + 1)];
        }

        invoiceId = _reserveInvoice(subscriptionId, subscription.nextChargeAt);
        if (usePermission) {
            Invoice storage invoice = invoices[invoiceId];
            ISubscriptionAllowance(subscriptionAllowance).validateAndConsume(
                permissionId,
                subscriptionId,
                address(invoice.token),
                invoice.merchant,
                invoice.planId,
                invoice.amount,
                invoice.periodIndex
            );
        }
        _settleInvoice(invoiceId, subscription.nextChargeAt + plan.period);
        subscription.status = SubscriptionStatus.Active;
        subscription.graceEndsAt = 0;
        activeSubscriptionByService[subscription.owner][plan.serviceId] = subscriptionId;
        emit SubscriptionStatusChanged(subscriptionId, SubscriptionStatus.Active, subscription.nextChargeAt, 0);
    }

    function markPastDue(uint256 subscriptionId, string calldata reason) external returns (uint256 invoiceId) {
        Subscription storage subscription = subscriptions[subscriptionId];
        if (subscription.owner == address(0)) revert InvalidSubscription();
        if (block.timestamp < subscription.nextChargeAt) revert NotDue();
        if (subscription.status == SubscriptionStatus.Cancelled || subscription.status == SubscriptionStatus.Suspended) {
            revert AlreadyFinalized();
        }

        Plan storage plan = plans[subscription.planId];
        invoiceId = _reserveInvoice(subscriptionId, subscription.nextChargeAt);
        Invoice storage invoice = invoices[invoiceId];
        invoice.status = InvoiceStatus.Failed;
        subscription.status = SubscriptionStatus.PastDue;
        subscription.graceEndsAt = uint64(subscription.nextChargeAt + plan.gracePeriod);

        emit InvoiceFailed(invoiceId, invoice.invoiceKey, subscriptionId, reason, subscription.graceEndsAt);
        emit SubscriptionStatusChanged(subscriptionId, SubscriptionStatus.PastDue, subscription.nextChargeAt, subscription.graceEndsAt);
    }

    function cancelSubscription(uint256 subscriptionId) external {
        Subscription storage subscription = subscriptions[subscriptionId];
        if (subscription.owner != msg.sender) revert NotSubscriber();
        if (subscription.status == SubscriptionStatus.Cancelled) revert AlreadyFinalized();

        Plan storage plan = plans[subscription.planId];
        subscription.status = SubscriptionStatus.Cancelled;
        if (block.timestamp >= subscription.nextChargeAt) {
            activeSubscriptionByService[subscription.owner][plan.serviceId] = 0;
        }
        emit SubscriptionCanceled(subscriptionId, msg.sender, block.timestamp);
        emit SubscriptionStatusChanged(subscriptionId, SubscriptionStatus.Cancelled, subscription.nextChargeAt, subscription.graceEndsAt);
    }

    function recordUsage(uint256 subscriptionId, uint32 units) external {
        Subscription storage subscription = subscriptions[subscriptionId];
        if (!_isEntitled(subscription)) revert NotEntitled();

        Plan storage plan = plans[subscription.planId];
        if (plan.includedUnits != 0 && subscription.usedUnits + units > plan.includedUnits) {
            revert IncludedUnitsExceeded();
        }

        subscription.usedUnits += units;
        emit UsageRecorded(subscriptionId, plan.serviceId, units, subscription.usedUnits);
    }

    function hasEntitlement(address owner, bytes32 serviceId) public view returns (bool) {
        uint256 subscriptionId = activeSubscriptionByService[owner][serviceId];
        if (subscriptionId == 0) {
            return false;
        }

        return _isEntitled(subscriptions[subscriptionId]);
    }

    function getSubscription(uint256 subscriptionId) external view returns (Subscription memory) {
        return subscriptions[subscriptionId];
    }

    function getInvoice(uint256 invoiceId) external view returns (Invoice memory) {
        return invoices[invoiceId];
    }

    function entitlementOf(address owner, bytes32 serviceId) external view returns (Entitlement memory entitlement) {
        uint256 subscriptionId = activeSubscriptionByService[owner][serviceId];
        if (subscriptionId == 0) {
            return entitlement;
        }

        Subscription storage subscription = subscriptions[subscriptionId];
        Plan storage plan = plans[subscription.planId];
        uint32 remainingUnits = plan.includedUnits == 0 || subscription.usedUnits >= plan.includedUnits
            ? 0
            : plan.includedUnits - subscription.usedUnits;

        return Entitlement({
            subscriptionId: subscriptionId,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            nextChargeAt: subscription.nextChargeAt,
            remainingUnits: remainingUnits
        });
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

    function invoiceKey(uint256 subscriptionId, uint32 periodIndex) public pure returns (bytes32) {
        return keccak256(abi.encode(subscriptionId, periodIndex));
    }

    function _reserveInvoice(uint256 subscriptionId, uint64 dueAt) internal returns (uint256 invoiceId) {
        Subscription storage subscription = subscriptions[subscriptionId];
        Plan storage plan = plans[subscription.planId];
        uint32 invoicePeriodIndex = subscription.periodIndex + 1;
        bytes32 key = invoiceKey(subscriptionId, invoicePeriodIndex);

        invoiceId = invoiceIdsByKey[key];
        if (invoiceId != 0) {
            Invoice storage existing = invoices[invoiceId];
            if (existing.status == InvoiceStatus.Paid) revert AlreadyFinalized();
            return invoiceId;
        }

        invoiceId = ++invoiceCount;
        invoiceIdsByKey[key] = invoiceId;
        invoices[invoiceId] = Invoice({
            invoiceKey: key,
            subscriptionId: subscriptionId,
            planId: subscription.planId,
            periodIndex: invoicePeriodIndex,
            subscriber: subscription.owner,
            merchant: plan.merchant,
            token: plan.token,
            amount: plan.price,
            dueAt: dueAt,
            paidAt: 0,
            status: InvoiceStatus.Unpaid
        });

        emit InvoiceReserved(invoiceId, key, subscriptionId, invoicePeriodIndex, dueAt);
    }

    function _settleInvoice(uint256 invoiceId, uint64 nextChargeAt) internal {
        Invoice storage invoice = invoices[invoiceId];
        Subscription storage subscription = subscriptions[invoice.subscriptionId];
        Plan storage plan = plans[subscription.planId];

        invoice.token.safeTransferFrom(invoice.subscriber, address(this), invoice.amount);
        invoice.status = InvoiceStatus.Paid;
        invoice.paidAt = uint64(block.timestamp);
        merchantBalances[invoice.merchant][invoice.token] += invoice.amount;

        subscription.currentPeriodStart = invoice.dueAt;
        subscription.nextChargeAt = nextChargeAt;
        subscription.periodIndex = invoice.periodIndex;
        subscription.usedUnits = 0;

        emit InvoicePaid(
            invoiceId,
            invoice.invoiceKey,
            invoice.subscriptionId,
            invoice.planId,
            invoice.subscriber,
            invoice.merchant,
            address(invoice.token),
            invoice.amount,
            invoice.paidAt,
            nextChargeAt
        );

        if (plan.serviceId != bytes32(0)) {
            activeSubscriptionByService[subscription.owner][plan.serviceId] = invoice.subscriptionId;
        }
    }

    function _isEntitled(Subscription storage subscription) internal view returns (bool) {
        if (subscription.owner == address(0)) {
            return false;
        }

        if (subscription.status == SubscriptionStatus.Active) {
            return block.timestamp < subscription.nextChargeAt;
        }

        if (subscription.status == SubscriptionStatus.PastDue) {
            return subscription.graceEndsAt != 0 && block.timestamp <= subscription.graceEndsAt;
        }

        if (subscription.status == SubscriptionStatus.Cancelled) {
            return block.timestamp < subscription.nextChargeAt;
        }

        return false;
    }
}
