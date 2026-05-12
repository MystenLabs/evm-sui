// T-004 — AC-1.4
// Asserts root package.json has the required top-level fields and script placeholders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');

const REQUIRED_SCRIPT_KEYS = [
  'dev:chain',
  'seed:walrus',
  'deploy:local',
  'extract-abi',
  'dev:web',
  'lint',
  'format',
  'gen:assets',
];

function loadPkg() {
  const raw = readFileSync(PKG_PATH, 'utf8');
  return JSON.parse(raw);
}

test('package.json: name is a non-empty string', () => {
  const pkg = loadPkg();
  assert.strictEqual(typeof pkg.name, 'string', 'pkg.name must be a string');
  assert.ok(pkg.name.length > 0, 'pkg.name must be non-empty');
});

test('package.json: private === true', () => {
  const pkg = loadPkg();
  assert.strictEqual(pkg.private, true, 'pkg.private must be the boolean true');
});

test('package.json: packageManager matches pnpm@10.x.y', () => {
  const pkg = loadPkg();
  assert.strictEqual(typeof pkg.packageManager, 'string', 'pkg.packageManager must be a string');
  assert.ok(
    /^pnpm@10\.[0-9]+\.[0-9]+$/.test(pkg.packageManager),
    `pkg.packageManager must match /^pnpm@10\\.[0-9]+\\.[0-9]+$/. Got: ${JSON.stringify(pkg.packageManager)}`,
  );
});

test('package.json: engines.node === ">=22"', () => {
  const pkg = loadPkg();
  assert.ok(pkg.engines && typeof pkg.engines === 'object', 'pkg.engines must be an object');
  assert.strictEqual(pkg.engines.node, '>=22', 'pkg.engines.node must equal ">=22"');
});

test('package.json: scripts is a non-null object', () => {
  const pkg = loadPkg();
  assert.strictEqual(typeof pkg.scripts, 'object', 'pkg.scripts must be an object');
  assert.notStrictEqual(pkg.scripts, null, 'pkg.scripts must not be null');
});

test('package.json: required script placeholders are non-empty strings', async (t) => {
  const pkg = loadPkg();
  for (const key of REQUIRED_SCRIPT_KEYS) {
    await t.test(`scripts["${key}"] is a non-empty string`, () => {
      assert.strictEqual(
        typeof pkg.scripts[key],
        'string',
        `scripts["${key}"] must be a string`,
      );
      assert.ok(
        pkg.scripts[key].trim().length > 0,
        `scripts["${key}"] must be a non-empty (trimmed) string. Got: ${JSON.stringify(pkg.scripts[key])}`,
      );
    });
  }
});
