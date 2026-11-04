import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  InMemoryWorldPropertyAdapter,
  PERSISTENCE_SCHEMA_VERSION,
  PersistenceStore,
  TRANSACTION_STATES,
} from '../runtime/persistence/store.js';
import {
  ANVIL_LEVELS,
   DEFAULT_ALLOYING_RECIPES,
  DEFAULT_INFUSION_RECIPES,
  DEFAULT_SMITHING_RECIPES,
  DIGGER_TOOL_LEVELS,
  INFUSION_COMPASS_OFFSETS,
  SMELTER_FUEL_REGISTRY,
  StationsService,
} from '../runtime/stations/stations-service.js';
import {
  ARMOR_TIERS,
  ELYTRA_DYNAMIC_PROPERTY_KEYS,
  ELYTRA_VARIANTS,
  EquipmentService,
  HAMMER_TIER_STATS,
  TOOL_TIERS,
} from '../runtime/equipment/equipment-service.js';
import {
  BOAT_AND_RAFT_ITEMS,
  CHAIR_BLOCKS,
  EcologyService,
  WILDLIFE_FAMILIES,
} from '../runtime/ecology/ecology-service.js';
import {
  OBELISK_HORIZONTAL_LANDING_OFFSETS,
  RESPAWN_OBELISK_AMBER_COST,
  TransportService,
} from '../runtime/transport/transport-service.js';
import {
  BETTEREND_ADVANCEMENTS,
  PresentationService,
  REGION_PARTICLE_FAMILIES,
  REGION_PRESENTATION_PRESETS,
} from '../runtime/presentation/presentation-service.js';
import {
  COMPATIBILITY_SCHEMA_VERSION,
  CompatibilityService,
  QUERY_CHANNEL_ID,
  RESPONSE_CHANNEL_ID,
} from '../runtime/integration/compatibility-service.js';
import { BetterEndRuntime } from '../runtime/bootstrap/bootstrap.js';
import {
  resolveUiIconPath,
  openSmelterStationUi,
  openAnvilStationUi,
  handlePedestalInteraction,
  openInfusionPedestalStationUi,
  handleEternalPedestalInteraction,
  openEternalPedestalStationUi,
  handleRespawnObeliskInteraction,
  handleSilkMothHousingInteraction,
  openStorageContainerUi,
  openSignEditorUi,
  openGuidebookUi,
  handleJukeboxRecordInteraction,
  stopJukeboxRecordAt,
  handleChiseledBookshelfInteraction,
  ensureContainerCarrierEntity,
  destroyContainerCarrierAndBlock,
  stepLiveSmelters,
} from '../runtime/stations/station-ui.js';

const workspace = fileURLToPath(new URL('../', import.meta.url));

