export const subChainAbi = [
  {
    type: "event",
    name: "PlanCreated",
    inputs: [
      { indexed: true, name: "planId", type: "uint256" },
      { indexed: true, name: "merchant", type: "address" },
      { indexed: true, name: "token", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "interval", type: "uint256" },
      { indexed: false, name: "gracePeriod", type: "uint256" },
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
      { indexed: true, name: "subscriber", type: "address" },
      { indexed: false, name: "nextChargeAt", type: "uint256" }
    ]
  },
  {
    type: "event",
    name: "SubscriptionCanceled",
    inputs: [
      { indexed: true, name: "subscriptionId", type: "uint256" },
      { indexed: true, name: "subscriber", type: "address" },
      { indexed: false, name: "canceledAt", type: "uint256" }
    ]
  },
  {
    type: "event",
    name: "InvoicePaid",
    inputs: [
      { indexed: true, name: "invoiceId", type: "uint256" },
      { indexed: true, name: "subscriptionId", type: "uint256" },
      { indexed: true, name: "planId", type: "uint256" },
      { indexed: false, name: "subscriber", type: "address" },
      { indexed: false, name: "merchant", type: "address" },
      { indexed: false, name: "token", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "paidAt", type: "uint256" },
      { indexed: false, name: "nextChargeAt", type: "uint256" }
    ]
  },
  {
    type: "event",
    name: "InvoiceRefunded",
    inputs: [
      { indexed: true, name: "invoiceId", type: "uint256" },
      { indexed: true, name: "subscriber", type: "address" },
      { indexed: false, name: "amount", type: "uint256" }
    ]
  }
] as const;

