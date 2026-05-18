<p align="center">
  <strong>Walrus Low-Hanging Fruit</strong> · six small dApps that demonstrate how<br>
  <a href="https://docs.wal.app/">Walrus</a> answers the specific IPFS pain points web3 builders voice in 2026.
</p>

---

Web3 builders in 2026 don't dislike content addressing — they dislike the IPFS network. CIDs survive, ENS contenthash is non-negotiable, and verifiability is non-optional. What's collapsing is the operational promise: free public goods that get deprecated, pinning vendors that churn SDKs, and IPNS that quietly broke everyone's mutable pointers.

This repo names six low-hanging fruits where Walrus answers a specific grievance with a small, opinionated example. Showcase 01 (the **EvmWal NFT** dApp) is the canonical template — every other fruit is a variation on it: one tiny Solidity contract, one or two fetch calls, one URL prefix.

The full design narrative — which IPFS quote each fruit addresses, the shape of each migration, the recommended sequencing — lives on the **landing site** at <https://glowing-adventure-e483rqp.pages.github.io/>, with per-showcase walkthrough pages linked from there. The 2026 builder-sentiment survey it was distilled from is [`ipfs-pain.md`](./ipfs-pain.md); the site's source lives under [`docs/`](./docs/).

## The six fruits

| # | Showcase | Layout | Status |
|---|---|---|---|
| 01 | NFT image + metadata | [`showcases/01-evmwal-nft/`](./showcases/01-evmwal-nft/) + [`showcases/contracts/src/EvmWalNFT.sol`](./showcases/contracts/src/EvmWalNFT.sol) | shipped |
| 02 | Walrus Sites for dApp frontend hosting | [`showcases/02-walrus-sites/`](./showcases/02-walrus-sites/) | implemented |
| 03 | WalrusResolver — IPNS replacement | [`showcases/03-walrus-resolver/`](./showcases/03-walrus-resolver/) + [`showcases/contracts/src/WalrusResolver.sol`](./showcases/contracts/src/WalrusResolver.sol) | implemented |
| 04 | DAO governance proposals on Walrus | [`showcases/04-dao-proposals/`](./showcases/04-dao-proposals/) + [`showcases/contracts/src/Governance.sol`](./showcases/contracts/src/Governance.sol) | implemented |
| 05 | Verifiable token list / dApp manifest | [`showcases/05-verifiable-manifest/`](./showcases/05-verifiable-manifest/) + [`showcases/contracts/src/WalrusResolver.sol`](./showcases/contracts/src/WalrusResolver.sol) | implemented |
| 06 | Quilted ERC-721 collection drop | [`showcases/06-quilted-collection/`](./showcases/06-quilted-collection/) + [`showcases/contracts/src/QuiltedCollection.sol`](./showcases/contracts/src/QuiltedCollection.sol) | implemented |

Pick a showcase under [`showcases/<n>-*`](./showcases/) and read its README — each one stands alone.

## Repo conventions

- **Solidity** for every showcase lives in a single shared Foundry package at [`showcases/contracts/`](./showcases/contracts/). Build + test with `cd showcases/contracts && forge build && forge test -vv`.
- **TypeScript / Next.js packages** sit one per showcase under `showcases/<n>-*`. Showcase 01 is a `pnpm` workspace (`01-evmwal-nft` + `01-evmwal-nft/web`); 03 and 05 expect `pnpm install` to be run in their own directories.
- **Repo-wide** tooling at root: `dev:chain` (anvil), `format` (Prettier + `prettier-plugin-solidity`), `dev:nft` shortcut into showcase 01's frontend.
- **Node 22**, **pnpm 10**, **Foundry**. `.nvmrc` pins Node.

## Quick start

```bash
pnpm install
pnpm dev:chain    # anvil on 127.0.0.1:8545

# in another terminal — bring up showcase 01's frontend
cd showcases/01-evmwal-nft
pnpm deploy:local
pnpm dev:web      # http://localhost:3000
```

See each showcase's README for its own setup.

## License

[MIT](./LICENSE). Solidity sources carry `SPDX-License-Identifier: MIT` per Foundry/OpenZeppelin convention.