test('Runtime ES modules contain zero Node-specific or static beta graphics imports', async () => {
  const runtimeFiles = [
    'runtime/persistence/store.js',
    'runtime/stations/stations-service.js',
    'runtime/stations/station-ui.js',
    'runtime/equipment/equipment-service.js',
    'runtime/ecology/ecology-service.js',
    'runtime/transport/transport-service.js',
    'runtime/presentation/presentation-service.js',
    'runtime/integration/compatibility-service.js',
  ];

  for (const relPath of runtimeFiles) {
    const source = await readFile(path.join(workspace, relPath), 'utf8');
    assert.equal(/from\s+['"]node:/u.test(source), false, `${relPath} must not import node:* modules`);
    assert.equal(/require\s*\(/u.test(source), false, `${relPath} must be a pure ES module`);
    assert.equal(
      /import\s+.*from\s+['"]@minecraft\/server-graphics['"]/u.test(source),
      false,
      `${relPath} must not statically import @minecraft/server-graphics`,
    );
  }
});

test('INV-001: PersistenceStore region sharding, string chunking, LRU cache, station generationId isolation, and crash quarantine', () => {
  const worldAdapter = new InMemoryWorldPropertyAdapter();
  const store = new PersistenceStore({
    world: worldAdapter,
    maxChunkChars: 256,
    maxCachedShards: 2,
    autoFlush: false,
  });

  assert.equal(store.schemaVersion, PERSISTENCE_SCHEMA_VERSION);

  // 1. Region sharding and bounded LRU eviction
  const stationA = store.registerStation({
    dimension: 'minecraft:the_end',
    anchor: { x: 10, y: 64, z: 10 },
    stationType: 'betterend:end_stone_smelter',
    state: { label: 'A'.repeat(400) },
  });
  const stationB = store.registerStation({
    dimension: 'minecraft:the_end',
    anchor: { x: 300, y: 64, z: 300 },
    stationType: 'betterend:end_stone_smelter',
  });
  const stationC = store.registerStation({
    dimension: 'minecraft:the_end',
    anchor: { x: 700, y: 64, z: 700 },
    stationType: 'betterend:end_stone_smelter',
  });

  const statsAfterEvict = store.getStats();
  assert.equal(statsAfterEvict.cachedShardCount, 2);
  assert.ok(statsAfterEvict.evictionCount >= 1);

  store.flush();
  assert.equal(store.isDirty(), false);

  // Verify chunked dynamic property reload from a fresh store instance
  const reloadedStore = new PersistenceStore({
    world: worldAdapter,
    maxChunkChars: 256,
    maxCachedShards: 4,
  });
  const loadedA = reloadedStore.getStation({
    dimension: 'minecraft:the_end',
    anchor: { x: 10, y: 64, z: 10 },
    generationId: stationA.generationId,
  });
  assert.ok(loadedA);
  assert.equal(loadedA.state.label.length, 400);
  assert.ok(stationB.generationId !== stationC.generationId);

  // 2. Breaking and rebuilding at the same block coordinate never resurrects stale transactions
  const tx1 = reloadedStore.beginTransaction({
    dimension: 'minecraft:the_end',
    anchor: { x: 10, y: 64, z: 10 },
    generationId: stationA.generationId,
    recipeId: 'betterend:aeternium_ingot',
    inputs: [{ itemId: 'betterend:terminite_ingot', count: 1 }],
  });
  reloadedStore.activateTransaction(tx1.txId);

  reloadedStore.breakStation({
    dimension: 'minecraft:the_end',
    anchor: { x: 10, y: 64, z: 10 },
  });

  // Old transaction was automatically quarantined when station was broken
  const brokenTx = reloadedStore.getTransaction(tx1.txId);
  assert.equal(brokenTx.state, TRANSACTION_STATES.QUARANTINED);

  // Rebuild station at the exact same coordinate
  const rebuiltStation = reloadedStore.registerStation({
    dimension: 'minecraft:the_end',
    anchor: { x: 10, y: 64, z: 10 },
    stationType: 'betterend:end_stone_smelter',
  });
  assert.notEqual(rebuiltStation.generationId, stationA.generationId);
  assert.equal(rebuiltStation.activeTransactionId, null);

  // Stale generationId cannot query, update, or begin a transaction on the rebuilt station
  assert.equal(
    reloadedStore.getStation({
      dimension: 'minecraft:the_end',
      anchor: { x: 10, y: 64, z: 10 },
      generationId: stationA.generationId,
    }),
    null,
  );
  assert.throws(
    () =>
      reloadedStore.updateStationState({
        dimension: 'minecraft:the_end',
        anchor: { x: 10, y: 64, z: 10 },
        generationId: stationA.generationId,
        statePatch: { progress: 99 },
      }),
    /Stale station generation/u,
  );
  assert.throws(
    () =>
      reloadedStore.beginTransaction({
        dimension: 'minecraft:the_end',
        anchor: { x: 10, y: 64, z: 10 },
        generationId: stationA.generationId,
        recipeId: 'betterend:terminite_ingot',
      }),
    /Stale station generation/u,
  );

  // 3. Crash / interruption quarantine recovery across restart
  const inFlightTx = reloadedStore.beginTransaction({
    dimension: 'minecraft:the_end',
    anchor: { x: 300, y: 64, z: 300 },
    generationId: stationB.generationId,
    recipeId: 'betterend:enchanted_petal',
  });
  reloadedStore.activateTransaction(inFlightTx.txId);
  reloadedStore.markCompleting(inFlightTx.txId, {
    pendingOutputs: [{ itemId: 'betterend:enchanted_petal', count: 1 }],
  });

  // Simulate server restart and crash recovery scan
  const postCrashStore = new PersistenceStore({ world: worldAdapter });
  const quarantinedList = postCrashStore.recoverInterruptedTransactions();
  assert.equal(quarantinedList.length, 1);
  assert.equal(quarantinedList[0].txId, inFlightTx.txId);
  assert.equal(quarantinedList[0].state, TRANSACTION_STATES.QUARANTINED);

  const resolvedTx = postCrashStore.resolveQuarantinedTransaction(inFlightTx.txId, {
    resolution: 'operator_verified_safe',
  });
  assert.equal(resolvedTx.state, TRANSACTION_STATES.COMPLETED);
});

test('STA-001: End Stone Smelter 2-input alloying, 1-input smelting fallback, fuel heat accumulation, lava bucket remainder, output-full pausing, and unlit decay', () => {
  const stations = new StationsService();
  const anchor = { x: 100, y: 64, z: 100 };

  assert.equal(DEFAULT_ALLOYING_RECIPES.length, 8);
  assert.equal(SMELTER_FUEL_REGISTRY['minecraft:coal_block'].burnTime, 16000);
  assert.equal(SMELTER_FUEL_REGISTRY['minecraft:blaze_rod'].burnTime, 2400);
  assert.equal(SMELTER_FUEL_REGISTRY['minecraft:lava_bucket'].burnTime, 20000);
  assert.equal(SMELTER_FUEL_REGISTRY['minecraft:lava_bucket'].remainder, 'minecraft:bucket');
  assert.equal(SMELTER_FUEL_REGISTRY['betterend:charcoal_end'].burnTime, 3200);

  // 1. 2-input order-independent alloying with LAVA_BUCKET fuel (burnTime=20000, speedMultiplier=2.0, remainder=BUCKET)
  stations.createSmelter({
    anchor,
    slots: {
      input0: { itemId: 'minecraft:netherite_ingot', count: 2 },
      input1: { itemId: 'betterend:terminite_ingot', count: 2 },
      fuel: { itemId: 'minecraft:lava_bucket', count: 1 },
    },
  });

  // aeternium_ingot has recipeTime = 850; with lava_bucket speedMultiplier = 2.0, smeltTime = ceil(850 / 2.0) = 425
  const afterOneTick = stations.tickSmelter({ anchor, ticks: 1 });
  assert.equal(afterOneTick.smeltTime, 425);
  assert.equal(afterOneTick.availableHeat, 19999);
  assert.equal(afterOneTick.fuel.itemId, 'minecraft:bucket');
  assert.equal(afterOneTick.fuel.count, 1);

  const afterFirstCraft = stations.tickSmelter({ anchor, ticks: 424 });
  assert.equal(afterFirstCraft.completedCrafts, 1);
  assert.equal(afterFirstCraft.output.itemId, 'betterend:aeternium_ingot');
  assert.equal(afterFirstCraft.output.count, 1);
  assert.equal(afterFirstCraft.input0.count, 1);
  assert.equal(afterFirstCraft.input1.count, 1);
  assert.equal(afterFirstCraft.storedXp, 4.5);

  // 2. Output-full pausing
  stations.setSmelterSlots({
    anchor,
    output: { itemId: 'betterend:aeternium_ingot', count: 64, maxStackSize: 64 },
  });
  const pausedState = stations.tickSmelter({ anchor, ticks: 10 });
  assert.equal(pausedState.pausedReason, 'output_full');
  assert.equal(pausedState.progress, 0);
  assert.equal(pausedState.input0.count, 1);

  // 3. 1-input smelting/blasting fallback + unlit -2/tick decay
  const smelter2Anchor = { x: 105, y: 64, z: 100 };
  stations.createSmelter({
    anchor: smelter2Anchor,
    slots: {
      input0: { itemId: 'betterend:end_fish_raw', count: 1 },
      input1: null,
      fuel: null,
    },
  });
  // Inject a tiny amount of heat (10 ticks) to advance progress to 10, then let it run out of heat and decay by -2/tick
  const rawState = stations._smelters.get('minecraft:the_end@105,64,100');
  rawState.availableHeat = 10;
  rawState.speedMultiplier = 1.0;

  const litPart = stations.tickSmelter({ anchor: smelter2Anchor, ticks: 10 });
  assert.equal(litPart.activeMode, 'smelting');
  assert.equal(litPart.progress, 10);
  assert.equal(litPart.availableHeat, 0);

  const decayedPart = stations.tickSmelter({ anchor: smelter2Anchor, ticks: 3 });
  assert.equal(decayedPart.progress, 4); // 10 - 3 * 2 = 4

  // Provide coal_block fuel to finish smelting the 1-input fish
  stations.setSmelterSlots({
    anchor: smelter2Anchor,
    fuel: { itemId: 'minecraft:coal_block', count: 1 },
  });
  const finishedFish = stations.tickSmelter({ anchor: smelter2Anchor, ticks: 196 });
  assert.equal(finishedFish.output.itemId, 'betterend:end_fish_cooked');
  assert.equal(finishedFish.output.count, 1);
  assert.equal(finishedFish.input0, null);
});

test('STA-001: Leveled/Aeternium Anvil tier checks, tool durability consumption/breaking, 1-item material cost reduction, and component preservation', () => {
  const stations = new StationsService();

  assert.equal(ANVIL_LEVELS.thallasium, 1);
  assert.equal(ANVIL_LEVELS.terminite, 2);
  assert.equal(ANVIL_LEVELS.aeternium, 5);
  assert.equal(ANVIL_LEVELS.vanilla, 1);
  assert.equal(DIGGER_TOOL_LEVELS.wood, 0);
  assert.equal(DIGGER_TOOL_LEVELS.stone, 1);
  assert.equal(DIGGER_TOOL_LEVELS.iron, 2);
  assert.equal(DIGGER_TOOL_LEVELS.diamond, 3);
  assert.equal(DIGGER_TOOL_LEVELS.netherite, 4);
  assert.equal(DIGGER_TOOL_LEVELS.aeternium, 5);
  assert.equal(DEFAULT_SMITHING_RECIPES.length, 26);

  // 1. Reject insufficient anvil level (Aeternium head requires anvilLevel 5, tried on Terminite anvil 2)
  const lowAnvil = stations.executeAnvilSmithing({
    anvil: 'betterend:terminite_anvil',
    material: { itemId: 'betterend:aeternium_ingot', count: 1 },
    tool: { itemId: 'betterend:netherite_hammer', tier: 'netherite', maxDurability: 2031, damage: 0 },
    recipeId: 'betterend:aeternium_axe_head',
  });
  assert.equal(lowAnvil.success, false);
  assert.equal(lowAnvil.reason, 'insufficient_anvil_level');

  // 2. Reject insufficient tool level (Aeternium axe head requires netherite=4, tried with iron=2)
  const lowTool = stations.executeAnvilSmithing({
    anvil: 'betterend:aeternium_anvil',
    material: { itemId: 'betterend:aeternium_ingot', count: 1 },
    tool: { itemId: 'betterend:iron_hammer', tier: 'iron', maxDurability: 250, damage: 0 },
    recipeId: 'betterend:aeternium_axe_head',
  });
  assert.equal(lowTool.success, false);
  assert.equal(lowTool.reason, 'insufficient_tool_level');

  // 3. Valid smithing with surviving damaged tool (`damage < remainingDurability`)
  const validForge = stations.executeAnvilSmithing({
    anvil: 'betterend:aeternium_anvil',
    material: { itemId: 'betterend:aeternium_ingot', count: 2 },
    tool: { itemId: 'betterend:aeternium_hammer', tier: 'aeternium', maxDurability: 2196, remainingDurability: 10 },
    recipeId: 'betterend:aeternium_axe_head',
  });
  assert.equal(validForge.success, true);
  assert.equal(validForge.output.itemId, 'betterend:aeternium_axe_head');
  assert.equal(validForge.remainingMaterial.count, 1);
  assert.equal(validForge.toolBroken, false);
  assert.equal(validForge.remainingTool.remainingDurability, 4); // 10 - 6 = 4

  // 4. Tool breaking when `damage >= remainingDurability`
  const breakingForge = stations.executeAnvilSmithing({
    anvil: 'betterend:aeternium_anvil',
    material: { itemId: 'betterend:aeternium_ingot', count: 1 },
    tool: { itemId: 'betterend:netherite_hammer', tier: 'netherite', maxDurability: 2031, remainingDurability: 6 },
    recipeId: 'betterend:aeternium_pickaxe_head',
  });
  assert.equal(breakingForge.success, true);
  assert.equal(breakingForge.output.itemId, 'betterend:aeternium_pickaxe_head');
  assert.equal(breakingForge.toolBroken, true);
  assert.equal(breakingForge.remainingTool, null);

  // 5. Vanilla anvil repair with BetterEnd 1-material-unit cost reduction & component preservation
  const repairResult = stations.executeAnvilRepairOrCombine({
    anvil: 'betterend:terminite_anvil',
    base: {
      itemId: 'betterend:terminite_sword',
      maxDurability: 1200,
      damage: 850, // needs 3 units of 300 durability in vanilla
      components: { 'minecraft:custom_data': { forgedBy: 'TestPlayer' } },
      dynamicProperties: { 'betterend:uid': 'sword_uid_99' },
      enchantments: { 'minecraft:sharpness': 4, 'minecraft:unbreaking': 3 },
    },
    addition: {
      itemId: 'betterend:terminite_ingot',
      count: 5,
    },
    customName: 'Void Edge',
  });

  assert.equal(repairResult.success, true);
  assert.equal(repairResult.vanillaItemCountCost, 3);
  assert.equal(repairResult.repairItemCountCost, 2); // Math.max(1, 3 - 1) = 2
  assert.equal(repairResult.remainingAddition.count, 3); // 5 - 2 = 3
  assert.equal(repairResult.output.damage, 0);
  assert.equal(repairResult.output.customName, 'Void Edge');
  assert.deepEqual(repairResult.output.components, { 'minecraft:custom_data': { forgedBy: 'TestPlayer' } });
  assert.equal(repairResult.output.dynamicProperties['betterend:uid'], 'sword_uid_99');
  assert.deepEqual(repairResult.output.enchantments, { 'minecraft:sharpness': 4, 'minecraft:unbreaking': 3 });
});

test('STA-002: Infusion Pedestal 8-catalyst ritual, partial catalysts, concurrent player/hopper access, interruption quarantine, and Eternal Portal ritual', () => {
  const stations = new StationsService();
  const center = { x: 200, y: 70, z: 200 };

  assert.equal(DEFAULT_INFUSION_RECIPES.length, 49);
  assert.deepEqual(INFUSION_COMPASS_OFFSETS.north, [0, -3]);
  assert.deepEqual(INFUSION_COMPASS_OFFSETS.north_east, [2, -2]);
  assert.deepEqual(INFUSION_COMPASS_OFFSETS.east, [3, 0]);
  assert.deepEqual(INFUSION_COMPASS_OFFSETS.south_east, [2, 2]);
  assert.deepEqual(INFUSION_COMPASS_OFFSETS.south, [0, 3]);
  assert.deepEqual(INFUSION_COMPASS_OFFSETS.south_west, [-2, 2]);
  assert.deepEqual(INFUSION_COMPASS_OFFSETS.west, [-3, 0]);
  assert.deepEqual(INFUSION_COMPASS_OFFSETS.north_west, [-2, -2]);

  // 1. Partial-catalyst recipe (`betterend:enchanted_petal`: 4 cardinal crystal_shards, 4 diagonals empty)
  stations.setupInfusionRing({
    center,
    centerItem: { itemId: 'betterend:hydralux_petal', count: 1 },
    catalysts: {
      north: { itemId: 'betterend:crystal_shards', count: 1 },
      east: { itemId: 'betterend:crystal_shards', count: 1 },
      south: { itemId: 'betterend:crystal_shards', count: 1 },
      west: { itemId: 'betterend:crystal_shards', count: 1 },
    },
  });

  const started = stations.startInfusionRitual({ center, actor: 'player_1' });
  assert.equal(started.started, true);
  assert.equal(started.recipeId, 'betterend:enchanted_petal');
  assert.equal(started.time, 75);

  // Advance halfway (40 of 75 ticks)
  const midTick = stations.tickInfusionRitual({ center, ticks: 40 });
  assert.equal(midTick.active, true);
  assert.equal(midTick.progress, 40);

  // Concurrent player or hopper extraction on a locked catalyst pedestal must be rejected
  const northPos = { x: center.x + 0, y: center.y, z: center.z - 3 };
  const hopperAttempt = stations.interactWithPedestal({
    anchor: northPos,
    action: 'extract',
    actor: 'hopper',
  });
  assert.equal(hopperAttempt.success, false);
  assert.equal(hopperAttempt.reason, 'pedestal_locked_by_ritual');

  // Complete remaining 35 ticks
  const completed = stations.tickInfusionRitual({ center, ticks: 35 });
  assert.equal(completed.completed, true);
  assert.equal(completed.output.itemId, 'betterend:enchanted_petal');
  assert.equal(completed.receipt.state, TRANSACTION_STATES.COMPLETED);

  // Verify all 8 catalysts were consumed and output sits on the center pedestal
  assert.equal(stations.getPedestal({ anchor: northPos }).item, null);
  assert.equal(stations.getPedestal({ anchor: center }).item.itemId, 'betterend:enchanted_petal');

  // 2. Interrupted ritual when a catalyst pedestal is broken mid-ritual (zero duplication, zero silent loss)
  const center2 = { x: 250, y: 70, z: 250 };
  stations.setupInfusionRing({
    center: center2,
    centerItem: { itemId: 'minecraft:elytra', count: 1 },
    catalysts: {
      north: { itemId: 'betterend:amber_gem', count: 1 },
      north_east: { itemId: 'betterend:crystal_shards', count: 1 },
      east: { itemId: 'betterend:enchanted_membrane', count: 1 },
      south_east: { itemId: 'betterend:crystal_shards', count: 1 },
      south: { itemId: 'betterend:enchanted_membrane', count: 1 },
      south_west: { itemId: 'betterend:crystal_shards', count: 1 },
      west: { itemId: 'betterend:enchanted_membrane', count: 1 },
      north_west: { itemId: 'betterend:crystal_shards', count: 1 },
    },
  });

  const elytraRitual = stations.startInfusionRitual({ center: center2 });
  assert.equal(elytraRitual.started, true);
  assert.equal(elytraRitual.recipeId, 'betterend:crystalite_elytra');
  stations.tickInfusionRitual({ center: center2, ticks: 100 });

  // Break the east catalyst pedestal mid-ritual
  const eastPos = { x: center2.x + 3, y: center2.y, z: center2.z };
  const breakOutcome = stations.breakPedestal({ anchor: eastPos });
  assert.ok(breakOutcome);
  assert.equal(breakOutcome.droppedItems.length, 1);
  assert.equal(breakOutcome.droppedItems[0].itemId, 'betterend:enchanted_membrane');
  assert.equal(breakOutcome.quarantinedRitual.quarantined, true);

  // Verify transaction is quarantined, output was NOT minted, and all other 8 pedestals still hold their exact items
  const txRecord = stations.store.getTransaction(elytraRitual.txId);
  assert.equal(txRecord.state, TRANSACTION_STATES.QUARANTINED);
  assert.equal(stations.getPedestal({ anchor: center2 }).item.itemId, 'minecraft:elytra');
  assert.equal(stations.getPedestal({ anchor: { x: center2.x, y: center2.y, z: center2.z - 3 } }).item.itemId, 'betterend:amber_gem');

  // 3. Eternal Portal 6-pedestal activation ritual
  const portalResult = stations.activateEternalPortalRitual({
    dimension: 'minecraft:the_end',
    center: { x: 1200, y: 68, z: 1200 },
    axis: 'x',
    keyItem: 'betterend:eternal_crystal',
  });
  assert.equal(portalResult.activated, true);
  assert.equal(portalResult.pedestals.length, 6);
  assert.equal(portalResult.frameBlockCount, 16);
  assert.equal(portalResult.interiorBlockCount, 21);
  assert.equal(portalResult.receipt.state, TRANSACTION_STATES.COMPLETED);
});

test('EQP-001: Equipment tiers, Hammer 3x3 + Resonance 3x3x3 / 5x5x3 AoE mining, knockback scaling, Crystalite bonuses, and Armored/Crystalite Elytra carrier lifecycle', () => {
  const equipment = new EquipmentService();

  // 1. Tier definitions
  assert.equal(TOOL_TIERS.thallasium.durability, 320);
  assert.equal(TOOL_TIERS.terminite.durability, 1230);
  assert.equal(TOOL_TIERS.aeternium.durability, 2196);
  assert.equal(ARMOR_TIERS.crystalite.defense.total, 21);
  assert.equal(ARMOR_TIERS.aeternium.defense.total, 24);

  // 2. Hammer 3x3 base, 3x3x3 Resonance I, 5x5x3 Resonance II, and hardness/unbreakable validation
  const baseMine = equipment.mineWithHammer({
    hammer: { itemId: 'betterend:terminite_hammer', maxDurability: 1230, damage: 0 },
    origin: { x: 0, y: 64, z: 0 },
    lookVector: { x: 0, y: 0, z: 1 },
    resonanceLevel: 0,
  });
  assert.deepEqual(baseMine.dimensions, { width: 3, height: 3, depth: 1 });
  assert.equal(baseMine.minedBlocks.length, 9);
  assert.equal(baseMine.remainingDurability, 1229);

  const res1Mine = equipment.mineWithHammer({
    hammer: { itemId: 'betterend:terminite_hammer', maxDurability: 1230, damage: 0 },
    origin: { x: 0, y: 64, z: 0 },
    lookVector: { x: 0, y: 0, z: 1 },
    resonanceLevel: 1,
  });
  assert.deepEqual(res1Mine.dimensions, { width: 3, height: 3, depth: 3 });
  assert.equal(res1Mine.minedBlocks.length, 27);

  const res2Mine = equipment.mineWithHammer({
    hammer: {
      itemId: 'betterend:aeternium_hammer',
      maxDurability: 2196,
      damage: 0,
      enchantments: { 'betterend:resonance': 2 },
    },
    origin: { x: 0, y: 64, z: 0 },
    lookVector: { x: 1, y: 0, z: 0 },
    getBlock: pos =>
      pos.x === 0 && pos.y === 64 && pos.z === 1
        ? { typeId: 'minecraft:bedrock', hardness: -1, unbreakable: true }
        : { typeId: 'minecraft:end_stone', hardness: 3.0, requiredToolLevel: 1 },
  });
  assert.deepEqual(res2Mine.dimensions, { width: 5, height: 5, depth: 3 });
  assert.equal(res2Mine.minedBlocks.length, 74); // 75 - 1 unbreakable bedrock block
  assert.equal(res2Mine.skippedBlocks.length, 1);
  assert.equal(res2Mine.skippedBlocks[0].reason, 'unbreakable');

  // 3. Hammer knockback scaling by tier weight
  const kbOrder = ['thallasium', 'iron', 'gold', 'diamond', 'terminite', 'netherite', 'aeternium'];
  const kbValues = kbOrder.map(tier => equipment.computeHammerKnockback({ hammer: tier }).horizontalStrength);
  for (let i = 1; i < kbValues.length; i += 1) {
    assert.ok(
      kbValues[i] > kbValues[i - 1],
      `Expected ${kbOrder[i]} knockback (${kbValues[i]}) > ${kbOrder[i - 1]} (${kbValues[i - 1]})`,
    );
  }
  assert.ok(HAMMER_TIER_STATS.aeternium.weight > HAMMER_TIER_STATS.thallasium.weight);

  // 4. Crystalite Armor piece effects & 4/4 full-set bonus
  const crystaliteEval = equipment.evaluateCrystaliteArmor({
    equipment: {
      head: 'betterend:crystalite_helmet',
      chest: 'betterend:crystalite_chestplate',
      legs: 'betterend:crystalite_leggings',
      feet: 'betterend:crystalite_boots',
    },
    activeEffects: ['minecraft:blindness'],
    incomingFallDamage: 12,
  });
  assert.equal(crystaliteEval.hasFullSet, true);
  assert.equal(crystaliteEval.mindShieldActive, true);
  assert.equal(crystaliteEval.vitalityActive, true);
  assert.equal(crystaliteEval.agilityActive, true);
  assert.equal(crystaliteEval.softLandingActive, true);
  assert.equal(crystaliteEval.crystaliteSetBonusActive, true);
  assert.deepEqual(crystaliteEval.cancelledEffects, ['minecraft:blindness']);
  assert.ok(crystaliteEval.adjustedFallDamage < crystaliteEval.incomingFallDamage);

  // 5. Armored Elytra & Crystalite Elytra carrier metadata survival, repair, & hydrothermal updraft
  assert.equal(ELYTRA_VARIANTS.armored.defense, 6);
  assert.equal(ELYTRA_VARIANTS.armored.toughness, 1);
  assert.equal(ELYTRA_VARIANTS.armored.durability, 850);
  assert.equal(ELYTRA_VARIANTS.armored.movementFactor, 0.985);
  assert.equal(ELYTRA_VARIANTS.armored.repairItem, 'betterend:aeternium_ingot');

  assert.equal(ELYTRA_VARIANTS.crystalite.defense, 6);
  assert.equal(ELYTRA_VARIANTS.crystalite.toughness, 3);
  assert.equal(ELYTRA_VARIANTS.crystalite.durability, 950);
  assert.equal(ELYTRA_VARIANTS.crystalite.movementFactor, 0.99);
  assert.equal(ELYTRA_VARIANTS.crystalite.repairItem, 'betterend:amber_gem');

  let armoredCarrier = equipment.createElytraCarrier('armored', {
    enchantments: { 'minecraft:unbreaking': 2 },
  });
  const originalUid = armoredCarrier.dynamicProperties[ELYTRA_DYNAMIC_PROPERTY_KEYS.UID];
  assert.equal(armoredCarrier.typeId, 'minecraft:elytra');
  assert.equal(armoredCarrier.isStackable, false);
  assert.equal(armoredCarrier.dynamicProperties[ELYTRA_DYNAMIC_PROPERTY_KEYS.VARIANT], 'armored');

  // Flight + rocket + hydrothermal vent updraft
  const flightStep = equipment.tickElytraFlight({
    carrier: armoredCarrier,
    velocity: { x: 0.4, y: -0.1, z: 0.6 },
    flightTicks: 200,
    fireworkRocketUsed: true,
    overHydrothermalVent: true,
    ventActive: true,
    distanceAboveVent: 10,
  });
  assert.equal(flightStep.gliding, true);
  assert.equal(flightStep.fireworkRocketApplied, true);
  assert.equal(flightStep.hydrothermalUpdraftApplied, true);
  assert.equal(flightStep.updraftBoostMultiplier, 5.0);
  assert.ok(flightStep.velocity.y >= 0.3);
  armoredCarrier = flightStep.carrier;

  // Transfer across equip -> container -> player transfer -> death drop -> reconnect
  for (const op of ['equip', 'container_store', 'player_transfer', 'death_drop_recover', 'reconnect']) {
    armoredCarrier = equipment.transferElytraCarrier(armoredCarrier, op);
    assert.equal(armoredCarrier.dynamicProperties[ELYTRA_DYNAMIC_PROPERTY_KEYS.UID], originalUid);
    assert.equal(armoredCarrier.dynamicProperties[ELYTRA_DYNAMIC_PROPERTY_KEYS.VARIANT], 'armored');
  }

  // Repair on anvil with `betterend:aeternium_ingot`
  const repairedArmored = equipment.repairElytraOnAnvil({
    carrier: armoredCarrier,
    material: { itemId: 'betterend:aeternium_ingot', count: 2 },
  });
  assert.equal(repairedArmored.success, true);
  assert.equal(repairedArmored.newDamage, 0);
  assert.equal(repairedArmored.carrier.dynamicProperties[ELYTRA_DYNAMIC_PROPERTY_KEYS.UID], originalUid);

  // Crystalite Elytra repair with `betterend:amber_gem` and armor mitigation comparison
  const crystaliteCarrier = equipment.createElytraCarrier('crystalite', { damage: 400 });
  const repairedCrystalite = equipment.repairElytraOnAnvil({
    carrier: crystaliteCarrier,
    material: { itemId: 'betterend:amber_gem', count: 3 },
  });
  assert.equal(repairedCrystalite.success, true);
  assert.equal(repairedCrystalite.newDamage, 0);

  const armoredMit = equipment.computeElytraDamageMitigation(armoredCarrier, 10);
  const crystaliteMit = equipment.computeElytraDamageMitigation(crystaliteCarrier, 10);
  assert.ok(crystaliteMit.mitigatedDamage <= armoredMit.mitigatedDamage);
});

test('ECO-001, FARM-001, BLK-002: All 6 wildlife families, Silk Moth nest/hive production & harvest, Menger sponge BFS, Brimstone + Sulphur crystal, interactive blocks, and 33 chairs / 20 boats', () => {
  const ecology = new EcologyService();

  // 1. Verify all 6 wildlife families stats, peaceful compliance, behaviors, and loot
  assert.equal(WILDLIFE_FAMILIES.dragonfly.health, 20);
  assert.equal(WILDLIFE_FAMILIES.end_fish.health, 6);
  assert.equal(WILDLIFE_FAMILIES.shadow_walker.health, 40);
  assert.equal(WILDLIFE_FAMILIES.shadow_walker.attack, 5);
  assert.equal(WILDLIFE_FAMILIES.cubozoa.health, 10);
  assert.equal(WILDLIFE_FAMILIES.silk_moth.health, 4);

  // Hostile monsters are blocked in peaceful mode
  const peacefulWalker = ecology.spawnWildlife({
    family: 'shadow_walker',
    biome: 'betterend:shadow_forest',
    difficulty: 'peaceful',
  });
  assert.equal(peacefulWalker.spawned, false);
  assert.equal(peacefulWalker.reason, 'peaceful_difficulty_restriction');

  // Dragonfly spawns in peaceful and drops `betterend:chitin`
  const dragonfly = ecology.spawnWildlife({
    family: 'dragonfly',
    biome: 'betterend:foggy_mushroomland',
    difficulty: 'peaceful',
  });
  assert.equal(dragonfly.spawned, true);
  const dfTick = ecology.tickWildlifeEntity(dragonfly.entity.entityId, { waterSurfaceY: 64 });
  assert.ok(dfTick.events.includes('aquatic_reed_hover'));
  const dfLoot = ecology.killWildlifeEntity(dragonfly.entity.entityId);
  assert.equal(dfLoot.drops[0].itemId, 'betterend:chitin');

  // End Slime (`size=4`, `amber` variant in `amber_land`) splits on death into child slimes of size 2
  const bigSlime = ecology.spawnWildlife({
    family: 'end_slime',
    biome: 'betterend:amber_land',
    size: 4,
  });
  assert.equal(bigSlime.spawned, true);
  assert.equal(bigSlime.entity.variant, 'amber');
  const slimeDeath = ecology.killWildlifeEntity(bigSlime.entity.entityId, { splitCount: 3 });
  assert.equal(slimeDeath.spawnedChildren.length, 3);
  assert.equal(slimeDeath.spawnedChildren[0].size, 2);
  assert.equal(slimeDeath.spawnedChildren[0].variant, 'amber');

  // End Fish (8 variants, bucketable into `betterend:bucket_end_fish`, flops out of water)
  const fish = ecology.spawnWildlife({
    family: 'end_fish',
    biome: 'betterend:sulphur_springs',
    inWater: true,
  });
  assert.equal(fish.spawned, true);
  assert.ok(fish.entity.variant >= 5 && fish.entity.variant <= 7);
  const flopTick = ecology.tickWildlifeEntity(fish.entity.entityId, { inWater: false });
  assert.ok(flopTick.events.includes('flop_out_of_water'));
  const bucketedFish = ecology.bucketAquaticEntity(fish.entity.entityId, 'minecraft:water_bucket');
  assert.equal(bucketedFish.success, true);
  assert.equal(bucketedFish.bucketItem.itemId, 'betterend:bucket_end_fish');

  // Shadow Walker applies blindness on hit & emits smoke particles
  const walker = ecology.spawnWildlife({
    family: 'shadow_walker',
    biome: 'betterend:shadow_forest',
  });
  const walkerTick = ecology.tickWildlifeEntity(walker.entity.entityId, {
    targetEntity: { id: 'player_1' },
  });
  assert.ok(walkerTick.events.includes('melee_blindness_hit'));
  assert.equal(walkerTick.statusEffectsApplied[0].effect, 'blindness');
  assert.ok(walkerTick.particles.length > 0);

  // Cubozoa contact poison + bucketable + gelatine drop
  const cubo = ecology.spawnWildlife({
    family: 'cubozoa',
    biome: 'betterend:sulphur_springs',
    inWater: true,
  });
  assert.equal(cubo.entity.variant, 1);
  const cuboTick = ecology.tickWildlifeEntity(cubo.entity.entityId, {
    touchingPlayer: { id: 'player_1', isCreative: false },
  });
  assert.equal(cuboTick.statusEffectsApplied[0].effect, 'poison');
  const cuboDeath = ecology.killWildlifeEntity(cubo.entity.entityId);
  assert.equal(cuboDeath.drops[0].itemId, 'betterend:gelatine');

  // 2. Silk Moth Nest & Hive (`fullness = 0..3`), shears harvest, bottle harvest, and Silk Touch residency
  const hiveAnchor = { x: 50, y: 70, z: 50 };
  ecology.placeSilkMothHousing({
    anchor: hiveAnchor,
    blockType: 'betterend:silk_moth_hive',
    fullness: 0,
    residentMoths: 1,
  });

  const mothReturn = ecology.returnMothToNestOrHive({
    anchor: hiveAnchor,
    fullnessGain: 2,
  });
  assert.equal(mothReturn.fullness, 2);

  const shearHarvest = ecology.harvestSilkMothHousing({
    anchor: hiveAnchor,
    tool: 'minecraft:shears',
  });
  assert.equal(shearHarvest.success, true);
  assert.equal(shearHarvest.fullness, 0);
  assert.ok(shearHarvest.drops.some(d => d.itemId === 'betterend:silk_fiber'));
  assert.ok(shearHarvest.drops.some(d => d.itemId === 'betterend:silk_moth_matrix'));

  ecology.returnMothToNestOrHive({ anchor: hiveAnchor, fullnessGain: 1 });
  const bottleHarvest = ecology.harvestSilkMothHousing({
    anchor: hiveAnchor,
    tool: 'minecraft:glass_bottle',
  });
  assert.equal(bottleHarvest.success, true);
  assert.equal(bottleHarvest.fullness, 0);
  assert.equal(bottleHarvest.drops[0].itemId, 'betterend:enchanted_bottle');

  ecology.returnMothToNestOrHive({ anchor: hiveAnchor, fullnessGain: 2 });
  const silkTouchDrop = ecology.breakSilkMothHousing({ anchor: hiveAnchor, silkTouch: true });
  assert.equal(silkTouchDrop.silkTouch, true);
  assert.equal(silkTouchDrop.droppedItem.dynamicProperties['betterend:fullness'], 2);
  assert.ok(silkTouchDrop.droppedItem.dynamicProperties['betterend:resident_moths'] >= 2);

  // 3. Menger Sponge 6-direction BFS water absorption (up to 64 blocks / depth 6) & Nether drying
  const waterCloud = [];
  for (let i = 1; i <= 80; i += 1) {
    waterCloud.push({ x: i <= 5 ? i : 5, y: 64 + (i % 3), z: Math.min(4, Math.floor(i / 20)) });
  }
  // Generate a connected cluster of 70 water positions within depth 6
  const connectedWater = [];
  for (let dx = -3; dx <= 3; dx += 1) {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= 6) {
          connectedWater.push({ x: dx, y: 64 + dy, z: dz });
        }
      }
    }
  }
  const spongeAbsorb = ecology.absorbWaterWithMengerSponge({
    origin: { x: 0, y: 64, z: 0 },
    dimension: 'minecraft:the_end',
    waterPositions: connectedWater,
  });
  assert.equal(spongeAbsorb.spongeBlock, 'betterend:menger_sponge_wet');
  assert.equal(spongeAbsorb.absorbedCount, 64);

  const netherSponge = ecology.absorbWaterWithMengerSponge({
    origin: { x: 0, y: 64, z: 0 },
    dimension: 'minecraft:the_nether',
    waterPositions: connectedWater,
  });
  assert.equal(netherSponge.driedInstantlyInNether, true);
  assert.equal(netherSponge.spongeBlock, 'betterend:menger_sponge');

  // 4. Brimstone + Sulphur crystal growth (`age = 0..3`)
  let crystalState = ecology.tickBrimstoneAndSulphurCrystal({ adjacentToWater: true }).crystal;
  assert.equal(crystalState.age, 0);
  for (let step = 0; step < 3; step += 1) {
    const res = ecology.tickBrimstoneAndSulphurCrystal({
      adjacentToWater: true,
      currentCrystal: crystalState,
    });
    crystalState = res.crystal;
    if (step === 2) {
      assert.equal(crystalState.age, 3);
      assert.equal(res.harvestDrops[0].itemId, 'betterend:crystalline_sulphur');
    }
  }

  // 5. Interactive blocks, FlowerPotBlock, PedestalBlock, 33 chairs/stools/taburets, 20 boats/rafts
  const clusterJuice = ecology.interactWithBlockOrHazard({
    blockType: 'betterend:umbrella_tree_cluster',
    heldItem: 'minecraft:glass_bottle',
    blockState: { natural: true },
  });
  assert.equal(clusterJuice.harvested, true);
  assert.equal(clusterJuice.yieldedItem.itemId, 'betterend:umbrella_cluster_juice');
  assert.equal(clusterJuice.newBlockType, 'betterend:umbrella_tree_cluster_empty');

  const potAnchor = { x: 12, y: 64, z: 12 };
  ecology.interactWithFlowerPot({ anchor: potAnchor, heldItem: 'betterend:amber_moss' });
  const plantedPot = ecology.interactWithFlowerPot({
    anchor: potAnchor,
    heldItem: 'betterend:small_jellyshroom',
  });
  assert.equal(plantedPot.pot.lightEmission, 15);

  assert.equal(CHAIR_BLOCKS.length, 33);
  assert.equal(BOAT_AND_RAFT_ITEMS.length, 20);

  const seatAnchor = { x: 15, y: 64, z: 15 };
  const sit1 = ecology.sitOnChair({
    anchor: seatAnchor,
    blockType: 'betterend:tenanea_bar_stool',
    riderId: 'player_1',
  });
  assert.equal(sit1.seated, true);
  assert.equal(sit1.heightOffset, 0.625);

  const sit2 = ecology.sitOnChair({
    anchor: seatAnchor,
    blockType: 'betterend:tenanea_bar_stool',
    riderId: 'player_2',
  });
  assert.equal(sit2.seated, false);
  assert.equal(sit2.reason, 'seat_occupied');

  const dismounted = ecology.dismountOrBreakChair({ anchor: seatAnchor, reason: 'block_break' });
  assert.equal(dismounted.despawned, true);
});

test('TRV-001: Respawn Obelisk 3-block vertical integrity, 6-amber activation, permanent End death respawn, and Eternal Portal transactions', () => {
  const transport = new TransportService();
  const bottomAnchor = { x: 500, y: 65, z: 500 };

  const obelisk = transport.placeRespawnObelisk({
    dimension: 'minecraft:the_end',
    bottomAnchor,
  });
  assert.equal(obelisk.parts.length, 3);
  assert.equal(RESPAWN_OBELISK_AMBER_COST, 6);
  assert.equal(OBELISK_HORIZONTAL_LANDING_OFFSETS.length, 8);

  // Reject activation with < 6 amber gems
  const failedAct = transport.activateRespawnObelisk({
    playerId: 'player_1',
    pos: { x: 500, y: 66, z: 500 }, // middle segment
    heldItem: { itemId: 'betterend:amber_gem', count: 5 },
  });
  assert.equal(failedAct.activated, false);
  assert.equal(failedAct.exploded, false);

  // Activate with 8 amber gems (consumes 6, leaves 2)
  const successAct = transport.activateRespawnObelisk({
    playerId: 'player_1',
    pos: { x: 500, y: 67, z: 500 }, // top segment
    heldItem: { itemId: 'betterend:amber_gem', count: 8 },
  });
  assert.equal(successAct.activated, true);
  assert.equal(successAct.remainingHeldItem.count, 2);
  assert.equal(successAct.chargesDeplete, false);
  assert.equal(successAct.exploded, false);

  // Death respawn redirects player safely to the first unobstructed 2-block-high horizontal offset
  const respawn1 = transport.handlePlayerRespawn({
    playerId: 'player_1',
    initialSpawn: false,
    currentDimension: 'minecraft:overworld',
    isPositionSafe: candidate => candidate.x === 500 && candidate.z === 501,
  });
  assert.equal(respawn1.redirected, true);
  assert.equal(respawn1.targetDimension, 'minecraft:the_end');
  assert.deepEqual(respawn1.landingPosition.blockPos, { x: 500, y: 65, z: 501 });
  assert.equal(respawn1.chargesDepleted, false);

  // Breaking the middle part breaks all 3 vertical blocks and drops 1 respawn_obelisk item
  const broken = transport.breakRespawnObeliskPart({
    dimension: 'minecraft:the_end',
    pos: { x: 500, y: 66, z: 500 },
  });
  assert.equal(broken.broken, true);
  assert.equal(broken.destroyedParts.length, 3);
  assert.equal(broken.drops.length, 1);
  assert.equal(broken.drops[0].itemId, 'betterend:respawn_obelisk');

  // Subsequent death respawn after obelisk destruction gracefully notifies player
  const respawnAfterBreak = transport.handlePlayerRespawn({
    playerId: 'player_1',
    initialSpawn: false,
  });
  assert.equal(respawnAfterBreak.redirected, false);
  assert.equal(respawnAfterBreak.obeliskDestroyed, true);

  // Eternal Portal travel transaction & cooldown loop prevention
  const travel1 = transport.executePortalTravel({
    actorId: 'player_1',
    source: { dimension: 'minecraft:the_end', position: { x: 1200, y: 68, z: 1200 } },
    destination: {
      dimension: 'minecraft:overworld',
      position: { x: 150, y: 72, z: 150 },
      regionReady: true,
      hasSolidSupport: true,
      hasHeadroom: true,
      voidSafe: true,
    },
    currentTick: 100,
  });
  assert.equal(travel1.teleported, true);
  assert.equal(travel1.transaction.completed, true);

  // Immediate re-trigger is blocked by portal cooldown hysteresis
  const loopAttempt = transport.executePortalTravel({
    actorId: 'player_1',
    currentTick: 110,
  });
  assert.equal(loopAttempt.teleported, false);
  assert.equal(loopAttempt.reason, 'portal_cooldown_active');
});

test('VIS-002, VIS-003, PROG-001: Two-player presentation isolation, border hysteresis, owned fog reconciliation, VV graphics reset hooks, and 36 advancements', () => {
  const resetLog = [];
  const mockGraphics = {
    getPlayerAtmospherics: (_biome, player) => ({
      setSkyHorizonColor: () => {},
      resetSkyHorizonColor: () => resetLog.push(`atm:${player.id}`),
      resetRayleighStrength: () => {},
    }),
    getPlayerColorGrading: (_biome, player) => ({
      setContrast: () => {},
      resetContrast: () => resetLog.push(`cg:${player.id}`),
      resetToneMapping: () => {},
    }),
    getPlayerLighting: (_biome, player) => ({
      setAmbientColor: () => {},
      resetAmbientColor: () => resetLog.push(`light:${player.id}`),
      resetFlashIlluminance: () => {},
    }),
    getPlayerWater: (_biome, player) => ({
      setWaterColor: () => {},
      resetCDOM: () => resetLog.push(`water:${player.id}`),
      resetWaterColor: () => {},
    }),
  };

  const presentation = new PresentationService({
    minResidencyTicks: 40,
    graphicsModule: mockGraphics,
  });

  assert.equal(Object.keys(REGION_PRESENTATION_PRESETS).length, 27);
  assert.equal(REGION_PARTICLE_FAMILIES.length, 9);
  assert.equal(BETTEREND_ADVANCEMENTS.length, 36);

  // Preserve foreign add-on fog IDs while removing stale BetterEnd fog IDs on join
  const fogReconcile = presentation.reconcilePlayerFogStack('player_A', {
    targetRegion: 'amber_land',
    existingFogStack: [
      { fogId: 'abyssal_ascent:deep_void_fog', userProvidedId: 'abyssal_ascent:fog_1' },
      { fogId: 'betterend:fog_shadow_forest', userProvidedId: 'betterend:region_fog_shadow_forest' },
    ],
  });
  assert.equal(fogReconcile.removedOwnedFogs.length, 1);
  assert.equal(fogReconcile.preservedForeignFogs.length, 1);
  assert.equal(fogReconcile.fogStack.length, 2);
  assert.equal(fogReconcile.fogStack[0].userProvidedId, 'abyssal_ascent:fog_1');
  assert.equal(fogReconcile.fogStack[1].userProvidedId, 'betterend:region_fog_amber_land');

  // Two-player independent presentation in the End
  const pAInitial = presentation.updatePlayerPresentation({
    playerId: 'player_A',
    regionId: 'amber_land',
    immediate: true,
    currentTick: 1,
  });
  const pBInitial = presentation.updatePlayerPresentation({
    playerId: 'player_B',
    regionId: 'sulphur_springs',
    immediate: true,
    currentTick: 1,
  });

  assert.equal(pAInitial.activeRegion, 'amber_land');
  assert.equal(pBInitial.activeRegion, 'sulphur_springs');
  assert.deepEqual(pAInitial.particles, ['amber_sphere']);
  assert.deepEqual(pBInitial.particles, ['sulphur', 'geyser']);

  // Border hysteresis: stepping into `blossoming_spires` for 20 ticks (< 40) keeps `amber_land` active
  const pABorderStep = presentation.updatePlayerPresentation({
    playerId: 'player_A',
    regionId: 'blossoming_spires',
    ticks: 20,
    currentTick: 21,
  });
  assert.equal(pABorderStep.transitioned, false);
  assert.equal(pABorderStep.hysteresisPending, true);
  assert.equal(pABorderStep.activeRegion, 'amber_land');
  assert.equal(pAInitial.musicInstance.isPlaying, true);

  // Completing the remaining 20 residency ticks transitions `player_A` to `blossoming_spires` and stops old music
  const pATransitioned = presentation.updatePlayerPresentation({
    playerId: 'player_A',
    regionId: 'blossoming_spires',
    ticks: 20,
    currentTick: 41,
  });
  assert.equal(pATransitioned.transitioned, true);
  assert.equal(pATransitioned.activeRegion, 'blossoming_spires');
  assert.equal(pAInitial.musicInstance.isPlaying, false);
  assert.equal(pATransitioned.musicInstance.isPlaying, true);

  // Confirm `player_B` was completely unaffected by `player_A`'s transition
  const stateB = presentation.getPlayerPresentationState('player_B');
  assert.equal(stateB.activeRegion, 'sulphur_springs');
  assert.equal(stateB.fogStack[0].userProvidedId, 'betterend:region_fog_sulphur_springs');

  // Leaving the End triggers property-specific `reset*()` calls on the graphics adapter
  presentation.updatePlayerPresentation({
    playerId: 'player_A',
    dimension: 'minecraft:overworld',
    regionId: null,
    currentTick: 60,
  });
  assert.ok(resetLog.includes('atm:player_A'));
  assert.ok(resetLog.includes('cg:player_A'));
  assert.ok(resetLog.includes('light:player_A'));
  assert.ok(resetLog.includes('water:player_A'));

  // Progression tracking (`PROG-001`)
  const progA = presentation.getPlayerProgression('player_A');
  assert.ok(progA.unlockedAdvancements.includes('betterend:enter_end'));
  assert.ok(progA.unlockedAdvancements.includes('betterend:amber_land'));
  assert.ok(progA.unlockedAdvancements.includes('betterend:blossoming_spires'));
});

test('INT-001: CompatibilityService read-only query protocol, rate/size bounds, and strict mutation rejection', () => {
  const compat = new CompatibilityService({
    maxRequestBytes: 512,
    maxRequestsPerWindow: 3,
  });

  assert.equal(COMPATIBILITY_SCHEMA_VERSION, 1);
  assert.equal(QUERY_CHANNEL_ID, 'betterend:query');
  assert.equal(RESPONSE_CHANNEL_ID, 'betterend:response');

  compat.publishInternalRegionReadiness('minecraft:the_end:10:10', 'committed');

  // 1. Valid region lookup
  const regResp = compat.handleQueryMessage(
    {
      schemaVersion: 1,
      requestId: 'req_1',
      type: 'region',
      dimension: 'minecraft:the_end',
      position: { x: 2048, y: 68, z: 2048 },
    },
    { sender: 'abyssal_ascent', currentTick: 1 },
  );
  assert.equal(regResp.status, 'ok');
  assert.equal(regResp.readOnly, true);
  assert.equal(regResp.data.isBetterEndRegion, true);
  assert.ok(Object.isFrozen(regResp));
  assert.ok(Object.isFrozen(regResp.data));

  // 2. Valid material families & readiness lookup
  const matResp = compat.handleQueryMessage(
    {
      schemaVersion: 1,
      requestId: 'req_2',
      type: 'material_families',
      family: 'aeternium',
    },
    { sender: 'abyssal_ascent', currentTick: 1 },
  );
  assert.equal(matResp.status, 'ok');
  assert.equal(matResp.data.definition.ingot, 'betterend:aeternium_ingot');

  // 3. Reject mutation attempts (`mint_item`, `commit_ritual`, `set_readiness`)
  const mintAttempt = compat.handleQueryMessage(
    {
      schemaVersion: 1,
      requestId: 'req_3',
      type: 'mint_item',
      itemId: 'betterend:aeternium_ingot',
      count: 64,
    },
    { sender: 'malicious_pack', currentTick: 2 },
  );
  assert.equal(mintAttempt.status, 'error');
  assert.equal(mintAttempt.errorCode, 'READ_ONLY_VIOLATION');

  const ritualAttempt = compat.handleQueryMessage(
    {
      schemaVersion: 1,
      requestId: 'req_4',
      type: 'commit_ritual',
    },
    { sender: 'malicious_pack', currentTick: 2 },
  );
  assert.equal(ritualAttempt.status, 'error');
  assert.equal(ritualAttempt.errorCode, 'READ_ONLY_VIOLATION');

  // 4. Rate limit enforcement within same tick window
  compat.handleQueryMessage({ schemaVersion: 1, type: 'ping' }, { sender: 'spam_pack', currentTick: 5 });
  compat.handleQueryMessage({ schemaVersion: 1, type: 'ping' }, { sender: 'spam_pack', currentTick: 5 });
  compat.handleQueryMessage({ schemaVersion: 1, type: 'ping' }, { sender: 'spam_pack', currentTick: 5 });
  const rateLimited = compat.handleQueryMessage(
    { schemaVersion: 1, type: 'ping' },
    { sender: 'spam_pack', currentTick: 5 },
  );
  assert.equal(rateLimited.status, 'error');
  assert.equal(rateLimited.errorCode, 'RATE_LIMIT_EXCEEDED');

  // 5. Payload size limit enforcement
  const oversized = compat.handleQueryMessage(
    JSON.stringify({ schemaVersion: 1, type: 'ping', padding: 'X'.repeat(600) }),
    { sender: 'other_pack', currentTick: 6 },
  );
  assert.equal(oversized.status, 'error');
  assert.equal(oversized.errorCode, 'PAYLOAD_TOO_LARGE');
});

test('UI-001: Station-Backed Custom UIs, Real Player Inventory Consumption, and Multi-Chapter Guidebook', async () => {
  // Mock ItemStack and Inventory Container
  class MockItemStack {
    constructor(typeId, amount = 1) {
      this.typeId = typeId;
      this.amount = amount;
      this.nameTag = '';
      this._lore = [];
      this._durability = { damage: 0, maxDurability: 500 };
    }
    setLore(lines) {
      this._lore = [...lines];
    }
    getLore() {
      return [...this._lore];
    }
    getComponent(id) {
      if (id === 'minecraft:durability') return this._durability;
      return null;
    }
  }

  const createMockPlayer = (initialSlots = []) => {
    const slots = Array.from({ length: 36 }, (_, idx) => initialSlots[idx] ?? null);
    let xpEarned = 0;
    let actionBarText = '';
    let spawnPoint = null;
    const container = {
      size: 36,
      getItem: i => slots[i] ?? null,
      setItem: (i, stack) => {
        slots[i] = stack ?? null;
      },
      addItem: stack => {
        for (let i = 0; i < slots.length; i++) {
          if (slots[i] && slots[i].typeId === stack.typeId && !stack.nameTag && (!stack._lore || stack._lore.length === 0)) {
            slots[i].amount += stack.amount;
            return;
          }
        }
        for (let i = 0; i < slots.length; i++) {
          if (!slots[i]) {
            slots[i] = stack;
            return;
          }
        }
      },
    };
    return {
      id: 'player_ui_test',
      name: 'Tester',
      location: { x: 2048, y: 68, z: 2048 },
      dimension: {
        id: 'minecraft:the_end',
        getBlock: pos => ({
          typeId: 'betterend:end_stone_smelter',
          location: pos,
          permutation: {
            getState: () => false,
            withState: () => ({}),
          },
          setPermutation: () => {},
        }),
        spawnParticle: () => {},
        runCommand: () => {},
      },
      getGameMode: () => 'survival',
      getComponent: id => (id === 'minecraft:inventory' ? { container } : null),
      addExperience: xp => {
        xpEarned += xp;
      },
      setSpawnPoint: sp => {
        spawnPoint = sp;
      },
      playSound: () => {},
      onScreenDisplay: {
        setActionBar: msg => {
          actionBarText = msg;
        },
      },
      getXp: () => xpEarned,
      getActionBar: () => actionBarText,
      getSpawnPoint: () => spawnPoint,
      countItem: typeId =>
        slots.reduce((acc, s) => (s && s.typeId === typeId ? acc + s.amount : acc), 0),
      getSlot: i => slots[i],
    };
  };

  // Queue of simulated UI responses (ActionFormData selection or ModalFormData formValues)
  const uiResponseQueue = [];
  const capturedForms = [];
  const mockServerUi = {
    ActionFormData: class {
      constructor() {
        this._title = '';
        this._body = '';
        this._buttons = [];
      }
      title(t) {
        this._title = t;
        return this;
      }
      body(b) {
        this._body = b;
        return this;
      }
      button(label, iconPath) {
        this._buttons.push({ label, iconPath });
        return this;
      }
      show() {
        capturedForms.push({ kind: 'action', title: this._title, body: this._body, buttons: this._buttons });
        const next = uiResponseQueue.shift() ?? { canceled: true };
        return Promise.resolve(next);
      }
    },
    ModalFormData: class {
      constructor() {
        this._title = '';
        this._controls = [];
      }
      title(t) {
        this._title = t;
        return this;
      }
      dropdown(label, options) {
        this._controls.push({ type: 'dropdown', label, options });
        return this;
      }
      slider(label, min, max, step, def) {
        this._controls.push({ type: 'slider', label, min, max, step, def });
        return this;
      }
      textField(label, placeholder, def) {
        this._controls.push({ type: 'textField', label, placeholder, def });
        return this;
      }
      toggle(label, def) {
        this._controls.push({ type: 'toggle', label, def });
        return this;
      }
      show() {
        capturedForms.push({ kind: 'modal', title: this._title, controls: this._controls });
        const next = uiResponseQueue.shift() ?? { canceled: true };
        return Promise.resolve(next);
      }
    },
  };

  const mockServerModule = {
    ItemStack: MockItemStack,
    world: new InMemoryWorldPropertyAdapter(),
  };

  const runtime = new BetterEndRuntime({
    profile: 'stable',
    world: mockServerModule.world,
    serverModule: mockServerModule,
    uiModule: mockServerUi,
  });

  // 1. Icon path resolver checks
  assert.equal(resolveUiIconPath('betterend:aeternium_ingot'), 'textures/items/betterend/aeternium_ingot');
  assert.equal(resolveUiIconPath('betterend:end_stone_smelter'), 'textures/blocks/betterend/end_stone_smelter_top');
  assert.equal(resolveUiIconPath('minecraft:enchanted_book'), 'textures/items/book_enchanted');

  // 2. End Stone Smelter UI: real inventory consumption (thallasium_ingot + ender_dust + coal -> terminite_ingot)
  const smelterPlayer = createMockPlayer([
    new MockItemStack('betterend:thallasium_ingot', 2),
    new MockItemStack('betterend:ender_dust', 2),
    new MockItemStack('minecraft:coal', 2),
  ]);
  const smelterBlock = {
    typeId: 'betterend:end_stone_smelter',
    location: { x: 100, y: 64, z: 100 },
    dimension: smelterPlayer.dimension,
    permutation: { getState: () => false, withState: () => ({}) },
    setPermutation: () => {},
  };
  // Button 0 = Load Slots (Withdraw All only appears when slots are non-empty), Button 1+ = Recipes.
  const terminiteThallasiumIdx = DEFAULT_ALLOYING_RECIPES.findIndex(
    r => r.id === 'betterend:terminite_ingot_thallasium',
  );
  uiResponseQueue.push({ canceled: false, selection: 1 + terminiteThallasiumIdx });
  openSmelterStationUi(runtime, smelterPlayer, smelterBlock);
  await new Promise(r => setTimeout(r, 10));

  assert.equal(smelterPlayer.countItem('betterend:thallasium_ingot'), 1, 'Smelter UI consumed 1 thallasium_ingot');
  assert.equal(smelterPlayer.countItem('betterend:ender_dust'), 1, 'Smelter UI consumed 1 ender_dust');
  assert.equal(smelterPlayer.countItem('minecraft:coal'), 1, 'Smelter UI consumed 1 coal fuel');
  assert.equal(smelterPlayer.countItem('betterend:terminite_ingot'), 1, 'Smelter UI produced 1 terminite_ingot');
  assert.ok(smelterPlayer.getXp() > 0, 'Smelter UI awarded alloying XP');

  // 3. Leveled Anvil UI: Smithing (consumes material + applies hammer durability wear) & Repair/Rename Modal
  const hammerStack = new MockItemStack('betterend:iron_hammer', 1);
  const damagedSword = new MockItemStack('betterend:terminite_sword', 1);
  damagedSword._durability.damage = 200;
  const anvilPlayer = createMockPlayer([
    hammerStack,
    new MockItemStack('betterend:thallasium_ingot', 3),
    damagedSword,
    new MockItemStack('betterend:terminite_ingot', 2),
  ]);
  const anvilBlock = {
    typeId: 'betterend:terminite_anvil',
    location: { x: 102, y: 64, z: 100 },
    dimension: anvilPlayer.dimension,
  };
  // Button 0 = Repair, Combine & Rename; Button 1+ = DEFAULT_SMITHING_RECIPES
  const thallasiumPlateIdx = DEFAULT_SMITHING_RECIPES.findIndex(
    r => r.id === 'betterend:thallasium_forged_plate',
  );
  uiResponseQueue.push({ canceled: false, selection: 1 + thallasiumPlateIdx });
  openAnvilStationUi(runtime, anvilPlayer, anvilBlock);
  await new Promise(r => setTimeout(r, 10));

  assert.equal(anvilPlayer.countItem('betterend:thallasium_ingot'), 2, 'Anvil smithing consumed 1 thallasium_ingot');
  assert.equal(anvilPlayer.countItem('betterend:thallasium_forged_plate'), 1, 'Anvil smithing produced 1 thallasium_forged_plate');
  assert.ok(hammerStack._durability.damage >= 1, 'Anvil smithing applied durability damage to player hammer');

  // Now test Button 0 -> Repair, Combine & Rename ModalFormData
  // In anvilPlayer inventory: slot 0 = iron_hammer, slot 1 = thallasium_ingot, slot 2 = terminite_sword (damaged), slot 3 = terminite_ingot, slot 4 = thallasium_forged_plate
  // Base item dropdown has all 5 non-empty slots (index 2 is terminite_sword).
  // Addition dropdown has 0="<None (Rename Only)>" + 5 slots (index 4 is terminite_ingot).
  uiResponseQueue.push(
    { canceled: false, selection: 0 },
    { canceled: false, formValues: [2, 4, 'Starlight Blade'] },
  );
  openAnvilStationUi(runtime, anvilPlayer, anvilBlock);
  await new Promise(r => setTimeout(r, 10));

  assert.equal(damagedSword.nameTag, 'Starlight Blade', 'Anvil modal renamed the sword');
  assert.equal(damagedSword._durability.damage, 0, 'Anvil modal repaired the sword');

  // 4. Physical Pedestal Interaction & 49-Recipe Infusion Ritual UI
  const pedPlayer = createMockPlayer([
    new MockItemStack('betterend:amber_gem', 3),
    new MockItemStack('betterend:terminite_chestplate', 1),
    new MockItemStack('betterend:crystal_shards', 4),
  ]);
  const pedBlock = {
    typeId: 'betterend:andesite_pedestal',
    location: { x: 110, y: 64, z: 100 },
    dimension: pedPlayer.dimension,
    permutation: { getState: () => false, withState: () => ({}) },
    setPermutation: () => {},
  };
  // Insert 1 amber_gem onto peripheral pedestal
  handlePedestalInteraction(runtime, pedPlayer, pedBlock, 'betterend:amber_gem');
  assert.equal(pedPlayer.countItem('betterend:amber_gem'), 2, 'Pedestal insertion consumed 1 amber_gem');
  // Extract it back
  handlePedestalInteraction(runtime, pedPlayer, pedBlock, '');
  assert.equal(pedPlayer.countItem('betterend:amber_gem'), 3, 'Pedestal extraction returned 1 amber_gem');

  // Infusion Pedestal UI: when ring has no items and no center item,
  // Button 0 = Highlight Missing Pedestal Sockets, Button 1 = Enchanted Book Infusions (38), Button 2+ = gearRecipes
  const infBlock = {
    typeId: 'betterend:infusion_pedestal',
    location: { x: 110, y: 64, z: 110 },
    dimension: pedPlayer.dimension,
    permutation: { getState: () => false, withState: () => ({}) },
    setPermutation: () => {},
  };
  const gearInfusions = DEFAULT_INFUSION_RECIPES.filter(r => r.result.item !== 'minecraft:enchanted_book');
  const crystaliteChestIdx = gearInfusions.findIndex(r => r.id === 'betterend:crystalite_chestplate');
  uiResponseQueue.push(
    { canceled: false, selection: 2 + crystaliteChestIdx }, // Crystalite Chestplate recipe detail
    { canceled: false, selection: 0 }, // Load Catalysts from Inventory & Start Ritual
  );
  openInfusionPedestalStationUi(runtime, pedPlayer, infBlock);
  await new Promise(r => setTimeout(r, 20));

  assert.equal(pedPlayer.countItem('betterend:terminite_chestplate'), 0, 'Infusion consumed terminite_chestplate');
  assert.equal(pedPlayer.countItem('betterend:amber_gem'), 2, 'Infusion consumed 1 amber_gem catalyst');
  assert.equal(pedPlayer.countItem('betterend:crystal_shards'), 0, 'Infusion consumed 4 crystal_shards catalysts');
  assert.equal(pedPlayer.countItem('betterend:crystalite_chestplate'), 1, 'Infusion produced betterend:crystalite_chestplate');

  // 5. Respawn Obelisk: requires 6x Amber Gem in Survival; opens Status UI if insufficient
  const obeliskBlock = {
    typeId: 'betterend:respawn_obelisk',
    location: { x: 120, y: 64, z: 120 },
    dimension: pedPlayer.dimension,
    permutation: { getState: () => 0, withState: () => ({}) },
    setPermutation: () => {},
  };
  // Player currently has only 2 amber_gem -> shows actionbar hint without opening a stub ActionFormData
  handleRespawnObeliskInteraction(runtime, pedPlayer, obeliskBlock, 'betterend:amber_gem');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(pedPlayer.getSpawnPoint(), null, 'Respawn Obelisk must not bind spawn with < 6 amber_gem');
  assert.ok(pedPlayer.getActionBar().includes('Amber Gem'), 'Respawn Obelisk shows Amber Gem requirement in actionbar');

  // Give player 6 amber_gem and interact again -> consumes 6 amber_gem and sets spawn point
  const richObeliskPlayer = createMockPlayer([new MockItemStack('betterend:amber_gem', 6)]);
  handleRespawnObeliskInteraction(runtime, richObeliskPlayer, obeliskBlock, 'betterend:amber_gem');
  assert.equal(richObeliskPlayer.countItem('betterend:amber_gem'), 0, 'Respawn Obelisk consumed 6 amber_gem');
  assert.ok(richObeliskPlayer.getSpawnPoint(), 'Respawn Obelisk bound player spawn point');

  // 6. Storage Container UI (Barrel deposit & withdraw) & Sign Editor UI
  const storagePlayer = createMockPlayer([new MockItemStack('betterend:amber_gem', 5)]);
  const barrelBlock = {
    typeId: 'betterend:mossy_glowshroom_barrel',
    location: { x: 130, y: 64, z: 130 },
    dimension: storagePlayer.dimension,
    permutation: { getState: () => false, withState: () => ({}) },
    setPermutation: () => {},
  };
  // Button 0 = Deposit Item from Inventory -> Modal [0 (slot 0), 3 (count)]
  uiResponseQueue.push(
    { canceled: false, selection: 0 },
    { canceled: false, formValues: [0, 3] },
  );
  openStorageContainerUi(runtime, storagePlayer, barrelBlock);
  await new Promise(r => setTimeout(r, 15));
  assert.equal(storagePlayer.countItem('betterend:amber_gem'), 2, 'Barrel deposit consumed 3 amber_gem from player');

  // Withdraw the stored stack back (Button 1 = stored amber_gem x3)
  uiResponseQueue.push({ canceled: false, selection: 1 });
  openStorageContainerUi(runtime, storagePlayer, barrelBlock);
  await new Promise(r => setTimeout(r, 15));
  assert.equal(storagePlayer.countItem('betterend:amber_gem'), 5, 'Barrel withdraw returned 3 amber_gem to player');

  // Sign Editor UI
  const signBlock = {
    typeId: 'betterend:lacugrove_sign',
    location: { x: 135, y: 64, z: 135 },
    dimension: storagePlayer.dimension,
  };
  uiResponseQueue.push({
    canceled: false,
    formValues: ['Welcome to', 'BetterEnd', 'Lacugrove', 'Sanctuary', true],
  });
  openSignEditorUi(runtime, storagePlayer, signBlock);
  await new Promise(r => setTimeout(r, 10));
  const signRec = runtime.store.getStation({
    dimension: 'minecraft:the_end',
    anchor: { x: 135, y: 64, z: 135 },
  });
  assert.deepEqual(signRec?.state?.lines, ['Welcome to', 'BetterEnd', 'Lacugrove', 'Sanctuary']);
  assert.equal(signRec?.state?.glowing, true);

  // 7. Multi-Chapter Guidebook UI: 27 biome teleports (0..26) + 5 Encyclopedia chapters (27..31)
  capturedForms.length = 0;
  uiResponseQueue.push({ canceled: true });
  openGuidebookUi(runtime, storagePlayer);
  await new Promise(r => setTimeout(r, 10));
  const guidebookForm = capturedForms.find(f => f.title.includes('Guidebook'));
  assert.ok(guidebookForm, 'Guidebook ActionFormData opened');
  assert.equal(
    guidebookForm.buttons.length,
    32,
    'Guidebook has 27 outer-End biome buttons (indices 0..26) + 5 Encyclopedia chapters (indices 27..31)',
  );

  // 8. Physical Chiseled Bookshelf Interaction (direct slot 0..5 book insertion/extraction without stub UI)
  const shelfPlayer = createMockPlayer([new MockItemStack('minecraft:enchanted_book', 2)]);
  let shelfStates = {};
  const shelfBlock = {
    typeId: 'betterend:dragon_tree_chiseled_bookshelf',
    location: { x: 140, y: 64, z: 140 },
    dimension: shelfPlayer.dimension,
    permutation: {
      getState: k => shelfStates[k] ?? false,
      withState: (k, v) => {
        shelfStates[k] = v;
        return shelfBlock.permutation;
      },
    },
    setPermutation: () => {},
  };
  const insRes = handleChiseledBookshelfInteraction(
    runtime,
    shelfPlayer,
    shelfBlock,
    new MockItemStack('minecraft:enchanted_book', 1),
  );
  assert.equal(insRes.action, 'inserted');
  assert.equal(insRes.slot, 0);
  assert.equal(shelfStates['betterend:slot_0_occupied'], true);
  assert.equal(shelfPlayer.countItem('minecraft:enchanted_book'), 1);

  const extRes = handleChiseledBookshelfInteraction(runtime, shelfPlayer, shelfBlock, '');
  assert.equal(extRes.action, 'extracted');
  assert.equal(extRes.slot, 0);
  assert.equal(shelfStates['betterend:slot_0_occupied'], false);
  assert.equal(shelfPlayer.countItem('minecraft:enchanted_book'), 2);

  // 9. BetterEnd Music Discs in Jukebox (playback, Now Playing actionbar, and stop on eject/break)
  let playedSoundId = null;
  const jukeboxDim = {
    ...shelfPlayer.dimension,
    playSound: id => {
      playedSoundId = id;
    },
  };
  const jukeboxBlock = {
    typeId: 'minecraft:jukebox',
    location: { x: 145, y: 64, z: 145 },
    dimension: jukeboxDim,
  };
  const playRes = handleJukeboxRecordInteraction(
    runtime,
    shelfPlayer,
    jukeboxBlock,
    'betterend:music_disc_endseeker',
  );
  assert.equal(playRes.action, 'playing');
  assert.equal(playedSoundId, 'betterend.record.endseeker');
  assert.ok(shelfPlayer.getActionBar().includes('Firel - Endseeker'));

  const ejectRes = handleJukeboxRecordInteraction(runtime, shelfPlayer, jukeboxBlock, '');
  assert.equal(ejectRes.action, 'stopped');
  assert.equal(stopJukeboxRecordAt(runtime, jukeboxDim, jukeboxBlock.location).stopped, false);

  // 10. Stage 8: Live 5-Slot Anvil Container Carrier (Forge, Reshape, and Repair without Stub List UI)
  const anvilCarrierSlots = new Array(5).fill(null);
  let lastCmd = '';
  let lastAnvilSound = '';
  const anvilCarrierEntity = {
    id: 'anvil_carrier_1',
    typeId: 'betterend:end_stone_smelter_carrier',
    location: { x: 150.5, y: 64.02, z: 150.5 },
    nameTag: '',
    addTag: () => {},
    teleport: () => {},
    remove: () => {},
    setDynamicProperty: () => {},
    getDynamicProperty: key => {
      if (key === 'betterend:anchor_x') return 150;
      if (key === 'betterend:anchor_y') return 64;
      if (key === 'betterend:anchor_z') return 150;
      return undefined;
    },
    getComponent: id =>
      id === 'minecraft:inventory'
        ? {
            container: {
              size: 5,
              getItem: i => anvilCarrierSlots[i],
              setItem: (i, stack) => {
                anvilCarrierSlots[i] = stack ?? null;
              },
            },
          }
        : null,
  };
  let carrierSpawned = false;
  const anvilDim = {
    id: 'minecraft:the_end',
    getEntities: opts => {
      if (opts?.type === 'betterend:end_stone_smelter_carrier') {
        return carrierSpawned ? [anvilCarrierEntity] : [];
      }
      return [];
    },
    spawnEntity: () => {
      carrierSpawned = true;
      return anvilCarrierEntity;
    },
    getBlock: loc => ({
      typeId: loc.x === 150 && loc.y === 64 && loc.z === 150 ? 'betterend:terminite_anvil' : 'minecraft:end_stone',
      location: loc,
      dimension: anvilDim,
      permutation: { getState: () => 0, withState: () => ({}) },
      setPermutation: () => {},
      setType: () => {},
    }),
    playSound: id => {
      lastAnvilSound = id;
    },
    spawnParticle: () => {},
    spawnItem: () => ({ remove: () => {} }),
    runCommand: cmd => {
      lastCmd = cmd;
    },
  };
  anvilCarrierEntity.dimension = anvilDim;
  const anvilCarrierPlayer = {
    ...shelfPlayer,
    dimension: anvilDim,
    location: { x: 150.5, y: 64, z: 150.5 },
    playSound: id => {
      lastAnvilSound = id;
    },
  };
  runtime.serverModule.world.getAllPlayers = () => [anvilCarrierPlayer];

  const anvilCarrierBlock = anvilDim.getBlock({ x: 150, y: 64, z: 150 });
  const ensuredCarrier = ensureContainerCarrierEntity(runtime, anvilDim, anvilCarrierBlock);
  assert.equal(ensuredCarrier, anvilCarrierEntity);
  assert.ok(anvilCarrierEntity.nameTag.includes('Terminite Anvil (Tier 2)'));

  // Place 1x thallasium_ingot in Slot 0 and terminite_hammer in Slot 1 -> stepLiveSmelters forges thallasium_forged_plate in Slot 4
  anvilCarrierSlots[0] = new MockItemStack('betterend:thallasium_ingot', 1);
  anvilCarrierSlots[1] = new MockItemStack('betterend:terminite_hammer', 1, 0, 500);
  stepLiveSmelters(runtime, 10);
  assert.equal(anvilCarrierSlots[0], null, 'Slot 0 thallasium_ingot consumed');
  assert.equal(anvilCarrierSlots[4]?.typeId, 'betterend:thallasium_forged_plate', 'Slot 4 received thallasium_forged_plate');
  assert.equal(lastAnvilSound, 'random.anvil_use');

  // Move forged plate to Slot 0 to reshape into thallasium_sword_blade
  anvilCarrierSlots[0] = anvilCarrierSlots[4];
  anvilCarrierSlots[4] = null;
  stepLiveSmelters(runtime, 10);
  assert.equal(anvilCarrierSlots[4]?.typeId, 'betterend:thallasium_sword_blade', 'Reshaped forged plate -> sword_blade in Slot 4');

  // 11. Stage 8: destroyContainerCarrierAndBlock always runs `setblock ... air destroy` (3D breaking particles in Creative & Survival)
  const creativeBarrelPlayer = {
    ...anvilCarrierPlayer,
    getGameMode: () => 'creative',
  };
  const destroyRes = destroyContainerCarrierAndBlock(runtime, anvilCarrierEntity, creativeBarrelPlayer, true);
  assert.equal(destroyRes.destroyed, true);
  assert.equal(lastCmd, 'setblock 150 64 150 air destroy', 'Creative container break uses setblock ... air destroy for 3D breaking particles');

  // 12. Stage 8: Gravity-affected BetterEnd Anvils & Endstone Dust (_checkAndDropFallingColumn)
  const fallGrid = new Map([
    ['160,64,160', { typeId: 'minecraft:end_stone', perm: { id: 'end_stone' } }],
    ['160,65,160', { typeId: 'minecraft:air', perm: { id: 'air' } }],
    ['160,66,160', { typeId: 'minecraft:air', perm: { id: 'air' } }],
    ['160,67,160', { typeId: 'betterend:terminite_anvil', perm: { id: 'terminite_anvil_perm' } }],
  ]);
  let landedSound = '';
  const fallDim = {
    id: 'minecraft:the_end',
    getEntities: () => [],
    spawnEntity: () => null,
    spawnItem: () => null,
    playSound: id => {
      landedSound = id;
    },
    getBlock: loc => {
      const key = `${loc.x},${loc.y},${loc.z}`;
      const entry = fallGrid.get(key) ?? { typeId: 'minecraft:air', perm: {} };
      return {
        typeId: entry.typeId,
        location: { ...loc },
        dimension: fallDim,
        permutation: entry.perm,
        setType: newId => {
          fallGrid.set(key, { typeId: newId, perm: { id: newId } });
        },
        setPermutation: newPerm => {
          const cur = fallGrid.get(key) ?? { typeId: 'minecraft:air' };
          fallGrid.set(key, { typeId: cur.typeId, perm: newPerm });
        },
      };
    },
  };
  const dropRes = runtime._checkAndDropFallingColumn(fallDim, { x: 160, y: 67, z: 160 });
  assert.equal(dropRes.droppedCount, 1, 'Unsupported terminite_anvil dropped');
  assert.equal(fallGrid.get('160,67,160')?.typeId, 'minecraft:air', 'Original y=67 cleared to air');
  assert.equal(fallGrid.get('160,65,160')?.typeId, 'betterend:terminite_anvil', 'Anvil landed at y=65 above end_stone');
  assert.equal(landedSound, 'random.anvil_land', 'Anvil landing played random.anvil_land');
});
