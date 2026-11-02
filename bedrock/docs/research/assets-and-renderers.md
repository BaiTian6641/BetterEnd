# Asset, renderer, tinting, entity model and parent-template research

Anchored to the pinned BetterEnd 26.3 source (`bedrock/.work/java-reference/source/src/main/`), dependency JARs (`bedrock/.work/java-reference/server/mods/bclib-26.301.2.jar`, `bedrock/.work/java-reference/dependency-jars/wover-*.jar`), and generated catalogues (`bedrock/catalogue/generated/registrations.json`, `bedrock/upstream/asset-provenance.json`).

---

## 1. Custom Tinting & Color Providers (Blocks, Items, Water & Biomes)

In BetterEnd 26.3, legacy `CustomColorProvider` interfaces were replaced by WorldWeaver's `BlockRenderTraits.TINT` (`de.ambertation.wover.block.api.render.BlockRenderTraits`, `TinterKeys`, `WoverBuiltinTinters`) and BetterEnd's `EndTinterKeys` / `EndClientTinters`, which register `BlockTintSource` instances for world blocks and bake `"tints": [{"type": "minecraft:constant", "value": ...}]` into `src/main/generated/assets/betterend/items/<id>.json` for items.

### 1.1 Position-Based 3D Palette-Cycle Tinting (`TinterKeys.PALETTE_CYCLE`)
Implemented in `de.ambertation.wover.block.api.client.render.WoverBuiltinTinters` (`wover-block-api-26.301.2.jar`).

1. **`EndCrystalBlocks.AURORA_PALETTE`** (`registry/block/EndCrystalBlocks.java:79-88`, referencing `blocks/AuroraCrystalBlock.java:24-31`):
   - **Colors (4 stops)**: `RGB(247, 77, 161)` (`#F74DA1`), `RGB(120, 184, 255)` (`#78B8FF`), `RGB(120, 255, 168)` (`#78FFA8`), `RGB(243, 58, 255)` (`#F33AFF`).
   - **Parameters**: `IndexMode.SUM_XYZ` (`x + y + z`), `minSaturation = 0.0F`.
   - **Item constant tint** (baked into `generated/assets/betterend/items/*.json`): `-569951` (`0xFFF74DA1`, stop 0).
   - **Applied to (16 blocks, 15 items)**:
     - `betterend:aurora_crystal` (`registry/block/EndCrystalBlocks.java:90-112`): `TINT.worldAndItem(TinterKeys.PALETTE_CYCLE, () -> AURORA_PALETTE)`. Model: `betterend:block/aurora_crystal` (parent `betterend:block/tint_cube_noshade`, `tintindex: 0`).
     - `betterend:respawn_obelisk` (`registry/block/EndFunctionalBlocks.java:97-115`, `blocks/RespawnObeliskBlock.java:61-236`): `TINT.world(TinterKeys.PALETTE_CYCLE, () -> EndCrystalBlocks.AURORA_PALETTE)` (world-only; `respawn_obelisk_middle.json` and `respawn_obelisk_top.json` have `tintindex: 0` on the amber/aurora core elements, while `respawn_obelisk_bottom.json` has no `tintindex` and the item uses pre-colored flat texture `betterend:item/respawn_obelisk`).
     - **14 Stone Lanterns** via `StoneLantern.SLOT` (`complexmaterials/types/StoneLantern.java:51-54`, `blocks/basis/StoneLanternBlock.java:123-128`): `TINT.worldAndItem(TinterKeys.PALETTE_CYCLE, () -> EndCrystalBlocks.AURORA_PALETTE)`. Models inherit `bclib:block/stone_lantern_ceil` and `bclib:block/stone_lantern_floor` (`tintindex: 0` on the inner `#crystal` cube):
       - 7 BetterEnd `StoneMaterial` lanterns (`complexmaterials/StoneMaterial.java:68,266`): `flavolite_lantern`, `violecite_lantern`, `sulphuric_rock_lantern`, `virid_jadestone_lantern`, `azure_jadestone_lantern`, `sandy_jadestone_lantern`, `umbralith_lantern`.
       - 7 `VanillaStoneSet` lanterns (`registry/block/EndStoneBlocks.java:53-69`, `complexmaterials/VanillaStoneSet.java:51`): `end_stone_lantern`, `andesite_lantern`, `diorite_lantern`, `granite_lantern`, `quartz_lantern`, `purple_lantern` (purpur), `blackstone_lantern`.

2. **`EndWoodBlocks.TENANEA_PALETTE`** (`registry/block/EndWoodBlocks.java:189-198`, referencing `blocks/TenaneaFlowersBlock.java:20-29`):
   - **Colors (4 stops)**: `RGB(250, 111, 222)` (`#FA6FDE`), `RGB(167, 89, 255)` (`#A759FF`), `RGB(120, 207, 239)` (`#78CFEF`), `RGB(255, 87, 182)` (`#FF57B6`).
   - **Parameters**: `IndexMode.HASH_XZ_PLUS_Y`, `minSaturation = 0.5F`.
   - **Applied to (1 block, world-only)**:
     - `betterend:tenanea_flowers` (`registry/block/EndWoodBlocks.java:200-209`): `TINT.world(TinterKeys.PALETTE_CYCLE, () -> TENANEA_PALETTE)`. Models `tenanea_flowers_bottom.json` and `tenanea_flowers_middle.json` use `tintindex: 0` on all crossed quads; item uses pre-colored flat sprite `betterend:item/tenanea_flowers`.
     - Also sampled by `particle/ParticleTenaneaPetal.java:44-50` via `ClientTinterRegistry.sourceFor(EndWoodBlocks.TENANEA_FLOWERS)` to tint falling petals at spawn position.

