// SPDX-License-Identifier: Apache-2.0

/// RFQ (Request-for-Quote) settlement via Nautilus TEE attestation.
/// The enclave matches takers with the best maker quote off-chain,
/// then signs the result so it can be verified and recorded on-chain.
module rfq::rfq;

use enclave::enclave::{Self, Enclave};

// ── Constants ──────────────────────────────────────────────────────

const RFQ_INTENT: u8 = 0;
const EInvalidSignature: u64 = 1;

// ── OTW ────────────────────────────────────────────────────────────

public struct RFQ has drop {}

// ── On-chain receipt ───────────────────────────────────────────────

public struct SettledRfq has key, store {
    id: UID,
    rfq_id: vector<u8>,
    taker: address,
    winning_maker: vector<u8>,
    base_token: vector<u8>,
    quote_token: vector<u8>,
    amount: u64,
    price: u64,
    timestamp_ms: u64,
    walrus_proof_blob_id: vector<u8>,
}

// ── Payload signed by the enclave ──────────────────────────────────

public struct RfqPayload has copy, drop {
    rfq_id: vector<u8>,
    winning_maker: vector<u8>,
    base_token: vector<u8>,
    quote_token: vector<u8>,
    amount: u64,
    price: u64,
    walrus_proof_blob_id: vector<u8>,
}

// ── Init: create enclave config (zero PCRs for dev) ────────────────

fun init(otw: RFQ, ctx: &mut TxContext) {
    let cap = enclave::new_cap(otw, ctx);

    cap.create_enclave_config(
        b"rfq enclave".to_string(),
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        ctx,
    );

    transfer::public_transfer(cap, ctx.sender());
}

// ── Public entry: settle an RFQ ────────────────────────────────────

public fun settle_rfq<T>(
    rfq_id: vector<u8>,
    winning_maker: vector<u8>,
    base_token: vector<u8>,
    quote_token: vector<u8>,
    amount: u64,
    price: u64,
    timestamp_ms: u64,
    walrus_proof_blob_id: vector<u8>,
    sig: &vector<u8>,
    enclave: &Enclave<T>,
    ctx: &mut TxContext,
): SettledRfq {
    let payload = RfqPayload {
        rfq_id,
        winning_maker,
        base_token,
        quote_token,
        amount,
        price,
        walrus_proof_blob_id,
    };

    let valid = enclave.verify_signature(RFQ_INTENT, timestamp_ms, payload, sig);
    assert!(valid, EInvalidSignature);

    SettledRfq {
        id: object::new(ctx),
        rfq_id,
        taker: ctx.sender(),
        winning_maker,
        base_token,
        quote_token,
        amount,
        price,
        timestamp_ms,
        walrus_proof_blob_id,
    }
}
