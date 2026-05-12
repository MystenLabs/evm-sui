// T-002 — AC-3.2: sharp is in devDependencies
// T-003 — AC-3.3: scripts['gen:assets'] === 'tsx scripts/generate-assets.ts'
// Both inspect root package.json; separate subtests so failures point to the
// right concern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');

function loadPkg() {
  const raw = readFileSync(PKG_PATH, 'utf8');
  return JSON.parse(raw);
}

test('package.json has sharp in devDependencies', () => {
  const pkg = loadPkg();
  assert.ok(
    pkg.devDependencies && typeof pkg.devDependencies === 'object',
    `pkg.devDependencies must be a non-null object. Got: ${JSON.stringify(pkg.devDependencies)}`,
  );
  const presentKeys = Object.keys(pkg.devDependencies);
  assert.strictEqual(
    typeof pkg.devDependencies.sharp,
    'string',
    `pkg.devDependencies.sharp must be a string version specifier. Got value=${JSON.stringify(
      pkg.devDependencies.sharp,
    )}. Keys present in devDependencies: ${JSON.stringify(presentKeys)}`,
  );
});

test('package.json scripts["gen:assets"] is "tsx scripts/generate-assets.ts"', () => {
  const pkg = loadPkg();
  assert.ok(
    pkg.scripts && typeof pkg.scripts === 'object',
    `pkg.scripts must be a non-null object. Got: ${JSON.stringify(pkg.scripts)}`,
  );
  const expected = 'tsx scripts/generate-assets.ts';
  assert.strictEqual(
    pkg.scripts['gen:assets'],
    expected,
    `pkg.scripts["gen:assets"] must equal ${JSON.stringify(expected)} verbatim (replacing the Cycle 1 echo placeholder). Got: ${JSON.stringify(pkg.scripts['gen:assets'])}`,
  );
});
