#!/usr/bin/env bash
# Fetch a signed price quote from the local Nautilus server and submit it
# on-chain via `update_price`. Assumes:
#   - The enclave is running on http://localhost:3000 (cargo run from ../enclave)
#   - `sui client switch --env testnet` already done
#   - The env vars below are exported (see ../README.md §7-8)
#
# Usage: ./post-price.sh [coin_id] [vs]   # defaults: sui usd

set -euo pipefail

: "${ENCLAVE_OBJECT_ID:?must be set — see README §8}"
: "${APP_PACKAGE_ID:?must be set — see README §7}"

COIN_ID=${1:-sui}
VS=${2:-usd}

resp=$(curl -fsS -H 'Content-Type: application/json' \
  -d "$(jq -n --arg c "$COIN_ID" --arg v "$VS" '{payload:{coin_id:$c,vs:$v}}')" \
  http://localhost:3000/process_data)

sig=$(echo "$resp" | jq -r .signature)
ts=$(echo "$resp" | jq -r .response.timestamp_ms)
price=$(echo "$resp" | jq -r .response.payload.price_micro)

echo "got signed quote: $COIN_ID/$VS = $price (micro), ts=$ts"

# Move expects vector<u8> for the strings. Encode as JSON byte arrays.
coin_bytes=$(python3 -c "import sys; print('[' + ','.join(str(b) for b in sys.argv[1].encode()) + ']')" "$COIN_ID")
vs_bytes=$(python3 -c "import sys; print('[' + ','.join(str(b) for b in sys.argv[1].encode()) + ']')" "$VS")

sui client call \
  --package "$APP_PACKAGE_ID" \
  --module oracle \
  --function update_price \
  --type-args "$APP_PACKAGE_ID::oracle::ORACLE" \
  --args "$coin_bytes" "$vs_bytes" "$price" "$ts" "0x$sig" "$ENCLAVE_OBJECT_ID" "0x6"
