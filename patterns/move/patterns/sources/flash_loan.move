/// Flash loan via the hot-potato pattern.
///
/// Solidity habit: a flash loan sends funds to the borrower, calls back into
/// their contract, then checks `balanceAfter >= balanceBefore + fee` — trusting
/// a reentrant callback and a balance assertion to enforce repayment.
///
/// Sui idiom: `borrow` hands out the coin AND a `Receipt` that has *no
/// abilities* — it can't be copied, dropped, or stored. The only way to make
/// the transaction compile is to pass the Receipt back to `repay` in the same
/// PTB. The type system enforces repayment; there is no callback and no
/// reentrancy surface.
module patterns::flash_loan;

use sui::balance::Balance;
use sui::coin::{Self, Coin};
use sui::sui::SUI;

#[error(code = 0)]
const ERepayWrongAmount: vector<u8> = b"Repayment must equal principal plus fee";
#[error(code = 1)]
const EWrongPool: vector<u8> = b"Receipt must be repaid to its issuing pool";

const FEE_BPS: u64 = 30; // 0.30%

/// Shared lending pool.
public struct Pool has key {
    id: UID,
    reserve: Balance<SUI>,
}

/// The hot potato. No `key`, `store`, `copy`, or `drop`: it MUST be consumed by
/// `repay` before the transaction can end.
public struct Receipt {
    pool_id: ID, // pins the debt to the pool that issued it
    amount: u64,
    fee: u64,
}

/// Seed a pool with initial liquidity.
public fun create(seed: Coin<SUI>, ctx: &mut TxContext) {
    transfer::share_object(Pool { id: object::new(ctx), reserve: seed.into_balance() });
}

/// Borrow `amount`. Returns the funds plus a Receipt that pins the debt.
public fun borrow(pool: &mut Pool, amount: u64, ctx: &mut TxContext): (Coin<SUI>, Receipt) {
    let fee = (((amount as u128) * (FEE_BPS as u128)) / 10_000) as u64;
    let loan = coin::from_balance(pool.reserve.split(amount), ctx);
    (loan, Receipt { pool_id: object::id(pool), amount, fee })
}

/// Repay principal + fee, consuming the Receipt. Only this call can retire it,
/// so a transaction that borrows must reach here or fail to compile.
public fun repay(pool: &mut Pool, payment: Coin<SUI>, receipt: Receipt) {
    let Receipt { pool_id, amount, fee } = receipt;
    assert!(pool_id == object::id(pool), EWrongPool);
    assert!(payment.value() == amount + fee, ERepayWrongAmount);
    pool.reserve.join(payment.into_balance());
}
