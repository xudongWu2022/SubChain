import type { Address } from "viem";

export const subChainAbi = [
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
  },
  {
    type: "function",
    name: "recordUsage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "subscriptionId", type: "uint256" },
      { name: "units", type: "uint32" }
    ],
    outputs: []
  }
] as const;

export const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;
