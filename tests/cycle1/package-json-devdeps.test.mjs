// T-005 — AC-1.5
// Asserts root package.json devDependencies contains the required entries (non-empty strings).
// Does NOT pin versions; resolvability is covered by T-009.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');

const REQUIRED_DEV_DEPS = [
  'tsx',
  'typescript',
  'prettier',
  'prettier-plugin-solidity',
  'solhint',
];

function loadPkg() {
  const raw = readFileSync(PKG_PATH, 'utf8');
  return JSON.parse(raw);
}

test('package.json: devDependencies is a non-null object', () => {
  const pkg = loadPkg();
  assert.ok(
    pkg.devDependencies && typeof pkg.devDependencies === 'object',
    'pkg.devDependencies must be a non-null object',
  );
});

test('package.json: required devDependencies are present with non-empty version strings', async (t) => {
  const pkg = loadPkg();
  for (const dep of REQUIRED_DEV_DEPS) {
    await t.test(`devDependencies["${dep}"] is present and non-empty`, () => {
      assert.ok(
        dep in pkg.devDependencies,
        `devDependencies must contain "${dep}". Got keys: ${JSON.stringify(Object.keys(pkg.devDependencies || {}))}`,
      );
      assert.strictEqual(
        typeof pkg.devDependencies[dep],
        'string',
        `devDependencies["${dep}"] must be a string`,
      );
      assert.ok(
        pkg.devDependencies[dep].trim().length > 0,
        `devDependencies["${dep}"] must be a non-empty (trimmed) string. Got: ${JSON.stringify(pkg.devDependencies[dep])}`,
      );
    });
  }
});
