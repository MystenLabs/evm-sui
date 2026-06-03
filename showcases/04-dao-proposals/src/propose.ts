/**
 * `propose` — upload a proposal body to Walrus, then open a Governor proposal
 * pointing at it via Governance.proposeWithBlob.
 *
 * Pattern: the proposer pays the WAL cost directly to the public publisher,
 * so the DAO contract is never on the WAL hook. The 32-byte blobId is what
 * the contract stores (mirrored into `proposalBlob` for one-call lookup).
 * Anyone reading the proposal does an anonymous aggregator GET — no
 * rate-limited gateway, no IPNS, no pinning vendor.
 *
 * Timing is governed by the contract's OpenZeppelin `Governor` settings
 * (votingDelay / votingPeriod, in blocks), not a caller-supplied deadline:
 * the proposal's voting window is reported back after it's mined.
 *
 * Required env:
 *   - EVM_RPC_URL         JSON-RPC for the chain holding Governance
 *   - EVM_CHAIN_ID        EVM chain id (default: 31337 — anvil)
 *   - GOVERNANCE_ADDRESS  Deployed Governance address
 *   - PROPOSER_PRIVATE_KEY hex private key for the proposing wallet
 *   - WALRUS_PUBLISHER    default: https://publisher.walrus-testnet.walrus.space
 *   - WALRUS_EPOCHS       default: 5
 *
 * Usage:
 *   tsx src/propose.ts [--dry-run] <markdown-file>
 *
 * Example:
 *   tsx src/propose.ts ./fixtures/sample-proposal.md
 *   tsx src/propose.ts --dry-run ./fixtures/sample-proposal.md
 */

import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { env, resolveChain } from "./lib/evm.js";
import { GOVERNANCE_ABI } from "./lib/governance-abi.js";
import { uploadToPublisher } from "./lib/walrus.js";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args[0] === "--dry-run";
  const positional = dryRun ? args.slice(1) : args;
  const [mdPath] = positional;
  if (!mdPath) {
    throw new Error("usage: tsx src/propose.ts [--dry-run] <markdown-file>");
  }

  const body = readFileSync(mdPath);
  if (body.length === 0) {
    throw new Error(`proposal body is empty: ${mdPath}`);
  }

  const publisher = env("WALRUS_PUBLISHER", "https://publisher.walrus-testnet.walrus.space");
  const epochs = Number(env("WALRUS_EPOCHS", "5"));

  console.log(`[walrus] PUT ${publisher}/v1/blobs?epochs=${epochs}  (${body.length} bytes)`);
  const { blobIdB64Url, blobIdHex } = await uploadToPublisher(publisher, body, "text/markdown", epochs);
  console.log(`[walrus] blobId (base64url): ${blobIdB64Url}`);
  console.log(`[walrus] blobId (bytes32):  ${blobIdHex}`);
  console.log(`[walrus] aggregator URL:    ${env("WALRUS_AGGREGATOR", "https://aggregator.walrus-testnet.walrus.space")}/v1/blobs/${blobIdB64Url}`);

  const governance = env("GOVERNANCE_ADDRESS") as Address;
  const rpcUrl = env("EVM_RPC_URL");
  const chain = resolveChain(Number(env("EVM_CHAIN_ID", "31337")), rpcUrl);

  if (dryRun) {
    console.log("[dry-run] would call Governance.proposeWithBlob with:");
    console.log(`  contract: ${governance}`);
    console.log(`  blobId:   ${blobIdHex}`);
    return;
  }

  const account = privateKeyToAccount(env("PROPOSER_PRIVATE_KEY") as Hex);
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  const hash = await wallet.writeContract({
    address: governance,
    abi: GOVERNANCE_ABI,
    functionName: "proposeWithBlob",
    args: [blobIdHex],
  });
  console.log(`[evm] tx submitted: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[evm] tx mined in block ${receipt.blockNumber} (status=${receipt.status})`);

  // The OZ proposalId is a hash, not a sequential counter — recover it from the
  // ProposalBlob event this contract emits alongside Governor's ProposalCreated.
  const [event] = parseEventLogs({
    abi: GOVERNANCE_ABI,
    eventName: "ProposalBlob",
    logs: receipt.logs,
  });
  if (!event) {
    throw new Error("ProposalBlob event not found in receipt — did the proposal revert?");
  }
  const proposalId = event.args.proposalId;

  const [snapshot, deadline] = await Promise.all([
    publicClient.readContract({ address: governance, abi: GOVERNANCE_ABI, functionName: "proposalSnapshot", args: [proposalId] }),
    publicClient.readContract({ address: governance, abi: GOVERNANCE_ABI, functionName: "proposalDeadline", args: [proposalId] }),
  ]);

  console.log(`[evm] proposalId: ${proposalId}`);
  console.log(`[evm] voting window: blocks ${snapshot} → ${deadline} (votes open once block > ${snapshot})`);
  console.log(`[ok] proposal stored — cast a vote (1=For, 0=Against, 2=Abstain):`);
  console.log(`     pnpm vote ${proposalId} 1`);
  console.log(`     pnpm tally ${proposalId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
