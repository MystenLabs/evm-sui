import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const T = path.join(REPO_ROOT, 'contracts/test/EvmWalNFT.t.sol');

const REQUIRED = [
  'test_AnyoneCanMint',
  'test_SelfMintReturnsSequentialIds',
  'test_MintToAssignsToRecipient',
  'test_MintedEventEmitted',
  'test_TotalSupplyIncrements',
  'test_SupportsInterface',
  'test_TransferWorks',
];

test('AC-1.5 required test names present', () => {
  const src = readFileSync(T, 'utf8');
  for (const name of REQUIRED) {
    assert.match(src, new RegExp(`function\\s+${name}\\s*\\(`), `missing test function: ${name}`);
  }
});

test('AC-1.5 v1 owner-revert test removed', () => {
  const src = readFileSync(T, 'utf8');
  assert.doesNotMatch(src, /function\s+test_RevertWhen_NonOwnerMints\s*\(/, 'v1 owner-revert test must be removed');
});
