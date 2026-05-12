import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'web/lib/walrus-upload.ts');

test('AC-3.1 walrus-upload.ts exists and exports the helper + constant', () => {
  assert.ok(existsSync(P), `${P} must exist`);
  const src = readFileSync(P, 'utf8');
  assert.match(src, /export\s+(?:async\s+)?function\s+uploadWalrusBlob\s*\(/, 'must export uploadWalrusBlob function');
  assert.match(src, /export\s+const\s+WALRUS_PUBLISHER\b/, 'must export WALRUS_PUBLISHER constant');
});

test('AC-3.2 uploadWalrusBlob targets /v1/blobs?epochs=5 via PUT', () => {
  const src = readFileSync(P, 'utf8');
  assert.match(src, /\/v1\/blobs/, 'must reference /v1/blobs endpoint');
  assert.match(src, /epochs=5/, 'must use epochs=5');
  assert.match(src, /method:\s*['"]PUT['"]/, 'must use PUT method');
});

test('AC-3.2 uploadWalrusBlob parses both response shapes', () => {
  const src = readFileSync(P, 'utf8');
  assert.match(src, /newlyCreated/, 'must reference newlyCreated shape');
  assert.match(src, /alreadyCertified/, 'must reference alreadyCertified shape');
});

test('AC-3.2 publisher URL is env-overridable', () => {
  const src = readFileSync(P, 'utf8');
  assert.match(
    src,
    /NEXT_PUBLIC_WALRUS_PUBLISHER_URL/,
    'must read NEXT_PUBLIC_WALRUS_PUBLISHER_URL for browser env override',
  );
});
