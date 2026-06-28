export const subChainAbi = [
  {
    type: "event",
    name: "PlanCreated",
    inputs: [
      { indexed: true, name: "planId", type: "uint256" },
      { indexed: true, name: "merchant", type: "address" },
      { indexed: true, name: "token", type: "address" },
      { indexed: false, name: "price", type: "uint128" },
      { indexed: false, name: "period", type: "uint64" },
      { indexed: false, name: "includedUnits", type: "uint32" },
      { indexed: false, name: "gracePeriod", type: "uint32" },
      { indexed: false, name: "version", type: "uint32" },
      { indexed: false, name: "serviceId", type: "bytes32" },
      { indexed: false, name: "serviceMetadataHash", type: "bytes32" },
      { indexed: false, name: "metadataURI", type: "string" }
    ]
  },
  {
    type: "event",
    name: "PlanStatusChanged",
    inputs: [
      { indexed: true, name: "planId", type: "uint256" },
      { indexed: false, name: "active", type: "bool" }
    ]
  },
  {
    type: "event",
    name: "SubscriptionCreated",
    inputs: [
      { indexed: true, name: "subscriptionId", type: "uint256" },
      { indexed: true, name: "planId", type: "uint256" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "planVersion", type: "uint32" },
      { indexed: false, name: "nextChargeAt", type: "uint64" },
      { indexed: false, name: "serviceId", type: "bytes32" }
    ]
  },
  {
    type: "event",
    name: "SubscriptionStatusChanged",
    inputs: [
      { indexed: true, name: "subscriptionId", type: "uint256" },
      { indexed: false, name: "status", type: "uint8" },
      { indexed: false, name: "nextChargeAt", type: "uint64" },
      { indexed: false, name: "graceEndsAt", type: "uint64" }
    ]
  },
  {
    type: "event",
    name: "SubscriptionCanceled",
    inputs: [
      { indexed: true, name: "subscriptionId", type: "uint256" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "canceledAt", type: "uint256" }
    ]
  },
  {
    type: "event",
    name: "UsageRecorded",
    inputs: [
      { indexed: true, name: "subscriptionId", type: "uint256" },
      { indexed: true, name: "serviceId", type: "bytes32" },
      { indexed: false, name: "units", type: "uint32" },
      { indexed: false, name: "usedUnits", type: "uint32" }
    ]
  },
  {
    type: "event",
    name: "InvoiceReserved",
    inputs: [
      { indexed: true, name: "invoiceId", type: "uint256" },
      { indexed: true, name: "invoiceKey", type: "bytes32" },
      { indexed: true, name: "subscriptionId", type: "uint256" },
      { indexed: false, name: "periodIndex", type: "uint32" },
      { indexed: false, name: "dueAt", type: "uint64" }
    ]
  },
  {
    type: "event",
    name: "InvoicePaid",
    inputs: [
      { indexed: true, name: "invoiceId", type: "uint256" },
      { indexed: true, name: "invoiceKey", type: "bytes32" },
      { indexed: true, name: "subscriptionId", type: "uint256" },
      { indexed: false, name: "planId", type: "uint256" },
      { indexed: false, name: "subscriber", type: "address" },
      { indexed: false, name: "merchant", type: "address" },
      { indexed: false, name: "token", type: "address" },
      { indexed: false, name: "amount", type: "uint128" },
      { indexed: false, name: "paidAt", type: "uint64" },
      { indexed: false, name: "nextChargeAt", type: "uint64" }
    ]
  },
  {
    type: "event",
    name: "InvoiceFailed",
    inputs: [
      { indexed: true, name: "invoiceId", type: "uint256" },
      { indexed: true, name: "invoiceKey", type: "bytes32" },
      { indexed: true, name: "subscriptionId", type: "uint256" },
      { indexed: false, name: "reason", type: "string" },
      { indexed: false, name: "graceEndsAt", type: "uint64" }
    ]
  },
  {
    type: "event",
    name: "InvoiceRefunded",
    inputs: [
      { indexed: true, name: "invoiceId", type: "uint256" },
      { indexed: true, name: "subscriber", type: "address" },
      { indexed: false, name: "amount", type: "uint128" }
    ]
  }
] as const;
