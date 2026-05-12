import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'web/app/page.tsx');

test('AC-6.2 page is client + imports all sections', () => {
  const src = readFileSync(P, 'utf8');
  assert.match(src, /['"]use client['"]/, 'must be a client component');
  for (const sym of ['AllNFTsView', 'MyNFTsView', 'MintForm', 'Tabs', 'ConnectButton', 'useState']) {
    assert.match(src, new RegExp(`\\b${sym}\\b`), `must reference: ${sym}`);
  }
});

test('AC-6.3 page renders the three sections conditionally', () => {
  const src = readFileSync(P, 'utf8');
  for (const key of ['all', 'mine', 'mint']) {
    assert.match(src, new RegExp(`['"]${key}['"]`), `must reference tab key: ${key}`);
  }
});

test('AC-6.4 default selected tab is "all"', () => {
  const src = readFileSync(P, 'utf8');
  assert.match(src, /useState[^(]*\(\s*['"]all['"]\s*\)/, 'must default selected tab to "all"');
});
