// T-009 — AC-2.9
// Integration test: `forge coverage --report summary` reports >= 80% line coverage on src/EvmWalNFT.sol.
// Two-attempt strategy per contract Behavior note 4 (via_ir + coverage interaction):
//   (1) FOUNDRY_PROFILE=coverage forge coverage --report summary
//   (2) fallback without profile override
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CONTRACTS_DIR = path.join(REPO_ROOT, 'contracts');
const FORGE = path.join(process.env.HOME, '.foundry', 'bin', 'forge');
const SOURCE_NEEDLE_RE = /src\/EvmWalNFT\.sol/;

function runCoverage(withProfile) {
  const baseEnv = {
    ...process.env,
    PATH: `${path.join(process.env.HOME, '.foundry', 'bin')}:${process.env.PATH}`,
  };
  if (withProfile) baseEnv.FOUNDRY_PROFILE = 'coverage';
  return spawnSync(FORGE, ['coverage', '--report', 'summary'], {
    cwd: CONTRACTS_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300000,
    env: baseEnv,
  });
}

function combine(res) {
  return (res.stdout || '') + '\n' + (res.stderr || '');
}

test('forge coverage --report summary reports >= 80% lines on src/EvmWalNFT.sol', { timeout: 360000 }, () => {
  // Attempt 1: FOUNDRY_PROFILE=coverage
  let res = runCoverage(true);
  let output = combine(res);
  let attemptUsed = 'FOUNDRY_PROFILE=coverage';
  let sourceLine = output.split(/\r?\n/).find((l) => SOURCE_NEEDLE_RE.test(l));

  if (res.status !== 0 || !sourceLine) {
    // Attempt 2: no profile override
    const fallback = runCoverage(false);
    const fallbackOutput = combine(fallback);
    const fallbackSourceLine = fallbackOutput.split(/\r?\n/).find((l) => SOURCE_NEEDLE_RE.test(l));
    res = fallback;
    output = fallbackOutput;
    attemptUsed = 'no profile override (fallback)';
    sourceLine = fallbackSourceLine;
  }

  assert.strictEqual(
    res.error,
    undefined,
    `forge coverage must not error out (${attemptUsed}). error=${res.error && res.error.message}\noutput:\n${output}`,
  );
  assert.strictEqual(
    res.status,
    0,
    `forge coverage must exit 0 (${attemptUsed}), got status=${res.status}\noutput:\n${output}`,
  );

  assert.ok(
    sourceLine,
    `Expected a row containing src/EvmWalNFT.sol in forge coverage output (${attemptUsed}).\noutput:\n${output}`,
  );

  // Foundry summary table is pipe-separated: ['', 'File', '% Lines', '% Statements', '% Branches', '% Funcs', '']
  // Find the corresponding columns from the header row.
  const lines = output.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.includes('% Lines') && l.includes('File'));
  assert.ok(
    headerIdx >= 0,
    `Could not locate header row containing '% Lines' and 'File' in forge coverage output.\noutput:\n${output}`,
  );
  const headerCols = lines[headerIdx].split('|').map((c) => c.trim());
  const linesColIdx = headerCols.findIndex((c) => c === '% Lines');
  assert.ok(
    linesColIdx >= 0,
    `Could not locate '% Lines' column in header row: ${lines[headerIdx]}`,
  );

  const sourceCols = sourceLine.split('|').map((c) => c.trim());
  const linesCell = sourceCols[linesColIdx];
  assert.ok(
    linesCell != null && linesCell !== '',
    `'% Lines' cell on the src/EvmWalNFT.sol row is empty.\nrow: ${sourceLine}\nheader: ${lines[headerIdx]}`,
  );

  const m = linesCell.match(/([0-9]+(?:\.[0-9]+)?)%/);
  assert.ok(
    m,
    `Could not parse a percentage from '% Lines' cell: "${linesCell}".\nrow: ${sourceLine}`,
  );
  const pct = Number.parseFloat(m[1]);
  assert.ok(
    pct >= 80.0,
    `Expected >= 80% line coverage on src/EvmWalNFT.sol, got ${pct}% (${attemptUsed}).\nrow: ${sourceLine}`,
  );
});
