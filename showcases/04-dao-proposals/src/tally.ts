/**
 * `tally` — read a proposal's state + vote tallies from the OpenZeppelin
 * `Governor` contract and fetch the proposal body from the Walrus aggregator.
 * Pure read-side; no signer needed.
 *
 * Required env:
 *   - EVM_RPC_URL         JSON-RPC for the chain holding Governance
 *   - EVM_CHAIN_ID        EVM chain id (default: 31337 — anvil)
 *   - GOVERNANCE_ADDRESS  Deployed Governance address
 *   - WALRUS_AGGREGATOR   default: https://aggregator.walrus-testnet.walrus.space
 *
 * Usage:
 *   tsx src/tally.ts <proposal-id>
 */

import { createPublicClient, http, type Address } from "viem";

import { env, resolveChain } from "./lib/evm.js";
import { GOVERNANCE_ABI } from "./lib/governance-abi.js";
import { fetchBlob, hexToBase64Url } from "./lib/walrus.js";

// IGovernor.ProposalState
const STATE_NAMES = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
] as const;

async function main() {
  const [idStr] = process.argv.slice(2);
  if (!idStr) throw new Error("usage: tsx src/tally.ts <proposal-id>");
  const id = BigInt(idStr);

  const governance = env("GOVERNANCE_ADDRESS") as Address;
  const rpcUrl = env("EVM_RPC_URL");
  const chain = resolveChain(Number(env("EVM_CHAIN_ID", "31337")), rpcUrl);
  const aggregator = env("WALRUS_AGGREGATOR", "https://aggregator.walrus-testnet.walrus.space");

  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  // Governor returns snapshot 0 for an unknown proposal id.
  const snapshot = await client.readContract({
    address: governance,
    abi: GOVERNANCE_ABI,
    functionName: "proposalSnapshot",
    args: [id],
  });
  if (snapshot === 0n) {
    throw new Error(`proposal ${id} not found at ${governance}`);
  }

  const [blobIdHex, proposer, deadline, state, votes] = await Promise.all([
    client.readContract({ address: governance, abi: GOVERNANCE_ABI, functionName: "proposalBlob", args: [id] }),
    client.readContract({ address: governance, abi: GOVERNANCE_ABI, functionName: "proposalProposer", args: [id] }),
    client.readContract({ address: governance, abi: GOVERNANCE_ABI, functionName: "proposalDeadline", args: [id] }),
    client.readContract({ address: governance, abi: GOVERNANCE_ABI, functionName: "state", args: [id] }),
    client.readContract({ address: governance, abi: GOVERNANCE_ABI, functionName: "proposalVotes", args: [id] }),
  ]);

  const [against, forVotes, abstain] = votes;
  const blobIdB64Url = hexToBase64Url(blobIdHex);
  const body = await fetchBlob(aggregator, blobIdB64Url);

  console.log(`proposal #${id}`);
  console.log(`  proposer:   ${proposer}`);
  console.log(`  state:      ${STATE_NAMES[state] ?? state}`);
  console.log(`  voting:     blocks ${snapshot} → ${deadline}`);
  console.log(`  blobId:     ${blobIdHex}`);
  console.log(`  aggregator: ${aggregator}/v1/blobs/${blobIdB64Url}`);
  console.log(`  for:        ${forVotes}`);
  console.log(`  against:    ${against}`);
  console.log(`  abstain:    ${abstain}`);
  console.log(`---- body (${body.length} bytes) ----`);
  process.stdout.write(body.toString("utf8"));
  if (body[body.length - 1] !== 0x0a) process.stdout.write("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
