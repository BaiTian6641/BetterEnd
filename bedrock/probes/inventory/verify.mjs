import assert from 'node:assert/strict';
import { INVENTORY_CARRIERS } from './scripts/inventory-constants.js';

const namespaced = id => id.includes(':') ? id : `minecraft:${id}`;

export function assertInventoryObservation(request, result) {
  assert.equal(result.action, request.action);
  assert.equal(result.probeId, request.probeId);
  assert.equal(result.dimension, 'minecraft:the_end');
  assert.equal(result.players, 0);
  assert.equal(result.inventoryComplete, true);
  assert.equal(result.clientUiVerified, false);
  assert.equal(result.opaqueItemDataCertified, false);
  assert.equal(result.carriers.length, INVENTORY_CARRIERS.length);
  assert.equal(new Set(result.carriers.map(entry => entry.id)).size, INVENTORY_CARRIERS.length);
  for (const definition of INVENTORY_CARRIERS) {
    const carrier = result.carriers.find(entry => entry.role === definition.role);
    assert.ok(carrier, `Missing ${definition.role} control`);
    assert.equal(carrier.typeId, definition.typeId);
    assert.equal(carrier.size, 27);
    assert.equal(carrier.items.length, 27);
    assert.equal(carrier.revision, definition.role === 'vanilla' ? null : 42);
    const item = carrier.items[0];
    assert.equal(item.typeId, 'minecraft:diamond_sword');
    assert.equal(item.amount, 1);
    assert.equal(item.nameTag, `Inventory probe: ${definition.role}`);
    assert.deepEqual(item.lore, ['Native custody; never reconstructed', `Fixture ${request.probeId}`]);
    assert.equal(item.durability.damage, 37);
    assert.equal(item.durability.unbreakable, true);
    assert.deepEqual(item.enchantments.map(entry => ({ id: namespaced(entry.id), level: entry.level })), [{ id: 'minecraft:unbreaking', level: 3 }]);
    assert.deepEqual(item.dynamicProperties, {
      'betterend_inventory_probe:token': `${request.probeId}/${definition.role}`,
      'betterend_inventory_probe:enabled': true,
      'betterend_inventory_probe:counter': 42.5,
      'betterend_inventory_probe:vector': { x: -3, y: 80, z: 7.25 },
    });
    assert.equal(item.keepOnDeath, true);
    assert.deepEqual(item.canDestroy.map(namespaced), ['minecraft:end_stone']);
    assert.deepEqual(item.canPlaceOn.map(namespaced), ['minecraft:end_stone']);
    assert.equal(carrier.items[1].typeId, 'minecraft:iron_ingot');
    assert.equal(carrier.items[1].amount, 10);
    assert.ok(carrier.items.slice(2).every(entry => entry === null), 'Unexpected additional physical item');
  }
  if (request.action === 'inventory-roundtrip') {
    assert.deepEqual(result.experiment, { method: 'Container.moveItem', nativeMoves: 2, reconstructedItems: 0, observedMetadataPreserved: true });
  } else if (request.action === 'inventory-transfer') {
    assert.deepEqual(result.experiment.map(entry => entry.name), ['full-fit', 'partial-fit', 'no-capacity']);
    assert.deepEqual(result.experiment.map(entry => entry.expectedMoved), [10, 4, 0]);
    for (const entry of result.experiment) {
      assert.deepEqual(entry.afterCustody, entry.before);
      assert.ok(['none', 'source-slot', 'returned-stack-restored-to-empty-source'].includes(entry.remainderOwnership));
      assert.equal(entry.returned?.amount ?? 0, 10 - entry.expectedMoved);
    }
  } else if (request.action === 'inventory-hoppers') {
    assert.deepEqual(result.experiment.map(entry => entry.role), INVENTORY_CARRIERS.map(entry => entry.role));
    for (const entry of result.experiment) {
      assert.equal(entry.nativeItemsRestored, true);
      assert.ok(entry.extractionTicks >= 120 && entry.insertionTicks >= 40);
      assert.equal(typeof entry.insertedSword, 'boolean');
    }
    const control = result.experiment.find(entry => entry.role === 'vanilla');
    assert.equal(control.extracted['minecraft:diamond_sword'], 1);
    assert.equal(control.insertedSword, true);
  } else {
    assert.ok(['inventory-setup', 'inventory-inspect'].includes(request.action));
    assert.equal(result.experiment, null);
  }
}
