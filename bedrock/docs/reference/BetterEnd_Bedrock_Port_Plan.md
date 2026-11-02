> Initial specification snapshot. Original repository path: `BetterEnd_Bedrock_Port_Plan.md`. Original UTF-8 text SHA-256: `67c9f44d2224a37fd857760661977e6a817c2ded45335ed8af27f3f978227cd8`. Only local document links were adjusted for this copy. The active execution contract is [../execution-contract.md](../execution-contract.md).

# BetterEnd for Bedrock — Close-Parity Port and Vibrant Visuals Plan

**Project:** MCBE Industrial Serverpack  
**Research snapshot:** November 2, 2026  
**Status:** Architecture and implementation plan; no port, BDS benchmark, or Nintendo hardware certification has been completed as part of this research.

**Historical research:** this document's 26.60/26.70 baseline is not the active implementation target. Use [the Bedrock 26.40 implementation plan](BetterEnd_Bedrock_26.40_Implementation_Plan.md) for the `experimental/bedrock-26.40` branch, all-platform custom-server deployment requirements, and Vibrant Visuals/non-VV compatibility gates.

## 1. Decision and product contract

Build a new native Bedrock implementation of BetterEnd, not a renamed Abyssal Ascent pack, a collection of vaguely similar biomes, or a Java-server compatibility bridge. Retain the official Bedrock Dedicated Server (BDS), server-delivered resources, and unmodified Bedrock clients. Replace Abyssal Ascent as the serverpack's End-content provider; do not stack competing End generators.

The acceptance standard is **observable Java BetterEnd parity wherever technically achievable**. Implementation difficulty, development cost, or absence of a one-line JSON equivalent is not an engine limitation. Faithful scripted mechanics qualify as a valid implementation. Changes to recipes, progression, usable equipment, biome diversity, or survival availability require explicit review.

A finished port must cover the whole survival loop: entering the End, exploring its distinct environments, finding resources, cultivating plants, encountering wildlife, operating its workstations and rituals, making its equipment, and using its transport and respawn mechanics. A creative inventory full of decorative blocks is not a finished port.

Use five classifications in the parity ledger:

| Status | Meaning |
|---|---|
| Native | Implemented through the documented Bedrock content system with equivalent player-facing behavior. |
| Faithful reimplementation | Scripts or a different internal representation preserve the mechanic. |
| Adapted | A specifically identified engine constraint forces a visible difference. |
| Unproven | Requires a minimal engine or hardware test; not permission to omit it. |
| Blocked | Documented limitation plus a reproducible failed prototype and reviewed alternatives. |

A feature cannot be marked blocked merely because it is experimental rather than stable. Evaluate the latest stable release and available experiments separately. Preview-only capabilities remain research dependencies until an appropriate public client/server combination can use them.

## 2. Version baseline and research boundaries

The verified production baseline is **Bedrock 26.60**, released October 27, 2026. The latest preview inspected is **26.70.22**, posted October 28. Pin production and preview projects separately; do not require preview clients on Nintendo. Creator file format numbers remain distinct from the marketed release number, for example `1.26.60`. [S01, S02]

Use `@minecraft/server` 2.11.0 and `@minecraft/server-ui` 2.3.0 as the initial stable API baseline where required. `@minecraft/server-graphics` 1.0.0 is the stable graphics module to probe. Do not import beta APIs into the stable build accidentally. [S01, S09]

The upstream source inspected is **quiqueck/BetterEnd, branch `release/26.3`**. This is a source-review baseline, not an assertion that a particular binary release or moving branch head has been permanently pinned. Before implementation, record the exact commit, matching Java Minecraft/Fabric version, and WorldWeaver/BCLib versions. [S03, S07]

Create these initial records:

```text
upstream.lock.json          Exact upstream commits, versions, source hashes
engine-capabilities.json    Tested BDS/client versions, experiments, probe results
content-parity.json         Every upstream content entry and its implementation
asset-provenance.csv         Source, original author, license, modifications
exceptions.md               Reviewed engine-forced differences and evidence
worldgen-version.json        Port seed, generation revision, region schema
```

Documentation is evidence for a capability, not proof that a complete combination works on BDS or Nintendo. Record the test server build, client build, platform, enabled experiments, pack order, and content-log output with every capability result.

## 3. Upstream inventory and permissions

### 3.1 Inventory from source, not marketing counts

The inspected biome registry contains **27 keys**, including sub-biomes, aerial regions, and caves. The source-derived checklist is: [S04]

| Group | Registry identifiers |
|---|---|
| Main surface regions | `amber_land`, `blossoming_spires`, `chorus_forest`, `crystal_mountains`, `dragon_graveyards`, `dry_shrubland`, `dust_wastelands`, `foggy_mushroomland`, `glowing_grasslands`, `lantern_woods`, `megalake`, `shadow_forest`, `sulphur_springs`, `umbrella_jungle`, `umbra_valley` |
| Sub-biomes | `megalake_grove`, `neon_oasis`, `painted_mountains` |
| Aerial regions | `ice_starfield`, `flower_islets`, `waterfall_ponds` |
| Cave regions | `empty_end_cave`, `empty_smaragdant_cave`, `lush_smaragdant_cave`, `empty_aurora_cave`, `lush_aurora_cave`, `jade_cave` |

