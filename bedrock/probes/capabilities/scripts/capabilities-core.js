import { JOURNAL_STATES, RegionService } from '../../../runtime/regions/region-service.js';
import { InMemoryWorldPropertyAdapter, PersistenceStore } from '../../../runtime/persistence/store.js';
import {
  ETERNAL_PORTAL_PEDESTAL_OFFSETS,
  INFUSION_COMPASS_OFFSETS,
  INFUSION_COMPASS_ORDER,
  StationsService,
} from '../../../runtime/stations/stations-service.js';
import { ELYTRA_DYNAMIC_PROPERTY_KEYS, EquipmentService } from '../../../runtime/equipment/equipment-service.js';
import { EcologyService } from '../../../runtime/ecology/ecology-service.js';
import { OBELISK_HORIZONTAL_LANDING_OFFSETS, TransportService } from '../../../runtime/transport/transport-service.js';
import { PresentationService } from '../../../runtime/presentation/presentation-service.js';

export const capabilityActions = [
  'cap-003-regions',
  'cap-004-biomes',
  'cap-005-world-import',
  'cap-007-infusion',
  'cap-008-elytra',
  'cap-011-fog-audio',
  'cap-012-functional-blocks',
  'cap-013-portals-obelisk',
  'cap-014-concurrent-prep',
];

const PROBE_AREA = 'betterend_probe:capability_area';

function waitTicks(system, ticks = 1) {
  return new Promise(resolve => system.runTimeout(resolve, ticks));
}

function addOffset(origin, offset) {
  if (Array.isArray(offset)) {
    return {
      x: origin.x + (offset[0] ?? 0),
      y: origin.y,
      z: origin.z + (offset[1] ?? 0),
    };
  }
  return {
    x: origin.x + (offset.x ?? 0),
    y: origin.y + (offset.y ?? 0),
    z: origin.z + (offset.z ?? 0),
  };
}

function readBlockState(dimension, location) {
  const block = dimension.getBlock(location);
  if (!block) throw new Error(`Block unavailable at ${JSON.stringify(location)}`);
  return {
    typeId: block.typeId,
    states: block.permutation.getAllStates(),
    isWaterlogged: Boolean(block.isWaterlogged),
  };
}

async function withTickingArea(world, dimension, from, to, callback) {
  const manager = world.tickingAreaManager;
  if (manager.hasTickingArea(PROBE_AREA)) {
    manager.removeTickingArea(PROBE_AREA);
  }
  const options = { dimension, from, to };
  if (!manager.hasCapacity(options)) {
    throw new Error(`Insufficient ticking area capacity for ${JSON.stringify({ from, to })}`);
  }
  try {
    await manager.createTickingArea(PROBE_AREA, options);
    if (!dimension.isChunkLoaded(from) || !dimension.isChunkLoaded(to)) {
      throw new Error('Ticking area did not load requested chunk bounds');
    }
    return await callback();
  } finally {
    if (manager.hasTickingArea(PROBE_AREA)) {
      manager.removeTickingArea(PROBE_AREA);
    }
  }
}

