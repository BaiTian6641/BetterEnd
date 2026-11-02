import { BlockPermutation, EnchantmentTypes, ItemStack, system, world } from '@minecraft/server';
import { INVENTORY_CARRIERS, INVENTORY_MARKER, INVENTORY_ORIGIN, INVENTORY_REVISION, INVENTORY_TAG } from './inventory-constants.js';

const areaName = 'betterend_inventory_probe:active';
const trackedIds = new Set();
export const inventoryActions = ['inventory-setup', 'inventory-inspect', 'inventory-roundtrip', 'inventory-transfer', 'inventory-hoppers'];

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function same(actual, expected, subject) {
  require(JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected)), `${subject}: ${JSON.stringify({ actual, expected })}`);
}

function itemView(item) {
  if (!item) return null;
  const durability = item.getComponent('minecraft:durability');
  const enchantable = item.getComponent('minecraft:enchantable');
  return {
    typeId: item.typeId, amount: item.amount, maxAmount: item.maxAmount, isStackable: item.isStackable,
    nameTag: item.nameTag ?? null, lore: item.getLore(), rawLore: item.getRawLore(),
    durability: durability ? { damage: durability.damage, maximum: durability.maxDurability, unbreakable: durability.unbreakable } : null,
    enchantments: (enchantable?.getEnchantments() ?? []).map(entry => ({ id: entry.type.id, level: entry.level })).sort((a, b) => a.id.localeCompare(b.id)),
    dynamicProperties: Object.fromEntries(item.getDynamicPropertyIds().sort().map(id => [id, item.getDynamicProperty(id)])),
    keepOnDeath: item.keepOnDeath, lockMode: item.lockMode,
    canDestroy: item.getCanDestroy().sort(), canPlaceOn: item.getCanPlaceOn().sort(), tags: item.getTags().sort(),
  };
}

function contents(container) {
  return Array.from({ length: container.size }, (_, slot) => itemView(container.getItem(slot)));
}

function containerOf(entity) {
  const component = entity.getComponent('minecraft:inventory');
  require(component?.container, `No native inventory on ${entity.typeId}`);
  return component.container;
}

function blockContainer(dimension, location) {
  const block = dimension.getBlock(location);
  require(block?.typeId === 'minecraft:chest', `Owned fixture chest missing at ${JSON.stringify(location)}`);
  const container = block.getComponent('minecraft:inventory')?.container;
  require(container, 'Owned fixture chest has no native inventory');
  return container;
}

function store(fixture) {
  world.setDynamicProperty(INVENTORY_MARKER, JSON.stringify(fixture));
  for (const carrier of fixture.carriers) trackedIds.add(carrier.id);
}

function load(probeId) {
  const raw = world.getDynamicProperty(INVENTORY_MARKER);
  require(typeof raw === 'string', 'No persisted inventory fixture; inspection never recreates it');
  const fixture = JSON.parse(raw);
  require(fixture.schemaVersion === 1 && fixture.probeId === probeId, 'Fixture identity mismatch');
  require(fixture.phase === 'ready', `Fixture is ${fixture.phase}; interrupted construction is not automatically replayed`);
  for (const carrier of fixture.carriers) trackedIds.add(carrier.id);
  return fixture;
}

function actor(record, probeId) {
  const entity = world.getEntity(record.id);
  require(entity, `Recorded actor ${record.id} is absent after its chunk was loaded; refusing reconstruction`);
  require(entity.typeId === record.typeId && entity.hasTag(INVENTORY_TAG), 'Carrier identity/tag mismatch');
  require(entity.getDynamicProperty(INVENTORY_MARKER) === probeId, 'Carrier fixture marker mismatch');
  if (record.role !== 'vanilla') require(entity.getProperty(INVENTORY_REVISION) === 42, 'Non-default definition property did not persist');
  return entity;
}

function inspect(fixture) {
  return fixture.carriers.map(record => {
    const entity = actor(record, fixture.probeId);
    const container = containerOf(entity);
    const actual = contents(container);
    same(actual, record.expectedItems, `${record.role} native inventory`);
    const position = entity.location;
    const delta = Math.hypot(position.x - record.position.x, position.y - record.position.y, position.z - record.position.z);
    require(delta < 0.02, `${record.role} moved ${delta} blocks without scripted teleportation`);
    return { role: record.role, id: entity.id, typeId: entity.typeId, position, velocity: entity.getVelocity(), size: container.size, revision: record.role === 'vanilla' ? null : entity.getProperty(INVENTORY_REVISION), items: actual };
  });
}

