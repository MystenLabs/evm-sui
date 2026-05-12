/**
 * upload-walrus.ts — DEPRECATED for the v2 product flow.
 *
 * v2 lets any user mint their own NFT from the browser, so the pre-seed Node
 * script is no longer part of the default happy path. This file is retained
 * for two reasons:
 *
 *   1. It is the canonical Node-side reference for the Walrus publisher PUT
 *      shape (dual-shape response parse, EPOCHS=5 retention). The browser-side
 *      port lives at web/lib/walrus-upload.ts.
 *   2. It is still useful for offline regeneration of fixture data during
 *      local development.
 *
 * Pre-flight probes the Walrus testnet publisher and aggregator, uploads each
 * assets/nft-<N>.png (N=1..5) and associated metadata JSON blobs, round-trip
 * verifies both image bytes and metadata JSON, then atomically writes
 * manifest.json at the repository root.
 *
 * Invoked via: pnpm seed:walrus  (tsx scripts/upload-walrus.ts)
 *
 * Environment overrides:
 *   WALRUS_PUBLISHER_URL  — default: https://publisher.walrus-testnet.walrus.space
 *   WALRUS_AGGREGATOR_URL — default: https://aggregator.walrus-testnet.walrus.space
 */

import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_PUBLISHER  = 'https://publisher.walrus-testnet.walrus.space';
const DEFAULT_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';
const EPOCHS             = 5;
const TOKEN_COUNT        = 5;

const PUBLISHER_URL  = process.env.WALRUS_PUBLISHER_URL  ?? DEFAULT_PUBLISHER;
const AGGREGATOR_URL = process.env.WALRUS_AGGREGATOR_URL ?? DEFAULT_AGGREGATOR;

const REPO_ROOT  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'assets');

// ─── Types ───────────────────────────────────────────────────────────────────

/** Shape of a single resolved manifest entry. */
interface TokenEntry {
  tokenId:        number;
  name:           string;
  description:    string;
  blobId_image:   string;
  blobId_metadata: string;
  tokenURI:       string;
  imageURL:       string;
}

