/// Why three Solidity security staples are largely moot in Move — and the one
/// that still matters (rounding).
///
/// 1. Reentrancy guards (`nonReentrant`). Reentrancy needs dynamic dispatch: an
///    external call that re-enters your function mid-execution. Move has no
///    dynamic dispatch and no fallback functions — a module calls only functions
///    known at compile time, and a called module cannot call back into yours
///    unless you already depend on it (no cycles allowed). There is no reentrant
///    edge to guard.
///
/// 2. Checks-Effects-Interactions. CEI exists to avoid reentrancy and to avoid
///    losing funds to a failing external call. In Move, assets are resources: a
///    `Coin` you hold cannot vanish, and a transfer is not a callback. The
///    ordering discipline is unnecessary for the reentrancy reason above.
///
/// 3. SafeMath / OpenZeppelin `Math`. Move's integer arithmetic *aborts* on
///    overflow and underflow at the VM level — `a + b` past `u64::MAX` reverts
///    the transaction. There is no silent wraparound to defend against, so no
///    SafeMath wrapper is needed for basic ops.
///
/// What DOES still bite you: rounding direction in `mul_div`. Integer division
/// truncates, and rounding the wrong way lets value leak from a pool to a user
/// (or vice versa). OpenZeppelin's math library for Sui makes the direction
/// explicit — round *against* the party that could exploit the residue.
module patterns::security;

// `u64` is also a primitive type name, so alias the OZ module to avoid shadowing.
use openzeppelin_math::u64 as oz_u64;
use openzeppelin_math::rounding;

#[error(code = 0)]
const EOverflow: vector<u8> = b"mul_div result does not fit in u64";

/// ERC-4626-style share issuance: how many pool shares does `assets` buy?
///
/// `shares = assets * total_shares / total_assets`, rounded DOWN so the
/// depositor never receives a fractional share the pool didn't back — the
/// residue stays with the pool, never in the user's favor. Overflow of the
/// intermediate product is handled by OZ (widened internally); a result too big
/// for `u64` returns `none`, which we turn into an explicit abort.
public fun shares_for_deposit(assets: u64, total_shares: u64, total_assets: u64): u64 {
    let result = oz_u64::mul_div(assets, total_shares, total_assets, rounding::down());
    assert!(result.is_some(), EOverflow);
    result.destroy_some()
}