function metadataFixture(probeId, role) {
  const item = new ItemStack('minecraft:diamond_sword', 1);
  item.nameTag = `Inventory probe: ${role}`;
  item.setLore(['Native custody; never reconstructed', `Fixture ${probeId}`]);
  item.keepOnDeath = true;
  item.setCanDestroy(['minecraft:end_stone']);
  item.setCanPlaceOn(['minecraft:end_stone']);
  const durability = item.getComponent('minecraft:durability');
  require(durability, 'Diamond sword has no durability component');
  durability.damage = 37;
  durability.unbreakable = true;
  const enchantment = EnchantmentTypes.get('unbreaking');
  const enchantable = item.getComponent('minecraft:enchantable');
  require(enchantment && enchantable, 'Unbreaking fixture cannot be constructed');
  enchantable.addEnchantment({ type: enchantment, level: 3 });
  item.setDynamicProperty('betterend_inventory_probe:token', `${probeId}/${role}`);
  item.setDynamicProperty('betterend_inventory_probe:enabled', true);
  item.setDynamicProperty('betterend_inventory_probe:counter', 42.5);
  item.setDynamicProperty('betterend_inventory_probe:vector', { x: -3, y: 80, z: 7.25 });
  return item;
}

async function setup(request, dimension) {
  require(world.getDynamicProperty(INVENTORY_MARKER) === undefined, 'Fixture already exists; setup never reseeds an existing world');
  const { x, y, z } = INVENTORY_ORIGIN;
  require(dimension.getEntities({ location: INVENTORY_ORIGIN, maxDistance: 24 }).length === 0, 'Fixture region contains existing actors');
  for (let dx = 0; dx <= 14; dx += 1) {
    for (let dy = -1; dy <= 3; dy += 1) {
      const block = dimension.getBlock({ x: x + dx, y: y + dy, z });
      require(block?.typeId === 'minecraft:air', 'Fixture requires an untouched empty construction volume');
    }
  }
  const fixture = {
    schemaVersion: 1, probeId: request.probeId, phase: 'constructing', dimension: dimension.id,
    origin: INVENTORY_ORIGIN, setupTick: system.currentTick, carriers: [], completedActions: [],
    sourceChest: { x: x + 12, y, z }, targetChest: { x: x + 14, y, z },
  };
  store(fixture);
  for (const definition of INVENTORY_CARRIERS) {
    const support = { x: x + definition.offsetX, y: y - 1, z };
    dimension.getBlock(support).setPermutation(BlockPermutation.resolve('minecraft:stone'));
    dimension.getBlock({ ...support, y }).setPermutation(BlockPermutation.resolve('minecraft:rail', { rail_direction: 0 }));
    const entity = dimension.spawnEntity(definition.typeId, { x: support.x + 0.5, y: y + 0.0625, z: z + 0.5 });
    const record = { role: definition.role, id: entity.id, typeId: entity.typeId };
    fixture.carriers.push(record);
    store(fixture);
    entity.addTag(INVENTORY_TAG);
    entity.setDynamicProperty(INVENTORY_MARKER, request.probeId);
    entity.nameTag = `${definition.role} inventory probe`;
    if (definition.role !== 'vanilla') entity.setProperty(INVENTORY_REVISION, 42);
    const container = containerOf(entity);
    require(container.size === 27 && container.emptySlotsCount === 27, 'Carrier must start with 27 empty native slots');
    container.setItem(0, metadataFixture(request.probeId, definition.role));
    container.setItem(1, new ItemStack('minecraft:iron_ingot', 10));
    record.expectedItems = contents(container);
    store(fixture);
  }
  for (const location of [fixture.sourceChest, fixture.targetChest]) {
    dimension.getBlock({ ...location, y: y - 1 }).setPermutation(BlockPermutation.resolve('minecraft:stone'));
    dimension.getBlock(location).setPermutation(BlockPermutation.resolve('minecraft:chest'));
    require(blockContainer(dimension, location).emptySlotsCount === 27, 'Fixture chest did not start empty');
  }
  await system.waitTicks(10);
  for (const record of fixture.carriers) record.position = world.getEntity(record.id).location;
  fixture.phase = 'ready';
  store(fixture);
  return fixture;
}

