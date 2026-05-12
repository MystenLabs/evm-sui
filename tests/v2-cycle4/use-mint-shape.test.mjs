import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'web/hooks/useMint.ts');

test('AC-4.1 useMint exports the hook', () => {
  assert.ok(existsSync(P), `${P} must exist`);
  const src = readFileSync(P, 'utf8');
  assert.match(src, /export\s+function\s+useMint\s*\(|export\s+const\s+useMint\s*=/, 'must export useMint');
  // Return shape signals
  for (const k of ['status', 'error', 'txHash', 'submit']) {
    assert.match(src, new RegExp(`\\b${k}\\b`), `must reference return field: ${k}`);
  }
});

test('AC-4.2 uses cycle-3 helpers', () => {
  const src = readFileSync(P, 'utf8');
  assert.match(src, /uploadWalrusBlob/, 'must call uploadWalrusBlob');
  assert.match(src, /buildMetadata/, 'must call buildMetadata');
});

test('AC-4.3 uses wagmi write + wait hooks', () => {
  const src = readFileSync(P, 'utf8');
  assert.match(src, /useWriteContract/, 'must import/use useWriteContract');
  assert.match(src, /useWaitForTransactionReceipt/, 'must use useWaitForTransactionReceipt');
});

test('AC-4.4 invalidates react-query keys', () => {
  const src = readFileSync(P, 'utf8');
  assert.match(src, /invalidateQueries/, 'must call queryClient.invalidateQueries on success');
  for (const k of ['totalSupply', 'tokenURI', 'ownerOf', 'metadata']) {
    assert.match(src, new RegExp(`['"\`]${k}['"\`]`), `must invalidate key prefix: ${k}`);
  }
});

test('useMint state-machine states present', () => {
  const src = readFileSync(P, 'utf8');
  for (const s of ['idle', 'uploading-image', 'uploading-metadata', 'awaiting-signature', 'awaiting-confirmation', 'success', 'error']) {
    assert.match(src, new RegExp(`['"\`]${s}['"\`]`), `must reference status state: ${s}`);
  }
});
