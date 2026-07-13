/// VestingWallet equivalent — linear vesting with a cliff-free straight line.
///
/// Solidity habit: OpenZeppelin's `VestingWallet` streams a balance to a
/// beneficiary as `block.timestamp` advances, tracking `released` in storage.
///
/// Sui idiom: same idea, but time comes from the shared `Clock` object (passed
/// by reference) and the locked funds live as a `Balance<C>` wrapped inside the
/// wallet object rather than in a contract's storage slot.
///
/// OZ ships this for Sui too — `openzeppelin_finance::vesting_wallet_linear`
/// (`create_and_share` + `release`). It is the production choice, but its payout
/// path routes through Sui's newer funds-accumulator (`balance::send_funds`),
/// which is heavier than a teaching snippet needs. We implement the same linear
/// curve natively here so the mechanics stay legible; reach for the OZ package
/// in real code.
module patterns::vesting;

use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};

#[error(code = 0)]
const EZeroDuration: vector<u8> = b"Vesting duration must be positive";

/// Shared vesting wallet. `phantom C` brands which currency it streams.
public struct VestingWallet<phantom C> has key {
    id: UID,
    beneficiary: address,
    start_ms: u64,
    duration_ms: u64,
    total: u64,     // original grant size, for the linear formula
    released: u64,  // cumulative amount already claimed
    locked: Balance<C>,
}

/// Fund and share a wallet that vests `funds` linearly from `start_ms` over
/// `duration_ms`.
public fun create<C>(
    funds: Coin<C>,
    beneficiary: address,
    start_ms: u64,
    duration_ms: u64,
    ctx: &mut TxContext,
) {
    assert!(duration_ms > 0, EZeroDuration);
    let total = funds.value();
    let wallet = VestingWallet<C> {
        id: object::new(ctx),
        beneficiary,
        start_ms,
        duration_ms,
        total,
        released: 0,
        locked: funds.into_balance(),
    };
    transfer::share_object(wallet);
}

/// Cumulative amount vested by `now_ms` — a straight line clamped to `[0, total]`.
/// Uses u128 intermediates so `total * elapsed` cannot overflow.
public fun vested_amount<C>(wallet: &VestingWallet<C>, now_ms: u64): u64 {
    if (now_ms <= wallet.start_ms) return 0;
    let elapsed = now_ms - wallet.start_ms;
    if (elapsed >= wallet.duration_ms) return wallet.total;
    (((wallet.total as u128) * (elapsed as u128)) / (wallet.duration_ms as u128)) as u64
}

/// Claim everything vested-but-not-yet-released and send it to the beneficiary.
public fun claim<C>(wallet: &mut VestingWallet<C>, clock: &Clock, ctx: &mut TxContext) {
    let releasable = wallet.vested_amount(clock.timestamp_ms()) - wallet.released;
    if (releasable == 0) return;
    wallet.released = wallet.released + releasable;
    let payout = coin::from_balance(wallet.locked.split(releasable), ctx);
    transfer::public_transfer(payout, wallet.beneficiary);
}

public fun released<C>(wallet: &VestingWallet<C>): u64 { wallet.released }

#[test]
fun test_linear_claim_over_time() {
    use sui::test_scenario;
    use sui::clock;
    use sui::sui::SUI;
    let beneficiary = @0xB;
    let mut sc = test_scenario::begin(beneficiary);

    let mut clk = clock::create_for_testing(sc.ctx());
    // 1000 tokens vesting from t=0 over 100 ms.
    let funds = coin::mint_for_testing<SUI>(1000, sc.ctx());
    create(funds, beneficiary, 0, 100, sc.ctx());

    // Halfway: 500 vested.
    sc.next_tx(beneficiary);
    let mut wallet = sc.take_shared<VestingWallet<SUI>>();
    clk.set_for_testing(50);
    claim(&mut wallet, &clk, sc.ctx());
    assert!(wallet.released == 500);

    // Fully vested and past the end: remaining 500 released.
    clk.set_for_testing(200);
    claim(&mut wallet, &clk, sc.ctx());
    assert!(wallet.released == 1000);

    test_scenario::return_shared(wallet);
    clk.destroy_for_testing();
    sc.end();
}