function roundtrip(fixture) {
  const sourceRecord = fixture.carriers.find(entry => entry.role === 'runtime');
  const targetRecord = fixture.carriers.find(entry => entry.role === 'generic');
  const source = containerOf(actor(sourceRecord, fixture.probeId));
  const target = containerOf(actor(targetRecord, fixture.probeId));
  require(target.getItem(2) === undefined, 'Roundtrip destination is not empty');
  const before = itemView(source.getItem(0));
  source.moveItem(0, 2, target);
  require(source.getItem(0) === undefined, 'Native move retained a source copy');
  same(itemView(target.getItem(2)), before, 'Outbound native metadata');
  target.moveItem(2, 0, source);
  require(target.getItem(2) === undefined, 'Return move retained a target copy');
  same(itemView(source.getItem(0)), before, 'Returned native metadata');
  return { method: 'Container.moveItem', nativeMoves: 2, reconstructedItems: 0, observedMetadataPreserved: true };
}

function totals(...containers) {
  const counts = {};
  for (const container of containers) {
    for (let slot = 0; slot < container.size; slot += 1) {
      const item = container.getItem(slot);
      if (item) counts[item.typeId] = (counts[item.typeId] ?? 0) + item.amount;
    }
  }
  return counts;
}

function transfers(fixture, dimension) {
  require(!fixture.completedActions.includes('inventory-transfer'), 'Transfer characterization already ran; fixtures are not reseeded');
  const source = blockContainer(dimension, fixture.sourceChest);
  const target = blockContainer(dimension, fixture.targetChest);
  require(source.emptySlotsCount === source.size && target.emptySlotsCount === target.size, 'Transfer fixture chests must start empty');
  const records = [];
  fixture.phase = 'transfer-in-progress';
  store(fixture);
  for (const [name, initialCompatible, expectedMoved] of [['full-fit', 0, 10], ['partial-fit', 60, 4], ['no-capacity', 64, 0]]) {
    source.setItem(0, new ItemStack('minecraft:iron_ingot', 10));
    if (name !== 'full-fit') {
      for (let slot = 0; slot < target.size - 1; slot += 1) target.setItem(slot, new ItemStack('minecraft:cobblestone', 64));
      target.setItem(target.size - 1, new ItemStack('minecraft:iron_ingot', initialCompatible));
    }
    const before = totals(source, target);
    const returned = source.transferItem(0, target);
    const afterTransfer = totals(source, target);
    const sourceAfterTransfer = itemView(source.getItem(0));
    const remaining = 10 - expectedMoved;
    const targetIron = totals(target)['minecraft:iron_ingot'] ?? 0;
    require(targetIron === initialCompatible + expectedMoved, `${name}: unexpected native transfer capacity`);
    require((returned?.amount ?? 0) === remaining, `${name}: unexpected returned remainder`);
    let remainderOwnership = 'none';
    if (remaining > 0) {
      if (afterTransfer['minecraft:iron_ingot'] === before['minecraft:iron_ingot']) {
        require(sourceAfterTransfer?.amount === remaining, `${name}: source-owned remainder was not in its source slot`);
        same(itemView(returned), sourceAfterTransfer, `${name} return/source remainder`);
        remainderOwnership = 'source-slot';
      } else {
        require(source.getItem(0) === undefined && afterTransfer['minecraft:iron_ingot'] + remaining === before['minecraft:iron_ingot'], `${name}: ambiguous remainder custody`);
        // Only an observed inventory deficit plus an empty source permits returning
        // this exact native stack. Never reconstruct or blindly insert the return.
        source.setItem(0, returned);
        remainderOwnership = 'returned-stack-restored-to-empty-source';
      }
    }
    same(totals(source, target), before, `${name} physical item conservation`);
    records.push({ name, expectedMoved, sourceAfterTransfer, returned: itemView(returned), before, afterTransfer, afterCustody: totals(source, target), remainderOwnership });
    // Disposable, explicitly generated capacity fixtures only; carrier items are
    // never cleared or recreated by these characterization cases.
    source.clearAll();
    target.clearAll();
  }
  fixture.completedActions.push('inventory-transfer');
  fixture.phase = 'ready';
  store(fixture);
  return records;
}

