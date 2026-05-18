// Behavioral tests for handleWalrusUpload — exercises the dependency-injected
// handler with a stubbed WalrusServer so a real bug (wrong comparator, missing
// param, dropped suiObjectId) actually fails.
//
// Run with (the react-server condition is what lets the `server-only` import
// resolve to its empty stub instead of throwing):
//   pnpm exec tsx --conditions=react-server --test tests/walrus-backend-upload.behavior.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EmptyUploadError,
  MAX_UPLOAD_BYTES,
  STORAGE_EPOCHS,
  UploadTooLargeError,
  handleWalrusUpload,
} from '../web/app/api/walrus/upload/handler.ts';
import type { WalrusServer } from '../web/lib/walrus-server-env.ts';

type WriteBlobCall = {
  blob: Uint8Array;
  epochs: number;
  deletable: boolean;
  signer: unknown;
};

function makeFakeServer(returnValue: { blobId: string; blobObject: { id: string } }) {
  const calls: WriteBlobCall[] = [];
  const fake = {
    keypair: { __tag: 'fake-keypair' },
    walrusClient: {
      walrus: {
        writeBlob: async (args: WriteBlobCall) => {
          calls.push(args);
          return returnValue;
        },
      },
    },
  } as unknown as WalrusServer;
  return { server: fake, calls };
}

test('handleWalrusUpload: happy path passes bytes through and returns blobId + suiObjectId', async () => {
  const { server, calls } = makeFakeServer({
    blobId: 'TEST_BLOB_ID',
    blobObject: { id: '0xabc123' },
  });
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);

  const result = await handleWalrusUpload(bytes, server);

  assert.equal(result.blobId, 'TEST_BLOB_ID');
  assert.equal(result.suiObjectId, '0xabc123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].blob, bytes);
  assert.equal(calls[0].epochs, STORAGE_EPOCHS);
  assert.equal(calls[0].deletable, false);
  assert.equal(calls[0].signer, server.keypair);
});

test('handleWalrusUpload: empty body throws EmptyUploadError without hitting the SDK', async () => {
  const { server, calls } = makeFakeServer({
    blobId: 'unused',
    blobObject: { id: 'unused' },
  });
  const bytes = new Uint8Array(0);

  await assert.rejects(() => handleWalrusUpload(bytes, server), (err: Error) => {
    assert.ok(err instanceof EmptyUploadError, `expected EmptyUploadError, got ${err.name}`);
    return true;
  });
  assert.equal(calls.length, 0, 'writeBlob must not be called for an empty body');
});

test('handleWalrusUpload: over-cap body throws UploadTooLargeError without hitting the SDK', async () => {
  const { server, calls } = makeFakeServer({
    blobId: 'unused',
    blobObject: { id: 'unused' },
  });
  const bytes = new Uint8Array(MAX_UPLOAD_BYTES + 1);

  await assert.rejects(() => handleWalrusUpload(bytes, server), (err: Error) => {
    assert.ok(err instanceof UploadTooLargeError, `expected UploadTooLargeError, got ${err.name}`);
    const e = err as UploadTooLargeError;
    assert.equal(e.limit, MAX_UPLOAD_BYTES);
    assert.equal(e.actual, MAX_UPLOAD_BYTES + 1);
    assert.equal(e.status, 413);
    return true;
  });
  assert.equal(calls.length, 0, 'writeBlob must not be called when the body exceeds the cap');
});
