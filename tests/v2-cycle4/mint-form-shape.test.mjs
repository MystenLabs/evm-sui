import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'web/components/MintForm.tsx');

test('AC-4.5 MintForm exists and exports MintForm', () => {
  assert.ok(existsSync(P), `${P} must exist`);
  const src = readFileSync(P, 'utf8');
  assert.match(src, /export\s+function\s+MintForm|export\s+const\s+MintForm\s*=|export\s+default\s+function\s+MintForm/, 'must export MintForm');
});

test('AC-4.5 references each form field', () => {
  const src = readFileSync(P, 'utf8');
  for (const f of ['name', 'description', 'category', 'vibe']) {
    assert.match(src, new RegExp(`\\b${f}\\b`), `must reference field: ${f}`);
  }
  assert.match(src, /type=['"]file['"]/, 'must include a file input');
});

test('AC-4.6 validation constants present', () => {
  const src = readFileSync(P, 'utf8');
  assert.match(src, /\b64\b/, 'must reference 64-char name limit');
  assert.match(src, /\b500\b/, 'must reference 500-char description limit');
  assert.match(src, /5\s*\*\s*1024\s*\*\s*1024|5242880/, 'must reference 5 MiB cap');
  for (const m of ['image/png', 'image/jpeg', 'image/webp']) {
    assert.match(src, new RegExp(m.replace(/\//g, '\\/')), `must allow ${m}`);
  }
});
