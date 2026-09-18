# WoWF Sim

In-browser DPS simulator for **World of Warcraft: Forever** (Classic-inspired). You pick a class, race, talents, and gear in the UI; a Go combat engine compiled to WebAssembly runs the fight in the browser.

Live build: [https://michalciberej.github.io/wowf-sim/](https://michalciberej.github.io/wowf-sim/)

The UI does not call any game-data APIs. Item and spell numbers come from baked JSON. Maintainers refresh that JSON with the Wowhead ingest script below.

## Layout

```
proto/wowfsim/sim.proto     SimRequest / SimResult (only UI ↔ engine contract)
engine/internal/sim         combat loop, stats, DoTs, talents
engine/internal/clientdata  catalog.json (items + talents) and abilities.json
engine/cmd/wasm             WASM entrypoint
engine/cmd/cli              native smoke run
web/                        Vite + React UI
scripts/wowhead             Wowhead Forever ingest (listviews, gear-planner, talent-calc)
scripts/build-catalog.mjs   rebuild talent rows (keeps existing items)
```

Protobuf is generated into `engine/gen` and `web/src/gen`. After changing `sim.proto`, run `npm run gen`.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Go](https://go.dev/dl/) 1.22+ (1.27 is fine)
- [Buf](https://buf.build/docs/installation) only if you change protobuf

## Install and run

From the repo root:

```
npm --prefix web install
npm run dev
```

That builds `web/public/wowfsim.wasm` and starts Vite at **http://localhost:5173**.

```
npm test                 # Wowhead parser tests + Go engine tests
npm run cli              # one native 60s warrior iteration printout
npm run build            # WASM + production web bundle
npm run wasm             # WASM only
npm run gen              # proto → Go + TypeScript
```

## Catalog and spell data

Baked files (committed):

- `engine/internal/clientdata/catalog.json` and `web/src/catalog/catalog.json` (same payload: items + talent trees)
- `engine/internal/clientdata/abilities.json` (rotation spells, max rank)

### Refresh items, spells, and talent layouts (Wowhead Forever)

`npm run wowhead` downloads from the [Forever](https://www.wowhead.com/forever/items/armor) Wowhead section into **gitignored** `data/wowhead/`, then rewrites baked JSON.

Sources (`scripts/wowhead/endpoints.json`):

- Item category Listviews such as `/forever/items/armor` and `/forever/items/weapons/...` (each page caps at 1,000 rows)
- Nether gear-planner dump (`wow.gearPlanner.classicplus.item`) for the full Forever ID list. Ingest scrapes the `<script src>` from `/forever/gear-planner` even when that page's React UI TypeErrors. Listviews stay capped at 1,000 rows and still list Classic IDs that 404 on Forever tooltips, so they are metadata-only when the dump loads.
- Item/spell tooltips at `nether.wowhead.com/forever/tooltip/...`
- Talent calculator dump from [talent-calc](https://www.wowhead.com/forever/talent-calc) (`/forever/data/talents-classic`), written to `engine/internal/clientdata/talent-trees/*.json`

Ingest keeps Forever items that have a real item page/tooltip (uncommon and better). Classic/SoD stubs 404 on `/forever/item=` and are skipped. The gear picker filters rarity in the UI; there is no item-level cutoff in ingest.

First run hits the network. Later runs reuse the cache unless you pass `--force`.

```
npm run wowhead                 # spells + talent trees + items
npm run wowhead -- --skip-items
npm run wowhead -- --skip-spells
npm run wowhead -- --skip-talents
npm run wowhead -- --force      # ignore cache
npm run wowhead:test            # parser tests only
```

Spell IDs to walk for max rank: `scripts/wowhead/spell-seeds.json`.

### Rebuild talent rows in catalog.json

After talent-tree JSON changes, bake icons/effects into the catalog (keeps the existing item list):

```
npm run catalog
```

Raid buffs and boss debuffs live in `engine/internal/clientdata/buffs.json` (copied to `web/src/catalog/buffs.json`). The Buffs tab sends selected IDs on `SimRequest.player.raid_buffs`.

Stat weights (WowSims-style ±stat reruns, EP vs attack power or spell power) are on the Weights tab. After a calc, the item picker sorts by total EP.

## What must not be pushed

| Path | Why |
| --- | --- |
| `data/wowhead/` | local Wowhead cache |
| `web/public/wowfsim.wasm` | rebuild with `npm run wasm` |
| `talent-trees/icon-cache.json` | local icon fetch cache |

The baked `catalog.json` / `abilities.json` **are** meant to be committed so clones can run without scraping.
