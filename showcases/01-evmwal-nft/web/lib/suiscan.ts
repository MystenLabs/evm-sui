// Suiscan explorer URL helpers — used to link out to the on-Sui Blob object
// returned by the operator-backend write path. Mirrors lib/walruscan.ts shape.
// URL pattern: https://suiscan.xyz/testnet/object/<objectId>

export const SUISCAN = 'https://suiscan.xyz';

export function suiscanObjectUrl(
  objectId: string,
  network: 'testnet' | 'mainnet' = 'testnet',
): string {
  return `${SUISCAN}/${network}/object/${objectId}`;
}
