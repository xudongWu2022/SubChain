# SubChain API

## Contracts

`SubChain` is the subscription source of truth.

- `createPlan(token, price, period, includedUnits, gracePeriod, serviceId, serviceMetadataHash, metadataURI) returns planId`
- `setPlanActive(planId, active)`
- `subscribe(planId) returns subscriptionId`
- `chargeSubscription(subscriptionId) returns invoiceId`
- `chargeSubscriptionWithAllowance(subscriptionId, allowanceContract, permissionId) returns invoiceId`
- `cancelSubscription(subscriptionId)`
- `hasEntitlement(owner, serviceId) returns bool`
- `entitlementOf(owner, serviceId) returns subscriptionId, status, currentPeriodStart, nextChargeAt, remainingUnits`
- `recordUsage(subscriptionId, units)`
- `refundInvoice(invoiceId)`
- `withdraw(token, amount)`

`SubscriptionAllowance` is ERC-7715-inspired and purpose-bound.

- `grantAllowance(permission) returns permissionId`
- `revokeAllowance(permissionId)`
- `validateAndConsume(permissionId, subscriptionId, amount, periodIndex)`

## Service Agent

- `GET /health`
- `GET /.well-known/agent.json`
- `POST /a2a/tasks`
- `POST /mcp`
- `GET /feed?owner=0x...&serviceId=0x...`
- `POST /x402/settle`

## Consumer Agent

- `POST /cycle`
- `GET /state`
- `POST /hitl/approve`

All chain-derived API responses include `chainId`. Payment attempts include `paymentIdentifier`; subscription invoices include `invoiceKey`.
