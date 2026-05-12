import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

test('AC-5.6 web builds', { timeout: 300000 }, () => {
  const r = spawnSync('pnpm', ['--filter', 'web', 'build'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 300000,
  });
  assert.strictEqual(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
