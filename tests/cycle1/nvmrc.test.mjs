// T-002 — AC-1.2
// Asserts .nvmrc exists and its contents are exactly "22\n".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const NVMRC_PATH = path.join(REPO_ROOT, '.nvmrc');

test('.nvmrc contains exactly "22\\n"', () => {
  const content = readFileSync(NVMRC_PATH, 'utf8');
  assert.strictEqual(
    content,
    '22\n',
    `.nvmrc must contain exactly the string "22\\n" (single trailing LF, no extras). Got: ${JSON.stringify(content)}`,
  );
});
