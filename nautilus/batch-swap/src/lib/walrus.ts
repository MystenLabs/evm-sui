/**
 * Walrus aggregator fetch helper — retrieves a proof blob by its base64url id.
 */

const WALRUS_AGGREGATOR =
  process.env.WALRUS_AGGREGATOR ?? "https://aggregator.walrus-testnet.walrus.space";

export async function fetchBlob(blobId: string): Promise<Buffer> {
  const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) {
    throw new Error(`Walrus GET failed: HTTP ${res.status} (blobId=${blobId})`);
  }
  return Buffer.from(await res.arrayBuffer());
}
