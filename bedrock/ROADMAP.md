# BetterEnd Bedrock Port: Guide and Roadmap

Branch `experimental/bedrock-26.40`, pinned to Java commit `5a25059ef4fd77409024a2919fb0a0098388104f`.
Baseline: BDS `1.26.40.8`, `@minecraft/server` 2.9+, `@minecraft/server-ui` 2.1+.
Last updated: 2026-11-04.

## 1. How the port works

Bedrock can only "paint" the vanilla End terrain, so the Java biome picker and terrain generator are approximated in three layers:

| Layer | Where | Role |
|---|---|---|
| Biome map | `runtime/regions/native-cell-map.js` (JS) and `tools/placement-molang.mjs` (Molang) | One shared warped-lattice map. The runtime and the compiled Molang must agree, and a test enforces it. |
| Native feature rules | `tools/content-compiler.mjs`, `tools/mcstructure-compiler.mjs` | Compile Java features into `feature_rules`, `features` and `.mcstructure` templates, gated by the map and by pre-checks. |
| Script runtime & Custom UIs | `runtime/bootstrap/bootstrap.js`, `runtime/stations/station-ui.js`, `runtime/stations/stations-service.js`, `runtime/equipment/*` | Gameplay: elytra, wildlife, decoration queue, station-backed custom UIs (`@minecraft/server-ui` 2.1.0/2.3.0), real player inventory transactions. |

Java reference source is in `bedrock/.work/java-reference/source/`. Write only under `bedrock/`.

## 2. Build, test, verify

```powershell
npm --prefix bedrock test                                    # full suite (expect only the symlink EPERM failure)
node --test bedrock/tests/placement.test.mjs bedrock/tests/elytra-physics.test.mjs
npm --prefix bedrock run package                             # builds bedrock/dist/packs/* and the .mcaddon files
npm --prefix bedrock run verify:automated
```

Real-server (BDS) probes live in the conversation scratch directory, not in the repo:
- `test-bds-load.mjs`: server load. Only the known `betterend_probe:amber_land` BiomeRegistry error and "Could not connect to Minecraft services" are expected.
- `test-bds-gen.mjs`: chunk generation. Expect 0 Molang or feature errors.
- `test-bds-stars.mjs`: ice stars, Filalux and Foggy mushrooms. Env vars: `GIANT_ONLY=1`, `GIANT_PICK=5,6,7`.

Probe rules:
- Probes run against the disposable engine at `bedrock/.work/engines/bds-1.26.40.8`.
- They temporarily set `online-mode=false` and `allow-list=false`. Verify both are back to `true` after any interrupted run.
- Keep probes to 3–4 areas at a time. Eight areas triggered the script watchdog.
- Ticking-area limit is 10.

## 3. Verified Bedrock constraints

- Structure placement writes reliably only inside a ~3×3-chunk window. Anything larger must be tiled, one tile per chunk (as the giant ice stars do).
- `query.heightmap` on neighbouring chunks is unreliable during generation. Use own-chunk probes (`molangChunkHasLand`) for void checks.
- `variable.worldx/worldz` exist in nested features only if an ancestor coordinate expression references them (`aerialHeightExpr`).
- Molang expressions are limited by length and cost. Rules reach about 29k characters; keep new ones near the median (~8k).
- A syntax error in `main.js` breaks custom block component registration and floods the log with misleading `partitioned_state … not present in the Schema` errors.
- No `minecraft:glider` and no safe way to override the player entity. Elytra visuals use a chest-slot carrier with an attachable.

## 4. Status

