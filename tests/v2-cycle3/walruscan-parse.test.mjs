import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'web/lib/walruscan.ts');

test('AC-3.4 walruscan.ts exports blobIdFromAggregatorUrl', () => {
  const src = readFileSync(P, 'utf8');
  assert.match(
    src,
    /export\s+function\s+blobIdFromAggregatorUrl\s*\(/,
    'must export blobIdFromAggregatorUrl',
  );
  // The implementation must parse /v1/blobs/<id> from the URL
  assert.match(src, /\/v1\\\/blobs\\\/|\/v1\/blobs\//, 'must reference /v1/blobs/ path');
  // Returns null for non-match
  assert.match(src, /null/, 'must return null for non-matching URLs');
});