The six registered mob families are Dragonfly, End Slime, End Fish, Shadow Walker, Cubozoa, and Silk Moth. The wood registry contains eleven families: mossy glowshroom, pythadendron, end lotus, lacugrove, dragon tree, tenanea, helix tree, umbrella tree, jellyshroom, lucernia, and lucernia jelly. Include their applicable functional variants, not just logs and planks. [S05, S06]

Generate additional inventories for terrain and stone sets, ores and metals, saplings, crops, aquatic/wall plants, vines, mushrooms, crystals, lights, decoration, tools, weapons, armor, food, music, structures, advancements or equivalent discovery guidance, and every recipe and loot table. The source registries separate these categories, so a registry-driven exporter is preferable to hand-maintaining a short feature list. [S08]

### 3.2 Licensing gate

The repository has an MIT code license, but `LICENSE.ASSETS` separately lists `textures/gui/infusion.png`, `icon_updater.png`, and `lang/de_de.json` under CC BY-NC-SA 4.0, with attribution to Team BetterX. Do not describe the entire repository as uniformly MIT. [S10, S11]

Before publishing, audit each copied asset, music file, translation, dependency-derived resource, and attribution. Preserve applicable notices and source provenance. For the specifically restricted assets, either follow their license terms, obtain suitable permission, or create genuinely independent replacements. Do not assume that replacing a filename removes an underlying asset restriction. Review distribution and monetization separately rather than extending one asset's license to all newly written code.

Contact upstream about port naming, attribution, and collaboration. This is a useful coordination step, not a claim that every MIT-code modification requires bespoke permission. Do not reuse Abyssal Ascent's assets or code merely because it previously occupied the same serverpack slot.

## 4. Bedrock capability map

| Area | Research finding | Design consequence |
|---|---|---|
| Native End features | Official feature-rule documentation demonstrates placement in the End. [S12] | Trees, structures, ores, and environmental features can use native generation paths where appropriate. |
| Native biome replacement | The documented replacement dimension choices are Overworld and Nether, not End. [S13] | Do not promise an ordinary End replacement-biome JSON solution. |
| Custom dimensions | New dimension support exists, but the documented generator is void. [S14, S15] | A custom dimension is not a drop-in BetterEnd noise generator or dragon-fight replacement. |
| Runtime biome editing | The inspected public `Dimension` API offers biome queries but no general `setBiome` method. [S16] | Distinguish logical regions from actual stored biome identity. |
| Authoring biome editing | Editor Fill Biomes assigns biome data to a selected volume. [S17] | Test an authored-world alternative; this does not establish runtime BDS support. |
| Per-player VV | Stable graphics APIs expose player-specific atmosphere, lighting, grading, and water controls. [S09] | Test independent biome atmospheres without global player-to-player interference. |
| Block persistence and containers | Block-entity capabilities have expanded; container-specific support remains experimental in the reviewed release notes. [S14, S18] | Use native inventories where validated, while keeping station logic independent of UI details. |
| Custom item behavior | Many custom item components exist, but no general custom-item gliding component was found in the inspected list. [S19] | Treat BetterEnd Elytra variants as an early capability test, not an automatically solved item. |
| Java render extensions | VV is a supported fixed rendering system, not a Java shader-loader interface. [S20–S23] | Recreate appearance through supported materials and controls rather than promise binary shader compatibility. |

These findings do **not** mean most BetterEnd content is impossible. They identify where the port needs a different implementation and where an exact native-engine identity may remain unavailable.

## 5. World-generation architecture

### 5.1 Keep the real End as the primary location

Prefer the actual End dimension. Preserve the normal End-entry route, dragon encounter, return portal, gateway travel, and existing vanilla progression. Initially protect the central fight area and gateway/landing infrastructure while developing outer-island generation. Later add upstream central-island content deliberately; do not turn a temporary protection rule into a permanent unreviewed omission.

A separate custom dimension can be an experimental sandbox, but shipping it as the default would change how players enter and understand BetterEnd. It would also require proving replacement behavior for important vanilla mechanics. It is therefore not the primary design.

### 5.2 Separate four concepts

**Terrain geometry:** island shapes, caves, cliffs, pools, strata, giant plants, and structures.

**Logical region identity:** which BetterEnd environment owns a coordinate and which ecology, palette, music, and progression rules apply there.

**Stored engine biome identity:** what Bedrock's own biome queries, client-biome mapping, and native biome-aware systems report.

**Client presentation:** textures, materials, fog, light, water, particles, and audio.

A port can reproduce terrain and ecology without changing stored biome identity. That distinction must remain visible in documentation and tests. An internal region lookup does not make native `/locate biome` or unrelated add-ons automatically recognize BetterEnd biomes.

