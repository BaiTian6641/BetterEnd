# Bedrock 26.30+ / 26.40 (`1.26.20` – `1.26.40`) API & Schema Reference

This document tracks the exact engine schemas, Scripting API V2 rules, Vibrant Visuals lighting parser versions, and native world-generation / `.mcstructure` capabilities verified against Minecraft Bedrock Client (`1.26.30+` / `1.26.40`) and Bedrock Dedicated Server (`1.26.40.8`).

---

## 1. Scripting API & Module Version Promotion (`@minecraft/server` 2.x)

- **Manifest Dependencies (`behavior_pack/manifest.json`)**:
  - `@minecraft/server`: `"version": "2.9.0"` (promoted at runtime by `1.26.40` to `2.11.0`).
  - `@minecraft/server-ui`: `"version": "2.1.0"` (promoted at runtime by `1.26.40` to `2.3.0`).
- **Startup Registration (`system.beforeEvents.startup`)**:
  - All block and item custom components must be registered inside `system.beforeEvents.startup.subscribe(({ blockComponentRegistry, itemComponentRegistry }) => ...)` before the world finishes initializing.
  - Every custom component registered in `blockComponentRegistry.registerCustomComponent(id, handler)` or `itemComponentRegistry.registerCustomComponent(id, handler)` **must** be referenced by at least one block JSON or item JSON in the behavior pack, otherwise the engine logs:
    - `[Scripting][warning]-Block custom component 'betterend:...' is not being used by a block`
    - `[Scripting][warning]-Item custom component 'betterend:...' is not being used by an item`

---

## 2. Custom Components V2 (`1.21.90+` / `1.26.20` Blocks, `1.26.30` Items)

- **Direct Key Syntax (No `"minecraft:custom_components"` Array)**:
  - In `format_version: "1.26.20"` (`blocks/*.block.json`) and `format_version: "1.26.30"` (`items/*.item.json`), the legacy `"minecraft:custom_components": ["namespace:id"]` array wrapper was deprecated and removed.
  - Custom components are attached **directly as keys inside `"components"`** (or permutation `"components"`):
    ```json
    "components": {
      "betterend:smelter": {},
      "betterend:station_interaction": {}
    }
    ```
- **Mandatory `"minecraft:tick"` for Ticking Block Components**:
  - Whenever a registered block custom component handler defines an `onTick(event)` method (e.g. `betterend:smelter`, `betterend:infusion_pedestal`, `betterend:eternal_pedestal`, `betterend:silk_moth_nest`, `betterend:hydrothermal_vent`, `betterend:brimstone`, `betterend:ecology_tick`), any block JSON attaching that component **must** also include `"minecraft:tick"` in its `"components"`:
    ```json
    "minecraft:tick": {
      "interval_range": [40, 80],
      "looping": true
    }
    ```
  - Omitting `"minecraft:tick"` on a block with an `onTick` custom component causes a `[Blocks][error]` content error on load (`requires a 'minecraft:tick' component to be added to set the tick configuration`).

---

## 3. Block & Geometry Schema Rules (`1.26.20` / `1.26.30`)

1. **`minecraft:material_instances` `ambient_occlusion` Type**:
   - In `format_version: "1.26.20"` blocks, `ambient_occlusion` inside `minecraft:material_instances` must be a **float** (`0.0` to `1.0`, e.g., `1.0` for standard blocks and `0.0` for glowing/foliage/translucent crystal blocks), not a boolean.
2. **`minecraft:transformation` Schematic Extent Rule**:
   - When a block or permutation applies `minecraft:transformation` with non-zero rotation, Bedrock validates that the total extent (`max - min`) of all geometry cubes on every axis is `<= 1 + 14/16` blocks (`<= 30.0` model units).
   - Multi-part rotated plant/cluster models (`model-compiler.mjs`) must clamp cube extents within `[-7, 23]` (`<= 30` units total span) and negate X-axis element rotations (`rx = -rotAngle`) when converting from Java's right-handed block model coordinates to Bedrock's left-handed geometry coordinates.
3. **Block Breaking Particle Geometry Rule (`geometry.betterend.cross`)**:
   - Any geometry used by custom blocks for breaking particles must keep its cube coordinates within the `[0, 16]` unit-cube span (`origin: [-8, 0, -8]`, `size: [16, 16, 16]`, UV `[0, 0]` size `[16, 16]`) to prevent `[Block][error]-Invalid Geometry reading block breaking particle`.
