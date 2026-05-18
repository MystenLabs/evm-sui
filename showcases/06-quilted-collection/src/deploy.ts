/**
 * `deploy` — thin wrapper around the QuiltedCollection forge script that
 * passes the quiltId, aggregator host, max supply, name, and symbol via
 * env vars (the same set the forge script reads via `vm.envString` /
 * `vm.envUint`).
 *
 * Required env (forwarded to the forge script):
 *   - QC_NAME           collection name, e.g. "Walrus Quilted #01"
 *   - QC_SYMBOL         token symbol, e.g. "WQ01"
 *   - QC_QUILT_ID       base64url quiltId from `pnpm pack`
 *   - QC_AGGREGATOR     e.g. https://aggregator.walrus-testnet.walrus.space
 *   - QC_MAX_SUPPLY     positive integer
 *
 * Required env (for the EVM tx):
 *   - EVM_RPC_URL       e.g. http://127.0.0.1:8545 (anvil) or your live RPC
 *   - DEPLOYER_PRIVATE_KEY  signer for the deploy tx
 *
 * Usage:
 *   tsx src/deploy.ts
 *   tsx src/deploy.ts --dry-run
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED = [
  "QC_NAME",
  "QC_SYMBOL",
  "QC_QUILT_ID",
  "QC_AGGREGATOR",
  "QC_MAX_SUPPLY",
  "EVM_RPC_URL",
  "DEPLOYER_PRIVATE_KEY",
] as const;

function checkEnv(): void {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`missing env: ${missing.join(", ")}`);
  }
  const max = Number(process.env["QC_MAX_SUPPLY"]);
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`QC_MAX_SUPPLY must be a positive integer (got '${process.env["QC_MAX_SUPPLY"]}')`);
  }
}

function main(): void {
  checkEnv();

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const SHOWCASE_ROOT = path.resolve(__dirname, "..");
  const CONTRACTS_ROOT = path.resolve(SHOWCASE_ROOT, "..", "contracts");

  const forgeBin = process.env["FORGE_BIN"] ?? `${process.env["HOME"]}/.foundry/bin/forge`;
  const args = [
    "script",
    "script/DeployQuiltedCollection.s.sol",
    "--rpc-url",
    process.env["EVM_RPC_URL"]!,
    "--broadcast",
    "--private-key",
    process.env["DEPLOYER_PRIVATE_KEY"]!,
  ];

  const dryRun = process.argv[2] === "--dry-run";
  if (dryRun) {
    // Redact the private key so the dry-run print is safe to paste into
    // chat / CI logs. The previous arg in `args` tags the value.
    const redacted = args.map((value, i) =>
      args[i - 1] === "--private-key" ? "<REDACTED>" : value,
    );
    console.log(`[dry-run] would invoke (cwd=${CONTRACTS_ROOT}):`);
    console.log(`  ${forgeBin} ${redacted.join(" ")}`);
    return;
  }

  const result = spawnSync(forgeBin, args, {
    cwd: CONTRACTS_ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`forge not found at ${forgeBin}. Install Foundry per https://book.getfoundry.sh.`);
    }
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

try {
  main();
} catch (err) {
  process.stderr.write(`deploy failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
