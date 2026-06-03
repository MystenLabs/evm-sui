/**
 * `vote` — cast a vote on a proposal via the OpenZeppelin `Governor` interface.
 *
 * Voting weight is the caller's `getPastVotes` at the proposal's snapshot block,
 * so a fresh balance acquired after the snapshot counts for nothing. The voter
 * must hold (and have delegated) the vote token before the proposal was created.
 *
 * Required env:
 *   - EVM_RPC_URL         JSON-RPC for the chain holding Governance
 *   - EVM_CHAIN_ID        EVM chain id (default: 31337 — anvil)
 *   - GOVERNANCE_ADDRESS  Deployed Governance address
 *   - VOTER_PRIVATE_KEY   hex private key for the voting wallet
 *                         (falls back to PROPOSER_PRIVATE_KEY)
 *
 * Usage:
 *   tsx src/vote.ts <proposal-id> <for|against|abstain | 1|0|2>
 */

import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { env, resolveChain } from "./lib/evm.js";
import { GOVERNANCE_ABI } from "./lib/governance-abi.js";

const SUPPORT: Record<string, number> = {
  against: 0,
  for: 1,
  abstain: 2,
  "0": 0,
  "1": 1,
  "2": 2,
};

function parseSupport(input: string): number {
  const v = SUPPORT[input.toLowerCase()];
  if (v === undefined) {
    throw new Error(`support must be one of for|against|abstain (or 1|0|2), got: ${input}`);
  }
  return v;
}

async function main() {
  const [idStr, supportRaw] = process.argv.slice(2);
  if (!idStr || !supportRaw) {
    throw new Error("usage: tsx src/vote.ts <proposal-id> <for|against|abstain | 1|0|2>");
  }
  const proposalId = BigInt(idStr);
  const support = parseSupport(supportRaw);

  const governance = env("GOVERNANCE_ADDRESS") as Address;
  const rpcUrl = env("EVM_RPC_URL");
  const chain = resolveChain(Number(env("EVM_CHAIN_ID", "31337")), rpcUrl);
  const pk = (process.env.VOTER_PRIVATE_KEY ?? env("PROPOSER_PRIVATE_KEY")) as Hex;

  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  const hash = await wallet.writeContract({
    address: governance,
    abi: GOVERNANCE_ABI,
    functionName: "castVote",
    args: [proposalId, support],
  });
  console.log(`[evm] tx submitted: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[evm] tx mined in block ${receipt.blockNumber} (status=${receipt.status})`);

  const [against, forVotes, abstain] = await publicClient.readContract({
    address: governance,
    abi: GOVERNANCE_ABI,
    functionName: "proposalVotes",
    args: [proposalId],
  });
  const label = ["Against", "For", "Abstain"][support];
  console.log(`[ok] voted ${label} on proposal ${proposalId}`);
  console.log(`     tally → for: ${forVotes}  against: ${against}  abstain: ${abstain}`);
  console.log(`     pnpm tally ${proposalId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
