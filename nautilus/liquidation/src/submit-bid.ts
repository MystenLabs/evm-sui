/**
 * submit-bid — send sample liquidation bids to the Nautilus enclave.
 *
 * Liquidators compete by bidding on under-collateralised positions.
 * The enclave verifies health factors and picks the winning liquidator.
 *
 * Usage: pnpm submit-bid
 */

import { processData, healthCheck } from "./lib/enclave.js";

async function main() {
  console.log("[liq] checking enclave health...");
  const health = await healthCheck();
  console.log(`[liq] enclave status=${health.status} version=${health.version}`);

  const bids = {
    positionId: Array.from(Buffer.from("pos-0042")),
    bids: [
      { liquidator: "0xB0B", maxDebtRepay: "40000000000000000000" },
      { liquidator: "0xCA801", maxDebtRepay: "38000000000000000000" },
    ],
  };

  console.log("[liq] submitting 2 liquidation bids...");
  console.log(`[liq]   positionId=${Buffer.from(bids.positionId).toString()}`);

  const result = await processData<{ winner: string; proofBlobId: string }>(
    "/liquidation/bid",
    bids,
  );

  console.log(`[liq] winning liquidator: ${result.winner}`);
  console.log(`[liq] proof blob: ${result.proofBlobId}`);
  console.log("[liq] done — call 'pnpm settle' to commit on-chain");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
