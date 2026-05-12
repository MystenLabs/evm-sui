import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = path.join(REPO_ROOT, 'web/lib/metadata.ts');

test('AC-3.5 metadata.ts exists with buildMetadata', () => {
  assert.ok(existsSync(P), `${P} must exist`);
  const src = readFileSync(P, 'utf8');
  assert.match(src, /export\s+function\s+buildMetadata\s*\(/, 'must export buildMetadata');
});

test('AC-3.5 buildMetadata input fields covered', () => {
  const src = readFileSync(P, 'utf8');
  for (const field of ['name', 'description', 'blobIdImage', 'category', 'vibe', 'createdAt']) {
    assert.match(src, new RegExp(`\\b${field}\\b`), `must reference input field: ${field}`);
  }
});

test('AC-3.5 buildMetadata output includes the v2 schema fields', () => {
  const src = readFileSync(P, 'utf8');
  for (const field of ['name', 'description', 'image', 'external_url', 'attributes']) {
    assert.match(src, new RegExp(`['"]${field}['"]`), `must produce JSON key: ${field}`);
  }
  assert.match(src, /Category/, 'must include Category attribute');
  assert.match(src, /Vibe/, 'must include Vibe attribute');
  assert.match(src, /Created/, 'must include Created attribute');
});
