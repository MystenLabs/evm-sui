// T-007 — AC-2.7
// Integration test: `forge build` in contracts/ exits 0 and emits a non-empty EvmWalNFT.json artifact.
// File name prefix 'forge-a-build' chosen so lexicographic test-file ordering runs build BEFORE
// the forge-b-test and forge-c-coverage shells.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CONTRACTS_DIR = path.join(REPO_ROOT, 'contracts');
const FORGE = path.join(process.env.HOME, '.foundry', 'bin', 'forge');
const ARTIFACT = path.join(CONTRACTS_DIR, 'out', 'EvmWalNFT.sol', 'EvmWalNFT.json');

test('forge build succeeds and emits EvmWalNFT artifact', { timeout: 300000 }, () => {
  const res = spawnSync(FORGE, ['build'], {
    cwd: CONTRACTS_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 240000,
    env: {
      ...process.env,
      PATH: `${path.join(process.env.HOME, '.foundry', 'bin')}:${process.env.PATH}`,
    },
  });
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  assert.strictEqual(
    res.error,
    undefined,
    `forge build must not error out. error=${res.error && res.error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
  assert.strictEqual(
    res.status,
    0,
    `forge build must exit 0, got status=${res.status}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );

  let s;
  try {
    s = statSync(ARTIFACT);
  } catch (err) {
    assert.fail(`Expected artifact ${ARTIFACT} to exist after forge build, got: ${err.code || err.message}`);
  }
  assert.ok(s.isFile(), `${ARTIFACT} must be a regular file`);
  assert.ok(s.size > 0, `${ARTIFACT} must be non-empty`);
});
