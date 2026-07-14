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

/// The One-Time Witness: a struct named exactly like the module, uppercased.
/// The Sui VM instantiates exactly one value of this type at publish and hands
/// it to `init`, guaranteeing the currency is registered once and only once.
public struct FUNGIBLE_TOKEN has drop {}

/// Runs once at publish. `create_currency` consumes the OTW and returns the
/// mint/burn authority plus the immutable metadata object.
///
/// Note: the newer Currency Standard (`sui::coin_registry::new_currency_with_otw`)
/// supersedes `coin::create_currency`; we use the classic call here because it is
/// the one Solidity devs meet first. `#[allow(deprecated_usage)]` keeps the lesson
/// noise-free.
#[allow(deprecated_usage)]
fun init(witness: FUNGIBLE_TOKEN, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6, // decimals
        b"GOLD",
        b"Gold Token",
        b"An ERC-20-style fungible token on Sui",
        option::none(),
        ctx,
    );
    // Metadata is frozen (read-only forever); the TreasuryCap goes to the
    // publisher, who now holds the sole right to mint and burn.
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
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
