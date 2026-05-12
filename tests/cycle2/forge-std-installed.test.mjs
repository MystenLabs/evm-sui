// T-004 — AC-2.4
// Asserts contracts/lib/forge-std/ is installed with src/Test.sol.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FORGE_STD_ROOT = path.join(REPO_ROOT, 'contracts', 'lib', 'forge-std');
const TEST_SOL = path.join(FORGE_STD_ROOT, 'src', 'Test.sol');

test('contracts/lib/forge-std/ is a directory', () => {
  let s;
  try {
    s = statSync(FORGE_STD_ROOT);
  } catch (err) {
    assert.fail(`Failed to stat ${FORGE_STD_ROOT}: ${err.code || err.message}`);
  }
  assert.ok(s.isDirectory(), `${FORGE_STD_ROOT} must be a directory`);
});

test('forge-std/src/Test.sol exists and is non-empty', () => {
  let s;
  try {
    s = statSync(TEST_SOL);
  } catch (err) {
    assert.fail(`Failed to stat ${TEST_SOL}: ${err.code || err.message}`);
  }
  assert.ok(s.isFile(), `${TEST_SOL} must be a regular file`);
  assert.ok(s.size > 0, `${TEST_SOL} must be non-empty`);
});
