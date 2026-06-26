import type { Address } from "viem";

export const subChainAddress = (process.env.NEXT_PUBLIC_SUBCHAIN_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

export const mockUsdcAddress = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

export const subChainAbi = [
  {
    type: "function",
    name: "planCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "subscriptionCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "invoiceCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "plans",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "merchant", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "interval", type: "uint256" },
      { name: "gracePeriod", type: "uint256" },
      { name: "metadataURI", type: "string" },
      { name: "active", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "subscriptions",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "planId", type: "uint256" },
      { name: "subscriber", type: "address" },
      { name: "startedAt", type: "uint256" },
      { name: "currentPeriodStart", type: "uint256" },
      { name: "nextChargeAt", type: "uint256" },
      { name: "canceled", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "invoices",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "subscriptionId", type: "uint256" },
      { name: "planId", type: "uint256" },
      { name: "subscriber", type: "address" },
      { name: "merchant", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "dueAt", type: "uint256" },
      { name: "paidAt", type: "uint256" },
      { name: "status", type: "uint8" }
    ]
  },
  {
    type: "function",
    name: "merchantBalances",
    stateMutability: "view",
    inputs: [
      { name: "merchant", type: "address" },
      { name: "token", type: "address" }
    ],
    outputs: [{ name: "amount", type: "uint256" }]
  },
  {
    type: "function",
    name: "createPlan",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "interval", type: "uint256" },
      { name: "gracePeriod", type: "uint256" },
      { name: "metadataURI", type: "string" }
    ],
    outputs: [{ name: "planId", type: "uint256" }]
  },
  {
    type: "function",
    name: "setPlanActive",
    stateMutability: "nonpayable",
    inputs: [
      { name: "planId", type: "uint256" },
      { name: "active", type: "bool" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "subscribe",
    stateMutability: "nonpayable",
    inputs: [{ name: "planId", type: "uint256" }],
    outputs: [{ name: "subscriptionId", type: "uint256" }]
  },
  {
    type: "function",
    name: "chargeSubscription",
    stateMutability: "nonpayable",
    inputs: [{ name: "subscriptionId", type: "uint256" }],
    outputs: [{ name: "invoiceId", type: "uint256" }]
  },
  {
    type: "function",
    name: "cancelSubscription",
    stateMutability: "nonpayable",
    inputs: [{ name: "subscriptionId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "refundInvoice",
    stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
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
  }
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
  }
] as const;
