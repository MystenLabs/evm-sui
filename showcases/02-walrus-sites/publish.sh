#!/usr/bin/env bash
#
# Publish a Walrus Site for the directory passed in $1 (default: ./example-site).
#
# Requirements:
#   - `site-builder` CLI installed (https://docs.wal.app/sites/getting-started/installing-the-site-builder/)
#   - Sui keypair with testnet SUI for gas + testnet WAL for storage
#   - `~/.config/walrus/sites-config.yaml` configured for the target network
#
# After this succeeds, link the printed site_object_id to your SuiNS name in
# the SuiNS app (a single Sui transaction), then visit your-name.wal.app.
#
# To bridge to ENS: set yourdapp.eth's contenthash to the SuiNS-resolved
# wal.app URL via DNSLink (your DNS provider records `_dnslink.yourdapp.eth
# TXT "dnslink=/https/your-name.wal.app"`), OR put a CNAME from a custom
# domain to wal.app and point ENS at the custom domain.

set -euo pipefail

SITE_DIR=${1:-./example-site}
EPOCHS=${EPOCHS:-200}
SITE_NAME=${SITE_NAME:-"showcase-02-demo"}
NETWORK=${NETWORK:-testnet}

if [ ! -d "$SITE_DIR" ]; then
  echo "site directory not found: $SITE_DIR" >&2
  exit 1
fi

if ! command -v site-builder >/dev/null 2>&1; then
  echo "site-builder CLI not found in PATH. Install from:" >&2
  echo "  https://docs.wal.app/sites/getting-started/installing-the-site-builder/" >&2
  exit 1
fi

# site-builder treats site names as a free-form label — keep it conservative.
# Reject names that would surprise the CLI parser or look unsafe in shell logs.
if ! printf '%s' "$SITE_NAME" | grep -Eq '^[A-Za-z0-9._-]{1,64}$'; then
  echo "SITE_NAME must match [A-Za-z0-9._-]{1,64} (got: '$SITE_NAME')" >&2
  exit 1
fi

case "$NETWORK" in
  testnet|mainnet) ;;
  *)
    echo "NETWORK must be 'testnet' or 'mainnet' (got: '$NETWORK')" >&2
    exit 1
    ;;
esac

if ! [ "$EPOCHS" -gt 0 ] 2>/dev/null; then
  echo "EPOCHS must be a positive integer (got: '$EPOCHS')" >&2
  exit 1
fi

echo "publishing $SITE_DIR for $EPOCHS epochs on $NETWORK as '$SITE_NAME'..."

site-builder \
  --context "$NETWORK" \
  publish "$SITE_DIR" \
  --epochs "$EPOCHS" \
  --site-name "$SITE_NAME"

cat <<'EOF'

next steps
----------

1) Grab the site object id from the output above. It looks like:
     site_object_id: 0xa1b2c3...

2) Link it to a SuiNS name (one Sui tx). The SuiNS app at:
     https://suins.io
   ... has a "Set walrus site" action under the name's settings, or you can
   call the SuiNS package's Move entry function directly.

3) Visit https://<your-suins-name>.wal.app to confirm it resolves.

4) Optional ENS bridge:
   - DNSLink: at your DNS host, add a TXT record on
       _dnslink.<yourdapp.eth>
     with value
       dnslink=/https/<your-suins-name>.wal.app
     then set the ENS resolver's `contenthash` to DNSLink('<yourdapp.eth>').
   - CNAME path: point a regular DNS A/CNAME from `app.yourdomain.com` to
     `<your-suins-name>.wal.app`, then set ENS to resolve to the CNAME.
EOF
