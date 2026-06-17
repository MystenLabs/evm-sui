/**
 * submit-quote — single maker submits a quote for an open RFQ.
 *
 * Demonstrates the maker-side flow: the maker sees an RFQ id, decides on
 * a price, and sends the quote to the enclave for inclusion in the auction.
 *
 * Usage: pnpm submit-quote
 */

import { processData } from "./lib/enclave.js";

async function main() {
  const quote = {
    rfqId: Array.from(Buffer.from("rfq-demo-001")),
    maker: "0xB0B",
    price: "2000000000000000000000",
    expiry: Math.floor(Date.now() / 1000) + 60, // valid 60s
  };

  console.log("[quote] submitting maker quote...");
  console.log(`[quote]   rfqId=${Buffer.from(quote.rfqId).toString()}`);
  console.log(`[quote]   maker=${quote.maker} price=${quote.price}`);
  console.log(`[quote]   expiry=${quote.expiry}`);

  const result = await processData<{ accepted: boolean; rank: number }>(
    "/rfq/quote",
    quote,
  );

  console.log(`[quote] accepted=${result.accepted} rank=${result.rank}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