---

### 1.2 Blockstate Property Gradient Tinting (`TinterKeys.GRADIENT`)
Both blocks below carry `EndBlockProperties.COLOR` (`IntegerProperty.create("color", 0, 7)`) computed on placement from `OpenSimplexNoise(0).eval(x * 0.1, y * 0.1, z * 0.1)` mapped to `0..7`, and use item state `color = 4`:

1. **`betterend:helix_tree_leaves`** (`registry/block/EndWoodBlocks.java:232-253`, `blocks/HelixTreeLeavesBlock.java:23-85`):
   - **Gradient**: `color` `0..7` linearly interpolated from `RGB(237, 80, 20)` (`#ED5014`) to `RGB(237, 158, 20)` (`#ED9E14`).
   - **Item constant tint** (`color=4`): `-1213420` (`0xFFED7C14`).
   - **Model**: `generated/assets/betterend/models/block/helix_tree_leaves.json` (parent `betterend:block/tint_cube`, `tintindex: 0`).

2. **`betterend:jellyshroom_cap_purple`** (`registry/block/EndWoodBlocks.java:310-332`, `blocks/JellyshroomCapBlock.java:22-54`):
   - **Gradient**: `color` `0..7` linearly interpolated from `RGB(217, 142, 255)` (`#D98EFF`) to `RGB(164, 0, 255)` (`#A400FF`).
   - **Item constant tint** (`color=4`): `-4571905` (`0xFFBA3DFF`).
   - **Model**: `generated/assets/betterend/models/block/jellyshroom_cap_purple.json` (parent `betterend:block/block_petal_colored` -> `betterend:block/tint_cube`, `tintindex: 0`).

*(Contrast: `betterend:umbrella_tree_membrane` in `blocks/UmbrellaTreeMembraneBlock.java:31-108` also has `color=0..7` via `OpenSimplexNoise(0)`, but does **not** use tinting—it dispatches `color=0..7` to 8 separate textures `umbrella_tree_membrane_0..7`.)*

---

### 1.3 Constant Dye-Color Tinting (`TinterKeys.CONST_COLOR` via `ColoredMaterial`)
Registered in `complexmaterials/ColoredMaterial.java:107-158` using vanilla `DyeColor.getMapColor().col`:

1. **16 Colored Hydralux Petal Blocks (`betterend:hydralux_petal_block_<color>`)** (`registry/block/EndDecorBlocks.java:155-164`, `blocks/HydraluxPetalColoredBlock.java:22-44`):
   - Uses raw `DyeColor.getMapColor().col` (with `0xFF000000` alpha) for both world and item tint (`tintindex: 0`), sharing `betterend:block/hydralux_petal_block_colored` (parent `betterend:block/tint_cube`):
     - `black`: `-15132391` (`#191919`), `blue`: `-13415246` (`#334CB2`), `brown`: `-10073037` (`#664C33`), `cyan`: `-11763815` (`#4C7F99`), `gray`: `-11776948` (`#4C4C4C`), `green`: `-10059981` (`#667F33`), `light_blue`: `-10053160` (`#6699D8`), `light_gray`: `-6710887` (`#999999`), `lime`: `-8401895` (`#7FCC19`), `magenta`: `-5092136` (`#B24CD8`), `orange`: `-2588877` (`#D87F33`), `pink`: `-884827` (`#F27FA5`), `purple`: `-8437838` (`#7F3FB2`), `red`: `-6737101` (`#993333`), `white`: `-1` (`#FFFFFF`), `yellow`: `-1710797` (`#E5E533`).

