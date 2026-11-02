# BetterEnd Java Reference Research Report: Wildlife, Equipment/Gliding, Transport/Respawn & Functional Blocks

All findings below are anchored to exact file paths (relative to `bedrock/.work/java-reference/source/src/main/java/org/betterx/betterend/`) and line numbers.

---

## 1. Wildlife & Silk Moth Ecology (`CAP-007`, `ECO-001`)

### 1.1 Wildlife Entities Overview (`registry/EndEntities.java` L21–112)

| Entity ID | Class | Category | Hitbox (W × H) | Fixed Size? | Spawn Egg Colors (Base / Dots) |
|---|---|---|---|---|---|
| `betterend:dragonfly` | `entity/DragonflyEntity.java` | `AMBIENT` | `0.6F × 0.5F` (`EndEntities.java:25`) | `true` | `RGB(32, 42, 176)` / `RGB(115, 225, 249)` (`L27-28`) |
| `betterend:end_slime` | `entity/EndSlimeEntity.java` | `MONSTER` | `0.5F × 0.5F` base (`EndEntities.java:36`) | `false` (scales by size) | `RGB(28, 28, 28)` / `RGB(99, 11, 99)` (`L38-39`) |
| `betterend:end_fish` | `entity/EndFishEntity.java` | `WATER_AMBIENT` | `0.5F × 0.5F` (`EndEntities.java:47`) | `true` (uses `SCALE` attr) | `RGB(3, 50, 76)` / `RGB(120, 206, 255)` (`L49-50`) |
| `betterend:shadow_walker` | `entity/ShadowWalkerEntity.java` | `MONSTER` | `0.6F × 1.95F` (`EndEntities.java:58`) | `true` | `RGB(30, 30, 30)` / `RGB(5, 5, 5)` (`L60-61`) |
| `betterend:cubozoa` | `entity/CubozoaEntity.java` | `WATER_AMBIENT` | `0.6F × 1.0F` (`EndEntities.java:69`, eyeHeight `0.5F` `CubozoaEntity.java:136`) | `true` (uses `SCALE` attr) | `RGB(151, 77, 181)` / `RGB(93, 176, 238)` (`L71-72`) |
| `betterend:silk_moth` | `entity/SilkMothEntity.java` | `AMBIENT` | `0.6F × 0.6F` (`EndEntities.java:80`) | `true` | `RGB(198, 138, 204)` / `RGB(242, 220, 236)` (`L82-83`) |

---

### 1.2 Detailed Per-Entity Mechanics

#### A. `DragonflyEntity` (`entity/DragonflyEntity.java` L37–229)
- **Attributes (`L47-54`)**: `MAX_HEALTH = 8.0D`, `FOLLOW_RANGE = 16.0D`, `FLYING_SPEED = 1.0D`, `MOVEMENT_SPEED = 0.1D`, `xpReward = 1` (`L44`).
- **Movement & Physics**: Extends `DespawnableAnimal`. Uses `DragonflyLookControl` (`L92-104`), `FlyingMoveControl(this, 20, true)` (`L42`), `FlyingPathNavigation` (`L57-67`), `isNoGravity() = true` (`L77`), `isPushable() = false` (`L83`), `causeFallDamage() = false` (`L106`), `canBeLeashed() = false` (`L226`).
- **AI Goals (`L69-75`)**: `FloatGoal` (1), `BreedGoal(1.0D)` (2), `FollowParentGoal(1.0D)` (3), `WanderAroundGoal` (4 — hovers 1–3 blocks above ground or water, searches within ±16 XZ / ±8 Y for open air, `L118-206`).
- **Breeding / Food (`L88-90`, `L219-222`)**: `isFood(ItemStack)` returns `false` (cannot be player-fed/bred; `getBreedOffspring` spawns `EndEntities.DRAGONFLY`).
- **Drops**: No custom `dropFromLootTable` and no entity loot table JSON; drops only `1 XP`.
- **Textures (`entity/render/RendererEntityDragonfly.java` L17–18)**: `textures/entity/dragonfly.png` + emissive layer `textures/entity/dragonfly_glow.png`.
- **Spawn Rules (`EndEntities.java:91`)**: `aboveGround(2).maxNearby(4, 32).buildNoRestrictions(Types.MOTION_BLOCKING)`.
- **Biome Spawns**:
  - `FoggyMushroomlandBiome.java:47` (weight `80`, group `2–5`)
  - `MegalakeBiome.java:44` (weight `50`, group `1–3`)
  - `MegalakeGroveBiome.java:43` (weight `20`, group `1–3`)

#### B. `EndSlimeEntity` (`entity/EndSlimeEntity.java` L49–462, `mixin/common/SlimeMixin.java` L13–32)
- **Attributes (`L80-87`)**: Base `MAX_HEALTH = 1.0D`, `ATTACK_DAMAGE = 1.0D`, `FOLLOW_RANGE = 16.0D`, `MOVEMENT_SPEED = 0.15D` (overwritten by vanilla `Slime#setSize`: `health = size^2`, `attack = size`, `speed = 0.2 + 0.1 * size`).
- **Variants (`L51-54`, `L99-110`, `L196-230`; `entity/render/RendererEntityEndSlime.java` L166–175)**: Stored in synched `EntityDataAccessor<Integer> VARIANT` (`"Variant"` byte in NBT):
  - `0` (**Default / Chorus**): `textures/entity/end_slime/end_slime.png` + `end_slime_glow.png` (uses `modelDefault` with inner crop `L44`).
  - `1` (**Mossy** — `FOGGY_MUSHROOMLAND`): `textures/entity/end_slime/end_slime_mossy.png` + `end_slime_glow.png` (uses `modelLake`, no inner crop).
  - `2` (**Lake** — `MEGALAKE` & `MEGALAKE_GROVE`): `textures/entity/end_slime/end_slime_lake.png` + `end_slime_lake_glow.png` (uses `modelLake` with flower + glowing flower overlay `L43`).
  - `3` (**Amber** — `AMBER_LAND`): `textures/entity/end_slime/end_slime_amber.png` + `end_slime_amber_glow.png` (uses `modelDefault` with inner crop).
- **Splitting (`EndSlimeEntity.java:137-173`, `SlimeMixin.java:18-31`)**: Intercepts `Slime#remove` when `this instanceof EndSlimeEntity`. If `!level.isClientSide && size > 1 && isDeadOrDying()`, spawns `2 + random.nextInt(3)` (`2..4`) child `EndSlimeEntity` with `size = size / 2` and copies parent's `getSlimeType()` (`setSlimeType(getSlimeType())`).
- **Drops (`L176-194`)**: Drops `Items.SLIME_BALL`: `maxCount = this.getSize()`, `minCount = Math.max(1, maxCount >> 1) + looting`, count = `MHelper.randRange(minCount, maxCount, random)` (or `maxCount` if `minCount >= maxCount`).
- **Spawn Rules (`EndEntities.java:95-101`, `EndSlimeEntity.java:232-277`)**: `notPeaceful().maxNearby(6, 32).onlyOnValidBlocks().customRule(EndSlimeEntity::canSpawn).buildOnGround(Types.MOTION_BLOCKING_NO_LEAVES)`. `canSpawn` requires block below in `#c:end_stones`; always passes in `CHORUS_FOREST` and `MEGALAKE`, 50% (`nextBoolean()`) in `MEGALAKE_GROVE`, 1-in-8 (`nextInt(8) == 0`) in `FOGGY_MUSHROOMLAND` and `AMBER_LAND`, else 1-in-4 (`nextInt(4) == 0`) if `Blocks.WATER` exists within `±32 XZ, ±8 Y`.
- **Biome Spawns**:
  - `AmberLandBiome.java:48` (`30`, `1–2`), `ChorusForestBiome.java:51` (`5`, `1–2`), `FoggyMushroomlandBiome.java:50` (`10`, `1–2`), `MegalakeBiome.java:47` (`5`, `1–2`), `MegalakeGroveBiome.java:46` (`5`, `1–2`).

#### C. `EndFishEntity` (`entity/EndFishEntity.java` L45–188, `item/EndBucketItem.java` L22–59)
- **Attributes (`L153-170`)**: `MAX_HEALTH = 2.0`, `FOLLOW_RANGE = 16.0`, `MOVEMENT_SPEED = 0.75`. Scale is randomized `SCALE = random.nextInt(16)` (`0..15`, `"Scale"` byte in NBT) and applied to `Attributes.SCALE` as `getScale() = this.getEntityScale() / 32F + 0.75F` (`0.75` to `1.21875`).
- **Variants (`L46-56`, `L72-75`; `entity/render/RendererEntityEndFish.java` L74–79)**:
  - `VARIANTS_NORMAL = 5` (`0..4`, default)
  - `VARIANTS_SULPHUR = 3` (`5..7`, assigned when spawned in `EndBiomes.SULPHUR_SPRINGS`)
  - Textures: `textures/entity/end_fish/end_fish_<0..7>.png` + emissive `textures/entity/end_fish/end_fish_<0..7>_glow.png`.
