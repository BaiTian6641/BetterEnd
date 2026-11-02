export const INVENTORY_MARKER = 'betterend_inventory_probe:fixture_v1';
export const INVENTORY_REVISION = 'betterend_inventory_probe:revision';
export const INVENTORY_TAG = 'betterend_inventory_probe_fixture';
export const INVENTORY_ORIGIN = { x: 4096, y: 80, z: 4096 };
export const INVENTORY_CARRIERS = [
  { role: 'runtime', typeId: 'betterend_inventory_probe:carrier_runtime', offsetX: 0 },
  { role: 'generic', typeId: 'betterend_inventory_probe:carrier_generic', offsetX: 4 },
  { role: 'vanilla', typeId: 'minecraft:chest_minecart', offsetX: 8 },
];
