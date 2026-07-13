// 10 — Gasless UX, the Sui way: sponsored transactions.
//
// On EVM, letting a user act without holding ETH means EIP-2612 `permit`: the
// user signs an off-chain approval, a relayer submits it and pays gas, and the
// dapp pulls tokens with that signature. It is PER-TOKEN (each token must
// implement permit) and only covers approvals. See ../solidity/src/10_Permit.sol.
//
// On Sui, gas sponsorship is a NATIVE property of every transaction: a
// transaction has a gas owner distinct from its sender. The sponsor supplies
// the gas coin and co-signs; the user signs the transaction contents. This
// works for ANY action, not just token approvals, and needs no per-asset
// opt-in (users own their Coins outright — there are no approvals to grant).
//
// Requires @mysten/sui. Illustrative — wire real keypairs / a sponsor service.
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });

export async function sponsoredTransfer(
  user: Ed25519Keypair,      // the gasless end-user — holds no SUI
  sponsor: Ed25519Keypair,   // pays gas on the user's behalf
  recipient: string,
) {
  const userAddr = user.getPublicKey().toSuiAddress();
  const sponsorAddr = sponsor.getPublicKey().toSuiAddress();

  // 1. Build the transaction the USER wants (move a Coin the user owns).
  //    Split from one of the user's OWN coins — NOT tx.gas, which the sponsor
  //    pays for. The user spends their asset; the sponsor only covers gas.
  const tx = new Transaction();
  tx.setSender(userAddr);
  const userCoins = await client.getCoins({ owner: userAddr });
  const [coin] = tx.splitCoins(userCoins.data[0].coinObjectId, [1_000_000]);
  tx.transferObjects([coin], recipient);

  // 2. The SPONSOR provides the gas payment and is set as gas owner.
  tx.setGasOwner(sponsorAddr);
  const sponsorCoins = await client.getCoins({ owner: sponsorAddr });
  tx.setGasPayment(
    sponsorCoins.data.slice(0, 1).map((c) => ({
      objectId: c.coinObjectId,
      version: c.version,
      digest: c.digest,
    })),
  );

  // 3. Build once, then BOTH parties sign the same bytes.
  const bytes = await tx.build({ client });
  const userSig = (await user.signTransaction(bytes)).signature;
  const sponsorSig = (await sponsor.signTransaction(bytes)).signature;

  // 4. Submit with both signatures. The user never touched SUI.
  return client.executeTransactionBlock({
    transactionBlock: bytes,
    signature: [userSig, sponsorSig],
  });
}
