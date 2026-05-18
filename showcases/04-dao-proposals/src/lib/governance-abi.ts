// Hand-picked subset of the Governance.sol ABI — only the surface these
// CLIs touch. Keep in sync with showcases/contracts/src/Governance.sol.

export const GOVERNANCE_ABI = [
  {
    type: "function",
    name: "propose",
    stateMutability: "nonpayable",
    inputs: [
      { name: "blobId", type: "bytes32" },
      { name: "deadline", type: "uint64" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "vote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "support", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "proposals",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "proposer", type: "address" },
      { name: "blobId", type: "bytes32" },
      { name: "deadline", type: "uint64" },
      { name: "yes", type: "uint128" },
      { name: "no", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "tally",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "yes", type: "uint128" },
      { name: "no", type: "uint128" },
      { name: "passed", type: "bool" },
      { name: "closed", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "lastProposalId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Proposed",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "proposer", type: "address", indexed: true },
      { name: "blobId", type: "bytes32", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
    ],
  },
] as const;
