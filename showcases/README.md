# Walrus Low-Hanging-Fruit Showcases

Five shippable dApps that map the IPFS pain points catalogued in
[`../ipfs-pain.md`](../ipfs-pain.md) to concrete Walrus replacements, modelled
on the [EvmWal NFT](../README.md) reference (showcase 01, already shipped at
the repo root).

Each showcase is intentionally small — a tiny Solidity contract plus a few
hundred lines of TypeScript — so the migration path from IPFS is obvious.

| # | Showcase | Layout | Status |
|---|---|---|---|
| 01 | NFT image + metadata | `../` (the rest of this repo) | shipped |
| 02 | Walrus Sites for dApp frontend hosting | `02-walrus-sites/` | scaffold |
| 03 | WalrusResolver — IPNS replacement | `03-walrus-resolver/` + `contracts/src/WalrusResolver.sol` | implemented |
| 04 | DAO governance proposals on Walrus | `contracts/src/Governance.sol` | implemented |
| 05 | Verifiable token list / dApp manifest | `05-verifiable-manifest/` | implemented |
| 06 | Quilted ERC-721 collection drop | `contracts/src/QuiltedCollection.sol` | implemented |

The full design narrative — which IPFS quote each fruit addresses, the
shape of each migration, the recommended sequencing — lives in
[`../walrus-low-hanging-fruits.html`](../walrus-low-hanging-fruits.html).

## Repo shape

```
showcases/
├── contracts/              one Foundry package, three contracts + tests
│   ├── src/
│   │   ├── WalrusResolver.sol      (showcase 03 — also serves 05)
│   │   ├── Governance.sol          (showcase 04)
│   │   └── QuiltedCollection.sol   (showcase 06)
│   └── test/
│       ├── WalrusResolver.t.sol
│       ├── Governance.t.sol
│       └── QuiltedCollection.t.sol
├── 02-walrus-sites/        publish.sh + example-site/ (no contract)
├── 03-walrus-resolver/
│   └── keeper/             TS keeper that extends Sui Blob objects
├── 05-verifiable-manifest/ TS client; resolves token lists through WalrusResolver
└── README.md               this file
```

## Quick start

### Build and test the contracts

```bash
cd showcases/contracts
forge install --no-git foundry-rs/forge-std openzeppelin/openzeppelin-contracts
forge build
forge test -vv
```

### Run the keeper (showcase 03)

```bash
cd showcases/03-walrus-resolver/keeper
pnpm install

# EVM side
export EVM_RPC_URL=https://eth.llamarpc.com
export EVM_CHAIN_ID=1                          # mainnet; set 11155111 for Sepolia, etc.
export RESOLVER_ADDRESS=0x...                  # deployed WalrusResolver

# Sui / Walrus side
export SUI_RPC_URL=https://fullnode.testnet.sui.io:443
export WALRUS_NETWORK=testnet                  # 'testnet' or 'mainnet'
export SUI_PRIVATE_KEY=suiprivkey...           # holds WAL for extensions

# Keeper config
export KEEPER_NAMES="blog.vitalik.eth,tokens.uniswap.eth"
export EXTENSION_THRESHOLD=5
export EXTEND_BY_EPOCHS=50

pnpm keeper
```

### Resolve a token list (showcase 05)

```bash
cd showcases/05-verifiable-manifest
pnpm install

export EVM_RPC_URL=https://eth.llamarpc.com
export RESOLVER_ADDRESS=0x...
export ENS_NAME=tokens.uniswap.eth
export AGGREGATOR=https://aggregator.walrus-testnet.walrus.space

pnpm tsx example-usage.ts
```

### Publish a Walrus Site (showcase 02)

```bash
cd showcases/02-walrus-sites
./publish.sh ./example-site
```

See `publish.sh` for the SuiNS link + optional ENS bridge follow-up steps.

## How each contract maps to the IPFS grievance

- **WalrusResolver** answers "IPNS is the most loudly broken primitive"
  (ipfs-pain.md §6). 35 lines, ENS-gated, struct pointer carrying the on-Sui
  Blob object id so a permissionless keeper can keep blobs alive forever.
- **Governance** answers "Snapshot uses 4Everland-pinned IPFS" (§9). Proposer
  pays the WAL storage cost via the public publisher; only the 32-byte
  blobId, deadline, and tallies live on-chain.

  > **Warning — showcase-only voting surface.** `Governance.vote` weights by
  > live `voteToken.balanceOf(msg.sender)`, which is **flash-loan-attackable**
  > against any ERC-20 with a flash-mint or flash-borrow integration. For
  > production, pair with an OpenZeppelin `ERC20Votes` token and switch
  > `vote()` to read `IVotes(voteToken).getPastVotes(msg.sender, proposalStartBlock)`.
  > See the NatSpec at the top of `contracts/src/Governance.sol`.
- **QuiltedCollection** answers "OpenSea improved metadata reliability 99.2%
  when they switched to Pinata" (§8). One Walrus Quilt holds every token's
  metadata; `tokenURI(id)` deterministically returns the aggregator URL — no
  per-token pin, no per-token state.

## Notes

- The keeper and manifest clients declare their dependencies but expect
  `pnpm install` to be run in their respective directories. They are not
  wired into the repo-root `pnpm-workspace.yaml` yet.
- `WalrusResolver` takes the ENS Registry address in its constructor; tests
  use an in-process `MockENS`. For mainnet, pass the real ENS registry at
  `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`.
- `QuiltedCollection` stores `quiltId` and `aggregator` as immutable strings;
  encode the quiltId as the canonical base64url form the Walrus aggregator
  expects (`/v1/blobs/by-quilt-id/<quiltId>/<identifier>`).