2. **48 Colored Bulb Vine Lanterns (3 metal families × 16 dye colors)** (`blocks/BulbVineLanternColoredBlock.java:7-29`):
   - Families:
     - `betterend:iron_bulb_lantern_<color>` (`registry/block/EndLightBlocks.java:116-125`)
     - `betterend:terminite_bulb_lantern_<color>` (`registry/block/EndMetalBlocks.java:82-92`, `complexmaterials/MetalMaterial.java:246-263`)
     - `betterend:thallasium_bulb_lantern_<color>` (`registry/block/EndMetalBlocks.java:94-102`, `complexmaterials/MetalMaterial.java:246-263`)
   - **Color Transform (`BulbVineLanternColoredBlock::boostLanternColor`, L13-19)**: Converts `DyeColor.getMapColor().col` to HSB and boosts brightness `V = (S > 0.2 ? 1.0 : V)`:
     - `black`: `-15132391` (`#191919`), `blue`: `-11964929` (`#496EFF`), `brown`: `-16768` (`#FFBE80`), `cyan`: `-8399617` (`#7FD5FF`), `gray`: `-11776948` (`#4C4C4C`), `green`: `-3276954` (`#CDFF66`), `light_blue`: `-8866305` (`#78B5FF`), `light_gray`: `-6710887` (`#999999`), `lime`: `-6291681` (`#9FFF1F`), `magenta`: `-2991361` (`#D25AFF`), `orange`: `-27076` (`#FF963C`), `pink`: `-31058` (`#FF86AE`), `purple`: `-4826369` (`#B65AFF`), `red`: `-43691` (`#FF5555`), `white`: `-1` (`#FFFFFF`), `yellow`: `-199` (`#FFFF39`).
   - **Models**: Inherit `bclib:block/bulb_lantern_ceil` and `bclib:block/bulb_lantern_floor` (`tintindex: 0` on element 0, the glowing `#overlay` bulb cube `betterend:block/bulb_vine_lantern_bulb_colored`; metal cap elements have no `tintindex`).
   - **Uncolored Bulb Lanterns (`bulb_vine_lantern`, `iron_bulb_lantern`, `terminite_bulb_lantern`, `thallasium_bulb_lantern`)**: Also inherit `bclib:block/bulb_lantern_ceil` / `_floor` (which has `tintindex: 0` on the bulb element), **but register NO tint source** (so `tintindex: 0` evaluates to `0xFFFFFFFF` untinted white over `betterend:block/bulb_vine_lantern_bulb`).

---

### 1.4 Runtime Portal Block Tinting (`EndTinterKeys.END_PORTAL`)
- **`betterend:end_portal_block`** (`registry/block/EndFunctionalBlocks.java:162-172`, `blocks/EndPortalBlock.java:43-54`, `client/render/EndTinterKeys.java:11-24`, `client/render/EndClientTinters.java:22-31`, `registry/EndPortals.java:85-93`):
  - Registered via `TINT.world(EndTinterKeys.END_PORTAL, () -> null)`.
  - Queries `EndPortals.getColor(state.getValue(EndPortalBlock.PORTAL))` (default `OVERWORLD_PORTAL_ID` `RGB(255, 255, 255)`).
  - Models `resources/assets/betterend/models/block/end_portal.json` and `end_portal_grey.json` have `tintindex: 0` on both crossed portal planes.

---

### 1.5 Unused / Legacy Tinted Models & Other Color Hooks
- **Unused Tinted Models in `resources/assets/betterend/models/block/`**:
  - `cross_no_distortion_tinted.json` and `cross_no_distortion_inverted_tinted.json` define `tintindex: 0` (exposed as `EndModels.TINTED_CROSS_NO_DISTORTION` / `TINTED_CROSS_INVERTED_NO_DISTORTION` in `client/models/EndModels.java:53-54`), but no block in 26.3 references them (`tenanea_flowers` uses its own `tenanea_flowers_bottom.json` / `middle.json`).
- **Sulfur Water Color Override (`mixin/client/BiomeColorsMixin.java:24-69`)**:
  - Mixin into `BiomeColors.getAverageWaterColor(BlockAndTintGetter, BlockPos)`. When `Configs.CLIENT_CONFIG.sulfurWaterColor` is enabled and `betterend:brimstone` (`EndStoneBlocks.BRIMSTONE`) is within a 2-block horizontal radius at the same Y:
    - Immediate 4-connected neighbors (`i < 4`): `POISON_COLOR = RGB(92, 160, 78)` (`0xFF5CA04E`).
    - Radius-2 neighbors (`i >= 4`): `STREAM_COLOR = RGB(105, 213, 244)` (`0xFF69D5F4`).
- **Biome Foliage / Grass / Water / Fog Colors (`registry/EndBiomes.java`, `world/biome/**`, `registrations.json`)**:
  - All 27 BetterEnd biomes define explicit `water_color`, `fog_color`, `water_fog_color`, and `sky_color` (`#000000`), and 20 of 27 define `foliage_color` and `grass_color` (listed in `bedrock/catalogue/generated/registrations.json` under `biomes[*].runtime.effects` and `attributes`).
- **Particle / Dust Colors & Spawn Eggs**:
  - `blocks/EndstoneDustBlock.java:24-27`: `getDustColor()` returns `0xFFE2EFA8` (`RGB(226, 239, 168)`).
  - `TintedParticleLeavesBlock`: `pythadendron_leaves`, `lacugrove_leaves`, `dragon_tree_leaves`, `tenanea_leaves`, `lucernia_leaves` (`registry/block/EndWoodBlocks.java:116,151,165,179,341`) extend vanilla `TintedParticleLeavesBlock(0.01F, p)` (tints falling leaf particles, not block quads).
  - **6 Spawn Eggs (`registry/EndEntities.java:22-87`)**: In 26.3, spawn egg items (`dragonfly_spawn_egg`, `end_slime_spawn_egg`, `end_fish_spawn_egg`, `shadow_walker_spawn_egg`, `cubozoa_spawn_egg`, `silk_moth_spawn_egg`) use dedicated 2D item textures `betterend:item/spawn_egg_<entity>` (`generated/assets/betterend/models/item/*_spawn_egg.json` with parent `minecraft:item/generated`, no `tints`).

---

## 2. Custom Block-Entity Renderers, Special Model Loaders & Non-Standard Block Visuals

