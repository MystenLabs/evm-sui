import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FORGE = process.env.HOME + '/.foundry/bin/forge';

function runCoverage(profile) {
  const env = { ...process.env };
  if (profile) env.FOUNDRY_PROFILE = profile;
  return spawnSync(FORGE, ['coverage', '--report', 'summary'], {
    cwd: path.join(REPO_ROOT, 'contracts'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 240000,
    env,
  });
}

test('AC-1.8 forge coverage ≥ 80% on EvmWalNFT.sol', { timeout: 300000 }, () => {
  // Try coverage profile first (via_ir off), fall back to default.
  let r = runCoverage('coverage');
  if (r.status !== 0) r = runCoverage(null);
  assert.strictEqual(r.status, 0, `forge coverage failed:\n${r.stdout}\n${r.stderr}`);

  const line = r.stdout.split(/\n/).find((l) => l.includes('src/EvmWalNFT.sol'));
  assert.ok(line, `no row for src/EvmWalNFT.sol in coverage summary:\n${r.stdout}`);
  // The "% Lines" cell typically looks like "100.00% (11/11)" or just "100.00%"
  const m = line.match(/(\d+(?:\.\d+)?)%/);
  assert.ok(m, `couldn't parse % from coverage line: ${line}`);
  const pct = parseFloat(m[1]);
  assert.ok(pct >= 80.0, `expected ≥80% line coverage, got ${pct}% on src/EvmWalNFT.sol`);
});
