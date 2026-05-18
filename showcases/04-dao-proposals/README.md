# Showcase 04 — DAO governance proposals on Walrus

A 100-line Solidity contract that holds the on-chain skeleton of a vote
(proposer, deadline, tallies) while the human-readable proposal body lives
on Walrus. Two thin TS CLIs drive the end-to-end flow.

> **Source files**
>
> - Contract: [`../contracts/src/Governance.sol`](../contracts/src/Governance.sol)
> - Tests: [`../contracts/test/Governance.t.sol`](../contracts/test/Governance.t.sol)
> - Propose CLI: [`./src/propose.ts`](./src/propose.ts)
> - Tally CLI: [`./src/tally.ts`](./src/tally.ts)

## The pain it answers

> "4Everland is used by Snapshot governance for Aave and Uniswap DAO votes" —
> bundled into the same hosted-IPFS tier that absorbs the operational pain
> because public gateways can't be trusted.
> *(ipfs-pain.md §9 — hosted IPFS providers)*

DAOs voting today depend on a hosted-IPFS provider holding the proposal
body. The body is plain markdown, doesn't need a P2P fetch, and is read
by every voter — exactly the pattern public IPFS gateways degrade on under
load. Hosting it on Walrus puts the WAL cost on the proposer and removes
the pinning vendor from the critical path.

## The shape

```
proposer       ──read body.md──▶ ─PUT publisher/v1/blobs?epochs=5──▶ Walrus
                                                                       │
                                                                       ▼
                                                              (blobId, suiObjectId)
                                                                       │
proposer       ──propose(blobId, deadline)──▶ Governance (EVM)
                                                       │
voter          ──vote(id, support)──▶ Governance       │
                                                       ▼
reader         ──proposals(id)──▶ (proposer, blobId, deadline, yes, no)
                       │
                       └──GET aggregator/v1/blobs/<blobId>──▶ markdown body
```

Two on-chain artifacts per proposal:

- the 32-byte Walrus `blobId` in the `Proposal` struct on Sui's neighbor EVM chain;
- the underlying Sui `Blob` object — owned by the publisher, not the DAO.

The proposer pays WAL via the public publisher; the DAO contract never holds WAL.

## Why it dodges Snapshot's IPFS dependency

| IPFS today | Walrus + Governance.sol |
|---|---|
| Body pinned by 4Everland; sunset risk repeats the 2024 NFT.Storage / Cloudflare wound | Body lives on Walrus; aggregator is commodity HTTPS |
| Gateway tail latency on vote day = lost votes | Aggregator GET is deterministic; no DHT walk |
| Snapshot adapter is an integration the DAO can't audit cheaply | Three contract methods (`propose` / `vote` / `tally`) and one publisher PUT — auditable in one sitting |
| Pinning lifetime depends on a vendor contract | `epochs` is a value the proposer chose; renewal is a Sui tx anyone can pay |

## ⚠️ Showcase-only voting surface

`Governance.vote()` reads `voteToken.balanceOf(msg.sender)` at the instant
of the call. **Against any ERC-20 with a flash-mint or flash-borrow
integration, this is exploitable.** An attacker can borrow tokens, vote,
and repay in a single transaction.

This contract is a demonstration of the **Walrus integration shape** —
proposer-pays publisher PUT, on-chain pointer, deterministic aggregator
resolution. The voting math is deliberately minimal.

For production: pair with an OpenZeppelin `ERC20Votes` token and switch
`vote()` to `IVotes(voteToken).getPastVotes(msg.sender, proposalStartBlock)`.
See the NatSpec at the top of [`Governance.sol`](../contracts/src/Governance.sol).

## CLI flow

### Propose

```bash
cd showcases/04-dao-proposals
pnpm install

# EVM side
export EVM_RPC_URL=http://127.0.0.1:8545           # or your live RPC
export EVM_CHAIN_ID=31337                          # anvil; mainnet=1, sepolia=11155111, ...
export GOVERNANCE_ADDRESS=0x...                    # deployed Governance contract
export PROPOSER_PRIVATE_KEY=0x...                  # signer for the propose() tx

# Walrus side
export WALRUS_PUBLISHER=https://publisher.walrus-testnet.walrus.space
export WALRUS_AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
export WALRUS_EPOCHS=5

# Dry run — uploads to Walrus, prints the calldata, does NOT send the EVM tx
pnpm propose --dry-run ./fixtures/sample-proposal.md 2026-06-01T00:00:00Z

# Live
pnpm propose ./fixtures/sample-proposal.md 2026-06-01T00:00:00Z
```

[`src/propose.ts`](./src/propose.ts):

1. Reads the markdown body from disk.
2. PUTs it to the public Walrus publisher (`epochs=5` default — bump via `WALRUS_EPOCHS`).
3. Converts the returned base64url blobId to the 0x-prefixed `bytes32` the contract expects.
4. Calls `Governance.propose(blobId, deadline)` via viem.
5. Prints the resulting `lastProposalId`.

### Tally

```bash
# No signer required — read-only.
pnpm tally 1
```

[`src/tally.ts`](./src/tally.ts):

1. Reads `proposals(id)` to get the blobId and metadata.
2. Calls `tally(id)` for the canonical (yes, no, passed, closed) tuple.
3. Fetches the markdown body from the aggregator and writes it to stdout.

## Deadline format

The CLI accepts either a unix-seconds integer or an ISO-8601 string:

```bash
pnpm propose ./body.md 1748736000             # unix seconds
pnpm propose ./body.md 2026-06-01T00:00:00Z   # ISO-8601
```

The contract stores it as `uint64`.

## What this showcase is NOT

- **Not a Snapshot replacement.** No off-chain signature aggregation, no
  EIP-712 envelope, no delegate weight, no quorum logic. The contract is
  a demonstration of *where the body lives*, not the full vote envelope.
- **Not a production governance contract.** See the flash-loan warning above.
- **Not a Walrus pricing oracle.** `epochs` is a number the proposer
  picks. WAL cost is paid by the proposer's wallet to the publisher
  upfront — neither the DAO contract nor the voters touch WAL.

## Tests

```bash
cd showcases/contracts
forge test --match-contract Governance -vv
```

Twelve tests cover: propose validation (zero blobId, past deadline,
sequential ids), vote weight + double-vote rejection + post-deadline
rejection, tally state transitions, and unknown-id reverts.