### 2.1 BetterEnd Custom Block-Entity Renderers (`registry/EndBlockEntities.java`, `registry/EndBlockEntityRenders.java`)
BetterEnd registers 6 `BlockEntityType`s in `registry/EndBlockEntities.java:19-57`, of which **4 have custom `BlockEntityRenderer`s** in `registry/EndBlockEntityRenders.java:14-21`:

1. **`EndBlockEntities.PEDESTAL` -> `PedestalItemRenderer<PedestalBlockEntity>` (`client/render/PedestalItemRenderer.java:53-300`)**:
   - **Blocks (13 registered)**:
     - 12 Stone Pedestals: `flavolite_pedestal`, `violecite_pedestal`, `sulphuric_rock_pedestal`, `virid_jadestone_pedestal`, `azure_jadestone_pedestal`, `sandy_jadestone_pedestal`, `umbralith_pedestal`, `andesite_pedestal`, `diorite_pedestal`, `granite_pedestal`, `quartz_pedestal`, `purple_pedestal`.
     - 1 Crystal Pedestal: `smaragdant_crystal_pedestal`.
   - **Rendering Behavior**:
     - Renders the held `activeItem` rotating above the pedestal at `y = state.getBlock().getHeight(state)` (`1.0F` for `DEFAULT`, `0.8F` for `PEDESTAL_TOP`) + bobbing `sin((age + partialTick) / 10.0F) * 0.1F + 0.1F`.
     - Special-cases `betterend:eternal_crystal` (`EternalCrystalRenderer.render` at `scale=1.5f`), `minecraft:end_crystal` (`EndCrystalRenderer.render`), and weapons/bows (`scale=0.5f`, tilted 45°).

2. **`EndBlockEntities.ETERNAL_PEDESTAL` -> `PedestalItemRenderer<EternalPedestalEntity>` (`client/render/PedestalItemRenderer.java:101-130, 179-290`, `client/render/EternalCrystalRenderer.java`, `client/render/BeamRenderer.java`)**:
   - **Block (1)**: `betterend:eternal_pedestal` (`blocks/EternalPedestal.java`).
   - **Rendering Behavior**:
     - Renders held item (usually `betterend:eternal_crystal` via `EternalCrystalRenderer`, which uses baked model parts `"SHARDS_0..3"`, `"CORE"`, `"SHELL"` on `textures/entity/eternal_crystal.png` with 4-color HSV cycling).
     - When `ACTIVATED=true` (`state.getValue(EternalPedestal.ACTIVATED)`), also renders a vertical `BeamRenderer.renderLightBeam` (`textures/entity/end_portal_beam.png`) with lerp color between `0x0079F5` and `0xAD00FA`.
     - When an `EternalHint` vision is active (`client/effects/EternalHint.java`), renders ghost eternal crystals above the 6 ritual pedestal positions and wireframe box outlines (`RenderTypes.LINES`) at missing `flavolite_runed` portal frame positions.

3. **`EndBlockEntities.INFUSION_PEDESTAL` -> `PedestalItemRenderer<InfusionPedestalEntity>` (`client/render/PedestalItemRenderer.java:93-99, 145-169`, `client/effects/InfusionHint.java`)**:
   - **Block (1)**: `betterend:infusion_pedestal` (`blocks/InfusionPedestal.java`).
   - **Rendering Behavior**:
     - Renders held item at `height = 1.08F` (`0.88F` for `PEDESTAL_TOP`), plus during active infusion (`ritual.hasRecipe()`) rises by `progress * 0.8F` and draws a `BeamRenderer.renderLightBeam` (`alpha = progress * 0.75F`).
     - When `InfusionHint` is active, draws ghostly pedestal voxel-shape outlines (`PedestalBlock.defaultShape()`) at the 8 catalyst socket offsets (`InfusionRitual.getMap()`).

4. **`EndBlockEntities.FLOWER_POT` -> `FlowerPotItemRenderer` (`client/render/FlowerPotItemRenderer.java:53-312`, `client/render/EndFlowerPotModels.java:30-154`)**:
   - **Blocks (8)**: `end_stone_flower_pot`, `flavolite_flower_pot`, `violecite_flower_pot`, `sulphuric_rock_flower_pot`, `virid_jadestone_flower_pot`, `azure_jadestone_flower_pot`, `sandy_jadestone_flower_pot`, `umbralith_flower_pot`.
   - **Rendering Behavior**:
     - The pot itself is a normal block model (`betterend:block/<name>_flower_pot`, parent `betterend:block/flower_pot`).
     - `FlowerPotItemRenderer` dynamically renders two blocks inside the pot from `FlowerPotBlockEntity`:
       1. **Soil**: Scaled by `(0.375, 0.2575, 0.375)` at `(0.3125, 0.125, 0.3125)`.
       2. **Plant**: Scaled by `0.75` around center at `y = 0.38` (or `y = 0.25` for vanilla `block/flower_pot_cross` models).
     - `EndFlowerPotModels` (`client/render/EndFlowerPotModels.java:54-131`) overrides the plant model for 34 multi-part/tall plants using `EndFlowerPotModels.STEM` (`betterend:block/flower_pot_stem`).

