# Showcase 04 — DAO governance proposals on Walrus

An OpenZeppelin `Governor` contract whose only Walrus-specific addition is an
on-chain pointer to each proposal's body: the human-readable markdown lives on
Walrus, the 32-byte blobId lives on-chain, and everything else — proposal
lifecycle, snapshot voting, quorum, and state transitions — comes straight from
OZ's `Governor` stack. Three thin TS CLIs drive the end-to-end flow.

> **Source files**
>
> - Contract: [`../contracts/src/Governance.sol`](../contracts/src/Governance.sol)
> - Tests: [`../contracts/test/Governance.t.sol`](../contracts/test/Governance.t.sol)
> - Propose CLI: [`./src/propose.ts`](./src/propose.ts)
> - Vote CLI: [`./src/vote.ts`](./src/vote.ts)
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
proposer  ──read body.md──▶ ─PUT publisher/v1/blobs?epochs=5──▶ Walrus
                                                                  │
                                                                  ▼
                                                          (blobId, suiObjectId)
                                                                  │
proposer  ──proposeWithBlob(blobId)──▶ Governance (OZ Governor on EVM)
                                                  │  stores proposalBlob[id] = blobId
voter     ──castVote(id, support)────▶ Governance │  (0 Against · 1 For · 2 Abstain)
                                                  ▼
reader    ──proposalBlob(id) / state(id) / proposalVotes(id)──▶ pointer + outcome
                       │
                       └──GET aggregator/v1/blobs/<blobId>──▶ markdown body
```

The only Walrus-specific storage is `mapping(uint256 proposalId => bytes32 blobId) proposalBlob`.
The blobId is also encoded into the proposal description, so the OZ `proposalId`
is derived from the body (identical bodies dedupe). The proposer pays WAL via the
public publisher; the DAO contract never holds WAL.

## Why it dodges Snapshot's IPFS dependency

| IPFS today | Walrus + Governance.sol |
|---|---|
| Body pinned by 4Everland; sunset risk repeats the 2024 NFT.Storage / Cloudflare wound | Body lives on Walrus; aggregator is commodity HTTPS |
| Gateway tail latency on vote day = lost votes | Aggregator GET is deterministic; no DHT walk |
| Snapshot adapter is an integration the DAO can't audit cheaply | Stock OZ `Governor` + one `proposeWithBlob` wrapper + one publisher PUT |
| Pinning lifetime depends on a vendor contract | `epochs` is a value the proposer chose; renewal is a Sui tx anyone can pay |

## Governance surface

The contract inherits OpenZeppelin `Governor` composed with the standard modules:

- `GovernorSettings` — `votingDelay` (1 block), `votingPeriod` (~1 week), `proposalThreshold` (0)
- `GovernorCountingSimple` — Against / For / Abstain tallying
- `GovernorVotes` — voting weight from an `IVotes` token
- `GovernorVotesQuorumFraction` — quorum = 4% of past total supply

Snapshot voting is inherited, not hand-rolled: `Governor` records each proposal's
vote snapshot and reads weight via `IVotes.getPastVotes`, so tokens flash-borrowed,
flash-minted, or moved to a fresh wallet *after* the snapshot carry **zero** weight —
the flash-loan and vote-recycling attacks are closed by the same mechanism `Governor`
uses everywhere.

Two requirements follow from using OpenZeppelin's `Votes`:

- `token` must implement `IVotes` (an `ERC20Votes` token, for example).
- Holders must **delegate** (self-delegation is fine) before the snapshot
  block, or their balance counts for nothing.

Proposals here are **signaling only** — they carry a single no-op action and are
never queued/executed; the outcome is the vote result over a Walrus-hosted body.
Wiring real on-chain actions (and a `TimelockController`) is a standard `Governor`
extension, orthogonal to the Walrus integration this showcase demonstrates.

## CLI flow

### Propose

```bash
cd showcases/04-dao-proposals
pnpm install

# EVM side
export EVM_RPC_URL=http://127.0.0.1:8545           # or your live RPC
export EVM_CHAIN_ID=31337                          # anvil; mainnet=1, sepolia=11155111, ...
export GOVERNANCE_ADDRESS=0x...                    # deployed Governance contract
export PROPOSER_PRIVATE_KEY=0x...                  # signer for the proposeWithBlob() tx

# Walrus side
export WALRUS_PUBLISHER=https://publisher.walrus-testnet.walrus.space
export WALRUS_AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
export WALRUS_EPOCHS=5

# Dry run — uploads to Walrus, prints the calldata, does NOT send the EVM tx
pnpm propose --dry-run ./fixtures/sample-proposal.md

# Live
pnpm propose ./fixtures/sample-proposal.md
```

[`src/propose.ts`](./src/propose.ts):

1. Reads the markdown body from disk.
2. PUTs it to the public Walrus publisher (`epochs=5` default — bump via `WALRUS_EPOCHS`).
3. Converts the returned base64url blobId to the 0x-prefixed `bytes32` the contract expects.
4. Calls `Governance.proposeWithBlob(blobId)` via viem.
5. Recovers the OZ `proposalId` from the `ProposalBlob` event and prints it plus the voting window (in blocks). Timing is set by the contract's `votingDelay`/`votingPeriod`, not by the caller.

### Vote

```bash
export VOTER_PRIVATE_KEY=0x...        # falls back to PROPOSER_PRIVATE_KEY
pnpm vote <proposalId> for            # or: against | abstain | 1 | 0 | 2
```

[`src/vote.ts`](./src/vote.ts) calls `castVote(proposalId, support)` and prints the
updated tallies. The voter must have held and delegated the vote token before the
proposal's snapshot block, or the vote carries zero weight.

### Tally

```bash
# No signer required — read-only.
pnpm tally <proposalId>
```

[`src/tally.ts`](./src/tally.ts):

1. Reads `proposalBlob(id)` for the Walrus pointer and `proposalProposer(id)` / `proposalSnapshot(id)` / `proposalDeadline(id)` for metadata.
2. Reads `state(id)` (Pending / Active / Defeated / Succeeded / …) and `proposalVotes(id)` for the (against, for, abstain) tuple.
3. Fetches the markdown body from the aggregator and writes it to stdout.

## What this showcase is NOT

- **Not a Snapshot replacement.** No off-chain signature aggregation and no
  EIP-712 envelope — voting is fully on-chain via `castVote`. The point is *where
  the body lives*, demonstrated on real `Governor` rails.
- **Not an executing DAO.** Proposals are signaling only (a single no-op action,
  never queued/executed). Add `GovernorTimelockControl` + real actions for production.
- **Not a Walrus pricing oracle.** `epochs` is a number the proposer
  picks. WAL cost is paid by the proposer's wallet to the publisher
  upfront — neither the DAO contract nor the voters touch WAL.

## Tests

```bash
cd showcases/contracts
forge test --match-contract Governance -vv
```

Thirteen tests cover: `proposeWithBlob` (zero-blob revert, distinct-blob storage,
duplicate-blob dedupe, event + on-chain pointer), voting (weight by vote type,
double-vote / pending / post-deadline reverts, snapshot resistance to transfer
recycling), and quorum + final-state transitions (Succeeded, Defeated-on-against,
Defeated-on-quorum-miss).
