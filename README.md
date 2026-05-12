# EvmWal NFT

Sample EVM dApp where **anyone can mint their own NFT** with the image and metadata stored on Walrus (Mysten Labs' content-addressed off-chain storage). The user picks a picture in the browser, fills a short metadata form, and the app uploads both the image and the metadata JSON to Walrus testnet then submits the on-chain mint transaction. Clicking any NFT card opens the Walruscan explorer URL for the underlying Walrus blob.

## Stack

| | |
|---|---|
| Contracts | Foundry · Solidity ^0.8.24 · OpenZeppelin Contracts v5.1.0 (`ERC721` + `ERC721URIStorage` + `Ownable`) |
| Frontend | Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript |
| EVM client | viem · wagmi · RainbowKit · @tanstack/react-query |
| Off-chain storage | Walrus testnet — publisher + aggregator over HTTP |
| Package manager | pnpm 10 (workspace: `contracts`, `web`) |
| Local chain | Anvil (ships with Foundry) |
| Public testnet (planned) | Sepolia |

## Prerequisites

- macOS / Linux (tested on darwin-arm64)
- **Node 22** (`.nvmrc` pins this — `nvm use` if you have nvm)
- **pnpm 10** (`corepack enable && corepack prepare pnpm@10.32.1 --activate` if missing)
- **Foundry** — install with `curl -L https://foundry.paradigm.xyz | bash && foundryup`. Confirm with `forge --version`.

## Quick start

```bash
git clone <this-repo> && cd evm-wal
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

Then open <http://localhost:3000> and:

1. Click **Connect Wallet** (top-right) and connect MetaMask (or any injected wallet).
2. **Switch your wallet to the Anvil chain** (chainId 31337). MetaMask should prompt; if not, add the network manually with RPC `http://127.0.0.1:8545`.
3. Click the **Mint** tab.
4. Fill in `name`, `description`, pick a `category` (Art / Photo / Meme / Other), add an optional `vibe`, and choose an image file (PNG / JPEG / WebP, ≤ 5 MiB).
5. Click **Mint**. The app uploads your image to Walrus, builds the metadata JSON, uploads that to Walrus, then prompts your wallet to confirm the on-chain `mint(tokenURI)` call.
6. After confirmation your NFT appears in both the **All NFTs** and **My NFTs** tabs.
7. **Click any NFT card** to open its image blob on Walruscan (`https://walruscan.com/testnet/blob/<blobId>`). Each card also has a smaller "metadata on Walruscan" link for the metadata blob.

## How the Walrus integration works

The EVM contract never sees Sui. The dApp talks to Walrus only over HTTP:

- **Publisher** — `PUT https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=5` with the file body. Returns the `blobId`.
- **Aggregator** — `GET https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blobId>` returns the bytes.
- **Walruscan** — `https://walruscan.com/testnet/blob/<blobId>` opens the explorer entry for the blob.

The Solidity contract just stores a `tokenURI` string per token, exactly like an IPFS CID in a classic `ERC721URIStorage`. The browser does the actual uploading via `web/lib/walrus-upload.ts`.

## Repo shape

```
evm-wal/
├── contracts/                 Foundry package
│   ├── foundry.toml
│   ├── remappings.txt
│   ├── src/EvmWalNFT.sol       (open mint + mintTo + Minted event)
│   ├── test/EvmWalNFT.t.sol    (7 tests, 100% line coverage)
│   ├── script/Deploy.s.sol     (deploy-only)
│   └── lib/                    (forge-installed OZ + forge-std, gitignored)
├── scripts/
│   ├── write-deployed-address.ts
│   ├── extract-abi.ts          (writes web/.env.local + web/lib/contract.ts)
│   ├── generate-assets.ts      (dev fixture generator; unused in v2 product)
│   └── upload-walrus.ts        (DEPRECATED — kept as a Node reference)
├── web/                       Next.js 16 App Router
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx            tabbed: All / Mine / Mint
│   │   └── providers.tsx       WagmiProvider + RainbowKitProvider + QueryClient
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
│       ├── chains.ts           Anvil 31337 + Sepolia
│       ├── walrus.ts           aggregator URL helper
│       ├── walruscan.ts        Walruscan URL + parser helpers
│       ├── walrus-upload.ts    browser-side publisher PUT
│       ├── metadata.ts         v2 metadata schema builder
│       └── contract.ts         ABI + address (overwritten by extract-abi)
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
| `pnpm seed:walrus` | DEPRECATED — legacy v1 utility for pre-seeding NFTs; not used in v2 product flow |
| `pnpm lint` | Lint TS/TSX via Next ESLint |
| `pnpm format` | Format with Prettier (+ prettier-plugin-solidity for `.sol`) |

## Tests

- **Contracts (forge test)** — `cd contracts && forge test -vv` runs 7 unit tests covering: anyone-can-mint, sequential ids, mintTo recipient, Minted event emission, totalSupply, supportsInterface, transfer. Line coverage on `src/EvmWalNFT.sol` is 100%.
- **Harness** — `tests/v2-cycle{1..7}/*.test.mjs` are Node `node:test` suites that verified each v2 build cycle's deliverable.

## Notes

- Mint visibility is open: **anyone may mint** by calling `mint(string tokenURI)` (self-mint) or `mintTo(address to, string tokenURI)` (gift-mint). `Ownable` is still inherited but no longer gates minting.
- Walrus testnet's public publisher is unauthenticated and pays the WAL gas — users pay no Walrus cost. If a mint upload succeeds but the on-chain mint never lands (e.g. user rejects the wallet prompt), the Walrus blobs are orphaned on the testnet. This is harmless.
- The gallery scans `1..totalSupply` on every render. Snappy at ≤ 100 tokens; degrades linearly past that. For a real production app you'd want a subgraph or `Transfer` event indexer.

## Roadmap (not in v2)

- Sepolia deployment + WalletConnect Cloud project ID for real wallet UX
- Image-blob preview pane / lightbox on card click
- ERC-2981 royalties / royalty splitter
- Subgraph or Walrus Sites for indexed/static hosting