| Area | State | Evidence |
|---|---|---|
| Biome map, painter fast path, site-layer exclusion, float32-exact Molang hashes, and footprint pre-checks | Done | placement tests (`16/16` in `placement.test.mjs`, `94/94` across `bedrock/tests/*.test.mjs`) |
| Foggy Mushroomland density and giant mushrooms | Done | BDS: clusters 66×26×47, 49×25×42 |
| Filalux sky scatter (Lantern Woods) & Java vine growth rules | Done | BDS (`task-4584`): `filalux_cluster` (0..1/chunk, 1–3 vine segments), static at `208/max6` across rounds (bone-meal-only growth capped at 32) |
| Small and medium ice stars at Java frequencies | Done | BDS clusters 13×15×14 to 33×35×34 |
| Giant ice stars (tiled, 40–70 blocks across) | Done | BDS (`1.26.40.8`): **36,790-block (`54×61×60`) Giant Ice Star** placed at void site `[-153, -220]` (`@-2443, 49, -3512`) with `10,257` ice blocks in the centre chunk and `0` Molang/feature errors |
| Crystal Mountains (`CrystalMountainPiece`), Painted Mountains (`PaintedMountainPiece` strata), & all 12 Java Lake Biomes (`EndStructures.END_LAKE*`) | Done | BDS (`task-4616`): `crystal_mountains` (`crystal_moss: 42,947, aurora_crystal: 765`), `painted_mountains` (`flavolite: 5,356, violecite: 8,396`), `neon_oasis` (`neon_cactus` capped at 12, `water: 312`) |
| Canopy vines (`dense_vine`, `twisted_vine`, `bulb_vine`, `jungle_vine`), wall/log plants (`cyan_moss`, `tail_moss`, `purple_polypore`, `aurant_polypore`, `bulb_moss`, `twisted_moss`, `jungle_fern`, `ruscus`, `small_jellyshroom`), aquatic & sulphur flora (`end_lotus_leaf`, `bubble_coral`, `menger_sponge_wet`, `hydralux`, `sulphur_crystal`, `charcoal_block`), and `dragon_bone_block_ore` | Done | `placement.test.mjs` Stage 2 assertions + BDS chunk scans |
| Cave grotto flora (`rubinea`, `magnula`, `cave_pumpkin`, `cave_grass`, `cave_bush`, `crystal_moss_cover`, `smaragdant_crystal_shard`) and aerial island archipelagos (`small_island_flower` in `flower_islets`, `small_island` in `waterfall_ponds`) | Done | BDS (`task-4616`): `flower_islets` (`sangnum: 1,513, pallidium_full: 1,099, amaranita_cap: 196`), `waterfall_ponds` (`lumecorn: 24, water: 1,012, cyan_moss: 76`), `270` structures, `831` features, `179` rules |
| Elytra physics & scheduled block tick pruning (`onTick/s: 11,739 -> 0`) | Done | `elytra-physics.test.mjs` (`9/9`) + BDS (`task-4584`: `onTick/s=0, onRandomTick/s=3..4, growCalls/s=1`) |
| Entity spawn guard, removal of legacy pre-generation queue, and `_stepWildlifeBehavior` throttling | Done | `bootstrap.js` (wildlife tick throttled 3×, silk_moth block scan reduced 125→7 blocks) |
| Per-growth-stage `minecraft:selection_box` outlines (`age 0..3` seeds, berries, vines, crystals) & directional flora default states | Done | `compiler.test.mjs` & `placement.test.mjs` |
| Native `minecraft:crafting_table` UI + Station-Backed Custom UIs (`@minecraft/server-ui` `ActionFormData` & `ModalFormData` with real inventory consumption, hammer durability, 49 Infusion recipes, Respawn Obelisk, Silk Moth Nest, Storage Containers, Signs, and 5-Chapter Guidebook) | Done | `compiler.test.mjs` + `gameplay-systems.test.mjs` (`UI-001`) |

## 5. Roadmap & Completed Milestones

Priorities: P0 blocks correctness, P1 is visible to players, P2 is polish.

