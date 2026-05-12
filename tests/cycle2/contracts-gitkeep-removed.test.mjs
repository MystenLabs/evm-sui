// T-011 — AC-2.11
// Asserts the Cycle 1 placeholder contracts/.gitkeep has been deleted, while
// contracts/ itself remains as a directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CONTRACTS_DIR = path.join(REPO_ROOT, 'contracts');
const GITKEEP = path.join(CONTRACTS_DIR, '.gitkeep');

test('contracts/.gitkeep does NOT exist (Cycle 1 placeholder removed)', async () => {
  let err = null;
  try {
    await stat(GITKEEP);
  } catch (e) {
    err = e;
  }
  assert.ok(err, `Expected ${GITKEEP} to be absent, but stat() succeeded — the Cycle 1 placeholder was not deleted`);
  assert.strictEqual(
    err.code,
    'ENOENT',
    `Expected ENOENT for ${GITKEEP}, got ${err.code}: ${err.message}`,
  );
});

test('contracts/ directory still exists', async () => {
  let s;
  try {
    s = await stat(CONTRACTS_DIR);
  } catch (err) {
    assert.fail(`contracts/ must still exist at ${CONTRACTS_DIR}, got: ${err.code || err.message}`);
  }
  assert.ok(s.isDirectory(), `${CONTRACTS_DIR} must remain a directory`);
});