5. **Block Entities WITHOUT Custom BERs (2 in BetterEnd + 1 in BCLib)**:
   - `EndBlockEntities.END_STONE_SMELTER` (`betterend:end_stone_smelter`): Uses standard block models (`end_stone_smelter.json` / `end_stone_smelter_on.json`).
   - `EndBlockEntities.HYDROTHERMAL_VENT` (`betterend:hydrothermal_vent`): Uses standard block model (`hydrothermal_vent.json`); block entity only ticks particles and updraft physics.
   - `BaseBlockEntities.FURNACE` (8 stone furnaces `*_furnace`): Uses multipart blockstates combining `<stone>_furnace` (`lit=false`) or `<stone>_furnace` + `<stone>_furnace_lit` (`bclib:block/furnace_glow` cutout overlay when `lit=true`).

---

### 2.2 Vanilla/Wover Block-Entity Renderers Used by BetterEnd Wood Sets
- **Chests (10 blocks: `<wood>_chest`)**:
  - Implementation: `net.minecraft.world.level.block.ChestBlock` (`EndWoodenComplexMaterial.java`).
  - Blockstate model (`generated/assets/betterend/models/block/<wood>_chest.json`) is **particle-only** (`{"textures": {"particle": "betterend:block/<wood>_planks"}}`).
  - In-world rendering uses vanilla `ChestRenderer` hooked by Wover's `ClientChestMaterials` (`wover-block-api-26.301.2.jar`), mapping to `assets/betterend/textures/entity/chest/<wood>_chest.png`, `<wood>_chest_left.png`, `<wood>_chest_right.png`.
  - Item model definition (`generated/assets/betterend/items/<wood>_chest.json`) uses `"type": "minecraft:special", "base": "betterend:item/<wood>_chest", "model": {"type": "minecraft:chest", "texture": "betterend:<wood>_chest"}`.
  - A static 3-box block model mapped to the 64×64 chest texture sheet is available at `src/main/resources/assets/betterend/models/block/chest_item.json` (and `bclib:block/chest_item`).
- **Standing & Wall Signs (10 `<wood>_sign` + 10 `<wood>_wall_sign`)**:
  - Implementation: `StandingSignBlock` / `WallSignBlock`.
  - In 26.3, sign geometry is baked into blockstate models (`minecraft:block/template_sign_rot_0..3` and `minecraft:block/template_wall_sign`) referencing `betterend:block/<wood>_sign` (`assets/betterend/textures/block/<wood>_sign.png`). Vanilla `SignRenderer` only draws text.
- **Ceiling & Wall Hanging Signs (11 `<wood>_hanging_sign` + 11 `<wood>_hanging_wall_sign`, including `lucernia_jellyshroom`)**:
  - Implementation: `CeilingHangingSignBlock` / `WallHangingSignBlock` (`complexmaterials/JellyLucerniaWoodMaterial.java:36-74` adds the 11th set `lucernia_jellyshroom`).
  - In 26.3, hanging sign geometry is baked into blockstate models (`minecraft:block/template_hanging_sign_rot_0..3`, `minecraft:block/template_attached_hanging_sign_rot_0..3`, `minecraft:block/template_wall_hanging_sign`) referencing `betterend:block/<wood>_hanging_sign` (`assets/betterend/textures/block/<wood>_hanging_sign.png`).
- **Shelves (10 `<wood>_shelf`) & Chiseled Bookshelves (10 `<wood>_chiseled_bookshelf`)**:
  - Implementation: `net.minecraft.world.level.block.ShelfBlock` (multipart blockstates using `minecraft:block/template_shelf_*`) and `ChiseledBookShelfBlock` (multipart blockstates using `wover:block/chiseled_bookshelf` + `minecraft:block/template_chiseled_bookshelf_slot_*`).
- **Invisible Block (`betterend:vent_bubble_column`)**:
  - `blocks/VentBubbleColumnBlock.java:46-48` returns `RenderShape.INVISIBLE`; blockstate uses `minecraft:block/air`.

---

### 2.3 Special Model Loader Mixin (`mixin/client/BlockStateModelLoaderMixin.java`) & Non-Registry Visuals
- **`BlockStateModelLoaderMixin.java:25-65`**:
  - Intercepts `BlockStateModelLoader.loadBlockStateDefinitionStack` for `minecraft:chorus_plant` and `minecraft:chorus_flower` when `Configs.CLIENT_CONFIG.customChorusPlant()` is true, redirecting them to `betterend:custom_chorus_plant` and `betterend:custom_chorus_flower`.
