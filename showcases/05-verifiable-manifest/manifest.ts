/**
 * Token-list / dApp manifest client.
 *
 * Resolves an ENS name (e.g. `tokens.uniswap.eth`) to a Walrus blob via the
 * WalrusResolver contract from showcase 03, then reads the manifest body
 * directly from the Walrus storage network with the `@mysten/walrus` SDK.
 *
 * Trust model: retrieval does NOT route through a single aggregator. The SDK
 * pulls the blob's slivers from the Walrus storage nodes and reconstructs the
 * bytes, checking them against the on-chain blob id — which is itself a
 * content commitment over the encoded data. So both halves are trust-minimised:
 * the *pointer* is one deterministic `eth_call` (no IPNS lottery), and the
 * *bytes* are content-addressed and verified on read (no gateway to trust).
 *
 * The trade-off versus a plain aggregator GET: an SDK read fans out to the
 * storage nodes (~hundreds of requests) and needs a Sui fullnode, so it is
 * heavier than one HTTP call. For a token list / manifest — small, high-value,
 * read-rarely — paying that cost to remove the gateway from the trust path is
 * the whole point of a "verifiable" manifest.
 */

import { createPublicClient, hexToBytes, http, namehash, type Address } from "viem";
import { mainnet } from "viem/chains";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { walrus } from "@mysten/walrus";

export type WalrusNetwork = "testnet" | "mainnet";

/** Public Sui gRPC fullnodes the Walrus SDK reads through, keyed by network. */
const DEFAULT_SUI_RPC: Record<WalrusNetwork, string> = {
  testnet: "https://fullnode.testnet.sui.io:443",
  mainnet: "https://fullnode.mainnet.sui.io:443",
};

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
  /** EVM JSON-RPC, used for the resolver `eth_call` (ENS + WalrusResolver live here). */
  rpcUrl: string;
  /** Deployed WalrusResolver address. */
  resolverAddress: Address;
  /** Walrus network the pointer's blob lives on. Default: `"testnet"`. */
  network?: WalrusNetwork;
  /** Sui gRPC fullnode the Walrus SDK reads through. Default: the public node for `network`. */
  suiRpcUrl?: string;
}

/**
 * Resolve `ensName` to its parsed manifest body.
 *
 * Throws if the pointer is unset, the on-chain contentType is not JSON, the
 * blob cannot be read from Walrus, or the JSON fails to parse.
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
  // The on-chain field is bytes8 — only the 8-char shortcode form fits.
  // Long MIMEs like "application/json" are intentionally out of grammar here.
  if (!contentType.startsWith("app/json")) {
    throw new Error(`manifest: unexpected contentType "${contentType}" for ${ensName}`);
  }

  const network = opts.network ?? "testnet";
  const sui = new SuiGrpcClient({
    network,
    baseUrl: opts.suiRpcUrl ?? DEFAULT_SUI_RPC[network],
  }).$extend(walrus());

  // Read the blob straight from the Walrus storage nodes. The SDK reconstructs
  // the bytes from the slivers and checks them against the blobId (a content
  // commitment), so the result is verified — not taken on faith from a gateway.
  const bytes = await sui.walrus.readBlob({ blobId: bytes32ToBase64Url(blobId) });
  const text = new TextDecoder().decode(bytes);

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
