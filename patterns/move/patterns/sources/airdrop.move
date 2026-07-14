/// Merkle-distributor equivalent.
///
/// Solidity habit: airdropping to thousands of addresses on-chain is too
/// expensive, so you publish a Merkle root and make each recipient submit a
/// proof to `claim`. The proof machinery exists only to compress a big list into
/// one storage slot.
///
/// Sui idiom: you can just create one small `Claim` object per recipient and
/// transfer it directly to them. Transfers touch independent objects, so the
/// batch parallelizes instead of contending on a shared contract — no Merkle
/// root, no proofs, no per-claim verification. Recipients later "open" their
/// claim to get a `Coin`.
module patterns::airdrop;

use sui::balance::Balance;
use sui::coin::{Self, Coin};

#[error(code = 0)]
const ELengthMismatch: vector<u8> = b"recipients and amounts must be the same length";

/// A pre-funded claim ticket, owned by its recipient.
public struct Claim<phantom C> has key, store {
    id: UID,
    funds: Balance<C>,
}

/// Split `funds` into one `Claim` per recipient and transfer each directly.
/// Any remainder is returned to the sender as a `Coin`.
#[allow(lint(self_transfer))] // returning the funder's own leftover coin is intentional
public fun airdrop<C>(
    mut funds: Coin<C>,
    recipients: vector<address>,
    amounts: vector<u64>,
    ctx: &mut TxContext,
) {
    assert!(recipients.length() == amounts.length(), ELengthMismatch);
    let mut i = 0;
    let n = recipients.length();
    while (i < n) {
        let amount = amounts[i];
        let claim = Claim<C> { id: object::new(ctx), funds: funds.balance_mut().split(amount) };
        transfer::public_transfer(claim, recipients[i]);
        i = i + 1;
    };
    // Return the leftover (possibly zero) coin to the funder.
    transfer::public_transfer(funds, ctx.sender());
}

/// Recipient opens their claim, receiving a spendable `Coin`.
public fun claim<C>(ticket: Claim<C>, ctx: &mut TxContext): Coin<C> {
    let Claim { id, funds } = ticket;
    id.delete();
    coin::from_balance(funds, ctx)
}