- **`nonRegistryVisuals` in `registrations.json` (4 entries)** and **`unresolved` in `asset-provenance.json`**:
  1. `betterend:custom_chorus_flower` (`resources/assets/betterend/blockstates/custom_chorus_flower.json`) — client visual override for vanilla chorus flower.
  2. `betterend:custom_chorus_plant` (`resources/assets/betterend/blockstates/custom_chorus_plant.json`) — client visual override for vanilla chorus plant.
  3. `betterend:bulb_lantern` (`resources/assets/betterend/blockstates/bulb_lantern.json`) — orphan legacy file (the actual registered block is `betterend:bulb_vine_lantern`, which uses `generated/assets/betterend/blockstates/bulb_vine_lantern.json`).
  4. `betterend:ivis_vine` (`resources/assets/betterend/blockstates/ivis_vine.json`) — orphan legacy blockstate (not a registered block).
  - Similarly, `asset-provenance.json` flags 4 orphan legacy models in `src/main/resources/assets/betterend/models/` that are not referenced by any registered blockstate (`aurora_crystal_2.json`, `chorus_outer_stairs.json`, `lumecon_middle_big.json`, `lumecorn_bottom_big.json`, `lumecorn_bottom_small.json`—registered `lumecorn` uses `generated/assets/betterend/models/block/lumecorn_bottom_big.json` and `lumecorn_bottom_small.json` which point to `betterend:block/lumecorn_stem`).
- **Crystalite Armor Custom 3D Models (`item/model/CrystaliteArmorRenderer.java:36-95`)**:
  - Registered via `ArmorRenderer.register` in `BetterEndClient.java:53` for `crystalite_helmet`, `crystalite_chestplate`, `crystalite_leggings`, `crystalite_boots`.
  - Uses custom `HumanoidModel` subclasses (`CrystaliteHelmetModel`, `CrystaliteChestplateModel`, `CrystaliteLeggingsModel`, `CrystaliteBootsModel`, `CrystaliteArmorParts`) with translucent render layer (`RenderTypes::ArmorTranslucent`) and dual texture pass (`textures/models/armor/crystalite_layer_1.png` + `crystalite_overlay_layer_1.png`, and `layer_2` for leggings/boots).
- **Special 26.3 Item Definitions (`generated/assets/betterend/items/*.json`)**:
  - **3 Spears (`aeternium_spear`, `terminite_spear`, `thallasium_spear`)**: `"type": "minecraft:select"` on `"property": "minecraft:display_context"` switching between 2D icon `betterend:item/<metal>_spear` (for `["gui", "ground", "fixed", "on_shelf"]`) and 3D `betterend:item/<metal>_spear_in_hand` (parent `minecraft:item/spear_in_hand`).
  - **2 Elytras (`elytra_armored`, `elytra_crystalite`)**: `"type": "minecraft:condition"` on `"property": "minecraft:broken"` switching between `<id>` and `<id>_broken`. Worn wing textures live at `textures/entity/equipment/wings/elytra_armored.png` and `elytra_crystalite.png` (and `textures/entity/elytra_*.png`).
  - **10 Chests (`<wood>_chest`)**: `"type": "minecraft:special"` with `"model": {"type": "minecraft:chest", "texture": "betterend:<wood>_chest"}`.

---

## 3. Entities: 6 Wildlife Families, 20 Boats/Rafts, and `bclib:chair`

