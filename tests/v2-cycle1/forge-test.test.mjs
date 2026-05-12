import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FORGE = process.env.HOME + '/.foundry/bin/forge';
const REQUIRED = [
  'test_AnyoneCanMint',
  'test_SelfMintReturnsSequentialIds',
  'test_MintToAssignsToRecipient',
  'test_MintedEventEmitted',
  'test_TotalSupplyIncrements',
  'test_SupportsInterface',
  'test_TransferWorks',
];

test('AC-1.7 forge test passes with all required tests', { timeout: 180000 }, () => {
  const r = spawnSync(FORGE, ['test', '-vv'], {
    cwd: path.join(REPO_ROOT, 'contracts'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 180000,
  });
  assert.strictEqual(r.status, 0, `forge test failed:\n${r.stdout}\n${r.stderr}`);
  for (const name of REQUIRED) {
    assert.match(r.stdout, new RegExp(`\\[PASS\\]\\s+${name}\\(`), `missing PASS for ${name}`);
  }
});
