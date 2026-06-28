import type { Address } from "viem";

export const subChainAddress = (process.env.NEXT_PUBLIC_SUBCHAIN_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

export const subscriptionAllowanceAddress = (process.env.NEXT_PUBLIC_SUBSCRIPTION_ALLOWANCE_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

export const mockUsdcAddress = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

export const subChainAbi = [
  { type: "function", name: "planCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "subscriptionCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "invoiceCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function",
    name: "createPlan",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "price", type: "uint128" },
      { name: "period", type: "uint64" },
      { name: "includedUnits", type: "uint32" },
      { name: "gracePeriod", type: "uint32" },
      { name: "serviceId", type: "bytes32" },
      { name: "serviceMetadataHash", type: "bytes32" },
      { name: "metadataURI", type: "string" }
    ],
    outputs: [{ name: "planId", type: "uint256" }]
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
    name: "hasEntitlement",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "serviceId", type: "bytes32" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "entitlementOf",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "serviceId", type: "bytes32" }
    ],
    outputs: [
      {
        name: "entitlement",
        type: "tuple",
        components: [
          { name: "subscriptionId", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "currentPeriodStart", type: "uint64" },
          { name: "nextChargeAt", type: "uint64" },
          { name: "remainingUnits", type: "uint32" }
        ]
      }
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
