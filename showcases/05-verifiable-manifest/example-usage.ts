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
 *   AGGREGATOR           e.g. https://aggregator.walrus-testnet.walrus.space
 */
import { resolveTokenList } from "./manifest.ts";

const ensName = process.env.ENS_NAME ?? "tokens.uniswap.eth";

const { manifest, blobId, contentType } = await resolveTokenList(ensName, {
  rpcUrl: process.env.EVM_RPC_URL!,
  resolverAddress: process.env.RESOLVER_ADDRESS! as `0x${string}`,
  aggregator: process.env.AGGREGATOR ?? "https://aggregator.walrus-testnet.walrus.space",
});

console.log(`Resolved ${ensName} → blobId=${blobId} (${contentType})`);
console.log(`Token list "${manifest.name}" contains ${manifest.tokens.length} tokens.`);
for (const t of manifest.tokens.slice(0, 5)) {
  console.log(`  - ${t.symbol.padEnd(8)} ${t.address}`);
}
