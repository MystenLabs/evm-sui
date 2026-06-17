/**
 * submit-rfq — send a sample RFQ with multiple quotes to the Nautilus enclave.
 *
 * The enclave collects quotes from makers, picks the best one, and produces
 * a signed settlement that can be committed on-chain.
 *
 * Usage: pnpm submit-rfq
 */

import { processData, healthCheck } from "./lib/enclave.js";

async function main() {
  console.log("[rfq] checking enclave health...");
  const health = await healthCheck();
  console.log(`[rfq] enclave status=${health.status} version=${health.version}`);

  const rfqPayload = {
    rfqId: Array.from(Buffer.from("rfq-demo-001")),
    taker: "0xA11CE",
    baseToken: "0xBA5E",
    quoteToken: "0x0070E",
    amount: "100000000000000000000", // 100 tokens
    quotes: [
      { maker: "0xB0B", price: "2000000000000000000000" },
      { maker: "0xCA801", price: "2010000000000000000000" },
      { maker: "0xDAD", price: "1995000000000000000000" },
    ],
  };

  console.log("[rfq] submitting RFQ with 3 maker quotes...");
  console.log(`[rfq]   taker=${rfqPayload.taker} amount=${rfqPayload.amount}`);

  const result = await processData<{ winner: string; proofBlobId: string }>(
    "/rfq/submit",
    rfqPayload,
  );

  console.log(`[rfq] winner: ${result.winner}`);
  console.log(`[rfq] proof blob: ${result.proofBlobId}`);
  console.log("[rfq] done — call 'pnpm settle' to commit on-chain");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
