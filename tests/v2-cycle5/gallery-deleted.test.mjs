import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

test('AC-5.5 Gallery.tsx removed (replaced by AllNFTsView)', () => {
  const P = path.join(REPO_ROOT, 'web/components/Gallery.tsx');
  assert.strictEqual(existsSync(P), false, `${P} must NOT exist`);
});
