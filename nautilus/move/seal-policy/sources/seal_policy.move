// SPDX-License-Identifier: Apache-2.0

/// Seal access-policy backed by a Nautilus enclave.
/// Checks that the caller owns the ephemeral wallet key the enclave
/// certified, gating Seal decryption on TEE attestation.
module seal_policy::seal_policy;

use enclave::enclave::{Enclave, create_intent_message};
use rfq::rfq::RFQ;
use sui::{bcs, ed25519, hash::blake2b256};

const ENoAccess: u64 = 0;
const WalletPKIntent: u8 = 1;

/// Signing payload struct signed by the enclave keypair.
public struct WalletPK has drop {
    pk: vector<u8>,
}

/// Seal approve policy that checks:
/// 1) The ID used to derive Seal key is always vector[0].
/// 2) The sender matches the wallet PK hash.
/// 3) The signature is verified against the enclave's registered
///    ephemeral pk and its payload (the bcs bytes of the intent
///    message of the wallet PK and the timestamp).
entry fun seal_approve(
    id: vector<u8>,
    signature: vector<u8>,
    wallet_pk: vector<u8>,
    timestamp: u64,
    enclave: &Enclave<RFQ>,
    ctx: &TxContext,
) {
    assert!(id == vector[0u8], ENoAccess);
    assert!(ctx.sender().to_bytes() == pk_to_address(&wallet_pk), ENoAccess);

    let signing_payload = create_intent_message(
        WalletPKIntent,
        timestamp,
        WalletPK { pk: wallet_pk },
    );
    let payload = bcs::to_bytes(&signing_payload);
    assert!(ed25519::ed25519_verify(&signature, enclave.pk(), &payload), ENoAccess);
}

/// Derive a Sui address from an ed25519 public key:
/// blake2b_hash(flag || pk) where flag = 0x00 for ed25519.
fun pk_to_address(pk: &vector<u8>): vector<u8> {
    let mut arr = vector[0u8];
    arr.append(*pk);
    blake2b256(&arr)
}
