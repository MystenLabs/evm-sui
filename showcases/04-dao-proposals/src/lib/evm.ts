// Shared helpers used by both `propose` and `tally`: env-var lookup with
// optional fallback, and viem-chain resolution against the chain id.

import { defineChain, type Chain } from "viem";
import * as viemChains from "viem/chains";

export function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`missing env: ${key}`);
  return v;
}

export function resolveChain(chainId: number, rpcUrl: string): Chain {
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
