/**
 * `propose` — upload a proposal body to Walrus, then call Governance.propose.
 *
 * Pattern: the proposer pays the WAL cost directly to the public publisher,
 * so the DAO contract is never on the WAL hook. The 32-byte blobId is what
 * the contract stores. Anyone reading the proposal does an anonymous
 * aggregator GET — no rate-limited gateway, no IPNS, no pinning vendor.
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
 *   tsx src/propose.ts <markdown-file> <deadline-iso-or-unix>
 *
 * Example:
 *   tsx src/propose.ts ./fixtures/sample-proposal.md 2026-06-01T00:00:00Z
 *   tsx src/propose.ts --dry-run ./fixtures/sample-proposal.md 1748736000
 */

import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import * as viemChains from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import { GOVERNANCE_ABI } from "./lib/governance-abi.js";
import { uploadToPublisher } from "./lib/walrus.js";

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

function parseDeadline(input: string): bigint {
  if (/^\d+$/.test(input)) return BigInt(input);
  const ms = Date.parse(input);
  if (Number.isNaN(ms)) {
    throw new Error(`deadline must be a unix-seconds integer or ISO-8601 string, got: ${input}`);
  }
  return BigInt(Math.floor(ms / 1000));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args[0] === "--dry-run";
  const positional = dryRun ? args.slice(1) : args;
  const [mdPath, deadlineRaw] = positional;
  if (!mdPath || !deadlineRaw) {
    throw new Error("usage: tsx src/propose.ts [--dry-run] <markdown-file> <deadline-iso-or-unix>");
  }

  const body = readFileSync(mdPath);
  if (body.length === 0) {
    throw new Error(`proposal body is empty: ${mdPath}`);
  }
  const deadline = parseDeadline(deadlineRaw);

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
    console.log("[dry-run] would call Governance.propose with:");
    console.log(`  contract: ${governance}`);
    console.log(`  blobId:   ${blobIdHex}`);
    console.log(`  deadline: ${deadline} (${new Date(Number(deadline) * 1000).toISOString()})`);
    return;
  }

  const account = privateKeyToAccount(env("PROPOSER_PRIVATE_KEY") as Hex);
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  const hash = await wallet.writeContract({
    address: governance,
    abi: GOVERNANCE_ABI,
    functionName: "propose",
    args: [blobIdHex, deadline],
  });
  console.log(`[evm] tx submitted: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[evm] tx mined in block ${receipt.blockNumber} (status=${receipt.status})`);

  const lastId = await publicClient.readContract({
    address: governance,
    abi: GOVERNANCE_ABI,
    functionName: "lastProposalId",
  });
  console.log(`[evm] lastProposalId: ${lastId}`);
  console.log(`[ok] proposal stored — re-fetch the body with:`);
  console.log(`     pnpm tally ${lastId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
