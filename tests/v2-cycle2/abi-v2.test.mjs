import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'web/lib/contract.ts');

test('AC-2.5 web/lib/contract.ts ABI contains v2 surface', () => {
  const src = readFileSync(P, 'utf8');
  // mint(string) — single-arg
  assert.match(src, /"name":\s*"mint"[^]*?"inputs":\s*\[\s*\{\s*"name":\s*"tokenURI_?"?[^]*?"type":\s*"string"[^]*?\}\s*\]/,
    'expected `mint(string)` ABI entry');
  // mintTo(address,string)
  assert.match(src, /"name":\s*"mintTo"[^]*?"inputs":\s*\[\s*\{[^]*?"type":\s*"address"[^]*?\}\s*,\s*\{[^]*?"type":\s*"string"[^]*?\}\s*\]/,
    'expected `mintTo(address,string)` ABI entry');
  // Minted event
  assert.match(src, /"type":\s*"event"[^]*?"name":\s*"Minted"/,
    'expected `Minted` event ABI entry');
});
