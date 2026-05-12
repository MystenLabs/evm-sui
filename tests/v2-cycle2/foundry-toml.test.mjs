import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'contracts/foundry.toml');

test('AC-2.2 foundry.toml has no fs_permissions', () => {
  const src = readFileSync(P, 'utf8');
  assert.doesNotMatch(src, /fs_permissions/, 'fs_permissions must be removed');
});
