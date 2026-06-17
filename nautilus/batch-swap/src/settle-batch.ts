/**
 * settle-batch — print the Sui transaction that would commit a batch swap.
 *
 * In production the enclave calls this automatically. This script shows
 * the shape of the move call for documentation purposes.
 *
 * Usage: pnpm settle-batch
 */

const PACKAGE_ID = process.env.SETTLEMENT_PACKAGE_ID ?? "0x<package-id>";

async function main() {
  console.log("[settle] === Batch Swap Settlement (Sui move call) ===");
  console.log();
  console.log("  const tx = new Transaction();");
  console.log("  tx.moveCall({");
  console.log(`    package: "${PACKAGE_ID}",`);
  console.log('    module: "batch_swap_settlement",');
  console.log('    function: "settle_batch",');
  console.log("    arguments: [");
  console.log("      tx.object(settlementObj),  // &mut BatchSwapSettlement");
  console.log("      tx.pure.vector('u8', batchIdBytes),");
  console.log("      tx.pure.vector('u8', tokenPairBytes),");
  console.log("      tx.pure.u64(clearingPrice),");
  console.log("      tx.pure.u64(totalBuyFilled),");
  console.log("      tx.pure.u64(totalSellFilled),");
  console.log("      tx.pure.u16(numParticipants),");
  console.log("      tx.pure.vector('u8', proofBlobId),");
  console.log("    ],");
  console.log("  });");
  console.log();
  console.log("  // sign with enclave keypair and execute");
  console.log("  const result = await client.signAndExecuteTransaction({");
  console.log("    signer: enclaveKeypair,");
  console.log("    transaction: tx,");
  console.log("  });");
  console.log();
  console.log("[settle] done — this is a dry-run print, no tx was sent");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