### 5.3 Backend A: reusable add-on generation

Start with native End feature rules for bounded vegetation, ores, crystals, structures, and suitable surface transformations. Official documentation establishes that End feature placement is possible; it does not establish a custom End biome provider or arbitrary base-noise replacement. [S12, S13]

Define a region catalogue with surface, cave, and aerial layers. Each region record should include its identifier, generation revision, surface palette, elevation/shape constraints, feature list, resource distribution, mob rules, ambience, and protected-structure exclusions.

The central feasibility problem is **sharing region selection between native feature placement and scripts**. A feature JSON file cannot simply call a TypeScript `getRegionAt()` function. Prototype a deterministic selector expressible in the supported native feature expression system and in the runtime service, or compile fixed regional placement data from a shared build-time plan. Test both implementations with golden coordinate/seed vectors. Do not assume native random values are reproducible in JavaScript.

If a sufficiently faithful shared selector is impractical, use a bounded generated-world route for the high-fidelity edition rather than allow generation, mob ecology, and visuals to disagree silently. A reduced reusable add-on can remain a development deliverable, but cannot be advertised as full worldgen parity.

For large forms, compare native feature composition, converted structures with deterministic procedural variation, and bounded bulk-block generation. Prioritize visible geometry and distribution parity; do not permanently replace every unique cave or mountain with a few repeating prefab islands.

### 5.4 Backend B: optional high-fidelity BDS world build

For this serverpack, an offline build step is acceptable provided the deployed server remains official BDS and clients remain unmodified. Offer a pregenerated world edition alongside the reusable add-on, not as a concealed replacement for it.

Investigate a pipeline that samples or exports the pinned Java reference world's terrain, biome layout, and structures, maps its block states to the port catalogue, and imports equivalent content into a Bedrock authoring world. Start with a very small test area; prove conversion of orientation, water, inventories, entities, and structures before scaling. Do not assume a generic Java-to-Bedrock converter understands modded blocks.

Editor Fill Biomes provides an authoring-time mechanism for assigning biome data. Test whether custom BetterEnd biome definitions can be assigned within the End, survive export and reopening, load on BDS, and synchronize correctly to all target clients. A successful test would improve native biome identity in pregenerated regions. A failed test leaves logical-region presentation as the fallback; the Editor documentation alone does not prove the whole pipeline. [S17]

A pregenerated region is finite. Publish its bounds, expansion procedure, generation revision, and behavior beyond the prepared area. Extend it through controlled builds or a compatible runtime backend. Do not claim that a finite authored map is infinite procedural-generation parity.

### 5.5 Determinism, integrity, and chunk safety

Store a dedicated `port_seed` explicitly. Do not assume the public runtime can read the underlying world seed. Include the generation revision in every region plan. When reproducing Java algorithms, preserve the original integer/PRNG semantics; do not squeeze a 64-bit seed into an imprecise floating-point number.

Use a durable state machine such as `unplanned -> planned -> terrain_ready -> decorated -> committed`. Persist progress and use region-level ownership so overlapping player exploration cannot schedule the same work twice. Assign structure ownership by its anchor region, and use margins around region edges to calculate cross-border features consistently.

Generation must be resumable and idempotent. Never interpret a missing generation marker as sufficient proof that a chunk is pristine; it may contain old player builds or content from another pack. Maintain explicit generated-region metadata and reject ambiguous retro-generation unless an administrator has approved the affected area.

Do not invent a general chunk-generation interception callback. Use only events and job scheduling actually available in the pinned API. Handle unloaded areas explicitly. Expensive transformations should run in bounded jobs or during controlled world preparation, never through synchronous scans of every loaded block each tick.

Prevent visible dangerous terrain construction around arriving players. Tests must cover fast flight, portals into unprepared regions, two players approaching one region from different sides, server interruption during generation, and crossing the prepared-world boundary.

### 5.6 Region interoperability

Provide a versioned, namespaced integration contract with queries such as region identity, tags, generation readiness, and supported resource families. Cross-pack integration must use an actual supported messaging or adapter mechanism; another behavior pack cannot be assumed to import arbitrary internal TypeScript modules.

Where real biome identity is unavailable, implement pack-specific discovery and location features honestly. Coordinate with industrial/farming integrations through region tags rather than requiring them to infer biome identity from one decorative block.

## 6. Gameplay parity implementation

### 6.1 Blocks, plants, and functional variants

For each upstream entry, record geometry, textures, states, orientation, placement, collision, interaction, tool requirements, drops, growth, light, sounds, recipes, and survival source. Generate repetitive JSON and translation entries from the catalogue, but hand-review behavior-rich blocks.

Separate visible fidelity from function. A door needs interaction, paired-part integrity, drops, and relevant redstone behavior; a chest-like block needs safe storage; a sign needs usable text; a sapling needs the correct tree growth. Verify water behavior, connection states, collision geometry, and tool interactions against the target release. Unsupported native convenience behavior may still be implemented with scripts.

