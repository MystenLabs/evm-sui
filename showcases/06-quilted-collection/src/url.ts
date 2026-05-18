/**
 * TS port of QuiltedCollection.tokenURI — lets external clients (indexers,
 * marketplaces, gallery frontends) resolve a token's metadata URL without an
 * EVM RPC call. The shape is fully determined by (aggregator, quiltId, tokenId).
 *
 * Usage as a library:
 *   import { tokenURI } from "./url";
 *   tokenURI({ aggregator, quiltId, tokenId: 42n })
 *
 * Usage as a CLI:
 *   tsx src/url.ts <tokenId>
 *   (reads AGGREGATOR and QUILT_ID from env)
 */

export interface TokenURIArgs {
  aggregator: string;
  quiltId: string;
  tokenId: bigint | number;
}

export function tokenURI({ aggregator, quiltId, tokenId }: TokenURIArgs): string {
  if (!aggregator) throw new Error("tokenURI: aggregator must be non-empty");
  if (!quiltId) throw new Error("tokenURI: quiltId must be non-empty");
  const id = typeof tokenId === "bigint" ? tokenId : BigInt(tokenId);
  if (id < 1n) throw new Error(`tokenURI: tokenId must be >= 1 (got ${id})`);
  return `${aggregator}/v1/blobs/by-quilt-id/${quiltId}/${id}.json`;
}

function isMain(): boolean {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isMain()) {
  const [idStr] = process.argv.slice(2);
  if (!idStr) {
    process.stderr.write("usage: tsx src/url.ts <tokenId>\n");
    process.exit(1);
  }
  const aggregator = process.env["AGGREGATOR"];
  const quiltId = process.env["QUILT_ID"];
  if (!aggregator || !quiltId) {
    process.stderr.write("missing env: AGGREGATOR and QUILT_ID are required\n");
    process.exit(1);
  }
  process.stdout.write(`${tokenURI({ aggregator, quiltId, tokenId: BigInt(idStr) })}\n`);
}
