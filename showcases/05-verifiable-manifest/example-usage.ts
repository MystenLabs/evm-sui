/**
 * Example: read a Uniswap-style token list from Walrus via an ENS-named
 * pointer. Run with:
 *
 *   pnpm tsx example-usage.ts
 *
 * Required env:
 *   EVM_RPC_URL          mainnet RPC (Infura, Alchemy, Llama, ...)
 *   RESOLVER_ADDRESS     deployed WalrusResolver address
 *   ENS_NAME             e.g. tokens.uniswap.eth
 *   WALRUS_NETWORK       'testnet' | 'mainnet' (default: 'testnet')
 *   SUI_RPC_URL          Sui fullnode the Walrus SDK reads through
 *                        (default: the public node for WALRUS_NETWORK)
 */
import { resolveTokenList } from "./manifest.ts";

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing env: ${key}`);
  return v;
}

const ensName = process.env.ENS_NAME ?? "tokens.uniswap.eth";
const network = (process.env.WALRUS_NETWORK as "testnet" | "mainnet") ?? "testnet";

const { manifest, blobId, contentType } = await resolveTokenList(ensName, {
  rpcUrl: requireEnv("EVM_RPC_URL"),
  resolverAddress: requireEnv("RESOLVER_ADDRESS") as `0x${string}`,
  network,
  suiRpcUrl: process.env.SUI_RPC_URL,
});

console.log(`Resolved ${ensName} → blobId=${blobId} (${contentType})`);
console.log(`Token list "${manifest.name}" contains ${manifest.tokens.length} tokens.`);
for (const t of manifest.tokens.slice(0, 5)) {
  console.log(`  - ${t.symbol.padEnd(8)} ${t.address}`);
}
