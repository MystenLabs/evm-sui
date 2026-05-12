import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FORGE = process.env.HOME + '/.foundry/bin/forge';

test('AC-7.6 forge test green', { timeout: 180000 }, () => {
  const r = spawnSync(FORGE, ['test'], {
    cwd: path.join(REPO_ROOT, 'contracts'),
    encoding: 'utf8',
    timeout: 180000,
  });
  assert.strictEqual(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
