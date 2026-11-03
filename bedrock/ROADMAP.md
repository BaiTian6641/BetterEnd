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
| Script runtime | `runtime/bootstrap/bootstrap.js`, `runtime/equipment/*` | Gameplay: elytra, wildlife, decoration queue, stations. |

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
| Biome map, painter fast path, site-layer exclusion and footprint pre-checks | Done | placement tests (20/20) |
| Foggy Mushroomland density and giant mushrooms | Done | BDS: clusters 66×26×47, 49×25×42 |
| Filalux sky scatter (Lantern Woods) | Done | BDS: about 6 per chunk, y 52–198 |
| Small and medium ice stars at Java frequencies | Done | BDS clusters 13×15×14 to 33×35×34 |
| Giant ice stars (tiled) | Partial | BDS: a giant fragment of ~16k blocks placed with the ice-region guard removed. A full star with all guards enabled is not yet seen. |
| Elytra physics (Java model, glide controller, firework boost, wall damage) | Done in unit tests | Not verified in a client |
| Entity spawn guard, removal of the legacy pre-generation queue | Done | Lag and memory not measurable headlessly |
| Block outlines and collision | Mostly done | Audit found no missing outlines on plants. Seed plants use one box for all growth stages. |

## 5. Roadmap

Priorities: P0 blocks correctness, P1 is visible to players, P2 is polish.

### Milestone A: Close the giant ice star (P0)
1. Find why the ice-region guard rejects sites that Node accepts.
   - Dump `molangAerialMatch` for site chunks `(-39,-171)` and `(-54,-183)` in Node.
   - Build a debug pack that places a marker block at the site centre when only the aerial match passes.
   - Compare with the Node result. If they differ, check `math.sin` precision and `math.floor` of large arguments.
2. Once the guard is understood, re-run `GIANT_ONLY=1` and confirm a ≥50-block cluster of ~40k ice blocks.
3. Decide how to handle notched stars next to land. Options: accept the notches, or require the whole 5×5 tile area to be void using a deterministic land-map check instead of `query.heightmap`.
- Done when a probe shows a connected cluster of at least 50 blocks across at one or more sites, with 0 errors.

### Milestone B: Elytra in a real client (P0)
1. Test in game: takeoff on jump, glide, firework boost, wall impact, landing, durability.
2. Check posture. If `playAnimation` has no effect, record it as a known limitation or find an attachable-based pose.
3. Profile per-tick script cost with the Watchdog log open. Throttle `_stepWildlifeBehavior` and spawn logic if lag persists.
- Done when you confirm the feel is acceptable or list concrete issues.

### Milestone C: Missing Java feature categories (P1)
Implement in this order, because the first ones are the most visible:

| # | Feature group | Java source to read | Bedrock approach |
|---|---|---|---|
| 1 | Hanging vines (dense, twisted, bulb, jungle) | `bclib`/`betterend` vine features | Column features under leaves and ceilings, `y` from heightmap or tree footprints |
| 2 | Wall and log plants (polypores, moss, ruscus) | wall-plant features | Scatter against placed log blocks; may need a script pass |
| 3 | Small jellyshroom (floor, wall, ceiling) | `SmallJellyshroom*` | Structure templates with floor/ceiling anchoring |
| 4 | Sulphur spikes and hanging variants | sulphur features | Template placement in Sulphur Springs |
| 5 | Water plants (charnia, pond anemone, bubble coral, hydralux) | water plant features | Place inside generated ponds |
| 6 | Cave formations (stalactite and stalagmite) and cave plants (cave_grass, rubinea, magnula, cave_pumpkin) | cave features | Cave-layer rules; crystal moss cover |
| 7 | smaragdant_crystal_shard | crystal features | Check `small_island` template contents |

Rules for each: derive from the Java feature, add a placement pre-check, add a test in `placement.test.mjs`, then verify in BDS with a cluster or count scan. Re-run `scratch/audit-coverage.mjs` to update the list.

### Milestone D: Entities and gameplay (P1)
1. Re-verify each of the 27 entities in a client: model, texture, animation, spawn rules and behaviour (fish swarms, end slime sizes).
2. Review chairs and boats for the animation and render-controller errors seen earlier in the logs.
3. Check station blocks (smelter, anvil, infusion pedestal) in a client.

### Milestone E: Polish (P2)
1. Per-growth-stage selection boxes for seed and age-state plants.
2. Sound events: the `fly` event for custom blocks logs a verbose warning.
3. Painter: further reduce Molang cost in `after_surface_pass` (current painter work is ~30% of the legacy gate).
4. Release hygiene: update `bedrock/` docs and evidence receipts through the normal evidence process only.

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