- **Bucket Interaction (`L104-120`, `registry/item/EndFoodItems.java:72-77`)**: `getBucketItemStack()` returns `EndFoodItems.BUCKET_END_FISH` (`betterend:bucket_end_fish`), saving `"variant"` and `"scale"` into `DataComponents.BUCKET_ENTITY_DATA`.
- **Drops (`L173-187`)**: Drops `1` `EndFoodItems.END_FISH_COOKED` (`betterend:end_fish_cooked`) if killed by fire (`DamageTypeTags.IS_FIRE`) or by a `LivingEntity` holding a main-hand weapon with `Enchantments.FIRE_ASPECT > 0`; otherwise drops `1` `EndFoodItems.END_FISH_RAW` (`betterend:end_fish_raw`).
- **Spawn Rules (`EndEntities.java:110`)**: `maxNearby(16, 16).buildInWater(Types.MOTION_BLOCKING_NO_LEAVES)`.
- **Biome Spawns**:
  - `FoggyMushroomlandBiome.java:48` (`20`, `2–5`), `MegalakeBiome.java:45` (`50`, `3–8`), `MegalakeGroveBiome.java:44` (`20`, `3–8`), `SulphurSpringsBiome.java:59` (`50`, `3–8`).

#### D. `ShadowWalkerEntity` (`entity/ShadowWalkerEntity.java` L35–151)
- **Attributes (`L43-51`)**: `MAX_HEALTH = 20.0` (Monster default), `FOLLOW_RANGE = 35.0`, `MOVEMENT_SPEED = 0.15`, `ATTACK_DAMAGE = 4.5`, `ARMOR = 2.0`, `SPAWN_REINFORCEMENTS_CHANCE = 0.0`.
- **AI & Behavior (`L39-124`)**:
  - Goals: `MeleeAttackGoal(1.0D, false)` (2), `WaterAvoidingRandomStrollGoal(1.0D)` (7), `LookAtPlayerGoal(8.0F)` (8), `RandomLookAroundGoal` (8), `NearestAttackableTargetGoal<>(Player.class, true)` (2).
  - Emits `ParticleTypes.ASH`, `ParticleTypes.SMOKE`, and `ColorParticleOption.create(ParticleTypes.ENTITY_EFFECT, 0xFF000000)` every tick (`L60-90`).
  - Silent footsteps (`playStepSound` is a no-op, `L106-107`).
  - **Blindness on Hit (`doHurtTarget`, `L115-123`)**: On melee hit against a `LivingEntity` that does not currently have `MobEffects.BLINDNESS`, applies `new MobEffectInstance(MobEffects.BLINDNESS, 60)` (`3` seconds, amplifier `0`).
- **Drops**: No custom `dropFromLootTable` and no entity loot table JSON; drops only `5 XP`.
- **Texture (`entity/render/RendererEntityShadowWalker.java` L15)**: `textures/entity/shadow_walker.png`.
- **Spawn Rules (`EndEntities.java:103-107`)**: `vanillaHostile().onlyOnValidBlocks().maxNearby(8, 64).buildOnGround(Types.MOTION_BLOCKING)`.
- **Biome Spawns**: `ShadowForestBiome.java:51` (weight `80`, group `2–4`).

#### E. `CubozoaEntity` (`entity/CubozoaEntity.java` L47–168)
- **Attributes (`L116-133`)**: `MAX_HEALTH = 2.0`, `FOLLOW_RANGE = 16.0`, `MOVEMENT_SPEED = 0.5`. Scale is randomized `SCALE = random.nextInt(16)` (`0..15`, `"Scale"` byte in NBT) and applied to `Attributes.SCALE` as `this.getEntityScale() / 32F + 0.75F`.
- **Variants (`L66-70`; `entity/render/RendererEntityCubozoa.java` L74–80)**:
  - `0` (**Normal**): `textures/entity/cubozoa/cubozoa.png` + `cubozoa_glow.png`
  - `1` (**Sulphur** — spawned in `EndBiomes.SULPHUR_SPRINGS`): `textures/entity/cubozoa/cubozoa_sulphur.png` + `cubozoa_sulphur_glow.png`
- **Bucket Interaction (`L98-114`, `EndFoodItems.java:78-83`)**: `EndFoodItems.BUCKET_CUBOZOA` (`betterend:bucket_cubozoa`), saving `"Variant"` and `"Scale"`.
- **Contact Sting (`playerTouch`, `L154-167`)**: When a survival/adventure `Player` touches a `CubozoaEntity` and takes `0.5F` `mobAttack` damage:
  - Plays `SoundEvents.PUFFER_FISH_STING` (`GameEvent.ENTITY_INTERACT`, `ClientboundGameEventPacket.PUFFER_FISH_STING`).
  - With **50% chance** (`random.nextBoolean()`), applies `new MobEffectInstance(MobEffects.POISON, 20, 0)` (`1` second).
- **Drops (`L140-146`)**: Drops `random.nextInt(3)` (`0..2`) `EndResourceItems.GELATINE` (`betterend:gelatine`).
- **Spawn Rules (`EndEntities.java:111`)**: `maxNearby(16, 16).buildInWater(Types.MOTION_BLOCKING_NO_LEAVES)`.
- **Biome Spawns**:
  - `FoggyMushroomlandBiome.java:49` (`10`, `3–8`), `MegalakeBiome.java:46` (`50`, `3–8`), `MegalakeGroveBiome.java:45` (`50`, `3–8`), `SulphurSpringsBiome.java:60` (`50`, `3–8`).

#### F. `SilkMothEntity` (`entity/SilkMothEntity.java` L55–351)
- **Attributes (`L68-76`)**: `MAX_HEALTH = 2.0D`, `FOLLOW_RANGE = 16.0D`, `FLYING_SPEED = 0.4D`, `MOVEMENT_SPEED = 0.1D`, `xpReward = 1` (`L65`).
- **AI Goals (`L113-119`)**: `ReturnToHiveGoal` (1), `BreedGoal(1.0D)` (2), `TemptGoal(1.25, BLOSSOM_BERRY, false)` (3), `FollowParentGoal(1.25D)` (4), `WanderAroundGoal` (5).
- **Breeding / Food (`L115-116`, `L172-174`, `L343-345`)**: `isFood(ItemStack)` returns `stack.is(EndFoodItems.BLOSSOM_BERRY)` (`betterend:blossom_berry`). Leashable (`canBeLeashed() = true`, `L85`).
- **Drops (`L177-192`)**: Drops `EndResourceItems.SILK_FIBER` (`betterend:silk_fiber`), `minCount = 0 + looting`, `maxCount = Math.min(2, 1 + looting)`, count = `MHelper.randRange(minCount, maxCount, random)`.
- **Hive NBT (`L97-111`, `L149-168`)**: Stores `"HivePos"` (`BlockPos`) and `"HiveWorld"` (`Identifier` of dimension) in NBT.
- **Texture (`entity/render/SilkMothEntityRenderer.java` L14)**: `textures/entity/silk_moth.png`.
- **Spawn Rules (`EndEntities.java:92`)**: `aboveGround(2).maxNearby(4, 32).buildNoRestrictions(Types.MOTION_BLOCKING)`.
- **Biome Spawns**: `BlossomingSpiresBiome.java:52` (weight `5`, group `1–2`).

---

### 1.3 `SilkMothNestBlock` & `SilkMothHiveBlock` (`blocks/SilkMothNestBlock.java` L49–216, `blocks/SilkMothHiveBlock.java` L38–132, `world/features/SilkMothNestFeature.java` L31–82)

| Property / Mechanic | `betterend:silk_moth_nest` (`SilkMothNestBlock`) | `betterend:silk_moth_hive` (`SilkMothHiveBlock`) |
|---|---|---|
| **Block Properties** | `ACTIVE` (`boolean`, default `true`), `FACING` (`HORIZONTAL_FACING`), `FULLNESS` (`0..3`, default `0`) (`L53-65`) | `FACING` (`HORIZONTAL_FACING`), `FULLNESS` (`0..3`, default `0`) (`L39-48`) |
| **Hardness / Res / Sound / Tool** | `0.5F` / `0.1F`, `SoundType.WOOL`, `randomTicks`, mineable with **Shears** (`EndFunctionalBlocks.java:72-85`) | `0.5F` / `0.1F`, `SoundType.WOOL`, `randomTicks`, mineable with **Axe** (`EndFunctionalBlocks.java:87-95`) |
| **Multiblock / Survival** | `ACTIVE=false` is top hanging stalk (`box(6,0,6,10,16,10)`, `L50`): `canSurvive` (`L79-85`) requires block above in `#minecraft:leaves` or `#minecraft:logs`; drops nothing (`L137-143`). `ACTIVE=true` is main nest (`box(0,0,0,16,16,16)`, `L51`), drops self (`L143`). Player placement places `ACTIVE=true` (`L97`). Worldgen (`SilkMothNestFeature.java:65-75`) hangs `ACTIVE=false` under Tenanea leaves and `ACTIVE=true` below it. | Single full block (`16×16×16`). Crafted from 6 `tenanea_planks`, 2 `tenanea_leaves`, 1 `silk_moth_matrix` (`recipe/silk_moth_hive.json`). Always drops self. |
| **Spawning (`randomTick`)** | (`L157-183`): Requires `ACTIVE == true`, **`random.nextBoolean()` (50% chance)**, `level.isEmptyBlock(pos.relative(FACING))`, and `<= 6` `SILK_MOTH` within `AABB(pos).inflate(16)`. Spawns `SilkMothEntity` at `front + (0.5, 0.5, 0.5)` with delta `dir * 0.4`, sets `moth.setHive(world, pos)`, plays `SoundEvents.BEEHIVE_EXIT`. | (`L75-95`): Same, except **no `ACTIVE` check and no `random.nextBoolean()` gate (100% on `randomTick`)** if front is empty and `<= 6` moths within `AABB(pos).inflate(16)`. |
| **Moth Returning (`ReturnToHiveGoal`)** | (`SilkMothEntity.java:260-340`): Activates when `hivePos != null`, `hiveWorld == level()`, `navigation.isDone()`, `random.nextInt(8) == 0`, and `distanceToSqr(hivePos) < 16384` (`128` blocks). Pathfinds to `hivePos.relative(FACING)`. On arrival (`\|dx\|+\|dy\|+\|dz\| < 1`): if `fullness < 3` and **`random.nextBoolean()` (50% chance)**, increments `fullness` by **`+1`**. Plays `BEEHIVE_ENTER` and calls `this.discard()`. | Same pathfinding, except on arrival (`SilkMothEntity.java:318-323`): if `fullness < 3`, **always (100%)** adds `MHelper.randRange(1, 2, random)` (**`+1` or `+2`**), clamped to `3`. Plays `BEEHIVE_ENTER` and calls `this.discard()`. |
| **Harvesting (`useItemOn`)** | (`L186-215`): Requires `ACTIVE == true`, `FULLNESS == 3`, and **Shears** (`LootUtil.isShear(stack)`) in `MAIN_HAND` (bare hand returns `FAIL`). Sets `FULLNESS = 0`, damages shears by `1`, plays `SoundEvents.BEEHIVE_SHEAR`, and drops at `pos + dir + 0.5`:<br>• **`1..4` `silk_fiber`** (`randRange(1, 4)`)<br>• **`1..3` `silk_moth_matrix`** (`randRange(1, 3)`) | (`L98-131`): Requires `FULLNESS == 3` and **Shears** in `MAIN_HAND` (bare hand returns `FAIL`). Sets `FULLNESS = 0`, damages shears by `1`, plays `SoundEvents.BEEHIVE_SHEAR`, and drops at `pos + dir + 0.5`:<br>• **`8..16` `silk_fiber`** (`randRange(8, 16)`)<br>• **25% chance (`random.nextInt(4) == 0`) for `1` `silk_moth_matrix`** |
| **Water / Lava Break (`updateShape`)** | (`L102-122`): If `ACTIVE == true` and either `getFluidState(pos)` or `getFluidState(pos.above())` is not empty, calls `world.destroyBlock(pos, true)`! | Standard block (does not self-break from fluids above). |

