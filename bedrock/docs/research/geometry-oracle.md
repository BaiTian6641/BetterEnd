# Geometry oracle research — preserved handoff report

Read-only research from this session. The integration owner independently verified the upstream uniform-row compression implementation, BetterEnd provider registration, and the 179/3,712/22,385 arithmetic against retained data. Remaining API/context recommendations are source research, not executed shape or Bedrock physics tests. No feature fix was applied before the user requested handoff.

## Summary

**The 3,712 “missing” states and 179 “stale” rows have one systematic cause: the audit intentionally compresses uniform shapes, but reconciliation interprets every audit row as an explicit state.** They are not evidence of 3,712 failed shape evaluations or 179 removed states.

The actual producer is **WorldWeaver’s `WoverBlockShapesProvider`**, present in the verified `wover-block-api-26.301.2.jar`. Matching immutable release source confirms its behavior.

A production exporter can enumerate all **22,385 live states** without placing blocks or mutating a world. It should export **explicitly labelled neutral-context samples**, separately for outline, collision, interaction and visual shapes, with per-channel failures. Such an export closes state-addressability gaps, **not in-world physics or client parity gates**.

---

## 1. Actual audit producer and mismatch cause

### Producer location and provenance

Local compiled producer:

```text
bedrock/.work/java-reference/dependency-jars/wover-block-api-26.301.2.jar
  de/ambertation/wover/datagen/api/provider/WoverBlockShapesProvider.class
  de/ambertation/wover/datagen/api/provider/WoverBlockShapesProvider$Provider.class
```

It is a nested WorldWeaver module, not BetterEnd’s build-script exclusion or WunderLib:

- Module SHA-256 recorded in `bedrock/upstream/java-dependencies.lock.json`:
  `962a9cece08978a5d39c9a001fbac5f8981bf399d2ffaa029b94ed649546542d`
- Matching immutable WorldWeaver release commit:
  `36ee9d8b697a777fbd9f51e7a18259c12598fe14`.
