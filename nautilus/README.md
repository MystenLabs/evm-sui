# Nautilus — TEE-Backed Computation Showcases

Three end-to-end examples of using [Nautilus](https://docs.sui.io/sui-stack/nautilus)
(Sui's TEE enclave framework) for off-chain computation with on-chain settlement.
Each showcase follows the same pattern:

1. **Clients** submit data to a Nautilus enclave via HTTP.
2. The **enclave** (Rust, runs inside AWS Nitro / Intel SGX) processes the data,
   writes an attestation proof to **Walrus**, and signs a settlement transaction.
3. The settlement is committed on **Sui** (Move) or an **EVM chain** (Solidity).

## Directory layout

```
nautilus/
├── move/                        # Sui Move packages
│   ├── enclave/                 #   shared enclave-identity module
│   ├── rfq/                     #   RFQ settlement
│   ├── liquidation/             #   liquidation settlement
│   ├── batch-swap/              #   batch swap settlement
│   └── seal-policy/             #   Seal access-policy for encrypted order data
│
├── contracts/                   # EVM Solidity contracts (Foundry)
│   ├── src/
│   │   ├── RfqSettlement.sol
│   │   ├── LiquidationSettlement.sol
│   │   └── BatchSwapSettlement.sol
│   └── test/                    #   12 tests across 3 suites
│
├── enclave-server/              # Rust enclave server (shared across all three)
│   └── src/
│
├── rfq/                         # TypeScript CLI — RFQ workflow
│   └── src/
├── liquidation/                 # TypeScript CLI — liquidation workflow
│   └── src/
└── batch-swap/                  # TypeScript CLI — batch swap workflow
    └── src/
```

## Quick start

### Move packages

```bash
cd nautilus/move/rfq
sui move build
sui move test
# repeat for liquidation/, batch-swap/, enclave/, seal-policy/
```

### Rust enclave server

```bash
cd nautilus/enclave-server
cargo test
cargo build --release
```

### Solidity contracts

```bash
cd nautilus/contracts
forge install --no-git foundry-rs/forge-std  # first time only
forge test -vv
```

### TypeScript CLIs

```bash
# from repo root
pnpm install
# then in any of rfq/, liquidation/, batch-swap/:
cd nautilus/rfq
cp .env.example .env   # fill in values
pnpm submit-rfq
pnpm settle
```

## Architecture

```
  ┌──────────┐       ┌─────────────────┐       ┌──────────┐
  │  Client   │──────▶│  Nautilus TEE    │──────▶│  Walrus  │
  │  (TS CLI) │  HTTP │  (Rust enclave)  │ proof │  (blob)  │
  └──────────┘       └────────┬─────────┘       └──────────┘
                              │ signed tx
                     ┌────────▼─────────┐
                     │  Sui / EVM chain  │
                     │  (settlement)     │
                     └──────────────────┘
```

Each showcase varies *what* the enclave computes:

| Showcase | Enclave logic | Settlement |
|---|---|---|
| **RFQ** | Best-quote selection from competing makers | Winner + price recorded |
| **Liquidation** | Health-factor check + bonus calculation | Position seizure recorded |
| **Batch Swap** | Uniform clearing price across buy/sell intents | Aggregate fill recorded |

All three store a `proofBlobId` pointing to the Walrus blob containing the
full enclave attestation, so any observer can verify the computation was
performed inside a trusted enclave.

## BCS compatibility

The Move structs and the Solidity structs are intentionally field-compatible
so the same BCS-encoded payload can be verified on either chain. The
`enclave-server` serialises settlement data using Sui BCS, and both the Move
`settle` functions and the Solidity `settle*` functions accept the same
logical fields in the same order.

When extending a struct, add new fields at the end to preserve backward
compatibility with existing BCS decoders.
