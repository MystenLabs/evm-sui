import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'contracts/script/Deploy.s.sol');

test('AC-2.1 Deploy.s.sol is deploy-only', () => {
  const src = readFileSync(P, 'utf8');
  assert.doesNotMatch(src, /vm\.readFile/, 'must not call vm.readFile');
  assert.doesNotMatch(src, /stdJson/, 'must not import stdJson');
  assert.doesNotMatch(src, /manifest\.json/, 'must not reference manifest.json');
  assert.doesNotMatch(src, /for\s*\(\s*uint256/, 'must not contain a mint loop');
  assert.match(src, /new\s+EvmWalNFT\s*\(\s*msg\.sender\s*\)/, 'must deploy EvmWalNFT(msg.sender)');
});