---

## 2. Equipment, Hammers, Armor Effects & Gliding (`CAP-012`, `EQP-001`)

### 2.1 Tool Materials & Tiers (`item/material/EndToolMaterial.java` L14–35, `item/material/EndToolTier.java` L7–33, `item/material/ToolsWithHeadsSet.java` L72–294, `item/material/AeterniumSet.java` L22–115, `testmod/gametest/ToolComponentGameTest.java` L117–225)

| Material | Mining Level / Tag | Anvil Level | Durability | Mining Speed | Base Attack Bonus | Enchantability | Fireproof? | Repair Tag (`#betterend:<mat>/repair`) |
|---|---|---|---|---|---|---|---|---|
| **Thallasium** | Iron (`INCORRECT_FOR_IRON_TOOL` / `NEEDS_IRON_TOOL`) | `2` | `320` | `7.0F` | `1.5F` | `9` | `false` | `thallasium_forged_plate` (`MetalMaterial.java:209`) |
| **Terminite** | Diamond (`INCORRECT_FOR_DIAMOND_TOOL` / `NEEDS_DIAMOND_TOOL`) | `3` | `1230` | `8.5F` | `3.5F` | `9` | `false` | `terminite_forged_plate` (`EndMetalBlocks.java:65`) |
| **Aeternium** | Netherite (`INCORRECT_FOR_AETERNIUM_TOOL` / `NEEDS_NETHERITE_TOOL`) | `4` | `2196` | `10.0F` | `4.5F` | `10` | `true` (`fireResistant()`) | `aeternium_forged_plate` (`EndEquipmentItems.java:53`) |

#### Per-Tool Attack Damage & Attack Speed (`ToolsWithHeadsSet.java` L89–139, `AeterniumSet.java` L47–66, `ToolComponentGameTest.java` L129–225)
*(Total Attack Damage = `1.0 (player base) + Base Attack Bonus + Tool Offset`; Total Attack Speed = `4.0 + Speed Offset`)*

| Tool Type | Thallasium (`bonus=1.5`) | Terminite (`bonus=3.5`) | Aeternium (`bonus=4.5`) |
|---|---|---|---|
| **Sword** (`+3.0` dmg, `-2.4` spd) | `5.5` dmg (`+4.5`), `1.6` spd | `7.5` dmg (`+6.5`), `1.6` spd | `8.5` dmg (`+7.5`), `1.6` spd |
| **Pickaxe** (`+1.0` dmg, `-2.8` spd) | `3.5` dmg (`+2.5`), `1.2` spd | `5.5` dmg (`+4.5`), `1.2` spd | `6.5` dmg (`+5.5`), `1.2` spd |
| **Axe** | `8.5` dmg (`+7.5`, offset `+6.0`), `0.9` spd (`-3.1`) | `9.5` dmg (`+8.5`, offset `+5.0`), `1.0` spd (`-3.0`) | `10.5` dmg (`+9.5`, offset `+5.0`), `1.0` spd (`-3.0`) |
| **Shovel** (`+1.5` dmg, `-3.0` spd) | `4.0` dmg (`+3.0`), `1.0` spd | `6.0` dmg (`+5.0`), `1.0` spd | `7.0` dmg (`+6.0`), `1.0` spd |
| **Hoe** | `0.5` dmg (`-0.5`, offset `-2.0`), `3.0` spd (`-1.0`) | `1.5` dmg (`+0.5`, offset `-3.0`), `4.0` spd (`0.0`) | `1.5` dmg (`+0.5`, offset `-4.0`), `4.0` spd (`0.0`) |
| **Spear** | Registered via `ItemTraits.SPEAR_ITEM` (`ToolsWithHeadsSet.java:132-139`) | Registered via `ItemTraits.SPEAR_ITEM` | Registered via `ItemTraits.SPEAR_ITEM` (`AeterniumSet.java:62-66`) |

---

### 2.2 Hammers & Resonance (`registry/item/EndEquipmentItems.java` L113–140, `trait/item/HammerTraitBuilder.java` L19–90, `mixin/common/LivingEntityMixin.java` L81–133, `mixin/common/ServerPlayerGameModeMixin.java` L28–141)

#### Registered Hammers (`#wover:tools/hammers`, mines `#wover:mineable/hammer`)
`HammerTraitBuilder.createAttributes` (`L41-64`) sets `ATTACK_DAMAGE = tier.attackDamageBonus() + offset.attackDamageBonus()`, `ATTACK_SPEED = offset.attackSpeed()`, and `ATTACK_KNOCKBACK = knockback` (`ADD_VALUE` on `MAINHAND`).

| Hammer ID | Material | Durability | Mining Speed | Attack Damage Bonus (`+tier+offset`) | Attack Speed Offset | Knockback Attribute (`ATTACK_KNOCKBACK`) | Fireproof? |
|---|---|---|---|---|---|---|---|
| `betterend:iron_hammer` | `ToolMaterial.IRON` | `250` | `6.0F` | `+5.0` (`6.0` total) | `-3.2F` (`0.8` spd) | `+0.2` (`EndEquipmentItems.java:116`) | `false` |
| `betterend:golden_hammer` | `ToolMaterial.GOLD` | `32` | `12.0F` | `+3.0` (`4.0` total) | `-3.4F` (`0.6` spd) | `+0.3` (`EndEquipmentItems.java:122`) | `false` |
| `betterend:diamond_hammer` | `ToolMaterial.DIAMOND` | `1561` | `8.0F` | `+6.0` (`7.0` total) | `-3.1F` (`0.9` spd) | `+0.2` (`EndEquipmentItems.java:128`) | `false` |
| `betterend:netherite_hammer` | `ToolMaterial.NETHERITE` | `2031` | `9.0F` | `+7.0` (`8.0` total) | `-3.0F` (`1.0` spd) | `+0.2` (`EndEquipmentItems.java:134`) | `true` |
| `betterend:thallasium_hammer` | `EndToolMaterial.THALLASIUM` | `320` | `7.0F` | `+1.5` (`2.5` total, `NO_OFFSET`) | `0.0F` (`NO_OFFSET`) | `0.0` (`ToolsWithHeadsSet.java:128`) | `false` |
| `betterend:terminite_hammer` | `EndToolMaterial.TERMINITE` | `1230` | `8.5F` | `+3.5` (`4.5` total, `NO_OFFSET`) | `0.0F` (`NO_OFFSET`) | `0.0` (`ToolsWithHeadsSet.java:128`) | `false` |
| `betterend:aeternium_hammer` | `EndToolMaterial.AETERNIUM` | `2196` | `10.0F` | `+4.5` (`5.5` total, `NO_OFFSET`) | `0.0F` (`NO_OFFSET`) | `0.0` (`AeterniumSet.java:58`) | `true` |

