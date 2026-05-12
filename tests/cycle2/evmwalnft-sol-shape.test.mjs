// T-005 — AC-2.5
// Source-text shape check for contracts/src/EvmWalNFT.sol. Runtime behavior is
// exercised by the forge test suite (AC-2.6 / AC-2.8). We tolerate whitespace
// variation but pin keyword order and the override(ERC721, ERC721URIStorage) tuple.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const EVM_WAL_NFT_SOL = path.join(REPO_ROOT, 'contracts', 'src', 'EvmWalNFT.sol');

let content;

async function load() {
  if (content == null) {
    content = await readFile(EVM_WAL_NFT_SOL, 'utf8');
  }
  return content;
}

test('EvmWalNFT.sol exists and is non-empty', async () => {
  const c = await load();
  assert.ok(c.length > 0, `${EVM_WAL_NFT_SOL} must be non-empty`);
});

test('declares pragma solidity ^0.8.24..^0.8.28', async () => {
  const c = await load();
  const re = /pragma\s+solidity\s+\^0\.8\.(24|25|26|27|28)\s*;/;
  assert.ok(re.test(c), `expected ${re} to match in ${EVM_WAL_NFT_SOL}`);
});

test('imports @openzeppelin/contracts/token/ERC721/ERC721.sol', async () => {
  const c = await load();
  const re = /import\s+["']@openzeppelin\/contracts\/token\/ERC721\/ERC721\.sol["']\s*;/;
  assert.ok(re.test(c), `expected ${re} to match in ${EVM_WAL_NFT_SOL}`);
});

test('imports @openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol', async () => {
  const c = await load();
  const re = /import\s+["']@openzeppelin\/contracts\/token\/ERC721\/extensions\/ERC721URIStorage\.sol["']\s*;/;
  assert.ok(re.test(c), `expected ${re} to match in ${EVM_WAL_NFT_SOL}`);
});

test('imports @openzeppelin/contracts/access/Ownable.sol', async () => {
  const c = await load();
  const re = /import\s+["']@openzeppelin\/contracts\/access\/Ownable\.sol["']\s*;/;
  assert.ok(re.test(c), `expected ${re} to match in ${EVM_WAL_NFT_SOL}`);
});

test('inherits ERC721, ERC721URIStorage, Ownable', async () => {
  const c = await load();
  const re = /contract\s+EvmWalNFT\s+is\s+ERC721\s*,\s*ERC721URIStorage\s*,\s*Ownable\s*\{/;
  assert.ok(re.test(c), `expected ${re} to match in ${EVM_WAL_NFT_SOL}`);
});

test('constructor takes address initialOwner and chains Ownable(initialOwner) with name + symbol literals', async () => {
  const c = await load();
  const ctorRe = /constructor\s*\(\s*address\s+initialOwner\s*\)/;
  assert.ok(ctorRe.test(c), `expected ${ctorRe} to match in ${EVM_WAL_NFT_SOL}`);
  assert.ok(c.includes("'EvmWal NFT'") || c.includes('"EvmWal NFT"'), `expected the literal string "EvmWal NFT" in ${EVM_WAL_NFT_SOL}`);
  assert.ok(c.includes("'WALNFT'") || c.includes('"WALNFT"'), `expected the literal string "WALNFT" in ${EVM_WAL_NFT_SOL}`);
  const ownableRe = /Ownable\s*\(\s*initialOwner\s*\)/;
  assert.ok(ownableRe.test(c), `expected ${ownableRe} to match in ${EVM_WAL_NFT_SOL}`);
});

test('declares mint(address, string memory) external onlyOwner returns (uint256)', async () => {
  const c = await load();
  const re = /function\s+mint\s*\(\s*address\s+\w+\s*,\s*string\s+memory\s+\w+\s*\)\s+external\s+onlyOwner\s+returns\s*\(\s*uint256\s*\)/;
  assert.ok(re.test(c), `expected ${re} to match in ${EVM_WAL_NFT_SOL}`);
});

test('declares totalSupply() external view returns (uint256)', async () => {
  const c = await load();
  const re = /function\s+totalSupply\s*\(\s*\)\s+external\s+view\s+returns\s*\(\s*uint256\s*\)/;
  assert.ok(re.test(c), `expected ${re} to match in ${EVM_WAL_NFT_SOL}`);
});

test('overrides tokenURI(uint256) public view override(ERC721, ERC721URIStorage) returns (string memory)', async () => {
  const c = await load();
  const re = /function\s+tokenURI\s*\(\s*uint256\s+\w+\s*\)\s+public\s+view\s+override\s*\(\s*ERC721\s*,\s*ERC721URIStorage\s*\)\s+returns\s*\(\s*string\s+memory\s*\)/;
  assert.ok(re.test(c), `expected ${re} to match in ${EVM_WAL_NFT_SOL}`);
});

test('overrides supportsInterface(bytes4) public view override(ERC721, ERC721URIStorage) returns (bool)', async () => {
  const c = await load();
  const re = /function\s+supportsInterface\s*\(\s*bytes4\s+\w+\s*\)\s+public\s+view\s+override\s*\(\s*ERC721\s*,\s*ERC721URIStorage\s*\)\s+returns\s*\(\s*bool\s*\)/;
  assert.ok(re.test(c), `expected ${re} to match in ${EVM_WAL_NFT_SOL}`);
});
