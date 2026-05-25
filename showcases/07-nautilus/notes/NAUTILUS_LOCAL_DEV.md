# Building Nautilus Apps Locally, for Free

A practical guide to developing Nautilus apps end-to-end on your laptop, with no AWS spend and no Marlin Oyster involvement. The reference walkthrough (Steps 1–9) builds a **SUI price oracle** that fetches prices from CoinGecko, signs them in a local Rust server, and verifies the signatures from a Move contract deployed on Sui testnet. The [App Catalog](#app-catalog--the-other-eleven-categories) extends this to eleven more categories — every trust-failure class documented in [NAUTILUS_EVM.md](./NAUTILUS_EVM.md).

> **Why this works:** the Sui docs explicitly support a "development mode" where you inject a deterministic key into the enclave server and use all-zero PCRs. That lets you skip AWS entirely while still exercising the full signing + on-chain verification loop.

---

## Table of contents

### Reference walkthrough — price oracle (Category 1)

1. [Scope and limits](#scope-and-limits)
2. [Prerequisites](#prerequisites)
3. [Repository layout](#repository-layout)
4. [Step 1: Clone Nautilus and create the app skeleton](#step-1-clone-nautilus-and-create-the-app-skeleton)
5. [Step 2: Implement the Rust `process_data` endpoint](#step-2-implement-the-rust-process_data-endpoint)
6. [Step 3: Inject a deterministic signing key](#step-3-inject-a-deterministic-signing-key)
7. [Step 4: Run the server locally and smoke-test it](#step-4-run-the-server-locally-and-smoke-test-it)
8. [Step 5: Write the Move side](#step-5-write-the-move-side)
9. [Step 6: BCS compatibility tests (do not skip)](#step-6-bcs-compatibility-tests-do-not-skip)
10. [Step 7: Deploy to Sui testnet](#step-7-deploy-to-sui-testnet)
11. [Step 8: Register all-zero PCRs and the injected pubkey](#step-8-register-all-zero-pcrs-and-the-injected-pubkey)
12. [Step 9: Close the loop end-to-end](#step-9-close-the-loop-end-to-end)

### App catalog — the other eleven categories

13. [How to read the catalog](#how-to-read-the-catalog)
14. [Intent byte allocation](#intent-byte-allocation)
15. [Cat 2 — Verifiable off-chain compute (ML inference)](#cat-2--verifiable-off-chain-compute-ml-inference)
16. [Cat 3 — Secret management (API key proxy)](#cat-3--secret-management-api-key-proxy)
17. [Cat 4 — MEV / sealed-bid auction](#cat-4--mev--sealed-bid-auction)
18. [Cat 5 — Cross-chain bridge relay](#cat-5--cross-chain-bridge-relay)
19. [Cat 6 — Game logic (card dealer)](#cat-6--game-logic-card-dealer)
20. [Cat 7 — KYC / identity attestation](#cat-7--kyc--identity-attestation)
21. [Cat 8 — AI agent with on-chain footprint](#cat-8--ai-agent-with-on-chain-footprint)
22. [Cat 9 — Hybrid randomness (external + on-chain)](#cat-9--hybrid-randomness-external--on-chain)
23. [Cat 10 — Social / real-world data attestation](#cat-10--social--real-world-data-attestation)
24. [Cat 11 — Confidential DeFi (dark pool)](#cat-11--confidential-defi-dark-pool)
25. [Cat 12 — TEE-backed signer (account abstraction)](#cat-12--tee-backed-signer-account-abstraction)

### Shared infrastructure

26. [When to graduate off the local setup](#when-to-graduate-off-the-local-setup)
27. [Troubleshooting](#troubleshooting)
28. [References](#references)

---

## Scope and limits

What this setup gives you:

- ✅ Full Rust dev loop for `process_data` (real signatures, real external API calls)
- ✅ Full Move contract dev loop on Sui testnet (free SUI from the faucet)
- ✅ End-to-end signature verification: server signs → contract verifies
- ✅ BCS payload compatibility testing

What it does **not** give you:

- ❌ `get_attestation` endpoint — needs the AWS Nitro Secure Module (NSM) driver and only works inside a real Nitro Enclave
- ❌ Real attestation guarantees — all-zero PCRs prove nothing about the binary that ran
- ❌ Production safety — the deterministic key trick deliberately breaks the TEE security model

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

Sanity-check:

```bash
rustc --version
sui --version
jq --version
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

## Step 1: Clone Nautilus and create the app skeleton

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
    pub coin_id: String,   // e.g. "sui"
    pub vs: String,        // e.g. "usd"
}

/// IMPORTANT: field order here must match the Move struct PricePayload.
/// BCS is positional, not name-keyed.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PriceResponse {
    pub coin_id: String,
    pub vs: String,
    pub price_micro: u64,  // price * 1_000_000 — integer-friendly for Move
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

    // IntentMessage handles intent byte + timestamp + signing.
    // Check IntentMessage::new in your checkout for the exact constructor.
    Ok(IntentMessage::new(INTENT_PRICE, resp))
}
```

Then wire the new module in:

1. Add `pub mod price_oracle;` to `src/nautilus-server/src/apps/mod.rs` behind a `#[cfg(feature = "price-oracle")]`.
2. In `src/nautilus-server/Cargo.toml`, add:
   ```toml
   [features]
   price-oracle = []
   ```
3. In `main.rs`, add the route registration for `price-oracle`, mirroring how `weather-example` is wired.

---

## Step 3: Inject a deterministic signing key

In `src/nautilus-server/src/main.rs`, locate the ephemeral keypair generation block (near the top of the server startup; check around the line the docs reference as line ~16). Replace it with a fixed seed:

```rust
// ===== DEV ONLY — DO NOT SHIP =====
// Replaces the per-startup random key with a fixed deterministic key
// so the same pubkey can be registered onchain once and reused.
let secret_seed: [u8; 32] = [42u8; 32]; // any fixed 32 bytes
let signing_key = ed25519_dalek::SigningKey::from_bytes(&secret_seed);
let verifying_key = signing_key.verifying_key();
println!("DEV PUBKEY (hex): {}", hex::encode(verifying_key.as_bytes()));
// ==================================
```

Two reasons this matters:

1. The Move contract pins a specific enclave pubkey via `register_enclave`. If the key changes every restart, you re-register every time.
2. With a stable key, your dev loop is: edit Rust → restart server → curl → submit to Move. No on-chain re-registration in the middle.

Save the printed pubkey hex string — you'll need it in Step 8.

---

## Step 4: Run the server locally and smoke-test it

```bash
cd src/nautilus-server
RUST_LOG=debug cargo run --features=price-oracle --bin nautilus-server
```

In another terminal:

```bash
# Health check (does not need NSM)
curl -X GET http://localhost:3000/health_check

# Your endpoint
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
    "data": {
      "coin_id": "sui",
      "vs": "usd",
      "price_micro": 3450000
    }
  },
  "signature": "b75d2d44...0a"
}
```

**Hitting `/get_attestation` will fail** with an NSM driver error. That's expected — skip it locally.

---

## Step 5: Write the Move side

In `move/price-oracle/sources/oracle.move`:

```move
module price_oracle::oracle;

use enclave::enclave::{Self, Enclave};

/// One-time witness — matches the OTW pattern used in weather-example.
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
    // mirror weather-example init: create EnclaveConfig + Cap with the OTW
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

    // verify_signature internally builds: intent_byte || timestamp_ms || bcs(payload)
    // and checks against the enclave's registered pubkey.
    assert!(
        enclave::verify_signature(enclave, INTENT_PRICE, timestamp_ms, payload, signature),
        0
    );

    transfer::share_object(PriceData {
        id: object::new(ctx),
        coin_id,
        vs,
        price_micro,
    });
}
```

> The exact signature of `verify_signature` and the `init` pattern vary slightly across Nautilus commits. Copy the shape from `move/weather-example/sources/weather.move` in your checkout.

Update `move/price-oracle/Move.toml` so the package name and addresses match your new app.

---

## Step 6: BCS compatibility tests (do not skip)

This is the single biggest source of "everything compiles but signatures don't verify" pain. BCS is positional, so any reordering of fields in either language silently breaks verification.

**Rust unit test** (`src/nautilus-server/src/apps/price-oracle/mod.rs`):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_payload_bcs() {
        let resp = PriceResponse {
            coin_id: "sui".to_string(),
            vs: "usd".to_string(),
            price_micro: 3_450_000,
        };
        let bytes = bcs::to_bytes(&resp).unwrap();
        println!("rust bcs: {}", hex::encode(&bytes));
        // Pin the expected hex once you've cross-checked with Move.
    }
}
```

**Move unit test** (`move/price-oracle/tests/oracle_tests.move`):

```move
#[test_only]
module price_oracle::oracle_tests;

use sui::bcs;
use price_oracle::oracle::PricePayload;

#[test]
fun test_payload_bcs() {
    let p = PricePayload {
        coin_id: b"sui",
        vs: b"usd",
        price_micro: 3_450_000,
    };
    let bytes = bcs::to_bytes(&p);
    std::debug::print(&bytes);
    // Compare to the hex printed by the Rust test.
}
```

Run both:

```bash
# Rust
cd src/nautilus-server && cargo test --features=price-oracle test_payload_bcs -- --nocapture

# Move
cd move/price-oracle && sui move test
```

If the hex doesn't match byte-for-byte, fix the structs before going further. **Do not** try to debug this from on-chain failures later — you will lose hours.

---

## Step 7: Deploy to Sui testnet

```bash
sui client switch --env testnet
sui client faucet                 # free SUI
sui client gas                    # confirm balance

# Publish the generic enclave verifier package
cd move/enclave
sui move build
sui client publish
# → record: ENCLAVE_PACKAGE_ID

# Publish your app
cd ../price-oracle
sui move build
sui client publish
# → record: APP_PACKAGE_ID, CAP_OBJECT_ID, ENCLAVE_CONFIG_OBJECT_ID
```

Export them:

```bash
export ENCLAVE_PACKAGE_ID=0x...
export APP_PACKAGE_ID=0x...
export CAP_OBJECT_ID=0x...
export ENCLAVE_CONFIG_OBJECT_ID=0x...
export MODULE_NAME=oracle
export OTW_NAME=ORACLE
```

---

## Step 8: Register all-zero PCRs and the injected pubkey

Debug-mode PCRs are all zeros. Register them once:

```bash
PCR_ZERO=000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000

sui client call --function update_pcrs \
  --module enclave --package $ENCLAVE_PACKAGE_ID \
  --type-args "$APP_PACKAGE_ID::$MODULE_NAME::$OTW_NAME" \
  --args $ENCLAVE_CONFIG_OBJECT_ID $CAP_OBJECT_ID \
         0x$PCR_ZERO 0x$PCR_ZERO 0x$PCR_ZERO
```

Now register the deterministic pubkey from Step 3. The shipped `register_enclave.sh` script calls `/get_attestation` on the server, which doesn't work locally. You have two options:

**Option A — Direct call (simpler).** If the `enclave` package exposes a function that registers a pubkey without requiring an attestation document (some forks have a `register_enclave_dev` or similar), call it directly:

```bash
PUBKEY_HEX=<the hex string printed by your server on startup>

sui client call --function register_enclave_dev \
  --module enclave --package $ENCLAVE_PACKAGE_ID \
  --type-args "$APP_PACKAGE_ID::$MODULE_NAME::$OTW_NAME" \
  --args $ENCLAVE_CONFIG_OBJECT_ID 0x$PUBKEY_HEX
# → record: ENCLAVE_OBJECT_ID
```

**Option B — Add a dev entry point.** If your `enclave` package only has the strict `register_enclave(attestation_doc)` path, add a thin dev-only entry point that takes a pubkey directly (gated behind a `#[test_only]` or feature flag in your fork). The weather example's `verify_signature` already validates only against the stored pubkey, so attestation isn't on the hot path for signature verification.

Whichever option you pick, save the resulting `ENCLAVE_OBJECT_ID`.

```bash
export ENCLAVE_OBJECT_ID=0x...
```

---

## Step 9: Close the loop end-to-end

With the server still running from Step 4:

```bash
# 1. Get a signed price
RESP=$(curl -s -H 'Content-Type: application/json' \
       -d '{"payload": {"coin_id": "sui", "vs": "usd"}}' \
       -X POST http://localhost:3000/process_data)

SIG=$(echo $RESP | jq -r .signature)
TS=$(echo $RESP | jq -r .response.timestamp_ms)
COIN=$(echo $RESP | jq -r .response.payload.coin_id)
VS=$(echo $RESP   | jq -r .response.payload.vs)
PRICE=$(echo $RESP | jq -r .response.payload.price_micro)

# 2. Submit to Sui — convert "sui" and "usd" strings to byte vectors
sui client call --function update_price \
  --module $MODULE_NAME --package $APP_PACKAGE_ID \
  --type-args "$APP_PACKAGE_ID::$MODULE_NAME::$OTW_NAME" \
  --args "[0x73,0x75,0x69]" \
         "[0x75,0x73,0x64]" \
         $PRICE \
         $TS \
         "0x$SIG" \
         $ENCLAVE_OBJECT_ID \
         "0x6"
```

If everything lines up — Rust and Move BCS structs match, the registered pubkey is the one signing — you'll see a `PriceData` shared object on testnet. View it on [suivision.xyz](https://testnet.suivision.xyz/) using the object ID from the transaction output.

The dev loop from here is: edit Rust → restart server → curl → `sui client call`. No re-registration needed unless you change the payload struct (in which case redo Step 6 first).

---

---

# App Catalog — the other eleven categories

The price oracle above is **Category 1** from [NAUTILUS_EVM.md](./NAUTILUS_EVM.md). Below are local-dev recipes for the remaining eleven categories. Each recipe follows the same skeleton — Rust payload structs, Move payload structs, endpoint shape, BCS test fixture, and gotchas — so you can slot it into the same enclave binary and Move workspace that Steps 1–9 set up.

All eleven can coexist in a single enclave binary by feature-gating each app module and assigning distinct intent bytes. Or you can build them as standalone enclave binaries; the pattern is identical either way.

---

## How to read the catalog

Every recipe below assumes you've already done Steps 1–4 (skeleton, deterministic key, running server). For each new category you only need to:

1. **Add the Rust module** under `src/apps/<app_name>/` with the structs and handler shown.
2. **Add the Move package** under `move/<app_name>/` with the payload + result structs shown.
3. **Write the BCS test pair** (Rust + Move) using the fixture values in each recipe.
4. **Wire the feature flag** in `Cargo.toml` and `apps/mod.rs`, mirroring how `price-oracle` is wired.
5. **Deploy + register** using Steps 7–8 (one `EnclaveConfig` per app, one `ORACLE`-style OTW per Move package).

The `to_signed_response` helper, `IntentMessage` envelope, and `verify_signature` Move function are shared infrastructure — they don't change per category.

---

## Intent byte allocation

Each app uses a distinct intent byte so signatures from one app can't be replayed against another — even if they share the same enclave binary and signing key.

| Byte | Category | App name |
|------|----------|----------|
| `0` | 1 — Oracle / price feed | `price-oracle` |
| `1` | 2 — Off-chain compute / ML | `ml-inference` |
| `2` | 3 — Secret management | `secret-proxy` |
| `3` | 4 — Sealed-bid auction | `sealed-auction` |
| `4` | 5 — Bridge relay | `bridge-relay` |
| `5` | 6 — Card dealer / game | `card-dealer` |
| `6` | 7 — KYC / identity | `kyc-attestation` |
| `7` | 8 — AI agent | `ai-agent` |
| `8` | 9 — Hybrid randomness | `hybrid-rng` |
| `9` | 10 — Social attestation | `social-attestation` |
| `10` | 11 — Dark pool | `dark-pool` |
| `11` | 12 — TEE signer | `tee-signer` |

---

## Cat 2 — Verifiable off-chain compute (ML inference)

**What the TEE solves.** An ML inference (sentiment analysis, fraud scoring, image classification) is too expensive or impossible to run on-chain. The EVM workaround is "trust our backend." With Nautilus, the model runs inside attested code; the PCRs commit to which exact model weights + inference binary produced the result.

**Upstream reference.** No direct Nautilus example — closest is the weather app pattern (fetch external data, sign result). The difference: this one may not call an external API at all if the model is bundled inside the EIF.

### Rust structs

```rust
// src/apps/ml_inference/mod.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct InferenceRequest {
    pub text: String,
    pub model_id: String,      // e.g. "sentiment-v1"
}

/// Field order MUST match Move `InferencePayload`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InferenceResponse {
    pub input_hash: Vec<u8>,   // sha256(text) — proves which input was scored
    pub model_id: String,
    pub label: String,         // e.g. "positive", "negative", "neutral"
    pub confidence_micro: u64, // 0.92 → 920_000
}

const INTENT_INFERENCE: u8 = 1;
```

### Move structs

```move
module ml_inference::inference;

use enclave::enclave::{Self, Enclave};
use std::string::String;

const INFERENCE_INTENT: u8 = 1;
const EInvalidSignature: u64 = 1;

public struct InferencePayload has copy, drop {
    input_hash: vector<u8>,
    model_id: String,
    label: String,
    confidence_micro: u64,
}

public struct InferenceResult has key, store {
    id: UID,
    input_hash: vector<u8>,
    model_id: String,
    label: String,
    confidence_micro: u64,
    timestamp_ms: u64,
}

public struct INFERENCE has drop {}
```

### Endpoint shape

```
POST /process_data
{ "payload": { "text": "Sui is great", "model_id": "sentiment-v1" } }

→ { "response": { "intent": 1, "timestamp_ms": ..., "data": {
      "input_hash": "a1b2c3...",
      "model_id": "sentiment-v1",
      "label": "positive",
      "confidence_micro": 920000
   }}, "signature": "..." }
```

### allowed_endpoints.yaml

```yaml
# If using an external API (HuggingFace, etc.)
endpoints:
  - api-inference.huggingface.co

# If the model is bundled inside the enclave: empty list.
# endpoints: []
```

### BCS test fixture

Use `text = "hello world"`, `model_id = "sentiment-v1"`, `label = "positive"`, `confidence_micro = 920_000`. Pin the `sha256("hello world")` hash as a 32-byte vector in both Rust and Move tests.

### Gotchas

- **Model bundling inflates the EIF.** A 100MB ONNX model makes the enclave image large and changes PCR0 on every retrain. Consider fetching weights from a pinned URL and hashing them inside the enclave instead.
- **No GPU inside Nitro.** Inference must be CPU-only (or use an external GPU API behind TLS). This limits model size in production.
- **`input_hash` not `input_text`.** Never put the raw input text in the signed payload — it bloats BCS and may contain PII. Hash it; let the caller prove they know the preimage off-chain.

---

## Cat 3 — Secret management (API key proxy)

**What the TEE solves.** A dApp needs to call a paid external API (Stripe, OpenAI, Twilio) but the API key can't live on-chain or in a publicly auditable backend. The enclave holds the key in sealed memory; the Move contract verifies that the enclave executed the call and returns a signed receipt.

**Upstream reference.** The Nautilus Weather example uses `weatherapi.com` with an API key — same shape but without the Seal integration. For production secret storage, Nautilus supports AWS Secrets Manager or Seal-based threshold key loading.

### Rust structs

```rust
// src/apps/secret_proxy/mod.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyRequest {
    pub action: String,        // e.g. "charge", "send_sms", "translate"
    pub params_json: String,   // opaque JSON blob the enclave passes to the API
}

/// Field order MUST match Move `ProxyPayload`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProxyResponse {
    pub action: String,
    pub params_hash: Vec<u8>,  // sha256(params_json) — proves which request ran
    pub result_hash: Vec<u8>,  // sha256(api_response) — proves what came back
    pub success: bool,
}

const INTENT_PROXY: u8 = 2;
```

### Move structs

```move
module secret_proxy::proxy;

use enclave::enclave::{Self, Enclave};
use std::string::String;

const PROXY_INTENT: u8 = 2;
const EInvalidSignature: u64 = 1;

public struct ProxyPayload has copy, drop {
    action: String,
    params_hash: vector<u8>,
    result_hash: vector<u8>,
    success: bool,
}

public struct ProxyReceipt has key, store {
    id: UID,
    action: String,
    params_hash: vector<u8>,
    result_hash: vector<u8>,
    success: bool,
    timestamp_ms: u64,
}

public struct PROXY has drop {}
```

### Endpoint shape

```
POST /process_data
{ "payload": { "action": "charge", "params_json": "{\"amount_cents\":1999,\"customer\":\"cus_xyz\"}" } }

→ { "response": { "intent": 2, ..., "data": {
      "action": "charge",
      "params_hash": "d4e5f6...",
      "result_hash": "a1b2c3...",
      "success": true
   }}, "signature": "..." }
```

### allowed_endpoints.yaml

```yaml
endpoints:
  - api.stripe.com
  # or: api.openai.com, api.twilio.com, etc.
```

### Gotchas

- **Local dev: mock the external API.** For the showcase, the enclave can return a canned response when no real API key is configured. The signing + BCS + verification loop still exercises.
- **Never sign the raw API response.** Sign hashes. The full Stripe response may contain PII, card tokens, or ephemeral data that shouldn't land on-chain.
- **Seal integration (production).** In production, the API key should be loaded via Seal's 3-phase key loading flow (init → fetch-keys → complete) rather than baked into the EIF or passed via env vars. The local-dev recipe can skip Seal and use an env var or `.env` file.
- **Rate limiting.** The enclave is a single chokepoint for all API calls. If multiple users submit concurrently, the enclave must queue or rate-limit. Consider signing a "rate limit exceeded" error response rather than silently dropping requests.

---

## Cat 4 — MEV / sealed-bid auction

**What the TEE solves.** In a sealed-bid auction, bids must be hidden until reveal. On EVM, the mempool is public and commit-reveal leaks the bid amount at reveal time. With Nautilus, users submit encrypted bids to the enclave's TLS endpoint; the enclave collects them, determines the winner at deadline, and signs a single settlement payload. No bid is ever visible to anyone except the enclave.

**Upstream reference.** No direct Nautilus example. The 2025 TU Munich paper (Gebele et al., arXiv 2510.19491) validates this architecture on SUAVE with Ethereum settlement. This recipe adapts the pattern for Sui Move.

### Rust structs

```rust
// src/apps/sealed_auction/mod.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct BidRequest {
    pub auction_id: String,
    pub bidder: String,        // Sui address hex
    pub amount_micro: u64,     // bid in microunits
}

/// Signed at auction close. Field order MUST match Move `AuctionPayload`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuctionResult {
    pub auction_id: String,
    pub winner: String,        // Sui address of winning bidder
    pub winning_bid_micro: u64,
    pub total_bids: u64,       // count, not sum — proves participation level
    pub bids_hash: Vec<u8>,    // sha256(sorted_serialized_bids) — audit trail
}

const INTENT_AUCTION: u8 = 3;
```

### Move structs

```move
module sealed_auction::auction;

use enclave::enclave::{Self, Enclave};
use std::string::String;

const AUCTION_INTENT: u8 = 3;
const EInvalidSignature: u64 = 1;

public struct AuctionPayload has copy, drop {
    auction_id: String,
    winner: String,
    winning_bid_micro: u64,
    total_bids: u64,
    bids_hash: vector<u8>,
}

public struct AuctionSettlement has key, store {
    id: UID,
    auction_id: String,
    winner: address,
    winning_bid_micro: u64,
    total_bids: u64,
    bids_hash: vector<u8>,
    timestamp_ms: u64,
}

public struct AUCTION has drop {}
```

### Endpoint shape

This category needs **two endpoints** — one for bid submission, one for settlement:

```
POST /submit_bid      ← stateful: enclave collects bids in memory
{ "payload": { "auction_id": "lot-42", "bidder": "0xabc...", "amount_micro": 5000000 } }
→ { "ack": true, "bid_count": 3 }

POST /settle_auction   ← triggers the reveal + signing
{ "payload": { "auction_id": "lot-42" } }
→ { "response": { "intent": 3, ..., "data": { ... AuctionResult ... }}, "signature": "..." }
```

### Gotchas

- **Stateful enclave.** Unlike the price oracle (stateless — one request, one response), the auction enclave holds an in-memory `HashMap<auction_id, Vec<Bid>>`. This state is lost on restart. For the showcase, that's fine; for production, persist to the enclave's encrypted EBS volume or use Seal.
- **Two endpoints, one signing key.** Both `/submit_bid` (ack only, no signature needed) and `/settle_auction` (signed) share the same `AppState`. Only the settlement response needs `to_signed_response`.
- **Frontrunning the settlement tx.** Even though bids are hidden, the `settle_auction` response is public once the enclave returns it. A MEV bot could see the winning bid in the response and act before the settlement tx lands. Mitigate: have the enclave submit the tx directly via `sui client call` (requires the enclave to hold a funded Sui address), or use a commit-reveal on the settlement itself.
- **Bid authenticity.** How does the enclave know the bidder actually controls the claimed Sui address? For the showcase, trust the caller. For production, require a signature over `auction_id || amount_micro` from the bidder's Sui key, verified inside the enclave before accepting the bid.

---

## Cat 5 — Cross-chain bridge relay

**What the TEE solves.** A bridge relayer reads events from a source chain (Ethereum, Solana, etc.) and attests them on Sui. Without a TEE, the relayer can forge events. With Nautilus, the PCRs commit to which light-client code and RPC endpoints the relayer uses; the Move contract verifies the attestation was produced by that exact binary.

**Upstream reference.** No direct Nautilus example. Marlin Oyster has a Sui-side bridge demo (`marlinprotocol/sui-oyster-demo`). This recipe focuses on the simpler pattern: read an Ethereum event log, sign an attestation, verify on Sui.

### Rust structs

```rust
// src/apps/bridge_relay/mod.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct BridgeRequest {
    pub source_chain: String,   // e.g. "ethereum"
    pub tx_hash: String,        // 0x-prefixed
    pub log_index: u64,
}

/// Field order MUST match Move `BridgePayload`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BridgeAttestation {
    pub source_chain: String,
    pub tx_hash: Vec<u8>,       // 32 bytes, no 0x prefix
    pub log_index: u64,
    pub block_number: u64,
    pub event_data_hash: Vec<u8>, // sha256(rlp-encoded event data)
}

const INTENT_BRIDGE: u8 = 4;
```

### Move structs

```move
module bridge_relay::relay;

use enclave::enclave::{Self, Enclave};
use std::string::String;

const BRIDGE_INTENT: u8 = 4;
const EInvalidSignature: u64 = 1;

public struct BridgePayload has copy, drop {
    source_chain: String,
    tx_hash: vector<u8>,
    log_index: u64,
    block_number: u64,
    event_data_hash: vector<u8>,
}

public struct BridgeMessage has key, store {
    id: UID,
    source_chain: String,
    tx_hash: vector<u8>,
    log_index: u64,
    block_number: u64,
    event_data_hash: vector<u8>,
    timestamp_ms: u64,
}

public struct BRIDGE has drop {}
```

### allowed_endpoints.yaml

```yaml
endpoints:
  - eth-mainnet.g.alchemy.com
  # or: mainnet.infura.io, rpc.ankr.com
```

### Gotchas

- **RPC poisoning is the real attack.** Phala's own docs flag this: a TEE can't verify that the RPC node is honest. Mitigate: query multiple RPCs and require consensus, or use a light-client library inside the enclave (heavier but trustless).
- **Finality.** The enclave should wait for sufficient block confirmations before attesting. For Ethereum, 12+ blocks (or finality checkpoint for PoS). Signing a reorged event is worse than signing late.
- **Local dev: use a local Anvil fork.** Run `anvil --fork-url https://eth-mainnet.g.alchemy.com/v2/$KEY` and point the enclave at `http://localhost:8545`. Emit a test event, then bridge it.
- **Light-client bridges are strictly better** for trust minimization — if one exists for your source chain, prefer it. This TEE pattern is the pragmatic shortcut for chains where no light-client verifier is available on Sui.

---

## Cat 6 — Game logic (card dealer)

**What the TEE solves.** Card games need hidden state: the deck order, each player's hand, and conditional reveals ("show your cards only on showdown"). All EVM storage is publicly readable; `private` is a compiler hint, not encryption. With Nautilus, the deck lives inside the enclave. Player-specific reveals are signed messages targeted to individual session keys.

**Upstream reference.** No direct Nautilus example. The Diganta poker-solidity repo and TEN Protocol's poker writeup document the EVM problem. This recipe builds the simplest possible card dealer.

### Rust structs

```rust
// src/apps/card_dealer/mod.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct NewGameRequest {
    pub game_id: String,
    pub player_count: u8,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DealRequest {
    pub game_id: String,
    pub player_index: u8,
}

/// Signed once at game creation. Field order MUST match Move `GamePayload`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameCommitment {
    pub game_id: String,
    pub deck_hash: Vec<u8>,    // sha256(shuffled deck) — provable fairness
    pub player_count: u8,
    pub seed_hash: Vec<u8>,    // sha256(rng_seed) — reveals at game end
}

/// Signed per player deal. Field order MUST match Move `DealPayload`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DealResult {
    pub game_id: String,
    pub player_index: u8,
    pub cards: Vec<u8>,        // card indices (0-51)
    pub deal_sequence: u8,     // 1 = initial deal, 2 = flop, etc.
}

const INTENT_GAME_COMMIT: u8 = 5;
const INTENT_DEAL: u8 = 50;   // sub-intent for deal reveals
```

### Move structs

```move
module card_dealer::dealer;

use enclave::enclave::{Self, Enclave};
use std::string::String;

const GAME_INTENT: u8 = 5;
const EInvalidSignature: u64 = 1;

public struct GamePayload has copy, drop {
    game_id: String,
    deck_hash: vector<u8>,
    player_count: u8,
    seed_hash: vector<u8>,
}

public struct GameTable has key, store {
    id: UID,
    game_id: String,
    deck_hash: vector<u8>,
    player_count: u8,
    seed_hash: vector<u8>,
    timestamp_ms: u64,
}

public struct DEALER has drop {}
```

### Endpoint shape

Two endpoints — game creation and per-player dealing:

```
POST /new_game
{ "payload": { "game_id": "table-7", "player_count": 4 } }
→ { "response": { "intent": 5, ..., "data": { ...GameCommitment... }}, "signature": "..." }

POST /deal
{ "payload": { "game_id": "table-7", "player_index": 0 } }
→ { "response": { "intent": 50, ..., "data": { ...DealResult... }}, "signature": "..." }
```

### Gotchas

- **Two intent bytes.** The game commitment and the per-player deal are separate signed payloads with separate intents. The Move contract uses `GAME_INTENT = 5` for the commitment and a separate constant for deal verification (or a single verify function that dispatches on intent).
- **Stateful.** The enclave holds shuffled decks in memory, keyed by `game_id`. Same restart-loss caveat as the auction.
- **Player authentication.** The deal endpoint returns cards for `player_index`. In a real game, the enclave must verify that the caller is the player at that index (e.g., require a session key signature). For the showcase, trust the caller.
- **Provable fairness.** At game end, the enclave reveals `rng_seed`; anyone can re-derive the shuffle from `seed_hash` and verify the `deck_hash` matches. This is the standard commit-reveal fairness proof, moved inside a TEE.
- **Per-player encryption (production).** In production, deal results should be encrypted to the player's session key, not returned in cleartext. The showcase skips encryption for simplicity — the signing + BCS loop is the same either way.

---

## Cat 7 — KYC / identity attestation

**What the TEE solves.** Compliance checks (sanctions screening, document liveness, age verification) require PII that can't live on-chain. The enclave receives identity data, performs the check, and signs a binary attestation ("eligible" / "not eligible") without persisting the documents.

**Upstream reference.** No direct Nautilus example. The pattern is identical to the price oracle (fetch + check + sign) but the "fetch" is a document upload rather than an API call.

### Rust structs

```rust
// src/apps/kyc_attestation/mod.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct KycRequest {
    pub user_address: String,      // Sui address
    pub document_hash: Vec<u8>,    // sha256(document bytes) — enclave checks locally
    pub country_code: String,      // ISO 3166-1 alpha-2
}

/// Field order MUST match Move `KycPayload`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KycResponse {
    pub user_address: String,
    pub eligibility_tier: u8,      // 0 = rejected, 1 = basic, 2 = full
    pub country_code: String,
    pub expiry_ms: u64,            // attestation validity window
}

const INTENT_KYC: u8 = 6;
```

### Move structs

```move
module kyc_attestation::kyc;

use enclave::enclave::{Self, Enclave};
use std::string::String;

const KYC_INTENT: u8 = 6;
const EInvalidSignature: u64 = 1;
const EExpired: u64 = 2;

public struct KycPayload has copy, drop {
    user_address: String,
    eligibility_tier: u8,
    country_code: String,
    expiry_ms: u64,
}

public struct KycAttestation has key, store {
    id: UID,
    user: address,
    eligibility_tier: u8,
    country_code: String,
    expiry_ms: u64,
    timestamp_ms: u64,
}

public struct KYC has drop {}
```

### allowed_endpoints.yaml

```yaml
endpoints:
  # For sanctions list checking:
  - sanctionslist.ofac.treas.gov
  # For document verification API (production):
  # - api.persona.com
```

### Gotchas

- **No PII on-chain.** The signed payload contains `eligibility_tier` and `country_code`, never the actual document or personal details. The `document_hash` in the request is used inside the enclave for logging/audit — it doesn't appear in the response.
- **Expiry is critical.** KYC attestations must expire. The Move contract should check `timestamp_ms + validity < clock::timestamp_ms(clock)` before granting access.
- **Local dev: mock the sanctions check.** For the showcase, hardcode a small sanctions list inside the enclave (or use an OFAC CSV snapshot). The signing loop exercises regardless.
- **ZK is the better long-term answer** for narrow claims ("I am over 18"). TEE-based KYC is stronger for *richer* checks (full sanctions screening, document liveness, AML scoring) where the check logic itself must be secret.

---

## Cat 8 — AI agent with on-chain footprint

**What the TEE solves.** An AI agent needs to call paid APIs (LLMs, market data), hold spending authority over funds, and prove which exact agent code is making decisions. Without a TEE, the agent's API keys are exposed and its decision-making is opaque. With Nautilus, the agent code runs inside attested hardware; the PCRs commit to which binary (model, strategy, safety rails) is acting.

**Upstream reference.** No direct Nautilus example. The Nautilus-Twitter app is the closest shape (external API call → signed attestation). Phala's Eliza-on-Phala-Cloud is the competitive reference.

### Rust structs

```rust
// src/apps/ai_agent/mod.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentRequest {
    pub prompt: String,
    pub max_spend_micro: u64,   // spending cap in microunits
    pub policy_id: String,       // references on-chain policy object
}

/// Field order MUST match Move `AgentPayload`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentAction {
    pub action_type: String,     // "transfer", "swap", "stake", "noop"
    pub target: String,          // Sui address or pool ID
    pub amount_micro: u64,
    pub reasoning_hash: Vec<u8>, // sha256(LLM response) — auditability
    pub policy_id: String,
}

const INTENT_AGENT: u8 = 7;
```

### Move structs

```move
module ai_agent::agent;

use enclave::enclave::{Self, Enclave};
use std::string::String;

const AGENT_INTENT: u8 = 7;
const EInvalidSignature: u64 = 1;
const EExceedsSpendCap: u64 = 2;

public struct AgentPayload has copy, drop {
    action_type: String,
    target: String,
    amount_micro: u64,
    reasoning_hash: vector<u8>,
    policy_id: String,
}

public struct AgentProposal has key, store {
    id: UID,
    action_type: String,
    target: address,
    amount_micro: u64,
    reasoning_hash: vector<u8>,
    policy_id: String,
    timestamp_ms: u64,
}

/// On-chain spend cap — the contract enforces limits the agent can't bypass.
public struct AgentPolicy has key, store {
    id: UID,
    max_spend_per_action: u64,
    allowed_actions: vector<String>,
    owner: address,
}

public struct AGENT has drop {}
```

### allowed_endpoints.yaml

```yaml
endpoints:
  - api.openai.com
  # or: api.anthropic.com, api.cohere.com
```

### Gotchas

- **The Move contract enforces spending limits, not the enclave.** The enclave proposes; the contract gates. Even if the enclave is compromised, `AgentPolicy.max_spend_per_action` caps the damage.
- **`reasoning_hash`, not `reasoning_text`.** The full LLM response may be megabytes. Hash it and store the hash on-chain; the full response can live off-chain (Walrus blob, IPFS, or the enclave's own log).
- **Two-step execution (proposal → approval).** For the showcase, the agent proposes and the contract auto-executes if within policy. For production, consider a time-locked approval step where the owner can veto before execution.
- **Local dev: mock the LLM call.** Return a canned `AgentAction` with `action_type = "noop"` and a hardcoded `reasoning_hash`. The signing loop exercises without burning API credits.

---

## Cat 9 — Hybrid randomness (external + on-chain)

**What the TEE solves.** Sui's native `Random` primitive is good for most cases. But when you need to combine on-chain randomness with external entropy sources (drand beacons, hardware RNG, multi-party ceremony output), a TEE can mix them and attest the result. The enclave fetches the external entropy, mixes with its own CSPRNG, and signs the output.

**Upstream reference.** No direct Nautilus example. Phala Cloud's VRF template is the closest competitive reference.

### Rust structs

```rust
// src/apps/hybrid_rng/mod.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct RngRequest {
    pub round_id: u64,
    pub domain: String,         // domain separator for the randomness
    pub num_bytes: u8,          // 32 or 64
}

/// Field order MUST match Move `RngPayload`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RngResponse {
    pub round_id: u64,
    pub domain: String,
    pub random_bytes: Vec<u8>,
    pub drand_round: u64,       // which drand round was used as external entropy
    pub drand_signature: Vec<u8>, // drand BLS signature — independently verifiable
}

const INTENT_RNG: u8 = 8;
```

### Move structs

```move
module hybrid_rng::rng;

use enclave::enclave::{Self, Enclave};
use std::string::String;

const RNG_INTENT: u8 = 8;
const EInvalidSignature: u64 = 1;

public struct RngPayload has copy, drop {
    round_id: u64,
    domain: String,
    random_bytes: vector<u8>,
    drand_round: u64,
    drand_signature: vector<u8>,
}

public struct RandomOutput has key, store {
    id: UID,
    round_id: u64,
    domain: String,
    random_bytes: vector<u8>,
    drand_round: u64,
    timestamp_ms: u64,
}

public struct RNG has drop {}
```

### allowed_endpoints.yaml

```yaml
endpoints:
  - api.drand.sh
  # Alternatives: drand.cloudflare.com, api.drand.lovecruft.de
```

### Gotchas

- **Sui's native `Random` is usually enough.** Use this category only when your threat model specifically requires external entropy (regulatory requirement, multi-chain ceremony, etc.) or when you need randomness combined with private state.
- **drand is independently verifiable.** The `drand_signature` field lets anyone verify the drand beacon output without trusting the enclave. The TEE adds the mixing step, not the entropy source.
- **Replay prevention.** The `round_id` + `domain` pair must be unique. The Move contract should reject duplicate `(round_id, domain)` combinations.

---

## Cat 10 — Social / real-world data attestation

**What the TEE solves.** A dApp needs to prove that a specific social media post exists, a weather event occurred, or a sports score is real. The enclave fetches the data via TLS from the source API, verifies it matches the claim, and signs an attestation. This is exactly the Nautilus-Twitter pattern.

**Upstream reference.** [MystenLabs/nautilus-twitter](https://github.com/MystenLabs/nautilus-twitter) — the closest upstream reference. Full-stack frontend, on-chain Twitter-attested NFTs.

### Rust structs

```rust
// src/apps/social_attestation/mod.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct AttestationRequest {
    pub platform: String,       // "twitter", "github", "reddit"
    pub username: String,
    pub post_id: String,
    pub expected_content: String, // substring the post must contain
}

/// Field order MUST match Move `AttestationPayload`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AttestationResponse {
    pub platform: String,
    pub username: String,
    pub post_id: String,
    pub content_hash: Vec<u8>,  // sha256(full post content)
    pub verified: bool,         // did expected_content appear?
}

const INTENT_SOCIAL: u8 = 9;
```

### Move structs

```move
module social_attestation::social;

use enclave::enclave::{Self, Enclave};
use std::string::String;

const SOCIAL_INTENT: u8 = 9;
const EInvalidSignature: u64 = 1;
const ENotVerified: u64 = 2;

public struct AttestationPayload has copy, drop {
    platform: String,
    username: String,
    post_id: String,
    content_hash: vector<u8>,
    verified: bool,
}

public struct SocialProof has key, store {
    id: UID,
    platform: String,
    username: String,
    post_id: String,
    content_hash: vector<u8>,
    timestamp_ms: u64,
}

public struct SOCIAL has drop {}
```

### allowed_endpoints.yaml

```yaml
endpoints:
  - api.x.com
  - api.github.com
  # Add per platform as needed
```

### Gotchas

- **API access is the bottleneck.** Twitter/X API costs $100+/month for read access. For the showcase, consider using GitHub's free API instead (`api.github.com/repos/{owner}/{repo}/commits/{sha}`) — same attestation shape, free tier.
- **MITM warning.** Phala's docs flag this correctly: the TEE can't verify that the API response wasn't tampered with in transit. TLS protects against passive eavesdropping but not a compromised DNS/CDN. For high-stakes attestations (legal, financial), cross-reference multiple endpoints.
- **`verified: bool` should be `true` before minting.** The Move contract should assert `verified == true` before creating the `SocialProof` object. The enclave signs both verified and unverified responses — the contract decides what to accept.

---

## Cat 11 — Confidential DeFi (dark pool)

**What the TEE solves.** A dark pool matches buy and sell orders privately; only the settlement is public. On EVM, order books are fully transparent. With Nautilus, the matching engine runs inside the enclave. Users submit encrypted orders; the enclave matches, signs the settlement, and the Move contract executes the asset transfers.

**Upstream reference.** No direct Nautilus example. Oasis Sapphire is the EVM-side competitor (fully confidential EVM). This recipe implements *selective* confidentiality — matching is private, settlement is public.

### Rust structs

```rust
// src/apps/dark_pool/mod.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct OrderRequest {
    pub pool_id: String,
    pub side: String,           // "buy" or "sell"
    pub asset: String,          // e.g. "SUI"
    pub amount_micro: u64,
    pub limit_price_micro: u64, // 0 = market order
    pub trader: String,         // Sui address
}

/// Signed per matched trade. Field order MUST match Move `TradePayload`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TradeSettlement {
    pub pool_id: String,
    pub maker: String,
    pub taker: String,
    pub asset: String,
    pub amount_micro: u64,
    pub price_micro: u64,       // execution price
    pub trade_hash: Vec<u8>,    // sha256(maker_order || taker_order)
}

const INTENT_TRADE: u8 = 10;
```

### Move structs

```move
module dark_pool::pool;

use enclave::enclave::{Self, Enclave};
use std::string::String;

const TRADE_INTENT: u8 = 10;
const EInvalidSignature: u64 = 1;

public struct TradePayload has copy, drop {
    pool_id: String,
    maker: String,
    taker: String,
    asset: String,
    amount_micro: u64,
    price_micro: u64,
    trade_hash: vector<u8>,
}

public struct TradeReceipt has key, store {
    id: UID,
    pool_id: String,
    maker: address,
    taker: address,
    asset: String,
    amount_micro: u64,
    price_micro: u64,
    trade_hash: vector<u8>,
    timestamp_ms: u64,
}

public struct POOL has drop {}
```

### Endpoint shape

Two endpoints — order submission and match trigger:

```
POST /submit_order
{ "payload": { "pool_id": "sui-usdc", "side": "buy", "asset": "SUI",
               "amount_micro": 10000000, "limit_price_micro": 3500000,
               "trader": "0xabc..." } }
→ { "ack": true, "queue_depth": 5 }

POST /match
{ "payload": { "pool_id": "sui-usdc" } }
→ { "settlements": [
     { "response": { "intent": 10, ..., "data": { ...TradeSettlement... }}, "signature": "..." },
     ...
   ] }
```

### Gotchas

- **Stateful and latency-sensitive.** Order books need sub-second matching. The enclave must hold the full book in memory. For the showcase, a simple price-time priority queue suffices.
- **Batch settlement.** A single `/match` call may produce multiple `TradeSettlement` payloads — one per matched pair. The Move contract must process them atomically (all settle or none) using a PTB.
- **Fair ordering.** The enclave must process orders in arrival order (FIFO) to prevent the enclave operator from reordering. Log the sequence and include it in `trade_hash` for auditability.
- **Asset transfers require escrow.** The Move contract needs an escrow module: traders deposit assets before submitting orders; the settlement function transfers from escrow. The enclave doesn't touch assets — it only signs which transfers should happen.
- **This is Nautilus's strongest DeFi pitch vs EVM.** Sui's parallel object model lets multiple pools run concurrently without contention. A shared-object matching engine on Ethereum would be a gas nightmare.

---

## Cat 12 — TEE-backed signer (account abstraction)

**What the TEE solves.** An application needs a signing key with verifiable code controlling it — an autonomous signer where users can audit *which binary* holds the key. Without a TEE, the signer is "trust the operator." With Nautilus, the key is generated inside the enclave, never exported, and the PCRs prove which policy code governs its use.

**Upstream reference.** No direct Nautilus example. The agentic wallet ecosystem (Cobo, OKX TEE wallets, Phala Dstack) is the competitive landscape.

### Rust structs

```rust
// src/apps/tee_signer/mod.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct SignRequest {
    pub action: String,         // "transfer", "approve", "delegate"
    pub params_hash: Vec<u8>,   // sha256(serialized action params)
    pub nonce: u64,             // replay prevention
    pub policy_id: String,      // references on-chain policy
}

/// Field order MUST match Move `SignerPayload`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SignerResponse {
    pub action: String,
    pub params_hash: Vec<u8>,
    pub nonce: u64,
    pub policy_id: String,
    pub approved: bool,         // enclave checked against internal policy
}

const INTENT_SIGNER: u8 = 11;
```

### Move structs

```move
module tee_signer::signer;

use enclave::enclave::{Self, Enclave};
use std::string::String;

const SIGNER_INTENT: u8 = 11;
const EInvalidSignature: u64 = 1;
const ENotApproved: u64 = 2;
const ENonceReused: u64 = 3;

public struct SignerPayload has copy, drop {
    action: String,
    params_hash: vector<u8>,
    nonce: u64,
    policy_id: String,
    approved: bool,
}

public struct SignedAction has key, store {
    id: UID,
    action: String,
    params_hash: vector<u8>,
    nonce: u64,
    policy_id: String,
    timestamp_ms: u64,
}

/// Tracks used nonces to prevent replay.
public struct NonceTracker has key, store {
    id: UID,
    last_nonce: u64,
}

/// On-chain policy: which actions the signer can perform.
public struct SignerPolicy has key, store {
    id: UID,
    allowed_actions: vector<String>,
    max_amount_per_action: u64,
    owner: address,
}

public struct SIGNER has drop {}
```

### Gotchas

- **Nonce management is critical.** Without replay prevention, a valid signed action can be submitted multiple times. The Move contract must track and reject reused nonces. Use a monotonically increasing `last_nonce` rather than a set (cheaper storage).
- **Key generation inside the enclave.** Unlike the price oracle (where the signing key is shared infrastructure), the TEE signer's key *is* the product. In local dev, the deterministic seed is fine. In production, the key must be random-per-boot and registered via attestation.
- **Policy is on-chain, enforcement is split.** The enclave checks the policy *before signing* (to avoid signing something the contract would reject anyway). The contract checks it *again* (defense in depth). This dual-check is intentional — neither side fully trusts the other.
- **Key rotation = new enclave.** Rotating the signer key means deploying a new enclave image, re-registering PCRs, and migrating the on-chain `NonceTracker`. Design the Move contract for this from the start.
- **Differs from Cat 8 (AI agent).** The AI agent *decides what to do*; the TEE signer *executes what it's told to do*. The AI agent has autonomy bounded by policy; the signer has no autonomy — it's a policy gate on externally submitted requests.

---

## Cross-category patterns

### Multi-app enclave binary

All twelve apps can coexist in a single enclave binary by feature-gating each module:

```toml
# Cargo.toml
[features]
default = ["price-oracle"]
price-oracle = []
ml-inference = []
secret-proxy = []
sealed-auction = []
bridge-relay = []
card-dealer = []
kyc-attestation = []
ai-agent = []
hybrid-rng = []
social-attestation = []
dark-pool = []
tee-signer = []
all-apps = ["price-oracle", "ml-inference", "secret-proxy", "sealed-auction",
            "bridge-relay", "card-dealer", "kyc-attestation", "ai-agent",
            "hybrid-rng", "social-attestation", "dark-pool", "tee-signer"]
```

Each app registers its routes in `main.rs` behind `#[cfg(feature = "...")]`. The signing key and `IntentMessage` envelope are shared; only the payload structs and handlers differ.

### Stateless vs stateful apps

| Pattern | Categories | Enclave memory | Restart behavior |
|---|---|---|---|
| Stateless (fetch → sign → forget) | 1, 2, 3, 7, 8, 9, 10, 12 | None | No impact |
| Stateful (collect → process → sign) | 4, 5, 6, 11 | In-memory collections | State lost on restart |

Stateful apps need additional consideration for production: encrypted persistence (EBS + Seal), graceful shutdown, and state recovery. For the showcase, losing state on restart is fine — just restart the game/auction.

### BCS test discipline

Every category follows the same BCS test pattern from Step 6:

1. Define a fixed test fixture (hardcoded field values) in both Rust and Move.
2. BCS-encode in both languages.
3. Assert the hex output matches byte-for-byte.
4. Pin the expected hex in both tests so regressions are caught immediately.

If you add a field, remove a field, or reorder fields in either language, both tests must be updated simultaneously. **Do not** try to debug BCS mismatches from on-chain signature failures — they are silent and maddening.

---

## When to graduate off the local setup

You've gotten 90% of the dev cycle done for free. The remaining 10% — proving the code actually ran inside a real TEE — requires real attestation. Options:

1. **AWS Nitro EC2 directly** — follow the official "Using Nautilus" guide. Watch the EC2 cost (~$0.19/hour); stop the instance when not testing. A weekend of testing is a few dollars.
2. **Marlin Oyster CVM** — Docker-based, pay-per-minute in USDC on Arbitrum. Sub-cent for short test deployments. Good if you want managed enclave lifecycle without the EC2 babysitting.

In both cases, you'll:

- Remove the deterministic-key injection from `main.rs`
- Replace the all-zero PCRs with the real ones computed by `make ENCLAVE_APP=price-oracle && cat out/nitro.pcrs`
- Use the standard `register_enclave.sh` flow (which calls `/get_attestation` on the live enclave)

The Rust app logic and Move contract code carry over unchanged.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Signature verification fails on-chain but Rust test runs fine | BCS field order mismatch between Rust struct and Move struct. Re-run Step 6 and compare hex output byte-for-byte. |
| Pubkey changes every server restart | Deterministic key injection from Step 3 is missing or not on the active code path. Check feature flags. |
| `/get_attestation` returns NSM error | Expected locally. Skip it. |
| `cargo run` fails on `ed25519_dalek::SigningKey::from_bytes` | API drift in `ed25519-dalek`. v2 uses `from_bytes(&[u8; 32])`; older versions returned a `Result`. Match the version pinned in `Cargo.toml`. |
| Move `verify_signature` rejects valid-looking signature | Intent byte mismatch. The Rust side prepends an intent byte before signing; make sure the Move side passes the same one. |
| `sui client publish` fails with "object not found" | Wrong env. Run `sui client switch --env testnet` and `sui client faucet`. |
| External API call times out from the local server | CoinGecko rate limits free tier aggressively. Add a small delay or swap to a different price source. |

---

## References

- [Nautilus overview](https://docs.sui.io/sui-stack/nautilus)
- [Using Nautilus (official walkthrough — AWS path)](https://docs.sui.io/sui-stack/nautilus/using-nautilus)
- [Customizing, Testing, and Management (local dev section)](https://docs.sui.io/sui-stack/nautilus/customize-nautilus)
- [Nautilus repository (MystenLabs/nautilus)](https://github.com/MystenLabs/nautilus)
- [Nautilus Twitter example (frontend + full app)](https://github.com/MystenLabs/nautilus-twitter)
- [Marlin Oyster docs (alternative TEE path)](https://docs.marlin.org/oyster/introduction-to-marlin/)

---

## Notes for Claude Code follow-up

When picking this up in Claude Code, useful starting prompts:

### For the reference walkthrough (price oracle)

- *"Read `src/nautilus-server/src/apps/weather-example/mod.rs` and replicate its pattern in `src/nautilus-server/src/apps/price-oracle/mod.rs`, swapping the weather API for CoinGecko."*
- *"Diff `move/weather-example/sources/weather.move` against `move/price-oracle/sources/oracle.move` and ensure the Move payload struct matches the Rust `PriceResponse` field order."*
- *"Add a BCS round-trip test pair: a Rust test that prints `bcs::to_bytes(&PriceResponse{...})` as hex, and a Move test that does the same for `PricePayload`. Confirm they match."*
- *"Find where `main.rs` generates the ephemeral signing key and replace it with a deterministic 32-byte seed, printing the resulting pubkey on startup."*

### For implementing a new category from the catalog

- *"Read the Cat N recipe in NAUTILUS_LOCAL_DEV.md. Create the Rust module at `src/apps/<app_name>/mod.rs` with the structs shown, add the feature flag, and wire the route in `main.rs`."*
- *"Create the Move package at `move/<app_name>/` mirroring `move/price-oracle/`. Use the payload struct from the Cat N recipe. Write the BCS test pair."*
- *"Implement the `process_data` handler for Cat N. For local dev, mock the external API call and return a canned response. The signing loop must exercise."*

### For stateful categories (4, 5, 6, 11)

- *"This category needs in-memory state. Add a `HashMap<String, Vec<...>>` to `AppState` (behind an `Arc<RwLock<...>>`) for collecting submissions. Add a second endpoint for the settlement/reveal step."*

Keep this file (`NAUTILUS_LOCAL_DEV.md`) in the `notes/` directory so each new Claude Code session can pick up the full context with a single `read`.
