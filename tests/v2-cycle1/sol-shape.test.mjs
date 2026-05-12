import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SOL = path.join(REPO_ROOT, 'contracts/src/EvmWalNFT.sol');

test('AC-1.1 Minted event declared', () => {
  const src = readFileSync(SOL, 'utf8');
  assert.match(
    src,
    /event\s+Minted\s*\(\s*uint256\s+indexed\s+\w+\s*,\s*address\s+indexed\s+\w+\s*,\s*string\s+\w+\s*\)/,
    'expected `event Minted(uint256 indexed _, address indexed _, string _)` declaration',
  );
});

test('AC-1.2 mintTo(address,string) without onlyOwner', () => {
  const src = readFileSync(SOL, 'utf8');
  const m = src.match(/function\s+mintTo\s*\(\s*address[^)]*string[^)]*\)\s+([^{]+)\{/);
  assert.ok(m, 'expected `function mintTo(address ..., string ...)` declaration');
  assert.doesNotMatch(m[1], /\bonlyOwner\b/, 'mintTo must NOT have onlyOwner modifier');
  assert.match(m[1], /\breturns\s*\(\s*uint256/, 'mintTo must return uint256');
});

test('AC-1.3 mint(string) without onlyOwner', () => {
  const src = readFileSync(SOL, 'utf8');
  // single-arg mint: must NOT match an address-then-string signature
  const m = src.match(/function\s+mint\s*\(\s*string\s+memory\s+\w+\s*\)\s+([^{]+)\{/);
  assert.ok(m, 'expected `function mint(string memory _)` declaration');
  assert.doesNotMatch(m[1], /\bonlyOwner\b/, 'mint(string) must NOT have onlyOwner modifier');
  assert.match(m[1], /\breturns\s*\(\s*uint256/, 'mint(string) must return uint256');
});

test('AC-1.4 Ownable still imported', () => {
  const src = readFileSync(SOL, 'utf8');
  assert.match(src, /import.*Ownable\.sol/, 'Ownable import must remain');
  assert.match(src, /\bOwnable\b/, 'Ownable inheritance reference must remain');
});