Decorative entity workarounds should be exceptional. They can complicate persistence, collision, selection, and performance. Prefer actual blocks and item displays supported by the chosen release, and measure any entity-based alternative.

### 6.2 Resource and crafting progression

Extract the upstream recipe graph, including Thallasium, Terminite, Aeternium, Crystalite, catalysts, fuels, processing stages, tools, and equipment. Generate tests that prove every required input is obtainable and every progression stage is reachable in survival.

Do not replace smelter or infusion recipes with ordinary crafting-table recipes merely to shorten development. Keep upstream costs and processing order in the canonical port. Put deliberate industrial-server balance changes in a separate compatibility pack so players can distinguish a faithful port from server-specific tuning.

### 6.3 Workstations and rituals

The functional registry includes the End Stone Smelter, Aeternium Anvil, Infusion Pedestal, Eternal Pedestal, Respawn Obelisk, End Portal Block, and Silk Moth nest/hive content. These are first-class scope, not optional polish. [S24]

Model each station as a server-authoritative state machine. Keep recipe logic independent of the inventory presentation layer. The schema should include station identity, position/dimension, recipe identifier, input/output inventory ownership, progress, fuel or charge state, lock owner, and transaction revision.

For infusion, validate the full multiblock arrangement, reserve or consume inputs according to a single transaction, persist in-progress state, and commit the output exactly once. Test simultaneous activation, hopper extraction, block break, chunk unload, shutdown, missing pedestal, full output inventory, and failed recovery. Never use purely client-visible animation as authoritative progress.

Current native container work is promising but experimental. Prototype it first because it may preserve inventory interaction much better than a generic form. If its layout cannot reproduce Java's slots exactly, retain recipe semantics and item movement as closely as possible and record the layout difference. Generic menus are suitable for help/configuration; they are not an adequate replacement for the entire workstation experience. [S14, S18]

### 6.4 Wildlife and ecology

For each of the six mobs, extract movement, hostility, targeting, spawn environment, population constraints, drops, variants, breeding or habitat interactions, and audio/animation. Use native behavior components for routine behavior and scripts only for rules that need them.

Where the region identity is logical rather than native, integrate spawn checks with the region service. Account for existing entities, unloaded areas, despawning, structures, and player-built farms. Avoid spawning a fresh population every time a player crosses a region boundary.

Match observable behavior rather than attempting to execute Java AI internals. Document genuinely engine-specific differences in pathfinding or combat only after testing; do not use that caveat to omit an entire mob.

### 6.5 Equipment and gliding

Test tools, armor, enchantment compatibility, repair, durability, damage, effects, projectiles, and visual attachment behavior individually. The upstream equipment registry includes armored and Crystalite Elytra variants. [S25]

No general custom-item glider component was found in the inspected Bedrock item component list. This is an early prototype risk, not grounds to remove those items. Investigate a genuine vanilla Elytra carrier with supported item metadata and scripted supplemental behavior. Verify whether identity, protection, appearance, durability, repair, enchanting, death drops, storage, and multiplayer synchronization can be preserved. [S19]

Do not simulate flying by repeatedly teleporting the player and describe it as equivalent Elytra support. When native flight can be retained but item identity or visuals cannot, document that narrow compromise. Also test interactions with the rest of the serverpack's armor and damage systems before claiming parity.

### 6.6 Portals and respawning

Preserve destination selection, construction requirements, activation resources, return behavior, charges, and failure handling. Safe landing validation must include loaded terrain, collision, void risk, obstructed exits, and recovery when a destination is unavailable.

Probe native spawn-point behavior in the End before designing the Respawn Obelisk around it. A post-respawn safe teleport may be a workable adaptation, but its ordering, death-screen behavior, inventory handling, and interaction with other respawn add-ons must be tested and documented.

### 6.7 Audio, discovery, and guidance

Include legally usable ambience, mob sounds, music/discs, translations, tooltips, and guidance for progression. Match original triggers and priorities where possible. Avoid duplicate music streams and region-boundary restart spam. Provide controller-readable help without replacing the exploration loop with a compulsory menu.

## 7. Vibrant Visuals and Classic rendering

### 7.1 Preserve the art direction

Create two visual acceptance tracks: Java BetterEnd's unmodified base appearance versus Bedrock Classic, and a separately defined enhanced reference versus Bedrock Vibrant Visuals. Do not silently choose a third-party Java shaderpack as the canonical appearance of BetterEnd itself.

Capture reference scenes with pinned upstream version, camera position, field of view, lighting conditions, and representative blocks. Compare silhouette, palette, density, transparency, atmosphere, and readability. Maintain pixel-art texture resolution unless a deliberate asset decision changes it.

### 7.2 Supported material pipeline

Use the VV `pbr` pack capability, texture-set definitions, base-color textures, and authored MER/MERS maps. The documented metalness/emissive/roughness channel assignment is R/G/B; use supported normal or height detail appropriately rather than blindly copying a Java shaderpack's packed textures. [S20, S21]

