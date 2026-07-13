# Chapter 2 — Everyday Solidity, done on Sui

Thirteen of the most common Solidity/EVM patterns, each paired with its
idiomatic Sui Move equivalent. Every pair answers one question a Solidity
developer actually asks: *"I know how to do X on Ethereum — how do I do it on
Sui?"*

The selection and ordering come from a prevalence-ranked deep-research report
([`../notes/solidity-patterns-research.html`](../notes/solidity-patterns-research.html)):
tokens, access control and factories are the measured top of the EVM world;
the mid-tier use cases (escrow, vesting, multisig, airdrops, permit, flash
loans, governance) are the ones the official
[Sui-for-Ethereum docs](https://docs.sui.io/concepts/sui-for-ethereum) leave
unaddressed.

**Design rule:** on the Sui side we prefer
[OpenZeppelin Contracts for Sui](https://docs.openzeppelin.com/contracts-sui)
wherever it applies — Solidity developers already trust OZ APIs.

| # | Pattern | Solidity | Sui Move | OZ‑Sui |
|---|---|---|---|---|
| 01 | Fungible token | `01_FungibleToken.sol` | `fungible_token.move` | native `coin` |
| 02 | NFT | `02_Nft.sol` | `nft.move` | native object + `Display` |
| 03 | Access control | `03_AccessControl.sol` | `access_control.move` | ✓ `openzeppelin_access` |
| 04 | Upgradeability | `04_UpgradeableCounter.sol` | `versioned.move` | native package upgrade |
| 05 | Factory / clones | `05_Factory.sol` | `no_factory.move` | native (pattern vanishes) |
| 06 | Escrow | `06_Escrow.sol` | `escrow.move` | native shared object |
| 07 | Vesting | `07_Vesting.sol` | `vesting.move` | ✓ `openzeppelin_finance` |
| 08 | Multisig | `08_Multisig.sol` | `patterns/native/multisig.sh` | native key scheme |
| 09 | Merkle airdrop | `09_MerkleAirdrop.sol` | `airdrop.move` | native parallel transfers |
| 10 | Gasless (permit) | `10_Permit.sol` | `patterns/native/sponsored-tx.ts` | native sponsored tx |
| 11 | Flash loan | `11_FlashLoan.sol` | `flash_loan.move` | native hot potato |
| 12 | Security canon | `12_SecurityPatterns.sol` | `security.move` | mostly moot in Move |
| 13 | Governance | `13_Governance.sol` | `governance.move` | native shared object |

Two patterns (08 multisig, 10 gasless) have **no contract** on Sui — they are
platform-level features, so their "Sui side" is a shell/TS snippet under
[`native/`](./native/), which is itself the lesson.

## Layout

```
patterns/
├── solidity/          Foundry package — 13 contracts + smoke tests
│   ├── src/           one NN_Name.sol per pattern
│   ├── test/          Patterns.t.sol — one smoke test each (15 total)
│   └── SECURITY-NOTES.md   Slither triage (snippet 12 is intentionally vulnerable)
├── move/patterns/     Sui Move package — one module per pattern
└── native/            platform-level answers (multisig, sponsored tx)
```

## Build & test

```bash
# Solidity (Foundry). lib/ is vendored, not committed — fetch it first:
cd patterns/solidity
git clone --depth 1 https://github.com/foundry-rs/forge-std lib/forge-std
git clone --depth 1 --branch v5.4.0 https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
forge build && forge test

# Sui Move (OZ Contracts for Sui deps declare per-env packages, so pass --build-env)
cd patterns/move/patterns
sui move build --build-env testnet && sui move test --build-env testnet
```

> ⚠️ `patterns/solidity/src/12_SecurityPatterns.sol` contains a **deliberately
> vulnerable** `VulnerableVault` for teaching. Never deploy it. See
> [`solidity/SECURITY-NOTES.md`](./solidity/SECURITY-NOTES.md).
