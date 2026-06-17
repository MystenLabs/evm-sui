# Building a Nautilus Example Locally, for Free

A practical guide to developing a Nautilus app end-to-end on your laptop, with no AWS spend and no Marlin Oyster involvement. The example is a **SUI price oracle** that fetches prices from CoinGecko, signs them in a local Rust server, and verifies the signatures from a Move contract deployed on Sui testnet.

> **Why this works:** the Sui docs explicitly support a "development mode" where you inject a deterministic key into the enclave server and use all-zero PCRs. That lets you skip AWS entirely while still exercising the full signing + on-chain verification loop.

---

## Scope and limits

What this setup gives you:

- Full Rust dev loop for `process_data` (real signatures, real external API calls)
- Full Move contract dev loop on Sui testnet (free SUI from the faucet)
- End-to-end signature verification: server signs → contract verifies
- BCS payload compatibility testing

What it does **not** give you:

- `/get_attestation` endpoint — needs the AWS Nitro Secure Module (NSM) driver, only works inside a real Nitro Enclave
- Real attestation guarantees — all-zero PCRs prove nothing about the binary that ran
- Production safety — the deterministic key trick deliberately breaks the TEE security model

This is **for development only**. Before going to production you must move to real Nitro Enclaves (self-managed EC2 or Marlin Oyster).

---

## Prerequisites

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Sui CLI
brew install sui
# or: cargo install --locked --git https://github.com/MystenLabs/sui.git sui

# jq, used in the curl examples below
brew install jq
```

You do **not** need: AWS CLI, Docker, `make`, Marlin's `oyster-cvm` binary. Save those for production.

---

## Repository layout

After cloning Nautilus you'll work in two trees:

```
nautilus/
├── move/
│   ├── enclave/                  # generic verifier package — do not modify
│   ├── weather-example/          # reference Move app
│   └── price-oracle/             # ← your new Move app (you create this)
└── src/nautilus-server/
    ├── src/
    │   ├── main.rs               # ← inject deterministic key here
    │   ├── common.rs             # get_attestation — do not modify
    │   └── apps/
    │       ├── weather-example/  # reference Rust app
    │       └── price-oracle/     # ← your new Rust app (you create this)
    │           ├── mod.rs
    │           └── allowed_endpoints.yaml
    └── Cargo.toml                # ← add a feature flag for price-oracle
```

The key invariant: a Nautilus "app" is **one Rust feature + one Move package** that share a payload struct. The Rust side signs a BCS-serialized payload; the Move side reconstructs the exact same struct and verifies the signature. Field order matters.

---

## Step 1: Clone and create the app skeleton

```bash
git clone https://github.com/MystenLabs/nautilus.git
cd nautilus

# Rust app folder
mkdir -p src/nautilus-server/src/apps/price-oracle

# Move app folder (copy the structure of weather-example)
cp -r move/weather-example move/price-oracle
```

Before editing anything, **read the existing weather example end-to-end** — both `src/nautilus-server/src/apps/weather-example/mod.rs` and `move/weather-example/sources/weather.move`. Exact import paths and helper function names drift between Nautilus commits, so the reference example in *your* checkout is the source of truth, not this document.

---

## Step 2: Implement the Rust `process_data` endpoint

**`src/nautilus-server/src/apps/price-oracle/allowed_endpoints.yaml`**

```yaml
endpoints:
  - api.coingecko.com
```

**`src/nautilus-server/src/apps/price-oracle/mod.rs`** (sketch — adapt imports to match your checkout):

```rust
use serde::{Deserialize, Serialize};
use crate::common::IntentMessage;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct PriceRequest {
    pub coin_id: String,
    pub vs: String,
}

/// Field order here must match the Move struct PricePayload.
/// BCS is positional, not name-keyed.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PriceResponse {
    pub coin_id: String,
    pub vs: String,
    pub price_micro: u64,
}

const INTENT_PRICE: u8 = 0;

