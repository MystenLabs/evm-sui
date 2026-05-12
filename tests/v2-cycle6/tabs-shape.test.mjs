import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'web/components/Tabs.tsx');

test('AC-6.1 Tabs exists with required props', () => {
  assert.ok(existsSync(P), `${P} must exist`);
  const src = readFileSync(P, 'utf8');
  assert.match(src, /export\s+function\s+Tabs|export\s+const\s+Tabs\s*=/, 'must export Tabs');
  for (const p of ['items', 'selected', 'onSelect']) {
    assert.match(src, new RegExp(`\\b${p}\\b`), `must reference prop: ${p}`);
  }
});
