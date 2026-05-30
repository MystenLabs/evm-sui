/**
 * submit-intent — send buy and sell intents for a batch swap round.
 *
 * Participants submit intents (side + max price + amount) to the enclave.
 * Once the collection window closes, the enclave computes a uniform
 * clearing price and fills matching orders.
 *
 * Usage: pnpm submit-intent
 */

import { processData, healthCheck } from "./lib/enclave.js";

async function main() {
  console.log("[batch] checking enclave health...");
  const health = await healthCheck();
  console.log(`[batch] enclave status=${health.status} version=${health.version}`);

  const intents = {
    batchId: Array.from(Buffer.from("batch-007")),
    tokenPair: "ETH/USDC",
    intents: [
      { side: "buy",  user: "0xA11CE", amount: "5000000000000000000",  maxPrice: "2600000000000000000000" },
      { side: "buy",  user: "0xB0B",   amount: "3000000000000000000",  maxPrice: "2550000000000000000000" },
      { side: "sell", user: "0xCA801", amount: "4000000000000000000",  minPrice: "2450000000000000000000" },
      { side: "sell", user: "0xDAD",   amount: "6000000000000000000",  minPrice: "2500000000000000000000" },
    ],
  };

  console.log(`[batch] submitting ${intents.intents.length} intents for ${intents.tokenPair}...`);
  for (const i of intents.intents) {
    console.log(`[batch]   ${i.side.padEnd(4)} ${i.user} amount=${i.amount}`);
  }

  const result = await processData<{
    clearingPrice: string;
    filled: number;
    proofBlobId: string;
  }>("/batch/submit", intents);

  console.log(`[batch] clearing price: ${result.clearingPrice}`);
  console.log(`[batch] orders filled: ${result.filled}`);
  console.log(`[batch] proof blob: ${result.proofBlobId}`);
  console.log("[batch] done — call 'pnpm settle-batch' to commit on-chain");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
