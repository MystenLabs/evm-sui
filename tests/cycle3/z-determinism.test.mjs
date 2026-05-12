// T-007 — AC-3.7: gen:assets is deterministic across two runs (byte-identical output).
//
// File name prefix 'z-' ensures this runs AFTER generate-assets-runs.test.mjs in the
// node --test glob pass; that test provides the initial five PNGs. Here we hash them
// (run-one), invoke pnpm gen:assets again WITHOUT deleting (the script must overwrite),
// and re-hash to confirm byte identity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'assets');
const INDICES = [1, 2, 3, 4, 5];

async function sha256OfFile(p) {
  const buf = await readFile(p);
  return createHash('sha256').update(buf).digest('hex');
}

test('gen:assets is deterministic across two consecutive runs', { timeout: 180000 }, async (t) => {
  // Capture run-one hashes from the assets already on disk.
  const runOne = {};
  for (const i of INDICES) {
    const p = path.join(ASSETS_DIR, `nft-${i}.png`);
    let h;
    try {
      h = await sha256OfFile(p);
    } catch (err) {
      assert.fail(
        `Precondition failed: ${p} must exist (generate-assets-runs.test.mjs should have produced it). readFile error: ${err && err.message}`,
      );
    }
    runOne[i] = h;
  }

  await t.test('second pnpm gen:assets invocation exits 0', () => {
    const res = spawnSync('pnpm', ['gen:assets'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
      env: process.env,
    });
    assert.strictEqual(
      res.error,
      undefined,
      `pnpm gen:assets (run two) must not error. error=${res.error && res.error.message}\nstdout: ${res.stdout}\nstderr: ${res.stderr}`,
    );
    assert.strictEqual(
      res.status,
      0,
      `pnpm gen:assets (run two) must exit 0. status=${res.status}\nstdout: ${res.stdout}\nstderr: ${res.stderr}`,
    );
  });

  for (const i of INDICES) {
    await t.test(`nft-${i}.png sha256 matches between runs`, async () => {
      const p = path.join(ASSETS_DIR, `nft-${i}.png`);
      let runTwoHash;
      try {
        runTwoHash = await sha256OfFile(p);
      } catch (err) {
        assert.fail(`Failed to read ${p} after run two: ${err && err.message}`);
      }
      assert.strictEqual(
        runTwoHash,
        runOne[i],
        `nft-${i}.png must be byte-identical across runs. runOne=${runOne[i]} runTwo=${runTwoHash}`,
      );
    });
  }
});
