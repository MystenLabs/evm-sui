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

import {
  createPublicClient,
  defineChain,
  http,
  type Address,
  type Chain,
} from "viem";
import * as viemChains from "viem/chains";

import { GOVERNANCE_ABI } from "./lib/governance-abi.js";
import { fetchBlob, hexToBase64Url } from "./lib/walrus.js";

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`missing env: ${key}`);
  return v;
}

function resolveChain(chainId: number, rpcUrl: string): Chain {
  for (const c of Object.values(viemChains)) {
    if (typeof c === "object" && c && "id" in c && (c as Chain).id === chainId) {
      return c as Chain;
    }
  }
  return defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

async function main() {
  const [idStr] = process.argv.slice(2);
  if (!idStr) throw new Error("usage: tsx src/tally.ts <proposal-id>");
  const id = BigInt(idStr);

  const governance = env("GOVERNANCE_ADDRESS") as Address;
  const rpcUrl = env("EVM_RPC_URL");
  const chain = resolveChain(Number(env("EVM_CHAIN_ID", "31337")), rpcUrl);
  const aggregator = env("WALRUS_AGGREGATOR", "https://aggregator.walrus-testnet.walrus.space");

  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  const [proposer, blobIdHex, deadline, yes, no] = await client.readContract({
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

  // Silence unused-import lint warnings — `yes`/`no` come from `proposals()`
  // and `tally()` returns the canonical values used above.
  void yes;
  void no;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
