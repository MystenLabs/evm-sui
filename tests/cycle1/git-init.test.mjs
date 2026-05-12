// T-010 — AC-1.9
// Asserts a git repo is initialised at the repo root with default branch `main`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const GIT_DIR = path.join(REPO_ROOT, '.git');

test('.git directory exists at repo root', () => {
  assert.ok(existsSync(GIT_DIR), `.git must exist at ${GIT_DIR}`);
  const s = statSync(GIT_DIR);
  assert.ok(s.isDirectory(), '.git must be a directory');
});

test('git symbolic-ref --short HEAD outputs "main"', () => {
  const res = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const stdout = res.stdout ?? '';
  const stderr = res.stderr ?? '';
  assert.strictEqual(
    res.status,
    0,
    `git symbolic-ref --short HEAD must exit 0. status=${res.status}\nstdout: ${stdout}\nstderr: ${stderr}`,
  );
  assert.strictEqual(
    stdout.trim(),
    'main',
    `git symbolic-ref --short HEAD must output "main". Got: ${JSON.stringify(stdout.trim())}`,
  );
});
