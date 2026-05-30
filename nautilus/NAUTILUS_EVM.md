# Nautilus + EVM: Architecture Reference

This directory contains the research and visual artifacts for integrating Nautilus (Sui's TEE framework) with EVM dapps.

## Visual Artifacts

- **[wtf-is-nautilus.html](./wtf-is-nautilus.html)** — What Nautilus is, how it uses Sui (two-phase pattern), Nautilus vs Nitro vs Oyster, EVM comparison matrix, local mocking mechanics, and decision flowchart.

- **[nautilus-evm-trust-layer.html](./nautilus-evm-trust-layer.html)** — The "complementary trust layer" thesis: why Nautilus + Sui can serve as a verification root for EVM dapps rather than requiring a full migration. Covers the dual-chain architecture, the Seal + Nautilus + Sui + EVM stack, the cross-chain settlement pattern, and honest weaknesses.

## Core Thesis

Nautilus is not an EVM replacement. It's a complementary verification layer:

- **Sui** handles expensive attestation verification (cheap on Move, ~70M gas on Solidity) + PCR governance + Seal policy management
- **Nautilus enclave** dual-signs results — Ed25519 for Sui, secp256k1 for EVM
- **EVM** consumes verified results for settlement where the liquidity is
- **Seal** (optional) adds persistent encrypted state with policy-gated access — the piece no EVM TEE solution offers

The Sui layer only earns its keep when you need Seal (encryption at rest) or Move-safety for governance. For pure attested compute, Marlin Oyster from EVM is simpler.

## Key Technical Details

### Three Keypairs Inside the Enclave
1. **Ephemeral Ed25519** — signs responses; pubkey registered on Sui
2. **Seal wallet Ed25519** — signs Seal certificate for key requests
3. **ElGamal BLS** — decrypts Seal key server responses

### Seal Integration (Two-Step Key Load)
Enclaves have no direct internet access. Seal keys are loaded via:
1. Enclave returns `FetchKeyRequest` (signed certificate + PTB)
2. Host fetches keys from Seal key servers (30-min certificate TTL)
3. Host passes encrypted responses back to enclave
4. Enclave decrypts and caches keys in memory

### Seal Policy Pattern
```move
entry fun seal_approve(id: vector<u8>, enclave: &Enclave) {
    // If this doesn't abort, key servers grant decryption.
    // Only an enclave with registered PCRs satisfies this.
    assert!(enclave.is_active(), EEnclaveNotActive);
}
```

### BCS Coupling
Rust struct field order must match Move struct field order exactly. BCS is positional, not name-keyed. Mismatch = silent signature verification failure.

### Honest Weaknesses
1. **Bridge trust** — Wormhole/Axelar between Sui and EVM adds attack surface
2. **Dual-sign untested** — Ed25519+BCS for Sui + secp256k1+ABI for EVM is architecturally clean but unshipped
3. **Seal is early** — the Seal+Nautilus combined pattern is a documented design, not battle-tested production
4. **AWS Nitro lock-in** — single TEE vendor; Mysten says multi-TEE "may be considered in the future"
5. **Seal+Nautilus not tested on Marlin Oyster** — only on self-managed AWS Nitro

## Dev Guide

See [NAUTILUS_LOCAL_DEV.md](./NAUTILUS_LOCAL_DEV.md) for a step-by-step local development walkthrough (price oracle, $0 AWS cost).

## References

- [Nautilus docs](https://docs.sui.io/sui-stack/nautilus)
- [Nautilus + Seal integration](https://docs.sui.io/sui-stack/nautilus/seal)
- [Seal docs](https://docs.sui.io/sui-stack/seal)
- [MystenLabs/nautilus](https://github.com/MystenLabs/nautilus)
- [MystenLabs/nautilus-twitter](https://github.com/MystenLabs/nautilus-twitter)
- [Marlin Oyster Sui demo](https://github.com/marlinprotocol/sui-oyster-demo)