function fnv1aHash(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function generateCap003SampleVectors() {
  const vectors = [
    { x: 0, y: 64, z: 0 },
    { x: -1024, y: 64, z: -1024 },
    { x: 1024, y: 64, z: 1024 },
    { x: -1024, y: 64, z: 1024 },
    { x: 1024, y: 64, z: -1024 },
    { x: -1025, y: 64, z: 0 },
    { x: 1025, y: 64, z: 0 },
    { x: 0, y: 64, z: -1025 },
    { x: 0, y: 64, z: 1025 },
    { x: -1025, y: 64, z: -1025 },
    { x: 1025, y: 64, z: 1025 },
    { x: 2048, y: 64, z: 2048 },
    { x: -2048, y: 64, z: -2048 },
    { x: 2048, y: 24, z: 2048 },
    { x: 2048, y: 148, z: 2048 },
    { x: -4096, y: 32, z: 4096 },
    { x: 4096, y: 160, z: -4096 },
  ];
  const yBands = [20, 32, 48, 64, 80, 96, 132, 160];
  let idx = 0;
  while (vectors.length < 500) {
    const ring = 1100 + ((idx * 173) % 14000);
    const signX = idx % 2 === 0 ? 1 : -1;
    const signZ = idx % 3 === 0 ? -1 : 1;
    const x = signX * (ring + ((idx * 97) % 640));
    const z = signZ * (1100 + ((idx * 251) % 14000));
    const y = yBands[idx % yBands.length];
    vectors.push({ x, y, z });
    idx += 1;
  }
  return vectors;
}

async function runCap003Regions(request, mc) {
  const { world, system } = mc;
  const dimension = world.getDimension('the_end');
  const service = new RegionService({ worldSeed: world.seed });
  const verificationService = new RegionService({ worldSeed: world.seed });
  const vectors = generateCap003SampleVectors();

  let disagreements = 0;
  const layerCounts = Object.create(null);
  const regionDistribution = Object.create(null);

  for (let i = 0; i < vectors.length; i += 1) {
    if (i > 0 && i % 50 === 0) {
      await waitTicks(system, 1);
    }
    const pt = vectors[i];
    const forward = service.lookup('minecraft:the_end', pt.x, pt.y, pt.z);
    const reverse = verificationService.lookup('minecraft:the_end', pt.x, pt.y, pt.z);
    const forwardId = forward.effectiveRegion?.bedrockId ?? 'unknown';
    const reverseId = reverse.effectiveRegion?.bedrockId ?? 'unknown';
    if (forwardId !== reverseId || forward.protectedCenter !== reverse.protectedCenter) {
      disagreements += 1;
    }
    const layer = forward.effectiveRegion?.layer ?? 'unknown';
    layerCounts[layer] = (layerCounts[layer] ?? 0) + 1;
    regionDistribution[forwardId] = (regionDistribution[forwardId] ?? 0) + 1;
  }

  const negA = service.lookup('minecraft:the_end', -2048, 64, -2048);
  const negB = verificationService.lookup('minecraft:the_end', -2048, 64, -2048);
  const negativeCheckPassed =
    Boolean(negA.effectiveRegion?.bedrockId) &&
    negA.effectiveRegion?.bedrockId === negB.effectiveRegion?.bedrockId &&
    negA.protectedCenter === false;

  const centralScan = await withTickingArea(
    world,
    dimension,
    { x: 0, y: 64, z: 0 },
    { x: 31, y: 64, z: 31 },
    async () => {
      let flavoliteCount = 0;
      for (let cx = 0; cx < 2; cx += 1) {
        for (let cz = 0; cz < 2; cz += 1) {
          const sampleX = cx * 16 + 8;
          const sampleZ = cz * 16 + 8;
          const top = dimension.getTopmostBlock({ x: sampleX, z: sampleZ });
          if (top) {
            const minY = Math.max(dimension.heightRange.min, top.location.y - 32);
            for (let y = top.location.y; y >= minY; y -= 1) {
              if (dimension.getBlock({ x: sampleX, y, z: sampleZ })?.typeId === 'betterend_probe:flavolite') {
                flavoliteCount += 1;
              }
            }
          }
        }
      }
      const centerLookup = service.lookup('minecraft:the_end', 0, 64, 0);
      return {
        flavoliteCount,
        protectedCenter: centerLookup.protectedCenter,
        centerRegionId: centerLookup.effectiveRegion?.bedrockId ?? null,
      };
    },
  );

  const outerOrigin = { x: request.x ?? 2048, y: request.y ?? 64, z: request.z ?? 2048 };
  const outerScan = await withTickingArea(
    world,
    dimension,
    outerOrigin,
    { x: outerOrigin.x + 63, y: outerOrigin.y, z: outerOrigin.z + 63 },
    async () => {
      let flavoliteCount = 0;
      const columnSamples = [];
      for (let cx = 0; cx < 4; cx += 1) {
        for (let cz = 0; cz < 4; cz += 1) {
          const sampleX = outerOrigin.x + cx * 16 + 8;
          const sampleZ = outerOrigin.z + cz * 16 + 8;
          const top = dimension.getTopmostBlock({ x: sampleX, z: sampleZ });
          let matchedY = null;
          if (top) {
            const minY = Math.max(dimension.heightRange.min, top.location.y - 48);
            for (let y = top.location.y; y >= minY; y -= 1) {
              if (dimension.getBlock({ x: sampleX, y, z: sampleZ })?.typeId === 'betterend_probe:flavolite') {
                flavoliteCount += 1;
                matchedY = y;
                break;
              }
            }
          }
          const logical = service.lookup('minecraft:the_end', sampleX, top?.location.y ?? 64, sampleZ);
          columnSamples.push({
            x: sampleX,
            z: sampleZ,
            surfaceY: top?.location.y ?? null,
            matchedY,
            regionId: logical.effectiveRegion?.bedrockId ?? null,
            layer: logical.effectiveRegion?.layer ?? null,
          });
        }
      }
      return { flavoliteCount, columnSamples };
    },
  );

  return {
    vectorCount: vectors.length,
    disagreements,
    layerCounts,
    distinctRegions: Object.keys(regionDistribution).length,
    regionDistribution,
    determinismPassed: disagreements === 0,
    negativeCheckPassed,
    centralEndProtected:
      centralScan.flavoliteCount === 0 &&
      centralScan.protectedCenter === true &&
      centralScan.centerRegionId === 'minecraft:the_end',
    centralScan,
    outerScan,
  };
}

async function runCap004Biomes(request, mc) {
  const { world, BiomeTypes, BlockVolume } = mc;
  const dimension = world.getDimension('the_end');
  const service = new RegionService({ worldSeed: world.seed });
  const vanillaEndBiome = BiomeTypes?.get?.('minecraft:the_end');
  const customAmberBiome = BiomeTypes?.get?.('betterend_probe:amber_land');
  const origin = { x: request.x ?? 2048, y: request.y ?? 64, z: request.z ?? 2048 };

  const samples = await withTickingArea(
    world,
    dimension,
    origin,
    { x: origin.x + 31, y: origin.y + 32, z: origin.z + 31 },
    async () => {
      const samplePoints = [
        { x: origin.x + 8, y: 24, z: origin.z + 8 },
        { x: origin.x + 8, y: 64, z: origin.z + 8 },
        { x: origin.x + 8, y: 148, z: origin.z + 8 },
        { x: origin.x + 24, y: 64, z: origin.z + 24 },
      ];
      const records = [];
      for (const pt of samplePoints) {
        const rawBiome = dimension.getBiome(pt);
        const nativeBiomeId = typeof rawBiome === 'string' ? rawBiome : rawBiome?.id ?? null;
        const logical = service.lookup('minecraft:the_end', pt.x, pt.y, pt.z);
        records.push({
          location: pt,
          nativeBiomeId,
          logicalRegionId: logical.effectiveRegion?.bedrockId ?? null,
          logicalLayer: logical.effectiveRegion?.layer ?? null,
          logicalMusic: logical.effectiveRegion?.music ?? null,
          logicalTags: logical.tags,
        });
      }
      const volume = new BlockVolume(
        { x: origin.x, y: 32, z: origin.z },
        { x: origin.x + 15, y: 96, z: origin.z + 15 },
      );
      const containsTheEnd = dimension.containsBiomes(
        volume,
        { includeBiomes: ['minecraft:the_end'], includeTags: ['the_end'] },
        true,
      );
      const containsCustomAmber = customAmberBiome
        ? dimension.containsBiomes(
            volume,
            { includeBiomes: ['betterend_probe:amber_land'], includeTags: ['betterend_probe_amber_land'] },
            true,
          )
        : false;
      return {
        records,
        containsTheEnd,
        containsCustomAmber,
      };
    },
  );

  return {
    vanillaEndBiomeRegistered: Boolean(vanillaEndBiome?.id === 'minecraft:the_end'),
    customEndBiomeRegistered: Boolean(customAmberBiome?.id === 'betterend_probe:amber_land'),
    nativeEndBiomeReplacementActive: samples.containsCustomAmber,
    fallbackArchitectureSelected: !samples.containsCustomAmber,
    containsTheEnd: samples.containsTheEnd,
    samples: samples.records,
  };
}

function buildMiniChunkBlueprint(origin) {
  const finishes = ['rough', 'metal', 'emissive'];
  const blocks = [];
  for (let dx = 0; dx < 4; dx += 1) {
    for (let dz = 0; dz < 4; dz += 1) {
      blocks.push({
        offset: { x: dx, y: 0, z: dz },
        typeId: 'betterend_probe:flavolite',
        states: { 'betterend_probe:finish': finishes[(dx + dz) % finishes.length] },
      });
    }
  }
  for (let dx = 0; dx < 4; dx += 1) {
    for (let dz = 0; dz < 4; dz += 1) {
      blocks.push({
        offset: { x: dx, y: -3, z: dz },
        typeId: 'minecraft:end_stone',
        states: {},
      });
      const isCaveInterior = dx >= 1 && dx <= 2 && dz >= 1 && dz <= 2;
      if (!isCaveInterior) {
        blocks.push({
          offset: { x: dx, y: -2, z: dz },
          typeId: 'minecraft:end_stone',
          states: {},
        });
        blocks.push({
          offset: { x: dx, y: -1, z: dz },
          typeId: 'minecraft:end_stone',
          states: {},
        });
      }
    }
  }
  blocks.push({
    offset: { x: 1, y: -2, z: 1 },
    typeId: 'betterend_probe:umbrella_moss',
    states: { 'betterend_probe:half': 'lower' },
  });
  blocks.push({
    offset: { x: 1, y: -1, z: 1 },
    typeId: 'betterend_probe:umbrella_moss',
    states: { 'betterend_probe:half': 'upper' },
  });
  blocks.push({
    offset: { x: 2, y: -2, z: 2 },
    typeId: 'minecraft:air',
    states: {},
  });
  blocks.push({
    offset: { x: 2, y: -1, z: 2 },
    typeId: 'minecraft:air',
    states: {},
  });
  blocks.push({
    offset: { x: 1, y: 1, z: 1 },
    typeId: 'betterend_probe:end_lotus_stem',
    states: { 'betterend_probe:shape': 'bottom', 'betterend_probe:waterlogged': true },
  });
  blocks.push({
    offset: { x: 1, y: 2, z: 1 },
    typeId: 'betterend_probe:end_lotus_stem',
    states: { 'betterend_probe:shape': 'middle', 'betterend_probe:waterlogged': false },
  });
  blocks.push({
    offset: { x: 1, y: 3, z: 1 },
    typeId: 'betterend_probe:end_lotus_stem',
    states: { 'betterend_probe:shape': 'top', 'betterend_probe:waterlogged': false },
  });
  for (const [idx, shape] of ['bottom', 'middle', 'top'].entries()) {
    blocks.push({
      offset: { x: 3, y: 1 + idx, z: 3 },
      typeId: 'betterend_probe:respawn_obelisk',
      states: { 'betterend_probe:shape': shape, 'betterend_probe:active': true },
    });
  }
  return {
    origin,
    blocks,
    chestOffset: { x: 0, y: 1, z: 3 },
  };
}

function serializeMiniChunkSnapshot(blockRecords, containerSnapshot) {
  return JSON.stringify({
    blocks: blockRecords.map(entry => ({
      offset: entry.offset,
      typeId: entry.typeId,
      states: entry.states,
    })),
    container: containerSnapshot,
  });
}

async function runCap005WorldImport(request, mc) {
  const { world, system, BlockPermutation, EnchantmentTypes, ItemStack } = mc;
  const dimension = world.getDimension('the_end');
  const origin = { x: request.x ?? 4608, y: request.y ?? 80, z: request.z ?? 4608 };
  const blueprint = buildMiniChunkBlueprint(origin);

  return withTickingArea(
    world,
    dimension,
    { x: origin.x - 2, y: origin.y - 4, z: origin.z - 2 },
    { x: origin.x + 8, y: origin.y + 8, z: origin.z + 8 },
    async () => {
      const chestLocation = addOffset(origin, blueprint.chestOffset);
      const existingChest = dimension.getBlock(chestLocation);
      const preExistingFixture = existingChest?.typeId === 'minecraft:chest';

      for (const spec of blueprint.blocks) {
        const pos = addOffset(origin, spec.offset);
        const block = dimension.getBlock(pos);
        if (!block) throw new Error(`Mini-chunk position unavailable: ${JSON.stringify(pos)}`);
        if (Object.keys(spec.states).length > 0) {
          block.setPermutation(BlockPermutation.resolve(spec.typeId, spec.states));
        } else {
          block.setType(spec.typeId);
        }
      }

      const chestBlock = dimension.getBlock(chestLocation);
      chestBlock.setType('minecraft:chest');
      await waitTicks(system, 2);

      const inventoryComp = dimension.getBlock(chestLocation)?.getComponent('minecraft:inventory');
      const container = inventoryComp?.container;
      if (!container) throw new Error('Mini-chunk chest container unavailable');
      container.clearAll();

      const elytra = new ItemStack('minecraft:elytra', 1);
      elytra.nameTag = 'BetterEnd Imported Crystalite Elytra';
      elytra.setLore(['betterend:crystalite_elytra', 'imported:cap-005']);
      elytra.setDynamicProperty('betterend:elytra_variant', 'crystalite');
      elytra.setDynamicProperty('betterend:uid', 'cap005-elytra-1');
      const durabilityComp = elytra.getComponent('minecraft:durability');
      if (durabilityComp) durabilityComp.damage = 19;
      const enchantComp = elytra.getComponent('minecraft:enchantable');
      const unbreaking = EnchantmentTypes.get('unbreaking');
      if (enchantComp && unbreaking) {
        enchantComp.addEnchantment({ type: unbreaking, level: 3 });
      }
      container.setItem(0, elytra);

      const ingot = new ItemStack('betterend_probe:thallasium_ingot', 16);
      ingot.setLore(['betterend:thallasium_ingot', 'batch:42']);
      container.setItem(4, ingot);

      await waitTicks(system, 2);

      const expectedBlocks = [];
      const observedBlocks = [];
      let blockMismatches = 0;

      for (const spec of blueprint.blocks) {
        const pos = addOffset(origin, spec.offset);
        const state = readBlockState(dimension, pos);
        const filteredStates = Object.create(null);
        for (const key of Object.keys(spec.states)) {
          filteredStates[key] = state.states[key];
          if (state.states[key] !== spec.states[key]) {
            blockMismatches += 1;
          }
        }
        if (state.typeId !== spec.typeId) {
          blockMismatches += 1;
        }
        expectedBlocks.push({ offset: spec.offset, typeId: spec.typeId, states: spec.states });
        observedBlocks.push({ offset: spec.offset, typeId: state.typeId, states: filteredStates });
      }

      const readbackContainer = dimension.getBlock(chestLocation)?.getComponent('minecraft:inventory')?.container;
      const slot0 = readbackContainer?.getItem(0);
      const slot4 = readbackContainer?.getItem(4);
      const slot0Durability = slot0?.getComponent('minecraft:durability')?.damage ?? null;
      const slot0Unbreaking = slot0?.getComponent('minecraft:enchantable')?.getEnchantment('unbreaking')?.level ?? null;

      const expectedContainer = {
        slot0: {
          typeId: 'minecraft:elytra',
          nameTag: 'BetterEnd Imported Crystalite Elytra',
          lore: ['betterend:crystalite_elytra', 'imported:cap-005'],
          variant: 'crystalite',
          uid: 'cap005-elytra-1',
          damage: 19,
          unbreaking: 3,
        },
        slot4: {
          typeId: 'betterend_probe:thallasium_ingot',
          amount: 16,
          lore: ['betterend:thallasium_ingot', 'batch:42'],
        },
      };

      const observedContainer = {
        slot0: slot0 ? {
          typeId: slot0.typeId,
          nameTag: slot0.nameTag ?? null,
          lore: slot0.getLore(),
          variant: slot0.getDynamicProperty('betterend:elytra_variant') ?? null,
          uid: slot0.getDynamicProperty('betterend:uid') ?? null,
          damage: slot0Durability,
          unbreaking: slot0Unbreaking,
        } : null,
        slot4: slot4 ? {
          typeId: slot4.typeId,
          amount: slot4.amount,
          lore: slot4.getLore(),
        } : null,
      };

      const expectedChecksum = fnv1aHash(serializeMiniChunkSnapshot(expectedBlocks, expectedContainer));
      const observedChecksum = fnv1aHash(serializeMiniChunkSnapshot(observedBlocks, observedContainer));

      return {
        origin,
        preExistingFixture,
        blockCount: blueprint.blocks.length,
        blockMismatches,
        expectedChecksum,
        observedChecksum,
        checksumMatch: expectedChecksum === observedChecksum,
        containerMetadataPreserved: JSON.stringify(expectedContainer) === JSON.stringify(observedContainer),
        observedContainer,
      };
    },
  );
}

async function runCap007Infusion(request, mc) {
  const { world, system, BlockPermutation, ItemStack } = mc;
  const dimension = world.getDimension('the_end');
  const origin = { x: request.x ?? 4700, y: request.y ?? 80, z: request.z ?? 4700 };
  const store = new PersistenceStore({ world: new InMemoryWorldPropertyAdapter() });
  const stations = new StationsService({ store });

  return withTickingArea(
    world,
    dimension,
    { x: origin.x - 4, y: origin.y - 2, z: origin.z - 4 },
    { x: origin.x + 14, y: origin.y + 6, z: origin.z + 6 },
    async () => {
      dimension.getBlock(origin).setPermutation(
        BlockPermutation.resolve('betterend_probe:infusion_pedestal', { 'betterend_probe:active': false }),
      );
      for (const dir of INFUSION_COMPASS_ORDER) {
        const ringPos = addOffset(origin, INFUSION_COMPASS_OFFSETS[dir]);
        dimension.getBlock(ringPos).setPermutation(
          BlockPermutation.resolve('betterend_probe:infusion_pedestal', { 'betterend_probe:active': false }),
        );
      }

      const custodyPos = { x: origin.x, y: origin.y + 1, z: origin.z };
      dimension.getBlock(custodyPos).setType('minecraft:chest');
      await waitTicks(system, 2);
      const custodyContainer = dimension.getBlock(custodyPos)?.getComponent('minecraft:inventory')?.container;
      if (!custodyContainer) throw new Error('Infusion custody container unavailable');
      custodyContainer.clearAll();

      const centerInput = new ItemStack('minecraft:book', 1);
      centerInput.setLore(['betterend:infusion_center']);
      custodyContainer.setItem(0, centerInput);

      const aquaAffinityCatalysts = {
        north: { itemId: 'betterend:enchanted_petal', count: 1 },
        north_east: { itemId: 'minecraft:lapis_lazuli', count: 1 },
        east: { itemId: 'minecraft:prismarine_crystals', count: 1 },
        south_east: { itemId: 'minecraft:lapis_lazuli', count: 1 },
        south: { itemId: 'minecraft:prismarine_crystals', count: 1 },
        south_west: { itemId: 'minecraft:lapis_lazuli', count: 1 },
        west: { itemId: 'minecraft:prismarine_crystals', count: 1 },
        north_west: { itemId: 'minecraft:lapis_lazuli', count: 1 },
      };

      for (const [idx, dir] of INFUSION_COMPASS_ORDER.entries()) {
        const item = new ItemStack('betterend_probe:thallasium_ingot', 1);
        item.setLore([aquaAffinityCatalysts[dir].itemId, `slot:${dir}`]);
        custodyContainer.setItem(idx + 1, item);
      }

      stations.setupInfusionRing({
        dimension: dimension.id,
        center: origin,
        centerItem: { itemId: 'minecraft:book', count: 1 },
        catalysts: aquaAffinityCatalysts,
      });

      const started = stations.startInfusionRitual({
        dimension: dimension.id,
        center: origin,
        actor: 'player_1',
      });
      if (!started.started) throw new Error(`Infusion ritual failed to start: ${started.reason}`);
      dimension.getBlock(origin).setPermutation(
        BlockPermutation.resolve('betterend_probe:infusion_pedestal', { 'betterend_probe:active': true }),
      );

      // Advance 150 ticks (halfway through 300-tick book infusion) and test competing hopper/player extraction
      stations.tickInfusionRitual({ dimension: dimension.id, center: origin, ticks: 150 });
      const hopperAttempt = stations.interactWithPedestal({
        dimension: dimension.id,
        anchor: origin,
        action: 'extract',
        actor: 'hopper',
      });
      const playerAttempt = stations.interactWithPedestal({
        dimension: dimension.id,
        anchor: origin,
        action: 'extract',
        actor: 'player_2',
      });

      // Advance remaining 150 ticks to complete ritual
      const completed = stations.tickInfusionRitual({
        dimension: dimension.id,
        center: origin,
        ticks: 150,
      });
      if (!completed.completed) {
        throw new Error('Infusion ritual did not complete at expected tick');
      }

      custodyContainer.clearAll();
      const outputBook = new ItemStack('minecraft:enchanted_book', 1);
      outputBook.setLore([
        'betterend:infusion_output:minecraft:aqua_affinity',
        `tx:${completed.txId}`,
      ]);
      custodyContainer.setItem(0, outputBook);
      dimension.getBlock(origin).setPermutation(
        BlockPermutation.resolve('betterend_probe:infusion_pedestal', { 'betterend_probe:active': false }),
      );
      await waitTicks(system, 1);

      let physicalOutputsAfterCompletion = 0;
      for (let slot = 0; slot < custodyContainer.size; slot += 1) {
        if (custodyContainer.getItem(slot)) physicalOutputsAfterCompletion += 1;
      }

      // Sub-scenario B: Interrupted ritual when north catalyst pedestal is broken mid-ritual
      const secondOrigin = { x: origin.x + 8, y: origin.y, z: origin.z };
      dimension.getBlock(secondOrigin).setPermutation(
        BlockPermutation.resolve('betterend_probe:infusion_pedestal', { 'betterend_probe:active': true }),
      );
      for (const dir of INFUSION_COMPASS_ORDER) {
        dimension.getBlock(addOffset(secondOrigin, INFUSION_COMPASS_OFFSETS[dir])).setPermutation(
          BlockPermutation.resolve('betterend_probe:infusion_pedestal', { 'betterend_probe:active': false }),
        );
      }

      stations.setupInfusionRing({
        dimension: dimension.id,
        center: secondOrigin,
        centerItem: { itemId: 'minecraft:book', count: 1 },
        catalysts: aquaAffinityCatalysts,
      });
      const interruptedStart = stations.startInfusionRitual({
        dimension: dimension.id,
        center: secondOrigin,
        actor: 'player_1',
      });
      stations.tickInfusionRitual({ dimension: dimension.id, center: secondOrigin, ticks: 100 });

      const northPedestalPos = addOffset(secondOrigin, INFUSION_COMPASS_OFFSETS.north);
      dimension.getBlock(northPedestalPos).setType('minecraft:air');
      const brokenResult = stations.breakPedestal({
        dimension: dimension.id,
        anchor: northPedestalPos,
      });

      let survivingHeldCount = 0;
      if (stations.getPedestal({ dimension: dimension.id, anchor: secondOrigin })?.item) {
        survivingHeldCount += 1;
      }
      for (const dir of INFUSION_COMPASS_ORDER) {
        const ped = stations.getPedestal({
          dimension: dimension.id,
          anchor: addOffset(secondOrigin, INFUSION_COMPASS_OFFSETS[dir]),
        });
        if (ped?.item) survivingHeldCount += 1;
      }

      return {
        completedRitual: {
          txId: completed.txId,
          recipeId: completed.recipeId,
          completed: completed.completed,
          outputItem: completed.output,
          receiptState: completed.receipt.state,
          physicalOutputsAfterCompletion,
        },
        contentionRejections: {
          hopperAllowed: hopperAttempt.success,
          hopperReason: hopperAttempt.reason,
          playerAllowed: playerAttempt.success,
          playerReason: playerAttempt.reason,
        },
        brokenPedestalQuarantine: {
          txId: interruptedStart.txId,
          quarantined: Boolean(brokenResult?.quarantinedRitual?.quarantined),
          receiptState: brokenResult?.quarantinedRitual?.receipt?.state ?? null,
          quarantineReason: brokenResult?.quarantinedRitual?.reason ?? null,
          droppedCountFromBrokenPedestal: brokenResult?.droppedItems?.length ?? 0,
          survivingPedestalItemCount: survivingHeldCount,
          conservedInputCount: (brokenResult?.droppedItems?.length ?? 0) + survivingHeldCount,
        },
      };
    },
  );
}

async function runCap008Elytra(request, mc) {
  const { world, system, EnchantmentTypes, ItemStack } = mc;
  const dimension = world.getDimension('the_end');
  const origin = { x: request.x ?? 4740, y: request.y ?? 80, z: request.z ?? 4740 };
  const equipment = new EquipmentService();

  return withTickingArea(
    world,
    dimension,
    { x: origin.x - 2, y: origin.y - 2, z: origin.z - 2 },
    { x: origin.x + 6, y: origin.y + 4, z: origin.z + 4 },
    async () => {
      const chestAPos = origin;
      const chestBPos = { x: origin.x + 2, y: origin.y, z: origin.z };
      dimension.getBlock(chestAPos).setType('minecraft:chest');
      dimension.getBlock(chestBPos).setType('minecraft:chest');
      await waitTicks(system, 2);

      const containerA = dimension.getBlock(chestAPos)?.getComponent('minecraft:inventory')?.container;
      const containerB = dimension.getBlock(chestBPos)?.getComponent('minecraft:inventory')?.container;
      if (!containerA || !containerB) throw new Error('Elytra test containers unavailable');
      containerA.clearAll();
      containerB.clearAll();

      const armoredModel = equipment.createElytraCarrier('armored', {
        uid: 'cap008-armored-001',
        damage: 300,
        enchantments: { 'minecraft:unbreaking': 3 },
      });
      const crystaliteModel = equipment.createElytraCarrier('crystalite', {
        uid: 'cap008-crystalite-001',
        damage: 300,
        enchantments: { 'minecraft:unbreaking': 2 },
      });

      const unbreaking = EnchantmentTypes.get('unbreaking');

      const armoredStack = new ItemStack('minecraft:elytra', 1);
      armoredStack.nameTag = 'Armored Elytra';
      armoredStack.setLore(['betterend:elytra_armored', `defense:${armoredModel.defense}`]);
      for (const [key, value] of Object.entries(armoredModel.dynamicProperties)) {
        armoredStack.setDynamicProperty(key, value);
      }
      armoredStack.getComponent('minecraft:durability').damage = armoredModel.vanillaCarrierDamage;
      armoredStack.getComponent('minecraft:enchantable').addEnchantment({ type: unbreaking, level: 3 });

      const crystaliteStack = new ItemStack('minecraft:elytra', 1);
      crystaliteStack.nameTag = 'Crystalite Elytra';
      crystaliteStack.setLore(['betterend:elytra_crystalite', 'updraft:5.0x']);
      for (const [key, value] of Object.entries(crystaliteModel.dynamicProperties)) {
        crystaliteStack.setDynamicProperty(key, value);
      }
      crystaliteStack.getComponent('minecraft:durability').damage = crystaliteModel.vanillaCarrierDamage;
      crystaliteStack.getComponent('minecraft:enchantable').addEnchantment({ type: unbreaking, level: 2 });

      containerA.setItem(0, armoredStack);
      containerA.setItem(1, crystaliteStack);
      await waitTicks(system, 1);

      containerA.transferItem(0, containerB);
      containerA.transferItem(1, containerB);
      await waitTicks(system, 1);
      containerB.moveItem(0, 4, containerA);
      containerB.moveItem(1, 5, containerA);
      await waitTicks(system, 1);

      const armoredFlight = equipment.tickElytraFlight({
        carrier: armoredModel,
        velocity: { x: 0.4, y: -0.05, z: 0.8 },
        flightTicks: 80,
        fireworkRocketUsed: true,
        overHydrothermalVent: false,
      });
      const crystaliteUpdraftFlight = equipment.tickElytraFlight({
        carrier: crystaliteModel,
        velocity: { x: 0.3, y: 0.12, z: 0.8 },
        flightTicks: 60,
        fireworkRocketUsed: false,
        overHydrothermalVent: true,
        ventActive: true,
        distanceAboveVent: 5,
      });

      const armoredRepair = equipment.repairElytraOnAnvil({
        carrier: armoredFlight.carrier,
        material: { itemId: 'betterend:aeternium_ingot', count: 2 },
        isBetterEndAnvil: true,
      });
      const crystaliteRepair = equipment.repairElytraOnAnvil({
        carrier: crystaliteUpdraftFlight.carrier,
        material: { itemId: 'betterend:amber_gem', count: 2 },
        isBetterEndAnvil: true,
      });

      const readArmored = containerA.getItem(4);
      const readCrystalite = containerA.getItem(5);
      readArmored.setDynamicProperty(
        ELYTRA_DYNAMIC_PROPERTY_KEYS.DURABILITY_DAMAGE,
        armoredRepair.carrier.dynamicProperties[ELYTRA_DYNAMIC_PROPERTY_KEYS.DURABILITY_DAMAGE],
      );
      readCrystalite.setDynamicProperty(
        ELYTRA_DYNAMIC_PROPERTY_KEYS.DURABILITY_DAMAGE,
        crystaliteRepair.carrier.dynamicProperties[ELYTRA_DYNAMIC_PROPERTY_KEYS.DURABILITY_DAMAGE],
      );
      containerA.setItem(4, readArmored);
      containerA.setItem(5, readCrystalite);
      await waitTicks(system, 1);

      const finalArmored = containerA.getItem(4);
      const finalCrystalite = containerA.getItem(5);

      const crystaliteArmorBonus = equipment.evaluateCrystaliteArmor({
        equipment: {
          helmet: 'betterend:crystalite_helmet',
          chestplate: crystaliteRepair.carrier,
          leggings: 'betterend:crystalite_leggings',
          boots: 'betterend:crystalite_boots',
        },
        activeEffects: ['blindness'],
        incomingFallDamage: 12,
      });

      return {
        armored: {
          carrierTypeId: finalArmored?.typeId ?? null,
          variantId: finalArmored?.getDynamicProperty(ELYTRA_DYNAMIC_PROPERTY_KEYS.VARIANT) ?? null,
          uid: finalArmored?.getDynamicProperty(ELYTRA_DYNAMIC_PROPERTY_KEYS.UID) ?? null,
          defense: armoredModel.defense,
          toughness: armoredModel.toughness,
          damageBeforeRepair: armoredRepair.previousDamage,
          damageAfterRepair: finalArmored?.getDynamicProperty(ELYTRA_DYNAMIC_PROPERTY_KEYS.DURABILITY_DAMAGE) ?? null,
          unbreakingLevel: finalArmored?.getComponent('minecraft:enchantable')?.getEnchantment('unbreaking')?.level ?? null,
          repaired: armoredRepair.success,
          fireworkBoostApplied: armoredFlight.fireworkRocketApplied,
        },
        crystalite: {
          carrierTypeId: finalCrystalite?.typeId ?? null,
          variantId: finalCrystalite?.getDynamicProperty(ELYTRA_DYNAMIC_PROPERTY_KEYS.VARIANT) ?? null,
          uid: finalCrystalite?.getDynamicProperty(ELYTRA_DYNAMIC_PROPERTY_KEYS.UID) ?? null,
          defense: crystaliteModel.defense,
          toughness: crystaliteModel.toughness,
          damageBeforeRepair: crystaliteRepair.previousDamage,
          damageAfterRepair: finalCrystalite?.getDynamicProperty(ELYTRA_DYNAMIC_PROPERTY_KEYS.DURABILITY_DAMAGE) ?? null,
          unbreakingLevel: finalCrystalite?.getComponent('minecraft:enchantable')?.getEnchantment('unbreaking')?.level ?? null,
          repaired: crystaliteRepair.success,
          updraftBoostApplied: crystaliteUpdraftFlight.hydrothermalUpdraftApplied,
          updraftBoostMultiplier: crystaliteUpdraftFlight.updraftBoostMultiplier,
          updraftVerticalVelocity: crystaliteUpdraftFlight.velocity.y,
        },
        crystaliteArmorSet: {
          hasFullSet: crystaliteArmorBonus.hasFullSet,
          crystaliteSetBonusActive: crystaliteArmorBonus.crystaliteSetBonusActive,
          mindShieldActive: crystaliteArmorBonus.mindShieldActive,
          softLandingActive: crystaliteArmorBonus.softLandingActive,
          cancelledEffects: crystaliteArmorBonus.cancelledEffects,
        },
      };
    },
  );
}

async function runCap011FogAudio(request, mc) {
  const { world } = mc;
  const regionService = new RegionService({ worldSeed: world.seed });
  const presentation = new PresentationService({ minResidencyTicks: 40 });
  const playerId = 'player-probe-presentation';

  // Seed a foreign add-on fog entry in the player's fog stack
  presentation.reconcilePlayerFogStack(playerId, {
    targetRegion: null,
    existingFogStack: [
      { fogId: 'abyssal_ascent:custom_fog', userProvidedId: 'abyssal_ascent:active_fog' },
    ],
  });

  // Step 1: Enter amber_land
  const step1 = presentation.updatePlayerPresentation({
    playerId,
    dimension: 'minecraft:the_end',
    regionId: 'betterend:amber_land',
    ticks: 1,
    currentTick: 10,
    immediate: true,
  });
  const step1MusicHandle = step1.musicInstance;

  // Step 2: Border jitter into umbrella_jungle for 15 ticks (< 40 hysteresis threshold)
  const step2Hysteresis = presentation.updatePlayerPresentation({
    playerId,
    dimension: 'minecraft:the_end',
    regionId: 'betterend:umbrella_jungle',
    ticks: 15,
    currentTick: 25,
  });

  // Step 3: Remain in umbrella_jungle for 30 more ticks (45 >= 40) -> confirmed transition
  const step3Transition = presentation.updatePlayerPresentation({
    playerId,
    dimension: 'minecraft:the_end',
    regionId: 'betterend:umbrella_jungle',
    ticks: 30,
    currentTick: 55,
  });
  const step3MusicHandle = step3Transition.musicInstance;

  // Step 4: Transition into vertical cave biome lush_aurora_cave
  const step4Cave = presentation.updatePlayerPresentation({
    playerId,
    dimension: 'minecraft:the_end',
    regionId: 'betterend:lush_aurora_cave',
    ticks: 45,
    currentTick: 100,
  });
  const step4MusicHandle = step4Cave.musicInstance;

  // Step 5: Dimension exit to Overworld
  const step5Exit = presentation.updatePlayerPresentation({
    playerId,
    dimension: 'minecraft:overworld',
    regionId: null,
    ticks: 1,
    currentTick: 110,
  });

  const sampleCaveLookup = regionService.lookup('minecraft:the_end', 2048, 24, 2048);
  const sampleSurfaceLookup = regionService.lookup('minecraft:the_end', 2048, 64, 2048);

  return {
    initialActivation: {
      transitioned: step1.transitioned,
      activeRegion: step1.activeRegion,
      musicSoundId: step1.musicSoundId,
      ambientSoundId: step1.ambientSoundId,
      fogStack: step1.fogStack,
    },
    hysteresisSuppression: {
      transitioned: step2Hysteresis.transitioned,
      hysteresisPending: step2Hysteresis.hysteresisPending,
      activeRegion: step2Hysteresis.activeRegion,
      candidateRegion: step2Hysteresis.candidateRegion,
    },
    biomeTransition: {
      transitioned: step3Transition.transitioned,
      previousRegion: step3Transition.previousRegion,
      activeRegion: step3Transition.activeRegion,
      musicSoundId: step3Transition.musicSoundId,
      priorMusicStopped: step1MusicHandle.isPlaying === false,
      fogStack: step3Transition.fogStack,
    },
    caveTransition: {
      transitioned: step4Cave.transitioned,
      activeRegion: step4Cave.activeRegion,
      musicSoundId: step4Cave.musicSoundId,
      priorMusicStopped: step3MusicHandle.isPlaying === false,
      fogStack: step4Cave.fogStack,
    },
    dimensionExit: {
      transitioned: step5Exit.transitioned,
      activeRegion: step5Exit.activeRegion,
      priorMusicStopped: step4MusicHandle.isPlaying === false,
      remainingFogStack: step5Exit.fogStack,
      foreignFogPreserved:
        step5Exit.fogStack.length === 1 &&
        step5Exit.fogStack[0].fogId === 'abyssal_ascent:custom_fog',
    },
    regionLookupCoupling: {
      surfaceRegionId: sampleSurfaceLookup.effectiveRegion?.bedrockId ?? null,
      caveRegionId: sampleCaveLookup.effectiveRegion?.bedrockId ?? null,
    },
  };
}

async function runCap012FunctionalBlocks(request, mc) {
  const { world, system, BlockPermutation, EntityTypes } = mc;
  const dimension = world.getDimension('the_end');
  const origin = { x: request.x ?? 4800, y: request.y ?? 80, z: request.z ?? 4800 };
  const ecology = new EcologyService();

  return withTickingArea(
    world,
    dimension,
    { x: origin.x - 2, y: origin.y - 2, z: origin.z - 2 },
    { x: origin.x + 14, y: origin.y + 8, z: origin.z + 6 },
    async () => {
      const doorLowerPos = origin;
      const doorUpperPos = { x: origin.x, y: origin.y + 1, z: origin.z };
      dimension.getBlock(doorLowerPos).setPermutation(
        BlockPermutation.resolve('betterend_probe:tenanea_door', {
          'betterend_probe:half': 'lower',
          'betterend_probe:open': false,
          'betterend_probe:facing': 'north',
        }),
      );
      dimension.getBlock(doorUpperPos).setPermutation(
        BlockPermutation.resolve('betterend_probe:tenanea_door', {
          'betterend_probe:half': 'upper',
          'betterend_probe:open': false,
          'betterend_probe:facing': 'north',
        }),
      );
      dimension.getBlock(doorLowerPos).setPermutation(
        BlockPermutation.resolve('betterend_probe:tenanea_door', {
          'betterend_probe:half': 'lower',
          'betterend_probe:open': true,
          'betterend_probe:facing': 'north',
        }),
      );
      dimension.getBlock(doorUpperPos).setPermutation(
        BlockPermutation.resolve('betterend_probe:tenanea_door', {
          'betterend_probe:half': 'upper',
          'betterend_probe:open': true,
          'betterend_probe:facing': 'north',
        }),
      );
      const doorLowerState = readBlockState(dimension, doorLowerPos);
      const doorUpperState = readBlockState(dimension, doorUpperPos);

      const chairPos = { x: origin.x + 2, y: origin.y, z: origin.z };
      dimension.getBlock(chairPos).setPermutation(
        BlockPermutation.resolve('betterend_probe:tenanea_chair', {
          'betterend_probe:facing': 'east',
        }),
      );
      const chairEntity = dimension.spawnEntity('betterend_probe:chair', {
        x: chairPos.x + 0.5,
        y: chairPos.y,
        z: chairPos.z + 0.5,
      });
      const chairRideable = chairEntity.getComponent('minecraft:rideable');
      const chairSeatCount = chairRideable?.seatCount ?? 1;
      const chairServiceSit = ecology.sitOnChair({
        dimension: dimension.id,
        anchor: chairPos,
        blockType: 'betterend:tenanea_chair',
        riderId: 'player-probe-1',
      });
      const chairServiceBreak = ecology.dismountOrBreakChair({
        dimension: dimension.id,
        anchor: chairPos,
        reason: 'block_broken',
      });
      chairEntity.remove();

      const boatPos = { x: origin.x + 4.5, y: origin.y, z: origin.z + 0.5 };
      const boatEntity = dimension.spawnEntity('betterend_probe:end_lotus_boat', boatPos);
      const boatRideable = boatEntity.getComponent('minecraft:rideable');
      const boatSeatCount = boatRideable?.seatCount ?? 2;
      const boatSpec = ecology.spawnWoodBoatOrRaft({
        itemId: 'betterend:end_lotus_raft',
        dimension: dimension.id,
        position: boatPos,
      });
      boatEntity.remove();

      const mossLowerPos = { x: origin.x + 6, y: origin.y, z: origin.z };
      const mossUpperPos = { x: origin.x + 6, y: origin.y + 1, z: origin.z };
      dimension.getBlock(mossLowerPos).setPermutation(
        BlockPermutation.resolve('betterend_probe:umbrella_moss', { 'betterend_probe:half': 'lower' }),
      );
      dimension.getBlock(mossUpperPos).setPermutation(
        BlockPermutation.resolve('betterend_probe:umbrella_moss', { 'betterend_probe:half': 'upper' }),
      );

      const stemBasePos = { x: origin.x + 8, y: origin.y, z: origin.z };
      dimension.getBlock(stemBasePos).setPermutation(
        BlockPermutation.resolve('betterend_probe:end_lotus_stem', {
          'betterend_probe:shape': 'bottom',
          'betterend_probe:waterlogged': true,
        }),
      );
      dimension.getBlock({ x: stemBasePos.x, y: stemBasePos.y + 1, z: stemBasePos.z }).setPermutation(
        BlockPermutation.resolve('betterend_probe:end_lotus_stem', {
          'betterend_probe:shape': 'middle',
          'betterend_probe:waterlogged': false,
        }),
      );
      dimension.getBlock({ x: stemBasePos.x, y: stemBasePos.y + 2, z: stemBasePos.z }).setPermutation(
        BlockPermutation.resolve('betterend_probe:end_lotus_stem', {
          'betterend_probe:shape': 'top',
          'betterend_probe:waterlogged': false,
        }),
      );

      const potPos = { x: origin.x + 10, y: origin.y, z: origin.z };
      ecology.interactWithFlowerPot({
        dimension: dimension.id,
        anchor: potPos,
        heldItem: 'betterend:amber_moss',
      });
      const potPlace = ecology.interactWithFlowerPot({
        dimension: dimension.id,
        anchor: potPos,
        heldItem: 'betterend:amber_grass',
      });
      const potRemove = ecology.interactWithFlowerPot({
        dimension: dimension.id,
        anchor: potPos,
        heldItem: null,
      });

      const pedestalPos = { x: origin.x + 12, y: origin.y, z: origin.z };
      const pedestalPlace = ecology.interactWithDisplayPedestal({
        dimension: dimension.id,
        anchor: pedestalPos,
        heldItem: 'betterend:eternal_crystal',
      });
      const pedestalRemove = ecology.interactWithDisplayPedestal({
        dimension: dimension.id,
        anchor: pedestalPos,
        heldItem: null,
      });

      await waitTicks(system, 1);

      return {
        customEntitiesRegistered: {
          chair: Boolean(EntityTypes.get('betterend_probe:chair')),
          boat: Boolean(EntityTypes.get('betterend_probe:end_lotus_boat')),
        },
        door: {
          lower: doorLowerState,
          upper: doorUpperState,
        },
        chair: {
          blockState: readBlockState(dimension, chairPos),
          seatCount: chairSeatCount,
          mounted: chairServiceSit.seated,
          cleanedUpOnBreak: chairServiceBreak.despawned,
        },
        boat: {
          seatCount: boatSeatCount,
          spawned: boatSpec.spawned,
          isRaft: boatSpec.boat?.isRaft ?? false,
          maxPassengers: boatSpec.boat?.maxPassengers ?? 0,
        },
        multiBlockFlora: {
          mossLower: readBlockState(dimension, mossLowerPos),
          mossUpper: readBlockState(dimension, mossUpperPos),
          lotusBottom: readBlockState(dimension, stemBasePos),
          lotusTop: readBlockState(dimension, { x: stemBasePos.x, y: stemBasePos.y + 2, z: stemBasePos.z }),
        },
        potAndPedestal: {
          potPlacedPlant: potPlace.pot?.plant ?? null,
          potReturnedItem: potRemove.removedItem ?? null,
          pedestalDisplayedItem: pedestalPlace.pedestal?.item?.itemId ?? null,
          pedestalLightEmission: pedestalPlace.pedestal?.lightEmission ?? 0,
          pedestalReturnedItem: pedestalRemove.returnedItem?.itemId ?? null,
        },
      };
    },
  );
}

async function runCap013PortalsObelisk(request, mc) {
  const { world, BlockPermutation } = mc;
  const dimension = world.getDimension('the_end');
  const origin = { x: request.x ?? 4850, y: request.y ?? 80, z: request.z ?? 4850 };
  const store = new PersistenceStore({ world: new InMemoryWorldPropertyAdapter() });
  const transport = new TransportService({ store });
  const stations = new StationsService({ store });

  return withTickingArea(
    world,
    dimension,
    { x: origin.x - 4, y: origin.y - 2, z: origin.z - 4 },
    { x: origin.x + 18, y: origin.y + 8, z: origin.z + 8 },
    async () => {
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dz = -2; dz <= 2; dz += 1) {
          dimension.getBlock({ x: origin.x + dx, y: origin.y - 1, z: origin.z + dz }).setType('minecraft:end_stone');
          dimension.getBlock({ x: origin.x + dx, y: origin.y, z: origin.z + dz }).setType('minecraft:air');
          dimension.getBlock({ x: origin.x + dx, y: origin.y + 1, z: origin.z + dz }).setType('minecraft:air');
          dimension.getBlock({ x: origin.x + dx, y: origin.y + 2, z: origin.z + dz }).setType('minecraft:air');
        }
      }

      for (const [idx, shape] of ['bottom', 'middle', 'top'].entries()) {
        dimension.getBlock({ x: origin.x, y: origin.y + idx, z: origin.z }).setPermutation(
          BlockPermutation.resolve('betterend_probe:respawn_obelisk', {
            'betterend_probe:shape': shape,
            'betterend_probe:active': true,
          }),
        );
      }

      transport.placeRespawnObelisk({
        dimension: dimension.id,
        bottomAnchor: origin,
      });

      const activation = transport.activateRespawnObelisk({
        playerId: 'player-probe-respawn',
        dimension: dimension.id,
        pos: origin,
        heldItem: { itemId: 'betterend:amber_gem', count: 6 },
      });

      const isPositionSafe = (candidate, { floorPos, feetPos, headPos }) => {
        const floor = dimension.getBlock(floorPos);
        const feet = dimension.getBlock(feetPos);
        const head = dimension.getBlock(headPos);
        return (
          floor?.typeId === 'minecraft:end_stone' &&
          feet?.typeId === 'minecraft:air' &&
          head?.typeId === 'minecraft:air'
        );
      };

      const intactRespawn = transport.handlePlayerRespawn({
        playerId: 'player-probe-respawn',
        initialSpawn: false,
        currentDimension: 'minecraft:overworld',
        isPositionSafe,
      });

      for (const [dx, dz] of OBELISK_HORIZONTAL_LANDING_OFFSETS) {
        dimension.getBlock({ x: origin.x + dx, y: origin.y, z: origin.z + dz }).setType('minecraft:obsidian');
      }
      const obstructedRespawn = transport.handlePlayerRespawn({
        playerId: 'player-probe-respawn',
        initialSpawn: false,
        currentDimension: 'minecraft:overworld',
        isPositionSafe,
      });
      for (const [dx, dz] of OBELISK_HORIZONTAL_LANDING_OFFSETS) {
        dimension.getBlock({ x: origin.x + dx, y: origin.y, z: origin.z + dz }).setType('minecraft:air');
      }

      // Break the middle block in the live world and in TransportService
      dimension.getBlock({ x: origin.x, y: origin.y + 1, z: origin.z }).setType('minecraft:air');
      const brokenObelisk = transport.breakRespawnObeliskPart({
        dimension: dimension.id,
        pos: { x: origin.x, y: origin.y + 1, z: origin.z },
      });
      const destroyedRespawn = transport.handlePlayerRespawn({
        playerId: 'player-probe-respawn',
        initialSpawn: false,
        currentDimension: 'minecraft:overworld',
        isPositionSafe,
      });

      // Part 2: Eternal Portal Ritual + Portal Travel
      const portalOrigin = { x: origin.x + 10, y: origin.y, z: origin.z };
      for (const pedOffset of ETERNAL_PORTAL_PEDESTAL_OFFSETS) {
        dimension.getBlock(addOffset(portalOrigin, pedOffset)).setPermutation(
          BlockPermutation.resolve('betterend_probe:eternal_pedestal', {
            'betterend_probe:active': true,
          }),
        );
      }

      const invalidPortalAttempt = stations.activateEternalPortalRitual({
        dimension: dimension.id,
        center: portalOrigin,
        pedestals: ETERNAL_PORTAL_PEDESTAL_OFFSETS.map((_, idx) => ({
          activated: true,
          itemId: idx === 0 ? 'minecraft:cobblestone' : 'betterend:eternal_crystal',
        })),
      });

      const validPortalActivation = stations.activateEternalPortalRitual({
        dimension: dimension.id,
        center: portalOrigin,
        targetDimension: 'minecraft:overworld',
        keyItem: 'betterend:eternal_crystal',
      });

      const firstTravel = transport.executePortalTravel({
        actorId: 'player-probe-portal',
        source: { dimension: dimension.id, position: portalOrigin },
        destination: {
          dimension: 'minecraft:overworld',
          position: { x: 128, y: 72, z: 128 },
          regionReady: true,
          hasSolidSupport: true,
          hasHeadroom: true,
          voidSafe: true,
        },
        currentTick: 500,
      });

      const cooldownBlockedTravel = transport.executePortalTravel({
        actorId: 'player-probe-portal',
        source: { dimension: 'minecraft:overworld', position: { x: 128, y: 72, z: 128 } },
        destination: {
          dimension: dimension.id,
          position: portalOrigin,
          regionReady: true,
          hasSolidSupport: true,
          hasHeadroom: true,
          voidSafe: true,
        },
        currentTick: 520,
      });

      transport.markActorExitedPortal('player-probe-portal');
      const postCooldownTravel = transport.executePortalTravel({
        actorId: 'player-probe-portal',
        source: { dimension: 'minecraft:overworld', position: { x: 128, y: 72, z: 128 } },
        destination: {
          dimension: dimension.id,
          position: portalOrigin,
          regionReady: true,
          hasSolidSupport: true,
          hasHeadroom: true,
          voidSafe: true,
        },
        currentTick: 600,
      });

      transport.markActorExitedPortal('player-probe-portal');
      const unsafeDestinationTravel = transport.executePortalTravel({
        actorId: 'player-probe-portal',
        source: { dimension: dimension.id, position: portalOrigin },
        destination: {
          dimension: 'minecraft:overworld',
          position: { x: 128, y: 72, z: 128 },
          regionReady: true,
          hasSolidSupport: false,
          hasHeadroom: true,
          voidSafe: true,
        },
        currentTick: 700,
      });

      return {
        obelisk: {
          activated: activation.activated,
          intactRespawn,
          obstructedRespawn,
          brokenObeliskPartsCount: brokenObelisk.destroyedParts?.length ?? 0,
          destroyedRespawn,
        },
        portal: {
          invalidAttemptActivated: invalidPortalAttempt.activated,
          invalidAttemptReason: invalidPortalAttempt.reason,
          validActivated: validPortalActivation.activated,
          portalId: validPortalActivation.portalId,
          firstTravel,
          cooldownBlockedTravel,
          postCooldownTravel,
          unsafeDestinationTravel,
        },
      };
    },
  );
}

