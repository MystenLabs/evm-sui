// T-003 — AC-1.3
// Asserts pnpm-workspace.yaml has a `packages` list equal to exactly {contracts, web}.
// Uses an ad-hoc tolerant YAML parser (no `yaml` npm dependency) because the contract is sealed
// and AC-1.5 does not list `yaml` as a required dep. pnpm-workspace.yaml has a fixed, simple shape
// so a regex-based parser suffices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const WS_PATH = path.join(REPO_ROOT, 'pnpm-workspace.yaml');

function parsePackagesList(content) {
  const lines = content.split(/\r?\n/);
  // Find a line matching `packages:` at the start (allow optional leading whitespace)
  let i = -1;
  for (let idx = 0; idx < lines.length; idx++) {
    if (/^\s*packages\s*:/.test(lines[idx])) {
      i = idx;
      break;
    }
  }
  if (i === -1) return null;

  const header = lines[i];
  // Inline flow form: packages: ["contracts", "web"]
  const flowMatch = header.match(/packages\s*:\s*\[(.*)\]\s*$/);
  if (flowMatch) {
    const inner = flowMatch[1];
    const entries = inner
      .split(',')
      .map((e) => e.trim().replace(/^["']|["']$/g, ''))
      .filter((e) => e.length > 0);
    return entries;
  }

  // Block list form. Collect subsequent indented lines until non-indented or blank-then-non-indented.
  const collected = [];
  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j];
    if (line.trim().length === 0) continue; // skip blank lines
    if (!/^\s+/.test(line)) break; // non-indented = end of block
    // Strip leading whitespace + optional "- " + surrounding quotes
    const entry = line
      .replace(/^\s+/, '')
      .replace(/^-\s*/, '')
      .replace(/^["']|["']$/g, '')
      .trim();
    if (entry.length > 0) collected.push(entry);
  }
  return collected;
}

test('pnpm-workspace.yaml exists and is non-empty', () => {
  assert.ok(existsSync(WS_PATH), `pnpm-workspace.yaml must exist at ${WS_PATH}`);
  const content = readFileSync(WS_PATH, 'utf8');
  assert.ok(content.length > 0, 'pnpm-workspace.yaml must not be empty');
});

test('pnpm-workspace.yaml packages list equals {contracts, web}', () => {
  const content = readFileSync(WS_PATH, 'utf8');
  const entries = parsePackagesList(content);
  assert.ok(entries !== null, 'pnpm-workspace.yaml must declare a `packages:` key');
  const actual = new Set(entries);
  const expected = new Set(['contracts', 'web']);
  assert.strictEqual(
    actual.size,
    expected.size,
    `packages must have exactly ${expected.size} entries; got ${actual.size}: ${JSON.stringify([...actual])}`,
  );
  for (const e of expected) {
    assert.ok(actual.has(e), `packages must include "${e}". Got: ${JSON.stringify([...actual])}`);
  }
});
