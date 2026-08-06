# Pirate Nation → Roblox (archive port)

Playable Roblox recreation of **Pirate Nation** systems, built from Proof of Play's open-source release (Aug 2026).

## Sources

| Repo | License | Use here |
|------|---------|----------|
| [proofofplay/piratenation-game](https://github.com/proofofplay/piratenation-game) | MIT (archival Unity) | Architecture + loop design |
| [proofofplay/piratenation-art](https://github.com/proofofplay/piratenation-art) | **CC0** | 151 combat card names/stats + PNGs in `assets/cards/` |
| [proofofplay/piratenation-contracts](https://github.com/proofofplay/piratenation-contracts) | MIT | Not ported (no chain) |
| [proofofplay/popbot-tool](https://github.com/proofofplay/popbot-tool) | MIT | Not needed in-game |

Original game: energy quests, marks/gold, ship crafting, crew, gauntlet card combat. Blockchain / $PIRATE / gems IAP intentionally omitted.

## What's playable

- Starter island + dock + skiff (Workspace)
- **Quests**: Skullduggery / Exploration / Privateering (energy → timed voyage → loot)
- **Gauntlet**: turn-based card combat, Easy/Normal/Hard
- **Craft**: ship upgrades Skiff→Sloop→Brig→Galleon, workshop recipes
- **Crew**: recruit with Marks + Rum, XP from quests/gauntlet
- **151 cards** generated from CC0 combat art filenames
- DataStore persistence when published to Roblox (Studio play alone = session memory)

## Remote test (phone / other PC)

See **[REMOTE-TEST.md](REMOTE-TEST.md)**. Short version:

1. You create empty experience + Open Cloud API key once (Creator Dashboard).
2. Fill `.env.publish` from `.env.publish.example`.
3. `bash publish.sh` → get `https://www.roblox.com/games/<PLACE_ID>/...` and play anywhere.

## Open in Roblox Studio

1. Install [Roblox Studio](https://create.roblox.com) — **use your own Roblox account** (I cannot sign up or log in for you; CAPTCHA/email/TOS require you).
2. Open the place file:
   ```
   PirateNation.rbxlx
   ```
   (generated next to this README via Rojo)
3. Press **Play**. Use the left tabs: Quests, Gauntlet, Craft, Crew.
4. File → Publish to Roblox → create a new experience under your account.
5. Game Settings → Security → enable **Studio Access to API Services** if you want DataStores in Studio.

### Rebuild from source

```bash
# from roblox-game/
../tools/rojo.exe build -o PirateNation.rbxlx
../tools/rojo.exe serve   # then Rojo plugin "Connect" in Studio
```

Rojo binary is at `../tools/rojo.exe` (v7.7.0).

## Optional: card art images

PNGs live in `assets/cards/` (CC0). Roblox cannot load arbitrary disk paths in a published game.

To show real card art in UI:

1. In Studio, bulk-import PNGs (Asset Manager) or use a bulk uploader.
2. Map `cardId → rbxassetid` in a ModuleScript and set `ImageLabel.Image` in the gauntlet hand renderer.

Voxel GLTF packs under `piratenation-art` have Windows-invalid paths (trailing spaces); extract on Linux/WSL if you want 3D meshes later.

## Accounts I will not create

- Roblox account / Studio login  
- Roblox Open Cloud API keys  
- Any email/Discord/wallet for you  

Publish path is **your** account only. No paid services required for local Play.

## Layout

```
roblox-game/
  default.project.json
  PirateNation.rbxlx          # after build
  assets/cards/               # CC0 PNGs + cards.json
  src/
    ReplicatedStorage/Shared/ # Config, Cards, Recipes, Util
    ServerScriptService/      # Main + services
    StarterPlayerScripts/     # UI client
```

## Not a 1:1 Unity dump

The Unity client is huge, missing paid Asset Store packs, and has no live backend. This port implements the **core fantasy loop** in Luau so you can ship something on Roblox today, then layer art/meshes/multiplayer.
