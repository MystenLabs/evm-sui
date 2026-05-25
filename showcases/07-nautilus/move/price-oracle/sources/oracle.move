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
use sui::clock::Clock;

const PRICE_INTENT: u8 = 0;
const EInvalidSignature: u64 = 1;
const EStalePrice: u64 = 2;

const MAX_STALENESS_MS: u64 = 60_000;

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
/// pubkey signs `intent || timestamp_ms || bcs(PricePayload)` and the
/// timestamp is within MAX_STALENESS_MS of the on-chain clock.
///
/// NOTE: config_version staleness (enclave.config_version < config.version)
/// is a known simplification — this showcase trusts the registered enclave
/// unconditionally. A production oracle should check config_version against
/// the current EnclaveConfig and reject stale enclaves.
public fun update_price<T>(
    coin_id: String,
    vs: String,
    price_micro: u64,
    timestamp_ms: u64,
    sig: &vector<u8>,
    enclave: &Enclave<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): PriceFeed {
    assert!(timestamp_ms >= clock.timestamp_ms() - MAX_STALENESS_MS, EStalePrice);

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

// --- PriceFeed accessors ---

#[test_only]
public fun new_price_payload(coin_id: String, vs: String, price_micro: u64): PricePayload {
    PricePayload { coin_id, vs, price_micro }
}

public fun coin_id(feed: &PriceFeed): &String { &feed.coin_id }
public fun vs(feed: &PriceFeed): &String { &feed.vs }
public fun price_micro(feed: &PriceFeed): u64 { feed.price_micro }
public fun timestamp_ms(feed: &PriceFeed): u64 { feed.timestamp_ms }