- **Knockback Mixin (`LivingEntityMixin.java:81-133`)**: `be_increaseKnockback` modifies the `0.4D` base knockback constant in `LivingEntity#dealDefaultKnockback` by adding `attacker.getAttributeValue(Attributes.ATTACK_KNOCKBACK)` whenever the attacker is holding an item in `EndTags.HAMMERS` (`#wover:tools/hammers`).
- **`betterend:resonance` Enchantment (`ServerPlayerGameModeMixin.java:43-140`, `registry/EndEnchantments.java:15-52`)**:
  - Applicable to `#wover:tools/hammers`, max level `2`, anvil cost `4`, weight `5`.
  - When a player breaks a block with a hammer while **not sneaking** (`!player.isShiftKeyDown()`) and `radius = EnchantmentHelper.getItemEnchantmentLevel(RESONANCE, tool)` (`1` or `2`):
  - Computes `viewDir = player.getNearestViewDirection()` and breaks a **`(2*radius + 1) × (2*radius + 1) × (2*radius + 1)` cube** (`3×3×3` at level I, `5×5×5` at level II): centered `-radius..+radius` on the two axes perpendicular to `viewDir`, and extending **`0..2*radius` forward** along `viewDir` (`L100-136`).
  - Only breaks blocks where `tool.isCorrectToolForDrops(blockState)` is true. Suppresses durability damage for all secondary blocks so the entire AoE break costs only **1 durability** (`L37-41`, `L53-59`).

---

### 2.3 Armor Materials & Tiers (`item/material/EndArmorMaterial.java` L10–93, `item/material/EndArmorTier.java` L7–49, `trait/item/EndArmorItemTraitBuilder.java` L28–198, `testmod/gametest/ArmorEnchantabilityGameTest.java` L29–68)

*(Vanilla slot base durabilities: Helmet `11`, Chestplate `16`, Leggings `15`, Boots `13`, Body `16`)*

| Armor Material | Durability Factor | Piece Durabilities (H / C / L / B) | Defense (H / C / L / B / Body; Total) | Toughness (Per Piece / Set) | Knockback Res (Per Piece / Set) | Enchantability | Equip Sound | Fireproof / Rarity | Repair Tag |
|---|---|---|---|---|---|---|---|---|---|
| **Thallasium** | `16` | `176 / 256 / 240 / 208` | `2 / 5 / 4 / 1 / 12` (**`12`**) | `0.0F` / `0.0F` | `0.0F` / `0.0F` | `17` (`EndArmorMaterial.java:20`) | `ARMOR_EQUIP_IRON` | `false` / Common | `#betterend:thallasium/repair` (`thallasium_forged_plate`) |
| **Terminite** | `25` | `275 / 400 / 375 / 325` | `3 / 7 / 6 / 3 / 14` (**`19`**) | `1.0F` / `4.0F` | `0.05F` / `0.2F` | `26` (`EndArmorMaterial.java:39`) | `ARMOR_EQUIP_IRON` | `false` / Common | `#betterend:terminite/repair` (`terminite_forged_plate`) |
| **Crystalite** | `33` | `363 / 528 / 495 / 429` | `3 / 8 / 7 / 3 / 24` (**`21`**) | `3.2F` / `12.8F` | `0.1F` / `0.4F` | `30` (`EndArmorMaterial.java:58`) | `ARMOR_EQUIP_DIAMOND` | **`true`** / **`RARE`** (`EndEquipmentItems.java:55-66`) | `#betterend:crystalite/repair` (empty by default) |
| **Aeternium** | `42` | `462 / 672 / 630 / 546` | `4 / 9 / 7 / 4 / 18` (**`24`**) | `3.5F` / `14.0F` | `0.2F` / `0.8F` | `40` (`EndArmorMaterial.java:77`) | `ARMOR_EQUIP_NETHERITE` | **`true`** / Common (`AeterniumSet.java:68-87`) | `#betterend:aeternium/repair` (`aeternium_forged_plate`) |

---

### 2.4 Crystalite Piece Effects & Full-Set Bonus (`item/CrystaliteArmor.java` L18–84, `CrystaliteHelmet.java`, `CrystaliteChestplate.java`, `CrystaliteLeggings.java`, `CrystaliteBoots.java`, `effects/EndStatusEffects.java` L15–40, `mixin/common/LivingEntityMixin.java` L48–79)

- **Crystalite Helmet (`item/CrystaliteHelmet.java` L13–21, `registry/EndAttributes.java` L14–22, `LivingEntityMixin.java` L70–79)**:
  - Adds attribute modifier `+1.0` (`Operation.ADD_VALUE`, slot `HEAD`) to `betterend:generic.blindness_resistance` (`EndAttributes.BLINDNESS_RESISTANCE`).
  - `LivingEntityMixin#be_canBeAffected` cancels `MobEffects.BLINDNESS` (`cir.setReturnValue(false)`) whenever `getAttributeValue(EndAttributes.BLINDNESS_RESISTANCE) > 0.0`.
- **Crystalite Chestplate (`item/CrystaliteChestplate.java` L12–21)**:
  - Implements `MobEffectApplier`: every server tick (`LivingEntityMixin#be_applyEffects`, `L53-68`), applies `EndStatusEffects.CRYSTALITE_DIG_SPEED` (`new MobEffectInstance(MobEffects.HASTE, 80, 0, true, false, true)` — **Haste I**, 4s duration, ambient, no particles, shows icon) and calls `CrystaliteArmor.applySetEffect(owner)`.
- **Crystalite Leggings (`item/CrystaliteLeggings.java` L14–22)**:
  - Adds attribute modifier `+4.0` (`Operation.ADD_VALUE`, slot `LEGS`, id `betterend:max_health_boost`) to `Attributes.MAX_HEALTH` (**+2 full hearts**).
- **Crystalite Boots (`item/CrystaliteBoots.java` L12–23)**:
  - Implements `MobEffectApplier`: every 64 ticks (`(owner.tickCount & 63) == 0`), applies `EndStatusEffects.CRYSTALITE_MOVE_SPEED` (`new MobEffectInstance(MobEffects.SPEED, 80, 0, true, false, true)` — **Speed I**, 4s duration) and calls `CrystaliteArmor.applySetEffect(owner)`.
- **Full-Set Bonus (`CrystaliteArmor.java:56-69`)**:
  - `hasFullSet(LivingEntity owner)` checks that all 4 humanoid armor slots (`HEAD`, `CHEST`, `LEGS`, `FEET`) contain items in `EndTags.CRYSTALITE_ARMOR_SET` (`#betterend:armor_set/crystalite`: `crystalite_helmet`, `crystalite_chestplate`, `crystalite_leggings`, `crystalite_boots`, and **`elytra_crystalite`**).
  - When `hasFullSet(owner)` is true, `applySetEffect` applies `EndStatusEffects.CRYSTALITE_HEALTH_REGEN` (`new MobEffectInstance(MobEffects.REGENERATION, 80, 0, true, false, true)` — **Regeneration I**, 4s duration) every 64 ticks (`(owner.tickCount & 63) == 0`).

---

### 2.5 Armored Elytra & Crystalite Elytra (`registry/item/EndEquipmentItems.java` L68–111, `item/ArmoredElytra.java` L14–41, `item/CrystaliteElytra.java` L15–57, `mixin/client/CapeLayerMixin.java` L16–24)

| Property | `betterend:elytra_armored` (`ArmoredElytra`) | `betterend:elytra_crystalite` (`CrystaliteElytra`) |
|---|---|---|
| **Equipment Slot** | `EquipmentSlot.CHEST` (`EndEquipmentItems.java:81`) | `EquipmentSlot.CHEST` (`EndEquipmentItems.java:104`) |
| **Durability** | `900` (`L75`) | `650` (`L97`) |
| **Defense (`ARMOR`)** | `7.5F` (`EndArmorItemTraitBuilder.java:149-158`) | `6.5F` (`L99`) |
| **Armor Toughness** | `3.0F` (`L77`) | `1.0F` (`L100`) |
| **Knockback Resistance** | `0.2F` (`L78`) | `0.1F` (`L101`) |
| **Movement Factor (`WoverElytraItem`)** | `0.97D` (`ArmoredElytra.java:24-26`) | `1.0D` (`CrystaliteElytra.java:26`, `L96`) |
| **Fireproof / Rarity / Stack** | `fireResistant()`, `Rarity.EPIC`, max stack `1` (`L79-80`) | `fireResistant()`, `Rarity.EPIC`, max stack `1` (`L102-103`) |
| **Repair Ingredient** | Vanilla default (`Items.PHANTOM_MEMBRANE` via `ItemTraits.ELYTRA_ITEM`, `L72`) | `EndResourceItems.ENCHANTED_MEMBRANE` (`betterend:enchanted_membrane`, `L92`) |
| **Special Effects** | None | Applies `CRYSTALITE_DIG_SPEED` (**Haste I**) every tick (`CrystaliteElytra.java:51-55`) and counts as the chest piece for `#betterend:armor_set/crystalite` (**Regeneration I** full-set bonus)! |
| **Wing Textures & Cape Suppression** | `textures/entity/elytra_armored.png`; `CapeLayerMixin.java:18-23` suppresses player cape rendering when wearing any `CustomElytraItem`. | `textures/entity/elytra_crystalite.png`; suppresses player cape rendering. |

---

## 3. Portals, Eternal Pedestal & Respawn Obelisk (`CAP-013`, `TRV-001`)

### 3.1 Eternal Portal Multiblock & Ritual (`rituals/EternalRitual.java` L46–585, `portal/PortalBuilder.java` L38–429, `blocks/EndPortalBlock.java` L43–219, `blocks/EternalPedestal.java` L68–458, `registry/EndPortals.java` L20–169, `world/structures/features/EternalPortalStructure.java` L19–70)

