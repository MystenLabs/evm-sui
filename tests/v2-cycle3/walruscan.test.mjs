import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'web/lib/walruscan.ts');

test('AC-3.3 walruscan.ts exists with walruscanUrl', () => {
  assert.ok(existsSync(P), `${P} must exist`);
  const src = readFileSync(P, 'utf8');
  assert.match(src, /export\s+function\s+walruscanUrl\s*\(/, 'must export walruscanUrl');
  assert.match(
    src,
    /https:\/\/walruscan\.com\/testnet\/blob\//,
    'must use canonical Walruscan testnet pattern',
  );
});
