// T-008 — AC-1.8
// Asserts contracts/ and web/ exist as directories and contain .gitkeep files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CONTRACTS_DIR = path.join(REPO_ROOT, 'contracts');
const WEB_DIR = path.join(REPO_ROOT, 'web');
const CONTRACTS_GITKEEP = path.join(CONTRACTS_DIR, '.gitkeep');
const WEB_GITKEEP = path.join(WEB_DIR, '.gitkeep');

test('contracts/ exists and is a directory', () => {
  assert.ok(existsSync(CONTRACTS_DIR), `contracts/ must exist at ${CONTRACTS_DIR}`);
  const s = statSync(CONTRACTS_DIR);
  assert.ok(s.isDirectory(), 'contracts/ must be a directory');
});

test('web/ exists and is a directory', () => {
  assert.ok(existsSync(WEB_DIR), `web/ must exist at ${WEB_DIR}`);
  const s = statSync(WEB_DIR);
  assert.ok(s.isDirectory(), 'web/ must be a directory');
});

test('contracts/.gitkeep exists and is a regular file', () => {
  assert.ok(existsSync(CONTRACTS_GITKEEP), `contracts/.gitkeep must exist at ${CONTRACTS_GITKEEP}`);
  const s = statSync(CONTRACTS_GITKEEP);
  assert.ok(s.isFile(), 'contracts/.gitkeep must be a regular file');
});

test('web/.gitkeep exists and is a regular file', () => {
  assert.ok(existsSync(WEB_GITKEEP), `web/.gitkeep must exist at ${WEB_GITKEEP}`);
  const s = statSync(WEB_GITKEEP);
  assert.ok(s.isFile(), 'web/.gitkeep must be a regular file');
});