#### A. Natural Structure Generation (`EternalPortalStructure.java` L20–50)
- Places structure template `betterend:portal/eternal_portal` with `offsetY = -2`, `StructurePlacementType.FLOOR`, `erosion = rnd.nextInt(5)`, `cover = true`.
- **Placement Rule (`L29-39`)**: Only generates at chunk coordinates `(chunkX, chunkZ)` where `chunkX^2 + chunkZ^2 >= 1024` (`>= 32` chunks / `512` blocks from `(0, 0)`), `(chunkX + chunkZ) % 2 == 0`, and surface height `>= 5` (never on the central End island).

#### B. Exact Frame, Portal & Pedestal Coordinates (`PortalBuilder.java` L39–76, `EternalRitual.java` L47–54, L110–144, L409–477)
Relative to `center` (the bottom-center block of the portal opening) and `framePos = center.below()`, where the portal plane extends along `moveDir` (`Direction.NORTH` if `axis == X`, or `Direction.EAST` if `axis == Z`):
- **16 Frame Blocks (`RunedFlavolite`: `flavolite_runed` or `flavolite_runed_eternal`)**:
  - `FRAME_POSITIONS` mirrored `±x` along `moveDir` and `+y` UP from `framePos = center.below()`:
    `(0, 0), (0, 6), (±1, 0), (±1, 6), (±2, 1), (±2, 5), (±3, 2), (±3, 3), (±3, 4)`
- **21 Portal Interior Blocks (`EndPortalBlock`: `betterend:end_portal_block`, 5 wide × 5 tall octagram)**:
  - `PORTAL_POSITIONS` mirrored `±x` along `moveDir` and `+y` UP from `center`:
    `(0, 0..4), (±1, 0..4), (±2, 1..3)`
- **Base Platform (`flavolite_tiles`, placed when generating a new exit portal)**:
  - `BASE_POSITIONS` mirrored in all 4 quadrants around `framePos`:
    `(±3, 0), (±2, 0), (±2, ±1), (±1, ±1), (±1, ±2), (0, ±1), (0, ±2)`
- **6 `EternalPedestal` Positions (`EternalRitual.java:47-54, 117-124`)**:
  - Relative to `center` at the **same Y level (`center.y`)**, using `(moveX, moveY)` = `(EAST, NORTH)` when `axis == X`, or `(SOUTH, EAST)` when `axis == Z`:
    `(-4, -5), (-4, +5), (-6, 0), (+4, -5), (+4, +5), (+6, 0)`
  - `EternalPedestal` (`EternalPedestal.java:71-184`) is unbreakable in survival (`getDestroyProgress = 0.0F`, bedrock explosion resistance `3600000.0F`). Empty-hand right-clicking an empty `EternalPedestal` triggers `EternalHint` particle vision (`L209-225`).

#### C. Activation Ritual & Portal Linking (`EternalPedestal.java` L77–122, `EternalRitual.java` L110–400, `EndPortals.java` L26–168)
1. **Key Item Registration (`EndPortals.java:114-122`)**:
   - Configured in `config/betterend/portals.json`. Default entry: item `betterend:eternal_crystal` (`EndBlocks.ETERNAL_CRYSTAL`), dimension `minecraft:overworld`, color `RGB(255, 255, 255)`, `portalId = 0`.
2. **Pedestal Placement (`EternalPedestal.java:77-122`)**:
   - Placing a registered key item (`EndPortals.isAvailableItem(item)`) onto an `EternalPedestal` sets `ACTIVATED = true` and `HAS_LIGHT = true` (emits light level `12`) and calls `checkRitual(world, player, pos)`.
3. **Ritual Completion (`EternalRitual.java:110-207`)**:
   - `checkStructure(player)` verifies all 16 frame blocks are `RunedFlavolite` (`isInvalidFrame` returns false) and all 6 pedestals at `PEDESTAL_POSITIONS` are `EternalPedestal` with `ACTIVATED == true` holding the **exact same key item** (`item == pedestal.getItem(0).getItem()`).
   - When valid:
     - Calls `activatePortal(world, center, itemId)` (`L339-364`): sets `ACTIVE = true` (light level `8`) on all 16 `RunedFlavolite` frame blocks, places `end_portal_block` (`AXIS = (axis == X) ? Z : X`, `PORTAL = portalId`) in all 21 interior positions, plays `SoundEvents.END_PORTAL_SPAWN`, and spawns `PORTAL` + `REVERSE_PORTAL` particles.
     - Awards advancement `BECriteria.ACTIVATE_PORTAL` to the activating player (`L153-155`).
     - **Target Dimension Linking (`findOrCreatePortal`, `L275-308`, `PortalBuilder.java:190-335`)**:
       - If activated in `Level.END`, targets the dimension mapped to `portalId` (`Level.OVERWORLD` by default); if activated in `Level.OVERWORLD`, targets `Level.END`.
       - Scales `center` coordinates using `DimensionType.getTeleportationScale(sourceDimType, destDimType)` (`EndPortalBlock.java:132`, `EternalRitual.java:295`).
       - Searches `PoiManager` for `EndPoiTypes.ETERNAL_PORTAL` (`betterend:eternal_portal`, bound to all `end_portal_block` states) within `SPIRAL_SEARCH_RADIUS = 128` blocks where `PORTAL == portalId` (`PortalBuilder.java:190-230`).
       - If no active matching portal exists, `PortalBuilder.createPortal` (`L232-335`) spirals outward from `center` up to `128` blocks (generating chunks only within `GENERATE_SEARCH_RADIUS = 16` blocks and checking only already-loaded chunks from `17..128`), picks the best land/air placement, builds the `flavolite_runed_eternal` frame + `flavolite_tiles` base + 6 `eternal_pedestal` blocks (around `exit`), and activates the exit portal.
4. **Deactivation (`EternalPedestal.java:81-96`, `EternalRitual.java:366-400`)**:
   - Removing an item from any of the 6 pedestals sets `ACTIVATED = false` on that pedestal and calls `ritual.disablePortal(stateId)`, which clears all 21 `end_portal_block` blocks to `AIR` and sets `ACTIVE = false` on all 16 `RunedFlavolite` frame blocks at **both** `center` (in the current dimension) and `exit` (in the target dimension).

#### D. Portal Teleportation (`blocks/EndPortalBlock.java` L105–218)
- `EndPortalBlock` extends `NetherPortalBlock implements Portal` (light level `12`, hardness `-1.0F`, no collision, `EndFunctionalBlocks.java:36-47`).
- `entityInside` (`L105-110`): If `!entity.isPassenger() && !entity.isVehicle() && entity.canUsePortal(false)`, calls `entity.setAsInsidePortal(this, pos)`.
- `getPortalDestination(ServerLevel level, Entity entity, BlockPos pos)` (`L119-158`):
  - Resolves destination dimension (`Overworld` ↔ `End`), scales coordinates via `DimensionType.getTeleportationScale`, searches within `128` blocks via `PortalBuilder.findPortalAround(dest, exitPos, 128, stateId)`.
  - If found, adds a `TicketType.PORTAL` (radius `3`) at the exit portal bottom-left, triggers `BECriteria.PORTAL_TRAVEL` for `ServerPlayer`, and calls `createDimensionTransition` (`L160-218`) to preserve the entity's relative offset within the 5×5 portal opening and rotate velocity/Y-rot by 90° if the exit portal axis is perpendicular to the entry portal axis.

---

### 3.2 Respawn Obelisk (`blocks/RespawnObeliskBlock.java` L61–236, `mixin/common/PlayerMixin.java` L29–104, `registry/block/EndFunctionalBlocks.java` L97–109)

- **Multiblock Structure & Properties**:
  - 3-block tall vertical column using `SHAPE = BlockProperties.TRIPLE_SHAPE` (`BOTTOM`, `MIDDLE`, `TOP`).
  - Hitboxes (`L62-75`): `BOTTOM` = `box(1, 0, 1, 15, 16, 15)`; `MIDDLE` and `TOP` = `box(2, 0, 2, 14, 16, 14)`.
  - **Light Emission (`EndFunctionalBlocks.java:99`)**: `BOTTOM` emits `0` light; `MIDDLE` and `TOP` permanently emit **`15`** light (`(state.getValue(SHAPE) == TripleShape.BOTTOM) ? 0 : 15`).
  - Placement (`L84-105`): `canSurvive` checks that `pos`, `pos.above(1)`, and `pos.above(2)` are replaceable. `setPlacedBy` places `MIDDLE` at `pos.above()` and `TOP` at `pos.above(2)`. Breaking any segment breaks the other two via `updateShape` (`L109-139`), and only `BOTTOM` drops `betterend:respawn_obelisk` (`L163-177`, requires pickaxe).
- **Activation / Setting Spawn (`useItemOn`, `L180-235`)**:
  - Has **no charge block state** and **never explodes** in any dimension.
  - Right-clicking any segment (`BOTTOM`, `MIDDLE`, or `TOP`) with **6 or more `betterend:amber_gem`** (`itemStack.is(EndResourceItems.AMBER_GEM) && itemStack.getCount() > 5`) in `MAIN_HAND`:
    1. Consumes **`6` `amber_gem`** (`itemStack.shrink(6)`, unless Creative).
    2. Sets the player's respawn point to `(level.dimension(), pos, 0.0F, 0.0F)` (`serverPlayer.setRespawnPosition(..., false)`).
    3. Displays overlay message `Component.translatable("message.betterend.set_spawn")` and plays `SoundEvents.RESPAWN_ANCHOR_SET_SPAWN`.
    4. Emits `InfusionParticleType(new ItemStack(AMBER_GEM))` particles around the middle/top segments (`L207-230`).
  - Clicking with `< 6` Amber Gems or any non-`BlockItem` in survival displays `Component.translatable("message.betterend.fail_spawn")` on the actionbar and returns `FAIL`.
