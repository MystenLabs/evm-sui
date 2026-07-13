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

/// Value still locked in a claim ticket.
public fun value<C>(ticket: &Claim<C>): u64 { ticket.funds.value() }

#[test]
fun test_airdrop_and_claim() {
    use sui::test_scenario;
    use sui::sui::SUI;
    let funder = @0xA;
    let alice = @0xA1;
    let bob = @0xB2;
    let mut sc = test_scenario::begin(funder);

    let funds = coin::mint_for_testing<SUI>(1000, sc.ctx());
    airdrop(funds, vector[alice, bob], vector[300, 700], sc.ctx());

    // Alice opens her claim and gets exactly 300.
    sc.next_tx(alice);
    let ticket = sc.take_from_sender<Claim<SUI>>();
    assert!(value(&ticket) == 300);
    let coin = claim(ticket, sc.ctx());
    assert!(coin.value() == 300);
    transfer::public_transfer(coin, alice);
    sc.end();
}