function hopperContainer(dimension, location, expectedBlock) {
  const block = dimension.getBlock(location);
  require(block?.typeId === expectedBlock, 'Hopper location is no longer the owned fixture block');
  block.setPermutation(BlockPermutation.resolve('minecraft:hopper', { facing_direction: 0, toggle_bit: false }));
  const container = block.getComponent('minecraft:inventory')?.container;
  require(container?.size === 5 && container.emptySlotsCount === 5, 'New fixture hopper must be empty');
  return container;
}

function restoreHopperItems(hopper, carrier, expectedSword) {
  for (let slot = 0; slot < hopper.size; slot += 1) {
    const item = hopper.getItem(slot);
    if (item?.typeId !== 'minecraft:diamond_sword') continue;
    same(itemView(item), expectedSword, 'Hopper-held native metadata');
    require(carrier.getItem(0) === undefined, 'Sword destination is not empty');
    hopper.moveItem(slot, 0, carrier);
  }
  for (let slot = 0; slot < hopper.size; slot += 1) {
    if (!hopper.getItem(slot)) continue;
    const remainder = hopper.transferItem(slot, carrier);
    require(remainder === undefined && hopper.getItem(slot) === undefined, 'Native hopper restoration unexpectedly lacked capacity');
  }
  require(hopper.emptySlotsCount === hopper.size, 'Refusing to remove a nonempty fixture hopper');
}

async function hoppers(fixture, dimension) {
  require(!fixture.completedActions.includes('inventory-hoppers'), 'Hopper characterization already ran');
  fixture.phase = 'hopper-in-progress';
  store(fixture);
  const fixtures = fixture.carriers.map(record => {
    const definition = INVENTORY_CARRIERS.find(entry => entry.role === record.role);
    const location = { x: INVENTORY_ORIGIN.x + definition.offsetX, y: INVENTORY_ORIGIN.y - 1, z: INVENTORY_ORIGIN.z };
    const carrier = containerOf(actor(record, fixture.probeId));
    const expectedTotals = totals(carrier);
    const hopper = hopperContainer(dimension, location, 'minecraft:stone');
    return { record, location, carrier, hopper, expectedTotals };
  });
  const extractionStart = system.currentTick;
  await system.waitTicks(120);
  const records = [];
  for (const entry of fixtures) {
    const { record, location, carrier, hopper, expectedTotals } = entry;
    same(totals(carrier, hopper), expectedTotals, `${record.role} hopper extraction conservation`);
    const extracted = totals(hopper);
    records.push({ role: record.role, extracted, extractionTicks: system.currentTick - extractionStart, extractionState: dimension.getBlock(location).permutation.getAllStates() });
    // No yield occurs between stopping this fixture and returning its native items.
    dimension.getBlock(location).setPermutation(BlockPermutation.resolve('minecraft:hopper', { facing_direction: 0, toggle_bit: true }));
    restoreHopperItems(hopper, carrier, record.expectedItems[0]);
    same(contents(carrier), record.expectedItems, `${record.role} post-extraction inventory`);
    dimension.getBlock(location).setPermutation(BlockPermutation.resolve('minecraft:stone'));
  }
  const inputs = fixtures.map(entry => {
    const location = { ...entry.location, y: INVENTORY_ORIGIN.y + 1 };
    const hopper = hopperContainer(dimension, location, 'minecraft:air');
    entry.carrier.moveItem(0, 0, hopper);
    require(entry.carrier.getItem(0) === undefined, 'Input preparation left a duplicate source sword');
    return { ...entry, location, hopper };
  });
  const insertionStart = system.currentTick;
  await system.waitTicks(40);
  for (const [index, entry] of inputs.entries()) {
    const { record, location, carrier, hopper, expectedTotals } = entry;
    same(totals(carrier, hopper), expectedTotals, `${record.role} hopper insertion conservation`);
    const inserted = carrier.getItem(0) !== undefined;
    if (inserted) same(itemView(carrier.getItem(0)), record.expectedItems[0], `${record.role} hopper-inserted metadata`);
    Object.assign(records[index], { insertedSword: inserted, insertionTicks: system.currentTick - insertionStart, insertionState: dimension.getBlock(location).permutation.getAllStates() });
    dimension.getBlock(location).setPermutation(BlockPermutation.resolve('minecraft:hopper', { facing_direction: 0, toggle_bit: true }));
    restoreHopperItems(hopper, carrier, record.expectedItems[0]);
    same(contents(carrier), record.expectedItems, `${record.role} post-insertion inventory`);
    dimension.getBlock(location).setPermutation(BlockPermutation.resolve('minecraft:air'));
    records[index].nativeItemsRestored = true;
  }
  fixture.completedActions.push('inventory-hoppers');
  fixture.phase = 'ready';
  store(fixture);
  const control = records.find(entry => entry.role === 'vanilla');
  require(control.extracted['minecraft:diamond_sword'] === 1 && control.insertedSword, `Vanilla hopper control failed: ${JSON.stringify(records)}`);
  return records;
}

