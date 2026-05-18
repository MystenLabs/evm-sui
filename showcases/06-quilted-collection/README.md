# Showcase 06 — Quilted ERC-721 collection drop

A 10 000-token NFT collection where the entire drop — every image and
every metadata JSON — lives inside **one Walrus Quilt**. The contract
stores a single quiltId; `tokenURI(id)` deterministically returns the
aggregator URL for that token's slice. No per-token pin, no per-token
state, no OpenSea-only reliability tier.

> **Source files**
>
> - Contract: [`../contracts/src/QuiltedCollection.sol`](../contracts/src/QuiltedCollection.sol)
> - Tests: [`../contracts/test/QuiltedCollection.t.sol`](../contracts/test/QuiltedCollection.t.sol)
> - Deploy script: [`../contracts/script/DeployQuiltedCollection.s.sol`](../contracts/script/DeployQuiltedCollection.s.sol)
> - Bulk packer: [`./src/pack.ts`](./src/pack.ts)
> - Deploy wrapper: [`./src/deploy.ts`](./src/deploy.ts)
> - URL helper: [`./src/url.ts`](./src/url.ts)

## The pain it answers

> "OpenSea actually improved their NFT metadata reliability by 99.2% when
> they switched to Pinata's infrastructure" — i.e. the centralization tax
> for collection drops is enormous because each token needs its own pin.
> *(ipfs-pain.md §8 — decentralization theater)*

A 10 000-token drop on IPFS is 10 000 pinning operations, 10 000 things
that can drop off, and (in practice) a pinning vendor contract. A Quilt
packs the whole drop into one Walrus operation with deterministic
per-file identifiers.

## The shape

```
artist          ──pnpm pack ./drop──▶  walrus store-quilt --paths drop/*.{json,png}
                                                 │
                                                 ▼
                                            quiltId (base64url)
                                                 │
artist          ──QC_QUILT_ID=… pnpm deploy──▶ DeployQuiltedCollection.s.sol
                                                          │
                                                          ▼
                                              QuiltedCollection (EVM)
                                                          │
collector       ──mint()──▶  QuiltedCollection            │
                                                          ▼
client          ──tokenURI(id)──▶ "<agg>/v1/blobs/by-quilt-id/<quiltId>/<id>.json"
                       │
                       └──GET that URL──▶ token's metadata JSON
                                                  │
                                                  └─.image─▶ "<agg>/.../<id>.png"
```

Three on-chain artifacts at deploy time:

- the **Quilt** on Sui — one Walrus operation, holds every file as a named slice;
- the immutable **`quiltId` string** in the `QuiltedCollection` contract;
- the immutable **`aggregator` string** — the canonical resolver host
  (owner-mutable via `setAggregator` for sunset migration).

## Why it dodges per-token pinning

| IPFS today | Walrus + QuiltedCollection.sol |
|---|---|
| 10 000 pin objects, each with its own lifetime | One Quilt object — `epochs` is per Quilt, not per token |
| OpenSea-only reliability tier (Pinata's contract) | Aggregator GET is commodity HTTPS — anyone can resolve |
| Per-token metadata URL is a CID lookup | Per-token URL is `aggregator/by-quilt-id/<quiltId>/<id>.json` — deterministic from one quiltId |
| Migrating off the pinning vendor = re-pin 10 000 files | Migrating aggregator host = one `setAggregator` tx |

## End-to-end flow

### 1. Prepare the drop directory

```
drop/
├── 1.json
├── 1.png
├── 2.json
├── 2.png
└── ... up to 10000.{json,png}
```

Each metadata JSON's `image` field must point at its sibling PNG via the
aggregator-by-quilt-id URL. **The aggregator + quiltId you'll use is
known only AFTER `walrus store-quilt` runs**, so most drops bootstrap by:

- placing a templated `{{AGG}}/by-quilt-id/{{QID}}/<id>.png` in each
  metadata JSON,
- running `pack`,
- substituting the real `quiltId` back into the JSON files,
- re-running `pack` (the second pass produces the canonical quiltId).

For purely on-chain rendering (no images), skip the PNGs and just include
metadata JSONs.

### 2. Pack the drop into a Quilt

```bash
cd showcases/06-quilted-collection
pnpm install

# Optional — bump epochs for long-lived collections (default: 200).
export WALRUS_EPOCHS=200

# Dry run prints the walrus CLI invocation without uploading.
pnpm pack --dry-run ./drop

# Real run — uploads everything in one CLI call.
pnpm pack ./drop
# → quiltId: <base64url>
```

[`src/pack.ts`](./src/pack.ts):

1. Walks the drop dir for `*.json` and `*.png` files.
2. Spawns `walrus store-quilt --paths ... --epochs ...`.
3. Parses the quiltId out of the CLI's stdout (handles both JSON-envelope
   and `quiltId: <b64url>` line formats).

Requires the `walrus` CLI on PATH — install per
<https://docs.wal.app/usage/setup.html>.

### 3. Deploy the contract

```bash
# Constructor args (forwarded to DeployQuiltedCollection.s.sol via env)
export QC_NAME="Walrus Quilted #01"
export QC_SYMBOL="WQ01"
export QC_QUILT_ID=<base64url from step 2>
export QC_AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
export QC_MAX_SUPPLY=10000

# EVM-side
export EVM_RPC_URL=http://127.0.0.1:8545
export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

pnpm deploy --dry-run    # prints the forge command without sending the tx
pnpm deploy              # forge script broadcast
```

[`src/deploy.ts`](./src/deploy.ts) shells out to
`forge script script/DeployQuiltedCollection.s.sol` inside
`showcases/contracts/`. The forge script reads the `QC_*` env vars and
deploys the contract with the given constructor args.

### 4. Resolve a token URL off-chain

Indexers, marketplaces, and gallery frontends can compute tokenURIs
deterministically — no EVM RPC required.

```bash
export AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
export QUILT_ID=<base64url>

pnpm url 42
# → https://aggregator.walrus-testnet.walrus.space/v1/blobs/by-quilt-id/<...>/42.json
```

Or in TS:

```ts
import { tokenURI } from "./src/url";
tokenURI({ aggregator, quiltId, tokenId: 42n });
```

The on-chain `tokenURI(id)` returns the exact same string — the TS port
exists so off-chain consumers don't need an RPC round-trip per token.

## What this showcase is NOT

- **Not a launchpad.** No allowlist, no reveal mechanic, no royalty
  enforcement, no merkle airdrop. Mint is open and self-mint, capped at
  `maxSupply`.
- **Not a metadata authoring tool.** The drop directory layout
  (`<id>.json` + `<id>.png`) is your responsibility.
- **Not a re-uploader.** Once the Quilt is sealed, the contents are
  immutable. Bug in a metadata JSON? Pack a new Quilt and either redeploy
  or use `setAggregator` to point at a different resolver that serves the
  fixed Quilt.
- **Not a hash verifier.** Trust in the bytes served by the aggregator is
  identical to trust in an IPFS gateway. For trustless retrieval add a
  Reed-Solomon recompute via `@mysten/walrus` on top.

## Tests

```bash
cd showcases/contracts
forge test --match-contract QuiltedCollection -vv
```

Ten tests cover: constructor validation (empty quiltId / aggregator /
zero maxSupply), sequential mint ids + Minted event, sold-out cap,
owner-only `setAggregator` + non-empty validation, `tokenURI` URL shape,
and revert on unminted token.
