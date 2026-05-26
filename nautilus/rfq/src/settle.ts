/**
 * settle — print the Sui transaction that would commit an RFQ settlement.
 *
 * In production the enclave calls this automatically. This script shows
 * the shape of the move call for documentation purposes.
 *
 * Usage: pnpm settle
 */

const PACKAGE_ID = process.env.SETTLEMENT_PACKAGE_ID ?? "0x<package-id>";

async function main() {
  console.log("[settle] === RFQ Settlement (Sui move call) ===");
  console.log();
  console.log("  const tx = new Transaction();");
  console.log("  tx.moveCall({");
  console.log(`    package: "${PACKAGE_ID}",`);
  console.log('    module: "rfq_settlement",');
  console.log('    function: "settle",');
  console.log("    arguments: [");
  console.log("      tx.object(settlementObj),  // &mut RfqSettlement");
  console.log("      tx.pure.vector('u8', rfqIdBytes),");
  console.log("      tx.pure.address(taker),");
  console.log("      tx.pure.address(winningMaker),");
  console.log("      tx.pure.address(baseToken),");
  console.log("      tx.pure.address(quoteToken),");
  console.log("      tx.pure.u64(amount),");
  console.log("      tx.pure.u64(price),");
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
