#!/usr/bin/env bash
# Publish Pirate Nation Roblox place for remote play.
# Requires one-time setup (see REMOTE-TEST.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

ENV_FILE="$ROOT/.env.publish"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

API_KEY="${ROBLOX_API_KEY:-${ROBLOX_OPEN_CLOUD_KEY:-}}"
UNIVERSE_ID="${ROBLOX_UNIVERSE_ID:-}"
PLACE_ID="${ROBLOX_PLACE_ID:-}"

ROJO="$ROOT/../tools/rojo.exe"
if [[ ! -x "$ROJO" && ! -f "$ROJO" ]]; then
  ROJO="$(command -v rojo || true)"
fi
if [[ -z "${ROJO}" || ! -f "$ROJO" ]]; then
  echo "rojo not found at ../tools/rojo.exe"
  exit 1
fi

missing=0
if [[ -z "$API_KEY" ]]; then echo "Missing ROBLOX_API_KEY"; missing=1; fi
if [[ -z "$UNIVERSE_ID" ]]; then echo "Missing ROBLOX_UNIVERSE_ID"; missing=1; fi
if [[ -z "$PLACE_ID" ]]; then echo "Missing ROBLOX_PLACE_ID"; missing=1; fi
if [[ "$missing" -ne 0 ]]; then
  echo ""
  echo "Create $ENV_FILE from .env.publish.example and fill values."
  echo "See REMOTE-TEST.md"
  exit 2
fi

echo "Building..."
"$ROJO" build -o PirateNation.rbxlx

echo "Uploading place $PLACE_ID (universe $UNIVERSE_ID)..."
"$ROJO" upload \
  --api_key "$API_KEY" \
  --universe_id "$UNIVERSE_ID" \
  --asset_id "$PLACE_ID" \
  .

echo ""
echo "Published."
echo "Play: https://www.roblox.com/games/${PLACE_ID}/Pirate-Nation-Archive-Port"
echo "Creator: https://create.roblox.com/dashboard/creations/experiences/${UNIVERSE_ID}/places/${PLACE_ID}/configure"
