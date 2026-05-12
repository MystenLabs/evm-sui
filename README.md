# EvmWal NFT

Sample EVM dApp where **anyone can mint their own NFT** with the image and metadata stored on Walrus (Mysten Labs' content-addressed off-chain storage). The user picks a picture in the browser, fills a short metadata form, and the app uploads both the image and the metadata JSON to Walrus testnet then submits the on-chain mint transaction. Clicking any NFT card opens the Walruscan explorer URL for the underlying Walrus blob.

Local-only by design — runs entirely against a local Anvil chain with MetaMask (or any other injected wallet). No live testnet, no WalletConnect, no Walrus account.

## Stack

| | |
|---|---|
| Contracts | Foundry · Solidity ^0.8.24 · OpenZeppelin Contracts v5.1.0 (`ERC721` + `ERC721URIStorage` + `Ownable`) |
| Frontend | Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript |
| EVM client | viem · wagmi · RainbowKit · @tanstack/react-query |
| Off-chain storage | Walrus testnet — publisher + aggregator over HTTP |
| Package manager | pnpm 10 (workspace: `contracts`, `web`) |
| Local chain | Anvil (ships with Foundry) — chain id 31337 |

## Prerequisites

### Local tooling

- macOS / Linux (tested on darwin-arm64)
- **Node 22** (`.nvmrc` pins this — `nvm use` if you have nvm)
- **pnpm 10** (`corepack enable && corepack prepare pnpm@10.32.1 --activate` if missing)
- **Foundry** — install with `curl -L https://foundry.paradigm.xyz | bash && foundryup`. Confirm with `forge --version`.

### Wallet

- Any browser-injected EVM wallet (MetaMask, Rabby, Coinbase Wallet extension, etc.). The wallet just needs to be able to add a custom RPC for the Anvil chain (RPC `http://127.0.0.1:8545`, chain id `31337`). You **don't** need any real ETH — Anvil mints pre-funded dev accounts, and the deploy script funds itself from dev-0.

### Walrus

**Nothing to install or sign up for.** The app talks to Walrus' public testnet endpoints over plain HTTPS:

- Publisher: `https://publisher.walrus-testnet.walrus.space` (writes)
- Aggregator: `https://aggregator.walrus-testnet.walrus.space` (reads)

Both are unauthenticated. You do not need a Sui wallet, WAL tokens, the Walrus CLI, or a Walrus operator — the public publisher pays the WAL storage cost on your behalf. The app caps uploads at 5 MiB (the public publisher's hard limit is ~10 MiB) and stores blobs for 5 epochs (≈ 14 days on Walrus testnet).

If the public publisher is throttled or down, you can run your own with `walrus publisher` and point the app at it via `NEXT_PUBLIC_WALRUS_PUBLISHER_URL` in `web/.env.local`.

## Quick start

```bash
git clone git@github.com:MystenLabs/evm-nft-wal.git && cd evm-nft-wal
pnpm install
```

Then in two terminals:

**Terminal A — local chain**

```bash
pnpm dev:chain        # starts anvil on 127.0.0.1:8545
```

**Terminal B — deploy + run**

```bash
pnpm deploy:local     # deploys EvmWalNFT to Anvil; writes .deployed-address
pnpm extract-abi      # syncs address + ABI into web/.env.local + web/lib/contract.ts
pnpm dev:web          # boots Next.js on http://localhost:3000
```

Open <http://localhost:3000> and:

1. Click **Connect Wallet** (top-right) and connect MetaMask (or any injected wallet).
2. **Switch your wallet to the Anvil chain** (chainId 31337). If your wallet doesn't know about Anvil yet, add the network manually with RPC `http://127.0.0.1:8545`.
3. Click the **Mint** tab.
4. Fill in `name`, `description`, pick a `category` (Art / Photo / Meme / Other), add an optional `vibe`, and choose an image file (PNG / JPEG / WebP, ≤ 5 MiB).
5. Click **Mint**. The app uploads your image to Walrus, builds the metadata JSON, uploads that to Walrus, then prompts your wallet to confirm the on-chain `mint(tokenURI)` call.
6. After confirmation your NFT appears in both the **All NFTs** and **My NFTs** tabs.
7. **Click any NFT card image** to open the underlying image blob on Walruscan (`https://walruscan.com/testnet/blob/<blobId>`). Each card also exposes explicit `image ↗` and `metadata ↗` links plus an **on-chain details** expander showing the contract address, token id, owner, the raw on-chain `tokenURI`, and both blob ids — useful for verifying that the on-chain pointer matches the blobs you see on Walruscan.

### Funding a wallet other than dev-0

`pnpm deploy:local` uses Anvil's well-known dev account 0. If you connect MetaMask with your own address, give it some local ETH from dev-0:

```bash
cast send <your-metamask-address> --value 100ether \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

That private key is the well-known Anvil dev-0 key — safe for local-dev only. Never use it on a real chain.

## How the Walrus integration works

The EVM contract never sees Sui. The dApp talks to Walrus only over HTTP:

- **Publisher** — `PUT https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=5` with the file body. Returns the `blobId`.
- **Aggregator** — `GET https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blobId>` returns the bytes.
- **Walruscan** — `https://walruscan.com/testnet/blob/<blobId>` opens the explorer entry for the blob.

The Solidity contract just stores a `tokenURI` string per token, exactly like an IPFS CID in a classic `ERC721URIStorage`. The browser does the actual uploading via `web/lib/walrus-upload.ts`.

Each NFT is backed by **two** Walrus blobs:

1. The image file (PNG/JPEG/WebP) — `blobId_image`
2. The ERC-721 metadata JSON, whose `image` field is the aggregator URL of `blobId_image` — `blobId_metadata`

The contract's `tokenURI(tokenId)` returns the aggregator URL of `blobId_metadata`.

## Repo shape

```
evm-nft-wal/
├── contracts/                 Foundry package
│   ├── foundry.toml
│   ├── remappings.txt
│   ├── src/EvmWalNFT.sol       (open mint + mintTo + Minted event)
│   ├── test/EvmWalNFT.t.sol    (7 tests, 100% line coverage on the contract)
│   ├── script/Deploy.s.sol     (deploy-only)
│   └── lib/                    (forge-installed OZ + forge-std, gitignored)
├── scripts/
│   ├── write-deployed-address.ts
│   ├── extract-abi.ts          (writes web/.env.local + web/lib/contract.ts)
│   ├── generate-assets.ts      (legacy dev fixture generator; unused at runtime)
│   └── upload-walrus.ts        (DEPRECATED — kept as a Node reference for the publisher PUT shape)
├── assets/                     5 generated PNG fixtures (legacy)
├── web/                       Next.js 16 App Router
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx            tabbed: All / Mine / Mint
│   │   └── providers.tsx       wagmi + RainbowKit + QueryClient (no WalletConnect)
│   ├── components/
│   │   ├── AllNFTsView.tsx     full gallery (everyone's mints)
│   │   ├── MyNFTsView.tsx      filtered to the connected wallet
│   │   ├── MintForm.tsx        the mint UI
│   │   ├── NFTCard.tsx         renders image + metadata; links to Walruscan
│   │   ├── Tabs.tsx            tab switcher
│   │   └── ConnectButton.tsx
│   ├── hooks/
│   │   ├── useMint.ts          multi-stage mint state machine
│   │   └── useAllTokens.ts     token discovery (scans totalSupply + ownerOf)
│   └── lib/
│       ├── chains.ts           Anvil 31337 only
│       ├── walrus.ts           aggregator URL helper
│       ├── walruscan.ts        Walruscan URL + parser helpers
│       ├── walrus-upload.ts    browser-side publisher PUT
│       ├── metadata.ts         ERC-721 metadata schema builder
│       └── contract.ts         ABI + address (overwritten by extract-abi)
├── tests/                     node:test harness used during the build
└── .deployed-address          generated by deploy:local; gitignored
```

## Scripts (root)

| Command | What it does |
|---|---|
| `pnpm dev:chain` | Start Anvil on 127.0.0.1:8545 |
| `pnpm deploy:local` | Deploy `EvmWalNFT` to Anvil; write `.deployed-address` |
| `pnpm extract-abi` | Populate `web/.env.local` + `web/lib/contract.ts` from forge output |
| `pnpm dev:web` | Start Next.js dev server on `:3000` |
| `pnpm gen:assets` | Re-generate the 5 sample PNGs (legacy dev utility) |
| `pnpm seed:walrus` | DEPRECATED — legacy utility for pre-seeding NFTs; not used at runtime |
| `pnpm lint` | Lint TS/TSX via Next ESLint |
| `pnpm format` | Format with Prettier (+ prettier-plugin-solidity for `.sol`) |

## Tests

- **Contracts (forge test)** — `cd contracts && forge test -vv` runs 7 unit tests covering: anyone-can-mint, sequential ids, `mintTo` recipient, `Minted` event emission, totalSupply, supportsInterface, transfer. Line coverage on `src/EvmWalNFT.sol` is 100%.
- **Harness** — `tests/v2-cycle{1..7}/*.test.mjs` are Node `node:test` suites that verified each build cycle's deliverable.

## Notes

- Mint visibility is open: **anyone may mint** by calling `mint(string tokenURI)` (self-mint) or `mintTo(address to, string tokenURI)` (gift-mint). `Ownable` is still inherited but no longer gates minting.
- The public Walrus testnet publisher is unauthenticated and pays the WAL storage cost on your behalf. If a mint flow succeeds at uploading the image and/or metadata but the on-chain mint never lands (e.g. user rejects the wallet prompt), the Walrus blobs are orphaned on the testnet. Harmless — you spent nothing.
- The gallery scans `1..totalSupply` on every render. Snappy at ≤ 100 tokens; degrades linearly past that. For production scale you'd want a subgraph or `Transfer` event indexer.

## License

[MIT](./LICENSE). The Solidity contract files declare `SPDX-License-Identifier: MIT` per Foundry/OpenZeppelin convention.