### 3.1 The 6 Wildlife Families
| Entity ID | Entity Class & Hitbox (`w × h`) | Model Class & Texture Sheet (`w × h`) | Renderer Class & Render Type | Variants, Scale & Textures (`assets/betterend/textures/entity/...`) | Animations (`setupAnim`) & Special Layers |
|---|---|---|---|---|---|
| `betterend:dragonfly` | `DragonflyEntity` (`entity/DragonflyEntity.java:37`) `0.6 × 0.5` | `DragonflyEntityModel` (`entity/model/DragonflyEntityModel.java:15-130`) `64 × 64` | `RendererEntityDragonfly` (`entity/render/RendererEntityDragonfly.java:16-39`), `entityCutoutCull`, shadow `0.5f` | 1 variant: `dragonfly.png` + emissive `EyesLayer` `dragonfly_glow.png` | `wing_1..4.zRot` oscillate at `ageInTicks * 2F`; `head.xRot`, `tail.xRot`, `tail_2.xRot` bob at `ageInTicks * 0.05F`. |
| `betterend:end_slime` | `EndSlimeEntity` (`entity/EndSlimeEntity.java:50`) `0.5 × 0.5 * size` | `EndSlimeEntityModel` (`entity/model/EndSlimeEntityModel.java:24-157`) `64 × 32` (2 layers: inner + shell) | `RendererEntityEndSlime` (`entity/render/RendererEntityEndSlime.java:22-176`), inner `entityCutoutCull`, outer shell `entityTranslucent` | **4 variants (`VARIANT` 0..3)**:<br>• `0` (chorus, default): `end_slime/end_slime.png` + `end_slime_glow.png` (shell alpha `0xA0FFFFFF`, renders `crop` top)<br>• `1` (mossy, Foggy Mushroomland): `end_slime/end_slime_mossy.png` + `end_slime_glow.png` (no top)<br>• `2` (lake, Megalake/Grove): `end_slime/end_slime_lake.png` + `end_slime_lake_glow.png` (renders 4-petal `flower` top in both cutout & glow)<br>• `3` (amber, Amber Land): `end_slime/end_slime_amber.png` + `end_slime_amber_glow.png` (renders 2-cross `crop` top) | Squish/stretch matrix scale in `RendererEntityEndSlime.scale()` (L92-99) driven by `state.size` and `state.squish`. |
| `betterend:end_fish` | `EndFishEntity` (`entity/EndFishEntity.java:45`) `0.5 × 0.5` | `EndFishEntityModel` (`entity/model/EndFishEntityModel.java:15-88`) `32 × 32` | `RendererEntityEndFish` (`entity/render/RendererEntityEndFish.java:19-80`), `entityCutoutCull`, shadow `0.5f` | **8 variants (`VARIANT` 0..7)**:<br>• `0..4` (normal): `end_fish/end_fish_0..4.png` + emissive `end_fish_0..4_glow.png`<br>• `5..7` (Sulphur Springs biome): `end_fish/end_fish_5..7.png` + emissive `end_fish_5..7_glow.png`<br>• **Scale (`SCALE` 0..15)**: `SCALE / 32F + 0.75F` (`0.75..1.21875`). | `flipper.yRot`, `fin_left.yRot`, `fin_right.yRot` oscillate at `sin(ageInTicks * 0.1)`; `fin_top.xRot`, `fin_bottom.xRot` at `sin(ageInTicks * 0.05)`. |
| `betterend:shadow_walker` | `ShadowWalkerEntity` (`entity/ShadowWalkerEntity.java:29`) `0.6 × 1.95` | Vanilla `HumanoidModel` (`ModelLayers.PLAYER`, `64 × 64`) | `RendererEntityShadowWalker` (`entity/render/RendererEntityShadowWalker.java:13-31`), extends `HumanoidMobRenderer`, shadow `0.5f` | 1 variant: `shadow_walker.png` (no glow layer; spawns `ASH`, `SMOKE`, `ENTITY_EFFECT` particles in `tick()`). | Standard humanoid walk/attack animations. |
| `betterend:cubozoa` | `CubozoaEntity` (`entity/CubozoaEntity.java:41`) `0.6 × 1.0` | `CubozoaEntityModel` (`entity/model/CubozoaEntityModel.java:16-82`) `48 × 48` | `RendererEntityCubozoa` (`entity/render/RendererEntityCubozoa.java:19-81`), `entityTranslucent`, shadow `0.5f` | **2 variants (`VARIANT` 0..1)**:<br>• `0` (normal): `cubozoa/cubozoa.png` + emissive `cubozoa_glow.png`<br>• `1` (Sulphur Springs biome): `cubozoa/cubozoa_sulphur.png` + emissive `cubozoa_sulphur_glow.png`<br>• **Scale (`SCALE` 0..15)**: `SCALE / 32F + 0.75F` (`0.75..1.21875`). | Body pulses (`model.yScale = sin(t*0.13)*0.1 + 0.9`, `xScale/zScale = sin(t*0.13 + 3.14)*0.1 + 0.9`); 4 tentacles sway (`tentacle[i].xRot = sin(t*0.13)*0.15`). |
| `betterend:silk_moth` | `SilkMothEntity` (`entity/SilkMothEntity.java:54`) `0.6 × 0.6` | `SilkMothEntityModel` (`entity/model/SilkMothEntityModel.java:20-187`) `64 × 64` | `SilkMothEntityRenderer` (`entity/render/SilkMothEntityRenderer.java:13-29`), `entityCutout`, shadow `0.5f` | 1 variant: `silk_moth.png` (no glow layer). Baby scale `0.6F` (`root.y = 8.0F`). | Wings flap at `sin(ageInTicks * 2F) * 0.4F ± 0.3927F`; head, tendrils, abdomen, and legs sway at `0.03F..0.07F`. |

### 3.2 The 20 Boats & Rafts (`de.ambertation.wover.sets.api.blocks.types.Boat`)
- **Hitbox**: `width = 1.375`, `height = 0.5625`, `category = MISC`.
- **18 Boats (9 wood sets × 2: `<wood>_boat` and `<wood>_chest_boat`, `isRaft = false`)**:
  - Wood sets: `dragon_tree`, `helix_tree`, `jellyshroom`, `lacugrove`, `lucugrove` -> `lucernia`, `mossy_glowshroom`, `pythadendron`, `tenanea`, `umbrella_tree`.
  - Entity classes: Vanilla `Boat` and `ChestBoat`; Entity Textures: `assets/betterend/textures/entity/boat/<wood>_boat.png` and `assets/betterend/textures/entity/chest_boat/<wood>_chest_boat.png`.
- **2 Rafts (1 wood set × 2: `end_lotus_raft` and `end_lotus_chest_raft`, `isRaft = true`)**:
  - Entity classes: Vanilla `Raft` and `ChestRaft`; Entity Textures: `assets/betterend/textures/entity/boat/end_lotus_raft.png` and `assets/betterend/textures/entity/chest_boat/end_lotus_chest_raft.png`.

### 3.3 `bclib:chair` Shared Seating Entity
- **Entity Definition**: `org.betterx.bclib.furniture.entity.EntityChair` (`BaseBlockEntities.CHAIR` in `bclib-26.301.2.jar`), ID `bclib:chair`, `width = 0.5`, `height = 0.8`, `fireImmune`, `noSummon`.
- **Spawning & Lifecycle (`org.betterx.bclib.furniture.block.AbstractChair`)**: Spawned on demand when a player interacts with or an eligible mob boards any of the **33 seating blocks** across the 11 wood sets (`<wood>_chair`, `<wood>_bar_stool`, `<wood>_taburet` for the 10 main woods + `lucernia_jellyshroom`). Discards itself in `tick()` when it has no passengers or its host `AbstractChair` block is removed.