- **Death / Respawn Consumption (`PlayerMixin.java:34-103`)**:
  - `PlayerMixin#be_findRespawnPositionAndUseSpawnBlock` intercepts `ServerPlayer.findRespawnPositionAndUseSpawnBlock`.
  - When the block at `respawnPos` is `EndFunctionalBlocks.RESPAWN_OBELISK`, searches 24 spiral offsets (`SPAWN_OFFSETS`, `dx, dz` in `-3..3`, `dy` in `-3..0`) via `DismountHelper.findSafeDismountLocation` to place the respawning player safely beside the obelisk.
  - **Does NOT consume or deplete the obelisk on respawn** — once activated with 6 Amber Gems, it acts as a permanent respawn point until broken or overwritten.

---

## 4. Plants, Crops, Hazards & Functional Blocks (`CAP-008`, `FARM-001`)

### 4.1 Ice, Sulphur & Hydrothermal Blocks

- **`emerald_ice`, `dense_emerald_ice`, `ancient_emerald_ice` (`blocks/EmeraldIceBlock.java` L23–69, `blocks/AncientEmeraldIceBlock.java` L21–72, `registry/block/EndDecorBlocks.java` L75–94)**:
  - All 3 use `IceBlockTrait` (pickaxe-mineable, translucent, Silk Touch drops self).
  - `EmeraldIceBlock`: Melts into `Blocks.WATER` (or `AIR` if `WATER_EVAPORATES`) on `randomTick` if `level.getBrightness(LightLayer.BLOCK, pos) > 11 - state.getLightDampening()` (`L54-68`), or when broken without Silk Touch above a solid/liquid block (`L30-50`).
  - `AncientEmeraldIceBlock`:
    - **Freezing Water (`randomTick`, `L28-51`)**: Picks a random `Direction dir`: if `pos.relative(dir)` is `Blocks.WATER`, turns it into `emerald_ice`; if `pos.relative(dir)` is `emerald_ice`, upgrades it into `dense_emerald_ice`. Then with 50% chance (`random.nextBoolean()`), picks a random offset within `±2` X/Y/Z and if it is `Blocks.WATER`, turns it into `emerald_ice` and spawns `EndParticles.SNOWFLAKE`.
    - **Entity Freezing (`stepOn`, `L68-71`)**: Stepping on `ancient_emerald_ice` calls `entity.setIsInPowderSnow(true)`!
- **`brimstone` (`blocks/BrimstoneBlock.java` L32–111) & `sulphur_crystal` (`blocks/SulphurCrystalBlock.java` L56–208)**:
  - `BrimstoneBlock`: Has `ACTIVATED` (`active`, boolean, default `false`). On `randomTick` (`L79-110`): checks if any of the 6 face-adjacent blocks has `Fluids.WATER`. If adjacent to water and `!active`, sets `ACTIVATED = true`. If no adjacent water and `active`, sets `ACTIVATED = false`. When `ACTIVATED == true`, with **1-in-16 chance** (`random.nextInt(16) == 0`), picks a random face `dir`:
    - If `sidePos` is a waterlogged `sulphur_crystal` with `AGE < 2`, increments `AGE` by `+1`.
    - If `sidePos` is `Fluids.WATER`, places a waterlogged `sulphur_crystal` (`AGE = 0`, `FACING = dir`).
  - `SulphurCrystalBlock`: Properties `AGE` (`0..2`), `FACING` (6 directions), `WATERLOGGED`. `canSurvive` (`L192-196`) requires the attached block in `#betterend:survives_on_brimstone` (`brimstone`). Requires pickaxe (`requiresCorrectToolForDrops`).
    - **Loot (`L109-153`)**: At `AGE < 2` (or with Silk Touch at `AGE == 2`), drops `1` `sulphur_crystal` (with Fortune + Silk Touch at `AGE == 2`, `1..3` `sulphur_crystal`); without Silk Touch at `AGE == 2`, drops **`1..3` `betterend:crystalline_sulphur`**.
- **`hydrothermal_vent`, `vent_bubble_column` & `GeyserFeature` (`blocks/HydrothermalVentBlock.java` L46–171, `blocks/entities/BlockEntityHydrothermalVent.java` L25–101, `blocks/VentBubbleColumnBlock.java` L42–189, `world/features/terrain/GeyserFeature.java` L43–356)**:
  - `HydrothermalVentBlock`: Properties `WATERLOGGED` (default `false`), `ACTIVATED` (`active`, default `false`). Shape `box(1, 1, 1, 15, 16, 15)`, no collision (`EndStoneBlocks.java:293`). `canSurvive` (`L86-89`) requires `EndStoneBlocks.SULPHURIC_ROCK` (`sulphuric_rock`) directly below; if broken/unsupported, turns into `WATER` (`L74-83`).
  - **Bubble Column (`HydrothermalVentBlock.java:129-135`, `VentBubbleColumnBlock.java:81-161`)**: On `tick` / placement, if `WATERLOGGED && up.is(Blocks.WATER)`, places `betterend:vent_bubble_column` above it, which chains upward through all `Blocks.WATER` blocks above it (`L92-97`) and pushes entities upward via `entity.onInsideBubbleColumn(false)` / `entity.onAboveBubbleColumn(false, pos)` (`L125-160`).
  - **Gliding Updraft (`BlockEntityHydrothermalVent.java:64-100`)**: Every server tick, scans a column `AABB(pos.offset(-1, 1, -1), pos.offset(1, height + 1, 1))` where `height = active ? 85 : 25` (`85` blocks for natural/active vents, `25` blocks for player-placed inactive vents; truncated if any `isSolidRender()` block is encountered). Any `LivingEntity` inside the column that `isFallFlying()` and wears a valid gliding item in `CHEST` receives upward acceleration `entity.moveRelative(force, POSITIVE_Y)` with `force = (float) ((1.0 - (entity.getY() / box.maxY)) / (active ? 3.0 : 5.0))`.
  - **`GeyserFeature` (`world/features/terrain/GeyserFeature.java:43-356`)**: Builds layered `sulphuric_rock` + `brimstone` underwater/surface domes with `sulphur_crystal` and `hydrothermal_vent[active=true, waterlogged=true]` at the base of the geyser shaft (`L230-285`).

---

### 4.2 Sponges, Hazards, Bounce Blocks & Special Plants

- **`menger_sponge` & `menger_sponge_wet` (`blocks/MengerSpongeBlock.java` L37–142, `blocks/MengerSpongeWetBlock.java` L35–130)**:
  - `MengerSpongeBlock`: On placement or neighbor update (`tryAbsorbWater`, `L56-118`), runs a BFS up to depth `6` and max `64` blocks (`absorbWater`), removing `FluidTags.WATER` (`BucketPickup`, `LiquidBlock`, and `#c:water_plant` blocks, dropping water plant loot) and converting itself into `menger_sponge_wet`.
  - `MengerSpongeWetBlock`: Overrides `getFluidState` (`L117-119`) to return `Fluids.WATER.getSource(false)` (acts as a permanent waterlogged source block). If placed in a dimension where `EnvironmentAttributes.WATER_EVAPORATES` is true (e.g., Nether), immediately dries back into `menger_sponge` with `FIRE_EXTINGUISH` sound (`L41-53`). Also dries via furnace smelting.
- **`neon_cactus` (`blocks/NeonCactusPlantBlock.java` L43–416, `registry/block/EndPlantBlocks.java` L440–449)**:
  - Properties: `SHAPE` (`TripleShape`: `TOP` = small `8×8`, `MIDDLE` = medium `10×10`, `BOTTOM` = big `12×12`), `CACTUS_BOTTOM` (`SAND` on `end_stone`/`endstone_dust`, `MOSS` on `end_moss`, `EMPTY` otherwise), `WATERLOGGED`, `FACING` (6 directions). Emits light **`15`**.
  - Survives on `#betterend:survives_on_neon_cactus` (`neon_cactus`, `end_moss`, `endstone_dust`, `end_stone`).
  - Growth (`randomTick`, `L167-204`): With 1-in-8 chance (`random.nextInt(8) == 0`), if total connected length `< MAX_LENGTH` (`12`) and rooted on `#c:end_stones`, grows 1 block in `FACING` (curving `UP` after 1–2 horizontal steps and branching sideways with 1-in-3 chance when vertical length `> 1`), and `mutateStem` thickens older stem blocks (`TOP` → `MIDDLE` → `BOTTOM`).
  - **Contact Damage (`entityInside`, `L320-322`)**: Deals `1.0F` `cactus()` damage.
- **`murkweed` (`blocks/MurkweedBlock.java` L21–48, `EndPlantBlocks.java` L457–463)**:
  - Survives on `#betterend:survives_on_shadow_grass` (`shadow_grass`). Emits `ENTITY_EFFECT (0xFFFFFFFF)` particles.
  - **Hazard (`entityInside`, `L38-42`)**: Applies `new MobEffectInstance(MobEffects.BLINDNESS, 50)` (`2.5` seconds) to any `LivingEntity` that doesn't already have Blindness (`isPathfindable = false`).
