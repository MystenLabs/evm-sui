// T-010 — AC-2.10
// Asserts contracts/.gitignore exists and contains lines for out/, cache/, broadcast/, lib/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const GITIGNORE = path.join(REPO_ROOT, 'contracts', '.gitignore');

const REQUIRED_TOKENS = ['out/', 'cache/', 'broadcast/', 'lib/'];

let cachedSet = null;

async function loadSet() {
  if (cachedSet) return cachedSet;
  const text = await readFile(GITIGNORE, 'utf8');
  assert.ok(text.length > 0, `${GITIGNORE} must be non-empty`);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
  cachedSet = new Set(lines);
  return cachedSet;
}

test('contracts/.gitignore exists and is non-empty', async () => {
  await loadSet();
});

for (const token of REQUIRED_TOKENS) {
  test(`contracts/.gitignore contains "${token}"`, async () => {
    const lines = await loadSet();
    assert.ok(
      lines.has(token),
      `Expected ${GITIGNORE} to contain a standalone line "${token}". Lines found: ${JSON.stringify([...lines])}`,
    );
  });
}