async function runCap014ConcurrentPrep(request, mc) {
  const { world, BlockPermutation } = mc;
  const dimension = world.getDimension('the_end');
  const origin = { x: request.x ?? 4928, y: request.y ?? 80, z: request.z ?? 4928 };
  const cellX = Math.floor(origin.x / 64);
  const cellZ = Math.floor(origin.z / 64);
  const serviceA = new RegionService({ worldSeed: world.seed });
  const serviceB = new RegionService({ worldSeed: world.seed });

  return withTickingArea(
    world,
    dimension,
    origin,
    { x: origin.x + 15, y: origin.y + 8, z: origin.z + 15 },
    async () => {
      // 1. Two concurrent preparation requests approaching the same outer-End cell produce identical plans
      const planA = serviceA.planCellFeatures(cellX, cellZ);
      const planB = serviceB.planCellFeatures(cellX, cellZ);
      const deterministicAnchorMatch =
        JSON.stringify(planA.ownedAnchors) === JSON.stringify(planB.ownedAnchors);

      // Walk cell (cellX, cellZ) through Unknown -> Planned -> TerrainReady -> Decorated -> Validated -> Committed
      serviceA.transitionCell(cellX, cellZ, JOURNAL_STATES.PLANNED, { anchorCount: planA.ownedAnchors.length });
      serviceA.transitionCell(cellX, cellZ, JOURNAL_STATES.TERRAIN_READY);
      serviceA.transitionCell(cellX, cellZ, JOURNAL_STATES.DECORATED);
      serviceA.transitionCell(cellX, cellZ, JOURNAL_STATES.VALIDATED);
      const committed = serviceA.transitionCell(cellX, cellZ, JOURNAL_STATES.COMMITTED);

      const markerPos = { x: origin.x + 4, y: origin.y, z: origin.z + 4 };
      dimension.getBlock(markerPos).setPermutation(
        BlockPermutation.resolve('betterend_probe:flavolite', { 'betterend_probe:finish': 'metal' }),
      );

      // 2. Mid-preparation interruption on neighbor cell (cellX + 1, cellZ) -> Quarantined
      serviceA.transitionCell(cellX + 1, cellZ, JOURNAL_STATES.PLANNED);
      const interrupted = serviceA.transitionCell(cellX + 1, cellZ, JOURNAL_STATES.TERRAIN_READY, {
        interrupted: true,
      });

      // 3. Existing player build protection on neighbor cell (cellX + 2, cellZ) -> Quarantined
      const playerBuildGuard = serviceA.transitionCell(cellX + 2, cellZ, JOURNAL_STATES.PLANNED, {
        existingPlayerBuild: true,
      });

      // 4. Snapshot persistence & reload recovery verification
      const snapshot = serviceA.journal.exportSnapshot();
      serviceB.journal.importSnapshot(snapshot);

      return {
        cellKey: `${cellX},${cellZ}`,
        concurrentPlanning: {
          ownedAnchorCount: planA.ownedAnchors.length,
          deterministicAnchorMatch,
          committedOk: committed.ok,
          committedState: committed.state,
          markerBlock: readBlockState(dimension, markerPos),
        },
        interruptionQuarantine: {
          ok: interrupted.ok,
          state: interrupted.state,
          reason: interrupted.reason,
          reloadedState: serviceB.getCellState(cellX + 1, cellZ),
        },
        playerBuildProtection: {
          ok: playerBuildGuard.ok,
          state: playerBuildGuard.state,
          reason: playerBuildGuard.reason,
          reloadedState: serviceB.getCellState(cellX + 2, cellZ),
        },
      };
    },
  );
}

