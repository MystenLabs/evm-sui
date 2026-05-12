// T-006 — AC-2.6
// Source-text shape check for contracts/test/EvmWalNFT.t.sol. Verifies the five
// named test functions the green-phase harness greps for are present as signatures.
// Assertion bodies are NOT inspected here — AC-2.8 (forge test exit 0 + [PASS]) is the runtime gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const TEST_SOL = path.join(REPO_ROOT, 'contracts', 'test', 'EvmWalNFT.t.sol');

let content;

async function load() {
  if (content == null) {
    content = await readFile(TEST_SOL, 'utf8');
  }
  return content;
}

test('EvmWalNFT.t.sol exists and is non-empty', async () => {
  const c = await load();
  assert.ok(c.length > 0, `${TEST_SOL} must be non-empty`);
});

test('imports forge-std/Test.sol', async () => {
  const c = await load();
  const re = /import\s+["']forge-std\/Test\.sol["']\s*;/;
  assert.ok(re.test(c), `expected ${re} to match in ${TEST_SOL}`);
});

test('imports ../src/EvmWalNFT.sol', async () => {
  const c = await load();
  const re = /import\s+["']\.\.\/src\/EvmWalNFT\.sol["']\s*;/;
  assert.ok(re.test(c), `expected ${re} to match in ${TEST_SOL}`);
});

test('declares contract EvmWalNFTTest is Test {', async () => {
  const c = await load();
  const re = /contract\s+EvmWalNFTTest\s+is\s+Test\s*\{/;
  assert.ok(re.test(c), `expected ${re} to match in ${TEST_SOL}`);
});

const REQUIRED_FNS = [
  'test_OwnerCanMint',
  'test_RevertWhen_NonOwnerMints',
  'test_TotalSupplyIncrements',
  'test_SupportsInterface',
  'test_TransferWorks',
];

for (const fn of REQUIRED_FNS) {
  test(`declares ${fn}() public`, async () => {
    const c = await load();
    const re = new RegExp(`function\\s+${fn}\\s*\\(\\s*\\)\\s+public`);
    assert.ok(re.test(c), `expected ${re} to match in ${TEST_SOL}`);
  });
}
