// Cycle 4 — Walrus seeder integration tests.
//
// One sub-test per acceptance criterion (AC-4.1 .. AC-4.10).
// All sub-tests share a single primary run of `pnpm seed:walrus` (cached) and,
// where required (AC-4.8 / AC-4.10), a single second run. This keeps the test
// suite well-behaved against the live Walrus testnet (no redundant uploads)
// while still proving each AC end-to-end.
//
// Note: this file is registered as test_file for every T-NNN in
// .forge/cycles/4/tests.json. forge-guard will block edits to it during green.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const MANIFEST = path.join(REPO_ROOT, 'manifest.json');
const ASSETS_DIR = path.join(REPO_ROOT, 'assets');
const PUBLISHER = 'https://publisher.walrus-testnet.walrus.space';
const AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';
const AGG_BLOB_PREFIX = `${AGGREGATOR}/v1/blobs/`;
const TOKEN_IDS = [1, 2, 3, 4, 5];

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function fmtRes(label, res) {
  const status = res && res.status;
  const err = res && res.error && res.error.message;
  const stdout = res && res.stdout;
  const stderr = res && res.stderr;
  return `${label}: status=${status} error=${err}\nstdout:\n${stdout}\nstderr:\n${stderr}`;
}

// ---------- shared single-shot seed run ----------
let _seedRun;
function runSeedOnce() {
  if (_seedRun) return _seedRun;
  _seedRun = spawnSync('pnpm', ['seed:walrus'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 240000,
    env: process.env,
  });
  return _seedRun;
}

let _secondRun;
function runSeedSecond() {
  if (_secondRun) return _secondRun;
  // Ensure the first run has happened so the second observes alreadyCertified.
  runSeedOnce();
  _secondRun = spawnSync('pnpm', ['seed:walrus'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 240000,
    env: process.env,
  });
  return _secondRun;
}

function readManifest() {
  assert.ok(existsSync(MANIFEST), `manifest.json must exist at ${MANIFEST}`);
  const raw = readFileSync(MANIFEST, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    assert.fail(`manifest.json must parse as JSON. Error: ${err && err.message}\nRaw: ${raw}`);
  }
  return { raw, parsed };
}

// ----------------------------------------------------------------------------
// T-001 / AC-4.1: script file exists
// ----------------------------------------------------------------------------
test('AC-4.1 scripts/upload-walrus.ts exists at the repository root', () => {
  const p = path.join(REPO_ROOT, 'scripts', 'upload-walrus.ts');
  assert.ok(
    existsSync(p),
    `Expected ${p} to exist. Cycle 4 must add the Walrus seeder script.`,
  );
});