---

## 4. External Model Parent Templates (`bclib:*`, `wover:*`, `minecraft:*`)

### 4.1 `bclib:*` Model Parents (11 distinct parents in `bclib-26.301.2.jar`)
| External Parent ID | Referenced By (Count) | Definition Path in `bclib-26.301.2.jar` | Local Copy in BetterEnd `src/main/resources/assets/betterend/`? | Texture Slots & `tintindex` |
|---|---|---|---|---|
| `bclib:block/anvil` | 9 models (`aeternium_anvil_0..2`, `terminite_anvil_0..2`, `thallasium_anvil_0..2`) | `assets/bclib/models/block/anvil.json` (4 elements) | Yes: `patterns/block/anvil.json` | `#particle`, `#front`, `#back`, `#top`, `#panel`, `#bottom`; no tint |
| `bclib:block/bar_stool` | 11 models (`<wood>_bar_stool`) | `assets/bclib/models/block/bar_stool.json` (13 elements) | **No** (JAR only) | `#particle`, `#texture` (wood), `#cloth` (seat); no tint |
| `bclib:block/bulb_lantern_ceil` | 51 models (3 uncolored + 48 colored `*_bulb_lantern`) | `assets/bclib/models/block/bulb_lantern_ceil.json` (5 elements) | Yes: `patterns/block/bulb_lantern_ceil.json` | `#overlay`, `#metal`, `#particle`; **`tintindex: 0` on element 0 (bulb)** |
| `bclib:block/bulb_lantern_floor` | 51 models (3 uncolored + 48 colored `*_bulb_lantern_floor`) | `assets/bclib/models/block/bulb_lantern_floor.json` (5 elements) | Yes: `patterns/block/bulb_lantern_floor.json` | `#overlay`, `#metal`, `#particle`; **`tintindex: 0` on element 0 (bulb)** |
| `bclib:block/chair` | 11 models (`<wood>_chair`) | `assets/bclib/models/block/chair.json` (17 elements, Y up to 22) | **No** (JAR only) | `#particle`, `#texture`; no tint |
| `bclib:block/cross_shaded` | 16 models (`*_stalactite_0..3`) | `assets/bclib/models/block/cross_shaded.json` (2 elements, `shade: true`) | Yes: `patterns/block/cross_shaded.json` | `#cross`, `#particle`; no tint |
| `bclib:block/furnace_glow` | 8 models (`<stone>_furnace_lit`) | `assets/bclib/models/block/furnace_glow.json` (2 elements: cube + unshaded front glow quad at Z=-0.02) | Yes: `patterns/block/furnace_glow.json` | `#particle`, `#top`, `#front`, `#side`, `#glow`; no tint |
| `bclib:block/path` | 10 models (`<moss>_path`) | `assets/bclib/models/block/path.json` (1 element, height 15) | Yes: `models/block/path.json` & `patterns/block/path.json` | `#particle`, `#top`, `#bottom`, `#side`; no tint |
| `bclib:block/stone_lantern_ceil` | 14 models (`<stone>_lantern`) | `assets/bclib/models/block/stone_lantern_ceil.json` (12 elements) | Yes: `patterns/block/stone_lantern_ceil.json` | `#particle`, `#texture`, `#top`, `#crystal`, `#bottom`; **`tintindex: 0` on element 11 (`#crystal`)** |
| `bclib:block/stone_lantern_floor` | 14 models (`<stone>_lantern_floor`) | `assets/bclib/models/block/stone_lantern_floor.json` (12 elements) | Yes: `patterns/block/stone_lantern_floor.json` | `#particle`, `#texture`, `#top`, `#crystal`, `#bottom`; **`tintindex: 0` on element 11 (`#crystal`)** |
| `bclib:block/taburet` | 11 models (`<wood>_taburet`) | `assets/bclib/models/block/taburet.json` (7 elements) | **No** (JAR only) | `#particle`, `#top`, `#texture`; no tint |

### 4.2 `wover:*` Model Parents (3 distinct parents in `wover-block-api-26.301.2.jar`)
| External Parent ID | Referenced By (Count) | Definition Path in `wover-block-api-26.301.2.jar` | Texture Slots & Elements |
|---|---|---|---|
| `wover:block/chiseled_bookshelf` | 10 models (`<wood>_chiseled_bookshelf`) | `assets/wover/models/block/chiseled_bookshelf.json` | 1 element (north face omitted because slots cover north face); `#top`, `#side`, `#back`, `#particle` |
| `wover:block/chiseled_bookshelf_inventory` | 10 models (`<wood>_chiseled_bookshelf_inventory`) | `assets/wover/models/block/chiseled_bookshelf_inventory.json` | 1 element (full 6-face cube with `#front` on north); `#top`, `#side`, `#front`, `#back`, `#particle` |
| `wover:block/composter` | 10 models (`<wood>_composter`) | `assets/wover/models/block/composter.json` | 5 elements (hollow bin walls + bottom); `#particle`, `#top`, `#bottom`, `#side`, `#inside` |
