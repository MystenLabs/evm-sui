// Browser-side dispatcher for the operator-backend write path.
//
// POSTs raw bytes to /api/walrus/upload, which signs the Sui transactions
// with SUI_PRIVATE_KEY and pays WAL on the operator's behalf. The route is
// local-only and unauthenticated — see web/app/api/walrus/upload/route.ts.
//
// Returns the same UploadResult shape as the public-publisher path, plus
// the on-Sui Blob object id so the UI can link out to Suiscan.

import type { UploadResult } from './walrus-upload';

interface BackendResponse {
  blobId?: string;
  suiObjectId?: string;
  error?: string;
}

export async function uploadWalrusBlobViaBackend(
  body: Uint8Array | ArrayBuffer | Blob | string,
  mime: string,
): Promise<UploadResult> {
  const res = await fetch('/api/walrus/upload', {
    method: 'POST',
    headers: { 'Content-Type': mime },
    body: body as BodyInit,
  });
  let json: BackendResponse | null = null;
  try {
    json = (await res.json()) as BackendResponse;
  } catch {
    // ignore parse failure; handled by !res.ok branch below
  }
  if (!res.ok) {
    const detail = json?.error ?? '';
    throw new Error(
      `Walrus backend upload failed: HTTP ${res.status} ${res.statusText}${
        detail ? ` — ${detail.slice(0, 200)}` : ''
      }`,
    );
  }
  if (!json?.blobId) {
    throw new Error(
      `Walrus backend returned an unexpected response: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return { blobId: json.blobId, suiObjectId: json.suiObjectId };
}
