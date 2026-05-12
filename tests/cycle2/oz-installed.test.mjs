// T-003 — AC-2.3
// Asserts contracts/lib/openzeppelin-contracts/ is installed with key ERC721/Ownable sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const OZ_ROOT = path.join(REPO_ROOT, 'contracts', 'lib', 'openzeppelin-contracts');
const ERC721_SOL = path.join(OZ_ROOT, 'contracts', 'token', 'ERC721', 'ERC721.sol');
const OWNABLE_SOL = path.join(OZ_ROOT, 'contracts', 'access', 'Ownable.sol');

test('contracts/lib/openzeppelin-contracts/ is a directory', () => {
  let s;
  try {
    s = statSync(OZ_ROOT);
  } catch (err) {
    assert.fail(`Failed to stat ${OZ_ROOT}: ${err.code || err.message}`);
  }
  assert.ok(s.isDirectory(), `${OZ_ROOT} must be a directory`);
});

test('OpenZeppelin ERC721.sol exists and is non-empty', () => {
  let s;
  try {
    s = statSync(ERC721_SOL);
  } catch (err) {
    assert.fail(`Failed to stat ${ERC721_SOL}: ${err.code || err.message}`);
  }
  assert.ok(s.isFile(), `${ERC721_SOL} must be a regular file`);
  assert.ok(s.size > 0, `${ERC721_SOL} must be non-empty`);
});

test('OpenZeppelin Ownable.sol exists and is non-empty', () => {
  let s;
  try {
    s = statSync(OWNABLE_SOL);
  } catch (err) {
    assert.fail(`Failed to stat ${OWNABLE_SOL}: ${err.code || err.message}`);
  }
  assert.ok(s.isFile(), `${OWNABLE_SOL} must be a regular file`);
  assert.ok(s.size > 0, `${OWNABLE_SOL} must be non-empty`);
});
