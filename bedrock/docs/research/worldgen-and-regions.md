# BetterEnd Java Reference Research Specification: Worldgen, Regions, Features & Structures (`REG-001`, `CAP-003`, `CAP-004`, `CAP-014`, `GEN-001..003`)

All findings below are anchored to the pinned Java reference under `bedrock/.work/java-reference/source/src/main/java/org/betterx/` and `bedrock/.work/java-reference/source/src/main/generated/data/`, plus disassembled Wover classes from `bedrock/.work/java-reference/dependency-jars/wover-generator-api-26.301.2.jar` and `bedrock/catalogue/generated/{registrations,resources}.json`.

---

## 1. Complete Analysis of All 27 BetterEnd Regions

### 1.1 Registry & Base Architecture
- **Registry Class**: `registry/EndBiomes.java:24-79` registers 27 biomes across 4 functional categories:
  1. **15 Main Surface Land Biomes** (`world/biome/land/*.java`)
  2. **3 Surface Sub-Biomes** (`world/biome/land/{MegalakeGroveBiome,NeonOasisBiome,PaintedMountainsBiome}.java`)
  3. **3 Void / Aerial Small-Island Biomes** (`world/biome/air/{BiomeIceStarfield,FlowerIsletsBiome,WaterfallPondsBiome}.java`)
  4. **6 Underground Cave Biomes** (`world/biome/cave/*.java`)
- **Base Data Class**: `world/biome/EndBiome.java:40-264` extends `de.ambertation.wover.biome.impl.data.BiomeData` (`CODEC` at `EndBiome.java:43-59`), storing:
  - `fogDensity` (`float`, default `1.0F`)
  - `genChance` (`float`, default `1.0F`)
  - `edgeSize` (`int`, default `0`)
  - `edge` (`ResourceKey<Biome>`, optional)
  - `parent` (`ResourceKey<Biome>`, optional, links sub-biomes to parent land biomes)
  - `terrainHeight` (`float`, default `1.0F`; `0.0F` in `megalake` & `megalake_grove`, `0.1F` in `empty_end_cave` & `jade_cave`)
  - `hasCaves` (`boolean`, default `true` on land biomes, `false` on void/cave biomes)
