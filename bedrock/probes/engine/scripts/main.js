import {
  BlockPermutation, BlockTypes, ItemStack, ItemTypes, ScriptEventSource, system, world,
} from '@minecraft/server';
import { capabilityActions, runCapabilityProbe } from './capabilities.js';
import { installInventoryObservers, inventoryActions, runInventoryProbe } from './inventory.js';

const blockId = 'betterend_probe:flavolite';
const itemId = 'betterend_probe:thallasium_ingot';
const areaName = 'betterend_probe:active_probe';
let ready = false;
let running = false;

function emit(record) {
  console.warn(`BETTEREND_PROBE ${JSON.stringify(record)}`);
}

function integer(value, name) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 100000) throw new Error(`Invalid ${name}`);
  return value;
}

function protectedCenter(location) {
  return Math.abs(location.x) <= 1024 && Math.abs(location.z) <= 1024;
}

function blockState(dimension, location) {
  const block = dimension.getBlock(location);
  if (!block) throw new Error(`Unavailable block at ${JSON.stringify(location)}`);
  return { typeId: block.typeId, states: block.permutation.getAllStates() };
}

async function run(request) {
  if (typeof request.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(request.requestId)) throw new Error('Invalid request ID');
  if (world.getAllPlayers().length !== 0) throw new Error('Automated mutation probes require an empty disposable server');
  const action = request.action;
  if (capabilityActions.includes(action)) {
    emit(await runCapabilityProbe(request));
    return;
  }
  if (inventoryActions.includes(action)) {
    emit(await runInventoryProbe(request));
    return;
  }
  if (!['scan', 'place', 'inspect', 'board'].includes(action)) throw new Error('Unknown action');
  const dimensionName = request.dimension ?? 'the_end';
  if (!['the_end', 'overworld', 'nether'].includes(dimensionName)) throw new Error('Unknown dimension');
  const dimension = world.getDimension(dimensionName);
  const location = { x: integer(request.x, 'x'), y: integer(request.y ?? 64, 'y'), z: integer(request.z, 'z') };
  const width = action === 'scan' ? integer(request.width ?? 4, 'width') : 1;
  if (width < 1 || width > 8) throw new Error('Scan width must be between 1 and 8 chunks');
  if (action === 'scan' && (location.x % 16 !== 0 || location.z % 16 !== 0)) throw new Error('Scan origin must be chunk aligned');
  const to = { x: location.x + (action === 'scan' ? width * 16 - 1 : action === 'board' ? 6 : 0), y: location.y, z: location.z + (action === 'scan' ? width * 16 - 1 : 0) };
  if (['place', 'board'].includes(action) && (dimensionName !== 'the_end' || protectedCenter(location))) throw new Error('Mutation is restricted to the outer End');
  const manager = world.tickingAreaManager;
  const options = { dimension, from: location, to };
  if (!manager.hasCapacity(options)) throw new Error('No ticking-area capacity');
  const startedTick = system.currentTick;
  try {
    await manager.createTickingArea(areaName, options);
    if (!dimension.isChunkLoaded(location) || !dimension.isChunkLoaded(to)) throw new Error('Ticking-area completion did not load the requested area');
    const records = [];
    if (action === 'scan') {
      for (let x = 0; x < width; x += 1) {
        for (let z = 0; z < width; z += 1) {
          const sample = { x: location.x + x * 16 + 8, y: location.y, z: location.z + z * 16 + 8 };
          const surface = dimension.getTopmostBlock({ x: sample.x, z: sample.z });
          const featureMatches = [];
          if (surface) {
            const minimum = Math.max(dimension.heightRange.min, surface.location.y - 64);
            for (let y = surface.location.y; y >= minimum; y -= 1) {
              const candidate = { x: sample.x, y, z: sample.z };
              const block = dimension.getBlock(candidate);
              if (block?.typeId === blockId) {
                featureMatches.push({ location: candidate, ...blockState(dimension, candidate) });
                break;
              }
            }
          }
          records.push({ location: sample, ...blockState(dimension, sample), surface: surface ? { location: surface.location, ...blockState(dimension, surface.location) } : null, featureMatches });
        }
      }
    } else if (action === 'board') {
      for (const [index, finish] of ['rough', 'metal', 'emissive'].entries()) {
        const sample = { x: location.x + index * 2, y: location.y, z: location.z };
        const block = dimension.getBlock(sample);
        if (!block) throw new Error('Material-board location unavailable');
        const before = blockState(dimension, sample);
        block.setPermutation(BlockPermutation.resolve(blockId, { 'betterend_probe:finish': finish }));
        records.push({ location: sample, before, after: blockState(dimension, sample) });
      }
    } else {
      const before = blockState(dimension, location);
      let featurePlaced = null;
      if (action === 'place') {
        if (before.typeId !== 'minecraft:end_stone') throw new Error(`Direct feature needs untouched End Stone, found ${before.typeId}`);
        featurePlaced = dimension.placeFeature('betterend_probe:flavolite_feature', location, true);
      }
      records.push({ location, before, featurePlaced, after: blockState(dimension, location) });
    }
    const item = new ItemStack(itemId, 1);
    emit({ phase: 'result', requestId: request.requestId, action, dimension: dimension.id, seed: world.seed, startedTick, completedTick: system.currentTick, players: world.getAllPlayers().length, item: { typeId: item.typeId, amount: item.amount }, records });
  } finally {
    if (manager.hasTickingArea(areaName)) manager.removeTickingArea(areaName);
  }
}

system.beforeEvents.startup.subscribe(() => emit({ phase: 'startup' }));
world.afterEvents.worldLoad.subscribe(() => {
  installInventoryObservers(emit);
  ready = true;
  emit({ phase: 'worldLoad', tick: system.currentTick, seed: world.seed, players: world.getAllPlayers().length, blockRegistered: BlockTypes.get(blockId) !== undefined, itemRegistered: ItemTypes.get(itemId) !== undefined });
});

system.afterEvents.scriptEventReceive.subscribe(event => {
  if (event.id !== 'betterend_probe:run' || event.sourceType !== ScriptEventSource.Server) return;
  if (!ready || running) {
    emit({ phase: 'rejected', ready, running });
    return;
  }
  let request;
  try {
    request = JSON.parse(event.message);
  } catch (error) {
    emit({ phase: 'error', requestId: null, error: String(error) });
    return;
  }
  running = true;
  system.run(() => {
    run(request).catch(error => emit({ phase: 'error', requestId: request?.requestId ?? null, error: String(error) }))
      .finally(() => { running = false; });
  });
});
