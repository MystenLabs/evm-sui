// T-007 — AC-1.7
// Asserts README.md exists, starts with a top-level # heading, mentions Walrus/NFT/Status.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const README_PATH = path.join(REPO_ROOT, 'README.md');

test('README.md exists and is non-empty', () => {
  assert.ok(existsSync(README_PATH), `README.md must exist at ${README_PATH}`);
  const content = readFileSync(README_PATH, 'utf8');
  assert.ok(content.length > 0, 'README.md must not be empty');
});

test('README.md first non-blank line starts with "# "', () => {
  const content = readFileSync(README_PATH, 'utf8');
  const firstNonBlank = content.split(/\r?\n/).find((l) => l.trim().length > 0);
  assert.ok(firstNonBlank !== undefined, 'README.md must contain at least one non-blank line');
  assert.ok(
    firstNonBlank.startsWith('# '),
    `First non-blank line of README.md must start with "# " (top-level heading). Got: ${JSON.stringify(firstNonBlank)}`,
  );
});

test('README.md mentions Walrus (case-insensitive)', () => {
  const content = readFileSync(README_PATH, 'utf8');
  assert.ok(/walrus/i.test(content), 'README.md must mention "Walrus" (case-insensitive)');
});

test('README.md mentions NFT (case-insensitive)', () => {
  const content = readFileSync(README_PATH, 'utf8');
  assert.ok(/nft/i.test(content), 'README.md must mention "NFT" (case-insensitive)');
});

test('README.md contains a Status line with under-construction wording', () => {
  const content = readFileSync(README_PATH, 'utf8');
  assert.ok(/status/i.test(content), 'README.md must mention "Status" (case-insensitive)');
  assert.ok(
    /under construction|wip|in progress|scaffold/i.test(content),
    'README.md must include under-construction phrasing (one of: "under construction", "wip", "in progress", "scaffold")',
  );
});
