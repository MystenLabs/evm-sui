/// Ownable / AccessControl equivalent — shown two ways.
///
/// Solidity habit: `Ownable` stores an `owner` address and guards functions
/// with `onlyOwner`; `AccessControl` keeps `mapping(bytes32 => RoleData)` and
/// guards with `onlyRole(ROLE)`. Both compare `msg.sender` against stored state.
///
/// Sui idiom: authority is an *object you hold*, not an address you match.
///  (a) The native one-liner: an `AdminCap` capability object. Owning it IS the
///      permission — no address comparison, no storage read.
///  (b) When you need many named roles with on-chain grant/revoke, reach for
///      OpenZeppelin's `access_control`, which Solidity devs already know.
module patterns::access_control;

use openzeppelin_access::access_control::{Self, AccessControl, Auth};

// =========================================================================
// (a) Native capability pattern — the idiomatic "Ownable"
// =========================================================================

/// Holding this object is the entire authorization proof. Transfer it to hand
/// over ownership; there is no `transferOwnership` bookkeeping to write.
public struct AdminCap has key, store { id: UID }

/// A privileged action. The `&AdminCap` parameter is the guard: you cannot call
/// this without owning the cap, and the compiler enforces it. No `require`.
public fun admin_only_action(_cap: &AdminCap): u64 {
    42
}

// =========================================================================
// (b) Role-based access with OpenZeppelin AccessControl
// =========================================================================

/// The OTW doubles as OpenZeppelin's *root role* (its default admin role).
public struct ACCESS_CONTROL has drop {}

/// An extra role, defined in this same module (OZ requires home-module roles).
public struct MinterRole {}

fun init(otw: ACCESS_CONTROL, ctx: &mut TxContext) {
    // Native side: mint the AdminCap and give it to the publisher.
    transfer::public_transfer(AdminCap { id: object::new(ctx) }, ctx.sender());

    // OZ side: stand up the role registry. `new` makes the sender the default
    // admin (root role), with a 1-day timelock on future admin transfers.
    let mut registry = access_control::new(otw, 86_400_000, ctx);
    // The root admin grants itself MinterRole so it can mint auth witnesses.
    registry.grant_role<_, MinterRole>(ctx.sender(), ctx);
    transfer::public_share_object(registry);
}

/// Grant MinterRole to `account`. Caller must already hold the role's admin
/// (the root role) — OZ checks that inside `grant_role`.
public fun grant_minter(registry: &mut AccessControl<ACCESS_CONTROL>, account: address, ctx: &mut TxContext) {
    registry.grant_role<_, MinterRole>(account, ctx);
}

/// A role-gated action. `Auth<MinterRole>` is an unforgeable proof minted only
/// by `new_auth` to an address that currently holds MinterRole.
public fun minter_only_action(_auth: &Auth<MinterRole>): u64 {
    7
}