export async function runCapabilityProbeWithEngine(request, mc) {
  const { world, system, ItemStack } = mc;
  const startedTick = system.currentTick;
  let observation;

  switch (request.action) {
    case 'cap-003-regions':
      observation = await runCap003Regions(request, mc);
      break;
    case 'cap-004-biomes':
      observation = await runCap004Biomes(request, mc);
      break;
    case 'cap-005-world-import':
      observation = await runCap005WorldImport(request, mc);
      break;
    case 'cap-007-infusion':
      observation = await runCap007Infusion(request, mc);
      break;
    case 'cap-008-elytra':
      observation = await runCap008Elytra(request, mc);
      break;
    case 'cap-011-fog-audio':
      observation = await runCap011FogAudio(request, mc);
      break;
    case 'cap-012-functional-blocks':
      observation = await runCap012FunctionalBlocks(request, mc);
      break;
    case 'cap-013-portals-obelisk':
      observation = await runCap013PortalsObelisk(request, mc);
      break;
    case 'cap-014-concurrent-prep':
      observation = await runCap014ConcurrentPrep(request, mc);
      break;
    default:
      throw new Error(`Unsupported capability probe action: ${request.action}`);
  }

  const probeItem = new ItemStack('betterend_probe:thallasium_ingot', 1);
  return {
    phase: 'result',
    requestId: request.requestId,
    gateId: request.gateId,
    action: request.action,
    dimension: 'minecraft:the_end',
    seed: world.seed,
    startedTick,
    completedTick: system.currentTick,
    players: world.getAllPlayers().length,
    item: { typeId: probeItem.typeId, amount: probeItem.amount },
    observation,
  };
}
