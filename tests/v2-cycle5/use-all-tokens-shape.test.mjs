import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'web/hooks/useAllTokens.ts');

test('AC-5.1 useAllTokens exports the hook', () => {
  assert.ok(existsSync(P), `${P} must exist`);
  const src = readFileSync(P, 'utf8');
  assert.match(src, /export\s+function\s+useAllTokens\s*\(|export\s+const\s+useAllTokens\s*=/, 'must export useAllTokens');
  for (const k of ['tokens', 'isLoading', 'error']) {
    assert.match(src, new RegExp(`\\b${k}\\b`), `must reference return field: ${k}`);
  }
  for (const f of ['tokenId', 'tokenURI', 'owner', 'metadata']) {
    assert.match(src, new RegExp(`\\b${f}\\b`), `must reference per-token field: ${f}`);
  }
  // Carry blobIds explicitly
  assert.match(src, /blobIdImage|blobId_image/i, 'must carry blobId for the image');
  assert.match(src, /blobIdMetadata|blobId_metadata/i, 'must carry blobId for the metadata');
});

test('AC-5.2 hook uses wagmi reads + react-query', () => {
  const src = readFileSync(P, 'utf8');
  assert.match(src, /useReadContract/, 'must use useReadContract');
  assert.match(src, /useReadContracts/, 'must use useReadContracts');
  assert.match(src, /useQuer(y|ies)/, 'must use useQuery or useQueries for metadata fetch');
});
