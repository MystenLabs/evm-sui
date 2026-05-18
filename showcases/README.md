# Walrus Low-Hanging-Fruit Showcases

Six shippable dApps that map the IPFS pain points catalogued in
[`../ipfs-pain.md`](../ipfs-pain.md) to concrete Walrus replacements. Showcase
01 ([EvmWal NFT](./01-evmwal-nft/README.md)) is the reference template —
every other fruit is a variation on it.

Each showcase is intentionally small — a tiny Solidity contract plus a few
hundred lines of TypeScript — so the migration path from IPFS is obvious.

| # | Showcase | Layout | Status |
|---|---|---|---|
| 01 | NFT image + metadata | [`01-evmwal-nft/`](./01-evmwal-nft/) + [`contracts/src/EvmWalNFT.sol`](./contracts/src/EvmWalNFT.sol) | shipped |
| 02 | Walrus Sites for dApp frontend hosting | [`02-walrus-sites/`](./02-walrus-sites/) | implemented |
| 03 | WalrusResolver — IPNS replacement | [`03-walrus-resolver/`](./03-walrus-resolver/) + [`contracts/src/WalrusResolver.sol`](./contracts/src/WalrusResolver.sol) | implemented |
| 04 | DAO governance proposals on Walrus | [`04-dao-proposals/`](./04-dao-proposals/) + [`contracts/src/Governance.sol`](./contracts/src/Governance.sol) | implemented |
| 05 | Verifiable token list / dApp manifest | [`05-verifiable-manifest/`](./05-verifiable-manifest/) + [`contracts/src/WalrusResolver.sol`](./contracts/src/WalrusResolver.sol) | implemented |
| 06 | Quilted ERC-721 collection drop | [`06-quilted-collection/`](./06-quilted-collection/) + [`contracts/src/QuiltedCollection.sol`](./contracts/src/QuiltedCollection.sol) | implemented |

The full design narrative — which IPFS quote each fruit addresses, the
shape of each migration, the recommended sequencing — lives on the
landing site at <https://mystenlabs.github.io/evm-nft-wal/>, with a
per-showcase walkthrough linked from each card. The site's source is
under [`../docs/`](../docs/).

## Repo shape

```
showcases/
├── contracts/              one Foundry package, four contracts + tests + deploy scripts
│   ├── src/
│   │   ├── EvmWalNFT.sol            (showcase 01)
│   │   ├── WalrusResolver.sol       (showcase 03 — also serves 05)
│   │   ├── Governance.sol           (showcase 04)
│   │   └── QuiltedCollection.sol    (showcase 06)
│   ├── test/
│   │   ├── EvmWalNFT.t.sol
│   │   ├── WalrusResolver.t.sol
│   │   ├── Governance.t.sol
│   │   └── QuiltedCollection.t.sol
│   └── script/
│       ├── DeployEvmWalNFT.s.sol         (showcase 01)
│       └── DeployQuiltedCollection.s.sol (showcase 06)
├── 01-evmwal-nft/          Next.js dApp + scripts + assets + tests
├── 02-walrus-sites/        publish.sh + example-site/ + walkthrough README
├── 03-walrus-resolver/
│   └── keeper/             TS keeper that extends Sui Blob objects
├── 04-dao-proposals/       TS propose + tally CLIs (publisher PUT + viem)
├── 05-verifiable-manifest/ TS client; resolves token lists through WalrusResolver
├── 06-quilted-collection/  TS pack + deploy + url helpers (walrus store-quilt)
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

### Showcase 01 — full walkthrough

See [`01-evmwal-nft/README.md`](./01-evmwal-nft/README.md) for the EvmWal NFT
dApp (open mint via browser, dual Walrus write paths, Anvil-backed local dev).

### Showcase 03 — full walkthrough

See [`03-walrus-resolver/README.md`](./03-walrus-resolver/README.md) for the
WalrusResolver deployment pattern (subdomain trick, ENS-gated authorization,
keeper expectations) and the rationale for each design decision.

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

- **EvmWalNFT** answers "Don't trust free decentralized storage to outlive
  your project" (ipfs-pain.md §4). Vanilla ERC-721 + ERC721URIStorage;
  Walrus aggregator URL in `tokenURI`; dual write paths (operator SDK or
  public publisher) — the Solidity side is identical to an IPFS NFT.
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

- Showcase 01, 04, and 06 are wired into the repo-root `pnpm-workspace.yaml`
  (packages: `01-evmwal-nft`, `01-evmwal-nft/web`, `04-dao-proposals`,
  `06-quilted-collection`). The keeper (03) and manifest (05) clients still
  expect `pnpm install` in their respective directories — they are not
  workspace members yet.
- `WalrusResolver` takes the ENS Registry address in its constructor; tests
  use an in-process `MockENS`. For mainnet, pass the real ENS registry at
  `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`.
- `QuiltedCollection` stores `quiltId` and `aggregator` as immutable strings;
  encode the quiltId as the canonical base64url form the Walrus aggregator
  expects (`/v1/blobs/by-quilt-id/<quiltId>/<identifier>`).