Author material categories such as rough bark/stone, leaves and soft vegetation, reflective metals, emissive plants, and crystals. Preserve the distinction between visible emissiveness and gameplay light level. A brighter-looking texture must not accidentally change mob-spawn or gameplay rules. [S23]

Keep Classic textures and silhouettes complete. A universal resource pack, or a base pack plus a VV layer, must be tested with the same server-delivered stack on Classic clients. Do not assume that adding PBR assets alone proves fallback compatibility.

### 7.3 Distinct biome atmospheres in multiplayer

The stable graphics module documents `getPlayerAtmospherics`, `getPlayerColorGrading`, `getPlayerLighting`, and `getPlayerWater`, with per-player settings taking precedence over biome-level settings. [S09]

Proposed use: the region service selects the player's BetterEnd environment, and a presentation adapter applies a blended preset to that player's actual underlying biome. Two players in different logical regions must receive different settings without changing each other's view. This is a design inference from the API, not a completed BDS test.

Use transition distances and hysteresis to avoid rapid oscillation at borders. Handle caves and aerial regions by altitude and region priority. Implement reconnect, dimension-change, respawn, resource-reload, and script-restart behavior. Save or reconstruct the intended baseline; do not invent an undocumented `reset()` method.

Where real custom biome identities are available in an authored world, prefer client-biome associations and native blending when practical. Current VV biome configuration can override global settings, so test the actual effective End settings rather than changing only a global lighting file. [S22]

### 7.4 Rendering differences that need honest treatment

Recreate skies, fog, glow, color, and water through supported VV mechanisms. A custom Java sky renderer or GLSL effect is not directly portable through a resource pack.

VV's documented screen-space reflection limitations include transparent geometry other than water. Exact reflective/refractive crystal behavior from an arbitrary Java shader cannot therefore be promised. Make emissive crystals, translucency, water, and metallic surfaces visually convincing within the supported pipeline, and document the specific missing effect rather than removing the content. [S23]

Avoid making preview-only point lights or expensive dynamic effects essential to progression. Atmospheric particles and optional lighting can scale down without changing recipes, resources, interactions, or biome identity.

## 8. Nintendo and official-server deployment

The native Nintendo Switch 2 edition launched with 26.60 on October 27, 2026 and supports Vibrant Visuals. Nintendo also states that VV is unavailable in split-screen and with some incompatible content. Original Switch remains a required Classic-mode target for this project, not a VV target. [S01, S26]

The acceptance matrix is:

| Client | Required modes | Main checks |
|---|---|---|
| Original Switch | Classic | Join/download, memory use, large foliage scenes, controller UI, long sessions. |
| Native Switch 2 | Classic and VV | Same content in both modes, PBR rendering, biome transitions, pack compatibility. |
| Switch 2 split-screen, where applicable | Supported non-VV mode | UI focus, shared resource stack, audio, interaction correctness. |
| Windows | Classic and VV | Reference captures, content diagnostics, multiplayer reproduction. |
| Other serverpack clients | Supported graphics modes | Cross-client inventory, entity, portal, and recipe consistency. |

Connecting a console to this privately hosted BDS and executing its packs are separate issues. Validate the project's existing connection route on current releases; do not assume an arbitrary-address menu or an old routing workaround is universally available.

Use version-matched behavior/resource dependencies and BDS required-resource settings. `texturepack-required=true` is documented; enable content logging for development. Server delivery must be tested from a clean client cache, including rejection, interrupted download, reconnect, and update. No manual client pack installation is an acceptance condition for this project. [S27]

Use portable packaging: no colon in an archive path, no case-only duplicate filenames, no absolute paths, and no unsafe traversal. A title may contain punctuation, but the previously observed `Create: Recycling...` archive-path failure must not recur in this port. Keep UUIDs stable across upgrades, bump versions intentionally, and validate pack dependency order.

## 9. Repository and build pipeline

Proposed layout:

```text
betterend-bedrock/
  upstream/                 Lock files and source/asset provenance
  catalog/                  Normalized content, recipes, states, regions
  tools/
    extract/                Registry/datagen extraction and reports
    convert/                Texture/model/structure converters
    worldbuild/             Optional offline generation/import tooling
    validate/               JSON, references, recipe graph, portability
  packs/
    core_bp/                Blocks, items, entities, gameplay scripts
    worldgen_bp/            Exclusive End world-generation provider
    base_rp/                Classic-complete textures, geometry, audio
    vv_rp/                  Optional packaging layer for VV assets
    industrial_compat_bp/   Serverpack-specific adapters and recipes
  runtime/
    regions/                Identity and coordinate queries
    generation/             Bounded jobs and region persistence
    stations/               Transactions and inventory adapters
    ecology/                Spawning, growth, habitat logic
    equipment/              Item behavior and Elytra probes/adapters
    transport/              Portals, safe landings, respawn
    presentation/           Per-player VV and ambience ownership
  tests/
    capability/             Small engine probes
    unit/                   Pure logic, region selectors, recipe graphs
    integration/            BDS worlds and repeatable interaction tests
    visual/                 Reference scenes and comparison captures
    regression/             Save/load and migration fixtures
  docs/
    parity.md
    exceptions.md
    operations.md
    migration.md
```

