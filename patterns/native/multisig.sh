#!/usr/bin/env bash
# 08 — Multisig, the Sui way: NO CONTRACT.
#
# On EVM a multisig is a deployed contract (Safe): owners submit, co-owners
# confirm on-chain (a transaction each), then anyone executes. See
# ../solidity/src/08_Multisig.sol.
#
# On Sui, multisig is a NATIVE address scheme. A multisig address is literally
# a k-of-n combination of public keys (ed25519 / secp256k1 / secp256r1).
# Signatures are gathered OFF-CHAIN and combined into one signature; the
# resulting transaction is an ordinary transaction from an ordinary address.
# No contract to deploy, audit, or pay coordination gas to.
set -euo pipefail

# 1. Define the multisig: three signers, threshold 2, equal weights.
#    (In practice each signer runs this with their own key in the keystore.)
sui keytool multi-sig-address \
  --pks   "$PK1" "$PK2" "$PK3" \
  --weights 1 1 1 \
  --threshold 2
# → prints the multisig Sui address. Fund it like any other address.

# 2. Build a transaction FROM the multisig address (e.g. a transfer) and
#    serialize it to base64 (unsigned tx bytes):
TX_BYTES=$(sui client transfer-sui \
  --to "$RECIPIENT" --sui-coin-object-id "$COIN" --gas-budget 3000000 \
  --serialize-unsigned-transaction)

# 3. Each of two signers signs the SAME bytes independently (off-chain):
SIG1=$(sui keytool sign --address "$SIGNER1" --data "$TX_BYTES" --json | jq -r .suiSignature)
SIG2=$(sui keytool sign --address "$SIGNER2" --data "$TX_BYTES" --json | jq -r .suiSignature)

# 4. Combine the partial signatures into ONE multisig signature:
MULTISIG_SIG=$(sui keytool multi-sig-combine-partial-sig \
  --pks "$PK1" "$PK2" "$PK3" --weights 1 1 1 --threshold 2 \
  --sigs "$SIG1" "$SIG2" --json | jq -r .multisigSerialized)

# 5. Submit as a single normal transaction:
sui client execute-signed-tx --tx-bytes "$TX_BYTES" --signatures "$MULTISIG_SIG"

# That's the whole feature. The "M-of-N confirmations" loop that costs a
# transaction per co-signer on EVM happens here as free off-chain signing.
