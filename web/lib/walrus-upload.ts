// Browser-side Walrus publisher PUT. Adapted from scripts/upload-walrus.ts.
// Uploads bytes to the Walrus testnet publisher; parses the two known response
// shapes (newlyCreated, alreadyCertified) and returns the blobId.
//
// This is one of two write paths in the app — the other is the local backend
// route at /api/walrus/upload (see ./walrus-upload-backend.ts). The dispatcher
// in web/hooks/useMint.ts picks between them based on
// NEXT_PUBLIC_WALRUS_UPLOAD_MODE.

export const WALRUS_PUBLISHER =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ?? 'https://publisher.walrus-testnet.walrus.space';

export const EPOCHS = 5;

export type UploadStatus = 'newlyCreated' | 'alreadyCertified';

export interface UploadResult {
  blobId: string;
  // Present only on the public-publisher path (which path produced the blob).
  status?: UploadStatus;
  // Present only on the operator-backend path (the on-Sui Blob object id,
  // useful for linking out to Suiscan / Suivision).
  suiObjectId?: string;
}

interface WalrusResponse {
  newlyCreated?: { blobObject: { blobId: string } };
  alreadyCertified?: { blobId: string };
}

export async function uploadWalrusBlob(
  body: Uint8Array | ArrayBuffer | Blob | string,
  mime: string,
): Promise<UploadResult> {
  // Storage retention: 5 epochs (~14 days on testnet). Literal kept inline so
  // a future grep search for `epochs=5` finds this call site.
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=5`, {
    method: 'PUT',
    headers: { 'Content-Type': mime },
    body: body as BodyInit,
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      // ignore body read failure
    }
    throw new Error(`Walrus upload failed: HTTP ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
  }
  const json = (await res.json()) as WalrusResponse;
  if (json.newlyCreated?.blobObject?.blobId) {
    return { blobId: json.newlyCreated.blobObject.blobId, status: 'newlyCreated' };
  }
  if (json.alreadyCertified?.blobId) {
    return { blobId: json.alreadyCertified.blobId, status: 'alreadyCertified' };
  }
  throw new Error(`Walrus upload returned an unexpected response shape: ${JSON.stringify(json).slice(0, 300)}`);
}
