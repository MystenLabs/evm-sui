export const WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';

export function aggregatorUrl(blobId: string): string {
  return `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;
}
