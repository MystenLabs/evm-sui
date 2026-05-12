// T-008 — AC-3.8: the five generated PNGs are byte-distinct (5 unique sha256 hashes).
//
// File name prefix 'z-' ensures this runs after generate-assets-runs.test.mjs which
// produces the five PNGs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'assets');
const INDICES = [1, 2, 3, 4, 5];

async function sha256OfFile(p) {
  const buf = await readFile(p);
  return createHash('sha256').update(buf).digest('hex');
}

test('the five generated PNGs are byte-distinct (five unique sha256 hashes)', async () => {
  const pairs = [];
  for (const i of INDICES) {
    const p = path.join(ASSETS_DIR, `nft-${i}.png`);
    let h;
    try {
      h = await sha256OfFile(p);
    } catch (err) {
      assert.fail(
        `Precondition failed: ${p} must exist (generate-assets-runs.test.mjs should have produced it). readFile error: ${err && err.message}`,
      );
    }
    pairs.push([`nft-${i}.png`, h]);
  }

  const hashes = pairs.map(([, h]) => h);
  const uniq = new Set(hashes);
  if (uniq.size !== 5) {
    // Build a helpful failure message naming colliding pairs.
    const byHash = new Map();
    for (const [name, h] of pairs) {
      if (!byHash.has(h)) byHash.set(h, []);
      byHash.get(h).push(name);
    }
    const collisions = [];
    for (const [h, names] of byHash.entries()) {
      if (names.length > 1) {
        collisions.push(`${names.join(' and ')} share hash ${h}`);
      }
    }
    const detail = pairs.map(([n, h]) => `${n}=${h}`).join('\n  ');
    assert.fail(
      `Expected 5 distinct sha256 hashes across nft-1..5.png; got ${uniq.size} unique value(s).\nCollisions:\n  ${collisions.join('\n  ')}\nAll hashes:\n  ${detail}`,
    );
  }
  assert.strictEqual(uniq.size, 5);
});
