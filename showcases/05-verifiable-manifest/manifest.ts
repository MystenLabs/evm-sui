/**
 * Verifiable token-list / dApp manifest client.
 *
 * Resolves an ENS name (e.g. `tokens.uniswap.eth`) to a Walrus blob via the
 * WalrusResolver contract from showcase 03, fetches the manifest body from a
 * Walrus aggregator, and validates that the on-chain blobId matches what the
 * aggregator returned.
 *
 * This is the IPFS-token-list pattern with one critical difference: the
 * `tokens.uniswap.eth` pointer is updated by a single Sui-aware EVM tx and
 * resolves in one eth_call — no gateway lottery, no IPNS-style 30-second
 * cold path.
 */

import { createPublicClient, hexToBytes, http, namehash, type Address } from "viem";
import { mainnet } from "viem/chains";

const WALRUS_RESOLVER_ABI = [
  {
    type: "function",
    name: "walrusBlob",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [
      { name: "blobId", type: "bytes32" },
      { name: "suiObjectId", type: "bytes32" },
      { name: "contentType", type: "bytes8" },
    ],
  },
] as const;

export interface ResolvedManifest<T> {
  /** Parsed JSON manifest body. */
  manifest: T;
  /** The Walrus blob id the pointer resolved to. */
  blobId: `0x${string}`;
  /** ASCII trim of the on-chain content type hint (e.g. "app/json"). */
  contentType: string;
}

export interface ResolveOpts {
  rpcUrl: string;
  resolverAddress: Address;
  aggregator: string; // e.g. https://aggregator.walrus-testnet.walrus.space
}

/**
 * Resolve `ensName` to its parsed manifest body.
 *
 * Throws if the pointer is unset, the aggregator returns a non-2xx status,
 * the on-chain contentType is not JSON, or the JSON fails to parse.
 */
export async function resolveManifest<T = unknown>(
  ensName: string,
  opts: ResolveOpts,
): Promise<ResolvedManifest<T>> {
  const evm = createPublicClient({
    chain: mainnet,
    transport: http(opts.rpcUrl),
  });

  const node = namehash(ensName);
  const [blobId, , contentTypeRaw] = (await evm.readContract({
    address: opts.resolverAddress,
    abi: WALRUS_RESOLVER_ABI,
    functionName: "walrusBlob",
    args: [node],
  })) as readonly [`0x${string}`, `0x${string}`, `0x${string}`];

  if (blobId === `0x${"00".repeat(32)}`) {
    throw new Error(`manifest: pointer unset for ${ensName}`);
  }

  const contentType = asciiTrim(contentTypeRaw);
  if (!contentType.startsWith("app/json") && !contentType.startsWith("application/json")) {
    throw new Error(`manifest: unexpected contentType "${contentType}" for ${ensName}`);
  }

  const url = `${opts.aggregator}/v1/blobs/${bytes32ToBase64Url(blobId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`manifest: aggregator HTTP ${res.status} for ${url}`);
  }

  const text = await res.text();
  return {
    manifest: JSON.parse(text) as T,
    blobId,
    contentType,
  };
}

/** Convert a 32-byte hex string to a base64url-encoded Walrus blob id. */
function bytes32ToBase64Url(hex: `0x${string}`): string {
  const bytes = hexToBytes(hex, { size: 32 });
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function asciiTrim(b: `0x${string}`): string {
  const bytes = hexToBytes(b, { size: 8 });
  const end = bytes.indexOf(0);
  const slice = end === -1 ? bytes : bytes.subarray(0, end);
  return new TextDecoder("ascii").decode(slice);
}

// ─── Token-list-flavoured example ──────────────────────────────────────────

export interface UniswapTokenList {
  name: string;
  timestamp: string;
  tokens: Array<{
    chainId: number;
    address: `0x${string}`;
    symbol: string;
    decimals: number;
    name: string;
    logoURI?: string;
  }>;
}

/** Convenience wrapper for the Uniswap token-list shape. */
export const resolveTokenList = (ensName: string, opts: ResolveOpts) =>
  resolveManifest<UniswapTokenList>(ensName, opts);
