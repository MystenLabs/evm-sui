// Walruscan explorer URL helpers + aggregator URL parser.
// URL pattern: https://walruscan.com/testnet/blob/<blobId>

export const WALRUSCAN = 'https://walruscan.com';

export function walruscanUrl(blobId: string): string {
  return `https://walruscan.com/testnet/blob/${blobId}`;
}

/**
 * Parses the trailing blob id from an aggregator URL. Returns null on garbage.
 * Matches /v1/blobs/<id> where id is the typical 43-char base64url segment.
 */
export function blobIdFromAggregatorUrl(url: string): string | null {
  const m = url.match(/\/v1\/blobs\/([A-Za-z0-9_-]+)\/?$/);
  return m ? m[1] : null;
}

export const blobIdFromTokenURI = blobIdFromAggregatorUrl;
