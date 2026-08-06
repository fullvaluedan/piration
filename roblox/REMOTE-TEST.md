# Remote test setup (Pirate Nation Roblox port)

Roblox will not let an agent create your account or publish without **your** credentials.
This repo is wired so after a **one-time** Creator Dashboard setup, publish is one command and the game is playable from any device.

## One-time (you, ~5 min)

### A. Empty experience
1. Open https://create.roblox.com → **Create** → **Experience** (or Studio → File → New → Publish as "Pirate Nation Archive Port").
2. Note two IDs from the dashboard URL / place page:
   - **Universe ID** (experience id)
   - **Place ID** (number in `roblox.com/games/PLACE_ID/...`)

### B. Open Cloud API key
1. https://create.roblox.com/dashboard/credentials → **API Keys** → **Create API Key**
2. Name: `hermes-pirate-nation`
3. Access permissions → add your experience → enable **place publishing** / `universe-places:write` (wording varies)
4. IP: allow your PC / `0.0.0.0/0` for first test (tighten later)
5. Create & **copy the key once**

### C. Make it joinable
Creator Dashboard → Experience → **Audience** / **Permissions**:
- **Public** (anyone with link) **or**
- **Friends** only

Also enable **Studio Access to API Services** if you care about DataStores in Studio (live servers use DataStores when published either way, subject to game settings).

### D. Drop secrets on this machine
```bash
cd C:/Users/danre/scripts/piratenation-roblox/roblox-game
cp .env.publish.example .env.publish
# edit .env.publish — paste API key, universe id, place id
```

Or paste the three values in Slack (DM preferred for the key) and I’ll write `.env.publish` and run publish.

## Publish / update (me or you)

```bash
cd C:/Users/danre/scripts/piratenation-roblox/roblox-game
bash publish.sh
```

Success output includes:
`https://www.roblox.com/games/<PLACE_ID>/...`

Open that URL on phone/other PC → Play.

## After code changes
Edit `src/` → `bash publish.sh` again → rejoin the experience (may need fresh server).

## What I cannot do without step A–D
- No Roblox Studio on this box yet
- No Roblox secrets in Bitwarden
- Open Cloud **updates** a place; it does not invent a new experience without your account creating one first
