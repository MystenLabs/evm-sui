// Hand-picked subset of the Governance.sol ABI — only the surface these
// CLIs touch. Governance.sol inherits OpenZeppelin `Governor`, so most of this
// (castVote, state, proposalVotes, proposal*) is the stock Governor interface;
// `proposeWithBlob` / `proposalBlob` / `ProposalBlob` are the Walrus add-ons.
// Keep in sync with showcases/contracts/src/Governance.sol.

export const GOVERNANCE_ABI = [
  {
    type: "function",
    name: "proposeWithBlob",
    stateMutability: "nonpayable",
    inputs: [{ name: "blobId", type: "bytes32" }],
    outputs: [{ name: "proposalId", type: "uint256" }],
  },
  {
    type: "function",
    name: "castVote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proposalId", type: "uint256" },
      { name: "support", type: "uint8" }, // 0 = Against, 1 = For, 2 = Abstain
    ],
    outputs: [{ name: "weight", type: "uint256" }],
  },
  {
    type: "function",
    name: "state",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }],
    // 0 Pending · 1 Active · 2 Canceled · 3 Defeated · 4 Succeeded · 5 Queued · 6 Expired · 7 Executed
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "proposalVotes",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [
      { name: "againstVotes", type: "uint256" },
      { name: "forVotes", type: "uint256" },
      { name: "abstainVotes", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "proposalBlob",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{ name: "blobId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "proposalProposer",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "proposalSnapshot",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "proposalDeadline",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "ProposalBlob",
    inputs: [
      { name: "proposalId", type: "uint256", indexed: true },
      { name: "blobId", type: "bytes32", indexed: false },
    ],
  },
] as const;