- Its [`gradle.properties`](https://github.com/quiqueck/WorldWeaver/blob/36ee9d8b697a777fbd9f51e7a18259c12598fe14/gradle.properties) declares Minecraft `26.3`, mod `26.301.2`.
- [Producer source, lines 50–196](https://github.com/quiqueck/WorldWeaver/blob/36ee9d8b697a777fbd9f51e7a18259c12598fe14/wover-block-api/src/main/java/de/ambertation/wover/datagen/api/provider/WoverBlockShapesProvider.java#L50-L196).

BetterEnd registers it directly:

```text
bedrock/.work/java-reference/source/src/main/java/org/betterx/datagen/betterend/BetterEndDatagen.java:67-73
```

```java
globalPack.addProvider(WoverBlockShapesProvider::new);
```

### Exact producer signatures

Within `de.ambertation.wover.datagen.api.provider.WoverBlockShapesProvider`:

```java
public WoverBlockShapesProvider(ModCore modCore);

public DataProvider getProvider(
    FabricPackOutput output,
    CompletableFuture<HolderLookup.Provider> registriesFuture);

private static String coord(double value);
private static String aabb(AABB box);
private static String shapeString(
    BlockState state, Function<BlockState, VoxelShape> extractor);
private static VoxelShape outline(BlockState state);
private static VoxelShape collision(BlockState state);
private static String shapesFor(BlockState state);
private static <T extends Comparable<T>> String propertyValue(
    BlockState state, Property<T> property);
private static String propertyString(BlockState state);
private static void appendLines(List<String> out, Identifier id, Block block);
```

Its private `Provider implements DataProvider` supplies:

```java
public CompletableFuture<?> run(CachedOutput writer);
public String getName();
```

### What the producer actually records

The source establishes:

1. Enumerates `block.getStateDefinition().getPossibleStates()`.
2. Evaluates:
   ```java
   state.getShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO)
   state.getCollisionShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO)
   ```
3. Converts shapes to sorted AABB strings.
4. **Rounds coordinates to four decimal places before comparing shape pairs.**
5. If every state has the same formatted outline/collision pair, emits:
   ```text
   betterend:block_id  shape=... collision=...
   ```
   **No property assignment is emitted.**
6. Otherwise emits one property-qualified row per state.
7. An exception during extraction becomes `"unavailable"`; exception details are discarded. `null` is treated as `"empty"`.

The uniform compression is explicit at producer lines **140–157**. This is uniformity **under that context and rounded representation**, not a general declaration that all world contexts behave identically.

### Why reconciliation reports mismatches

- `bedrock/tools/catalogue.mjs:71-105` converts an unqualified audit row into `states: {}`.
- `bedrock/tools/runtime-reconciliation.mjs:20-48` compares that empty assignment’s key `""` against complete live property assignments.

Observed data:

| Quantity | Count |
|---|---:|
| Live blocks | 728 |
| Live states | 22,385 |
| Audit rows | 18,852 |
| Property-bearing blocks compressed to one unqualified row | 179 |
| Live states belonging to those 179 blocks | 3,712 |
| Reported stale keys | 179, **all `""`** |
| Audit records containing `unavailable` | **0** |
| Explicit audit/live state-key intersection | 18,673 |

Thus:

```text
18,852 − 179 + 3,712 = 22,385
```

**Every reported mismatch is explained by uniform-row compression.** There is no additional stale-property-value category in this report.

Correctly interpreting these rows can establish inherited **audit-context coverage**, but must not set `shapesRuntimeVerified=true`: the checked-in audit is still not a production-runtime geometry observation.

---

## 2. Complete mismatch grouping

Counts below come from `runtime-reconciliation.json.blockStateCoverage`, joined to the live classes/domains already retained in `bedrock/catalogue/generated/registrations.json`.

Abbreviations: **MC** = `net.minecraft.world.level.block`; **BC** = `org.betterx.bclib`; **BE** = `org.betterx.betterend.blocks`. Every affected block contributes exactly **one stale empty-key row**.

| Properties / live domain | Actual implementation classes or family | Blocks = stale rows | Missing explicit state rows |
|---|---|---:|---:|
| `facing` × six Boolean `slot_*_occupied` = 256 | MC `ChiseledBookShelfBlock` | 10 | **2,560** |
| `rotation=0..15`, `waterlogged` = 32 | MC `StandingSignBlock` | 10 | 320 |
| `axis=x,y,z` | MC `RotatedPillarBlock` ×51; BE `AmaranitaStemBlock` ×2, `BuddingSmaragdantCrystalBlock`, `MossyDragonBoneBlock` | 55 | 165 |
| `distance=1..7`, `persistent`, `waterlogged` = 28 | MC `TintedParticleLeavesBlock` | 5 | 140 |
| Six-direction `facing`, `open` = 12 | MC `BarrelBlock` | 10 | 120 |
| Horizontal `facing` = 4 | BC `furniture.block.BaseBarStool$Wood` ×11 and `BaseTaburet$Wood` ×11 | 22 | 88 |
| Horizontal `facing`, `lit` = 8 | BC `blocks.BaseFurnaceBlock` ×8; BE `EndStoneSmelter` | 9 | 72 |
| `age=0..3` | Seed/crop classes listed below | 13 | 52 |
| `shape` | Eleven triple-shape blocks plus six-state `HydraluxBlock`, listed below | 12 | 39 |
| `pot_light=0..3` | BE `FlowerPotBlock` | 8 | 32 |
| `color=0..7` | BE `HelixTreeLeavesBlock`, `JellyshroomCapBlock`, `UmbrellaTreeMembraneBlock` | 3 | 24 |
| `rotation=0..3`, five-value `shape` = 20 | BE `LanceleafBlock` | 1 | 20 |
| Horizontal `facing`, `fullness=0..3` = 16 | BE `SilkMothHiveBlock` | 1 | 16 |
| `rotation=0..3`, `top` = 8 | BE `TwistedUmbrellaMossTallBlock`, `UmbrellaMossTallBlock` | 2 | 16 |
| `stage=0,1` | Eight BE subclasses of BC `FeatureSaplingBlock` | 8 | 16 |
| Horizontal `facing`, triple `shape` = 12 | BE `EndLotusLeafBlock` | 1 | 12 |
| `natural` | BE `BlueVineLanternBlock`, `GlowingPillarLuminophorBlock`, `UmbrellaTreeClusterBlock`, `UmbrellaTreeClusterEmptyBlock` | 4 | 8 |
| `active` | BE `BrimstoneBlock`; `RunedFlavolite` ×2 | 3 | 6 |
| `active`, `waterlogged` = 4 | BE `HydrothermalVentBlock` | 1 | 4 |
| `transition` | BE `MossyGlowshroomCapBlock` | 1 | 2 |
| **Total** | | **179** | **3,712** |

Family details:

- **Age:** `BlueVineSeedBlock`, `BulbVineSeedBlock`, `CavePumpkinVineBlock`, `EndLilySeedBlock`, `EndLotusSeedBlock`, `GlowingPillarSeedBlock`, `HydraluxSaplingBlock`, `LanceleafSeedBlock`, `LumecornSeedBlock`, `ShadowBerryBlock`, and three `basis.PottableCropBlock` registrations: amber root, blossom berry, chorus mushroom.
- **Shape:** five BC `BaseVineBlock` registrations—dense vine, jungle vine, magnula, rubinea, twisted vine—plus BE `BlueVineBlock`, `BulbVineBlock`, `CaveMossBlock`, `FilaluxBlock`, `GlowingPillarRootsBlock`, `TenaneaFlowersBlock`, and `HydraluxBlock`.
- **Saplings:** dragon tree, helix tree, lacugrove, lucernia, mossy glowshroom, pythadendron, tenanea, umbrella tree.
- **Lanceleaf shape domain:** `bottom`, `pre_bottom`, `middle`, `pre_top`, `top`.
- **Hydralux shape domain:** `flower_big_bottom`, `flower_big_top`, `flower_small_bottom`, `flower_small_top`, `vine`, `roots`.

---

## 3. Exact 26.3 APIs and important distinctions

### State enumeration and shape entry points

Existing local API declarations provide direct evidence:

```text
bedrock/.work/java-reference/exports/java-api-extra.txt:74-90
bedrock/.work/java-reference/exports/java-api-declarations.txt:134-145
```

```java
// net.minecraft.world.level.block.Block
public StateDefinition<Block, BlockState> getStateDefinition();
public boolean hasDynamicShape();

// net.minecraft.world.level.block.state.StateDefinition<O,S>
public ImmutableList<S> getPossibleStates();
public Collection<Property<?>> getProperties();

// net.minecraft.world.level.block.state.BlockBehaviour.BlockStateBase
// Inherited by BlockState:
public VoxelShape getShape(BlockGetter level, BlockPos pos);
public VoxelShape getShape(
    BlockGetter level, BlockPos pos, CollisionContext context);

public VoxelShape getCollisionShape(BlockGetter level, BlockPos pos);
public VoxelShape getCollisionShape(
    BlockGetter level, BlockPos pos, CollisionContext context);

public VoxelShape getInteractionShape(BlockGetter level, BlockPos pos);
public VoxelShape getVisualShape(
    BlockGetter level, BlockPos pos, CollisionContext context);

public VoxelShape getEntityInsideCollisionShape(
    BlockGetter level, BlockPos pos, Entity entity);
public VoxelShape getBlockSupportShape(BlockGetter level, BlockPos pos);
public VoxelShape getOcclusionShape();

public Vec3 getOffset(BlockPos pos);
public boolean hasOffsetFunction();
```

The implementation-layer signatures on `BlockBehaviour` are:

```java
protected VoxelShape getShape(
    BlockState state, BlockGetter level, BlockPos pos, CollisionContext context);
protected VoxelShape getCollisionShape(
    BlockState state, BlockGetter level, BlockPos pos, CollisionContext context);
protected VoxelShape getVisualShape(
    BlockState state, BlockGetter level, BlockPos pos, CollisionContext context);
protected VoxelShape getInteractionShape(
    BlockState state, BlockGetter level, BlockPos pos);
```

BetterEnd/BCLib commonly widen these overrides to `public`. **Call the public `BlockState` methods**, rather than using reflection or access widening.

### Cached versus explicitly contextual collision

The [26.3 `BlockBehaviour` implementation](https://mc-packet-reference.netlify.app/26.x/source/src/main/java/net/minecraft/world/level/block/state/BlockBehaviour.java), lines 671–700 and 933–962, distinguishes:

```java
getCollisionShape(level, pos)
    // Returns cache.collisionShape when a cache exists.

getCollisionShape(level, pos, context)
    // Dispatches to the block implementation with the supplied context.
```

The cache is created for blocks not marked `dynamicShape`, using `EmptyBlockGetter`, zero position and empty collision context.

**Recommendation:** use the **three-argument collision overload** for the new explicitly contextual sample. Record the two-argument form only if separately documenting legacy audit/cache behavior; do not silently treat the overloads as interchangeable in contextual scenarios.

### Neutral getter and collision context

`net.minecraft.world.level.EmptyBlockGetter` is an enum implementing `BlockGetter`, with `INSTANCE`:

```java
public @Nullable BlockEntity getBlockEntity(BlockPos pos); // null
public BlockState getBlockState(BlockPos pos);              // AIR
public FluidState getFluidState(BlockPos pos);              // EMPTY
public int getMinY();                                      // 0
public int getHeight();                                    // 0
```

**It returns air even at the queried block’s own position.** Passing a `BlockState` to its shape method does not install that state into the getter.

Relevant `CollisionContext` factories:

```java
static CollisionContext empty();
static CollisionContext emptyWithFluidCollisions();
static CollisionContext of(Entity entity);
static CollisionContext of(Entity entity, boolean alwaysCollideWithFluid);
static CollisionContext positionContext(double y);
static CollisionContext placementContext(@Nullable Player player);
static CollisionContext withPosition(@Nullable Entity entity, double position);
```

The neutral `empty()` context has no entity, an empty held item, no descending/placement flag, and no forced fluid collision. Its `isAbove(...)` returns the caller-supplied default. It is **not a simulated standing player**.

References: [EmptyBlockGetter](https://mc-packet-reference.netlify.app/26.x/source/net/minecraft/world/level/emptyblockgetter/), [CollisionContext](https://mc-packet-reference.netlify.app/26.x/source/net/minecraft/world/phys/shapes/collisioncontext/), [EntityCollisionContext](https://mc-packet-reference.netlify.app/26.x/source/src/main/java/net/minecraft/world/phys/shapes/EntityCollisionContext.java).

### VoxelShape/AABB extraction

```java
// net.minecraft.world.phys.shapes.VoxelShape
public boolean isEmpty();
public void forAllBoxes(Shapes.DoubleLineConsumer consumer);
public List<AABB> toAabbs();
public AABB bounds();
public VoxelShape move(double dx, double dy, double dz);

// net.minecraft.world.phys.shapes.Shapes.DoubleLineConsumer
void consume(
    double x1, double y1, double z1,
    double x2, double y2, double z2);

// net.minecraft.world.phys.AABB
public final double minX, minY, minZ, maxX, maxY, maxZ;
public AABB(
    double minX, double minY, double minZ,
    double maxX, double maxY, double maxZ);
```

- Prefer **`forAllBoxes`** for serialization: `toAabbs()` allocates a list and an AABB for every box.
- Preserve the union of boxes. **`bounds()` loses holes and disconnected components** and throws for an empty shape.
- Coordinates are block-local world units, not `Block.box`’s sixteenth-block input units.
- Preserve values outside `[0,1]`; wall collision shapes in the existing audit reach **Y=1.5**.
- Do not copy the audit’s four-decimal quantization into authoritative numeric data.
- Never apply `state.getOffset(pos)` a second time automatically. Several shape implementations already apply it; others do not.

References: [VoxelShape](https://mc-packet-reference.netlify.app/26.x/source/src/main/java/net/minecraft/world/phys/shapes/VoxelShape.java), [AABB](https://mc-packet-reference.netlify.app/26.x/source/src/main/java/net/minecraft/world/phys/AABB.java). The immutable WorldWeaver producer independently corroborates `isEmpty()`, `toAabbs()` and the six AABB fields.

### Shape channels are not synonyms

- `getShape`: outline/selection geometry.
- `getCollisionShape`: block collision geometry for the supplied context.
- `getVisualShape`: a separate visual ray-shape channel, **not rendered mesh geometry**.
- `getInteractionShape`: an additional ray-hit override shape, **not execution of right-click interactions**.

In 26.3, `BlockGetter.clipWithInteractionOverride` uses interaction geometry to adjust the hit **direction** when appropriate; it is not a substitute collision volume. `ClipContext.Block` explicitly maps `OUTLINE`, `COLLIDER`, and `VISUAL` to their respective methods.

Concrete example: `ComposterBlock` returns level-dependent outline, the empty-composter collision shape, and a full-block interaction shape. BetterEnd’s `EndLotusFlowerBlock` likewise deliberately has different outline and collision shapes.

References: [ClipContext](https://mc-packet-reference.netlify.app/26.x/source/src/main/java/net/minecraft/world/level/ClipContext.java), [BlockGetter, lines 85–98](https://mc-packet-reference.netlify.app/26.x/source/src/main/java/net/minecraft/world/level/BlockGetter.java).

---

## 4. Context requirements and limitations

### Direct shape dependencies

| Requirement | Classes / evidence | What neutral sampling misses |
|---|---|---|
| **Actual neighbor state** | BE `NeonCactusPlantBlock.getShape(...)`, local source **140–155** | Reads `view.getBlockState(pos.relative(facing))`. A same-block neighbor selects closed axis shapes; otherwise open/end shapes. All **108 states already have audit rows**, but only the empty-neighbor case was audited. |
| **Block entity contents** | BE `FlowerPotBlock.getShape(...)`, **216–226** | A `FlowerPotBlockEntity` with a present plant selects `SHAPE_FULL`; absent BE/plant selects `SHAPE_EMPTY`. Collision remains the pot body. `pot_light` does not encode plant presence. Eight pots, **32 states**. |
| **Position-dependent offsets** | BC `BasePlantBlock:56–59`, `AbstractVineBlock:58–60`, `BaseDoublePlantBlock:51–53`, `UnderwaterPlantBlock:37–39`; BE `EndLilyBlock:77–80`, `SmallAmaranitaBlock:57–59` | Shape methods move geometry by `state.getOffset(pos)`. Zero position can produce a nonzero offset. A zero-position sample is not every-position geometry. |
| **Fluid neighbors / fluid physics** | `FlowingFluid.getHeight/getShape`; BE aquatic plants, waterlogged blocks, vent column | Fluid height can depend on same-fluid content above. Empty getter has no neighboring fluid. A block’s collision boxes do not capture fluid height, flow, swimming or buoyancy. |
| **Entity/level behavior outside shape getters** | BC `AbstractChair`; BE hazards, portal, petals, ice; slime-derived blocks | Shape samples do not execute seating, damage, teleportation, fall handling, motion changes or fluid effects. |

Primary BCLib sources are from matching `26.301.2` release commit
[`fd50807b03d34e6886d8a288c600877277725121`](https://github.com/quiqueck/BCLib/tree/fd50807b03d34e6886d8a288c600877277725121);
its `gradle.properties` declares Minecraft `26.3` and mod `26.301.2`.

Important primary-source examples:

- [BasePlantBlock](https://github.com/quiqueck/BCLib/blob/fd50807b03d34e6886d8a288c600877277725121/src/main/java/org/betterx/bclib/blocks/BasePlantBlock.java#L55-L59)
- [AbstractVineBlock](https://github.com/quiqueck/BCLib/blob/fd50807b03d34e6886d8a288c600877277725121/src/main/java/org/betterx/bclib/blocks/AbstractVineBlock.java#L57-L61)
- [AbstractChair](https://github.com/quiqueck/BCLib/blob/fd50807b03d34e6886d8a288c600877277725121/src/main/java/org/betterx/bclib/furniture/block/AbstractChair.java)

### Do not use `dynamicShape` as a context-dependency classifier

The live corpus marks only four blocks dynamic:

- `glowing_pillar_roots`
- `lanceleaf`
- `lanceleaf_seed`
- `large_amaranita_mushroom`

**Both `neon_cactus` and the flower pots are `dynamicShape=false` despite the dependencies above.**

Similarly, `hasOffsetFunction=true` means an offset exists, not that every override applies it. For example, `SmallJellyshroomBlock.getShape` returns its facing shape directly despite its registration assigning an offset type.

### Geometry can be state-only while behavior needs a world

These distinctions matter:

- `PedestalBlock.getShape` selects by `STATE`; pedestal item/ritual behavior still needs block entities and level state.
- `BaseChair.getShape/getCollisionShape` selects by `TOP`; placement creates the upper block, and `AbstractChair.onPlace/useWithoutItem` creates/finds/rides an `EntityChair`. **Do not place furniture just to collect shapes.**
- `StalactiteBlock.getShape` selects by `SIZE`; support, size updates and waterlogging inspect neighbors.
- `EndLotusLeafBlock.getShape` is fixed; survival requires water below.
- Walls, fences, stairs, chest halves and multiface cover can encode connections in properties; exporting every property combination does not prove placement/update logic or that every combination is naturally reachable.
- `MengerSpongeBlock.getShape` is fixed; `onPlace/updateShape` can absorb water.
- `AncientEmeraldIceBlock.stepOn` modifies entity freezing state; `MurkweedBlock` and `NeedlegrassBlock` have entity effects/damage; `NeonCactusPlantBlock.entityInside` damages entities; `EndPortalBlock.entityInside` initiates portal handling.
- `HydraluxPetalBlock` overrides `fallOn`; `JellyshroomCapBlock` and `UmbrellaTreeMembraneBlock` inherit slime behavior. Full-cube geometry does not imply ordinary full-cube physics.

The corpus contains **293 blocks with a nonempty fluid state in at least one state**, and **115 block-entity blocks**. Neither count means those blocks require fluid/BE data merely to return their neutral block shape.

---

## 5. Concrete non-destructive exporter contract

### Required sampling scope

Extend the existing production `SERVER_STARTED` exporter, retaining its isolated-server and provenance controls.

For every live state of every included block:

1. Preserve the complete typed property assignment.
2. At `BlockPos.ZERO`, evaluate independently:
   ```java
   state.getShape(EmptyBlockGetter.INSTANCE, pos, CollisionContext.empty());
   state.getCollisionShape(EmptyBlockGetter.INSTANCE, pos, CollisionContext.empty());
   state.getInteractionShape(EmptyBlockGetter.INSTANCE, pos);
   state.getVisualShape(EmptyBlockGetter.INSTANCE, pos, CollisionContext.empty());
   ```
3. Serialize each returned shape’s exact box union using `forAllBoxes`.
4. Retain **one explicit state record even if all four shapes equal another state’s shapes**. Deduplication may use separately referenced geometry values, but must not erase state identities.

Expected domain coverage for the recorded profile: **728 blocks, 22,385 state records, 89,540 channel outcomes**.

### Required metadata

At export/sample level:

```text
scope = neutral-block-shape-sample
getterClass = net.minecraft.world.level.EmptyBlockGetter
position = [0,0,0]
selfPresentInGetter = false
neighborPolicy = air-everywhere
getterFluidPolicy = empty-everywhere
blockEntityPolicy = absent
collisionContext = empty-without-fluid-collisions
entity = absent
coordinateSpace = block-local
```

At block/state level retain:

- Implementation class and existing profile/artifact provenance.
- `dynamicShape`, `hasBlockEntity`, `hasOffsetFunction`.
- Exact `state.getOffset(pos)` result.
- Intrinsic `state.getFluidState()` metadata, distinguished from the getter’s empty-fluid policy.
- Known dependency classifications: neighbor-sensitive, BE-sensitive, position-offset, world-behavior-dependent.

These classifications must not be inferred solely from `dynamicShape`, `hasBlockEntity`, or whether the baseline call happened to succeed.

### Failure and completeness semantics

Each channel must distinguish:

- `ok` with numeric boxes;
- `empty` with no boxes;
- `error` with stage, exception class/message and retained diagnostic details;
- `null-return` as an error, **not empty**.

Continue recording independent channels/states after recoverable failures. Fatal termination must leave the export incomplete. Record attempted/successful/failed totals separately: **coverage completeness is not successful-geometry completeness**.

**Never:**

- Replace errors with a full cube or empty shape.
- Flatten a shape to `bounds()`.
- Round authoritative coordinates to four decimals.
- Clamp boxes to `[0,1]`.
- Add offsets twice.
- Invent a player/entity for `getEntityInsideCollisionShape`.
- Invoke placement, neighbor updates, ticks, interactions, block-entity tickers, entity spawning, or `setBlock`.

Keep fluid geometry and actual neighbor/BE/entity scenarios separate from this baseline. A later contextual observation must carry its own context identity and evidence; it must not overwrite the neutral sample or silently promote it to complete physics.

---

## Files and architecture

Key integration/research files:

- `bedrock/tools/catalogue.mjs:71-105` — parses audit rows; loses the producer’s uniform-all-states distinction.
- `bedrock/tools/runtime-reconciliation.mjs:20-48` — exact state-key comparison producing the mismatch counts.
- `bedrock/reports/runtime-reconciliation.json` — complete mismatch membership.
- `bedrock/catalogue/generated/registrations.json` — joins audit records, live classes, property domains and live state data.
- `bedrock/java-exporter/src/main/java/dev/baitian/betterend/reference/ReferenceExporter.java:54-126,128-190` — production lifecycle, output safety, and existing complete live-state enumeration.
- `bedrock/.work/java-reference/exports/java-api-declarations.txt:134-145` — local compiled state-shape API signatures.
- `bedrock/.work/java-reference/exports/java-api-extra.txt:74-90` — local compiled enumeration APIs.
- `bedrock/.work/java-reference/source/src/main/java/org/betterx/betterend/blocks/NeonCactusPlantBlock.java:140-155` — neighbor-sensitive shape.
- `bedrock/.work/java-reference/source/src/main/java/org/betterx/betterend/blocks/FlowerPotBlock.java:216-226,289-292` — BE-sensitive outline and separate collision.
- `bedrock/.work/java-reference/source/src/main/java/org/betterx/betterend/blocks/basis/PedestalBlock.java:407-423` — example of state-only geometry despite broader BE behavior.

**Architecture:** BetterEnd datagen → WorldWeaver compressed shape audit → catalogue parser → exact live-state reconciliation. The production exporter already enumerates the authoritative live domain; adding explicit neutral shape outcomes there avoids treating the compressed datagen text as a state registry.

### Evidence limitations

This investigation was read-only: **no builds, tests, fresh `javap` execution, shape evaluations, or world mutations were performed**. Local saved declarations confirm the public state APIs. Dependency implementations are tied to immutable matching release sources and locally present classes. Additional Minecraft implementation bodies cited above come from a version-labelled **secondary 26.3 decompile mirror**, not a newly attested disassembly of the local Minecraft JAR.

No findings here establish in-world behavior or either Bedrock client lane’s results.