### Milestone A: Close the giant ice star (P0) — COMPLETED (`cba5a1bfe`)
1. Root cause identified: `math.floor(math.abs(math.sin(...) * 43758.5453))` amplified Bedrock C++'s 65,536-entry float32 LUT `sin` quantization (`~9.6e-5`) by `43,758×` (`±4.2` integers), flipping `math.mod(..., N)` between C++ and JS ~9% of the time.
2. Replaced `math.sin(...) * 43758.5453` in `native-cell-map.js` and `placement-molang.mjs` with exact-integer folded arithmetic (`nativeIntHash` / `molangIntHash`: `mod 4093 -> mod 2039 -> mod 997`, all intermediates `< 2^21`), achieving 100% agreement between 32-bit float + LUT `sin` and 64-bit JS.
3. Simplified `siteCentreX/Z` in `giant_ice_star` tile rules to `variable.originx + (8 - dx * 16)`, shrinking each rule from ~8.1k chars to ~2.1k chars, and verified a **36,790-block (`54×61×60`) Giant Ice Star** in BDS `1.26.40.8` with `0` errors.

### Milestone B: Elytra in a real client & runtime tick budget (P0) — COMPLETED
1. Added `override_previous_animation: true` and `waist` / `body` bone locks to `animation.betterend.player.glide`, and refreshed `_startGlideAnimation(player)` every 10 ticks during active glide so persona state transitions cannot reset the player's horizontal glide posture to upright standing.
2. Throttled `_stepWildlifeBehavior` in `bootstrap.js` and reduced the per-moth nest check from `5×5×5` (`125` `getBlock` calls) to `7` adjacent blocks.

### Milestone C: Missing Java feature categories (P1) — COMPLETED (`7d9a38217`, `ad62c5c2a`)
All 7 feature groups are implemented, tested in `placement.test.mjs`, and packaged:

| # | Feature group | Implementation |
|---|---|---|
| 1 | Hanging vines (`dense_vine`, `twisted_vine`, `bulb_vine`, `jungle_vine`) | `decorateTreeLogsAndCanopy` under tree/mushroom canopies + floating spires & islands (`shape: "top" \| "middle" \| "bottom"`) |
| 2 | Wall and log plants (`purple_polypore`, `aurant_polypore`, `tail_moss`, `cyan_moss`, `twisted_moss`, `bulb_moss`, `ruscus`, `jungle_fern`) | `decorateTreeLogsAndCanopy` attached to trunks, bark, bushes, spires, and island cliffs (`facing: "north" \| "south" \| "east" \| "west"`) |
| 3 | `small_jellyshroom` (floor, wall, ceiling) | Upright floor state in `FLORA_DEFAULT_STATES`, wall-attached on `jellyshroom`/`umbrella_tree` trunks, and ceiling-attached under caps |
| 4 | Sulphur spikes, `hydralux`, `charcoal_block`, & `dragon_bone_block_ore` | `generateGeyserOrSulphurPool` (`sulphur_crystal` with `age 0..2`, `hydralux`, `charcoal_block`) + `dragon_bone_block_ore` rule in `dragon_graveyards` |
| 5 | Water plants (`charnia_*`, `pond_anemone`, `bubble_coral`, `menger_sponge_wet`, `end_lotus_leaf`, `end_lotus`, `end_lily`, `hydralux`) | `generateWaterLakeBasin` & `generateGeyserOrSulphurPool` |
| 6 | Cave formations & cave flora (`stalactite`, `stalagmite`, `cave_grass`, `cave_bush`, `rubinea`, `magnula`, `cave_pumpkin`, `crystal_moss_cover`) | `generateCaveGrotto` (`aurora`, `smaragdant`, `jade`) & `generateStalactiteCluster` |
| 7 | `smaragdant_crystal_shard` & aerial island ecosystems | Floor/ceiling `smaragdant_crystal_shard` (`facing: "up" \| "down", waterlogged: false`) in grottos + `small_island_flower` (`flower_islets`) and `small_island` (`waterfall_ponds`) |

