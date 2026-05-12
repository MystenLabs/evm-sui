// T-006 — AC-1.6
// Asserts tsconfig.base.json exists, is valid JSON, and compilerOptions has the required fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const TSCONFIG_PATH = path.join(REPO_ROOT, 'tsconfig.base.json');

function loadConfig() {
  const raw = readFileSync(TSCONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

test('tsconfig.base.json exists and parses as valid JSON', () => {
  assert.ok(existsSync(TSCONFIG_PATH), `tsconfig.base.json must exist at ${TSCONFIG_PATH}`);
  const cfg = loadConfig();
  assert.ok(typeof cfg === 'object' && cfg !== null, 'tsconfig.base.json must parse to an object');
});

test('tsconfig.base.json: compilerOptions is a non-null object', () => {
  const cfg = loadConfig();
  assert.ok(
    typeof cfg.compilerOptions === 'object' && cfg.compilerOptions !== null,
    'compilerOptions must be a non-null object',
  );
});

test('tsconfig.base.json: compilerOptions.strict === true', () => {
  const cfg = loadConfig();
  assert.strictEqual(cfg.compilerOptions.strict, true, 'compilerOptions.strict must be true');
});

test('tsconfig.base.json: compilerOptions.esModuleInterop === true', () => {
  const cfg = loadConfig();
  assert.strictEqual(
    cfg.compilerOptions.esModuleInterop,
    true,
    'compilerOptions.esModuleInterop must be true',
  );
});

test('tsconfig.base.json: compilerOptions.skipLibCheck === true', () => {
  const cfg = loadConfig();
  assert.strictEqual(
    cfg.compilerOptions.skipLibCheck,
    true,
    'compilerOptions.skipLibCheck must be true',
  );
});

test('tsconfig.base.json: compilerOptions.forceConsistentCasingInFileNames === true', () => {
  const cfg = loadConfig();
  assert.strictEqual(
    cfg.compilerOptions.forceConsistentCasingInFileNames,
    true,
    'compilerOptions.forceConsistentCasingInFileNames must be true',
  );
});

test('tsconfig.base.json: compilerOptions.moduleResolution is "bundler" or "node"', () => {
  const cfg = loadConfig();
  const v = cfg.compilerOptions.moduleResolution;
  assert.ok(
    ['bundler', 'node'].includes(v),
    `compilerOptions.moduleResolution must be "bundler" or "node". Got: ${JSON.stringify(v)}`,
  );
});
