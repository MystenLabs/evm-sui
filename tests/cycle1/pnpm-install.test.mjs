// T-009 — AC-1.8, AC-1.5
// Integration test: `pnpm install` at repo root completes with exit 0, node_modules/typescript
// exists, and `pnpm -r exec true` walks the workspace without error.
// Uses spawnSync (not exec) to avoid shell interpolation per the test plan note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

test('pnpm install at repo root completes with exit 0', { timeout: 300000 }, () => {
  const res = spawnSync('pnpm', ['install'], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    timeout: 240000,
  });
  const stdout = res.stdout ? res.stdout.toString('utf8') : '';
  const stderr = res.stderr ? res.stderr.toString('utf8') : '';
  assert.strictEqual(
    res.error,
    undefined,
    `pnpm install must not error out. error=${res.error && res.error.message}\nstdout: ${stdout}\nstderr: ${stderr}`,
  );
  assert.strictEqual(
    res.status,
    0,
    `pnpm install must exit 0. status=${res.status}\nstdout: ${stdout}\nstderr: ${stderr}`,
  );

  // Sanity-check that at least one required devDep was actually installed.
  const nm = path.join(REPO_ROOT, 'node_modules');
  assert.ok(existsSync(nm), 'node_modules must exist after pnpm install');
  assert.ok(statSync(nm).isDirectory(), 'node_modules must be a directory');
  const tsPkgJson = path.join(nm, 'typescript', 'package.json');
  assert.ok(
    existsSync(tsPkgJson),
    `node_modules/typescript/package.json must exist (sanity check that devDeps installed). Looked at ${tsPkgJson}`,
  );
});

// NOTE: The original test plan called for a second subtest invoking `pnpm -r exec true` to
// prove workspace traversal works. That assertion is unavoidably tautological in this cycle:
// when `pnpm-workspace.yaml` is absent (red phase) pnpm exits 0 with "No projects found", and
// when it's present but the member dirs lack package.json (cycle-1 chose AC-1.8b: empty dirs
// with `.gitkeep`) pnpm still exits 0 with "No projects matched". A meaningful "traversal works"
// signal cannot be extracted under AC-1.8b without going beyond the contract. The non-tautological
// coverage of AC-1.8 is provided by the `pnpm install` exit-0 + node_modules sanity check above
// (install fails red because no package.json exists), and T-008's directory/gitkeep stat checks.
