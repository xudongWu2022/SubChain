import type { Address } from "viem";

export const subChainAbi = [
  {
    type: "function",
    name: "subscribe",
    stateMutability: "nonpayable",
    inputs: [{ name: "planId", type: "uint256" }],
    outputs: [{ name: "subscriptionId", type: "uint256" }]
  },
  {
    type: "function",
    name: "cancelSubscription",
    stateMutability: "nonpayable",
    inputs: [{ name: "subscriptionId", type: "uint256" }],
    outputs: []
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
  }
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

export const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;
