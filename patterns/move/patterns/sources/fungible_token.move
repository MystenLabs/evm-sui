/// ERC-20 equivalent.
///
/// Solidity habit: an ERC-20 is one contract that owns a `mapping(address =>
/// uint256) balances` and a `totalSupply`. Every transfer mutates that shared
/// map, so every transfer contends on the same storage slot.
///
/// Sui idiom: there is no balances mapping. A fungible currency is a *type*
/// `FUNGIBLE_TOKEN`, and each holder owns `Coin<FUNGIBLE_TOKEN>` objects that
/// literally ARE the balance. Transfers move objects between owners on the fast
/// path, so unrelated transfers never contend. Minting authority is a
/// `TreasuryCap<T>` object (a capability) rather than an `onlyOwner` modifier.
module patterns::fungible_token;

use sui::coin::{Self, TreasuryCap};
use sui::coin_registry;

/// The One-Time Witness: a struct named exactly like the module, uppercased.
/// The Sui VM instantiates exactly one value of this type at publish and hands
/// it to `init`, guaranteeing the currency is registered once and only once.
public struct FUNGIBLE_TOKEN has drop {}

/// Runs once at publish. The Currency Standard (`sui::coin_registry`) replaced
/// the deprecated `coin::create_currency`: instead of a frozen metadata object,
/// the currency lives in a system-wide registry (shared object `0xc`) and
/// metadata updates are gated by a `MetadataCap` — a capability, same rule as
/// minting.
fun init(otw: FUNGIBLE_TOKEN, ctx: &mut TxContext) {
    let (initializer, treasury) = coin_registry::new_currency_with_otw(
        otw,
        6, // decimals
        b"GOLD".to_string(),
        b"Gold Token".to_string(),
        b"An ERC-20-style fungible token on Sui".to_string(),
        b"https://example.com/gold.svg".to_string(), // icon URL
        ctx,
    );
    // `initializer` is a hot potato: `finalize` MUST consume it, yielding the
    // MetadataCap. Prefer immutable metadata (the old freeze behavior)? Call
    // `initializer.finalize_and_delete_metadata_cap(ctx)` instead.
    let metadata_cap = initializer.finalize(ctx);
    transfer::public_transfer(treasury, ctx.sender());
    transfer::public_transfer(metadata_cap, ctx.sender());
    // One follow-up tx (anyone can send it) promotes the Currency<T> to its
    // permanent registry address:
    //   sui client ptb --move-call 0x2::coin_registry::finalize_registration \
    //     "<PACKAGE_ID::fungible_token::FUNGIBLE_TOKEN>" @0xc @CURRENCY_OBJECT_ID
}

/// `mint` is gated by *ownership of the TreasuryCap*, not a role check. Whoever
/// holds `&mut TreasuryCap` is the minter; there is nothing else to verify.
public fun mint(
    treasury: &mut TreasuryCap<FUNGIBLE_TOKEN>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    let coin = coin::mint(treasury, amount, ctx);
    transfer::public_transfer(coin, recipient);
}

/// Burning consumes a Coin object; supply drops by its value. No allowance
/// dance — you can only burn coins you own and pass in.
public fun burn(treasury: &mut TreasuryCap<FUNGIBLE_TOKEN>, coin: coin::Coin<FUNGIBLE_TOKEN>) {
    coin::burn(treasury, coin);
}