- **Default Builder Rules**: `world/biome/EndBiomeBuilder.java:81-251` & `registry/EndFeatures.java:149-185`:
  - Base climate for all 27 biomes: `has_precipitation = false`, `temperature = 0.5`, `downfall = 0.5` (`worldgen/biome/*.json`).
  - Default sky color: `#000000` (`0`), default water color: `4159204` (`#3f76e4`), default water fog color: `329011` (`#050533`), default foliage/grass color: when `has_foliage_color` is unset, defaults to matching fog or biome overrides (`EndBiomeBuilder.java:219-243`).
  - Default features added to **every** BetterEnd biome via `EndFeatures.addDefaultFeatures(id, biome, hasCaves)` (`EndFeatures.java:149-185`):
    - `RAW_GENERATION`: `betterend:crashed_ship` (only when `hasCaves == true`)
    - `LOCAL_MODIFICATIONS`: `betterend:tunel_cave` (`TUNEL_CAVE` feature)
    - `UNDERGROUND_STRUCTURES`: `betterend:round_cave` (removed in 26.3 in favor of carvers; only `tunel_cave` or carvers apply)
    - `UNDERGROUND_ORES`: `betterend:ender_ore`, `betterend:amber_ore`, `betterend:thallasium_ore`, `betterend:flavolite_layer`, `betterend:violecite_layer`
    - `UNDERGROUND_DECORATION`: `betterend:cave_surface_coat` (sweeps every chunk to coat cave walls/floors/ceilings when a column's cave biome is an `EndCaveBiome`)
    - Global biome modifications (`wover/worldgen/biome_modifications/betterend/global/`):
      - `default_silk_moth_nest` (`VEGETAL_DECORATION`: `betterend:silk_moth_nest` in all `#c:is_end` biomes)
      - `eternal_portal_end_land` (adds `betterend:eternal_portal` structure to `#wover:is_end/land`, `#wover:is_end/highland`, `#wover:is_end/midland`)

---

### 1.2 Master Table of All 27 Regions (Parameters, Placement, Parent Links & Colors)

| # | Biome ID (`betterend:*`) | Java Class (`world/biome/...`) | Layer / Category | `intended_placement` Tag | `parent` | `genChance` | `fogDensity` | `terrainHeight` | `has_caves` | Fog Color | Water / Water Fog Color | Foliage / Grass Color |
|---|---|---|---|---|---|---:|---:|---:|---|---|---|---|
| 1 | `foggy_mushroomland` | `land/FoggyMushroomlandBiome.java:26-102` | Land (Main) | `wover:is_end/land` | — | `1.25` | `3.0` | `1.0` | `true` | `2697542` (`#292246`) | `7719913` / `7719913` | `4838282` / `4838282` |
| 2 | `chorus_forest` | `land/ChorusForestBiome.java:24-81` | Land (Main) | `wover:is_end/highland` | — | `1.25` | `1.5` | `1.0` | `true` | `5713496` (`#572e58`) | `4860006` / `4860006` | `7619708` / `7619708` |
| 3 | `dust_wastelands` | `land/DustWastelandsBiome.java:20-59` | Land (Main) | `wover:is_end/midland` | — | `1.25` | `2.0` | `1.5` | `true` | `14866596` (`#e2d9a4`) | `16771759` / `16771759` | `10526880` |
| 4 | `megalake` | `land/MegalakeBiome.java:24-82` | Land (Main) | `wover:is_end/land` | — | `1.25` | `1.75` | `0.0` | `true` | `11657983` (`#b1e2ff`) | `6333183` / `6333183` | `4838282` / `4838282` |
| 5 | `megalake_grove` | `land/MegalakeGroveBiome.java:25-77` | **Sub-Biome** | *(via parent)* | `betterend:megalake` | `1.25` | `2.0` | `0.0` | `true` | `11657983` (`#b1e2ff`) | `6333183` / `6333183` | `4838282` / `4838282` |
| 6 | `crystal_mountains` | `land/CrystalMountainsBiome.java:20-55` | Land (Main) | `wover:is_end/land` | — | `1.25` | `1.0` | `1.0` | `true` | `10536426` (`#a0c5ea`) | `4159204` / `329011` | `16743826` / `16743826` |
| 7 | `painted_mountains` | `land/PaintedMountainsBiome.java:21-55` | **Sub-Biome** | *(via parent)* | `betterend:dust_wastelands` | `1.25` | `2.0` | `1.0` | `true` | `14866596` (`#e2d9a4`) | `16771759` / `16771759` | `10526880` |
| 8 | `shadow_forest` | `land/ShadowForestBiome.java:25-79` | Land (Main) | `wover:is_end/land` | — | `1.25` | `2.5` | `1.0` | `true` | `0` (`#000000`) | `2762052` / `2762052` | `2959661` / `2959661` |
| 9 | `amber_land` | `land/AmberLandBiome.java:25-88` | Land (Main) | `wover:is_end/land` | — | `1.25` | `2.0` | `1.0` | `true` | `16758016` (`#ff9500`) | `9533159` / `9533159` | `14384402` / `14384402` |
| 10 | `blossoming_spires` | `land/BlossomingSpiresBiome.java:24-75` | Land (Main) | `wover:is_end/land` | — | `1.25` | `1.7` | `1.0` | `true` | `9866914` (`#968ea2`) | `4159204` / `329011` | `7619708` / `7619708` |
| 11 | `sulphur_springs` | `land/SulphurSpringsBiome.java:26-84` | Land (Main) | `wover:is_end/land` | — | `1.25` | `1.5` | `1.0` | `true` | `13616430` (`#cfbe2e`) | `1635473` / `1989677` | `10526880` |
| 12 | `umbrella_jungle` | `land/UmbrellaJungleBiome.java:25-92` | Land (Main) | `wover:is_end/land` | — | `1.25` | `2.0` | `1.0` | `true` | `5758165` (`#57dd55`) | `7853304` / `7853304` | `1816254` / `1816254` |
| 13 | `glowing_grasslands` | `land/GlowingGrasslandsBiome.java:24-84` | Land (Main) | `wover:is_end/land` | — | `1.25` | `1.3` | `1.0` | `true` | `6550254` (`#63f3ee`) | `6077136` / `6077136` | `4838282` / `4838282` |
| 14 | `dragon_graveyards` | `land/DragonGraveyardsBiome.java:23-69` | Land (Main) | `wover:is_end/land` | — | `0.25` | `1.3` | `1.0` | `true` | `16002379` (`#f42d4b`) | `13324583` / `13324583` | `10955059` / `10955059` |
| 15 | `dry_shrubland` | `land/DryShrublandBiome.java:22-70` | Land (Main) | `wover:is_end/land` | — | `1.25` | `1.0` | `1.0` | `true` | `13852459` (`#d35f2b`) | `4159204` / `329011` | `14443295` / `14443295` |
| 16 | `lantern_woods` | `land/LanternWoodsBiome.java:25-83` | Land (Main) | `wover:is_end/land` | — | `1.25` | `1.1` | `1.0` | `true` | `12405622` (`#bd4b76`) | `11238280` / `11238280` | `16746537` / `16746537` |
| 17 | `neon_oasis` | `land/NeonOasisBiome.java:26-79` | **Sub-Biome** | *(via parent)* | `betterend:dust_wastelands` | `0.625` | `2.0` | `1.0` | `true` | `14866596` (`#e2d9a4`) | `6998483` / `6998483` | `10526880` |
| 18 | `umbra_valley` | `land/UmbraValleyBiome.java:24-75` | Land (Main) | `wover:is_end/land` | — | `1.25` | `1.0` | `1.0` | `true` | `6579300` (`#646464`) | `4552814` / `4552814` | `11329240` / `11329240` |
| 19 | `ice_starfield` | `air/BiomeIceStarfield.java:20-61` | Void / Aerial | `wover:is_end/small_island` | — | `0.5` | `2.2` | `1.0` | `false` | `14737918` (`#e0e1fe`) | `4159204` / `329011` | `12699645` / `12699645` |
| 20 | `flower_islets` | `air/FlowerIsletsBiome.java:22-75` | Void / Aerial | `wover:is_end/small_island` | — | `0.5` | `1.4` | `1.0` | `false` | `12405622` (`#bd4b76`) | `11238280` / `11238280` | `16746537` / `16746537` |
| 21 | `waterfall_ponds` | `air/WaterfallPondsBiome.java:23-85` | Void / Aerial | `wover:is_end/small_island` | — | `0.5` | `1.5` | `1.0` | `false` | `6550254` (`#63f3ee`) | `6333183` / `6333183` | `4838282` / `4838282` |
| 22 | `empty_end_cave` | `cave/EmptyEndCaveBiome.java:16-39` | Cave | `betterend:is_end_cave` | — | `1.25` | `2.0` | `0.1` | `false` | `10518688` (`#a080a0`) | `4159204` / `329011` | `10526880` |
| 23 | `empty_smaragdant_cave` | `cave/EmptySmaragdantCaveBiome.java:18-45` | Cave | `betterend:is_end_cave` | — | `1.25` | `2.0` | `1.0` | `false` | `20312` (`#004f58`) | `2038932` / `2038932` | `10526880` |
| 24 | `lush_smaragdant_cave` | `cave/LushSmaragdantCaveBiome.java:21-52` | Cave | `betterend:is_end_cave` | — | `1.25` | `2.0` | `1.0` | `false` | `20312` (`#004f58`) | `2038932` / `2038932` | `10526880` |
| 25 | `empty_aurora_cave` | `cave/EmptyAuroraCaveBiome.java:20-52` | Cave | `betterend:is_end_cave` | — | `1.25` | `2.0` | `1.0` | `false` | `9840791` (`#962897`) | `12212655` / `12212655` | `10526880` |
| 26 | `lush_aurora_cave` | `cave/LushAuroraCaveBiome.java:25-65` | Cave | `betterend:is_end_cave` | — | `1.25` | `2.0` | `1.0` | `false` | `9840791` (`#962897`) | `12212655` / `12212655` | `10526880` |
| 27 | `jade_cave` | `cave/JadeCaveBiome.java:22-68` | Cave | `betterend:is_end_cave` | — | `1.25` | `2.0` | `0.1` | `false` | `7784289` (`#76c761`) | `6005091` / `6005091` | `10526880` |

> **Note on `genChance` multiplier**: In `EndBiomesProvider.java:53`, datagen multiplies every biome's class-level `genChance` by `1.25f` (`builder.genChance(biome.getGenChance() * 1.25f)`). Thus `1.0f` in Java becomes `1.25` in `wover/worldgen/biome_data/*.json`, `0.5f` (`neon_oasis`) becomes `0.625`, `0.2f` (`dragon_graveyards`) becomes `0.25`, and `0.4f` (`ice_starfield`/`flower_islets`/`waterfall_ponds`) becomes `0.5`.

---

### 1.3 Detailed Per-Biome Specification (Surface Rules, Particles, Audio, Spawns, Carvers, Structures, Features)

#### A. 15 Main Surface Land Biomes + 3 Sub-Biomes

1. **`betterend:foggy_mushroomland`** (`FoggyMushroomlandBiome.java:26-102`, `worldgen/biome/foggy_mushroomland.json`)
   - **Surface Rule**: `DoubleBlockSurfaceNoiseCondition.FOGGY_MUSHROOMLAND` (`DoubleBlockSurfaceNoiseCondition.java:20`, threshold `0.0`): `ON_FLOOR` switches between `betterend:end_moss` (`noise > 0`) and `betterend:end_mycelium` (`noise <= 0`).
   - **Particles**: `betterend:glowing_sphere` (`probability = 0.001`).
   - **Audio**: Loop `betterend:betterend.ambient.foggy_mushroomland`, Music `betterend:betterend.music.forest`, Mood `minecraft:ambient.cave`.
   - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
   - **Structures**: `betterend:giant_mossy_glowshroom` (`SURFACE_STRUCTURES`), `betterend:end_lake` (`LAKES`), `betterend:eternal_portal` (`RAW_GENERATION`).
   - **Features**:
     - `RAW_GENERATION`: `crashed_ship`
     - `LOCAL_MODIFICATIONS`: `tunel_cave`
     - `UNDERGROUND_ORES`: `ender_ore`, `amber_ore`, `thallasium_ore`, `flavolite_layer`, `violecite_layer`
     - `UNDERGROUND_DECORATION`: `cave_surface_coat`
     - `VEGETAL_DECORATION`: `mossy_glowshroom`, `blue_vine`, `umbrella_moss`, `creeping_moss`, `dense_vine`, `cyan_moss`, `cyan_moss_wood`, `end_lily`, `bubble_coral`, `charnia_cyan`, `charnia_light_blue`, `charnia_red_rare`, `silk_moth_nest`
   - **Spawns**: `betterend:dragonfly` (`ambient`, wt=50, 1..3), `betterend:end_fish` (`water_ambient`, wt=20, 2..5), `betterend:cubozoa` (`water_ambient`, wt=10, 3..8), `betterend:end_slime` (`monster`, wt=10, 1..2), `minecraft:enderman` (`monster`, wt=10, 1..2).

2. **`betterend:chorus_forest`** (`ChorusForestBiome.java:24-81`, `worldgen/biome/chorus_forest.json`)
   - **Surface Rule**: `ON_FLOOR` -> `betterend:chorus_nylium`.
   - **Particles**: `minecraft:portal` (`probability = 0.01`).
   - **Audio**: Loop `betterend:betterend.ambient.chorus_forest`, Music `betterend:betterend.music.dark`, Mood `minecraft:ambient.cave`.
   - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
   - **Structures**: `betterend:end_lake_rare` (`LAKES`), `betterend:eternal_portal` (`RAW_GENERATION`).
   - **Features** (`VEGETAL_DECORATION`): `pythadendron_tree`, `pythadendron_bush`, `purple_polypore`, `minecraft:chorus_plant` (2 placements: `chorus_plant_chorus_forest_*`), `chorus_grass`, `chorus_mushroom`, `tail_moss`, `tail_moss_wood`, `charnia_purple`, `charnia_red_rare`, `silk_moth_nest`.
   - **Spawns**: `betterend:end_slime` (`monster`, wt=5, 1..2), `minecraft:enderman` (`monster`, wt=50, 1..4).

3. **`betterend:dust_wastelands`** (`DustWastelandsBiome.java:20-59`, `worldgen/biome/dust_wastelands.json`)
   - **Surface Rule**: `ON_FLOOR` -> `betterend:endstone_dust`; `UNDER_FLOOR` (depth <= 4) -> `betterend:endstone_dust`.
   - **Particles**: `minecraft:white_ash` (`probability = 0.02`).
   - **Audio**: Loop `betterend:betterend.ambient.dust_wastelands`, Music `betterend:betterend.music.openpace`, Mood `minecraft:ambient.cave`.
   - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
   - **Structures**: `betterend:end_village` (`SURFACE_STRUCTURES`), `betterend:eternal_portal` (`RAW_GENERATION`).
   - **Features**: Only default ores/caves + `silk_moth_nest`.
   - **Spawns**: `minecraft:enderman` (`monster`, wt=50, 1..2).

4. **`betterend:megalake`** (`MegalakeBiome.java:24-82`, `worldgen/biome/megalake.json`)
   - **Surface Rule**: `DoubleBlockSurfaceNoiseCondition.MEGALAKE` (threshold `-0.1`): `ON_FLOOR` -> `betterend:end_moss` (`> -0.1`) or `betterend:endstone_dust` (`<= -0.1`).
   - **Particles**: None.
   - **Audio**: Loop `betterend:betterend.ambient.megalake`, Music `betterend:betterend.music.water`, Mood `minecraft:ambient.cave`.
   - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
   - **Structures**: `betterend:megalake` (`LAKES`), `betterend:eternal_portal` (`RAW_GENERATION`).
   - **Features** (`VEGETAL_DECORATION`): `bubble_coral_rare`, `end_lotus`, `end_lotus_leaf`, `end_lily_rare`, `umbrella_moss`, `creeping_moss`, `peat_grass`, `cyan_moss`, `cyan_moss_wood`, `menger_sponge`, `charnia_cyan`, `charnia_light_blue`, `charnia_red_rare`, `silk_moth_nest`.
   - **Spawns**: `betterend:dragonfly` (`ambient`, wt=50, 1..3), `betterend:end_fish` (`water_ambient`, wt=50, 2..5), `betterend:cubozoa` (`water_ambient`, wt=50, 3..8), `betterend:end_slime` (`monster`, wt=5, 1..2), `minecraft:enderman` (`monster`, wt=10, 1..2).

5. **`betterend:megalake_grove`** (`MegalakeGroveBiome.java:25-77`, `worldgen/biome/megalake_grove.json`) — **Sub-Biome of `betterend:megalake`**
   - **Surface Rule**: `ON_FLOOR` -> `betterend:end_moss`.
   - **Particles**: `betterend:glowing_sphere` (`probability = 0.001`).
   - **Audio**: Loop `betterend:betterend.ambient.megalake_grove`, Music `betterend:betterend.music.water`, Mood `minecraft:ambient.cave`.
   - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
   - **Structures**: `betterend:megalake_small` (`LAKES`).
   - **Features** (`VEGETAL_DECORATION`): `lacugrove`, `end_lotus`, `end_lotus_leaf`, `bubble_coral_rare`, `end_lily_rare`, `umbrella_moss`, `creeping_moss`, `peat_grass`, `cyan_moss`, `cyan_moss_wood`, `menger_sponge`, `charnia_cyan`, `charnia_light_blue`, `charnia_red_rare`, `silk_moth_nest`.
   - **Spawns**: `betterend:dragonfly` (`ambient`, wt=20, 1..3), `betterend:end_fish` (`water_ambient`, wt=20, 2..5), `betterend:cubozoa` (`water_ambient`, wt=50, 3..8), `betterend:end_slime` (`monster`, wt=5, 1..2), `minecraft:enderman` (`monster`, wt=10, 1..2).

6. **`betterend:crystal_mountains`** (`CrystalMountainsBiome.java:20-55`, `worldgen/biome/crystal_mountains.json`)
   - **Surface Rule**: `ON_FLOOR` -> `betterend:crystal_moss`.
   - **Particles**: None.
   - **Audio**: Music `betterend:betterend.music.openpace`, Mood `minecraft:ambient.cave`.
   - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
   - **Structures**: `betterend:mountain` (`RAW_GENERATION`), `betterend:eternal_portal` (`RAW_GENERATION`).
   - **Features**:
     - `RAW_GENERATION`: `round_cave` (biome-specific raw feature), `crashed_ship`
     - `VEGETAL_DECORATION`: `crystal_grass`, `silk_moth_nest`
   - **Spawns**: `minecraft:enderman` (`monster`, wt=50, 1..2).

7. **`betterend:painted_mountains`** (`PaintedMountainsBiome.java:21-55`, `worldgen/biome/painted_mountains.json`) — **Sub-Biome of `betterend:dust_wastelands`**
   - **Surface Rule**: `ON_FLOOR` -> `betterend:endstone_dust`.
   - **Particles**: `minecraft:white_ash` (`probability = 0.01`).
   - **Audio**: Loop `betterend:betterend.ambient.dust_wastelands`, Music `betterend:betterend.music.openpace`, Mood `minecraft:ambient.cave`.
   - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
   - **Structures**: `betterend:painted_mountain` (`RAW_GENERATION`).
   - **Features**: Default ores/caves + `silk_moth_nest`.
   - **Spawns**: `minecraft:enderman` (`monster`, wt=50, 1..2).

8. **`betterend:shadow_forest`** (`ShadowForestBiome.java:25-79`, `worldgen/biome/shadow_forest.json`)
   - **Surface Rule**: `ON_FLOOR` -> `betterend:shadow_grass`.
   - **Particles**: `minecraft:mycelium` (`probability = 0.01`).
   - **Audio**: Loop `betterend:betterend.ambient.shadow_forest`, Music `betterend:betterend.music.dark`, Mood `minecraft:ambient.cave`.
   - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
   - **Structures**: `betterend:end_lake_rare` (`LAKES`), `betterend:eternal_portal` (`RAW_GENERATION`).
   - **Features** (`VEGETAL_DECORATION`): `dragon_tree`, `dragon_tree_bush`, `shadow_plant`, `murkweed`, `needlegrass`, `shadow_berry`, `twisted_vine`, `purple_polypore`, `tail_moss`, `tail_moss_wood`, `charnia_purple`, `charnia_red_rare`, `silk_moth_nest`.
   - **Spawns**: `betterend:shadow_walker` (`monster`, wt=80, 2..4), `minecraft:enderman` (`monster`, wt=40, 1..4), `minecraft:phantom` (`monster`, wt=1, 1..2).

9. **`betterend:amber_land`** (`AmberLandBiome.java:25-88`, `worldgen/biome/amber_land.json`)
   - **Surface Rule**: `ON_FLOOR` -> `betterend:amber_moss`.
   - **Particles**: `betterend:amber_sphere` (`probability = 0.001`).
   - **Audio**: Loop `betterend:betterend.ambient.amber_land`, Music `betterend:betterend.music.forest`, Mood `minecraft:ambient.cave`.
   - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
   - **Structures**: `betterend:end_lake` (`LAKES`), `betterend:eternal_portal` (`RAW_GENERATION`).
   - **Features**:
     - `RAW_GENERATION`: `amber_root` (arch feature), `crashed_ship`
     - `VEGETAL_DECORATION`: `helix_tree`, `lanceleaf`, `glow_pillar`, `amber_grass`, `amber_root_raw`, `bulb_moss`, `bulb_moss_wood`, `charnia_orange`, `charnia_red`, `silk_moth_nest`
   - **Spawns**: `betterend:end_fish` (`water_ambient`, wt=20, 2..5), `betterend:end_slime` (`monster`, wt=30, 1..2), `minecraft:enderman` (`monster`, wt=50, 1..4).

10. **`betterend:blossoming_spires`** (`BlossomingSpiresBiome.java:24-75`, `worldgen/biome/blossoming_spires.json`)
    - **Surface Rule**: `ON_FLOOR` -> `betterend:pink_moss`.
    - **Particles**: None.
    - **Audio**: Loop `betterend:betterend.ambient.blossoming_spires`, Music `betterend:betterend.music.forest`, Mood `minecraft:ambient.cave`.
    - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
    - **Structures**: `betterend:eternal_portal` (`RAW_GENERATION`).
    - **Features**:
      - `RAW_GENERATION`: `spire`, `floating_spire`, `crashed_ship`
      - `VEGETAL_DECORATION`: `tenanea`, `tenanea_bush`, `bulb_vine`, `bushy_grass`, `bushy_grass_wood`, `blossom_berry`, `twisted_umbrella_moss`, `twisted_umbrella_moss_small`, `silk_moth_nest`
    - **Spawns**: `betterend:silk_moth` (`ambient`, wt=5, 1..2), `minecraft:enderman` (`monster`, wt=50, 1..4).

11. **`betterend:sulphur_springs`** (`SulphurSpringsBiome.java:26-84`, `worldgen/biome/sulphur_springs.json`)
    - **Surface Rule**: `SulphuricSurfaceNoiseCondition` (`SulphuricSurfaceNoiseCondition.java:15-26`, OpenSimplexNoise seed `5123` at scale `0.03` + jiggle): switches `ON_FLOOR` between `betterend:flavolite` (`noise <= -0.1`) and `betterend:brimstone` (`noise > -0.1`).
    - **Particles**: `betterend:sulphur_particle` (`probability = 0.001`).
    - **Audio**: Loop `betterend:betterend.ambient.sulphur_springs`, Music `betterend:betterend.music.openpace`, Mood `minecraft:ambient.cave`.
    - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
    - **Structures**: `betterend:sulphuric_cave` (`RAW_GENERATION`), `betterend:eternal_portal` (`RAW_GENERATION`).
    - **Features**:
      - `RAW_GENERATION`: `geyser`, `sulphuric_lake`, `sulphuric_hill`, `crashed_ship`
      - `LAKES`: `surface_vent`
      - `VEGETAL_DECORATION`: `hydralux`, `charnia_green`, `charnia_orange`, `charnia_red_rare`, `silk_moth_nest`
    - **Spawns**: `betterend:end_fish` (`water_ambient`, wt=20, 2..5), `betterend:cubozoa` (`water_ambient`, wt=10, 3..8), `minecraft:enderman` (`monster`, wt=50, 1..4).

12. **`betterend:umbrella_jungle`** (`UmbrellaJungleBiome.java:25-92`, `worldgen/biome/umbrella_jungle.json`)
    - **Surface Rule**: `ON_FLOOR` -> `betterend:jungle_moss`.
    - **Particles**: `betterend:jungle_spore` (`probability = 0.001`).
    - **Audio**: Loop `betterend:betterend.ambient.umbrella_jungle`, Music `betterend:betterend.music.forest`, Mood `minecraft:ambient.cave`.
    - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
    - **Structures**: `betterend:end_lake` (`LAKES`), `betterend:eternal_portal` (`RAW_GENERATION`).
    - **Features** (`VEGETAL_DECORATION`): `umbrella_tree`, `jellyshroom`, `twisted_umbrella_moss`, `twisted_umbrella_moss_small`, `jungle_grass`, `small_jellyshroom_floor`, `cyan_moss`, `cyan_moss_wood`, `jungle_fern_wood`, `small_jellyshroom_wall`, `small_jellyshroom_wood`, `small_jellyshroom_ceil`, `jungle_vine`, `charnia_cyan`, `charnia_green`, `charnia_light_blue`, `charnia_red_rare`, `silk_moth_nest`.
    - **Spawns**: `betterend:dragonfly` (`ambient`, wt=50, 1..3), `betterend:end_fish` (`water_ambient`, wt=20, 2..5), `betterend:end_slime` (`monster`, wt=30, 1..2), `minecraft:enderman` (`monster`, wt=50, 1..4).

13. **`betterend:glowing_grasslands`** (`GlowingGrasslandsBiome.java:24-84`, `worldgen/biome/glowing_grasslands.json`)
    - **Surface Rule**: `ON_FLOOR` -> `betterend:end_moss`.
    - **Particles**: `betterend:firefly` (`probability = 0.001`).
    - **Audio**: Loop `betterend:betterend.ambient.glowing_grasslands`, Music `betterend:betterend.music.openpace`, Mood `minecraft:ambient.cave`.
    - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
    - **Structures**: `betterend:end_village` (`SURFACE_STRUCTURES`), `betterend:end_lake_rare` (`LAKES`), `betterend:eternal_portal` (`RAW_GENERATION`).
    - **Features** (`VEGETAL_DECORATION`): `lumecorn`, `blooming_cooksonia`, `salteago`, `vaiolush_fern`, `fracturn`, `umbrella_moss_rare`, `creeping_moss_rare`, `twisted_umbrella_moss_rare`, `cyan_moss`, `cyan_moss_wood`, `charnia_cyan`, `charnia_green`, `charnia_light_blue`, `charnia_red_rare`, `silk_moth_nest`.
    - **Spawns**: `betterend:dragonfly` (`ambient`, wt=50, 1..3), `betterend:silk_moth` (`ambient`, wt=5, 1..2), `minecraft:enderman` (`monster`, wt=50, 1..2).

14. **`betterend:dragon_graveyards`** (`DragonGraveyardsBiome.java:23-69`, `worldgen/biome/dragon_graveyards.json`)
    - **Surface Rule**: `ON_FLOOR` -> `betterend:sangnum`.
    - **Particles**: `betterend:firefly` (`probability = 0.0007`).
    - **Audio**: Loop `betterend:betterend.ambient.glowing_grasslands`, Music `betterend:betterend.music.dark`, Mood `minecraft:ambient.cave`.
    - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
    - **Structures**: `betterend:eternal_portal` (`RAW_GENERATION`).
    - **Features**:
      - `RAW_GENERATION`: `obsidian_pillar_basement`, `fallen_pillar`, `obsidian_boulder`, `dragon_bone_block_ore`, `crashed_ship`
      - `VEGETAL_DECORATION`: `gigantic_amaranita`, `large_amaranita`, `small_amaranita`, `globulagus`, `clawfern`, `sangnum_moss`, `silk_moth_nest`
    - **Spawns**: `minecraft:enderman` (`monster`, wt=50, 1..2).

15. **`betterend:dry_shrubland`** (`DryShrublandBiome.java:22-70`, `worldgen/biome/dry_shrubland.json`)
    - **Surface Rule**: `ON_FLOOR` -> `betterend:rutiscus`.
    - **Particles**: None.
    - **Audio**: Music `betterend:betterend.music.openpace`, Mood `minecraft:ambient.cave`.
    - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
    - **Structures**: `betterend:eternal_portal` (`RAW_GENERATION`).
    - **Features** (`VEGETAL_DECORATION`): `lucernia_bush_rare`, `orango`, `aeridium`, `lutebus`, `lamellarium`, `ruscus`, `silk_moth_nest`.
    - **Spawns**: `minecraft:enderman` (`monster`, wt=50, 1..2).

16. **`betterend:lantern_woods`** (`LanternWoodsBiome.java:25-83`, `worldgen/biome/lantern_woods.json`)
    - **Surface Rule**: `DoubleBlockSurfaceNoiseCondition.LANTERN_WOODS` (threshold `-0.1`): `ON_FLOOR` -> `betterend:rutiscus` or `betterend:end_moss`.
    - **Particles**: `betterend:glowing_sphere` (`probability = 0.001`).
    - **Audio**: Loop `betterend:betterend.ambient.lantern_woods`, Music `betterend:betterend.music.forest`, Mood `minecraft:ambient.cave`.
    - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
    - **Structures**: `betterend:end_lake_normal` (`LAKES`), `betterend:eternal_portal` (`RAW_GENERATION`).
    - **Features** (`VEGETAL_DECORATION`): `flamaea`, `lucernia`, `lucernia_bush`, `filalux`, `aeridium`, `lamellarium`, `bolux_mushroom`, `auranode`, `pond_anemone`, `charnia_orange`, `charnia_red`, `ruscus`, `ruscus_wood`, `silk_moth_nest`.
    - **Spawns**: `minecraft:enderman` (`monster`, wt=50, 1..2).

17. **`betterend:neon_oasis`** (`NeonOasisBiome.java:26-79`, `worldgen/biome/neon_oasis.json`) — **Sub-Biome of `betterend:dust_wastelands`**
    - **Surface Rule**: `DoubleBlockSurfaceNoiseCondition.NEON_OASIS` (threshold `0.0`): `ON_FLOOR` -> `betterend:end_moss` (`> 0`) or `betterend:endstone_dust` (`<= 0`); `UNDER_FLOOR` (depth <= 4) -> `betterend:endstone_dust`.
    - **Particles**: `minecraft:white_ash` (`probability = 0.01`).
    - **Audio**: Loop `betterend:betterend.ambient.dust_wastelands`, Music `betterend:betterend.music.water`, Mood `minecraft:ambient.cave`.
    - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
    - **Structures**: `betterend:eternal_portal` (`RAW_GENERATION`).
    - **Features**:
      - `RAW_GENERATION`: `desert_lake`, `crashed_ship`
      - `VEGETAL_DECORATION`: `neon_cactus`, `umbrella_moss`, `creeping_moss`, `charcoal_grass`, `charnia_green`, `charnia_cyan`, `charnia_red`, `silk_moth_nest`
    - **Spawns**: `minecraft:enderman` (`monster`, wt=50, 1..2).

18. **`betterend:umbra_valley`** (`UmbraValleyBiome.java:24-75`, `worldgen/biome/umbra_valley.json`)
    - **Surface Rule**: `UmbraSurfaceNoiseCondition` (`UmbraSurfaceNoiseCondition.java:18-45`, OpenSimplexNoise seed `1512` at scale `0.03` + jiggle): switches `ON_FLOOR` across 5 concentric thresholds: `pallidium_full` (`> 0.4`), `pallidium_heavy` (`> 0.15`), `pallidium_thin` (`> -0.15`), `pallidium_tiny` (`> -0.4`), and `umbralith` (`<= -0.4`); `UNDER_FLOOR` (`CEILING: false`, depth <= 20) -> `betterend:umbralith`.
    - **Particles**: `betterend:amber_sphere` (`probability = 0.0001`).
    - **Audio**: Loop `betterend:betterend.ambient.umbra_valley`, Music `betterend:betterend.music.umbra_valley`, Mood `minecraft:ambient.cave`.
    - **Carvers**: `betterend:end_cave`, `betterend:end_CAVE_LARGE`.
    - **Structures**: `betterend:eternal_portal` (`RAW_GENERATION`).
    - **Features**:
      - `RAW_GENERATION`: `umbralith_arch`, `thin_umbralith_arch`, `crashed_ship`
      - `VEGETAL_DECORATION`: `inflexia`, `flammalix`, `silk_moth_nest`
    - **Spawns**: `minecraft:enderman` (`monster`, wt=50, 1..2), `minecraft:phantom` (`monster`, wt=1, 1..2).

---

#### B. 3 Aerial / Void Small-Island Biomes (`wover:is_end/small_island`, `has_caves = false`)

19. **`betterend:ice_starfield`** (`BiomeIceStarfield.java:20-61`, `worldgen/biome/ice_starfield.json`)
    - **Surface Rule**: None (void biome; terrain is formed entirely by `giant_ice_star` and `ice_star_*` features).
    - **Particles**: `betterend:snowflake` (`probability = 0.002`).
    - **Audio**: Music `betterend:betterend.music.openpace`, Mood `minecraft:ambient.cave`.
    - **Structures**: `betterend:giant_ice_star` (`SURFACE_STRUCTURES`).
    - **Features**:
      - `RAW_GENERATION`: `ice_star`, `ice_star_small`
      - `VEGETAL_DECORATION`: `silk_moth_nest`
    - **Spawns**: `minecraft:enderman` (`monster`, wt=20, 1..4).

20. **`betterend:flower_islets`** (`FlowerIsletsBiome.java:22-75`, `worldgen/biome/flower_islets.json`)
    - **Surface Rule**: None (`SmallIslandStructure` paints its own top coat of `sangnum`, `pallidium_full/heavy/thin/tiny`, and `umbralith`).
    - **Particles**: `betterend:glowing_sphere` (`probability = 0.001`).
    - **Audio**: Loop `betterend:betterend.ambient.lantern_woods`, Music `betterend:betterend.music.forest`, Mood `minecraft:ambient.cave`.
    - **Structures**: `betterend:small_island` (`RAW_GENERATION`), `betterend:end_bridge` (`SURFACE_STRUCTURES`).
    - **Features** (`VEGETAL_DECORATION`): `amaranita_patch`, `large_amaranita`, `small_amaranita`, `aeridium`, `lamellarium`, `bolux_mushroom`, `auranode`, `orango`, `globulagus`, `clawfern`, `inflexia`, `flammalix`, `ruscus`, `silk_moth_nest`.
    - **Spawns**: `betterend:silk_moth` (`ambient`, wt=5, 1..2), `minecraft:enderman` (`monster`, wt=20, 1..2).

21. **`betterend:waterfall_ponds`** (`WaterfallPondsBiome.java:23-85`, `worldgen/biome/waterfall_ponds.json`)
    - **Surface Rule**: None (`SmallIslandStructure` paints `end_moss` top coat + hanging `end_stone_stalactite`).
    - **Particles**: `betterend:firefly` (`probability = 0.001`).
    - **Audio**: Loop `betterend:betterend.ambient.megalake`, Music `betterend:betterend.music.water`, Mood `minecraft:ambient.cave`.
    - **Structures**: `betterend:small_island` (`RAW_GENERATION`), `betterend:end_bridge` (`SURFACE_STRUCTURES`).
    - **Features**:
      - `LAKES`: `pond_with_waterfall`
      - `VEGETAL_DECORATION`: `dragon_helix_tree`, `lumecorn`, `blooming_cooksonia`, `salteago`, `vaiolush_fern`, `fracturn`, `umbrella_moss`, `creeping_moss`, `cyan_moss`, `silk_moth_nest`
    - **Spawns**: `betterend:dragonfly` (`ambient`, wt=30, 1..3), `betterend:end_fish` (`water_ambient`, wt=20, 2..5), `minecraft:enderman` (`monster`, wt=20, 1..2).

---

#### C. 6 Cave Biomes (`betterend:is_end_cave`, `has_caves = false`)
All 6 cave biomes extend `EndCaveBiome` (`world/biome/cave/EndCaveBiome.java:30-154`), share `intended_placement = "betterend:is_end_cave"`, `genChance = 1.25`, `fogDensity = 2.0`, loop sound `betterend:betterend.ambient.caves`, music `betterend:betterend.music.caves`, carver `betterend:end_cave`, and `minecraft:enderman` (`wt=1, 1..1`). Their surfaces are coated during `UNDERGROUND_DECORATION` by `CaveSurfaceCoatFeature` (`shellDepth = 5`, `minY = 4`, `maxY = 72`):

22. **`betterend:empty_end_cave`** (`EmptyEndCaveBiome.java:16-39`):
    - `terrainHeight = 0.1`, `wall = null`, `top = end_stone`, `ceil = null`.
    - **Features** (`UNDERGROUND_DECORATION`): `cave_surface_coat`, `end_stone_stalactite`, `end_stone_stalagmite`, `end_stone_stalactite_cluster`.
23. **`betterend:empty_smaragdant_cave`** (`EmptySmaragdantCaveBiome.java:18-45`):
    - `terrainHeight = 1.0`, `wall = null`, `top = end_stone`, `ceil = null`.
    - **Particles**: `betterend:smaragdant` (`probability = 0.001`).
    - **Features** (`UNDERGROUND_DECORATION`): `cave_surface_coat`, `smaragdant_crystal`, `smaragdant_crystal_shard`.
24. **`betterend:lush_smaragdant_cave`** (`LushSmaragdantCaveBiome.java:21-52`):
    - `terrainHeight = 1.0`, `wall = null`, `top = betterend:cave_moss`, `ceil = betterend:cave_moss`.
    - **Particles**: `betterend:smaragdant` (`probability = 0.001`).
    - **Features** (`UNDERGROUND_DECORATION`): `cave_surface_coat`, `smaragdant_crystal`, `smaragdant_crystal_shard`, `cave_lush_smaragdant_floor`, `cave_lush_smaragdant_ceil`, `end_stone_stalactite_cavemoss`, `end_stone_stalagmite_cavemoss`, `end_stone_stalactite_cavemoss_cluster`, `cave_grass`, `rubinea`.
25. **`betterend:empty_aurora_cave`** (`EmptyAuroraCaveBiome.java:20-52`):
    - `terrainHeight = 1.0`, `wall = null`, `top = end_stone`, `ceil = null`.
    - **Particles**: `betterend:glowing_sphere` (`probability = 0.0005`).
    - **Features** (`UNDERGROUND_DECORATION`): `cave_surface_coat`, `big_aurora_crystal`, `end_stone_stalactite`, `end_stone_stalagmite`, `end_stone_stalactite_cluster`.
26. **`betterend:lush_aurora_cave`** (`LushAuroraCaveBiome.java:25-65`):
    - `terrainHeight = 1.0`, `wall = null`, `top = betterend:cave_moss`, `ceil = betterend:cave_moss`.
    - **Particles**: `betterend:glowing_sphere` (`probability = 0.001`).
    - **Features** (`UNDERGROUND_DECORATION`): `cave_surface_coat`, `big_aurora_crystal`, `cave_bush`, `cave_grass`, `end_stone_stalactite_cavemoss`, `end_stone_stalagmite_cavemoss`, `end_stone_stalactite_cavemoss_cluster`, `cave_lush_aurora_floor`, `cave_lush_aurora_ceil`, `rubinea`, `magnula`, `cave_pumpkin`.
27. **`betterend:jade_cave`** (`JadeCaveBiome.java:22-68`):
    - `terrainHeight = 0.1`, `top = end_stone`, `ceil = null`.
    - **Noise-Banded Wall Material** (`JadeCaveBiome.java:43-67`): Uses two static `OpenSimplexNoise` fields (`WALL_NOISE = new OpenSimplexNoise(9283)`, `DEPTH_NOISE = new OpenSimplexNoise(37451)`):
      - `depth = DEPTH_NOISE.eval(pos.getX() * 0.02, pos.getZ() * 0.02) * 0.2 + 0.5`
      - `index = Mth.floor((pos.getY() + WALL_NOISE.eval(pos.getX() * 0.1, pos.getZ() * 0.1) * (depth * 15)) / (depth * 5))`
      - `index = MHelper.mod(index, 3)` -> returns `VIRID_JADESTONE` (`0`), `AZURE_JADESTONE` (`1`), or `SANDY_JADESTONE` (`2`) source block.
    - **Features** (`UNDERGROUND_DECORATION`): `cave_surface_coat`.

---

## 2. WorldWeaver (Wover) & BetterEnd Biome Selection, Sub-Biomes, Vertical Layers & Island Terrain

### 2.1 Wover End Biome Source & Layer Decider Pipeline
Disassembled from `de.ambertation.wover.generator.impl.biomesource.end.WoverEndBiomeSource`, `TheEndBiomesHelper`, `WoverBiomePicker`, `HexBiomeMap`, and `HexBiomeChunk`, combined with `world/generator/{EndLandBiomeDecider,CaveBiomeDecider,GeneratorOptions}.java`:

1. **Configuration (`WoverEndConfig.DEFAULT` / `GeneratorOptions.java:23-98`)**:
   - `mapVersion = HEX` (`HexBiomeMap`)
   - `generatorVersion = PAULEVS` (`customGenerator = true`)
   - `withVoidBiomes = true` (small island / void ring biomes enabled)
   - `innerVoidRadiusSquared = 1048576` (`1024` blocks radius; in chunk coords `chunkX^2 + chunkZ^2 <= 4096`, `getEndSizeSqr() = 4096`)
   - `centerBiomesSize = 256`, `voidBiomesSize = 256`, `landBiomesSize = 256`, `barrensBiomesSize = 256`
   - `caveBiomesSize = 128` (`CaveBiomeDecider.java:37`)
   - `caveBiomesTopY = 48`, `caveBiomesTopJitter = 8` (`GeneratorConfig.java:27-35`, `GeneratorOptions.java:63-64`)

2. **3D Biome Resolution (`WoverEndBiomeSource.getNoiseBiome(quartX, quartY, quartZ, sampler)`)**:
   - Let `blockX = quartX << 2`, `blockY = quartY << 2`, `blockZ = quartZ << 2`, and `chunkX = quartX >> 2`, `chunkZ = quartZ >> 2`.
   - **Step 1 — Inner Dragon Island + Ring Check**:
     - If `chunkX * chunkX + chunkZ * chunkZ <= 4096L` (within 1024 blocks of `(0,0)`):
       - In `PAULEVS` mode (`GeneratorOptions.isCentralIsland(quartX >> 1, quartZ >> 1)` -> `x^2 + z^2 < 6400` in 8-block cells = 640 blocks), the central island sits inside the 1024-block radius and receives `centerBiomeMap.getBiome(blockX, 0, blockZ)` (vanilla `minecraft:the_end`).
   - **Step 2 — Surface / Void Biome Decider (`EndLandBiomeDecider.java:36-74` + `WoverEndBiomeSource`)**:
     - In `PAULEVS` generator mode:
       - `EndLandBiomeDecider` (`priority = 100.0`) runs for `HIGHLAND` and `MIDLAND` requests:
         - Calls `TerrainGenerator.isLand(quartX, quartZ)` (`TerrainGenerator.java:203-223`, which checks `x = quartX >> 1, z = quartZ >> 1` on the 8-block `TerrainBoolCache` grid).
         - If `TerrainGenerator.isLand(quartX, quartZ)` is **true**: returns `betterend:is_end/high_or_midland`, which picks from `endLandBiomeMap` (`size = 256`), populated from `#wover:is_end/highland` (`chorus_forest`, `minecraft:end_highlands`), `#wover:is_end/midland` (`dust_wastelands`, `minecraft:end_midlands`), and `#wover:is_end/land` (the other 13 BetterEnd land biomes).
         - If `TerrainGenerator.isLand(quartX, quartZ)` is **false**: returns `BiomeDecider.Result.DEFAULT`, falling back to vanilla erosion density at `(blockX, blockY, blockZ)`:
           - `erosion > 0.25`: `endLandBiomeMap` (`highland`)
           - `erosion > -0.0625`: `endMidlandBiomeMap` (`midland`)
           - `erosion < -0.21875`: `voidBiomeMap` (`size = 256`, populated from `#wover:is_end/small_island`: `minecraft:small_end_islands`, `betterend:ice_starfield`, `betterend:flower_islets`, `betterend:waterfall_ponds`)
           - `-0.21875 <= erosion <= -0.0625`: `endBarrensMap` (`size = 256`, `minecraft:end_barrens`)
   - **Step 3 — Vertical Cave Layer Override (`CaveBiomeDecider.java:61-86`)**:
     - Registered at `priority = 100.0` for `betterend:cave_layer`.
     - Triggered **after** the surface/void biome `assignedBiome` is chosen for `(quartX, quartZ)`:
     - Checks `EndBiome.getHasCaves(assignedBiome)` (`EndBiome.java:108-115`): returns `true` ONLY for the 15 main land biomes, 3 sub-biomes, and vanilla `end_highlands`/`end_midlands`; returns `false` for all void/aerial biomes (`ice_starfield`, `flower_islets`, `waterfall_ponds`, `small_end_islands`, `the_end`, `end_barrens`).
     - Checks vertical band:
       - `quartY > 0` (`blockY >= 4`)
       - `maxY = caveBiomesTopY + yNoise.eval(quartX * 0.08, quartZ * 0.08) * caveBiomesTopJitter` where `caveBiomesTopY = 48`, `caveBiomesTopJitter = 8`, and `yNoise = new OpenSimplexNoise((seed + "cave_y").hashCode())`.
       - `quartMaxY = QuartPos.fromBlock((int) Math.round(maxY))` (roughly `quartY < 10..14`, i.e., `blockY < 40..56`).
     - If `quartY > 0 && quartY < quartMaxY`: overrides the biome with `caveBiomeMap.getBiome(quartX << 2, quartY << 2, quartZ << 2).biome` (`size = 128`, picking from the 6 BetterEnd cave biomes, all weight `1.25`).

---

### 2.2 Exact `HexBiomeMap`, `HexBiomeChunk`, Sub-Biome & Edge Math
Disassembled from `de.ambertation.wover.generator.impl.map.hex.{HexBiomeMap,HexBiomeChunk}` and `WoverBiomePicker`:

1. **Scale & Distortion Parameters (`HexBiomeMap.<init>`)**:
   - `scale = HexBiomeChunk.scaleMap(size) = size / 8.0f` (for `size = 256`, `scale = 32.0f`; for `caveBiomesSize = 128`, `scale = 16.0f`).
   - `noiseIterations = (byte) Math.min(Math.ceil(Math.log(scale) / Math.log(2.0)), 5.0)` (`5` for `scale=32`, `4` for `scale=16`).
   - Two `OpenSimplexNoise` instances seeded from `new WorldgenRandom(new LegacyRandomSource(seed))`: `noises[0] = new OpenSimplexNoise(rand.nextInt())`, `noises[1] = new OpenSimplexNoise(rand.nextInt())`.
   - Constants: `RAD_INNER = sqrt(3.0) * 0.5f = 0.8660254f`, `COEF = 0.25f * sqrt(3.0) = 0.4330127f`, `COEF_HALF = COEF * 0.5f = 0.21650635f`, `SIN = sin(0.4) = 0.38941834f`, `COS = cos(0.4) = 0.92106099f`.

2. **Coordinate Transform (`HexBiomeMap.getRawBiome(x, z)`)**:
   - `px = (x / scale) * RAD_INNER`
   - `pz = z / scale`
   - Rotate by `0.4` radians:
     - `dx = rotateX(px, pz) = px * COS - pz * SIN`
     - `dz = rotateZ(px, pz) = px * SIN + pz * COS`
   - Add fractal OpenSimplex distortion:
     - `dx += getNoise(dx, dz, (byte) 0) * 0.2`
     - `dz += getNoise(dz, dx, (byte) 1) * 0.2`
     - where `getNoise(u, v, state)` sums `noises[(state + i) & 1].eval(u * i, v * i) / (float) i` for `i = 1 .. noiseIterations`.
   - Axial/Offset Hex Grid snapping:
     - `iz = (int) Math.floor(dz / 1.1555f)`
     - `odd = (iz & 1) == 1`
     - `fx = dx - (odd ? 0.5 : 0.0)`
     - `ix = (int) Math.floor(fx)`
     - `pointX = (float) (fx - ix - 0.5)`, `pointZ = (float) (dz - iz * 1.1555f - 0.5)`
     - If `!insideHexagon(0, 0, 1.1555f, pointZ, pointX)` (`abs(dx) < radius * COEF` and `abs(dz) < radius * 0.5` and `abs(radius*0.5 - abs(dx)/COEF*COEF_HALF) > abs(dz)`):
       - Checks the two candidate diagonal hex neighbours (`ix + (pointX > 0 ? 1 : 0)` if `odd` else `ix - (pointX < 0 ? 1 : 0)`, `iz + (pointZ > 0 ? 1 : -1)`) and picks the one where `insideHexagon` is true.
   - Cell lookup in `HexBiomeChunk` (`SIDE = 32`, `MASK_OFFSET = 5`, `MASK_CELL = 31`):
     - Chunk Pos `(ix >> 5, iz >> 5)`, local cell `(ix & 31, iz & 31)`.

3. **Cellular Growth & Sub-Biome Stamping (`HexBiomeChunk.<init>`)**:
   - Uses a `32 x 32` (`1024`-entry) `PickableBiome[]` array and two work buffers.
   - **Step A (Seeding)**: Loops 16 grid cells (`gx = 0..3, gz = 0..3`), picks `(sx = (gx << 3) + rand.nextInt(8), sz = (gz << 3) + rand.nextInt(8))`, and stamps a 7-cell hex `circle` with `picker.getBiome(rand)`.
   - **Step B (Voronoi/Automaton Growth)**: While any interior row/col (`z = 2..29, x = 2..29`) has a `null` cell, iterates over all cells: if `biomes[idx] != null`, copies it into a random hex neighbour (`NEIGHBOURS[z & 1][rand.nextInt(6)]`). Copies interior rows/cols `2` and `29` to border rows/cols `0` and `31`.
   - **Step C (Sub-Biome Promotion)**: Iterates `idx = 0..1023`:
     - If `biomes[idx] == null`: fills with `picker.getBiome(rand)`.
     - Else if `rand.nextInt(4) == 0` (**25% chance per cell**): calls `biomes[idx].getSubBiome(rand)` and stamps a 7-cell hex `circleSub` overwriting only cells that currently hold the same parent biome!
   - **Sub-Biome Weight Distribution (`WoverBiomePicker.java`)**:
     - Each `PickableBiome` initializes its `subbiomes` `RandomizedWeightedList` with itself (weight = `parent.genChance`) plus all biomes whose `parent` equals `parent.key` (weight = `child.genChance`):
       - **`betterend:megalake` cluster**: `megalake` (`1.25`) + `megalake_grove` (`1.25`) -> when `getSubBiome` triggers, 50% `megalake`, 50% `megalake_grove`.
       - **`betterend:dust_wastelands` cluster**: `dust_wastelands` (`1.25`) + `painted_mountains` (`1.25`) + `neon_oasis` (`0.625`) -> total weight `3.125`: 40% `dust_wastelands`, 40% `painted_mountains`, 20% `neon_oasis`.

4. **Edge Biome Check (`HexBiomeMap.getBiome(x, y, z)`)**:
   - Fetches `center = getRawBiome(x, z)`.
   - Determines `edge = center.getEdge()` (or `center.getParent().getEdge()` if `center` has a parent) and `size = edgeSize`.
   - If `edge != null`: samples 8 points around `(x, z)` at radius `size` (`EDGE_CIRCLE_X[i] * size, EDGE_CIRCLE_Z[i] * size`, where `EDGE_CIRCLE_X/Z = cos/sin(i * PI / 4)` for `i = 0..7`). If any point's `getRawBiome` is not `isSame(center)` (same biome, same parent, or parent-child pair), returns `edge`. (Note: none of the 27 BetterEnd biomes currently set a non-null `edge`, so `edge == null` and `center` is returned directly.)

---

### 2.3 Island Terrain Generator (`TerrainGenerator.java`, `IslandLayer.java`, `BiomeTerrain.java`)
1. **3-Layer Procedural Island Field (`TerrainGenerator.java:24-224`)**:
   - Evaluates terrain on an **8-block coarse grid** (`SCALE = 8.0`) with two detail `OpenSimplexNoise` fields (`noise1` at `0.08`, `noise2` at `0.16`) and three `IslandLayer` instances initialized in `TerrainGenerator.initNoise(seed)` (`TerrainGenerator.java:63-91`):
     - **`largeIslands`**: `distance = 32` (256 blocks), `scale = 300.0`, `center = 8` (`Y = 64`), `heightVariation = 24` (`±192` blocks), `hasCentralIsland = true` (`islandDistO = 80` -> `640` blocks).
     - **`mediumIslands`**: `distance = 16` (128 blocks), `scale = 150.0`, `center = 8` (`Y = 64`), `heightVariation = 24`, `hasCentralIsland = false`.
     - **`smallIslands`**: `distance = 8` (64 blocks), `scale = 60.0`, `center = 8` (`Y = 64`), `heightVariation = 24`, `hasCentralIsland = false`.
   - **Island SDF Primitive (`IslandLayer.java:20-169`)**:
     - Each grid cell `(x, z)` hashes its coordinates with `seed`: if `(hash & 1) == 0` (50% density) and outside the central ring (`x^2 + z^2 > islandDistSqr`), it spawns an island center jittered by `(ddx, ddz) in [-0.35..0.35] * distance`, with `y = center + clamp(noise, -0.5, 0.5) * heightVariation` and `scale = (noise + 1.5) * this.scale`.
     - The island shape is an `SDFCappedCone` (`radius1 = 0.5`, `radius2 = 1.0`, `height = 0.4`, translated by `y = 0.1`), warped vertically by radial lookup tables `FLOOR` (steep cone underside) and `ROOF` (flattened dome top).
   - **Density Combination (`TerrainGenerator.fillTerrainDensity(buffer, pos, scaleXZ, scaleY, localDensity)`)** (`TerrainGenerator.java:101-162`):
     - Sums `dist = max(largeIslands, mediumIslands, smallIslands)` + detail noise `noise1 * 0.03 + noise2 * 0.015`.
     - Notice how `center` of `largeIslands` is shifted by `localDensity[y] * 2.0`:
2. **Biome Terrain Height Influence (`BiomeTerrain.java:27-91` & `NoiseBasedChunkGeneratorMixin.java:53-155`)**:
   - `NoiseBasedChunkGeneratorMixin` injects `BiomeTerrain.TERRAIN_HEIGHT` into the chunk generator's climate sampler.
   - `BiomeTerrain.sampleTerrainHeight(biomeSource, sampler, blockX, blockZ)` averages `EndBiome.getTerrainHeight(biomeHolder)` over a **7x7 radial kernel** (`dx, dz = -3..3`, step = 1 quart = 4 blocks, weighted by `1.0 / (dist + 1.0)`).
   - In `megalake` and `megalake_grove`, `terrainHeight = 0.0F` (vs `1.0F` default and `1.5F` in `dust_wastelands`), which lowers the island surface into the lake water table (`Y ~ 56..64`).

---

## 3. Complete Classification of All Custom `Feature` and `Structure` Classes

### 3.1 Summary Taxonomy for Bedrock Porting (`CAP-003`, `CAP-004`, `GEN-001..003`)

#### Category A — Simple Block, Scatter, Wall, Ceiling/Vine, Underwater, Sky & Ore/Layer Features (19 classes)
*(Can be represented as native Bedrock JSON features `minecraft:single_block_feature`, `minecraft:scatter_feature`, `minecraft:ore_feature`, or lightweight radial scatter helpers in `GEN-001..002`)*

| Feature ID / Class | File & Line Anchor | Algorithm & Placement Details |
|---|---|---|
| `SingleBlockFeature` | `world/features/terrain/SingleBlockFeature.java:26-64` | Places `toPlace` on `#c:end_stones`; sets `waterlogged = true` if target fluid is non-empty. Used for `bulb_vine_seed`, `lanceleaf_seed`, `glow_pillar_seed`, etc. |
| `ScatterFeature<FC>` | `world/features/ScatterFeature.java:27-122` | Base radial scatter: snaps center to `WORLD_SURFACE_WG`, checks `center.y >= 5` and `#c:end_stones` below, rolls `r = randRange(0.5*radius, radius)` and `count = floor(r^2 * randRange(1.5, 3.0))`, samples polar disk `(pr = r*sqrt(rand), theta)`, rays down from `center.y + 5` up to 16 blocks, clips to `WriteZone`. |
| `SinglePlantFeature` | `world/features/SinglePlantFeature.java:16-70` | Extends `ScatterFeature`: places single plants, `BaseDoublePlantBlock` (with `ROTATION=0..3` and `TOP=true` above), `PottableCropBlock` (`AGE=3`), or `BasePlantWithAgeBlock` (`AGE=0..3`). Used for ~30 biome grasses/ferns/flowers (`umbrella_moss`, `creeping_moss`, `chorus_grass`, `shadow_plant`, `amber_grass`, `crystal_grass`, `globulagus`, `clawfern`, `orango`, `aeridium`, `lutebus`, `lamellarium`, `inflexia`, `flammalix`, `bolux_mushroom`, `auranode`, etc.). |
| `DoublePlantFeature` | `world/features/DoublePlantFeature.java:14-62` | Extends `ScatterFeature`: picks `largePlant` near center (`d < 0.5`) and `smallPlant` toward periphery (`d >= 0.5`). Used for `twisted_umbrella_moss`, `blooming_cooksonia`, `salteago`, `vaiolush_fern`, `fracturn`. |
| `BlueVineFeature` | `world/features/BlueVineFeature.java:16-61` | Extends `ScatterFeature`: inner core (`d <= 0.5`) grows full adult `blue_vine` stem (`2..5` blocks tall) + `blue_vine_lantern` + 6-face `blue_vine_fur`; outer ring (`d > 0.5`) places `blue_vine_seed` (`AGE=0..3`). |
| `LanceleafFeature` | `world/features/LanceleafFeature.java:14-49` | Extends `ScatterFeature` (`chance = 5`): calls `LanceleafSeedBlock.growAdult` (5-block tall `lanceleaf` column with `PENTA_SHAPE`). |
| `GlowPillarFeature` | `world/features/GlowPillarFeature.java:14-50` | Extends `ScatterFeature` (`chance = 10`): calls `GlowingPillarSeedBlock.growAdult` (`1..2` `glowing_pillar_roots` + `glowing_pillar_luminophor` + 5-face `glowing_pillar_leaves`). |
| `InvertedScatterFeature<FC>` | `world/features/InvertedScatterFeature.java:21-86` | Scans column `y = maxY .. minY` for ceiling transitions (`air` with solid above), scatters `count = floor(r^2 * randRange(0.5, 1.5))` points, rays up 16 blocks to ceiling. |
| `SingleInvertedScatterFeature` | `world/features/SingleInvertedScatterFeature.java:15-57` | Extends `InvertedScatterFeature`: places ceiling-attached plants (`FACING=DOWN`), e.g. `small_jellyshroom_ceil`, `rubinea`, `magnula`. |
| `VineFeature` | `world/features/VineFeature.java:15-85` | Extends `InvertedScatterFeature`: rays down `h = downRay(rand(maxLength)) - 1`; if `h > 2`, places `TOP`, `MIDDLE` (`1..h-1`), `BOTTOM` (`h`). Used for `dense_vine`, `twisted_vine`, `bulb_vine`, `jungle_vine`. |
| `WallScatterFeature<FC>` | `world/features/WallScatterFeature.java:21-119` | Picks random `py in [minY, maxY]`, scans `(2r+1)^3` box (`1/4` chance per air voxel not `overLakeWater` within 4 blocks below), tests shuffled horizontal directions. |
| `WallPlantFeature` | `world/features/WallPlantFeature.java:18-70` | Extends `WallScatterFeature`: places `BaseWallPlantBlock` or `BaseAttachedBlock` with `FACING = dir` on `#c:end_stones` (`purple_polypore`, `tail_moss`, `cyan_moss`, `bulb_moss`, `bushy_grass`, `ruscus`, `small_jellyshroom_wall`, `pond_anemone`). |
| `WallPlantOnLogFeature` | `world/features/WallPlantOnLogFeature.java:12-38` | Extends `WallPlantFeature`: requires `#minecraft:logs` behind `dir.getOpposite()` (`tail_moss_wood`, `cyan_moss_wood`, `bulb_moss_wood`, `bushy_grass_wood`, `jungle_fern_wood`, `small_jellyshroom_wood`, `ruscus_wood`). |
| `UnderwaterPlantScatter<FC>` | `world/features/UnderwaterPlantScatter.java:11-63` | Extends `ScatterFeature` (`chance = 5`, `yOffset = -5`): scans up from `Y=0..128` for water floor. |
| `UnderwaterPlantFeature` & `CharniaFeature` | `world/features/{UnderwaterPlantFeature.java:14-55,CharniaFeature.java:5-22}` | Places underwater flora (`bubble_coral`, `charnia_cyan/green/light_blue/orange/purple/red`, `flamaea`). |
| `EndLilyFeature`, `EndLotusFeature`, `HydraluxFeature` | `world/features/{EndLilyFeature,EndLotusFeature,HydraluxFeature}.java` | Extends `UnderwaterPlantScatter` (`chance = 15`): grows multi-block water columns from lake floor to water surface (`end_lily`, `end_lotus_stem` + `end_lotus_flower`, `hydralux` vine + `hydralux_petal_block`). |
| `EndLotusLeafFeature` | `world/features/EndLotusLeafFeature.java:22-108` | Extends `ScatterFeature` (`chance = 15`): places a 3x3 floating `end_lotus_leaf` pad (`BOTTOM` center, `MIDDLE` cardinals, `TOP` corners) where all 9 blocks are air over `minecraft:water`. |
| `MengerSpongeFeature` | `world/features/MengerSpongeFeature.java:19-54` | Extends `UnderwaterPlantScatter`: places `menger_sponge_wet` + 50% chance of 6 face-adjacent `menger_sponge_wet`. |
| `SkyScatterFeature` & `FilaluxFeature` | `world/features/{SkyScatterFeature.java:12-61,FilaluxFeature.java:21-60}` | Picks aerial center `Y in [32, 192]`, checks `upRay > 3` and `downRay > 3`, places `filalux_lantern` with 5 `filalux_wings` (top + 4 sides) and `1..3` hanging `filalux` vine blocks below. |
| `OreLayerFeature` | `world/features/terrain/OreLayerFeature.java:18-76` | Places a flattened, noise-warped `SDFSphere` (`scale(1, 0.2, 1)`, `radius = cfg.radius * 0.5`, `y += noise.eval(x*0.1, z*0.1)*8`, `Y in [minY, maxY]`) replacing `end_stone`. Used for `flavolite_layer` and `violecite_layer`. (Standard ores `ender_ore`, `amber_ore`, `thallasium_ore`, `dragon_bone_block_ore` use vanilla `OreFeature`). |

---

#### Category B — Procedural Bush, Small Mushroom, Column & Cluster Features (9 classes)

| Feature ID / Class | File & Line Anchor | Algorithm & Placement Details |
|---|---|---|
| `BushFeature` | `world/features/bushes/BushFeature.java:31-113` | Flattened noise-displaced `SDFSphere` (`r = 1.8..3.5`, `scale(1, 0.5, 1)`, `noise * 3 + rand(-2,2)`, bottom cut `-r`) of leaves (`pythadendron_bush`, `dragon_tree_bush`) with central bark block and `EndTreeHelper.waterlogSubmerged(r=6)`. |
| `BushWithOuterFeature` | `world/features/bushes/BushWithOuterFeature.java:34-144` | Same as `BushFeature` plus 6-direction `outer_leaves` (`FurBlock`) on air-exposed leaf faces + `pruneUnsupportedFur` (`lucernia_bush`, `lucernia_bush_rare`, `cave_bush`). |
| `TenaneaBushFeature` | `world/features/bushes/TenaneaBushFeature.java:39-164` | `SDFSphere` (`r = 1.8..3.5`, `scale(1, 0.75, 1)`) of `tenanea_leaves` + `tenanea_outer_leaves` + `1/4` chance on underside leaves of hanging `3..8` block `tenanea_flowers` strands (`TOP`, `MIDDLE`, `BOTTOM`). |
| `Lumecorn` | `world/features/bushes/Lumecorn.java:23-94` | Vertical column (`height = 4..7`) on `#c:end_stones`: `BOTTOM_SMALL`/`BOTTOM_BIG` + `MIDDLE` base (`1..2` blocks) topped by `LIGHT_BOTTOM`, `LIGHT_MIDDLE`, `LIGHT_TOP_MIDDLE`, `LIGHT_TOP`. |
| `LargeAmaranitaFeature` | `world/features/bushes/LargeAmaranitaFeature.java:23-67` | Vertical 2- or 3-block column of `large_amaranita_mushroom` (`BOTTOM`, optional `MIDDLE`, `TOP`) on `#c:end_stones`. |
| `AmaranitaPatchFeature` | `world/features/bushes/AmaranitaPatchFeature.java:41-170` | Scatters `4..8` small-to-medium mushrooms within `PATCH_RADIUS = 4` (`flower_islets`): stem height `2..6` (`amaranita_hyphae` ends, `amaranita_stem` middle), 3x3 + plus-cap dome of `amaranita_cap`, 4 cardinal `amaranita_hymenophore` gills, and 1/3 chance of glowing `amaranita_lantern` + `amaranita_fur`. |
| `NeonCactusFeature` | `world/features/NeonCactusFeature.java:18-43` | Calls `NeonCactusPlantBlock.growPlant` on `endstone_dust` or `end_moss` (grows branching `neon_cactus` column with `TOP`/`MEDIUM`/`BIG` shapes). |
| `CavePumpkinFeature` | `world/features/CavePumpkinFeature.java:18-55` | Ceiling plant under `#c:end_stones`: places `cave_pumpkin_seed` (`AGE = 0..3`) and if `age > 1`, hangs `cave_pumpkin` (`SMALL = age < 3`) at `pos.below()`. |
| `SilkMothNestFeature` | `world/features/SilkMothNestFeature.java:25-82` | Scans column `maxY .. minY` for cube leaves or `#minecraft:logs` with 2 vertical air blocks below; places `silk_moth_nest` (`ACTIVE = false`) at `y` and `silk_moth_nest` (`ACTIVE = true`) at `y - 1`. |
| `StalactiteFeature` & `StalactiteClusterFeature` | `world/features/terrain/StalactiteFeature.java:19-89`, `caves/StalactiteClusterFeature.java:24-126` | Single stalactite/stalagmite (`height = 0..15`, capped at `0..7` if not a joined stalagnate, `SIZE = 0..7`, `IS_FLOOR`, waterlogged) and dripstone-style radial cluster (`radius`, `density * (1 - (d/r)^2)`, `pairChance`, chunk-clamped). |
| `SmaragdantCrystalFeature` | `world/features/terrain/SmaragdantCrystalFeature.java:26-141` | Gaussian cluster (`count = 15..30`, `dist = floor(1.5 - r) + rand(3)`) of vertical `smaragdant_crystal` columns (`1/8` blocks `budding_smaragdant_crystal` with 50% horizontal `smaragdant_crystal_shard`s, plus top `smaragdant_crystal_shard`). |

---

#### Category C — Procedural Spline + SDF Trees (11 classes + `EndTreeHelper`)
All trees validate ground (`#minecraft:nylium` or biome-specific moss), clip spline/SDF operations to `WriteZone`, convert interior vertical bark to `log` via `POST`, and run `EndTreeHelper.waterlogSubmerged` (`EndTreeHelper.java:158-247`) + `pruneUnsupportedFur` (`EndTreeHelper.java:129-156`):

| Tree Feature Class | File & Line Anchor | Geometry, Dimensions & Blocks |
|---|---|---|
| `DragonTreeFeature` | `world/features/trees/DragonTreeFeature.java:37-368` | `size = 10..25`, 6-point trunk spline (`r = 1.2..2.3 -> 1.2`), radial root splines (`count = r*1.5`), radial branch fan (`BRANCH`, `SIDE1`, `SIDE2`), and flattened `SDFSphere` leaf cap (`scale(1, 0.5, 1)`, `r = size * (0.5..0.7) * 1.15 + 2`, fitted to headroom via `fitBallRadius`) of `dragon_tree_leaves` + `dragon_tree` bark/log. |
| `PythadendronTreeFeature` | `world/features/trees/PythadendronTreeFeature.java:38-268` | Requires `chorus_nylium`. `size = 10..20`, 4-point trunk spline (`r = 1.7 -> 1.1`), recursive binary branching (`depth = floor((size-10)*0.3 + 1)` up to 4 levels, `angle ± PI/2`), with flattened `SDFSphere` leaf balls (`r = 4.5..6.5`, `scale(1, 0.6, 1)`) of `pythadendron_leaves` at branch tips (`depth < 3`). |
| `LacugroveFeature` | `world/features/trees/LacugroveFeature.java:40-289` | `size = 15..25`, 6-point trunk spline (`r = 1.2..1.8 -> 0.7`), single large `SDFSphere` canopy (`r = (6..8) * ((size-15)/20 + 1)`) at point 4, plus 100 checkerboard root columns around `[-5..5]^2` of `lacugrove` log/bark. |
| `LucerniaFeature` | `world/features/trees/LucerniaFeature.java:39-305` | `size = 12..20`, `count = int(size * 0.3)` curved 6-point `SPLINE` branches (`lucernia` bark/log), `makeRoots` at `y + 3..5`, each branch tipped with an `SDFSphere` (`r = (size*0.13 + 0.8..1.5)*1.4`, `scale(1, 0.75, 1)`) of `lucernia_leaves` coated in 6-face `lucernia_outer_leaves` and hanging `3..8` block `filalux` vines (`1/6` underside chance). |
| `TenaneaFeature` | `world/features/trees/TenaneaFeature.java:37-260` | `size = 7..10`, `count = int(size * 0.45)` curved 6-point `SPLINE` branches (`tenanea` bark/log), each tipped with an `SDFSphere` (`r = (size*0.3 + 0.8..1.5)*1.4`, `scale(1, 0.75, 1)`) of `tenanea_leaves` coated in `tenanea_outer_leaves` and hanging `3..8` block `tenanea_flowers` vines (`1/6` underside chance). |
| `UmbrellaTreeFeature` | `world/features/trees/UmbrellaTreeFeature.java:36-340` | `size = 10..20`, `scale = 1.0..1.7`, `count = int(size * 0.15)` branches, each topped by a flat-wave `SDFSphere` membrane (`r = (size + 0..0.5*size)*0.4`, `scale(1, 0.5, 1)`, `SDFFlatWave` rays `r..2r`, intensity `0.6`) of `umbrella_tree_membrane` (`COLOR = 0..7` by radial distance from membrane centers) + hanging `umbrella_tree_cluster` fruits (`5..10 * scale` per cap) + roots. |
| `HelixTreeFeature` | `world/features/trees/HelixTreeFeature.java:38-254` | Double-helix trunk (`10` points spiraling by `sin/cos(i + angle)` with `SDFRotation(PI)` union + smooth union to vertical top stem, scaled by `scale = 0.5..1.0`), wrapped by a spiraling ribbon of `helix_tree_leaves` (`20..30` points, `COLOR = 0..7` interpolated from inner stem to outer edge). |
| `DragonHelixTreeFeature` | `world/features/trees/DragonHelixTreeFeature.java:44-187` | Conifer/pine tree on `waterfall_ponds`: straight `dragon_tree` log trunk (`height = 11..17`), tiered rings of `lucernia_leaves[persistent=true]` (`baseRadius = min(3..4, (fromTop+1)/2)` + rotating helix bulge `HELIX_REACH = 1.8`, `HELIX_TURN = 1.15 rad/y`), pointed 2-block tip, and `1..3` block `bulb_vine` light strands hanging from 60% of the lowest skirt rim. |
| `MossyGlowshroomFeature` | `world/features/trees/MossyGlowshroomFeature.java:39-253` | Requires `end_mycelium` or `end_moss`. `height = 10..25`, `scale = 0.75..1.1` (fitted to headroom / `CAP_REACH = 17.9`), trunk spline (`r = 2.1 -> 1.5`) + 5-ray `SDFFlatWave` root sphere + 12-ray `SDFFlatWave` capped-cone cap (`CAP_RADIUS = 13`, `GLOW_RADIUS = 12.5`) of `mossy_glowshroom_cap` (`TRANSITION=true` on log contact), `mossy_glowshroom_hymenophore`, and `mossy_glowshroom_fur`. |
| `JellyshroomFeature` | `world/features/trees/JellyshroomFeature.java:33-148` | `height = 5..8`, 3-point stem spline (`r = height*(0.15..0.25) -> 0.8`) of `jellyshroom` bark/log + roots + `SDFFlatWave` dome cap (`r = max(1.5, height*(0.7..0.9))`) of `jellyshroom_cap_purple` (`COLOR = 0..7` by radial distance). |
| `GiganticAmaranitaFeature` | `world/features/trees/GiganticAmaranitaFeature.java:36-401` | `size = 5..10`, 5-point `amaranita_stem` spline wrapped with 3 offset `amaranita_hyphae` splines, topped by a tiered voxel cap (`radius = floor(size / 1.6)`, 3 size tiers `<2`, `<4`, `>=4`) of `amaranita_cap`, `amaranita_hymenophore` rim, `amaranita_lantern` core, and `amaranita_fur`. |

---

#### Category D — Procedural Terrain & Hydrological Features (18 classes)

| Terrain Feature Class | File & Line Anchor | Geometry & Algorithmic Specification |
|---|---|---|
| `SpireFeature` | `world/features/terrain/SpireFeature.java:36-132` | `count = 3..7` stacked `SDFCappedCone` segments (tapering downward, `SDFSmoothUnion(2)`), warped by two `OpenSimplexNoise` displacements, `SDFInvert` + `SDFFlatland` clip, coated on top with biome surface material (`pink_moss` in `blossoming_spires`) + leaves/plants. |
| `FloatingSpireFeature` | `world/features/terrain/FloatingSpireFeature.java:29-107` | Extends `SpireFeature`: doubles segment count (`top + bottom` mirror cones), places at `y = surfaceY + rand(8, 18)` in `blossoming_spires`. |
| `BiomeIslandFeature` | `world/features/BiomeIslandFeature.java:28-90` | Floating `SDFCappedCone` island (`radius1 = 0`, `radius2 = rand(10, 20)`, `height = r * 0.5`) displaced by simplex noise (`TUNEL_CAVE` / island modifier). |
| `IceStarFeature` | `world/features/terrain/IceStarFeature.java:29-131` | Used for `ice_star` (`size = 5..15`, `count = 15..25`) and `ice_star_small` (`size = 3..5`, `count = 10..15`) in `ice_starfield` (`Y = 32..128`): Fibonacci-sphere distribution of `count` `SDFCappedCone` spikes (`r1 = 0`, `r2 = rand(minSize, maxSize) * 0.15`, `h = r`) of `dense_snow`, with concentric core thresholds (`ancient_emerald_ice` `< 0.25*r`, `dense_emerald_ice` `< 0.45*r`, `emerald_ice` `< 0.7*r`). |
| `ArchFeature` | `world/features/terrain/ArchFeature.java:28-91` | Torus-arch (`SDFToris`, `bigRadius = randRange(10, 20)`, `smallRadius = bigRadius * 0.3`) rotated randomly and displaced by simplex noise; coated on top with `surfaceFunction` (`amber_root` uses `raw_amber` + `amber_moss`; `umbralith_arch` uses `umbralith` + `pallidium_*`). |
| `ThinArchFeature` | `world/features/terrain/ThinArchFeature.java:30-103` | 1..3 intersecting spline-built arches (`r = 0.8..1.3`, `bigRadius = randRange(8, 16)`) of `umbralith` in `umbra_valley`. |
| `BigAuroraCrystalFeature` | `world/features/terrain/BigAuroraCrystalFeature.java:24-93` | 1-in-10 gate (`RARITY_DIVISOR = 10`), rejects open sky (`pos.y + 1 >= surfaceY`), requires vertical cave clearance `maxY - minY >= 10`, places randomly tilted `SDFHexPrism` (`height = 5..25`, `radius = 1.7..3.0`) of `aurora_crystal`. |
| `FallenPillarFeature` | `world/features/terrain/FallenPillarFeature.java:29-82` | Nearly horizontal tilted `SDFCappedCone` (`height = 20..40`, `radius = 2..4`, `angle = PI + gauss*0.05`) of `obsidian` with 90% `mossy_obsidian` top coat (`dragon_graveyards`). |
| `ObsidianBoulderFeature` | `world/features/terrain/ObsidianBoulderFeature.java:27-90` | Cluster of `1..5` noise-displaced `SDFSphere` boulders (`r = 1..5`, `scale(0.7..1.3)`) of `obsidian` with 90% `mossy_obsidian` top coat (`dragon_graveyards`). |
| `ObsidianPillarBasementFeature` | `world/features/terrain/ObsidianPillarBasementFeature.java:31-89` | Broken vertical `SDFCappedCone` stump (`height = 10..35`, `radius = 2..5`, slight tilt `0..0.2 rad`, sheared at `0.7*height` by noise-displaced `SDFFlatland` subtraction) of `obsidian` + `mossy_obsidian` top (`dragon_graveyards`). |
| `DesertLakeFeature` | `world/features/terrain/DesertLakeFeature.java:34-269` | Oasis lake in `neon_oasis` (`r = 8..16`, `depth = r * 0.5 * (0.8..1.2)`): carves water basin with `endstone_dust` bed, `end_moss` shore ring, and `end_stone` underside shell. |
| `PondWithWaterfallFeature` | `world/features/terrain/PondWithWaterfallFeature.java:43-316` | Perched basin (`r = 5..8`, `depth = 2..3`) on `waterfall_ponds` small islands (`r >= 10` required): carves a water bowl inside the island interior and cuts a 1..2-block wide spillway notch through the closest rim wall (`spillDist <= r + 6`) so water cascades into the void! |
| `GeyserFeature` | `world/features/terrain/GeyserFeature.java:39-356` | Multi-part hydrothermal feature in `sulphur_springs`: `SDFCappedCone` + `SDFSphere` underground water cavity + terraced `brimstone` / `sulphuric_rock` surface dome (`r1 = 4..8`), central vertical water column with `hydrothermal_vent` + `vent_bubble_column`s, `SulphurFloorMix` (`sulfur`/`cinnabar`), `sulphur_crystal` shards, and `hydralux`/`charnia` flora. |
| `SulphuricLakeFeature` | `world/features/terrain/SulphuricLakeFeature.java:32-271` | Shallow terraced lake (`r = 10..20`, `y >= 57`) in `sulphur_springs` with 1..2 block deep water, `brimstone` rim (`ACTIVE=true` on water contact), `sulphur_crystal` shards (`1/16` per water-facing side), and buried `SulphurFloorMix`. |
| `SulphurHillFeature` | `world/features/terrain/SulphurHillFeature.java:25-112` | `5..13` overlapping travertine-style terraced pools (`r = 5..9`, `y in [57, 70]`) of `water`, `brimstone[active=true]`, and `sulphuric_rock` pillars (`sulphur_springs`). |
| `SurfaceVentFeature` | `world/features/terrain/SurfaceVentFeature.java:23-76` | Gaussian cluster (`15..30` attempts) of `1..3` block tall `sulphuric_rock` chimneys topped with `hydrothermal_vent[waterlogged=false]` (`sulphur_springs`). |
| `SulphurFloorMix` | `world/features/terrain/SulphurFloorMix.java:33-166` | Shared deposit helper (`GeyserFeature`, `SulphuricLakeFeature`, `SulphuricCavePiece`): replaces buried (`>= 3` blocks under water/rock, not touching air) brimstone with `minecraft:cinnabar` (`CINNABAR_NOISE > 0.45`, ~8%) or `minecraft:sulfur` (`TYPE_NOISE > 0`, ~46%). |
| `CaveSurfaceCoatFeature` | `world/features/terrain/caves/CaveSurfaceCoatFeature.java:108-502` | Full-chunk (`16x16` + 1-block read margin, `Y = 4..72`) cave coater in `UNDERGROUND_DECORATION`: classifies vertical air runs closed at both ends by rock as `CAVE_AIR` (rejecting open sky and void), runs a 5-layer BFS distance transform inward from cave faces to paint `EndCaveBiome.getWall(pos)` (e.g. banded jadestone in `jade_cave`), then paints `getTopMaterial()` on floors (`cave_moss` in lush caves) and `getCeil(pos)` on ceilings (`cave_moss`). |

---

#### Category E — Template / NBT Features (3 classes)

| NBT Feature Class | File & Line Anchor | Templates & Placement Logic |
|---|---|---|
| `NBTFeature<FC>` | `world/features/NBTFeature.java:36-234` | Abstract base for structure-template features (`StructurePlacementType`: `FLOOR`, `UNDER`, `CEIL`), supporting rotation/mirroring, foundation fill, and `StructureErode` post-processing. |
| `CrashedShipFeature` | `world/features/CrashedShipFeature.java:34-212` | Spawns in all land biomes (`hasCaves == true`, 1-in-580 chunk rarity in `EndFeatures.java`): picks 1 of 5 shipwrecks (`/data/betterend/structure/crashed_ships/{end_ship_01..04,end_ship_big}.nbt`), checks `y > 58` and terrain flatness, replaces `purpur_block` markers with biome wood/stone, applies `StructureErode` (`erosion = 3..6`) and scatters wreckage blocks. |
| `BuildingListFeature` | `world/features/BuildingListFeature.java:35-198` | Template list feature for weighted NBT buildings with material replacement. |

---

#### Category F — All 14 Custom Structures & Structure Pieces (`world/structures/**` & `StructureDataProvider.java`)

| # | Structure ID (`betterend:*`) | Structure & Piece Classes | Step | Spacing / Separation / Salt | Target Biomes | Geometry & Algorithmic Specification |
|---|---|---|---|---|---|---|
| 1 | `mountain` | `MountainStructure.java:18-57` -> `CrystalMountainPiece.java:37-336` (extends `MountainPiece.java:33-172`) | `RAW_GENERATION` | `3 / 2 / 1192828158` (set `mountain`, wt=1) | `crystal_mountains` | Layered cone (`r = 50..100`, `h = r * (0.8..1.2)`), clamped to `y > 50` and terrain heightmap. Coated in `end_stone` / `crystal_moss` via split noise, plus small (`r=1`) and big (`r=2..3`, max 6/chunk) leaning `aurora_crystal` hex spikes. |
| 2 | `painted_mountain` | `PaintedMountainStructure.java:21-82` -> `PaintedMountainPiece.java:24-127` | `RAW_GENERATION` | `3 / 2 / 1192828158` (set `mountain`, wt=1) | `painted_mountains` | Layered cone (`r = 50..100`, `h = r * (0.4..0.6)`, `y > 50`), filled with horizontal noise-warped strata slices (`length = 15..20`) of `end_stone`, `flavolite`, and `violecite`. |
| 3 | `megalake` | `MegaLakeStructure.java:18-65` -> `LakePiece.java:42-611` | `LAKES` | `4 / 1 / 1890982538` (set `megalake`, wt=1) | `megalake` | Noise-warped ellipsoid basin (`r = 32..64`, `depth = 7..15`, water level `Y = max(surfaceY, 56..62)`). Requires 4-corner terrain support (`h >= y - 6`); builds 16-block sloped shore and 4-block `end_stone` underside shell so lakes never leak into void. |
| 4 | `megalake_small` | `MegaLakeSmallStructure.java:18-61` -> `LakePiece.java:42-611` | `LAKES` | `4 / 1 / 1890982538` (set `megalake`, wt=1) | `megalake_grove` | Same `LakePiece` algorithm with smaller dimensions (`r = 20..40`, `depth = 5..10`). |
| 5 | `end_lake` | `EndLakeStructure.java:21-78` -> `EndLakePiece.java:39-540` | `LAKES` | `6 / 1 / 656268008` | `foggy_mushroomland`, `amber_land`, `umbrella_jungle` | Per-chunk carved lake (`r = 10..20`, `depth = r * 0.5 * (0.8..1.2)`), flatness gate `\|y - h\| <= 5` at 8 rim points, 8-block sloped shore, 3-block underside shell. |
| 6 | `end_lake_normal` | `EndLakeNormalStructure.java:10-21` -> `EndLakePiece` | `LAKES` | `5 / 2 / 8955736` | `lantern_woods` | Same `EndLakePiece` with `5 / 2` spacing. |
| 7 | `end_lake_rare` | `EndLakeRareStructure.java:10-21` -> `EndLakePiece` | `LAKES` | `6 / 2 / 1340454045` | `chorus_forest`, `shadow_forest`, `glowing_grasslands` | Same `EndLakePiece` with `6 / 2` spacing. |
| 8 | `sulphuric_cave` | `EndSulphuricCaveStructure.java:21-78` -> `SulphuricCavePiece.java:46-494` | `RAW_GENERATION` | `9 / 4 / 1073037128` | `sulphur_springs` | Subsurface sphere cavern (`r = 10..30`, `y = surfaceY - floor(r*1.3 + 5) - rand(r)`): carves air upper half + water lower half, `sulphuric_rock` + `brimstone` shell, `SulphurFloorMix`, `sulphur_crystal` spikes (`r1=0.6..1.2`), and 25% chance of `5..20` `hydrothermal_vent` + `tube_worm` + `vent_bubble_column` columns. |
| 9 | `giant_mossy_glowshroom` | `GiantMossyGlowshroomStructure.java:32-161` -> `VoxelPiece.java:24-75` | `SURFACE_STRUCTURES` | `16 / 8 / 229646284` | `foggy_mushroomland` | SDF structure (`scale = 2.0..3.5x`, `height = 10..25`, `y >= 58`): spline trunk + 12-ray `SDFFlatWave` capped-cone cap, `mossy_glowshroom_hymenophore`, `mossy_glowshroom_fur`, and root sphere baked into a `VoxelPiece`. |
| 10 | `giant_ice_star` | `GiantIceStarStructure.java:29-142` -> `VoxelPiece.java:24-75` | `SURFACE_STRUCTURES` | `16 / 8 / 776927947` | `ice_starfield` | Void generation (`stubY = 80`, piece `y = 32..128`): `count = 25..40` Fibonacci-sphere `SDFCappedCone` spikes (`size = 20..35`) of `dense_snow` with radial core (`ancient_emerald_ice`, `dense_emerald_ice`, `emerald_ice`). |
| 11 | `small_island` | `SmallIslandStructure.java:47-438` -> `VoxelPiece.java:24-75` | `RAW_GENERATION` | `5 / 2 / 448084798` | `flower_islets`, `waterfall_ponds` | Void island (`stubY = 80`, piece `y = 48..104`, 25% organic skip, rejects overlap with `TerrainGenerator.isLand`): `SDFCappedCone` island (`r = 6..12` in `flower_islets` with `sangnum`+`pallidium`+`umbralith` top and hanging `bulb_vine`/`twisted_vine`/`jungle_vine`; `r = 12..17` in `waterfall_ponds` with `end_moss` top and hanging `end_stone_stalactite`). Re-primes `WORLD_SURFACE_WG` heightmap in `VoxelPiece` so subsequent features (`pond_with_waterfall`, `dragon_helix_tree`, `amaranita_patch`) land on the island! |
| 12 | `end_bridge` | `EndBridgeStructure.java:31-182` -> `EndBridgePiece.java:29-236` + `EndBridgeGeometry.java:10-94` | `SURFACE_STRUCTURES` | `6 / 2 / 1178516510` | `flower_islets`, `waterfall_ponds`, `minecraft:small_end_islands` | Scans 16 radial directions (`r = 16..96`, step 8) for opposing island rims (`span = 24..96`, `\|dy\| <= 12`, angle `>= 90°`, at least one endpoint a small island); builds a 5-wide parabolic arch bridge of `end_stone_bricks` + `cracked`/`weathered` variants, `end_stone_brick_wall` railings, and support pillars every 8 blocks. |
| 13 | `eternal_portal` | `EternalPortalStructure.java:24-70` -> `NBTPiece.java:28-137` | `RAW_GENERATION` | `40 / 12 / 1502528157` | All 15 main land biomes + `neon_oasis` + vanilla `end_highlands`/`end_midlands` | Requires `chunkX^2 + chunkZ^2 >= 1024` (`>= 512` blocks from `(0,0)`) and `surfaceY >= 58` (code checks `y >= 5` on `getGenerationHeight`, `EternalPortalStructure.java:46`); places `/data/betterend/structure/portal/eternal_portal.nbt` at `y - 2` with `erosion = rand(5)` and `cover = true`. |
| 14 | `end_village` | Vanilla `JigsawStructure` (`VillagePools.java:9-18`, `worldgen/structure/end_village.json`) | `SURFACE_STRUCTURES` | `34 / 8 / 147624381` | `dust_wastelands`, `glowing_grasslands` | Jigsaw structure (`start_pool = "betterend:village/center_piece"`, `size = 6`, `max_distance_from_center = 80`, `terrain_adaptation = "beard_thin"`, `WORLD_SURFACE_WG`). |

---

## 4. Technical Specification for `REG-001`, `CAP-003`, `CAP-004`, `CAP-014` & `GEN-001..003`

### 4.1 Deterministic Region Service (`REG-001`)
Because Bedrock's End dimension does not natively run Wover's `WoverEndBiomeSource` or support custom 3D End biome grids in stable vanilla worldgen, **`REG-001` should implement the exact Java Wover + BetterEnd region pipeline deterministically in TypeScript**:
1. **Inputs**: `(worldSeed: bigint | number, blockX: number, blockY: number, blockZ: number)` (plus optional terrain surface query `surfaceY`).
2. **4-Layer Deterministic Resolution**:
   - **Inner Dragon Island Gate**: `chunkX = blockX >> 4`, `chunkZ = blockZ >> 4`; if `chunkX * chunkX + chunkZ * chunkZ <= 4096` (`r <= 1024` blocks), return `minecraft:the_end`.
   - **Land vs Void Gate**: Evaluate the coarse 8-block `TerrainGenerator.isLand(quartX, quartZ)` (or check whether the column has natural End stone island surface `surfaceY > 0`).
   - **Land Layer (`HexBiomeMap`, `size = 256`, `scale = 32.0`, `noiseIterations = 5`)**:
     - Picks from the **15 Main Surface Land Biomes** weighted by `genChance` (`1.25` for 14 biomes, `0.25` for `dragon_graveyards`).
     - In `HexBiomeChunk`, applies the 25% (`rand.nextInt(4) == 0`) 7-cell sub-biome stamp using `parent` links:
       - `megalake` -> 50% `megalake`, 50% `megalake_grove`
       - `dust_wastelands` -> 40% `dust_wastelands`, 40% `painted_mountains`, 20% `neon_oasis`
   - **Void / Aerial Layer (`HexBiomeMap`, `size = 256`, `scale = 32.0`)**:
     - When outside main island land (`!isLand`), picks from the **3 Void / Aerial Biomes** (`ice_starfield`, `flower_islets`, `waterfall_ponds`, each `genChance = 0.5`, plus optional vanilla `small_end_islands` / `end_barrens`).
   - **Underground Cave Layer (`HexBiomeMap`, `size = 128`, `scale = 16.0`, `noiseIterations = 4`)**:
     - Only active when the column's surface biome has `has_caves == true` (the 18 land + sub-biomes) AND `4 <= blockY < 48 + caveYNoise(quartX * 0.08, quartZ * 0.08) * 8`.
     - Picks from the **6 Cave Biomes** (`empty_end_cave`, `empty_smaragdant_cave`, `lush_smaragdant_cave`, `empty_aurora_cave`, `lush_aurora_cave`, `jade_cave`, each `genChance = 1.25`).
3. **Metadata Payload per Region**:
   - Expose the complete table from Section 1.2 & 1.3 (`id`, `layer`, `parent`, `genChance`, `fogDensity`, `terrainHeight`, `hasCaves`, `surfaceRule`, `particle`, `ambientLoop`, `music`, `foliageColor`, `waterColor`, `spawns`, `features`, `structures`) so `ENV-001` (fog/particles/audio), `MOB-001` (spawns), and `GEN-001..003` (surface/feature/structure placement) all consume a single deterministic source of truth.

### 4.2 Capability Probes (`CAP-003`, `CAP-004`, `CAP-014`)
- **`CAP-003` (End Biome / Region Override vs Script-Driven Region Service)**:
  - Probe whether Bedrock allows custom End biome IDs or `minecraft:the_end` surface/feature overrides in the target engine version.
  - Because Bedrock's End dimension hardcodes `minecraft:the_end` in its native `TheEndDimension` biome source unless experimental/custom dimension hooks exist, `REG-001` must act as the authoritative runtime & generation-time biome resolver, while `minecraft:the_end` biome JSON / feature rules act as the trigger hook.
- **`CAP-004` (Feature & Structure Triggering in `minecraft:the_end` vs Script Chunk Decoration)**:
  - Native Bedrock `feature_rules` attached to `the_end` can trigger Category A scatter/ore features or anchor markers, while Category C/D/E/F multi-block SDF trees, spires, lakes, caves, islands, bridges, crashed ships, and eternal portals require either script-driven chunk decoration (`GEN-001..003`) bounded to loaded chunks (`WriteZone` equivalent) or `.mcstructure` template placement (`StructureManager`).
- **`CAP-014` (Chunk Load / Generation Event & Safe Write Zone)**:
  - Java BetterEnd's 26.3 port introduced `WriteZone` across all SDF trees, lakes, mountains, and scatters to clamp reads/writes to the safe loaded chunk window (`fitBallRadius`, `fitSpline`, `CaveSurfaceCoatFeature`'s 16x16+1 sweep). In Bedrock Script API, `GEN-001..003` must similarly bound procedural SDF/spline/lake writes to currently ticking/loaded chunks and persist a per-chunk generation marker (via `DynamicProperties` or chunk tag) to guarantee idempotent, deterministic decoration.
