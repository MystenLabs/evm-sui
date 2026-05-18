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

import { getWalrusServer } from '@/lib/walrus-server-env';
import { EmptyUploadError, MAX_UPLOAD_BYTES, UploadTooLargeError, handleWalrusUpload } from './handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Hosts that the route accepts requests from. Anything else is treated as a
// cross-origin probe — `text/plain` and similar CORS-safelisted MIMEs would
// otherwise let any other localhost tab POST here and drain operator WAL.
const ALLOWED_ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1']);

export async function POST(req: Request): Promise<Response> {
  // Defense in depth: the route exists only as a local-only operator helper
  // (see header comment). Refuse to run if the build is shipped to a prod
  // host so a forgotten NEXT_PUBLIC_WALRUS_UPLOAD_MODE doesn't quietly turn
  // into a public drain endpoint.
  if (process.env.NODE_ENV === 'production') {
    return jsonError(403, 'Backend Walrus uploads are disabled in production builds.');
  }

  const origin = req.headers.get('origin');
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).hostname;
    } catch {
      return jsonError(403, 'Origin is not a valid URL');
    }
    if (!ALLOWED_ORIGIN_HOSTS.has(host)) {
      return jsonError(403, 'Cross-origin requests are not allowed');
    }
  }

  // Pre-check Content-Length so a multi-GB POST is rejected before it's
  // buffered. handler.ts still re-checks bytes.length for hosts that omit
  // or lie about the header.
  const declared = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return jsonError(413, `Upload size ${declared} exceeds limit of ${MAX_UPLOAD_BYTES} bytes`);
  }

  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    const result = await handleWalrusUpload(bytes, getWalrusServer());
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

// Returns the error's `message` — never the full Error (stack traces include
// file paths). The route is gated to non-production builds above, so a
// dev-visible SDK message (which may embed RPC URLs or object ids) is
// acceptable here; reuse with caution if you ever drop the NODE_ENV guard.
function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