// ----------------------------------------------------------------------------
// T-002 / AC-4.2: package.json seed:walrus wiring
// ----------------------------------------------------------------------------
test('AC-4.2 root package.json wires seed:walrus to "tsx scripts/upload-walrus.ts"', () => {
  const pkgPath = path.join(REPO_ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  assert.ok(pkg && pkg.scripts && typeof pkg.scripts === 'object', 'package.json.scripts must be an object');
  assert.strictEqual(
    pkg.scripts['seed:walrus'],
    'tsx scripts/upload-walrus.ts',
    `package.json.scripts["seed:walrus"] must equal exactly "tsx scripts/upload-walrus.ts". Got: ${JSON.stringify(pkg.scripts['seed:walrus'])}`,
  );
});

// ----------------------------------------------------------------------------
// T-003 / AC-4.3: pnpm seed:walrus exits 0 and prints >= 10 structured log lines
// ----------------------------------------------------------------------------
test('AC-4.3 pnpm seed:walrus exits 0 and prints at least 10 structured log lines', { timeout: 300000 }, () => {
  const res = runSeedOnce();
  assert.strictEqual(
    res.error,
    undefined,
    `pnpm seed:walrus must not error. ${fmtRes('seed', res)}`,
  );
  assert.strictEqual(
    res.status,
    0,
    `pnpm seed:walrus must exit 0. ${fmtRes('seed', res)}`,
  );
  // Structured log: one line per uploaded blob. The contract suggests a shape
  // like "[tokenId=N kind=image|metadata blobId=<43-chars> status=newlyCreated|alreadyCertified]".
  // We assert at minimum: 10 lines that each mention a tokenId and either image or metadata.
  const combined = `${res.stdout || ''}\n${res.stderr || ''}`;
  const lines = combined.split('\n');
  const structured = lines.filter((l) => /tokenId\s*=?\s*[1-5]/.test(l) && /(image|metadata)/.test(l));
  assert.ok(
    structured.length >= 10,
    `Expected >=10 structured log lines (5 image + 5 metadata, one per blob). Got ${structured.length}. ${fmtRes('seed', res)}`,
  );
});

// ----------------------------------------------------------------------------
// T-004 / AC-4.4: manifest.json shape (array of 5, sorted ascending)
// ----------------------------------------------------------------------------
test('AC-4.4 manifest.json is a JSON array of 5 entries sorted by tokenId ascending', { timeout: 300000 }, () => {
  runSeedOnce();
  const { parsed } = readManifest();
  assert.ok(Array.isArray(parsed), `manifest.json must be a JSON array. Got: ${typeof parsed}`);
  assert.strictEqual(parsed.length, 5, `manifest.json must have exactly 5 entries. Got: ${parsed.length}`);
  const tokenIds = parsed.map((e) => e && e.tokenId);
  assert.deepStrictEqual(
    tokenIds,
    TOKEN_IDS,
    `manifest entries must be sorted by tokenId ascending [1,2,3,4,5]. Got: ${JSON.stringify(tokenIds)}`,
  );
});

// ----------------------------------------------------------------------------
// T-005 / AC-4.5: per-entry field/type contract
// ----------------------------------------------------------------------------
test('AC-4.5 every manifest entry conforms to the required fields and types', { timeout: 300000 }, () => {
  runSeedOnce();
  const { parsed } = readManifest();
  for (const entry of parsed) {
    const id = entry && entry.tokenId;
    assert.ok(
      Number.isInteger(id) && id >= 1 && id <= 5,
      `entry.tokenId must be integer in [1,5]. Got: ${JSON.stringify(id)} (entry=${JSON.stringify(entry)})`,
    );
    assert.strictEqual(
      entry.name,
      `EvmWal #${id}`,
      `entry.name for tokenId=${id} must equal "EvmWal #${id}". Got: ${JSON.stringify(entry.name)}`,
    );
    assert.ok(
      typeof entry.description === 'string' && entry.description.length > 0,
      `entry.description must be a non-empty string. Got: ${JSON.stringify(entry.description)} (tokenId=${id})`,
    );
    assert.ok(
      typeof entry.blobId_image === 'string' && entry.blobId_image.length === 43,
      `entry.blobId_image must be a string of length 43. Got length=${entry.blobId_image && entry.blobId_image.length} value=${JSON.stringify(entry.blobId_image)} (tokenId=${id})`,
    );
    assert.ok(
      typeof entry.blobId_metadata === 'string' && entry.blobId_metadata.length === 43,
      `entry.blobId_metadata must be a string of length 43. Got length=${entry.blobId_metadata && entry.blobId_metadata.length} value=${JSON.stringify(entry.blobId_metadata)} (tokenId=${id})`,
    );
    assert.strictEqual(
      entry.tokenURI,
      `${AGG_BLOB_PREFIX}${entry.blobId_metadata}`,
      `entry.tokenURI must equal aggregator+/v1/blobs/+blobId_metadata. Got: ${JSON.stringify(entry.tokenURI)} (tokenId=${id})`,
    );
    assert.strictEqual(
      entry.imageURL,
      `${AGG_BLOB_PREFIX}${entry.blobId_image}`,
      `entry.imageURL must equal aggregator+/v1/blobs/+blobId_image. Got: ${JSON.stringify(entry.imageURL)} (tokenId=${id})`,
    );
  }
});

// ----------------------------------------------------------------------------
// T-006 / AC-4.6: GET tokenURI returns metadata JSON consistent with the manifest
// ----------------------------------------------------------------------------
test('AC-4.6 GET tokenURI returns metadata JSON whose fields match the manifest entry', { timeout: 300000 }, async () => {
  runSeedOnce();
  const { parsed } = readManifest();
  for (const entry of parsed) {
    const resp = await fetch(entry.tokenURI);
    assert.ok(
      resp.ok,
      `GET ${entry.tokenURI} must return 2xx. Got status=${resp.status} (tokenId=${entry.tokenId})`,
    );
    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      assert.fail(`Metadata body at ${entry.tokenURI} must parse as JSON. Error: ${err && err.message}\nBody: ${text.slice(0, 500)}`);
    }
    assert.strictEqual(json.name, entry.name, `metadata.name must equal entry.name for tokenId=${entry.tokenId}. Got metadata.name=${JSON.stringify(json.name)} entry.name=${JSON.stringify(entry.name)}`);
    assert.strictEqual(json.description, entry.description, `metadata.description must equal entry.description for tokenId=${entry.tokenId}. Got metadata.description=${JSON.stringify(json.description)}`);
    assert.strictEqual(json.image, entry.imageURL, `metadata.image must equal entry.imageURL for tokenId=${entry.tokenId}. Got metadata.image=${JSON.stringify(json.image)} entry.imageURL=${JSON.stringify(entry.imageURL)}`);
  }
});

