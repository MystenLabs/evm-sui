# [Proposal] Move governance archive off IPFS

## Summary

Replace the current 4Everland-pinned IPFS storage for proposal bodies with
Walrus testnet. Each proposal body becomes a single Walrus blob; the
on-chain `Governance` contract stores only the 32-byte blobId.

## Motivation

The 2024 Cloudflare IPFS gateway sunset and the parallel NFT.Storage
shutdown demonstrated that "free public goods" IPFS infra cannot be
relied on for governance-critical data paths. Snapshot-style hosting that
silently routes through a single pinning vendor recreates exactly the
single point of failure the DAO is trying to avoid.

## Spec

- Proposers PUT the proposal body to the public Walrus publisher with
  `epochs=5` (≈ 14 days) at minimum.
- Proposers call `Governance.propose(blobId, deadline)` with the 32-byte
  blobId returned by the publisher.
- Voters read the body via any Walrus aggregator (`GET /v1/blobs/<blobId>`)
  and vote on-chain via `Governance.vote(id, support)`.
- Tallies are settled by `Governance.tally(id)` after `block.timestamp >= deadline`.

## Cost

- WAL storage cost for `epochs=5` is the proposer's responsibility (paid
  to the public publisher).
- Per-vote gas is unchanged from Snapshot off-chain → on-chain bridging.