Choose a unique stable namespace, for example `betterend_bedrock:`. Maintain an explicit mapping from upstream identifiers. Separate generated definitions from hand-written runtime code so regeneration cannot erase implementation work.

The converter should automate repetitive catalogue work, not pretend to translate arbitrary Java behavior into Bedrock. Generate models, recipes, drops, permutations, and localization where the mapping is known. Emit unresolved entries as build failures or tracked review items rather than silently dropping them.

Validate missing texture references, invalid identifiers, duplicate UUIDs, script module versions, inaccessible recipe inputs, unbounded material loops, loot references, orphan models, and forbidden archive paths in continuous integration. Keep pack sizes and entity/model complexity visible in build reports.

## 10. Milestones with completion gates

### Phase 0 — Capability pack and locked reference

Build a tiny, disposable test world and pack rather than begin with the full content catalogue. Lock upstream source, audit licenses, and implement probes for native End features, region-selector agreement, a persistent workstation, experimental native containers, Elytra behavior, and per-player VV.

**Gate:** two players in different End regions receive independent visuals; one feature generates consistently; one station survives unload/restart without duplication; the identical pack stack joins on original Switch and native Switch 2. Record failures precisely and choose production experiments explicitly.

### Phase 1 — Vertical slice

Implement Umbrella Jungle, Crystal Mountains, and Shadow Forest as contrasting environments, plus one cave region. Include a representative tree, surface palette, crystal/resource chain, wildlife interaction, and working infusion recipe. Exercise real End travel rather than a decorative showcase room alone.

**Gate:** an ordinary survival player can reach and use the slice, generation has no unacceptable seams or dangerous arrival behavior, and the rendering works in Classic and VV.

### Phase 2 — Complete environmental catalogue

Expand to all inventoried regions and their respective vegetation, structures, resources, cave/aerial forms, and wildlife. Integrate the optional authored-world pipeline if required for terrain fidelity.

**Gate:** every biome and natural content entry has an implementation, a survival encounter test, or a reviewed engine-specific exception. Repetitive placeholder terrain is not accepted as final parity.

### Phase 3 — Full survival progression

Complete material progression, workstations, equipment, portals, respawning, food, farming, nests/hives, and functional building variants. Keep original balance in the canonical pack.

**Gate:** automated recipe-graph checks and human survival playthroughs reach all non-exempt content without creative commands or substitute recipes. Multiplayer transactions survive interruption without loss or duplication.

### Phase 4 — Visual and audio completion

Finish material maps, biome atmosphere presets, supported sky effects, ambience, animations, transitions, and scalable cosmetic effects. Compare captured scenes with the pinned references.

**Gate:** no missing-texture fallback, incorrect global atmosphere leakage, unreadable controller UI, or gameplay dependency on VV. Visual exceptions are narrow and documented.

### Phase 5 — Serverpack integration and release rehearsal

Test the port alone, then with the core industrial stack, then with the complete serverpack. Introduce adapters only after standalone correctness is established. Rehearse install, pack update, clean-client joining, backup restore, and any proposed migration.

**Gate:** approved hardware matrix, complete parity/exception ledger, reproducible build, release notes, world backup, and tested rollback. No compatibility certification based solely on JSON validation or one Windows session.

## 11. Test strategy and proposed performance budgets

### 11.1 Fidelity testing

Use paired reference scenarios for block placement/breaking, tools, recipes, workstation processing, plant growth, mob behavior, portals, equipment, and visuals. Compare distributions and encounter rates where identical cross-engine timing or pathfinding is unrealistic. Keep meaningful gameplay differences separate from incidental engine animation differences.

The completion metric is catalogue coverage with evidence, not an invented percentage of Java parity. Every entry must have a test or a reviewed exception, and every exception must identify the exact lost behavior, its cause, and the least-disruptive workaround.

### 11.2 Persistence and security

Test station interaction by multiple players, hopper access, malicious repeated use, disconnects, full inventories, destroyed outputs, server shutdown, and recovery from partial writes. Validate all player actions server-side. Avoid trusting client names, forms, or visual effects as proof of item ownership or recipe completion.

Store the minimum persistent state needed for reconstruction. Version schemas and implement explicit migrations. Large world-generation metadata needs a storage design and bounded cache, not an ever-growing per-tick JSON rewrite.

### 11.3 Load tests

Measure the same world with the port disabled, enabled alone, and enabled with the full serverpack. Test idle End players, dense forests, active farms, simultaneous rituals, portals, and several players flying into different new regions while industrial machinery runs elsewhere.

As an initial engineering target—not a measured result—budget for 20 server ticks per second and aim for a p95 tick time below 40 ms on the agreed reference host, leaving headroom within a 50 ms tick interval. Adjust explicit work budgets using real profiling. Record p95/p99 stalls and not only average TPS.

