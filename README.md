<p align="center">
  <strong>EVM × Sui</strong> · code examples showing EVM dApps what they gain<br>
  from <a href="https://docs.wal.app/">Walrus</a> storage and <a href="https://docs.sui.io/sui-stack/nautilus/">Nautilus</a> verifiable compute on <a href="https://sui.io/">Sui</a>.
</p>

---

Two pillars, one repo. **Walrus** showcases (01–06) each pair a Solidity contract with a few hundred lines of TypeScript — same EVM surface, storage swapped to Walrus. **Nautilus** showcases start at 07 and leave EVM entirely — Rust enclaves sign data inside a TEE, Sui Move contracts verify the signatures on-chain.

The landing site at <https://mystenlabs.github.io/evm-wal/> links to the [Walrus hub](https://mystenlabs.github.io/evm-wal/walrus.html) and [Nautilus hub](https://mystenlabs.github.io/evm-wal/nautilus.html), each with per-showcase walkthrough pages. Source lives under [`docs/`](./docs/).

## Walrus showcases — decentralized storage for EVM

| # | Showcase | Layout | Status |
|---|---|---|---|
| 01 | NFT image + metadata | [`showcases/01-evmwal-nft/`](./showcases/01-evmwal-nft/) + [`showcases/contracts/src/EvmWalNFT.sol`](./showcases/contracts/src/EvmWalNFT.sol) | shipped |
| 02 | Walrus Sites for dApp frontend hosting | [`showcases/02-walrus-sites/`](./showcases/02-walrus-sites/) | implemented |
| 03 | WalrusResolver — IPNS replacement | [`showcases/03-walrus-resolver/`](./showcases/03-walrus-resolver/) + [`showcases/contracts/src/WalrusResolver.sol`](./showcases/contracts/src/WalrusResolver.sol) | implemented |
| 04 | DAO governance proposals on Walrus | [`showcases/04-dao-proposals/`](./showcases/04-dao-proposals/) + [`showcases/contracts/src/Governance.sol`](./showcases/contracts/src/Governance.sol) | implemented |
| 05 | Verifiable token list / dApp manifest | [`showcases/05-verifiable-manifest/`](./showcases/05-verifiable-manifest/) + [`showcases/contracts/src/WalrusResolver.sol`](./showcases/contracts/src/WalrusResolver.sol) | implemented |
| 06 | Quilted ERC-721 collection drop | [`showcases/06-quilted-collection/`](./showcases/06-quilted-collection/) + [`showcases/contracts/src/QuiltedCollection.sol`](./showcases/contracts/src/QuiltedCollection.sol) | implemented |

## Nautilus showcases — verifiable off-chain compute

| # | Showcase | Layout | Status |
|---|---|---|---|
| 01 | Price oracle | [`showcases/07-nautilus/`](./showcases/07-nautilus/) (Sui Move + Rust enclave) | implemented |

Pick a showcase under [`showcases/<n>-*`](./showcases/) and read its README — each one stands alone.

## Repo conventions

- **Solidity** for every EVM showcase lives in a single shared Foundry package at [`showcases/contracts/`](./showcases/contracts/). Build + test with `cd showcases/contracts && forge build && forge test -vv`.
- **TypeScript / Next.js packages** sit one per showcase under `showcases/<n>-*`. Showcase 01 is a `pnpm` workspace (`01-evmwal-nft` + `01-evmwal-nft/web`); 03 and 05 expect `pnpm install` to be run in their own directories.
- **Showcase 07** lives outside the EVM toolchain — Rust + Sui Move. Build with `cd showcases/07-nautilus/enclave && cargo check`, and `sui move build` in each of `showcases/07-nautilus/move/{enclave,price-oracle}/`.
- **Repo-wide** tooling at root: `dev:chain` (anvil), `format` (Prettier + `prettier-plugin-solidity`), `dev:nft` shortcut into showcase 01's frontend.
- **Node 22**, **pnpm 10**, **Foundry**. `.nvmrc` pins Node. Showcase 07 additionally needs **Rust ≥ 1.81** and the **`sui` CLI**.

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