pub async fn process_data(
    _state: &AppState,
    req: PriceRequest,
) -> Result<IntentMessage<PriceResponse>, anyhow::Error> {
    let url = format!(
        "https://api.coingecko.com/api/v3/simple/price?ids={}&vs_currencies={}",
        req.coin_id, req.vs
    );
    let body: serde_json::Value = reqwest::get(&url).await?.json().await?;
    let price = body[&req.coin_id][&req.vs]
        .as_f64()
        .ok_or_else(|| anyhow::anyhow!("price missing in response"))?;

    let resp = PriceResponse {
        coin_id: req.coin_id,
        vs: req.vs,
        price_micro: (price * 1_000_000.0) as u64,
    };

    Ok(IntentMessage::new(INTENT_PRICE, resp))
}
```

Then wire the new module in:

1. Add `pub mod price_oracle;` to `src/nautilus-server/src/apps/mod.rs` behind a `#[cfg(feature = "price-oracle")]`.
2. In `src/nautilus-server/Cargo.toml`, add `price-oracle = []` under `[features]`.
3. In `main.rs`, add the route registration mirroring how `weather-example` is wired.

---

## Step 3: Inject a deterministic signing key

In `src/nautilus-server/src/main.rs`, locate the ephemeral keypair generation block. Replace it with a fixed seed:

```rust
// DEV ONLY — DO NOT SHIP
let secret_seed: [u8; 32] = [42u8; 32];
let signing_key = ed25519_dalek::SigningKey::from_bytes(&secret_seed);
let verifying_key = signing_key.verifying_key();
println!("DEV PUBKEY (hex): {}", hex::encode(verifying_key.as_bytes()));
```

Save the printed pubkey hex — you'll need it in Step 7.

---

## Step 4: Run the server and smoke-test

```bash
cd src/nautilus-server
RUST_LOG=debug cargo run --features=price-oracle --bin nautilus-server
```

In another terminal:

```bash
curl -X GET http://localhost:3000/health_check

curl -H 'Content-Type: application/json' \
     -d '{"payload": {"coin_id": "sui", "vs": "usd"}}' \
     -X POST http://localhost:3000/process_data
```

Expected shape:

```json
{
  "response": {
    "intent": 0,
    "timestamp_ms": 1747900000000,
    "data": { "coin_id": "sui", "vs": "usd", "price_micro": 3450000 }
  },
  "signature": "b75d2d44...0a"
}
```

`/get_attestation` will fail with an NSM error — expected locally.

---

## Step 5: Write the Move side

```move
module price_oracle::oracle;

use enclave::enclave::{Self, Enclave};

public struct ORACLE has drop {}

public struct PriceData has key, store {
    id: UID,
    coin_id: vector<u8>,
    vs: vector<u8>,
    price_micro: u64,
}

/// Field order MUST match PriceResponse in Rust.
public struct PricePayload has copy, drop {
    coin_id: vector<u8>,
    vs: vector<u8>,
    price_micro: u64,
}

const INTENT_PRICE: u8 = 0;

fun init(otw: ORACLE, ctx: &mut TxContext) {
    enclave::create_enclave_config<ORACLE>(otw, ctx);
}

public fun update_price<T>(
    enclave: &Enclave<T>,
    signature: vector<u8>,
    timestamp_ms: u64,
    coin_id: vector<u8>,
    vs: vector<u8>,
    price_micro: u64,
    ctx: &mut TxContext,
) {
    let payload = PricePayload { coin_id, vs, price_micro };
    assert!(
        enclave::verify_signature(enclave, INTENT_PRICE, timestamp_ms, payload, signature),
        0
    );
    transfer::share_object(PriceData {
        id: object::new(ctx),
        coin_id, vs, price_micro,
    });
}
```

> The exact signature of `verify_signature` and the `init` pattern vary across Nautilus commits. Copy the shape from `move/weather-example/sources/weather.move` in your checkout.

---

## Step 6: BCS compatibility tests (do not skip)

BCS is positional — any field reordering silently breaks verification. Write matching tests on both sides:

**Rust:**
```rust
#[test]
fn test_payload_bcs() {
    let resp = PriceResponse {
        coin_id: "sui".to_string(),
        vs: "usd".to_string(),
        price_micro: 3_450_000,
    };
    let bytes = bcs::to_bytes(&resp).unwrap();
    println!("rust bcs: {}", hex::encode(&bytes));
}
```

**Move:**
```move
#[test]
fun test_payload_bcs() {
    let p = PricePayload { coin_id: b"sui", vs: b"usd", price_micro: 3_450_000 };
    let bytes = bcs::to_bytes(&p);
    std::debug::print(&bytes);
}
```

If the hex doesn't match byte-for-byte, fix the structs before going further.

---

## Step 7: Deploy and register on testnet

```bash
sui client switch --env testnet
sui client faucet

# Publish enclave verifier
cd move/enclave && sui move build && sui client publish
# → ENCLAVE_PACKAGE_ID

# Publish your app
cd ../price-oracle && sui move build && sui client publish
# → APP_PACKAGE_ID, CAP_OBJECT_ID, ENCLAVE_CONFIG_OBJECT_ID
```

Register all-zero PCRs + deterministic pubkey:

```bash
PCR_ZERO=000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000

sui client call --function update_pcrs \
  --module enclave --package $ENCLAVE_PACKAGE_ID \
  --type-args "$APP_PACKAGE_ID::oracle::ORACLE" \
  --args $ENCLAVE_CONFIG_OBJECT_ID $CAP_OBJECT_ID \
         0x$PCR_ZERO 0x$PCR_ZERO 0x$PCR_ZERO
```

Register the pubkey (use `register_enclave_dev` if available, or add a dev-only entry point — the standard `register_enclave` requires a real attestation document).

---

## Step 8: Close the loop end-to-end

```bash
RESP=$(curl -s -H 'Content-Type: application/json' \
       -d '{"payload": {"coin_id": "sui", "vs": "usd"}}' \
       -X POST http://localhost:3000/process_data)

SIG=$(echo $RESP | jq -r .signature)
TS=$(echo $RESP | jq -r .response.timestamp_ms)
PRICE=$(echo $RESP | jq -r .response.data.price_micro)

sui client call --function update_price \
  --module oracle --package $APP_PACKAGE_ID \
  --type-args "$APP_PACKAGE_ID::oracle::ORACLE" \
  --args $ENCLAVE_OBJECT_ID "0x$SIG" $TS \
         "[0x73,0x75,0x69]" "[0x75,0x73,0x64]" $PRICE
```

Dev loop from here: edit Rust → restart server → curl → `sui client call`. No re-registration unless you change the payload struct.

---

## Graduating to production

Once the local loop works:

1. **AWS Nitro EC2** (~$0.19/hr) — follow the official "Using Nautilus" guide.
2. **Marlin Oyster** (pay-per-minute in USDC) — Docker-based, managed enclave lifecycle.

In both cases: remove deterministic key, use real PCRs from `make ENCLAVE_APP=price-oracle`, use standard `register_enclave.sh`.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Signature verification fails on-chain | BCS field order mismatch. Re-run Step 6. |
| Pubkey changes every restart | Deterministic key injection missing. Check Step 3. |
| `/get_attestation` returns NSM error | Expected locally. Skip it. |
| `ed25519_dalek::SigningKey::from_bytes` fails | API drift in `ed25519-dalek` v2. Match the version in `Cargo.toml`. |
| Intent byte mismatch | Rust prepends intent byte before signing; Move must pass the same one. |
| CoinGecko times out | Free-tier rate limits. Add delay or swap source. |

---

## References

- [Nautilus overview](https://docs.sui.io/sui-stack/nautilus)
- [Using Nautilus (AWS path)](https://docs.sui.io/sui-stack/nautilus/using-nautilus)
- [Customizing & local dev](https://docs.sui.io/sui-stack/nautilus/customize-nautilus)
- [MystenLabs/nautilus](https://github.com/MystenLabs/nautilus)
- [MystenLabs/nautilus-twitter](https://github.com/MystenLabs/nautilus-twitter)
- [Marlin Oyster docs](https://docs.marlin.org/oyster/introduction-to-marlin/)