/** The two response shapes the Walrus publisher returns. */
interface WalrusUploadResponse {
  newlyCreated?:    { blobObject: { blobId: string } };
  alreadyCertified?: { blobId: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * preflightProbe()
 *
 * Pre: PUBLISHER_URL and AGGREGATOR_URL are set (from env or defaults).
 * Post: Returns normally if both endpoints are reachable and responding.
 *       Calls process.exit(1) with a clear single-line stderr diagnostic if
 *       either probe fails (network error, non-2xx HTTP, or bad JSON shape).
 *
 * The publisher probe uploads a tiny known constant byte-string to confirm
 * the endpoint accepts PUT /v1/blobs requests. The aggregator probe performs
 * a trivial GET against the root to verify TCP reachability.
 */
async function preflightProbe(): Promise<void> {
  // ── Publisher probe ──────────────────────────────────────────────────────
  // We PUT a tiny constant payload just to verify the endpoint is reachable
  // and responds with a recognisable Walrus JSON envelope.
  const probePayload = Buffer.from('forge-preflight-probe');
  let pubRes: Response;
  try {
    pubRes = await fetch(`${PUBLISHER_URL}/v1/blobs?epochs=${EPOCHS}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: probePayload,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`PREFLIGHT FAILED [publisher]: ${PUBLISHER_URL} — ${msg}\n`);
    process.exit(1);
  }

  if (!pubRes.ok) {
    process.stderr.write(
      `PREFLIGHT FAILED [publisher]: ${PUBLISHER_URL} returned HTTP ${pubRes.status} ${pubRes.statusText}\n`,
    );
    process.exit(1);
  }

  let pubJson: WalrusUploadResponse;
  try {
    pubJson = (await pubRes.json()) as WalrusUploadResponse;
  } catch (err) {
    process.stderr.write(`PREFLIGHT FAILED [publisher]: response body is not valid JSON — ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const probeBlobId = extractBlobId(pubJson);
  if (!probeBlobId) {
    process.stderr.write(
      `PREFLIGHT FAILED [publisher]: response JSON missing both ` +
      `newlyCreated.blobObject.blobId and alreadyCertified.blobId. ` +
      `Got: ${JSON.stringify(pubJson)}\n`,
    );
    process.exit(1);
  }

  // ── Aggregator probe ─────────────────────────────────────────────────────
  // Use the probe blobId we just got to check the aggregator is reachable.
  let aggRes: Response;
  try {
    aggRes = await fetch(`${AGGREGATOR_URL}/v1/blobs/${probeBlobId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`PREFLIGHT FAILED [aggregator]: ${AGGREGATOR_URL} — ${msg}\n`);
    process.exit(1);
  }

  // A 200 or even 404 (blob not yet indexed) is fine; we just need TCP success.
  // A network-level failure is caught above. Only reject on very unexpected statuses.
  if (aggRes.status >= 500) {
    process.stderr.write(
      `PREFLIGHT FAILED [aggregator]: ${AGGREGATOR_URL} returned HTTP ${aggRes.status} ${aggRes.statusText}\n`,
    );
    process.exit(1);
  }
}

/**
 * extractBlobId()
 *
 * Pre: `resp` is a parsed JSON object from the Walrus publisher.
 * Post: Returns the blobId string if present in either response shape,
 *       otherwise returns null.
 *
 * Handles both:
 *   { newlyCreated:    { blobObject: { blobId: "..." } } }
 *   { alreadyCertified: { blobId: "..." } }
 */
function extractBlobId(resp: WalrusUploadResponse): string | null {
  if (resp.newlyCreated?.blobObject?.blobId) {
    return resp.newlyCreated.blobObject.blobId;
  }
  if (resp.alreadyCertified?.blobId) {
    return resp.alreadyCertified.blobId;
  }
  return null;
}

/**
 * extractStatus()
 *
 * Pre: `resp` is a parsed JSON object from the Walrus publisher.
 * Post: Returns "newlyCreated" or "alreadyCertified" depending on which
 *       response shape was present. Returns "unknown" if neither matched.
 */
function extractStatus(resp: WalrusUploadResponse): string {
  if (resp.newlyCreated?.blobObject?.blobId) return 'newlyCreated';
  if (resp.alreadyCertified?.blobId) return 'alreadyCertified';
  return 'unknown';
}

/**
 * uploadBlob()
 *
 * Pre: `bytes` is the raw binary content to upload; `mime` is the
 *      Content-Type header value; PUBLISHER_URL is reachable (proven by
 *      preflightProbe).
 * Post: Returns { blobId, status } where `status` is "newlyCreated" or
 *       "alreadyCertified". Throws on network error, non-2xx HTTP response,
 *       or unrecognised JSON shape.
 */
async function uploadBlob(bytes: Buffer, mime: string): Promise<{ blobId: string; status: string }> {
  const res = await fetch(`${PUBLISHER_URL}/v1/blobs?epochs=${EPOCHS}`, {
    method: 'PUT',
    headers: { 'Content-Type': mime },
    body: bytes,
  });

  if (!res.ok) {
    throw new Error(`Publisher PUT failed with HTTP ${res.status} ${res.statusText}`);
  }

  let json: WalrusUploadResponse;
  try {
    json = (await res.json()) as WalrusUploadResponse;
  } catch (err) {
    throw new Error(`Publisher response is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const blobId = extractBlobId(json);
  if (!blobId) {
    throw new Error(
      `Publisher response missing blobId in both newlyCreated and alreadyCertified shapes. ` +
      `Got: ${JSON.stringify(json)}`,
    );
  }

  return { blobId, status: extractStatus(json) };
}

/**
 * fetchBytes()
 *
 * Pre: `url` is a fully-qualified HTTP(S) URL pointing at a Walrus aggregator
 *      blob endpoint. The aggregator is reachable (proven by preflightProbe).
 * Post: Returns the response body as a Buffer. Throws on network error or
 *       non-2xx HTTP response.
 */
async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} returned HTTP ${res.status} ${res.statusText}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * fetchJson()
 *
 * Pre: `url` is a fully-qualified HTTP(S) URL that should return a JSON body.
 * Post: Returns the parsed JSON object. Throws on network error, non-2xx
 *       response, or body that cannot be parsed as JSON.
 */
async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} returned HTTP ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Response from ${url} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * verifyRoundTrip()
 *
 * Pre: `entry` is a fully-populated TokenEntry with valid imageURL/tokenURI;
 *      `originalBytes` is the raw PNG bytes read from disk for this token.
 * Post: Throws if:
 *   - Image bytes from aggregator do not match originalBytes (SHA-256 mismatch).
 *   - Metadata JSON from aggregator has mismatched name, description, or image.
 */
async function verifyRoundTrip(entry: TokenEntry, originalBytes: Buffer): Promise<void> {
  // ── Image round-trip ─────────────────────────────────────────────────────
  const remoteImageBytes = await fetchBytes(entry.imageURL);
  if (Buffer.compare(remoteImageBytes, originalBytes) !== 0) {
    const localDigest  = createHash('sha256').update(originalBytes).digest('hex');
    const remoteDigest = createHash('sha256').update(remoteImageBytes).digest('hex');
    throw new Error(
      `Image round-trip byte mismatch for tokenId=${entry.tokenId}. ` +
      `local sha256=${localDigest} remote sha256=${remoteDigest}`,
    );
  }

  // ── Metadata round-trip ──────────────────────────────────────────────────
  const meta = await fetchJson(entry.tokenURI);
  if (meta['name'] !== entry.name) {
    throw new Error(`Metadata name mismatch for tokenId=${entry.tokenId}: expected "${entry.name}" got "${meta['name']}"`);
  }
  if (meta['description'] !== entry.description) {
    throw new Error(`Metadata description mismatch for tokenId=${entry.tokenId}`);
  }
  if (meta['image'] !== entry.imageURL) {
    throw new Error(`Metadata image mismatch for tokenId=${entry.tokenId}: expected "${entry.imageURL}" got "${meta['image']}"`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Step 1: Pre-flight probes.
  await preflightProbe();

  const entries: TokenEntry[] = [];

  for (let tokenId = 1; tokenId <= TOKEN_COUNT; tokenId++) {
    const assetPath   = path.join(ASSETS_DIR, `nft-${tokenId}.png`);
    const imageBytes  = await readFile(assetPath);

    // Step 2: Upload image blob.
    const { blobId: blobId_image, status: imgStatus } = await uploadBlob(imageBytes, 'image/png');
    const imageURL = `${AGGREGATOR_URL}/v1/blobs/${blobId_image}`;
    process.stdout.write(
      `[tokenId=${tokenId} kind=image blobId=${blobId_image} status=${imgStatus}]\n`,
    );

    // Step 3: Build metadata JSON.
    const name        = `EvmWal #${tokenId}`;
    const description = `EvmWal NFT token #${tokenId}. A unique on-chain artwork from the EvmWal collection.`;
    const metaObj     = { name, description, image: imageURL };
    const metaBytes   = Buffer.from(JSON.stringify(metaObj));

    // Step 4: Upload metadata blob.
    const { blobId: blobId_metadata, status: metaStatus } = await uploadBlob(metaBytes, 'application/json');
    const tokenURI = `${AGGREGATOR_URL}/v1/blobs/${blobId_metadata}`;
    process.stdout.write(
      `[tokenId=${tokenId} kind=metadata blobId=${blobId_metadata} status=${metaStatus}]\n`,
    );

    const entry: TokenEntry = {
      tokenId,
      name,
      description,
      blobId_image,
      blobId_metadata,
      tokenURI,
      imageURL,
    };

    // Step 5: Round-trip verify.
    await verifyRoundTrip(entry, imageBytes);

    entries.push(entry);
  }

  // Step 6: Sort by tokenId ascending (already in order, but be explicit).
  entries.sort((a, b) => a.tokenId - b.tokenId);

  // Step 7: Atomically write manifest.json.
  const manifestPath    = path.join(REPO_ROOT, 'manifest.json');
  const manifestTmpPath = path.join(REPO_ROOT, 'manifest.json.tmp');
  const manifestContent = JSON.stringify(entries, null, 2) + '\n';

  await writeFile(manifestTmpPath, manifestContent, 'utf8');
  await rename(manifestTmpPath, manifestPath);

  process.stdout.write(`manifest.json written to ${manifestPath}\n`);
}

// ─── isMain guard ────────────────────────────────────────────────────────────

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `upload-walrus failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}
