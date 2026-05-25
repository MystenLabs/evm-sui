// SPDX-License-Identifier: MIT
//
// BCS round-trip — must agree byte-for-byte with
// `enclave/src/apps/price_oracle/mod.rs::tests::print_payload_bcs`.
// If you reorder fields, expect signature verification to silently fail
// on-chain; this test catches the drift before it ships.

#[test_only]
module price_oracle::oracle_tests;

use std::bcs;
use enclave::enclave;

#[test_only]
public struct PricePayload has copy, drop {
    coin_id: std::string::String,
    vs: std::string::String,
    price_micro: u64,
}

const EBcsDrift: u64 = 0;

#[test]
fun payload_bcs_layout() {
    let intent: u8 = 0;
    let timestamp_ms: u64 = 1_700_000_000_000;
    let payload = PricePayload {
        coin_id: b"sui".to_string(),
        vs: b"usd".to_string(),
        price_micro: 3_450_000,
    };
    let msg = enclave::create_intent_message(intent, timestamp_ms, payload);
    let bytes = bcs::to_bytes(&msg);
    assert!(
        bytes == x"000068e5cf8b010000037375690375736490a4340000000000",
        EBcsDrift,
    );
}
