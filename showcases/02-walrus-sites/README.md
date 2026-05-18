# Showcase 02 — Walrus Sites for dApp frontend hosting

Replace the IPFS-pinned-CID-behind-eth.limo pattern with one Walrus Sites
publish + one SuiNS link. The Solidity side has nothing to do — this
showcase is about where your **frontend bytes** live, not where your
contract addresses are.

> **Source files**
>
> - Publish script: [`./publish.sh`](./publish.sh)
> - Example site: [`./example-site/`](./example-site/) (any static-site output works — Next.js `next build && next export`, Vite `vite build`, plain HTML, etc.)

## The pain it answers

> "ENS contenthash is non-negotiable; pay Pinata or Filebase rather than
> trusting any free gateway; treat IPNS as broken." — and Uniswap interface
> #7753 had to rewrite "all references to Cloudflare's IPFS gateway."
> *(ipfs-pain.md §10 — the 2026 newcomer vibe)*

The interface-hosting story for EVM dApps today is a tower of fragile
glue: pin to a paid provider, expose via a public gateway that may
disappear, optionally CNAME / DNSLink so `yourdapp.eth` can resolve.
Cloudflare sunsetting their IPFS gateway in 2024 broke this for everyone.

## The shape

```
dev          ──pnpm build──▶ ./out/        (any static SPA output)
                                 │
                                 ▼
             ──site-builder publish ./out──▶ Sui object  (site_object_id)
                                                 │
SuiNS owner  ──link <name> → site_object_id (one Sui tx)
                                                 │
                                                 ▼
visitor      ──GET <name>.wal.app──▶ wal.app portal──▶ aggregator GET
                                                 │
                                                 ▼
optional:    yourdapp.eth ─contenthash/DNSLink─▶ <name>.wal.app
```

Three on-chain objects in total:

1. The **Walrus Site object** on Sui — created by `site-builder publish`,
   owns the site's blobs.
2. The **SuiNS name** — links the human-readable label to the site object id
   in one Sui transaction.
3. (Optional) the **ENS name** — bridges from `.eth` to the wal.app portal
   via DNSLink or a CNAME.

No EVM contract, no DHT, no IPNS, no pinning vendor.

## Why it dodges IPFS frontend hosting's failure modes

| IPFS today | Walrus Sites |
|---|---|
| IPNS pointer is the only "mutable" surface; it's slow and silently breaks | Site object id is fixed; updates are explicit Sui txs against the same id |
| Public gateway (cloudflare-ipfs, ipfs.io, eth.limo) is the single point of failure | wal.app portal is a Walrus aggregator + a Sui RPC — both swappable / self-hostable |
| Pinning vendors churn SDKs and pricing | One `site-builder publish` flow, one CLI, one Sui-side wallet |
| Cloudflare sunsetting the gateway in 2024 broke every dapp using it | Aggregators are commodity HTTPS — anyone can run one |
| DNSLink TTL is on a different cadence than IPNS propagation | The SuiNS-to-site link is a single tx that takes effect on the next epoch |

## Publish flow

```bash
cd showcases/02-walrus-sites
./publish.sh ./example-site
```

[`publish.sh`](./publish.sh) wraps `site-builder publish` with:

- explicit error on missing `site-builder` CLI,
- input validation on `SITE_NAME` (`[A-Za-z0-9._-]{1,64}`),
- network selection (`NETWORK=testnet` or `mainnet`),
- a configurable epoch budget (`EPOCHS=200` default).

The script's output ends with a printed `site_object_id`. That id is the
canonical handle for every subsequent step.

## Linking a SuiNS name to the site

A SuiNS name owns one Walrus Site reference at a time. Linking is a single
Sui transaction; two paths:

1. **SuiNS web app** (recommended for one-off setups). Open
   <https://suins.io>, pick your name, open the name's settings, and use the
   "Set Walrus Site" action. Paste the `site_object_id`. Sign with the wallet
   that owns the name.
2. **PTB / `sui client call`** (for CI or repeated automation). Build a
   PTB that invokes the SuiNS package's `set_walrus_site` entry — the exact
   package id and function signature depend on network, so check
   <https://docs.suins.io/> for the current values. The argument list is
   the `NameRegistration` object and the `site_object_id`.

After the tx lands, `<your-name>.wal.app` resolves to your site on the next
epoch boundary.

## Bridging from ENS

ENS users keep their existing `.eth` name and bridge it to the wal.app
portal. Two patterns, pick whichever fits your tooling:

### Option A — DNSLink (closer to "decentralized contenthash")

1. At your DNS provider, add a TXT record on `_dnslink.<yourdapp.eth>`
   with value `dnslink=/https/<your-suins-name>.wal.app`.
2. In the ENS Manager (<https://app.ens.domains>), set the name's
   `contenthash` record to the DNSLink form. Many ENS clients understand
   `dnslink=...` directly; others want the contenthash encoded with the
   `ipfs-ns` or `https-ns` multicodec — use a small encoder tool if your
   client requires the raw bytes.

### Option B — CNAME (simpler, more centralized)

1. At your DNS provider, add a `CNAME` from `app.yourdomain.com` to
   `<your-suins-name>.wal.app`.
2. Set ENS's text record `url` (or a custom contenthash you control) to
   `https://app.yourdomain.com`.

Pick A if you want the resolution chain to stay in DNS + ENS proper;
pick B if you already have a custom domain and just want the bytes to
come from Walrus.

## What this showcase is NOT

- **Not a Cloudflare IPFS gateway drop-in.** The fundamental swap is from
  IPFS's P2P fetch to a Walrus aggregator's deterministic HTTPS fetch.
  Clients that probe for `ipfs://` won't transparently see Walrus URLs.
- **Not an IPFS-pin migrator.** This publishes _new_ blobs to Walrus.
  Moving an existing pinned-on-IPFS frontend involves rebuilding and
  re-publishing — the source code is the input, not the CID.
- **Not a one-shot deploy.** Each `pnpm build && publish.sh` produces a
  new `site_object_id`. The "mutable pointer" is the SuiNS link, not the
  site object itself. Re-linking your SuiNS name on each release is one
  tx per release.

## Verification

After the publish + SuiNS link round-trip:

1. Open `https://<your-suins-name>.wal.app` in a normal browser.
2. View source — the served HTML matches the file in `./example-site/`.
3. Inspect the site object on a Sui explorer (e.g. Suiscan) to confirm the
   referenced blobs and their `end_epoch`.
4. Re-publish a modified build, re-link the SuiNS name, and confirm the
   browser reflects the change on the next epoch.

## Notes

- `site-builder` is a separate CLI from the main `walrus` binary. Install
  it from <https://docs.wal.app/sites/getting-started/installing-the-site-builder/>.
- The SuiNS-to-site link only updates on epoch boundaries. Allow ~24h on
  testnet, ~24h on mainnet (epoch length matches Sui's).
- If your site uses client-side routing (Next.js / SvelteKit / Remix),
  ensure the build emits a 404 fallback that re-bootstraps the SPA shell;
  the wal.app portal serves static bytes only.
- The example site at [`./example-site/index.html`](./example-site/index.html)
  is intentionally minimal — replace it with your real build output before
  publishing anything you care about.