Client acceptance should use real frame-time, memory, and long-session measurements on the target devices. Do not guarantee FPS before testing. Reduce redundant transparent geometry, decorative entity counts, material duplication, update frequency, and cosmetic particles before reducing gameplay content.

### 11.4 Graphics tests

Run paired players in different regions; repeatedly cross borders; teleport between dimensions; reconnect; die and respawn; reload scripts/resources; and inspect caves, water, crystals, and dragon-fight states. Confirm one player's atmosphere never changes the other's unintentionally.

Classic and VV must share item availability, collision, loot, progression, actual light behavior, and mob rules. Only presentation should differ.

### 11.5 Generation tests

Use a fixed seed suite, region-boundary suite, structure-overlap suite, cave/aerial suite, protected-central-area suite, interrupted-job suite, and old-world/no-retrogen suite. Check that reloading or updating packs cannot rewrite player builds. Freeze the generation revision for an established region; define seams and migrations before introducing a new algorithm.

## 12. Industrial serverpack integration and migration

Keep the canonical BetterEnd pack independent of industrial recipe substitutions. A compatibility layer may expose material categories, allow selected processing machines to handle resources, and bridge farming/cooking content. Test the resulting recipe graph for unintended loops and progression skips.

Avoid broad overrides of `player.json`, global UI files, default rendering, or vanilla entities. When an integration needs one, isolate it and test the whole pack stack. Assign ownership for fog, music, respawn, damage modifiers, and equipment effects so separate add-ons do not continually overwrite each other.

Abyssal Ascent and the new End generator should be mutually exclusive in the release configuration. If an existing world has Abyssal Ascent blocks, items, entities, or terrain, simply removing its pack can be unsafe. First inventory the affected content and rehearse any mapping on a copy. The cleanest reference deployment is a fresh world; resetting or replacing an existing End is destructive and requires an explicit administrator decision.

Do not overwrite an existing world with a pregenerated replacement merely to simplify installation. When migration is necessary, preserve player inventories, bases, block entities, gateways, and server progression according to a written policy. Back up the entire world and its matching pack versions together. Roll back the complete snapshot rather than downgrade scripts against newer persisted data.

## 13. Initial issue backlog

| ID | Work item | Success evidence |
|---|---|---|
| CAP-001 | Verify target BDS/client/API combination | Version record and clean content log. |
| CAP-002 | Generate one feature in the actual End | Repeatable placement test and protected-area behavior. |
| CAP-003 | Share region selection across generation and scripts | Golden vectors with zero disagreement. |
| CAP-004 | Two-player VV region override | Independent Windows/Switch 2 views and correct reset lifecycle. |
| CAP-005 | Persistent station and native container experiment | No loss/dupe across unload and restart. |
| CAP-006 | BetterEnd Elytra adaptation | Real gliding, inventory identity, effects, repair and durability tests. |
| CAP-007 | Editor-assigned End biome export | Data survives Editor -> BDS -> target clients, or a recorded failure. |
| CAP-008 | Portable clean-client pack delivery | Original Switch and Switch 2 installation-free joining. |
| SRC-001 | Freeze upstream and license provenance | Exact source lock and asset audit. |
| SRC-002 | Export complete catalogue and recipe graph | No silent unresolved references. |
| GEN-001 | Three-biome vertical slice plus cave | Survival encounter and cross-border tests. |
| GAME-001 | Infusion transaction engine | Concurrent interaction and interruption tests. |
| VIS-001 | Classic/PBR material sample board | Captures from all required graphics modes. |
| OPS-001 | Standalone -> core stack -> full stack rehearsal | Reproducible environment and compatibility report. |

## 14. Recommended first implementation decision

Proceed with a **parity-first, real-End implementation**, a **shared region service**, **native feature generation where practical**, **server-authoritative gameplay**, and **Classic-complete resources enhanced by VV**. Keep the pregenerated-world route available for this dedicated server when it materially improves terrain fidelity.

Do not commit the entire content pipeline before CAP-002 through CAP-008 produce evidence. The three most consequential uncertainties are native/logical biome integration, faithful equipment and workstation behavior, and the complete Nintendo pack-delivery/rendering combination.

The honest target is a recognizable, mechanically complete BetterEnd port with a small, explicit engine-exception ledger—not a decorative approximation, and not an unsupported promise of bit-identical Java world generation or arbitrary shader effects.

## References

All sources were consulted for the November 2, 2026 research snapshot. These are primary-source references. Branch-based source URLs can move; record commit-specific versions in the implementation lock file. URLs below are provided as reproducible source identifiers.

[S01] Mojang, **Minecraft Bedrock Edition 26.60 Changelog**, October 27, 2026.  
`https://feedback.minecraft.net/hc/en-us/articles/49852828563853-Minecraft-Bedrock-Edition-26-60-Changelog`

[S02] Mojang, **Minecraft Beta & Preview 26.70.22**, October 28, 2026.  
`https://feedback.minecraft.net/hc/en-us/articles/49967647452685-Minecraft-Beta-Preview-26-70-22`

