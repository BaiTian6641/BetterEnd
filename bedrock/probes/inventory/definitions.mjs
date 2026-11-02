import { INVENTORY_CARRIERS, INVENTORY_REVISION } from './scripts/inventory-constants.js';

export function inventoryProbeDefinitions() {
  const behavior = new Map();
  const resources = new Map();
  for (const carrier of INVENTORY_CARRIERS.filter(entry => entry.role !== 'vanilla')) {
    const description = {
      identifier: carrier.typeId,
      is_spawnable: false,
      is_summonable: true,
      is_experimental: false,
      properties: { [INVENTORY_REVISION]: { type: 'int', range: [0, 1000000], default: 0, client_sync: false } },
    };
    if (carrier.role === 'runtime') description.runtime_identifier = 'minecraft:chest_minecart';
    behavior.set(`entities/${carrier.role}_inventory_carrier.json`, {
      format_version: '1.26.40',
      'minecraft:entity': {
        description,
        components: {
          'minecraft:inventory': { inventory_size: 27, container_type: 'minecart_chest', can_be_siphoned_from: true, private: false, restrict_to_owner: false },
          'minecraft:collision_box': { width: 0.98, height: 0.7 },
          'minecraft:physics': { has_gravity: false, has_collision: false, push_towards_closest_space: false },
          'minecraft:pushable_by_entity': { presets: [{ push_mode: 'none' }] },
          'minecraft:persistent': {},
          'minecraft:type_family': { family: ['betterend_probe_carrier', 'inanimate'] },
        },
      },
    });
    resources.set(`entity/${carrier.role}_inventory_carrier.entity.json`, {
      format_version: '1.10.0',
      'minecraft:client_entity': {
        description: {
          identifier: carrier.typeId,
          materials: { default: 'entity' },
          textures: { default: 'textures/entity/betterend_inventory_probe_carrier' },
          geometry: { default: 'geometry.betterend_inventory_probe_carrier' },
          render_controllers: ['controller.render.default'],
        },
      },
    });
  }
  const faces = Object.fromEntries(['north', 'south', 'east', 'west', 'up', 'down'].map(face => [face, { uv: [0, 0], uv_size: [16, 16] }]));
  resources.set('models/entity/betterend_inventory_probe_carrier.geo.json', {
    format_version: '1.12.0',
    'minecraft:geometry': [{
      description: { identifier: 'geometry.betterend_inventory_probe_carrier', texture_width: 16, texture_height: 16, visible_bounds_width: 2, visible_bounds_height: 2, visible_bounds_offset: [0, 0.5, 0] },
      bones: [{ name: 'carrier', pivot: [0, 0, 0], cubes: [{ origin: [-7.8, 0, -7.8], size: [15.6, 11.2, 15.6], uv: faces }] }],
    }],
  });
  resources.set('textures/entity/betterend_inventory_probe_carrier.texture_set.json', {
    format_version: '1.16.100',
    'minecraft:texture_set': { color: 'betterend_inventory_probe_carrier', metalness_emissive_roughness: [0, 0, 255] },
  });
  return {
    behavior,
    resources,
    textures: [{ source: 'src/main/resources/assets/betterend/textures/block/flavolite.png', destination: 'textures/entity/betterend_inventory_probe_carrier.png' }],
  };
}
