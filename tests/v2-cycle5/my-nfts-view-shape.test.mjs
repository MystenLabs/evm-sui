import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'web/components/MyNFTsView.tsx');

test('AC-5.4 MyNFTsView filters by connected wallet', () => {
  assert.ok(existsSync(P), `${P} must exist`);
  const src = readFileSync(P, 'utf8');
  assert.match(src, /export\s+function\s+MyNFTsView|export\s+const\s+MyNFTsView\s*=|export\s+default\s+function\s+MyNFTsView/, 'must export MyNFTsView');
  assert.match(src, /useAccount/, 'must use useAccount for wallet detection');
  assert.match(src, /useAllTokens/, 'must use the useAllTokens hook');
  assert.match(src, /Connect a wallet/i, 'must show "Connect a wallet" empty state when disconnected');
});
