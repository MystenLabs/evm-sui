// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  LOCAL-ONLY DEMO ROUTE  ⚠️
//
// This route signs Sui transactions with a wallet loaded from SUI_PRIVATE_KEY
// and spends the operator's WAL on every successful request. There is NO
// authentication, NO rate-limiting, and NO shared-secret guard.
//
// Do NOT deploy this route to a public host — anyone reaching it can drain
// the wallet. Run only against a local dev server with a testnet keypair you
// control. See README.md → "Local-only operator mode" for setup.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

import {
  EmptyUploadError,
  MAX_UPLOAD_BYTES,
  UploadTooLargeError,
  handleWalrusUpload,
} from './handler';
import { getWalrusServer } from '@/lib/walrus-server-env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  let bytes: Uint8Array;
  try {
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX_UPLOAD_BYTES) {
      return jsonError(413, `Upload exceeds ${MAX_UPLOAD_BYTES} bytes`);
    }
    bytes = new Uint8Array(buf);
  } catch (err) {
    return jsonError(400, `Failed to read request body: ${describe(err)}`);
  }

  let server;
  try {
    server = getWalrusServer();
  } catch (err) {
    return jsonError(500, `Walrus backend not configured: ${describe(err)}`);
  }

  try {
    const result = await handleWalrusUpload(bytes, server);
    return Response.json(result);
  } catch (err) {
    if (err instanceof UploadTooLargeError || err instanceof EmptyUploadError) {
      return jsonError(err.status, err.message);
    }
    return jsonError(500, `Walrus upload failed: ${describe(err)}`);
  }
}

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

// Surface the error message but never the full Error object — stack traces
// can leak file paths or, worse, env-derived values from re-thrown errors.
function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