- **`needlegrass` (`blocks/NeedlegrassBlock.java` L21–54, `EndPlantBlocks.java` L465–485)**:
  - Survives on `#betterend:survives_on_shadow_grass` (`shadow_grass`).
  - **Hazard (`entityInside`, `L28-32`)**: Deals `0.1F` `cactus()` damage to `LivingEntity` (`isPathfindable = false`).
  - **Loot (`L34-48`)**: Drops self with Silk Touch or Shears, otherwise `0..2` `Items.STICK`.
- **`hydralux_petal_block` & `hydralux_petal_block_colored` (`blocks/HydraluxPetalBlock.java` L12–26, `EndDecorBlocks.java` L144–164)**:
  - Overrides `fallOn` (`L18-25`) as an empty no-op: **completely negates fall damage** without bouncing. Registered in base form plus all 16 dye colors (`hydralux_petal_block_<color>`).
- **`jellyshroom_cap_purple` & `umbrella_tree_membrane` (`blocks/JellyshroomCapBlock.java` L22–54, `blocks/UmbrellaTreeMembraneBlock.java` L31–108, `EndWoodBlocks.java` L262–332)**:
  - Both extend vanilla `SlimeBlock` (full slime bounce + fall damage negation when not sneaking) and have `COLOR` (`0..7`) computed from world coordinates via `OpenSimplexNoise(0)` (`MHelper.floor(NOISE.eval(x * 0.1, y * 0.1, z * 0.1) * 3.5 + 4)`).
  - `umbrella_tree_membrane` is opaque when `COLOR == 0` (`propagatesSkylightDown` is `COLOR > 0`, `L95-97`) and translucent when `COLOR > 0`; drops `umbrella_tree_sapling` with `1/128` chance (`EndWoodBlocks.java:80, 274`).
- **`umbrella_tree_cluster` & `umbrella_tree_cluster_empty` (`blocks/UmbrellaTreeClusterBlock.java` L27–81, `blocks/UmbrellaTreeClusterEmptyBlock.java` L18–46, `EndWoodBlocks.java` L281–301)**:
  - `umbrella_tree_cluster`: Emits light **`15`**, has `NATURAL` (`boolean`, default `false`). Right-clicking with `Items.GLASS_BOTTLE` (`L61-78`) consumes 1 bottle, gives 1 `EndFoodItems.UMBRELLA_CLUSTER_JUICE` (`betterend:umbrella_cluster_juice`), plays `SoundEvents.BOTTLE_FILL`, and replaces the block with `umbrella_tree_cluster_empty` (preserving `NATURAL`).
  - `umbrella_tree_cluster_empty`: Emits light `0`. On `randomTick` (`L38-44`), if `NATURAL == true` and `random.nextInt(16) == 0`, regenerates back into `umbrella_tree_cluster[natural=true]`.

---

### 4.3 Crops, Seeds, Saplings & Bone Meal (`registry/block/EndCropBlocks.java`, `blocks/basis/PottableCropBlock.java`, `util/BonemealPlants.java`)

#### A. 4 Berry/Root Crops (`PottableCropBlock.java` L38–121, `EndCropBlocks.java` L72–155)
All 4 extend `PottableCropBlock` with `AGE` (`0..3`), grow on `randomTick` with **1-in-8 chance** (`random.nextInt(8) == 0`, `L102`) with **no light or water requirement**, and advance `+1` age per Bone Meal (`L62-74`). Loot (`L89-120`): at `AGE < 3` drops `1` seed; at `AGE == 3` drops **`1..2` crop items** (`UniformGenerator(1, 2)` + Fortune) and **`1..3` seeds** (binomial `n=3, p=0.5714286` + Fortune).

| Seed / Crop Block ID | Valid Soil Tag / Block | Harvested Crop Item (`AGE == 3`) | Extra Notes |
|---|---|---|---|
| `betterend:shadow_berry` (`ShadowBerryBlock`) | `#betterend:survives_on_shadow_grass` (`shadow_grass`) | `betterend:shadow_berry_raw` | Shape `box(1, 0, 1, 15, 8, 15)` (`ShadowBerryBlock.java:24`) |
| `betterend:blossom_berry_seed` | `#betterend:survives_on_pink_moss` (`pink_moss`) | `betterend:blossom_berry` | Feeds/breeds `SilkMothEntity` |
| `betterend:amber_root_seed` | `#betterend:survives_on_amber_moss` (`amber_moss`) | `betterend:amber_root_raw` | Full crop `box(0, 0, 0, 16, 16, 16)` |
| `betterend:chorus_mushroom_seed` | `#betterend:survives_on_chorus_nylium` (`chorus_nylium`) | `betterend:chorus_mushroom_raw` | Uses `BlockNote.MUSHROOM` |

#### B. Multiblock / Underwater / Hanging Seeds & Saplings
- **`cave_pumpkin_seed` (`blocks/CavePumpkinVineBlock.java` L27–104) & `cave_pumpkin` (`blocks/CavePumpkinBlock.java` L27–87)**:
  - Hangs under any face-sturdy ceiling (`canSurvive` checks `isFaceSturdy(pos.above(), DOWN)`).
  - `AGE` (`0..3`), grows on `randomTick` (1-in-8) or Bone Meal (`+1` age) if `pos.below()` is air (at `AGE < 2`) or `cave_pumpkin[small=true]` (at `AGE == 2`):
    - Advancing `1 → 2` places `cave_pumpkin[small=true]` (light `10`, `box(5, 7, 5, 11, 16, 11)`, drops `cave_pumpkin_seed`) at `pos.below()`.
    - Advancing `2 → 3` upgrades `pos.below()` to `cave_pumpkin[small=false]` (light `15`, `box(1, 0, 1, 15, 13, 15)`, drops `cave_pumpkin`).
    - Breaking the pumpkin below resets the vine to `AGE = 1` (`L57-60`).
- **`hydralux_sapling` (`blocks/HydraluxSaplingBlock.java` L24–81) & `hydralux` (`blocks/HydraluxBlock.java` L42–136)**:
  - Underwater plant (`EndPlantWithAgeBlock`, `AGE` `0..3`) surviving on `#betterend:survives_on_sulphuric_rock` (`sulphuric_rock`).
  - When `AGE` completes (1-in-4 `randomTick` or 1-in-4 Bone Meal), rolls height `h = MHelper.randRange(4, 8, random)` and checks that `pos.above(1..h-1)` are all `Blocks.WATER`. Places `HydraluxShape.ROOTS` at base, `VINE` along stem, and 50/50 `FLOWER_BIG_BOTTOM` + `FLOWER_BIG_TOP` or `FLOWER_SMALL_BOTTOM` + `FLOWER_SMALL_TOP` (light `15`).
  - Loot (`HydraluxBlock.java:96-119`): `FLOWER_BIG_BOTTOM` / `FLOWER_SMALL_BOTTOM` drops `1..4` `hydralux_petal` (with Fortune); `ROOTS` drops `1..2` `hydralux_sapling` (with Fortune).
- **`end_lotus_seed` (`blocks/EndLotusSeedBlock.java` L21–146) & `end_lotus_*` (`EndLotusFlowerBlock`, `EndLotusStemBlock`, `EndLotusLeafBlock`)**:
  - Underwater (`AGE` `0..3`, 1-in-4 `randomTick` / Bone Meal) on `#c:end_stones` in source water (`hasWater` checks contiguous `Fluids.WATER.getSource()` up to air above water, `L66-85`).
  - Grows `end_lotus_stem` (`ROOT` at bottom, `MIDDLE` through water, `TOP` at surface), places a 3×3 `end_lotus_leaf` pad on the water surface if the 3×3 area is clear, and places `end_lotus_flower` (light `15`, drops `1..2` `end_lotus_seed`) above the stem.
- **`end_lily_seed` (`blocks/EndLilySeedBlock.java` L18–59) & `end_lily` (`blocks/EndLilyBlock.java` L37–132)**:
  - Underwater (`AGE` `0..3`, 1-in-4 `randomTick` / Bone Meal) on `#c:end_stones` where water column reaches air (`searchForAir`). Grows `end_lily` (`BOTTOM` + `MIDDLE` in water, `TOP` in air, light `13` at `TOP`). Breaking `TOP` drops `1..2` `end_lily_leaf` + `1..2` `end_lily_seed` (`EndLilyBlock.java:81-97`).
- **`lanceleaf_seed` (`blocks/LanceleafSeedBlock.java` L20–60) & `lanceleaf` (`blocks/LanceleafBlock.java` L26–131)**:
  - `AGE` `0..3` on `amber_moss`. Grows 4–6 block tall `lanceleaf` (`PentaShape`: `BOTTOM` drops `1` seed, other segments 50% chance `1` seed).
- **`blue_vine_seed` (`blocks/BlueVineSeedBlock.java` L20–80) & `blue_vine` (`blocks/BlueVineBlock.java` L27–115)**:
  - `AGE` `0..3` on `end_moss` / `end_mycelium`. Grows 2–5 block `blue_vine` stem topped by `blue_vine_lantern` (light `15`) surrounded by 5 faces of `blue_vine_fur` (light `15`, drops `blue_vine_seed` 1/15 or self with shears/silk touch).
- **`bulb_vine_seed` (`blocks/BulbVineSeedBlock.java` L19–55) & `bulb_vine` (`blocks/BulbVineBlock.java` L20–78)**:
  - Hangs under solid/leaves/vine ceiling, `AGE` `0..3`. Grows hanging `bulb_vine` (`BOTTOM` emits light `15` and drops `1` `glowing_bulb` with shears/hoe/silk touch; other segments drop `0..1` `bulb_vine_seed` with `1/8` chance).
