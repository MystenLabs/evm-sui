/**
 * submit-position — show the shape of a position submitted for liquidation.
 *
 * In production, an oracle or monitoring service detects under-collateralised
 * positions and submits them to the enclave. This script prints a sample.
 *
 * Usage: pnpm submit-position
 */

async function main() {
  const position = {
    positionId: Array.from(Buffer.from("pos-0042")),
    borrower: "0xA11CE",
    collateralToken: "0xC011",
    debtToken: "0xDE87",
    collateralAmount: "50000000000000000000", // 50 tokens
    debtAmount: "40000000000000000000",       // 40 tokens
    healthFactor: "0.95",                     // under 1.0 = liquidatable
  };

  console.log("[position] === Sample Liquidation Position ===");
  console.log();
  console.log(`  positionId:      ${Buffer.from(position.positionId).toString()}`);
  console.log(`  borrower:        ${position.borrower}`);
  console.log(`  collateralToken: ${position.collateralToken}`);
  console.log(`  debtToken:       ${position.debtToken}`);
  console.log(`  collateral:      ${position.collateralAmount}`);
  console.log(`  debt:            ${position.debtAmount}`);
  console.log(`  healthFactor:    ${position.healthFactor}`);
  console.log();
  console.log("  POST /liquidation/position to the enclave with this payload.");
  console.log("  The enclave checks the health factor and opens bidding.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
