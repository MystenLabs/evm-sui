// T-002 — AC-2.2
// Asserts contracts/remappings.txt exists and contains an @openzeppelin/ remapping
// pointing at either lib/openzeppelin-contracts/ or lib/openzeppelin-contracts/contracts/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REMAPPINGS_TXT = path.join(REPO_ROOT, 'contracts', 'remappings.txt');

test('remappings.txt exists, is non-empty, and remaps @openzeppelin/', async () => {
  const text = await readFile(REMAPPINGS_TXT, 'utf8');
  assert.ok(text.length > 0, `${REMAPPINGS_TXT} must be non-empty`);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
  const pattern = /^@openzeppelin\/=lib\/openzeppelin-contracts\/(contracts\/)?$/;
  const matches = lines.filter((l) => pattern.test(l));
  assert.ok(
    matches.length >= 1,
    `Expected a line matching ${pattern} in ${REMAPPINGS_TXT}. Actual contents:\n${text}`,
  );
});