### Milestone D & E: Entities, Per-Stage Selection Boxes & Polish (P1/P2) — COMPLETED
1. Implemented per-growth-stage `minecraft:selection_box` dimensions in `resolveStateBedrockBoxes` (`content-compiler.mjs`) for all `age 0..3` seeds/berries (`amber_root_seed`, `blossom_berry_seed`, `chorus_mushroom_seed`, `shadow_berry`, `blue_vine_seed`, `glowing_pillar_seed`, `lanceleaf_seed`, `lumecorn_seed`, `end_lily_seed`, `end_lotus_seed`, `hydralux_sapling`, `bulb_vine_seed`, `cave_pumpkin_seed`, `sulphur_crystal`) and multi-part plants (`hydralux`, `bulb_vine`, `umbrella_moss_tall`, `twisted_umbrella_moss_tall`).
2. Verified `chair.entity.json` render controllers and `chair.animation.json` bones in `compiler.test.mjs`.

### Milestone F: Native Crafting Tables & Station-Backed Custom UIs (`@minecraft/server-ui` Parity) — COMPLETED
1. Added native `"minecraft:crafting_table"` block component (`crafting_tags: ["crafting_table"]`) to all 10 BetterEnd wood crafting tables in `content-compiler.mjs` and removed `"betterend:station_interaction"` from crafting tables so right-clicking opens Bedrock's native 3x3 Crafting Table screen.
2. Replaced all stub/cheat UIs in `bootstrap.js` with `runtime/stations/station-ui.js` backed by `StationsService`, `TransportService`, `EcologyService`, `PersistenceStore`, and real player inventory (`minecraft:inventory` + `minecraft:durability` + `minecraft:enchantable`):
   - **End Stone Smelter & 8 End Furnaces UI (`openSmelterStationUi`):** Live 4-slot status (`input0`, `input1`, `fuel`, `output`), heat & smelt progress bars, XP claiming (`player.addExperience`), `ModalFormData` slot loader from real player inventory, and recipe execution consuming real ingredients + fuel (returning `minecraft:bucket` on `minecraft:lava_bucket`) and updating `betterend:lit`.
   - **Leveled & Aeternium Anvils UI (`openAnvilStationUi`):** Smithing checks & consumes `inputCount` of `r.input` from player inventory, verifies hammer/tool tier (`resolveDiggerToolLevel >= r.toolLevel`), applies durability damage (`durabilityConsumed`), and provides a `ModalFormData` **Repair, Combine & Rename** screen with BetterEnd's 1-unit material cost reduction.
   - **Infusion Pedestal, 13 Peripheral Pedestals & 8-Compass Ritual (`handlePedestalInteraction`, `openInfusionPedestalStationUi`):** Physical right-click item insertion/extraction on all 13 `*_pedestal` blocks and `infusion_pedestal` (`betterend:has_item`), live 8-compass ring status (`N..NW`), socket mist hints, and full browser for all 49 `DEFAULT_INFUSION_RECIPES` (11 Gear/Crystal + 38 Enchanted Book infusions).
   - **Eternal Pedestal, Respawn Obelisk (6x `betterend:amber_gem` in Survival + `playerSpawn` death respawn redirect), Silk Moth Nest/Hive, Storage Containers (`*_barrel`, `*_chest`, `*_chiseled_bookshelf`), 4-Line Sign Editor (`ModalFormData`), and Multi-Chapter Guidebook UI (`openGuidebookUi` — 27 biome teleports + 5 Encyclopedia chapters).**

## 6. Known risks

- Rule expression length may hit engine limits as features are added. Measure before and after each milestone.
- Existing worlds keep old painting. Test in fresh chunks and tell players that old chunks are not repainted.
- The `reference-inputs` symlink test fails on Windows without symlink privilege. This is an environment issue.
- Headless tests cannot show client-side feel (elytra, animations, visuals). Each such change needs a manual check.

## 7. Working agreements

- Follow the original Java logic; no stubs or placeholders.
- Pre-check every structure before placing it.
- Do not modify root `README.md`, `BetterEnd_Bedrock_Port_Plan.md`, `docs/` or existing receipts under `bedrock/evidence/`.
- Restore all temporary probe edits (`server.properties`, world `db`, injected probe code) after each run.
