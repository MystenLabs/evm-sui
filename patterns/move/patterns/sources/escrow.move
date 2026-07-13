/// Trustless swap escrow.
///
/// Solidity habit: an escrow contract holds both sides' assets in its own
/// storage and tracks who deposited what in mappings, trusting its own logic to
/// release correctly. Reentrancy and approval bugs live here.
///
/// Sui idiom: the escrow is a shared object that *owns* the offered item by
/// wrapping it. The counterparty atomically pays the asked amount and receives
/// the item in one transaction; if they never show up, the creator cancels and
/// the wrapped item is returned. The item cannot leak — it is a resource the
/// compiler forces us to route to exactly one owner.
module patterns::escrow;

use sui::coin::Coin;
use sui::sui::SUI;

#[error(code = 0)]
const EWrongAmount: vector<u8> = b"Payment does not match the asked price";

#[error(code = 1)]
const ENotCreator: vector<u8> = b"Only the creator can cancel";

/// Shared escrow. `T: key + store` is the offered item, wrapped inside. Generic
/// over T, so one module escrows NFTs, coins, or anything ownable.
public struct Escrow<T: key + store> has key {
    id: UID,
    creator: address,
    asked: u64, // required SUI payment, in MIST
    item: T,
}

/// Offer `item` for `asked` MIST. Shares the escrow so any buyer can take it.
public fun create<T: key + store>(item: T, asked: u64, ctx: &mut TxContext) {
    let escrow = Escrow<T> { id: object::new(ctx), creator: ctx.sender(), asked, item };
    transfer::share_object(escrow);
}

/// Buyer pays exactly `asked` and receives the item — atomic. Payment goes to
/// the creator; nothing is left half-done because the whole tx reverts on abort.
public fun swap<T: key + store>(escrow: Escrow<T>, payment: Coin<SUI>): T {
    let Escrow { id, creator, asked, item } = escrow;
    assert!(payment.value() == asked, EWrongAmount);
    transfer::public_transfer(payment, creator);
    id.delete();
    // Return the unwrapped item; the buyer (caller) decides where it lands.
    item
}

/// Creator reclaims the item if no swap happened.
public fun cancel<T: key + store>(escrow: Escrow<T>, ctx: &mut TxContext): T {
    let Escrow { id, creator, asked: _, item } = escrow;
    assert!(ctx.sender() == creator, ENotCreator);
    id.delete();
    item
}

#[test_only]
public struct Gizmo has key, store { id: UID }

#[test]
fun test_swap_happy_path() {
    use sui::test_scenario;
    use sui::coin;
    let seller = @0xA;
    let buyer = @0xB;
    let mut sc = test_scenario::begin(seller);

    let gizmo = Gizmo { id: object::new(sc.ctx()) };
    create(gizmo, 500, sc.ctx());

    sc.next_tx(buyer);
    let escrow = sc.take_shared<Escrow<Gizmo>>();
    let payment = coin::mint_for_testing<SUI>(500, sc.ctx());
    let item = swap(escrow, payment);
    transfer::public_transfer(item, buyer);

    // Seller received the 500 MIST payment.
    sc.next_tx(seller);
    let paid = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(paid.value() == 500);
    sc.return_to_sender(paid);
    sc.end();
}

#[test]
fun test_cancel_returns_item() {
    use sui::test_scenario;
    let seller = @0xA;
    let mut sc = test_scenario::begin(seller);
    let gizmo = Gizmo { id: object::new(sc.ctx()) };
    create(gizmo, 500, sc.ctx());

    sc.next_tx(seller);
    let escrow = sc.take_shared<Escrow<Gizmo>>();
    let item = cancel(escrow, sc.ctx());
    transfer::public_transfer(item, seller);
    sc.end();
}
