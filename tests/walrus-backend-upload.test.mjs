// Source-grep AC tests for the backend-Walrus upload feature (issue #1).
// Convention matches tests/v2-cycle3/walrus-upload.test.mjs: regex assertions
// on file contents, not behavior tests. Run with:
//   node --test tests/walrus-backend-upload.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function read(rel) {
  const p = path.join(REPO_ROOT, rel);
  assert.ok(existsSync(p), `${p} must exist`);
  return readFileSync(p, 'utf8');
}

// ───── Backend handler ──────────────────────────────────────────────────────

test('handler.ts exports handleWalrusUpload, error classes, and cap constant', () => {
  const src = read('web/app/api/walrus/upload/handler.ts');
  assert.match(src, /export\s+(?:async\s+)?function\s+handleWalrusUpload\s*\(/);
  assert.match(src, /export\s+class\s+UploadTooLargeError\b/);
  assert.match(src, /export\s+class\s+EmptyUploadError\b/);
  assert.match(src, /export\s+const\s+MAX_UPLOAD_BYTES\b/);
  assert.match(src, /export\s+const\s+STORAGE_EPOCHS\b/);
});

test('handler.ts validates emptiness and size cap before calling the SDK', () => {
  const src = read('web/app/api/walrus/upload/handler.ts');
  assert.match(src, /bytes\.length\s*===\s*0/);
  assert.match(src, /bytes\.length\s*>\s*MAX_UPLOAD_BYTES/);
});

test('handler.ts calls writeBlob with the canonical params and returns suiObjectId', () => {
  const src = read('web/app/api/walrus/upload/handler.ts');
  assert.match(src, /walrusClient\.walrus\.writeBlob/);
  assert.match(src, /epochs:\s*STORAGE_EPOCHS/);
  assert.match(src, /deletable:\s*false/);
  assert.match(src, /signer:\s*deps\.keypair/);
  assert.match(src, /suiObjectId:\s*blobObject\.id/);
});

// ───── Route shell ──────────────────────────────────────────────────────────

test('route.ts is Node runtime, dynamic, and carries the local-only disclaimer', () => {
  const src = read('web/app/api/walrus/upload/route.ts');
  assert.match(src, /export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
  assert.match(src, /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  assert.match(src, /export\s+const\s+maxDuration\s*=\s*\d+/);
  assert.match(src, /LOCAL-ONLY/i);
  assert.match(src, /Do NOT deploy/i);
});

test('route.ts wires the env loader and handler together', () => {
  const src = read('web/app/api/walrus/upload/route.ts');
  assert.match(src, /import\s+['"]server-only['"]/);
  assert.match(src, /getWalrusServer\s*\(\s*\)/);
  assert.match(src, /handleWalrusUpload\s*\(/);
  assert.match(src, /export\s+async\s+function\s+POST\s*\(/);
});

// ───── Env loader ───────────────────────────────────────────────────────────

test('walrus-server-env.ts is server-only and uses a lazy singleton', () => {
  const src = read('web/lib/walrus-server-env.ts');
  assert.match(src, /import\s+['"]server-only['"]/);
  assert.match(src, /let\s+cache\s*:/, 'must declare a module-scope cache');
  assert.match(src, /export\s+function\s+getWalrusServer\s*\(/);
});

test('walrus-server-env.ts validates ED25519 keypair and reads the three env vars', () => {
  const src = read('web/lib/walrus-server-env.ts');
  assert.match(src, /process\.env\.SUI_PRIVATE_KEY/);
  assert.match(src, /process\.env\.SUI_RPC_URL/);
  assert.match(src, /process\.env\.WALRUS_NETWORK/);
  assert.match(src, /decodeSuiPrivateKey/);
  assert.match(src, /ED25519/);
  assert.match(src, /Ed25519Keypair\.fromSecretKey/);
});

test('walrus-server-env.ts builds a SuiGrpcClient with the walrus() extension', () => {
  const src = read('web/lib/walrus-server-env.ts');
  assert.match(src, /import\s+\{\s*SuiGrpcClient\s*\}\s+from\s+['"]@mysten\/sui\/grpc['"]/);
  assert.match(src, /import\s+\{\s*walrus\s*\}\s+from\s+['"]@mysten\/walrus['"]/);
  assert.match(src, /\.\$extend\(walrus\(\)\)/);
});

// ───── Frontend dispatcher ──────────────────────────────────────────────────

test('walrus-upload-backend.ts POSTs to the local API route', () => {
  const src = read('web/lib/walrus-upload-backend.ts');
  assert.match(src, /export\s+(?:async\s+)?function\s+uploadWalrusBlobViaBackend\s*\(/);
  assert.match(src, /['"]\/api\/walrus\/upload['"]/);
  assert.match(src, /method:\s*['"]POST['"]/);
});

test('useMint.ts dispatches between publisher and backend at module load', () => {
  const src = read('web/hooks/useMint.ts');
  assert.match(src, /uploadWalrusBlobViaBackend/);
  assert.match(src, /NEXT_PUBLIC_WALRUS_UPLOAD_MODE/);
  assert.match(src, /['"]publisher['"]/);
});

test('UploadResult type is widened with optional suiObjectId on the shared interface', () => {
  const src = read('web/lib/walrus-upload.ts');
  assert.match(src, /suiObjectId\?\s*:\s*string/);
  assert.match(src, /status\?\s*:\s*UploadStatus/);
});

// ───── Env example ──────────────────────────────────────────────────────────

test('.env.local.example documents the four new vars', () => {
  const src = read('web/.env.local.example');
  assert.match(src, /NEXT_PUBLIC_WALRUS_UPLOAD_MODE/);
  assert.match(src, /SUI_PRIVATE_KEY/);
  assert.match(src, /SUI_RPC_URL/);
  assert.match(src, /WALRUS_NETWORK/);
});

// ───── Next.js config ───────────────────────────────────────────────────────

test('next.config.ts marks the Walrus SDK and its WASM as serverExternalPackages', () => {
  const src = read('web/next.config.ts');
  assert.match(src, /serverExternalPackages/);
  assert.match(src, /@mysten\/walrus/);
  assert.match(src, /@mysten\/walrus-wasm/);
});
