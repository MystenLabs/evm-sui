import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'scripts/upload-walrus.ts');

test('AC-7.4 upload-walrus.ts has DEPRECATED header', () => {
  const src = readFileSync(P, 'utf8');
  const head = src.split('\n').slice(0, 30).join('\n');
  assert.match(head, /DEPRECATED/, 'top-of-file must contain DEPRECATED marker');
});