[S03] Team BetterX, **BetterEnd repository**.  
`https://github.com/quiqueck/BetterEnd`

[S04] BetterEnd, **EndBiomes.java**, inspected `release/26.3` branch.  
`https://raw.githubusercontent.com/quiqueck/BetterEnd/release/26.3/src/main/java/org/betterx/betterend/registry/EndBiomes.java`

[S05] BetterEnd, **EndEntities.java**.  
`https://raw.githubusercontent.com/quiqueck/BetterEnd/release/26.3/src/main/java/org/betterx/betterend/registry/EndEntities.java`

[S06] BetterEnd, **EndWoodBlocks.java**.  
`https://raw.githubusercontent.com/quiqueck/BetterEnd/release/26.3/src/main/java/org/betterx/betterend/registry/block/EndWoodBlocks.java`

[S07] BetterEnd, **gradle.properties**.  
`https://raw.githubusercontent.com/quiqueck/BetterEnd/release/26.3/gradle.properties`

[S08] BetterEnd, **EndBlocks.java / EndItems.java**.  
`https://raw.githubusercontent.com/quiqueck/BetterEnd/release/26.3/src/main/java/org/betterx/betterend/registry/EndBlocks.java`  
`https://raw.githubusercontent.com/quiqueck/BetterEnd/release/26.3/src/main/java/org/betterx/betterend/registry/EndItems.java`

[S09] Microsoft Learn, **@minecraft/server-graphics module**.  
`https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-graphics/minecraft-server-graphics?view=minecraft-bedrock-stable`

[S10] BetterEnd, **LICENSE**.  
`https://raw.githubusercontent.com/quiqueck/BetterEnd/release/26.3/LICENSE`

[S11] BetterEnd, **LICENSE.ASSETS**.  
`https://raw.githubusercontent.com/quiqueck/BetterEnd/release/26.3/LICENSE.ASSETS`

[S12] Microsoft Learn, **Feature tutorial / End feature-rule example**.  
`https://learn.microsoft.com/en-us/minecraft/creator/documents/featurestutorial_1?view=minecraft-bedrock-stable`

[S13] Microsoft Learn, **Biome replacement schema**.  
`https://learn.microsoft.com/en-us/minecraft/creator/reference/content/biomesreference/examples/components/biome_replacement?view=minecraft-bedrock-stable`

[S14] Microsoft Learn, **Creator update notes 1.26.50**.  
`https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.50?view=minecraft-bedrock-stable`

[S15] Microsoft Learn, **DimensionRegistry**.  
`https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/dimensionregistry?view=minecraft-bedrock-stable`

[S16] Microsoft Learn, **Dimension API**.  
`https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/dimension?view=minecraft-bedrock-stable`

[S17] Microsoft Learn, **Editor Fill Biomes Tool**, updated October 15, 2026.  
`https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockeditor/editorfillbiomestool?view=minecraft-bedrock-stable`

[S18] Microsoft Learn, **minecraft:block_entity**.  
`https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_block_entity?view=minecraft-bedrock-stable`

[S19] Microsoft Learn, **Item component list**.  
`https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponentlist?view=minecraft-bedrock-stable`

[S20] Microsoft Learn, **Vibrant Visuals resource packs**.  
`https://learn.microsoft.com/en-us/minecraft/creator/documents/vibrantvisuals/vvresourcepacks?view=minecraft-bedrock-stable`

[S21] Microsoft Learn, **Texture sets introduction**.  
`https://learn.microsoft.com/en-us/minecraft/creator/reference/content/texturesetsreference/texturesetsconcepts/texturesetsintroduction?view=minecraft-bedrock-stable`

[S22] Microsoft Learn, **Vibrant Visuals biome customization**.  
`https://learn.microsoft.com/en-us/minecraft/creator/documents/vibrantvisuals/biomecustomization?view=minecraft-bedrock-stable`

[S23] Microsoft Learn, **Vibrant Visuals lighting customization**.  
`https://learn.microsoft.com/en-us/minecraft/creator/documents/vibrantvisuals/lightingcustomization?view=minecraft-bedrock-stable`

[S24] BetterEnd, **EndFunctionalBlocks.java**.  
`https://raw.githubusercontent.com/quiqueck/BetterEnd/release/26.3/src/main/java/org/betterx/betterend/registry/block/EndFunctionalBlocks.java`

[S25] BetterEnd, **EndEquipmentItems.java**.  
`https://raw.githubusercontent.com/quiqueck/BetterEnd/release/26.3/src/main/java/org/betterx/betterend/registry/item/EndEquipmentItems.java`

[S26] Nintendo, **Experience Vibrant Visuals in Minecraft for Nintendo Switch 2**.  
`https://www.nintendo.com/us/whatsnew/experience-vibrant-visuals-in-minecraft-for-nintendo-switch-2/`

[S27] Microsoft Learn, **Bedrock Dedicated Server properties**.  
`https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/server-properties?view=minecraft-bedrock-stable`
