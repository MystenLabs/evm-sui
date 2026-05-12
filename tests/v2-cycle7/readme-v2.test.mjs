import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'README.md');

test('AC-7.1 README does not require pnpm seed:walrus in quick-start', () => {
  const src = readFileSync(P, 'utf8');
  // The phrase shouldn't appear inside a numbered/code happy-path. Heuristic:
  // it must not appear in a "Quick start" code block as a required step.
  const quickStart = src.split(/##\s+Quick start/i)[1] ?? '';
  const upToNextH2 = quickStart.split(/\n##\s+/)[0] ?? quickStart;
  assert.doesNotMatch(upToNextH2, /pnpm\s+seed:walrus/, 'pnpm seed:walrus must not be in the v2 quick-start');
});

test('AC-7.2 README documents the v2 mint flow', () => {
  const src = readFileSync(P, 'utf8');
  assert.match(src, /\bMint\b/, 'must mention the Mint tab/flow');
  assert.match(src, /upload/i, 'must describe image upload from the UI');
  assert.match(src, /Anvil/, 'must instruct switching to Anvil');
});

test('AC-7.3 README references Walruscan explorer', () => {
  const src = readFileSync(P, 'utf8');
  assert.match(src, /walruscan\.com/i, 'must reference Walruscan');
});
