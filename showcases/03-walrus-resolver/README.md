# Showcase 03 — WalrusResolver, the IPNS replacement

A compact Solidity contract that lets the owner of an ENS name park a
Walrus blob pointer on-chain, plus a TypeScript keeper that keeps the
underlying blob alive forever.

> **Source files**
>
> - Contract: [`../contracts/src/WalrusResolver.sol`](../contracts/src/WalrusResolver.sol)
> - Tests: [`../contracts/test/WalrusResolver.t.sol`](../contracts/test/WalrusResolver.t.sol)
> - Keeper: [`./keeper/keeper.ts`](./keeper/keeper.ts)

## The shape

```
ENS owner       ──setWalrusBlob(node, blobId, suiObjectId, ct)──▶ WalrusResolver (EVM)
                                                                      │
                                                                      ▼
reader      ──walrusBlob(node)──▶ (blobId, suiObjectId, ct)
                │
                └──GET aggregator/v1/blobs/<blobId>──▶ bytes

keeper bot  ──systemState()──▶ currentEpoch
            ──getObject(suiObjectId)──▶ end_epoch
            if (end_epoch − currentEpoch < threshold)
              ──executeExtendBlobTransaction(suiObjectId, +epochs)
```

Three storage slots per name (`blobId` + `suiObjectId` + `bytes8` content
type). One SSTORE-set per update. Authorization is gated on the ENS
registry's `owner(node)` or `isApprovedForAll(owner, msg.sender)`, so
ENSIP-1 operator approvals work out of the box.

## Why it dodges IPNS's failure modes

| IPNS today | WalrusResolver |
|---|---|
| Resolution does a DHT random walk; first-byte often > 30 s | Pointer is one `eth_call` (< 200 ms) |
| Pubsub-based update propagation is unreliable | Updates land in one EVM transaction with on-chain provenance |
| Pinning expires silently when the pinning service forgets | The Sui Blob object id is on-chain — anyone can keep it alive |
| Squatting on names trivial | Names are ENS-gated; sale of the ENS name carries the pointer with it |

## Deployment pattern

> **Use a dedicated subdomain.** ENS names have exactly one resolver record.
> Pointing `vitalik.eth`'s resolver at `WalrusResolver` would lose every
> existing address / text / contenthash record on that name. Instead,
> dedicate a subdomain such as `blog.vitalik.eth` to Walrus content and
> leave the apex name on its existing `PublicResolver`.

1. Deploy `WalrusResolver(ensRegistry)`. On mainnet ENS the registry is
   [`0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`](https://etherscan.io/address/0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e).
2. Create a subdomain (e.g. `blog.vitalik.eth`) via the ENS Manager or by
   calling `setSubnodeOwner` on the registry.
3. Set the subdomain's resolver to your `WalrusResolver` deployment.
4. Upload your content to Walrus (backend mode — you must own the Sui
   `Blob` object to use the keeper).
5. Call `setWalrusBlob(node, blobId, suiObjectId, contentType)` on the
   resolver. `node` is `namehash("blog.vitalik.eth")`; `contentType` is an
   8-char ASCII shortcode like `text/md`, `app/json`, `image/p`.
6. Readers do `walrusBlob(node)` then GET the aggregator URL.

## Keeping the blob alive

The keeper at [`./keeper/keeper.ts`](./keeper/keeper.ts) is a small Node
script that, for every ENS name in `KEEPER_NAMES`, reads the on-chain
pointer, inspects the linked Sui Blob's `end_epoch`, and calls
`executeExtendBlobTransaction` when the remaining window drops below
`EXTENSION_THRESHOLD`. Per-name failures are caught locally so one bad
name does not abort the cron tick.

```bash
cd showcases/03-walrus-resolver/keeper
pnpm install
# Then export the env vars listed in the showcase index README and:
pnpm keeper
```

## What this contract is NOT

- **Not a full ENS `IResolver` implementation.** It exposes a `walrusBlob`
  record only — there is no `addr`, `text`, or `contenthash`. Consumers
  should detect support by direct staticcall to `walrusBlob(bytes32)`,
  not via ENSIP resolver-record interface ids.
- **Not a Walrus pricing oracle.** The keeper pays WAL out of its own
  Sui-side wallet; the EVM contract is unaware of WAL costs.
- **Not a hash verifier.** Trust in the bytes served by the aggregator is
  identical to trust in an IPFS gateway. The leverage over IPFS comes
  from making the *pointer* deterministic. For trustless retrieval add a
  Reed-Solomon recompute pass via `@mysten/walrus` on top.

## Tests

```bash
cd showcases/contracts
forge test --match-path "test/WalrusResolver.t.sol" -vv
```

Eight tests cover: set / clear / owner-only / operator-approved /
ENS-owner-transfer / zero-on-unset / ERC-165 support.
