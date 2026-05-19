# Showcase 06 — Quilted ERC-721 collection drop

A 10 000-token NFT collection backed by **two Walrus Quilts** — one for
images, one for metadata — instead of 10 000 IPFS pins. The contract
stores the metadata quilt's id; `tokenURI(id)` deterministically returns
the aggregator URL for that token's JSON, whose `image` field in turn
points at the matching slice of the images quilt. No per-token pin, no
per-token state, no OpenSea-only reliability tier.

The two-quilt split is what breaks the circular dependency between
metadata content and content-addressed quilt ids — see [_Prepare two drop
directories_](#1-prepare-two-drop-directories--images-first-then-metadata)
for the reason in detail.

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
that can drop off, and (in practice) a pinning vendor contract. Two
Walrus Quilts collapse that into two store operations with deterministic
per-file identifiers.

## The shape

```
artist  ──pnpm pack:quilt ./images──▶ walrus store-quilt --paths ./images
                                                 │
                                                 ▼
                                            QID_IMAGES (base64url)
                                                 │
artist  ──generate meta/<id>.json with image=<agg>/by-quilt-id/<QID_IMAGES>/<id>.png
                                                 │
artist  ──pnpm pack:quilt ./meta────▶ walrus store-quilt --paths ./meta
                                                 │
                                                 ▼
                                            QID_METADATA (base64url)
                                                 │
artist  ──QC_QUILT_ID=… pnpm deploy:contract──▶ DeployQuiltedCollection.s.sol
                                                          │
                                                          ▼
                                              QuiltedCollection (EVM)
                                                          │
collector       ──mint()──▶  QuiltedCollection            │
                                                          ▼
client          ──tokenURI(id)──▶ "<agg>/v1/blobs/by-quilt-id/<QID_METADATA>/<id>.json"
                       │
                       └──GET that URL──▶ token's metadata JSON
                                                  │
                                                  └─.image─▶ "<agg>/.../<QID_IMAGES>/<id>.png"
```

On-chain artifacts at deploy time:

- the **metadata Quilt** on Sui — one Walrus operation, holds every token's JSON;
- the **images Quilt** on Sui — one Walrus operation, holds every token's image;
- the **`quiltId` string** stored on the `QuiltedCollection` contract
  (the metadata quilt's id);
- the **`aggregator` string** — the canonical resolver host
  (owner-mutable via `setAggregator` for sunset migration).

## Why it dodges per-token pinning

| IPFS today | Walrus + QuiltedCollection.sol |
|---|---|
| 10 000 pin objects, each with its own lifetime | One Quilt object — `epochs` is per Quilt, not per token |
| OpenSea-only reliability tier (Pinata's contract) | Aggregator GET is commodity HTTPS — anyone can resolve |
| Per-token metadata URL is a CID lookup | Per-token URL is `aggregator/by-quilt-id/<quiltId>/<id>.json` — deterministic from one quiltId |
| Migrating off the pinning vendor = re-pin 10 000 files | Migrating aggregator host = one `setAggregator` tx |

## End-to-end flow

### 1. Prepare two drop directories — images first, then metadata

A metadata JSON's `image` field has to be a fully-qualified aggregator
URL, which means it has to include the quiltId of the quilt it's pointing
at. If you put images and metadata in the **same** quilt, the metadata's
content depends on the quilt's id, but the quilt's id is content-addressed
from the metadata — a circular dependency that no number of re-packs can
break.

The clean fix is to use **two quilts**: one for images, one for metadata.
Metadata references the images quilt's id (known after step 2), and the
contract is deployed against the metadata quilt's id (known after step 4).

```
images/
├── 1.png
├── 2.png
└── ...

meta/
├── 1.json     # contains: image = "<AGG>/v1/blobs/by-quilt-id/<QID_IMAGES>/1.png"
├── 2.json
└── ...
```

For purely on-chain rendering (no images), skip the images quilt entirely
and just pack the metadata.

### 2. Pack the images quilt

```bash
cd showcases/06-quilted-collection
pnpm install

# Optional — bump epochs for long-lived collections (default: 200).
export WALRUS_EPOCHS=200

# Dry run prints the walrus CLI invocation without uploading.
pnpm pack:quilt --dry-run ./images

# Real run — passes the drop directory to `walrus store-quilt`.
pnpm pack:quilt ./images
# → quiltId: <base64url>  (this is QID_IMAGES)
```

### 3. Generate the metadata JSONs

With `QID_IMAGES` from step 2 and your chosen aggregator host, generate
each `meta/<id>.json` so its `image` field is the aggregator URL for the
matching PNG in the images quilt:

```json
{
  "name": "Walrus Quilted #1",
  "description": "...",
  "image": "https://aggregator.walrus-testnet.walrus.space/v1/blobs/by-quilt-id/<QID_IMAGES>/1.png"
}
```

How you generate these is up to you — a 20-line script, a templating
engine, or a one-off `sed`. The key is that **the metadata files are
written exactly once**, with the final image URLs already baked in.

### 4. Pack the metadata quilt

```bash
pnpm pack:quilt ./meta
# → quiltId: <base64url>  (this is QID_METADATA)
```

[`src/pack.ts`](./src/pack.ts):

1. Sanity-checks the drop directory exists and has at least one `.json` or
   `.png` file.
2. Spawns `walrus store-quilt --epochs <N> --paths <dropDir>` (passing the
   directory, not individual file paths, to avoid `ARG_MAX` on large drops).
3. Parses the quiltId out of the CLI's stdout (handles both JSON-envelope
   and `quiltId: <b64url>` line formats).

Requires the `walrus` CLI on PATH — install per
<https://docs.wal.app/usage/setup.html>.

### 5. Deploy the contract against QID_METADATA

```bash
# Constructor args (forwarded to DeployQuiltedCollection.s.sol via env)
export QC_NAME="Walrus Quilted #01"
export QC_SYMBOL="WQ01"
export QC_QUILT_ID=<QID_METADATA from step 4>
export QC_AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
export QC_MAX_SUPPLY=10000

# EVM-side
export EVM_RPC_URL=http://127.0.0.1:8545
export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

pnpm deploy:contract --dry-run    # prints the forge command (private key redacted)
pnpm deploy:contract              # forge script broadcast
```

[`src/deploy.ts`](./src/deploy.ts) shells out to
`forge script script/DeployQuiltedCollection.s.sol` inside
`showcases/contracts/`. The forge script reads the `QC_*` env vars and
deploys the contract with the given constructor args.

### 6. Resolve a token URL off-chain

Indexers, marketplaces, and gallery frontends can compute tokenURIs
deterministically — no EVM RPC required.

```bash
export AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
export QUILT_ID=<QID_METADATA>

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
