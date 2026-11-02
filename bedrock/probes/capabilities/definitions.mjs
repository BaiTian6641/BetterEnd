const material = finish => ({ '*': { texture: `betterend_probe_flavolite_${finish}`, render_method: 'opaque' } });

function customBlock(identifier, displayName, states, permutations = []) {
  return {
    format_version: '1.26.20',
    'minecraft:block': {
      description: {
        identifier,
        menu_category: { category: 'construction' },
        states,
      },
      components: {
        'minecraft:display_name': displayName,
        'minecraft:geometry': 'minecraft:geometry.full_block',
        'minecraft:material_instances': material('rough'),
        'minecraft:light_emission': 0,
      },
      permutations,
    },
  };
}

function customEntity(identifier, { collisionBox, rideable, family, inventory = null }) {
  const components = {
    'minecraft:collision_box': collisionBox,
    'minecraft:physics': { has_gravity: false, has_collision: false, push_towards_closest_space: false },
    'minecraft:pushable_by_entity': { presets: [{ push_mode: 'none' }] },
    'minecraft:persistent': {},
    'minecraft:type_family': { family },
    'minecraft:rideable': rideable,
  };
  if (inventory) components['minecraft:inventory'] = inventory;
  return {
    behavior: {
      format_version: '1.26.40',
      'minecraft:entity': {
        description: {
          identifier,
          is_spawnable: false,
          is_summonable: true,
          is_experimental: false,
        },
        components,
      },
    },
    resource: {
      format_version: '1.10.0',
      'minecraft:client_entity': {
        description: {
          identifier,
          materials: { default: 'entity' },
          textures: { default: 'textures/entity/betterend_inventory_probe_carrier' },
          geometry: { default: 'geometry.betterend_inventory_probe_carrier' },
          render_controllers: ['controller.render.default'],
        },
      },
    },
  };
}

export function capabilityProbeDefinitions() {
  const behavior = new Map();
  const resources = new Map();

  const activePermutation = [{
    condition: "query.block_state('betterend_probe:active') == true",
    components: { 'minecraft:material_instances': material('emissive') },
  }];

  behavior.set(
    'blocks/infusion_pedestal.json',
    customBlock(
      'betterend_probe:infusion_pedestal',
      'Infusion Pedestal - capability probe',
      { 'betterend_probe:active': [false, true] },
      activePermutation,
    ),
  );
  behavior.set(
    'blocks/eternal_pedestal.json',
    customBlock(
      'betterend_probe:eternal_pedestal',
      'Eternal Pedestal - capability probe',
      { 'betterend_probe:active': [false, true] },
      activePermutation,
    ),
  );
  behavior.set(
    'blocks/respawn_obelisk.json',
    customBlock(
      'betterend_probe:respawn_obelisk',
      'Respawn Obelisk - capability probe',
      {
        'betterend_probe:shape': ['bottom', 'middle', 'top'],
        'betterend_probe:active': [false, true],
      },
      activePermutation,
    ),
  );
  behavior.set(
    'blocks/tenanea_door.json',
    customBlock(
      'betterend_probe:tenanea_door',
      'Tenanea Door - capability probe',
      {
        'betterend_probe:half': ['lower', 'upper'],
        'betterend_probe:open': [false, true],
        'betterend_probe:facing': ['north', 'south', 'east', 'west'],
      },
    ),
  );
  behavior.set(
    'blocks/tenanea_chair.json',
    customBlock(
      'betterend_probe:tenanea_chair',
      'Tenanea Chair - capability probe',
      { 'betterend_probe:facing': ['north', 'south', 'east', 'west'] },
    ),
  );
  behavior.set(
    'blocks/end_lotus_stem.json',
    customBlock(
      'betterend_probe:end_lotus_stem',
      'End Lotus Stem - capability probe',
      {
        'betterend_probe:shape': ['bottom', 'middle', 'top'],
        'betterend_probe:waterlogged': [false, true],
      },
    ),
  );
  behavior.set(
    'blocks/umbrella_moss.json',
    customBlock(
      'betterend_probe:umbrella_moss',
      'Umbrella Moss - capability probe',
      { 'betterend_probe:half': ['lower', 'upper'] },
    ),
  );

  const chair = customEntity('betterend_probe:chair', {
    collisionBox: { width: 0.6, height: 0.5 },
    family: ['betterend_chair', 'inanimate'],
    rideable: {
      interact_text: 'action.interact.ride.minecart',
      pull_in_entities: false,
      seat_count: 1,
      seats: { position: [0.0, 0.4375, 0.0] },
    },
  });
  behavior.set('entities/chair.json', chair.behavior);
  resources.set('entity/chair.entity.json', chair.resource);

  const boat = customEntity('betterend_probe:end_lotus_boat', {
    collisionBox: { width: 1.375, height: 0.5625 },
    family: ['betterend_boat', 'boat', 'inanimate'],
    rideable: {
      interact_text: 'action.interact.ride.boat',
      pull_in_entities: false,
      seat_count: 2,
      seats: [
        { min_rider_count: 0, max_rider_count: 1, position: [0.0, 0.35, 0.0] },
        { min_rider_count: 2, max_rider_count: 2, position: [-0.6, 0.35, 0.0] },
      ],
    },
  });
  behavior.set('entities/end_lotus_boat.json', boat.behavior);
  resources.set('entity/end_lotus_boat.entity.json', boat.resource);

  behavior.set('biomes/amber_land.biome.json', {
    format_version: '1.26.0',
    'minecraft:biome': {
      description: {
        identifier: 'betterend_probe:amber_land',
      },
      components: {
        'minecraft:climate': {
          downfall: 0.5,
          snow_accumulation: [0.0, 0.125],
          temperature: 0.5,
        },
        'minecraft:surface_builder': {
          builder: {
            type: 'minecraft:the_end',
          },
        },
        'minecraft:tags': {
          tags: [
            'the_end',
            'betterend_probe_amber_land',
          ],
        },
      },
    },
  });

  return {
    behavior,
    resources,
    textures: [],
  };
}
