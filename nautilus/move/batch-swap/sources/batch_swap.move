// SPDX-License-Identifier: Apache-2.0

/// Batch-auction swap settlement via Nautilus TEE attestation.
/// The enclave collects buy/sell intents, computes a uniform clearing
/// price off-chain, then signs the result for on-chain settlement.
module batch_swap::batch_swap;

use enclave::enclave::{Self, Enclave};

// ── Constants ──────────────────────────────────────────────────────

const BATCH_SWAP_INTENT: u8 = 0;
const EInvalidSignature: u64 = 1;

// ── OTW ────────────────────────────────────────────────────────────

public struct BATCH_SWAP has drop {}

// ── On-chain receipt ───────────────────────────────────────────────

public struct SettledBatch has key, store {
    id: UID,
    batch_id: vector<u8>,
    token_pair: vector<u8>,
    clearing_price: u64,
    total_buy_filled: u64,
    total_sell_filled: u64,
    num_participants: u64,
    timestamp_ms: u64,
    walrus_proof_blob_id: vector<u8>,
}

// ── Payload signed by the enclave ──────────────────────────────────

public struct BatchSwapPayload has copy, drop {
    batch_id: vector<u8>,
    token_pair: vector<u8>,
    clearing_price: u64,
    total_buy_filled: u64,
    total_sell_filled: u64,
    num_participants: u64,
    walrus_proof_blob_id: vector<u8>,
}

// ── Init: create enclave config (zero PCRs for dev) ────────────────

fun init(otw: BATCH_SWAP, ctx: &mut TxContext) {
    let cap = enclave::new_cap(otw, ctx);

    cap.create_enclave_config(
        b"batch swap enclave".to_string(),
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        ctx,
    );

    transfer::public_transfer(cap, ctx.sender());
}

// ── Public entry: settle a batch ───────────────────────────────────

public fun settle_batch<T>(
    batch_id: vector<u8>,
    token_pair: vector<u8>,
    clearing_price: u64,
    total_buy_filled: u64,
    total_sell_filled: u64,
    num_participants: u64,
    timestamp_ms: u64,
    walrus_proof_blob_id: vector<u8>,
    sig: &vector<u8>,
    enclave: &Enclave<T>,
    ctx: &mut TxContext,
): SettledBatch {
    let payload = BatchSwapPayload {
        batch_id,
        token_pair,
        clearing_price,
        total_buy_filled,
        total_sell_filled,
        num_participants,
        walrus_proof_blob_id,
    };

    let valid = enclave.verify_signature(BATCH_SWAP_INTENT, timestamp_ms, payload, sig);
    assert!(valid, EInvalidSignature);

    SettledBatch {
        id: object::new(ctx),
        batch_id,
        token_pair,
        clearing_price,
        total_buy_filled,
        total_sell_filled,
        num_participants,
        timestamp_ms,
        walrus_proof_blob_id,
    }
}
