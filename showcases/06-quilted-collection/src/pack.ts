/**
 * `pack` — wrap `walrus store-quilt` for an NFT drop directory.
 *
 * Walks the input drop directory, builds the file-glob the walrus CLI
 * expects (`<dir>/**\/*.{json,png}` etc.), spawns the CLI, and parses the
 * quiltId out of its stdout. The resulting quiltId is what the
 * QuiltedCollection contract is deployed with.
 *
 * Required: `walrus` CLI on PATH (https://docs.wal.app/usage/setup.html).
 *
 * Required env:
 *   - WALRUS_EPOCHS   default: 200 (long-lived; drops should outlive their hype cycle)
 *
 * Usage:
 *   tsx src/pack.ts <drop-dir>
 *   tsx src/pack.ts --dry-run <drop-dir>
 *
 * Example layout for <drop-dir>:
 *   drop/
 *   ├── 1.json
 *   ├── 1.png
 *   ├── 2.json
 *   ├── 2.png
 *   └── ...
 *
 * Each `<tokenId>.json` must reference its `<tokenId>.png` in its `image`
 * field via the aggregator-by-quilt-id URL form (see ../README.md).
 */

import { spawnSync } from "node:child_process";
import { existsSync, statSync, readdirSync } from "node:fs";
import path from "node:path";

interface PackOptions {
  dropDir: string;
  epochs: number;
  dryRun: boolean;
}

function listDropFiles(dropDir: string): string[] {
  const entries = readdirSync(dropDir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (e.name.endsWith(".json") || e.name.endsWith(".png")) {
      files.push(path.join(dropDir, e.name));
    }
  }
  return files.sort();
}

/**
 * Parse the walrus CLI stdout for a quiltId. The CLI's output format has
 * shifted across versions; we accept multiple patterns:
 *   - `quiltId: <b64url>`     (key-value line)
 *   - `quilt id: <b64url>`    (spaced key)
 *   - a JSON envelope with `{"quiltId": "<b64url>"}`
 */
export function parseQuiltId(stdout: string): string {
  const trimmed = stdout.trim();

  // JSON envelope first — most stable.
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object") {
        const candidates = [
          (parsed as Record<string, unknown>)["quiltId"],
          (parsed as Record<string, unknown>)["quilt_id"],
          (parsed as Record<string, unknown>)["id"],
        ];
        for (const c of candidates) {
          if (typeof c === "string" && c.length > 0) return c;
        }
      }
    } catch {
      // fall through to line-based parse
    }
  }

  // Line-based fallback.
  for (const line of trimmed.split(/\r?\n/)) {
    const m = line.match(/quilt[\s_]?id\s*[:=]\s*([A-Za-z0-9_-]{20,})/i);
    if (m) return m[1];
  }

  throw new Error(`could not find quiltId in walrus CLI output:\n${trimmed}`);
}

function pack(opts: PackOptions): void {
  if (!existsSync(opts.dropDir)) {
    throw new Error(`drop directory not found: ${opts.dropDir}`);
  }
  const st = statSync(opts.dropDir);
  if (!st.isDirectory()) {
    throw new Error(`not a directory: ${opts.dropDir}`);
  }
  const files = listDropFiles(opts.dropDir);
  if (files.length === 0) {
    throw new Error(`no .json or .png files under ${opts.dropDir}`);
  }
  console.log(`[pack] ${files.length} files from ${opts.dropDir} (epochs=${opts.epochs})`);

  const args = ["store-quilt", "--epochs", String(opts.epochs), "--paths", ...files];

  if (opts.dryRun) {
    console.log(`[dry-run] would invoke: walrus ${args.join(" ")}`);
    return;
  }

  const result = spawnSync("walrus", args, { encoding: "utf8" });
  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "walrus CLI not found on PATH. Install per https://docs.wal.app/usage/setup.html",
      );
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`walrus store-quilt failed (exit ${result.status}):\n${result.stderr}`);
  }

  const quiltId = parseQuiltId(result.stdout);
  console.log(`[pack] quiltId: ${quiltId}`);
  console.log(`[pack] deploy with:`);
  console.log(`  QC_QUILT_ID=${quiltId} pnpm deploy`);
}

function main(): void {
  const argv = process.argv.slice(2);
  const dryRun = argv[0] === "--dry-run";
  const positional = dryRun ? argv.slice(1) : argv;
  const [dropDir] = positional;
  if (!dropDir) {
    throw new Error("usage: tsx src/pack.ts [--dry-run] <drop-dir>");
  }
  const epochs = Number(process.env["WALRUS_EPOCHS"] ?? "200");
  if (!Number.isFinite(epochs) || epochs < 1) {
    throw new Error(`WALRUS_EPOCHS must be a positive integer, got '${process.env["WALRUS_EPOCHS"]}'`);
  }
  pack({ dropDir, epochs, dryRun });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`pack failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