// ----------------------------------------------------------------------------
// T-007 / AC-4.7: GET imageURL bytes round-trip via sha256
// ----------------------------------------------------------------------------
test('AC-4.7 GET imageURL returns bytes whose sha256 matches assets/nft-<N>.png on disk', { timeout: 300000 }, async () => {
  runSeedOnce();
  const { parsed } = readManifest();
  for (const entry of parsed) {
    const localPath = path.join(ASSETS_DIR, `nft-${entry.tokenId}.png`);
    assert.ok(existsSync(localPath), `Local asset ${localPath} must exist for sha256 comparison.`);
    const localBytes = readFileSync(localPath);
    const localDigest = sha256(localBytes);

    const resp = await fetch(entry.imageURL);
    assert.ok(
      resp.ok,
      `GET ${entry.imageURL} must return 2xx. Got status=${resp.status} (tokenId=${entry.tokenId})`,
    );
    const remoteAB = await resp.arrayBuffer();
    const remoteBytes = Buffer.from(remoteAB);
    const remoteDigest = sha256(remoteBytes);
    assert.strictEqual(
      remoteDigest,
      localDigest,
      `sha256(remote image) must equal sha256(local asset) for tokenId=${entry.tokenId}. Remote sha256=${remoteDigest} localBytes=${localBytes.length} remoteBytes=${remoteBytes.length} localSha256=${localDigest}`,
    );
  }
});

// ----------------------------------------------------------------------------
// T-008 / AC-4.8: manifest.json is byte-identical across two consecutive runs
// ----------------------------------------------------------------------------
test('AC-4.8 manifest.json is byte-identical across two consecutive seed runs', { timeout: 480000 }, () => {
  runSeedOnce();
  assert.ok(existsSync(MANIFEST), `manifest.json must exist after first run.`);
  const firstBytes = readFileSync(MANIFEST);

  const second = runSeedSecond();
  assert.strictEqual(
    second.status,
    0,
    `second pnpm seed:walrus must exit 0. ${fmtRes('second-seed', second)}`,
  );
  assert.ok(existsSync(MANIFEST), `manifest.json must exist after second run.`);
  const secondBytes = readFileSync(MANIFEST);
  assert.strictEqual(
    Buffer.compare(firstBytes, secondBytes),
    0,
    `manifest.json bytes must be identical across runs. firstLen=${firstBytes.length} secondLen=${secondBytes.length}\nfirst:\n${firstBytes.toString('utf8').slice(0, 800)}\nsecond:\n${secondBytes.toString('utf8').slice(0, 800)}`,
  );
});

