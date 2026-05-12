// T-001 — AC-1.1
// Asserts .gitignore exists at repo root and contains required entries as standalone lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const GITIGNORE_PATH = path.join(REPO_ROOT, '.gitignore');

const REQUIRED_TOKENS = [
  'node_modules',
  'dist',
  '.next',
  'out/',
  'cache/',
  'broadcast/',
  'manifest.json',
  '.deployed-address',
  '.env',
  '.env.*.local',
  'web/.env.local',
];

test('.gitignore exists and is non-empty', () => {
  assert.ok(existsSync(GITIGNORE_PATH), `.gitignore must exist at ${GITIGNORE_PATH}`);
  const content = readFileSync(GITIGNORE_PATH, 'utf8');
  assert.ok(content.length > 0, '.gitignore must not be empty');
});

test('.gitignore contains required tokens', async (t) => {
  const content = readFileSync(GITIGNORE_PATH, 'utf8');
  const lines = new Set(
    content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#')),
  );

  for (const token of REQUIRED_TOKENS) {
    await t.test(`contains "${token}" as a standalone line`, () => {
      assert.ok(
        lines.has(token),
        `Expected .gitignore to contain a standalone line equal to "${token}". Lines present: ${JSON.stringify([...lines])}`,
      );
    });
  }
});
