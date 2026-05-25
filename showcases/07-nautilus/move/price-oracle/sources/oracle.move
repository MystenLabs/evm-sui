// SPDX-License-Identifier: MIT
//
// Showcase 07 — Nautilus price oracle (Sui side).
//
// Flow:
//   1. Off-chain Rust enclave fetches a price from CoinGecko, BCS-encodes
//      IntentMessage<PricePayload>, signs it with its ephemeral ed25519 key.
//   2. Anyone submits the signed payload here; verify_signature is the
//      single gate. PCRs + pubkey were registered up-front via the generic
//      `enclave` package.
//
// The local-dev recipe (NAUTILUS_LOCAL_DEV.md) registers all-zero PCRs and
// a deterministic pubkey so this loop closes without ever paying for AWS
// Nitro.

module price_oracle::oracle;

use enclave::enclave::{Self, Enclave};
use std::string::String;

const PRICE_INTENT: u8 = 0;
const EInvalidSignature: u64 = 1;

/// The on-chain record minted from each verified price update.
public struct PriceFeed has key, store {
    id: UID,
    coin_id: String,
    vs: String,
    price_micro: u64,
    timestamp_ms: u64,
}

/// Field order MUST match `PriceResponse` in
/// `enclave/src/apps/price_oracle/mod.rs`. BCS is positional — reordering
/// here silently breaks signature verification.
public struct PricePayload has copy, drop {
    coin_id: String,
    vs: String,
    price_micro: u64,
}

/// One-time witness — initialises the EnclaveConfig with all-zero PCRs.
/// Replace zeros with real PCR0/PCR1/PCR2 before going to production.
public struct ORACLE has drop {}

fun init(otw: ORACLE, ctx: &mut TxContext) {
    let cap = enclave::new_cap(otw, ctx);
    cap.create_enclave_config(
        b"price oracle enclave".to_string(),
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // pcr0
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // pcr1
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // pcr2
        ctx,
    );
    transfer::public_transfer(cap, ctx.sender());
}

/// Submit a signed price quote. Reverts unless the enclave's registered
/// pubkey signs `intent || timestamp_ms || bcs(PricePayload)`.
public fun update_price<T>(
    coin_id: String,
    vs: String,
    price_micro: u64,
    timestamp_ms: u64,
    sig: &vector<u8>,
    enclave: &Enclave<T>,
    ctx: &mut TxContext,
): PriceFeed {
    let payload = PricePayload { coin_id, vs, price_micro };
    let ok = enclave.verify_signature(PRICE_INTENT, timestamp_ms, payload, sig);
    assert!(ok, EInvalidSignature);

    PriceFeed {
        id: object::new(ctx),
        coin_id,
        vs,
        price_micro,
        timestamp_ms,
    }
}
