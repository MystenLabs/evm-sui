/**
 * generate-assets.ts
 *
 * Idempotent: re-running this script produces byte-identical output files.
 * Do NOT introduce any non-deterministic values (Date.now, Math.random, etc.).
 *
 * Writes assets/nft-1.png through assets/nft-5.png to absolute paths
 * resolved from import.meta.url, so cwd is irrelevant.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

// Fixed deterministic 5-color palette indexed by (tokenIndex - 1).
const PALETTE: readonly string[] = [
  "#1f2937",
  "#7c3aed",
  "#0ea5e9",
  "#16a34a",
  "#dc2626",
];

const TOKEN_COUNT = 5;

function buildSvg(index: number, bgColor: string): string {
  // All SVG parameters are derived solely from index + bgColor — no runtime state.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" fill="${bgColor}"/>
  <text
    x="256"
    y="220"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="sans-serif"
    font-size="160"
    font-weight="bold"
    fill="#ffffff"
  >#${index}</text>
  <text
    x="256"
    y="360"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="sans-serif"
    font-size="64"
    font-weight="bold"
    fill="#ffffff"
    opacity="0.85"
  >EvmWal</text>
</svg>`;
}

export async function generateAssets(): Promise<void> {
  // Validate: TOKEN_COUNT must be 1..5 range covered by PALETTE.
  if (PALETTE.length < TOKEN_COUNT) {
    throw new Error(
      `Palette has ${PALETTE.length} entries but TOKEN_COUNT is ${TOKEN_COUNT}. ` +
        "Palette must have at least TOKEN_COUNT entries."
    );
  }

  const assetsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "assets"
  );

  // Ensure the assets directory exists (idempotent).
  await mkdir(assetsDir, { recursive: true });

  for (let i = 1; i <= TOKEN_COUNT; i++) {
    // Defensive: validate index is in expected range.
    if (i < 1 || i > 5) {
      throw new Error(
        `Token index ${i} is out of the expected range 1..5. ` +
          "Only indices 1 through 5 are supported."
      );
    }

    const bgColor = PALETTE[i - 1];
    const svg = buildSvg(i, bgColor);
    const buffer = await sharp(Buffer.from(svg))
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer();

    const outPath = path.join(assetsDir, `nft-${i}.png`);
    try {
      await writeFile(outPath, buffer, { flag: "w" });
    } catch (err) {
      throw new Error(
        `Failed to write ${outPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

// Run as script only when invoked directly (e.g., via `tsx scripts/generate-assets.ts`).
// Guarded so `import { generateAssets } from "./generate-assets"` is safe and does not
// trigger PNG regeneration or call process.exit on the importing process.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  generateAssets().catch((err: unknown) => {
    process.stderr.write(
      `generate-assets failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  });
}
