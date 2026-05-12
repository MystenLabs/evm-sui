// T-001 — AC-3.1
// Asserts scripts/generate-assets.ts exists, is a non-empty file, and contains
// at least one of the wiring hints expected of an asset generator (path/file
// pattern or the sharp import). Shape-only — does not invoke the script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'generate-assets.ts');

test('generate-assets.ts exists and is non-empty', async (t) => {
  await t.test(`statSync on ${SCRIPT_PATH}: isFile() === true and size > 0`, () => {
    let stat;
    try {
      stat = statSync(SCRIPT_PATH);
    } catch (err) {
      assert.fail(
        `Expected ${SCRIPT_PATH} to exist and be statable. Got error: ${err && err.message}`,
      );
    }
    assert.strictEqual(
      stat.isFile(),
      true,
      `${SCRIPT_PATH} must be a regular file (isFile() === true). Got isFile()=${stat.isFile()}`,
    );
    assert.ok(
      stat.size > 0,
      `${SCRIPT_PATH} must be non-empty. Got size=${stat.size}`,
    );
  });

  await t.test(`${SCRIPT_PATH} content references the asset pipeline (assets/, nft-, or sharp)`, async () => {
    const content = await readFile(SCRIPT_PATH, 'utf8');
    const hasAssetsDir = /assets\//.test(content);
    const hasNftPrefix = /nft-/.test(content);
    const hasSharp = content.includes('sharp');
    assert.ok(
      hasAssetsDir || hasNftPrefix || hasSharp,
      `${SCRIPT_PATH} must contain at least one of /assets\\//, /nft-/, or the literal 'sharp' to prove it is wired to generate assets. Found: assetsDir=${hasAssetsDir}, nftPrefix=${hasNftPrefix}, sharp=${hasSharp}`,
    );
  });
});
