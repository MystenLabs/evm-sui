// T-008 — AC-2.8
// Integration test: `forge test -vv` in contracts/ exits 0 and the output contains
// a [PASS] marker for each of the five required test functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CONTRACTS_DIR = path.join(REPO_ROOT, 'contracts');
const FORGE = path.join(process.env.HOME, '.foundry', 'bin', 'forge');

const REQUIRED_FNS = [
  'test_OwnerCanMint',
  'test_RevertWhen_NonOwnerMints',
  'test_TotalSupplyIncrements',
  'test_SupportsInterface',
  'test_TransferWorks',
];

let cached = null;
function runForgeTest() {
  if (cached) return cached;
  const res = spawnSync(FORGE, ['test', '-vv'], {
    cwd: CONTRACTS_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 240000,
    env: {
      ...process.env,
      PATH: `${path.join(process.env.HOME, '.foundry', 'bin')}:${process.env.PATH}`,
    },
  });
  cached = res;
  return res;
}

test('forge test -vv exits with code 0', { timeout: 300000 }, () => {
  const res = runForgeTest();
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  assert.strictEqual(
    res.error,
    undefined,
    `forge test must not error out. error=${res.error && res.error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
  assert.strictEqual(
    res.status,
    0,
    `forge test -vv must exit 0, got status=${res.status}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
});

for (const fn of REQUIRED_FNS) {
  test(`forge test output contains [PASS] ${fn}(`, { timeout: 300000 }, () => {
    const res = runForgeTest();
    const stdout = res.stdout || '';
    const stderr = res.stderr || '';
    const combined = stdout + '\n' + stderr;
    const needle = `[PASS] ${fn}(`;
    assert.ok(
      combined.includes(needle),
      `expected output to contain "${needle}".\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  });
}
