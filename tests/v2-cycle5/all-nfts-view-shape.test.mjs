import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'web/components/AllNFTsView.tsx');

test('AC-5.3 AllNFTsView exists and uses useAllTokens', () => {
  assert.ok(existsSync(P), `${P} must exist`);
  const src = readFileSync(P, 'utf8');
  assert.match(src, /export\s+function\s+AllNFTsView|export\s+const\s+AllNFTsView\s*=|export\s+default\s+function\s+AllNFTsView/, 'must export AllNFTsView');
  assert.match(src, /useAllTokens/, 'must use the useAllTokens hook');
});
