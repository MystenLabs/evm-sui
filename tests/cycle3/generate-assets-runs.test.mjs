// T-004 — AC-3.4: pnpm gen:assets produces exactly five named PNG files in assets/
// T-005 — AC-3.5: each generated PNG is <= 100 KiB (102_400 bytes)
// T-006 — AC-3.6: each generated PNG has a valid PNG signature and IHDR width/height = 512x512
//
// File name prefix 'generate-assets-runs' is the integration baseline; its outputs
// are reused by z-determinism.test.mjs and z-distinct-pngs.test.mjs (which run later
// lexicographically via the 'z-' prefix).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { readFile, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'assets');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EXPECTED_FILES = ['nft-1.png', 'nft-2.png', 'nft-3.png', 'nft-4.png', 'nft-5.png'];

test('pnpm install + pnpm gen:assets produces the five PNGs', { timeout: 360000 }, async (t) => {
  // Hermetic setup: remove any prior nft-*.png so we observe what THIS run wrote.
  for (const f of EXPECTED_FILES) {
    await rm(path.join(ASSETS_DIR, f), { force: true });
  }

  await t.test('pnpm install completes with exit 0', () => {
    const res = spawnSync('pnpm', ['install', '--silent'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 240000,
      env: process.env,
    });
    assert.strictEqual(
      res.error,
      undefined,
      `pnpm install must not error. error=${res.error && res.error.message}\nstdout: ${res.stdout}\nstderr: ${res.stderr}`,
    );
    assert.strictEqual(
      res.status,
      0,
      `pnpm install must exit 0. status=${res.status}\nstdout: ${res.stdout}\nstderr: ${res.stderr}`,
    );
  });

  await t.test('pnpm gen:assets completes with exit 0', () => {
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
      `pnpm gen:assets must not error. error=${res.error && res.error.message}\nstdout: ${res.stdout}\nstderr: ${res.stderr}`,
    );
    assert.strictEqual(
      res.status,
      0,
      `pnpm gen:assets must exit 0. status=${res.status}\nstdout: ${res.stdout}\nstderr: ${res.stderr}`,
    );
  });

  await t.test('assets/ contains exactly the five expected PNG files', async () => {
    let entries;
    try {
      entries = await readdir(ASSETS_DIR);
    } catch (err) {
      assert.fail(`Failed to readdir(${ASSETS_DIR}): ${err && err.message}`);
    }
    const pngs = entries.filter((name) => /\.png$/.test(name)).sort();
    const expectedSorted = [...EXPECTED_FILES].sort();
    assert.strictEqual(
      pngs.length,
      5,
      `assets/ must contain exactly 5 .png files. Got ${pngs.length}: ${JSON.stringify(pngs)}. All entries: ${JSON.stringify(entries)}`,
    );
    assert.deepStrictEqual(
      pngs,
      expectedSorted,
      `assets/ .png set must equal ${JSON.stringify(expectedSorted)}. Got: ${JSON.stringify(pngs)}`,
    );
  });

  // T-005 — per-file size check.
  for (const fname of EXPECTED_FILES) {
    await t.test(`${fname} is <= 100 KiB (102400 bytes)`, () => {
      const p = path.join(ASSETS_DIR, fname);
      let stat;
      try {
        stat = statSync(p);
      } catch (err) {
        assert.fail(`Expected ${p} to exist. statSync error: ${err && err.message}`);
      }
      assert.ok(
        stat.size <= 102400,
        `${p} must be <= 102400 bytes. Got size=${stat.size}`,
      );
    });
  }

  // T-006 — per-file PNG signature + IHDR width/height check.
  for (const fname of EXPECTED_FILES) {
    await t.test(`${fname} has valid PNG signature and 512x512 IHDR`, async () => {
      const p = path.join(ASSETS_DIR, fname);
      let buf;
      try {
        buf = await readFile(p);
      } catch (err) {
        assert.fail(`Expected ${p} to be readable. readFile error: ${err && err.message}`);
      }
      assert.ok(
        buf.length >= 24,
        `${p} must be >= 24 bytes (PNG signature + IHDR header + IHDR data start). Got length=${buf.length}`,
      );
      const sig = buf.subarray(0, 8);
      assert.strictEqual(
        Buffer.compare(sig, PNG_SIGNATURE),
        0,
        `${p} bytes [0..7] must equal the PNG signature ${PNG_SIGNATURE.toString('hex')}. Got: ${sig.toString('hex')}`,
      );
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      assert.strictEqual(
        width,
        512,
        `${p} IHDR width (bytes 16..19, big-endian uint32) must equal 512. Got: ${width}`,
      );
      assert.strictEqual(
        height,
        512,
        `${p} IHDR height (bytes 20..23, big-endian uint32) must equal 512. Got: ${height}`,
      );
    });
  }
});
