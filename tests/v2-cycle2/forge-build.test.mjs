import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FORGE = process.env.HOME + '/.foundry/bin/forge';

test('AC-2.3 forge build green', { timeout: 180000 }, () => {
  const r = spawnSync(FORGE, ['build'], {
    cwd: path.join(REPO_ROOT, 'contracts'),
    encoding: 'utf8',
    timeout: 180000,
  });
  assert.strictEqual(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