export async function runInventoryProbe(request) {
  require(inventoryActions.includes(request.action), 'Unknown inventory probe action');
  require(typeof request.probeId === 'string' && /^[a-zA-Z0-9_-]{1,24}$/.test(request.probeId), 'Invalid stable fixture ID');
  require(world.getAllPlayers().length === 0, 'Automated inventory probes require an empty disposable world');
  const dimension = world.getDimension('the_end');
  const manager = world.tickingAreaManager;
  const options = { dimension, from: { ...INVENTORY_ORIGIN, y: INVENTORY_ORIGIN.y - 2 }, to: { x: INVENTORY_ORIGIN.x + 15, y: INVENTORY_ORIGIN.y + 4, z: INVENTORY_ORIGIN.z + 1 } };
  require(manager.hasCapacity(options), 'No inventory ticking-area capacity');
  const startedTick = system.currentTick;
  try {
    await manager.createTickingArea(areaName, options);
    require(dimension.isChunkLoaded(options.from) && dimension.isChunkLoaded(options.to), 'Inventory fixture chunks are not loaded');
    const fixture = request.action === 'inventory-setup' ? await setup(request, dimension) : load(request.probeId);
    inspect(fixture);
    let experiment = null;
    if (request.action === 'inventory-roundtrip') experiment = roundtrip(fixture);
    if (request.action === 'inventory-transfer') experiment = transfers(fixture, dimension);
    if (request.action === 'inventory-hoppers') experiment = await hoppers(fixture, dimension);
    return {
      phase: 'result', requestId: request.requestId, action: request.action, probeId: fixture.probeId,
      dimension: dimension.id, seed: world.seed, startedTick, completedTick: system.currentTick, players: world.getAllPlayers().length,
      carriers: inspect(fixture), experiment, inventoryComplete: true, clientUiVerified: false, opaqueItemDataCertified: false,
    };
  } finally {
    if (manager.hasTickingArea(areaName)) manager.removeTickingArea(areaName);
  }
}

export function installInventoryObservers(emit) {
  const raw = world.getDynamicProperty(INVENTORY_MARKER);
  if (typeof raw === 'string') for (const record of JSON.parse(raw).carriers) trackedIds.add(record.id);
  world.afterEvents.entityContainerOpened.subscribe(event => {
    if (trackedIds.has(event.entity.id)) emit({ phase: 'inventoryContainerOpened', id: event.entity.id, accessor: event.openSource.entity?.id ?? null, tick: system.currentTick });
  });
  world.afterEvents.entityContainerClosed.subscribe(event => {
    if (trackedIds.has(event.entity.id)) emit({ phase: 'inventoryContainerClosed', id: event.entity.id, accessor: event.closeSource.entity?.id ?? null, tick: system.currentTick });
  });
  world.afterEvents.entityLoad.subscribe(event => {
    if (trackedIds.has(event.entity.id)) emit({ phase: 'inventoryEntityLoaded', id: event.entity.id, tick: system.currentTick });
  });
  world.afterEvents.entityRemove.subscribe(event => {
    if (trackedIds.has(event.removedEntityId)) emit({ phase: 'inventoryEntityRemovedOrUnloaded', id: event.removedEntityId, tick: system.currentTick });
  });
}