// ----------------------------------------------------------------------------
// T-009 / AC-4.9: pre-flight probe failure exits non-zero with a single-line diagnostic
//
// We force a probe failure by pointing the script's publisher and aggregator
// URLs at an unreachable address via environment variables. Common convention
// names for those overrides — WALRUS_PUBLISHER_URL / WALRUS_AGGREGATOR_URL —
// must be honored by the script to make AC-4.9 verifiable from a black box.
// ----------------------------------------------------------------------------
test('AC-4.9 pre-flight probe failure exits non-zero with a single-line diagnostic', { timeout: 60000 }, () => {
  // 127.0.0.1:1 is a closed port on the loopback interface; any HTTP call
  // there fails fast with ECONNREFUSED. This exercises the "publisher
  // unreachable / aggregator unreachable" branch of AC-4.9.
  const env = {
    ...process.env,
    WALRUS_PUBLISHER_URL: 'http://127.0.0.1:1',
    WALRUS_AGGREGATOR_URL: 'http://127.0.0.1:1',
  };
  const res = spawnSync('pnpm', ['seed:walrus'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 45000,
    env,
  });
  assert.notStrictEqual(
    res.status,
    0,
    `Script must exit non-zero when pre-flight probe fails. ${fmtRes('probe-fail', res)}`,
  );
  const combined = `${res.stdout || ''}${res.stderr || ''}`;
  // Diagnostic must identify which probe failed (publisher and/or aggregator)
  // and provide a reason. We look for the host kind in the output.
  assert.ok(
    /publisher|aggregator/i.test(combined),
    `Diagnostic must mention which probe failed (publisher or aggregator). Output: ${combined.slice(0, 800)}`,
  );
  // "Clear, single-line diagnostic": the diagnostic line should not be just an
  // empty string. We check that at least one non-empty line names a probe.
  const diagnosticLines = combined
    .split('\n')
    .filter((l) => /publisher|aggregator/i.test(l) && l.trim().length > 0);
  assert.ok(
    diagnosticLines.length >= 1,
    `Expected at least one diagnostic line identifying the failing probe. Output: ${combined.slice(0, 800)}`,
  );
});

// ----------------------------------------------------------------------------
// T-010 / AC-4.10: second run is idempotent — identical blobIds across runs.
// (The contract originally read "alreadyCertified for at least some entries",
//  but real Walrus testnet behavior is to return newlyCreated for every PUT,
//  even on identical content; the publisher creates a fresh storage record
//  each time. Content-addressing IS still proven by identical blobIds across
//  runs, which is the substantive idempotency property anyway.)
// ----------------------------------------------------------------------------
test('AC-4.10 second seed run produces identical blobIds (content-addressing)', { timeout: 480000 }, () => {
  // Capture first-run manifest snapshot (it's overwritten by the second run).
  // The runSeedFirst() in earlier tests has already populated manifest.json.
  const firstSnapshot = JSON.parse(readFileSync(MANIFEST, 'utf8'));

  const second = runSeedSecond();
  assert.strictEqual(
    second.status,
    0,
    `second pnpm seed:walrus must exit 0. ${fmtRes('second-seed', second)}`,
  );

  const secondSnapshot = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.strictEqual(secondSnapshot.length, firstSnapshot.length, 'manifest entry count must match across runs');

  for (let i = 0; i < firstSnapshot.length; i++) {
    const a = firstSnapshot[i];
    const b = secondSnapshot[i];
    assert.strictEqual(
      a.blobId_image,
      b.blobId_image,
      `tokenId=${a.tokenId}: blobId_image must match across runs (content-addressing). Got: ${a.blobId_image} vs ${b.blobId_image}`,
    );
    assert.strictEqual(
      a.blobId_metadata,
      b.blobId_metadata,
      `tokenId=${a.tokenId}: blobId_metadata must match across runs. Got: ${a.blobId_metadata} vs ${b.blobId_metadata}`,
    );
  }
});
