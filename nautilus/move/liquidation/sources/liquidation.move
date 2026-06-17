// SPDX-License-Identifier: Apache-2.0

/// Lending-protocol liquidation settlement via Nautilus TEE attestation.
/// The enclave runs a sealed Dutch auction among liquidator bids off-chain,
/// then signs the winning result for on-chain verification and recording.
module liquidation::liquidation;

use enclave::enclave::{Self, Enclave};

// ── Constants ──────────────────────────────────────────────────────

const LIQUIDATION_INTENT: u8 = 0;
const EInvalidSignature: u64 = 1;

// ── OTW ────────────────────────────────────────────────────────────

public struct LIQUIDATION has drop {}

// ── On-chain receipt ───────────────────────────────────────────────

public struct SettledLiquidation has key, store {
    id: UID,
    position_id: vector<u8>,
    borrower: vector<u8>,
    winning_bidder: vector<u8>,
    collateral_token: vector<u8>,
    debt_token: vector<u8>,
    collateral_amount: u64,
    debt_amount: u64,
    liquidation_bonus_bps: u64,
    timestamp_ms: u64,
    walrus_proof_blob_id: vector<u8>,
}

// ── Payload signed by the enclave ──────────────────────────────────

public struct LiquidationPayload has copy, drop {
    position_id: vector<u8>,
    borrower: vector<u8>,
    winning_bidder: vector<u8>,
    collateral_token: vector<u8>,
    debt_token: vector<u8>,
    collateral_amount: u64,
    debt_amount: u64,
    liquidation_bonus_bps: u64,
    walrus_proof_blob_id: vector<u8>,
}

// ── Init: create enclave config (zero PCRs for dev) ────────────────

fun init(otw: LIQUIDATION, ctx: &mut TxContext) {
    let cap = enclave::new_cap(otw, ctx);

    cap.create_enclave_config(
        b"liquidation enclave".to_string(),
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        ctx,
    );

    transfer::public_transfer(cap, ctx.sender());
}

// ── Public entry: execute a liquidation ────────────────────────────

public fun execute_liquidation<T>(
    position_id: vector<u8>,
    borrower: vector<u8>,
    winning_bidder: vector<u8>,
    collateral_token: vector<u8>,
    debt_token: vector<u8>,
    collateral_amount: u64,
    debt_amount: u64,
    liquidation_bonus_bps: u64,
    timestamp_ms: u64,
    walrus_proof_blob_id: vector<u8>,
    sig: &vector<u8>,
    enclave: &Enclave<T>,
    ctx: &mut TxContext,
): SettledLiquidation {
    let payload = LiquidationPayload {
        position_id,
        borrower,
        winning_bidder,
        collateral_token,
        debt_token,
        collateral_amount,
        debt_amount,
        liquidation_bonus_bps,
        walrus_proof_blob_id,
    };

    let valid = enclave.verify_signature(
        LIQUIDATION_INTENT,
        timestamp_ms,
        payload,
        sig,
    );
    assert!(valid, EInvalidSignature);

    SettledLiquidation {
        id: object::new(ctx),
        position_id,
        borrower,
        winning_bidder,
        collateral_token,
        debt_token,
        collateral_amount,
        debt_amount,
        liquidation_bonus_bps,
        timestamp_ms,
        walrus_proof_blob_id,
    }
}
