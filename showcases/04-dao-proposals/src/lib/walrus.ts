// Walrus publisher PUT + aggregator GET — the minimal surface this showcase
// touches. Modelled on showcases/01-evmwal-nft/scripts/upload-walrus.ts but
// trimmed to a single helper per direction. The proposer pays the WAL cost
// directly to the public publisher; the DAO contract is not on the WAL hook.

interface PublisherResponse {
  newlyCreated?: { blobObject: { blobId: string } };
  alreadyCertified?: { blobId: string };
}

function extractBlobId(resp: PublisherResponse): string | null {
  return (
    resp.newlyCreated?.blobObject?.blobId ?? resp.alreadyCertified?.blobId ?? null
  );
}

/** Convert a 0x-prefixed bytes32 hex into the base64url form the aggregator URL uses. */
export function hexToBase64Url(hex: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`hexToBase64Url: expected 0x-prefixed 32-byte hex, got ${hex}`);
  }
  const bytes = Buffer.from(hex.slice(2), "hex");
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Convert a base64url blobId (as returned by the publisher) into 0x-prefixed bytes32. */
export function base64UrlToHex(b64url: string): `0x${string}` {
  const padded = b64url.padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), "=");
  const std = padded.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Buffer.from(std, "base64");
  if (bytes.length !== 32) {
    throw new Error(`base64UrlToHex: expected 32 bytes after decode, got ${bytes.length}`);
  }
  return `0x${bytes.toString("hex")}` as const;
}

/**
 * Upload `bytes` to the public Walrus publisher and return the blobId in
 * the two canonical forms — base64url for aggregator URLs, 0x-bytes32 for
 * EVM contract calls.
 */
export async function uploadToPublisher(
  publisherUrl: string,
  bytes: Uint8Array,
  mime: string,
  epochs: number,
): Promise<{ blobIdB64Url: string; blobIdHex: `0x${string}` }> {
  // Copy into a fresh ArrayBuffer-backed Uint8Array so the strict
  // `Uint8Array<ArrayBuffer>` shape that BodyInit expects in TS 5.7+ holds
  // regardless of whether `bytes` came in over a Buffer / SharedArrayBuffer.
  const payload = new Uint8Array(bytes.byteLength);
  payload.set(bytes);
  const res = await fetch(`${publisherUrl}/v1/blobs?epochs=${epochs}`, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: payload,
  });
  if (!res.ok) {
    throw new Error(`Publisher PUT failed: HTTP ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as PublisherResponse;
  const blobIdB64Url = extractBlobId(json);
  if (!blobIdB64Url) {
    throw new Error(
      `Publisher response missing blobId in both newlyCreated and alreadyCertified shapes. Got: ${JSON.stringify(json)}`,
    );
  }
  return { blobIdB64Url, blobIdHex: base64UrlToHex(blobIdB64Url) };
}

/** Fetch a blob's raw bytes from the aggregator by base64url id. */
export async function fetchBlob(aggregatorUrl: string, blobIdB64Url: string): Promise<Buffer> {
  const res = await fetch(`${aggregatorUrl}/v1/blobs/${blobIdB64Url}`);
  if (!res.ok) {
    throw new Error(
      `Aggregator GET failed: HTTP ${res.status} ${res.statusText} (blobId=${blobIdB64Url})`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}
