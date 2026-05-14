/**
 * WalrusResolver keeper.
 *
 * For every ENS node we're keeping alive, fetch the on-chain pointer, read the
 * corresponding Sui Blob object, and call `extendBlob` whenever the remaining
 * epoch window drops below a threshold. The EVM pointer is never touched —
 * only the underlying Walrus blob's lifetime is extended.
 *
 * Run as a cron job (e.g. once a day). Anyone can run a keeper for any name,
 * as long as they're willing to pay the WAL extension cost.
 *
 * Required env:
 *   - EVM_RPC_URL              JSON-RPC for the chain holding WalrusResolver
 *   - RESOLVER_ADDRESS         Deployed WalrusResolver address
 *   - SUI_RPC_URL              Sui fullnode (mainnet or testnet)
 *   - SUI_PRIVATE_KEY          bech32 keypair holding WAL to fund extensions
 *   - KEEPER_NAMES             Comma-separated ENS names to keep alive
 *   - EXTENSION_THRESHOLD      Refresh when remaining epochs < this (default: 5)
 *   - EXTEND_BY_EPOCHS         Epochs to add per extension (default: 50)
 */

import { createPublicClient, http, namehash, type Address } from "viem";
import { mainnet } from "viem/chains";
import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { WalrusClient } from "@mysten/walrus";

const WALRUS_RESOLVER_ABI = [
  {
    type: "function",
    name: "walrusBlob",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [
      { name: "blobId", type: "bytes32" },
      { name: "suiObjectId", type: "bytes32" },
      { name: "contentType", type: "bytes8" },
    ],
  },
] as const;

const ZERO = `0x${"00".repeat(32)}` as const;

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`missing env: ${key}`);
  return v;
}

async function main() {
  const resolverAddress = env("RESOLVER_ADDRESS") as Address;
  const names = env("KEEPER_NAMES")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const threshold = Number(env("EXTENSION_THRESHOLD", "5"));
  const extendBy = Number(env("EXTEND_BY_EPOCHS", "50"));

  const evm = createPublicClient({
    chain: mainnet,
    transport: http(env("EVM_RPC_URL")),
  });

  const sui = new SuiClient({ url: env("SUI_RPC_URL") });
  const { secretKey } = decodeSuiPrivateKey(env("SUI_PRIVATE_KEY"));
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const walrus = new WalrusClient({ network: "mainnet", suiClient: sui });

  // Walrus exposes the current epoch via its system state on Sui.
  const currentEpoch = Number((await walrus.systemState()).committee.epoch);

  for (const name of names) {
    const node = namehash(name);
    const [, suiObjectId] = (await evm.readContract({
      address: resolverAddress,
      abi: WALRUS_RESOLVER_ABI,
      functionName: "walrusBlob",
      args: [node],
    })) as readonly [`0x${string}`, `0x${string}`, `0x${string}`];

    if (suiObjectId === ZERO) {
      console.log(`[skip] ${name}: pointer unset`);
      continue;
    }

    const blob = await sui.getObject({
      id: suiObjectId,
      options: { showContent: true },
    });

    // The Blob Move struct exposes an `end_epoch` field on its storage resource.
    // Different SDK versions surface it via slightly different paths; we read it
    // off the parsed content here and fall back to refusing to act if absent.
    const fields =
      blob.data?.content?.dataType === "moveObject"
        ? (blob.data.content.fields as Record<string, unknown>)
        : null;
    const storage = fields?.["storage"] as
      | { fields?: { end_epoch?: string | number } }
      | undefined;
    const endEpochRaw = storage?.fields?.end_epoch;
    if (endEpochRaw === undefined) {
      console.warn(`[skip] ${name}: cannot read end_epoch on ${suiObjectId}`);
      continue;
    }
    const endEpoch = Number(endEpochRaw);
    const epochsLeft = endEpoch - currentEpoch;

    if (epochsLeft >= threshold) {
      console.log(`[ok]   ${name}: ${epochsLeft} epochs left, no action`);
      continue;
    }

    console.log(`[extend] ${name}: ${epochsLeft} epochs left → +${extendBy}`);
    await walrus.executeExtendBlobTransaction({
      blobObjectId: suiObjectId,
      epochs: extendBy,
      signer: keypair,
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
