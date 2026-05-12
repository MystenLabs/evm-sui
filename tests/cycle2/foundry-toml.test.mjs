// T-001 — AC-2.1
// Asserts contracts/foundry.toml exists and [profile.default] has the required keys.
//
// IMPORTANT: we deliberately avoid adding a TOML parser dependency (the contract Files list
// does not allow it). We hand-roll a tolerant scanner that handles the small grammar we need:
// - section headers like '[profile.default]'
// - 'key = value' lines with inline '#' comments (only when not inside a quoted string)
// - quoted string values ("..." or '...')
// - boolean literals (true / false)
// - integer literals
// - single-line arrays of strings like ["lib"]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FOUNDRY_TOML = path.join(REPO_ROOT, 'contracts', 'foundry.toml');

function stripInlineComment(line) {
  // Strip a '#' comment but only when '#' is outside a quoted string.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '#' && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function parseTolerantToml(text) {
  const sections = Object.create(null); // section -> { key: rawValue }
  let current = null;
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = stripInlineComment(rawLine).trim();
    if (line === '') continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      current = sectionMatch[1].trim();
      if (!sections[current]) sections[current] = Object.create(null);
      continue;
    }
    if (current == null) continue;
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!kv) continue;
    sections[current][kv[1]] = kv[2].trim();
  }
  return sections;
}

function parseStringLiteral(raw) {
  if (raw == null) return null;
  const m = raw.match(/^(?:"([^"]*)"|'([^']*)')\s*$/);
  if (!m) return null;
  return m[1] != null ? m[1] : m[2];
}

function parseBoolLiteral(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

function parseIntegerLiteral(raw) {
  if (raw == null) return null;
  if (!/^-?\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

function parseStringArrayLiteral(raw) {
  if (raw == null) return null;
  const m = raw.match(/^\[\s*(.*?)\s*\]\s*$/);
  if (!m) return null;
  const inner = m[1].trim();
  if (inner === '') return [];
  const items = inner.split(',').map((s) => s.trim()).filter((s) => s !== '');
  const out = [];
  for (const item of items) {
    const s = parseStringLiteral(item);
    if (s == null) return null;
    out.push(s);
  }
  return out;
}

let text;
let sections;
let def;

test('foundry.toml exists and is non-empty', async () => {
  text = await readFile(FOUNDRY_TOML, 'utf8');
  assert.ok(text.length > 0, `${FOUNDRY_TOML} must be non-empty`);
  sections = parseTolerantToml(text);
  assert.ok(sections['profile.default'], `[profile.default] section must exist in ${FOUNDRY_TOML}`);
  def = sections['profile.default'];
});

test('[profile.default] src = "src"', async () => {
  if (!def) {
    text = await readFile(FOUNDRY_TOML, 'utf8');
    sections = parseTolerantToml(text);
    def = sections['profile.default'] || {};
  }
  const v = parseStringLiteral(def.src);
  assert.strictEqual(v, 'src', `expected src = "src", got raw value: ${def.src}`);
});

test('[profile.default] out = "out"', async () => {
  if (!def) {
    text = await readFile(FOUNDRY_TOML, 'utf8');
    sections = parseTolerantToml(text);
    def = sections['profile.default'] || {};
  }
  const v = parseStringLiteral(def.out);
  assert.strictEqual(v, 'out', `expected out = "out", got raw value: ${def.out}`);
});

test('[profile.default] libs = ["lib"]', async () => {
  if (!def) {
    text = await readFile(FOUNDRY_TOML, 'utf8');
    sections = parseTolerantToml(text);
    def = sections['profile.default'] || {};
  }
  const v = parseStringArrayLiteral(def.libs);
  assert.deepStrictEqual(v, ['lib'], `expected libs = ["lib"], got raw value: ${def.libs}`);
});

test('[profile.default] solc or solc_version = "0.8.28"', async () => {
  if (!def) {
    text = await readFile(FOUNDRY_TOML, 'utf8');
    sections = parseTolerantToml(text);
    def = sections['profile.default'] || {};
  }
  const solc = parseStringLiteral(def.solc);
  const solcVersion = parseStringLiteral(def.solc_version);
  const ok = solc === '0.8.28' || solcVersion === '0.8.28';
  assert.ok(
    ok,
    `expected solc = "0.8.28" or solc_version = "0.8.28"; got solc raw=${def.solc} solc_version raw=${def.solc_version}`,
  );
});

test('[profile.default] optimizer = true', async () => {
  if (!def) {
    text = await readFile(FOUNDRY_TOML, 'utf8');
    sections = parseTolerantToml(text);
    def = sections['profile.default'] || {};
  }
  const v = parseBoolLiteral(def.optimizer);
  assert.strictEqual(v, true, `expected optimizer = true, got raw value: ${def.optimizer}`);
});

test('[profile.default] optimizer_runs is integer >= 200', async () => {
  if (!def) {
    text = await readFile(FOUNDRY_TOML, 'utf8');
    sections = parseTolerantToml(text);
    def = sections['profile.default'] || {};
  }
  const v = parseIntegerLiteral(def.optimizer_runs);
  assert.ok(v != null, `expected optimizer_runs to be an integer literal, got raw value: ${def.optimizer_runs}`);
  assert.ok(v >= 200, `expected optimizer_runs >= 200, got ${v}`);
});

test('[profile.default] via_ir = true', async () => {
  if (!def) {
    text = await readFile(FOUNDRY_TOML, 'utf8');
    sections = parseTolerantToml(text);
    def = sections['profile.default'] || {};
  }
  const v = parseBoolLiteral(def.via_ir);
  assert.strictEqual(v, true, `expected via_ir = true, got raw value: ${def.via_ir}`);
});