4. **Render Method Classification & `aurora_crystal` Transparency**:
   - `betterend:aurora_crystal` uses `render_method: "blend"`, `face_dimming: true`, `ambient_occlusion: 0.0`, `minecraft:light_dampening: 0`, `minecraft:light_emission: 15`, and state `betterend:color_shift` (`0..3`) pre-tinted across the 4 Java `AuroraCrystalBlock.COLORS` stops (`#FF5A00`..`#00FF96` / `#FF66B2`..`#4DFFCC`).
   - All plant, vine, leaf, moss, fur, chandelier, bulb lantern, bar, gate, and glass-pane blocks with alpha cutouts must classify as `alpha_test` / `alpha_test_single_sided_to_opaque` (never `opaque`).

---

## 4. Vibrant Visuals & Deferred Technical Preview Schemas (`1.26.30+`)

The Bedrock client `[Lighting]` subsystem strictly enforces per-folder `format_version` parsers:

| Resource Pack Path | Required `format_version` | Root Schema Key | Notes |
|---|---|---|---|
| `pbr/global.json` | `"1.21.40"` | `"minecraft:pbr_fallback_settings"` | Global block/actor/item/particle MER fallback |
| `point_lights/global.json` | `"1.21.40"` | `"minecraft:point_light_settings"` | Uses `"colors": { "<block_id>": "#RRGGBB" }`. Version `"1.26.20"` fails with `no parser available for version 1.26.20`. |
| `local_lighting/local_lighting.json` | `"1.21.120"` | `"minecraft:local_light_settings"` | Per-block `light_color` + `light_type` (`point_light` / `static_light`) |
| `lighting/*.json` | `"1.21.40"` | `"minecraft:lighting_settings"` | Directional lights (`sun`, `moon`, `orbital_offset_degrees`) + `emissive.desaturation` |
| `atmospherics/*.json` | `"1.21.40"` | `"minecraft:atmosphere_settings"` | Sky zenith/horizon, Rayleigh/Mie scattering |
| `color_grading/*.json` | `"1.21.40"` | `"minecraft:color_grading_settings"` | Midtones/highlights/shadows/temperature |
| `water/*.json` | `"1.26.20"` | `"minecraft:water_settings"` | `particle_concentrations`, `waves`, `caustics` (omit deprecated `sampleWidth`) |
| `textures/blocks/*.texture_set.json` | `"1.21.30"` | `"minecraft:texture_set"` | `color`, `metalness_emissive_roughness`, `normal` |

---

## 5. Native World Generation & `.mcstructure` Architecture (`1.26.30+`)

1. **Why `experimental_custom_biomes` Is Not Used**:
   - Bedrock `26.30+` rejects `experimental_custom_biomes` on pack import (`不支持包功能“experimental_custom_biomes”`) and does not support custom biome IDs in `the_end` dimension generator.
   - Instead, BetterEnd overrides `biomes/the_end.biome.json` (`format_version: "1.21.110"`) and gates regional features via Molang (`v.originx`, `v.originz`) aligned with `RegionService`, supplemented by `GenerationService` chunk streaming for massive multi-chunk structures and 3D terrain formations.
2. **Native `.mcstructure` + `minecraft:structure_template_feature` (`1.26.10`) + `minecraft:snap_to_surface_feature` (`1.21.40`)**:
   - Vanilla `minecraft:tree_feature` only produces vanilla oak/acacia canopies and must **not** be used for BetterEnd trees.
   - `minecraft:aggregate_feature` with `enforce_placement_rules: false` at `q.heightmap(v.worldx, v.worldz)` places floating blocks at `y = 0..2` over the End void where `heightmap == 0`.
   - Instead, all 122 original BetterEnd `.nbt` structures (`src/main/resources/data/betterend/structure/**/*.nbt`) and 1:1 Java SDF/Spline/Voxel features (trees, bushes, aurora crystals, ice stars, spires, arches, geysers, boulders, pillars) are compiled into Little-Endian Bedrock `.mcstructure` files (`behavior_pack/structures/betterend/*.mcstructure`, `block_indices` layer 0 using `-1` for structure void to preserve existing terrain) and placed via `minecraft:structure_template_feature` (`format_version: "1.26.10"`) wrapped inside `minecraft:snap_to_surface_feature` (`format_version: "1.21.40"`, `allowed_surface_blocks`, `surface: "floor"` / `"ceiling"`, `vertical_search_range: 24`), guaranteeing authentic 1:1 BetterEnd geometry and zero void floating.
