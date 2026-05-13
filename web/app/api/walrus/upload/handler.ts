import 'server-only';

import type { WalrusServer } from '@/lib/walrus-server-env';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const STORAGE_EPOCHS = 5;

export interface WalrusUploadResult {
  blobId: string;
  suiObjectId: string;
}

export class UploadTooLargeError extends Error {
  readonly status = 413;
  constructor(public readonly limit: number, public readonly actual: number) {
    super(`Upload size ${actual} exceeds limit of ${limit} bytes`);
    this.name = 'UploadTooLargeError';
  }
}

export class EmptyUploadError extends Error {
  readonly status = 400;
  constructor() {
    super('Upload body was empty');
    this.name = 'EmptyUploadError';
  }
}

// Pure handler — exposed for unit testing with an injected WalrusServer.
// route.ts builds the real server from env; tests pass a fake with
// `walrusClient.walrus.writeBlob` stubbed.
export async function handleWalrusUpload(
  bytes: Uint8Array,
  deps: WalrusServer,
): Promise<WalrusUploadResult> {
  if (bytes.length === 0) throw new EmptyUploadError();
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new UploadTooLargeError(MAX_UPLOAD_BYTES, bytes.length);
  }
  const { blobId, blobObject } = await deps.walrusClient.walrus.writeBlob({
    blob: bytes,
    deletable: false,
    epochs: STORAGE_EPOCHS,
    signer: deps.keypair,
  });
  return { blobId, suiObjectId: blobObject.id };
}
