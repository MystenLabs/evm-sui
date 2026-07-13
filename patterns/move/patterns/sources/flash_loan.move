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

const FEE_BPS: u64 = 30; // 0.30%

/// Shared lending pool.
public struct Pool has key {
    id: UID,
    reserve: Balance<SUI>,
}

/// The hot potato. No `key`, `store`, `copy`, or `drop`: it MUST be consumed by
/// `repay` before the transaction can end.
public struct Receipt {
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
    (loan, Receipt { amount, fee })
}

/// Repay principal + fee, consuming the Receipt. Only this call can retire it,
/// so a transaction that borrows must reach here or fail to compile.
public fun repay(pool: &mut Pool, payment: Coin<SUI>, receipt: Receipt) {
    let Receipt { amount, fee } = receipt;
    assert!(payment.value() == amount + fee, ERepayWrongAmount);
    pool.reserve.join(payment.into_balance());
}

public fun reserve(pool: &Pool): u64 { pool.reserve.value() }

#[test]
fun test_borrow_repay_with_fee() {
    use sui::test_scenario;
    let user = @0xA;
    let mut sc = test_scenario::begin(user);

    let seed = coin::mint_for_testing<SUI>(10_000, sc.ctx());
    create(seed, sc.ctx());

    sc.next_tx(user);
    let mut pool = sc.take_shared<Pool>();
    let (mut loan, receipt) = borrow(&mut pool, 1_000, sc.ctx());
    // fee = 1000 * 30 / 10000 = 3
    assert!(receipt.fee == 3);

    // Top up the loan with the fee (simulating profit) and repay.
    let fee_coin = coin::mint_for_testing<SUI>(3, sc.ctx());
    loan.join(fee_coin);
    repay(&mut pool, loan, receipt);

    // Pool grew by the fee.
    assert!(reserve(&pool) == 10_003);
    test_scenario::return_shared(pool);
    sc.end();
}
