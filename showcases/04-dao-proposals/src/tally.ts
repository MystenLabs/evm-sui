/**
 * `tally` — read a proposal's tally from the EVM contract and fetch the
 * proposal body from the Walrus aggregator. Pure read-side; no signer needed.
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

async function main() {
  const [idStr] = process.argv.slice(2);
  if (!idStr) throw new Error("usage: tsx src/tally.ts <proposal-id>");
  const id = BigInt(idStr);

  const governance = env("GOVERNANCE_ADDRESS") as Address;
  const rpcUrl = env("EVM_RPC_URL");
  const chain = resolveChain(Number(env("EVM_CHAIN_ID", "31337")), rpcUrl);
  const aggregator = env("WALRUS_AGGREGATOR", "https://aggregator.walrus-testnet.walrus.space");

  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  // `proposals()` returns (proposer, blobId, deadline, yes, no) — the
  // canonical yes/no come from `tally()` below, so we skip them here.
  const [proposer, blobIdHex, deadline] = await client.readContract({
    address: governance,
    abi: GOVERNANCE_ABI,
    functionName: "proposals",
    args: [id],
  });

  if (deadline === 0n) {
    throw new Error(`proposal ${id} not found at ${governance}`);
  }

  const tally = await client.readContract({
    address: governance,
    abi: GOVERNANCE_ABI,
    functionName: "tally",
    args: [id],
  });

  const blobIdB64Url = hexToBase64Url(blobIdHex);
  const body = await fetchBlob(aggregator, blobIdB64Url);

  const deadlineDate = new Date(Number(deadline) * 1000).toISOString();
  console.log(`proposal #${id}`);
  console.log(`  proposer:  ${proposer}`);
  console.log(`  deadline:  ${deadline}  (${deadlineDate})`);
  console.log(`  blobId:    ${blobIdHex}`);
  console.log(`  aggregator: ${aggregator}/v1/blobs/${blobIdB64Url}`);
  console.log(`  yes:       ${tally[0]}`);
  console.log(`  no:        ${tally[1]}`);
  console.log(`  closed:    ${tally[3]}`);
  console.log(`  passed:    ${tally[2]}`);
  console.log(`---- body (${body.length} bytes) ----`);
  process.stdout.write(body.toString("utf8"));
  if (body[body.length - 1] !== 0x0a) process.stdout.write("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