- **`glowing_pillar_seed` (`blocks/GlowingPillarSeedBlock.java` L23–72) & `glowing_pillar_*` (`GlowingPillarRootsBlock.java` L26–104)**:
  - `AGE` `0..3` on `amber_moss` (emits light `age * 3 + 3`). Grows 1–2 block `glowing_pillar_roots` topped by `glowing_pillar_luminophor` (light `15`, drops `1..2` `glowing_pillar_seed`) surrounded by `glowing_pillar_leaves` (light `15`).
- **`lumecorn_seed` (`blocks/LumecornSeedBlock.java` L12–23) & `lumecorn` (`blocks/LumecornBlock.java` L31–160)**:
  - `AGE` `0..3` on `end_moss`. Grows `lumecorn` (`LumecornShape`: `LIGHT_TOP`, `LIGHT_TOP_MIDDLE`, `LIGHT_MIDDLE`, `LIGHT_BOTTOM` emit light `15` and drop `0..1` `lumecorn_rod`; `BOTTOM_BIG`, `BOTTOM_SMALL`, `MIDDLE` drop `1..2` `lumecorn_seed`).
- **`small_amaranita_mushroom` (`blocks/SmallAmaranitaBlock.java` L25–112) & `large_amaranita_mushroom` (`blocks/LargeAmaranitaBlock.java` L26–108)**:
  - Survives on `end_moss`, `end_mycelium`, `jungle_moss`, `sangnum`, `mossy_obsidian`, `mossy_dragon_bone`. Bone Meal (1-in-8 success) grows `GIGANTIC_AMARANITA` if arranged in a 2×2 grid of `small_amaranita_mushroom`, otherwise `LARGE_AMARANITA` (3-block tall `TripleShape` stem/cap).
- **`pallidium_tiny` → `pallidium_thin` → `pallidium_heavy` → `pallidium_full` (`blocks/PallidiumBlock.java` L24–63)**:
  - Right-clicking with `Items.BONE_MEAL` upgrades the block to `nextLevel` (`tiny` → `thin` → `heavy` → `full`), consuming 1 Bone Meal and playing `BONE_MEAL_USE`. On `pallidium_full` (`nextLevel == null`), Bone Meal falls through to `BonemealAPI` vegetation spawning.
- **Terrain Bone Meal Spreading (`util/BonemealPlants.java` L12–90, `registry/block/EndTerrainBlocks.java` L138–157, `blocks/MossyObsidian.java` L26–101, `blocks/MossyDragonBoneBlock.java` L23–86)**:
  - All End nyliums/mosses (`end_moss`, `rutiscus`, `end_mycelium`, `jungle_moss`, `sangnum`, `cave_moss`, `chorus_nylium`, `crystal_moss`, `shadow_grass`, `pink_moss`, `amber_moss`) spread onto adjacent `end_stone` and spawn biome plants via `EndBonemealFeature` when bone-mealed. `mossy_obsidian` spreads onto adjacent `obsidian` (and decays to `obsidian` under solid blocks), and `mossy_dragon_bone` spreads onto adjacent `dragon_bone_block`.

---

### 4.4 Flower Pots, Pedestals & Infusion Pedestal

#### A. `FlowerPotBlock` & `FlowerPotBlockEntity` (`blocks/FlowerPotBlock.java` L58–293, `blocks/entities/FlowerPotBlockEntity.java` L22–99, `complexmaterials/types/FlowerPot.java` L24–99)
- **Block Properties (`FlowerPotBlock.java:65-67`)**: `EMPTY` (`boolean`, default `true`), `HAS_SOIL` (`boolean`, default `false`), `POT_LIGHT` (`IntegerProperty` `0..3`, default `0`). Shape `box(3, 0, 3, 13, 8, 13)` (`L278`).
- **Two-Stage Interaction (`useItemOn`, `L111-169`, `FlowerPotBlockEntity.java:43-77`)**:
  1. **Insert Soil**: When `!hasSoil()`, right-clicking with a valid soil block item (`PottableSoilRegistry.contains(soilBlock)`) stores `soilStack.copyWithCount(1)`, shrinks held stack by 1, sets `HAS_SOIL = true, EMPTY = false`, and plays `SoundEvents.SOUL_SOIL_PLACE`.
  2. **Insert Plant**: When `hasSoil() && !hasPlant()`, right-clicking with a valid plant item (`PottablePlantRegistry.get(plantBlock)` where `plant.isValidSoil(soilBlock)`) stores `plantStack.copyWithCount(1)`, sets `POT_LIGHT = Math.min(plantBlock.defaultBlockState().getLightEmission() / 5, 3)` (emitting `POT_LIGHT * 5` light: `0, 5, 10, 15`), and plays `SoundEvents.HOE_TILL`.
  3. **Remove Plant / Soil**: Empty-hand right-clicking removes and gives back the **plant** first (`HOE_TILL`); empty-hand right-clicking when only soil remains removes and gives back the **soil** (`SOUL_SOIL_BREAK`, resetting `HAS_SOIL = false, EMPTY = true`).
  4. **Drops (`buildLoot`, `L74-89`)**: Breaking the pot drops the pot block itself plus the stored `soil` and `plant` ItemStacks from `FlowerPotBlockEntity`.

#### B. `PedestalBlock`, `EndPedestal` & `PedestalBlockEntity` (`blocks/basis/PedestalBlock.java` L69–588, `blocks/entities/PedestalBlockEntity.java` L24–121, `complexmaterials/types/Pedestal.java` L22–84)
- **Block Properties (`PedestalBlock.java:70-72`)**:
  - `STATE` (`EndBlockProperties.PedestalState`: `DEFAULT` when standalone, `BOTTOM` / `COLUMN` / `PEDESTAL_TOP` when stacked with pedestals, `PILLAR` / `COLUMN_TOP` under solid blocks, `L226-319`).
  - `HAS_ITEM` (`boolean`, default `false`), `HAS_LIGHT` (`boolean`, default `false`).
- **Item Storage & Light (`L119-165`, `PedestalBlockEntity.java:83-94`)**:
  - Only holds an item when `isPlaceable(state)` is true (`DEFAULT` or `PEDESTAL_TOP`, `L400-404`).
  - Right-clicking with an item inserts `1` item (`split(1)`); right-clicking when holding an item (or empty hand) returns the stored item to the player and calls `checkRitual`.
  - When holding `betterend:eternal_crystal`, sets `HAS_LIGHT = true` (`PedestalBlockEntity.java:85`), emitting light **`12`** (`Pedestal.java:37`).
  - Outputs redstone comparator signal **`15`** when `HAS_ITEM == true` (`L445-448`).
  - If another pedestal is placed on top of a pedestal holding an item, `moveStoredStack` (`L339-366`) automatically transfers the stored item up to the top of the pedestal column (or pops it into the world if blocked).

#### C. `InfusionPedestal` & `InfusionRitual` (`blocks/InfusionPedestal.java` L44–232, `blocks/entities/InfusionPedestalEntity.java` L18–112, `rituals/InfusionRitual.java` L33–344)
- **8 Catalyst Socket Positions (`InfusionRitual.java:46-55, 74-88, 291-294`)**:
  - Relative to the central `InfusionPedestal` at `(0, 0, 0)` on the **same Y level**, using `(EAST = +x, NORTH = +y)` (`socketPos = pedestalPos.offset(point.x, 0, -point.y)`):
    1. **North**: `(0, +3)` → `offset(0, 0, -3)`
    2. **North-East**: `(+2, +2)` → `offset(+2, 0, -2)`
    3. **East**: `(+3, 0)` → `offset(+3, 0, 0)`
    4. **South-East**: `(+2, -2)` → `offset(+2, 0, +2)`
    5. **South**: `(0, -3)` → `offset(0, 0, +3)`
    6. **South-West**: `(-2, -2)` → `offset(-2, 0, +2)`
    7. **West**: `(-3, 0)` → `offset(-3, 0, 0)`
    8. **North-West**: `(-2, +2)` → `offset(-2, 0, -2)`
- **Ritual Execution (`InfusionRitual.java:90-176`)**:
  - Requires all 8 catalyst positions to hold valid `PedestalBlockEntity` instances (`isValid()`).
  - Matches `InfusionRecipe.TYPE` where slot `0` is the central `InfusionPedestalEntity` item and slots `1..8` are the 8 surrounding `PedestalBlockEntity` items (`L216-223`).
  - Every tick while valid and matching a recipe (`tick()`, `L132-176`): increments `progress++` toward `time = recipe.getInfusionTime()`, sending `InfusionParticleType(catalystStack)` particles from each non-empty catalyst pedestal `(x+0.5, y+1.25, z+0.5)` toward `worldPos.above() + 0.5`.
  - When `progress == time`: clears the input and all 8 catalyst pedestals (`clearContent()`), sets the central pedestal's item to `activeRecipe.value().assemble(...)`, triggers advancement `BECriteria.INFUSION_FINISHED` for players within 16 blocks, and resets the ritual.
- **UI & Hints (`InfusionPedestal.java:80-129`)**:
  - Placing an `InfusionPedestal` when the 8-pedestal ring is incomplete triggers `InfusionHint` client particles (`L82-84`).
  - Empty-hand right-clicking an empty `InfusionPedestal` replays `InfusionHint` if the ring is incomplete (`L120-125`), or opens `InfusionRecipeScreen` if the 8-pedestal ring is complete (`L114-119`, also accessible via sneak + empty-hand click when holding an item).
