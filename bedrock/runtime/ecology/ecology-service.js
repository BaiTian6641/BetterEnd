/**
 * BetterEnd Bedrock 26.40 — Wildlife Ecology, Farming, Interactive Blocks & Seating Service
 * (`ECO-001`, `FARM-001`, `BLK-002`)
 *
 * Pure ES module with zero Node-specific imports.
 */

import { formatAnchorKey, normalizeBlockAnchor, normalizeDimensionId } from '../persistence/store.js';

export const WILDLIFE_FAMILIES = Object.freeze({
  dragonfly: Object.freeze({
    id: 'betterend:dragonfly',
    family: 'dragonfly',
    category: 'ambient',
    health: 20,
    javaReferenceHealth: 8,
    hitbox: Object.freeze({ width: 0.6, height: 0.5 }),
    peacefulAllowed: true,
    despawnsInPeaceful: false,
    flightMode: 'aquatic_reed_hover',
    biomes: Object.freeze([
      'betterend:foggy_mushroomland',
      'betterend:megalake',
      'betterend:megalake_grove',
      'betterend:umbrella_jungle',
      'betterend:glowing_grasslands',
      'betterend:waterfall_ponds',
    ]),
    maxNearby: 4,
    checkRadius: 32,
    lootTable: Object.freeze([
      { itemId: 'betterend:chitin', minCount: 1, maxCount: 2 },
    ]),
    xpReward: 1,
  }),
  end_slime: Object.freeze({
    id: 'betterend:end_slime',
    family: 'end_slime',
    category: 'monster',
    healthBySize: Object.freeze({ 1: 4, 2: 8, 3: 16, 4: 32 }),
    attackBySize: Object.freeze({ 1: 1, 2: 2, 3: 3, 4: 4 }),
    sizes: Object.freeze([1, 2, 3, 4]),
    variants: Object.freeze(['moss', 'amber', 'lake', 'chorus']),
    variantByBiome: Object.freeze({
      'betterend:foggy_mushroomland': 'moss',
      'betterend:amber_land': 'amber',
      'betterend:megalake': 'lake',
      'betterend:megalake_grove': 'lake',
      'betterend:chorus_forest': 'chorus',
    }),
    hitbox: Object.freeze({ width: 0.5, height: 0.5, scalesWithSize: true }),
    peacefulAllowed: false,
    despawnsInPeaceful: true,
    biomes: Object.freeze([
      'betterend:foggy_mushroomland',
      'betterend:amber_land',
      'betterend:megalake',
      'betterend:megalake_grove',
      'betterend:chorus_forest',
      'betterend:umbrella_jungle',
    ]),
    maxNearby: 6,
    checkRadius: 32,
    lootTable: Object.freeze([
      { itemId: 'minecraft:slime_ball', minCount: 1, maxCount: 2 },
    ]),
    xpReward: 4,
  }),
  end_fish: Object.freeze({
    id: 'betterend:end_fish',
    family: 'end_fish',
    category: 'water_ambient',
    health: 6,
    javaReferenceHealth: 2,
    hitbox: Object.freeze({ width: 0.5, height: 0.5 }),
    variants: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]),
    normalVariants: Object.freeze([0, 1, 2, 3, 4]),
    sulphurVariants: Object.freeze([5, 6, 7]),
    peacefulAllowed: true,
    despawnsInPeaceful: false,
    bucketItem: 'betterend:bucket_end_fish',
    schooling: true,
    flopsOutOfWater: true,
    biomes: Object.freeze([
      'betterend:foggy_mushroomland',
      'betterend:megalake',
      'betterend:megalake_grove',
      'betterend:amber_land',
      'betterend:sulphur_springs',
      'betterend:umbrella_jungle',
      'betterend:waterfall_ponds',
    ]),
    maxNearby: 16,
    checkRadius: 16,
    lootTable: Object.freeze([
      { itemId: 'betterend:end_fish_raw', fireItemId: 'betterend:end_fish_cooked', minCount: 1, maxCount: 1 },
    ]),
    xpReward: 1,
  }),
  shadow_walker: Object.freeze({
    id: 'betterend:shadow_walker',
    family: 'shadow_walker',
    category: 'monster',
    health: 40,
    javaReferenceHealth: 20,
    attack: 5,
    armor: 2,
    hitbox: Object.freeze({ width: 0.6, height: 1.95 }),
    peacefulAllowed: false,
    despawnsInPeaceful: true,
    hostile: true,
    inflictsBlindnessTicks: 60,
    particles: Object.freeze(['minecraft:smoke_particle', 'minecraft:ash', 'betterend:black_spore']),
    biomes: Object.freeze(['betterend:shadow_forest']),
    maxNearby: 8,
    checkRadius: 64,
    lootTable: Object.freeze([
      { itemId: 'betterend:shadow_berry_raw', minCount: 0, maxCount: 1 },
      { itemId: 'minecraft:ender_pearl', minCount: 0, maxCount: 1 },
    ]),
    xpReward: 5,
  }),
  cubozoa: Object.freeze({
    id: 'betterend:cubozoa',
    family: 'cubozoa',
    category: 'water_ambient',
    health: 10,
    javaReferenceHealth: 2,
    hitbox: Object.freeze({ width: 0.6, height: 1.0 }),
    variants: Object.freeze([0, 1]), // 0 = normal, 1 = sulphur
    peacefulAllowed: true,
    despawnsInPeaceful: false,
    bucketItem: 'betterend:bucket_cubozoa',
    contactPoisonTicks: 20,
    contactDamage: 0.5,
    emissiveGlow: true,
    biomes: Object.freeze([
      'betterend:foggy_mushroomland',
      'betterend:megalake',
      'betterend:megalake_grove',
      'betterend:sulphur_springs',
    ]),
    maxNearby: 16,
    checkRadius: 16,
    lootTable: Object.freeze([
      { itemId: 'betterend:gelatine', minCount: 1, maxCount: 2 },
    ]),
    xpReward: 1,
  }),
  silk_moth: Object.freeze({
    id: 'betterend:silk_moth',
    family: 'silk_moth',
    category: 'ambient',
    health: 4,
    javaReferenceHealth: 2,
    hitbox: Object.freeze({ width: 0.6, height: 0.6 }),
    peacefulAllowed: true,
    despawnsInPeaceful: false,
    breedingFood: 'betterend:blossom_berry',
    tetherBlocks: Object.freeze(['betterend:silk_moth_nest', 'betterend:silk_moth_hive']),
    biomes: Object.freeze([
      'betterend:blossoming_spires',
      'betterend:glowing_grasslands',
      'betterend:flower_islets',
    ]),
    maxNearby: 4,
    checkRadius: 32,
    lootTable: Object.freeze([
      { itemId: 'betterend:silk_fiber', minCount: 1, maxCount: 2 },
    ]),
    xpReward: 1,
  }),
});

export const WOOD_SEATING_FAMILIES = Object.freeze([
  'dragon_tree',
  'end_lotus',
  'helix_tree',
  'jellyshroom',
  'lacugrove',
  'lucernia',
  'lucernia_jellyshroom',
  'mossy_glowshroom',
  'pythadendron',
  'tenanea',
  'umbrella_tree',
]);

export const CHAIR_BLOCKS = Object.freeze(
  WOOD_SEATING_FAMILIES.flatMap(wood => [
    `betterend:${wood}_chair`,
    `betterend:${wood}_bar_stool`,
    `betterend:${wood}_taburet`,
  ]),
);

export const CHAIR_HEIGHT_OFFSETS = Object.freeze({
  chair: 0.4375,
  bar_stool: 0.625,
  taburet: 0.375,
});

export const WOOD_BOAT_FAMILIES = Object.freeze([
  'dragon_tree',
  'end_lotus',
  'helix_tree',
  'jellyshroom',
  'lacugrove',
  'lucernia',
  'mossy_glowshroom',
  'pythadendron',
  'tenanea',
  'umbrella_tree',
]);

export const BOAT_AND_RAFT_ITEMS = Object.freeze(
  WOOD_BOAT_FAMILIES.flatMap(wood =>
    wood === 'end_lotus'
      ? [`betterend:${wood}_raft`, `betterend:${wood}_chest_raft`]
      : [`betterend:${wood}_boat`, `betterend:${wood}_chest_boat`],
  ),
);

export const POTTABLE_SOIL_BLOCKS = Object.freeze([
  'betterend:end_moss',
  'betterend:end_mycelium',
  'betterend:jungle_moss',
  'betterend:sangnum',
  'betterend:rutiscus',
  'betterend:chorus_nylium',
  'betterend:crystal_moss',
  'betterend:shadow_grass',
  'betterend:pink_moss',
  'betterend:amber_moss',
  'betterend:cave_moss',
  'betterend:endstone_dust',
  'minecraft:end_stone',
  'minecraft:dirt',
]);

export const POTTABLE_PLANTS = Object.freeze({
  'betterend:amber_grass': { light: 0 },
  'betterend:blooming_cooksonia': { light: 0 },
  'betterend:bolux_mushroom': { light: 10 },
  'betterend:bushy_grass': { light: 0 },
  'betterend:cave_grass': { light: 0 },
  'betterend:chorus_grass': { light: 0 },
  'betterend:clawfern': { light: 0 },
  'betterend:crystal_grass': { light: 0 },
  'betterend:fracturn': { light: 0 },
  'betterend:globulagus': { light: 0 },
  'betterend:inflexia': { light: 0 },
  'betterend:jungle_grass': { light: 0 },
  'betterend:lamellarium': { light: 15 },
  'betterend:lutebus': { light: 0 },
  'betterend:murkweed': { light: 5 },
  'betterend:needlegrass': { light: 0 },
  'betterend:orango': { light: 0 },
  'betterend:ruscus': { light: 0 },
  'betterend:salteago': { light: 0 },
  'betterend:shadow_plant': { light: 0 },
  'betterend:small_amaranita_mushroom': { light: 10 },
  'betterend:small_jellyshroom': { light: 15 },
  'betterend:umbrella_moss': { light: 10 },
  'betterend:vaiolush_fern': { light: 0 },
});

const SIX_DIRECTIONS = Object.freeze([
  Object.freeze({ name: 'up', dx: 0, dy: 1, dz: 0 }),
  Object.freeze({ name: 'down', dx: 0, dy: -1, dz: 0 }),
  Object.freeze({ name: 'north', dx: 0, dy: 0, dz: -1 }),
  Object.freeze({ name: 'south', dx: 0, dy: 0, dz: 1 }),
  Object.freeze({ name: 'east', dx: 1, dy: 0, dz: 0 }),
  Object.freeze({ name: 'west', dx: -1, dy: 0, dz: 0 }),
]);

/**
 * Authoritative runtime service for BetterEnd Wildlife, Farming, Hazards & Seating
 * (`ECO-001`, `FARM-001`, `BLK-002`).
 */
export class EcologyService {
  constructor(options = {}) {
    this.wildlifeFamilies = WILDLIFE_FAMILIES;
    this.chairBlocks = CHAIR_BLOCKS;
    this.boatItems = BOAT_AND_RAFT_ITEMS;

    this._entities = new Map();
    this._nextEntityId = 1;
    this._hives = new Map();
    this._flowerPots = new Map();
    this._pedestals = new Map();
    this._activeSeats = new Map();
    this._boats = new Map();
  }

  // ============================================================================
  // 1. WILDLIFE FAMILIES (`ECO-001`)
  // ============================================================================

  getWildlifeSpec(familyOrId) {
    const clean = String(familyOrId).replace(/^betterend:/, '').toLowerCase();
    return this.wildlifeFamilies[clean] ?? null;
  }

  /**
   * Validates spawn rules (biome eligibility, peaceful difficulty compliance,
   * population cap, and medium/fluid requirements) and spawns a wildlife entity.
   */
  spawnWildlife({
    family,
    dimension = 'minecraft:the_end',
    position = { x: 0, y: 64, z: 0 },
    biome = 'betterend:foggy_mushroomland',
    difficulty = 'normal',
    inWater = false,
    size = 2,
    variant = null,
    scale = 8,
    hiveAnchor = null,
  }) {
    const spec = this.getWildlifeSpec(family);
    if (!spec) {
      return { spawned: false, reason: `unknown_wildlife_family:${family}` };
    }

    const isPeaceful = String(difficulty).toLowerCase() === 'peaceful';
    if (isPeaceful && !spec.peacefulAllowed) {
      return { spawned: false, reason: 'peaceful_difficulty_restriction', family: spec.family };
    }

    if (spec.biomes && !spec.biomes.includes(biome)) {
      return { spawned: false, reason: 'invalid_biome', biome, allowedBiomes: spec.biomes };
    }

    if (spec.category === 'water_ambient' && !inWater) {
      return { spawned: false, reason: 'requires_water' };
    }

    // Check local population cap
    const nearbyCount = [...this._entities.values()].filter(e => {
      if (e.family !== spec.family || e.dimension !== normalizeDimensionId(dimension)) return false;
      const dist = Math.hypot(e.position.x - position.x, e.position.y - position.y, e.position.z - position.z);
      return dist <= spec.checkRadius;
    }).length;

    if (nearbyCount >= spec.maxNearby) {
      return { spawned: false, reason: 'population_cap_reached', nearbyCount, maxNearby: spec.maxNearby };
    }

    const entityId = `entity_${spec.family}_${this._nextEntityId++}`;
    let resolvedVariant = variant;
    let resolvedHealth = spec.health;
    let resolvedHitbox = { ...spec.hitbox };

    if (spec.family === 'end_slime') {
      const clampedSize = Math.max(1, Math.min(4, Math.floor(Number(size) || 2)));
      resolvedVariant = resolvedVariant ?? spec.variantByBiome[biome] ?? 'chorus';
      resolvedHealth = spec.healthBySize[clampedSize] ?? clampedSize * clampedSize * 2;
      resolvedHitbox = {
        width: Number((spec.hitbox.width * clampedSize).toFixed(2)),
        height: Number((spec.hitbox.height * clampedSize).toFixed(2)),
      };
      size = clampedSize;
    } else if (spec.family === 'end_fish') {
      if (resolvedVariant === null || resolvedVariant === undefined) {
        resolvedVariant = biome === 'betterend:sulphur_springs' ? 5 : 0;
      }
    } else if (spec.family === 'cubozoa') {
      if (resolvedVariant === null || resolvedVariant === undefined) {
        resolvedVariant = biome === 'betterend:sulphur_springs' ? 1 : 0;
      }
    } else {
      resolvedVariant = resolvedVariant ?? 'default';
    }

    const entity = {
      entityId,
      id: spec.id,
      family: spec.family,
      category: spec.category,
      dimension: normalizeDimensionId(dimension),
      position: { x: Number(position.x), y: Number(position.y), z: Number(position.z) },
      velocity: { x: 0, y: 0, z: 0 },
      biome,
      health: resolvedHealth,
      maxHealth: resolvedHealth,
      attack: spec.family === 'end_slime' ? spec.attackBySize[size] : spec.attack ?? 0,
      hitbox: resolvedHitbox,
      size: spec.family === 'end_slime' ? size : 1,
      variant: resolvedVariant,
      scale: Number(scale ?? 8),
      inWater: Boolean(inWater),
      hiveAnchor: hiveAnchor ? normalizeBlockAnchor(hiveAnchor) : null,
      carryingPollen: false,
      alive: true,
    };

    this._entities.set(entityId, entity);
    return { spawned: true, entity: JSON.parse(JSON.stringify(entity)) };
  }

  /**
   * Simulates behavior / AI step for a wildlife entity (`dragonfly` reed hover,
   * `end_fish` schooling & out-of-water flop, `shadow_walker` blindness attack &
   * smoke particles, `cubozoa` contact poison/glow, `silk_moth` pollination).
   */
  tickWildlifeEntity(entityId, context = {}) {
    const entity = this._entities.get(entityId);
    if (!entity || !entity.alive) {
      return { active: false, reason: 'entity_not_alive' };
    }

    const spec = this.getWildlifeSpec(entity.family);
    if (String(context.difficulty ?? 'normal').toLowerCase() === 'peaceful' && spec.despawnsInPeaceful) {
      entity.alive = false;
      this._entities.delete(entityId);
      return { active: false, despawned: true, reason: 'peaceful_despawn' };
    }

    const events = [];
    const particles = [];
    const statusEffectsApplied = [];

    if (entity.family === 'dragonfly') {
      // Ambient aquatic/reed flight hovering 1-3 blocks above water/reeds
      const targetAltitude = Number(context.waterSurfaceY ?? 64) + 2.0;
      entity.velocity = {
        x: 0.25,
        y: Number(((targetAltitude - entity.position.y) * 0.2).toFixed(3)),
        z: 0.25,
      };
      entity.position.y = Number((entity.position.y + entity.velocity.y).toFixed(3));
      events.push('aquatic_reed_hover');
    } else if (entity.family === 'end_slime') {
      entity.velocity = { x: 0.2, y: 0.42, z: 0.2 };
      events.push('slime_jump');
      if (context.targetPlayer && !context.targetPlayer.isCreative) {
        events.push('slime_attack');
      }
    } else if (entity.family === 'end_fish') {
      const inWater = context.inWater !== undefined ? Boolean(context.inWater) : entity.inWater;
      entity.inWater = inWater;
      if (!inWater) {
        entity.velocity = { x: 0.1, y: 0.4, z: -0.1 };
        events.push('flop_out_of_water');
      } else {
        entity.velocity = { x: 0.35, y: 0.0, z: 0.35 };
        events.push('schooling_swim');
      }
    } else if (entity.family === 'shadow_walker') {
      particles.push(...spec.particles);
      if (context.targetEntity) {
        statusEffectsApplied.push({
          target: context.targetEntity.id ?? 'player',
          effect: 'blindness',
          durationTicks: spec.inflictsBlindnessTicks,
          amplifier: 0,
          damageDealt: entity.attack,
        });
        events.push('melee_blindness_hit');
      }
    } else if (entity.family === 'cubozoa') {
      particles.push('betterend:cubozoa_glow');
      if (context.touchingPlayer && !context.touchingPlayer.isCreative) {
        statusEffectsApplied.push({
          target: context.touchingPlayer.id ?? 'player',
          effect: 'poison',
          durationTicks: spec.contactPoisonTicks,
          amplifier: 0,
          damageDealt: spec.contactDamage,
        });
        events.push('contact_poison_sting');
      }
    } else if (entity.family === 'silk_moth') {
      entity.carryingPollen = true;
      events.push('pollinate_flight');
      if (entity.hiveAnchor && context.returnToHive) {
        const hiveResult = this.returnMothToNestOrHive({
          dimension: entity.dimension,
          anchor: entity.hiveAnchor,
          mothEntityId: entity.entityId,
        });
        events.push('returned_to_hive');
        return {
          active: false,
          returnedToHive: true,
          hiveResult,
          events,
        };
      }
    }

    return {
      active: true,
      entity: JSON.parse(JSON.stringify(entity)),
      events,
      particles,
      statusEffectsApplied,
    };
  }

  /**
   * Captures a bucketable aquatic entity (`end_fish` or `cubozoa`) into
   * `betterend:bucket_end_fish` or `betterend:bucket_cubozoa`, preserving `variant` and `scale`.
   */
  bucketAquaticEntity(entityId, heldItem = 'minecraft:water_bucket') {
    const heldId = typeof heldItem === 'string' ? heldItem : heldItem?.itemId ?? heldItem?.typeId;
    if (heldId !== 'minecraft:water_bucket') {
      return { success: false, reason: 'requires_water_bucket' };
    }
    const entity = this._entities.get(entityId);
    if (!entity || !entity.alive) {
      return { success: false, reason: 'entity_not_found' };
    }
    const spec = this.getWildlifeSpec(entity.family);
    if (!spec?.bucketItem) {
      return { success: false, reason: 'entity_not_bucketable' };
    }

    entity.alive = false;
    this._entities.delete(entityId);

    return {
      success: true,
      bucketItem: {
        itemId: spec.bucketItem,
        count: 1,
        maxStackSize: 1,
        components: {
          'minecraft:bucket_entity_data': {
            family: entity.family,
            variant: entity.variant,
            scale: entity.scale,
            health: entity.health,
          },
        },
      },
    };
  }

  /**
   * Handles death of a wildlife entity:
   * - `end_slime` with `size > 1` splits into `2..4` child slimes of `size = Math.floor(size / 2)`
   *   preserving `variant`
   * - Generates canonical loot drops (`chitin`, `slime_ball`, `end_fish_raw`/`end_fish_cooked`,
   *   `gelatine`, `silk_fiber`, etc.)
   */
  killWildlifeEntity(entityId, { killedByFire = false, lootingLevel = 0, splitCount = 3 } = {}) {
    const entity = this._entities.get(entityId);
    if (!entity || !entity.alive) {
      return { killed: false, reason: 'entity_not_found' };
    }
    const spec = this.getWildlifeSpec(entity.family);
    entity.alive = false;
    this._entities.delete(entityId);

    const spawnedChildren = [];
    if (entity.family === 'end_slime' && entity.size > 1) {
      const childSize = Math.max(1, Math.floor(entity.size / 2));
      const numChildren = Math.max(2, Math.min(4, Math.floor(Number(splitCount) || 3)));
      for (let i = 0; i < numChildren; i += 1) {
        const res = this.spawnWildlife({
          family: 'end_slime',
          dimension: entity.dimension,
          position: {
            x: entity.position.x + (i - 1) * 0.25,
            y: entity.position.y,
            z: entity.position.z + (i - 1) * 0.25,
          },
          biome: entity.biome,
          size: childSize,
          variant: entity.variant,
        });
        if (res.spawned) {
          spawnedChildren.push(res.entity);
        }
      }
    }

    const drops = [];
    for (const entry of spec.lootTable) {
      const itemId = killedByFire && entry.fireItemId ? entry.fireItemId : entry.itemId;
      const count = Math.max(1, entry.minCount + Math.min(2, Number(lootingLevel) || 0));
      drops.push({ itemId, count });
    }

    return {
      killed: true,
      family: entity.family,
      variant: entity.variant,
      size: entity.size,
      drops,
      xpReward: spec.xpReward,
      spawnedChildren,
    };
  }

  // ============================================================================
  // 2. SILK MOTH NEST & HIVE (`FARM-001`, `fullness = 0..3`)
  // ============================================================================

  placeSilkMothHousing({
    dimension = 'minecraft:the_end',
    anchor,
    blockType = 'betterend:silk_moth_hive',
    fullness = 0,
    residentMoths = 1,
    active = true,
  }) {
    const key = formatAnchorKey(dimension, anchor);
    const housing = {
      anchorKey: key,
      dimension: normalizeDimensionId(dimension),
      anchor: normalizeBlockAnchor(anchor),
      blockType,
      active: Boolean(active),
      fullness: Math.max(0, Math.min(3, Math.floor(Number(fullness) || 0))),
      residentMoths: Math.max(0, Math.floor(Number(residentMoths) || 0)),
    };
    this._hives.set(key, housing);
    return JSON.parse(JSON.stringify(housing));
  }

  getSilkMothHousing({ dimension = 'minecraft:the_end', anchor }) {
    const key = formatAnchorKey(dimension, anchor);
    const housing = this._hives.get(key);
    return housing ? JSON.parse(JSON.stringify(housing)) : null;
  }

  /**
   * Returning Silk Moth increments `fullness` (`+1` or `+2`, clamped to `0..3`)
   * and enters the nest/hive.
   */
  returnMothToNestOrHive({
    dimension = 'minecraft:the_end',
    anchor,
    mothEntityId = null,
    fullnessGain = null,
  }) {
    const key = formatAnchorKey(dimension, anchor);
    const housing = this._hives.get(key);
    if (!housing) {
      return { success: false, reason: 'housing_not_found' };
    }
    if (mothEntityId && this._entities.has(mothEntityId)) {
      this._entities.delete(mothEntityId);
    }

    const defaultGain = housing.blockType === 'betterend:silk_moth_hive' ? 2 : 1;
    const delta = fullnessGain !== null ? Math.max(1, Math.min(2, Number(fullnessGain))) : defaultGain;
    const previousFullness = housing.fullness;
    housing.fullness = Math.min(3, housing.fullness + delta);
    housing.residentMoths += 1;

    return {
      success: true,
      previousFullness,
      fullness: housing.fullness,
      fullnessDelta: housing.fullness - previousFullness,
      residentMoths: housing.residentMoths,
      producesItems: ['betterend:silk_fiber', 'betterend:silk_moth_matrix'],
    };
  }

  /**
   * Harvests a Silk Moth Nest or Hive:
   * - Shears (`minecraft:shears`): requires `fullness >= 2` (`+2` threshold), drops
   *   `betterend:silk_fiber` & `betterend:silk_moth_matrix`, damages shears by 1.
   * - Glass Bottle (`minecraft:glass_bottle`): requires `fullness >= 1` (`+1` fullness),
   *   consumes 1 bottle and yields `betterend:enchanted_bottle` / `minecraft:honey_bottle`.
   */
  harvestSilkMothHousing({
    dimension = 'minecraft:the_end',
    anchor,
    tool,
  }) {
    const key = formatAnchorKey(dimension, anchor);
    const housing = this._hives.get(key);
    if (!housing) {
      return { success: false, reason: 'housing_not_found' };
    }

    const toolId = typeof tool === 'string' ? tool : tool?.itemId ?? tool?.typeId ?? '';
    if (toolId === 'minecraft:shears') {
      if (housing.fullness < 2) {
        return {
          success: false,
          reason: 'insufficient_fullness_for_shears',
          requiredFullness: 2,
          actualFullness: housing.fullness,
        };
      }
      const previousFullness = housing.fullness;
      housing.fullness = 0;
      const fiberCount = housing.blockType === 'betterend:silk_moth_hive' ? 8 : 3;
      const drops = [
        { itemId: 'betterend:silk_fiber', count: fiberCount },
        { itemId: 'betterend:silk_moth_matrix', count: 1 },
      ];
      return {
        success: true,
        method: 'shears',
        previousFullness,
        fullness: housing.fullness,
        toolDurabilityDamage: 1,
        drops,
      };
    }

    if (toolId === 'minecraft:glass_bottle') {
      if (housing.fullness < 1) {
        return {
          success: false,
          reason: 'insufficient_fullness_for_bottle',
          requiredFullness: 1,
          actualFullness: housing.fullness,
        };
      }
      const previousFullness = housing.fullness;
      housing.fullness = Math.max(0, housing.fullness - 1);
      return {
        success: true,
        method: 'glass_bottle',
        previousFullness,
        fullness: housing.fullness,
        consumedBottleCount: 1,
        drops: [
          {
            itemId: 'betterend:enchanted_bottle',
            equivalentVanillaId: 'minecraft:honey_bottle',
            count: 1,
          },
        ],
      };
    }

    return { success: false, reason: `unsupported_harvest_tool:${toolId}` };
  }

  /**
   * Breaks a Silk Moth Nest or Hive. When broken with Silk Touch (`silkTouch: true`),
   * drops the populated block item preserving `fullness` and `residentMoths` residency.
   */
  breakSilkMothHousing({
    dimension = 'minecraft:the_end',
    anchor,
    silkTouch = false,
  }) {
    const key = formatAnchorKey(dimension, anchor);
    const housing = this._hives.get(key);
    if (!housing) return null;
    this._hives.delete(key);

    if (silkTouch) {
      return {
        silkTouch: true,
        droppedItem: {
          itemId: housing.blockType,
          count: 1,
          maxStackSize: 1,
          dynamicProperties: {
            'betterend:fullness': housing.fullness,
            'betterend:resident_moths': housing.residentMoths,
          },
          components: {
            'betterend:moth_residency': {
              fullness: housing.fullness,
              residentMoths: housing.residentMoths,
            },
          },
        },
        releasedMoths: 0,
      };
    }

    return {
      silkTouch: false,
      droppedItem: housing.blockType === 'betterend:silk_moth_hive'
        ? { itemId: housing.blockType, count: 1 }
        : { itemId: 'betterend:silk_fiber', count: 2 },
      releasedMoths: housing.residentMoths,
    };
  }

  // ============================================================================
  // 3. INTERACTIVE BLOCKS, PLANTS & HAZARDS (`FARM-001`, `BLK-002`)
  // ============================================================================

  /**
   * Simulates `emerald_ice` / `ancient_emerald_ice` / `dense_emerald_ice`
   * freezing, condensation, melting, and snow particles.
   */
  tickEmeraldIce({
    blockType = 'betterend:ancient_emerald_ice',
    lightLevel = 0,
    neighborBlock = 'minecraft:water',
    steppingEntity = null,
  }) {
    if (blockType === 'betterend:emerald_ice' && lightLevel > 11) {
      return {
        melted: true,
        newBlockType: 'minecraft:water',
        particles: [],
      };
    }

    if (blockType === 'betterend:ancient_emerald_ice') {
      let convertedNeighbor = neighborBlock;
      if (neighborBlock === 'minecraft:water') {
        convertedNeighbor = 'betterend:emerald_ice';
      } else if (neighborBlock === 'betterend:emerald_ice') {
        convertedNeighbor = 'betterend:dense_emerald_ice';
      }
      return {
        melted: false,
        convertedNeighbor,
        particles: ['betterend:snowflake', 'betterend:snow_fog'],
        entityFrozen: Boolean(steppingEntity),
      };
    }

    return {
      melted: false,
      convertedNeighbor: neighborBlock,
      particles: ['betterend:snowflake'],
      entityFrozen: false,
    };
  }

  /**
   * Simulates `betterend:brimstone` activation in water and directional
   * waterlogged `betterend:sulphur_crystal` (`age = 0..3`) growth & harvest.
   */
  tickBrimstoneAndSulphurCrystal({
    adjacentToWater = true,
    currentCrystal = null,
    facing = 'up',
  }) {
    if (!adjacentToWater) {
      return {
        brimstoneActive: false,
        crystal: currentCrystal,
      };
    }

    if (!currentCrystal) {
      return {
        brimstoneActive: true,
        crystal: {
          typeId: 'betterend:sulphur_crystal',
          age: 0,
          maxAge: 3,
          facing,
          waterlogged: true,
        },
      };
    }

    const nextAge = Math.min(3, Number(currentCrystal.age ?? 0) + 1);
    const mature = nextAge >= 3;
    return {
      brimstoneActive: true,
      crystal: {
        ...currentCrystal,
        typeId: 'betterend:sulphur_crystal',
        age: nextAge,
        maxAge: 3,
        waterlogged: true,
        mature,
      },
      harvestDrops: mature ? [{ itemId: 'betterend:crystalline_sulphur', count: 3 }] : [],
    };
  }

  /**
   * Simulates `betterend:hydrothermal_vent` spawning `betterend:vent_bubble_column`
   * upward through contiguous water blocks and boosting gliding Elytra players.
   */
  tickHydrothermalVent({
    anchor = { x: 0, y: 50, z: 0 },
    waterlogged = true,
    active = true,
    waterColumnHeight = 12,
    glidingPlayer = null,
  }) {
    const bubbleColumnPositions = [];
    if (waterlogged) {
      for (let dy = 1; dy <= waterColumnHeight; dy += 1) {
        bubbleColumnPositions.push({
          x: anchor.x,
          y: anchor.y + dy,
          z: anchor.z,
          typeId: 'betterend:vent_bubble_column',
        });
      }
    }

    let glidingUpdraft = null;
    if (glidingPlayer?.isGliding) {
      glidingUpdraft = {
        applied: true,
        vy: Math.max(0.3, Number(glidingPlayer.vy ?? 0) + 0.3),
        updraftMultiplier: 5.0,
        maxColumnReach: active ? 85 : 25,
      };
    }

    return {
      waterlogged,
      active,
      bubbleColumnPositions,
      particles: ['betterend:geyser_particle'],
      glidingUpdraft,
    };
  }

  /**
   * Executes 6-direction BFS water absorption for `betterend:menger_sponge`
   * (up to `maxAbsorbed = 64` blocks and `maxDepth = 6`), converting the sponge
   * into `betterend:menger_sponge_wet`, or instant drying in the Nether / smelter.
   */
  absorbWaterWithMengerSponge({
    origin = { x: 0, y: 64, z: 0 },
    dimension = 'minecraft:the_end',
    waterPositions = [],
    maxDepth = 6,
    maxAbsorbed = 64,
  }) {
    const normOrigin = normalizeBlockAnchor(origin);
    const normDim = normalizeDimensionId(dimension);

    if (normDim === 'minecraft:nether' || normDim === 'minecraft:the_nether') {
      return {
        spongeBlock: 'betterend:menger_sponge',
        driedInstantlyInNether: true,
        absorbedCount: 0,
        absorbedPositions: [],
      };
    }

    const waterSet = new Map();
    for (const pos of waterPositions) {
      const p = normalizeBlockAnchor(pos);
      waterSet.set(`${p.x},${p.y},${p.z}`, p);
    }

    const visited = new Set([`${normOrigin.x},${normOrigin.y},${normOrigin.z}`]);
    const queue = [{ pos: normOrigin, depth: 0 }];
    const absorbedPositions = [];

    while (queue.length > 0 && absorbedPositions.length < maxAbsorbed) {
      const { pos, depth } = queue.shift();
      if (depth >= maxDepth) continue;

      for (const dir of SIX_DIRECTIONS) {
        const nx = pos.x + dir.dx;
        const ny = pos.y + dir.dy;
        const nz = pos.z + dir.dz;
        const key = `${nx},${ny},${nz}`;
        if (visited.has(key)) continue;
        visited.add(key);

        if (waterSet.has(key)) {
          const waterBlock = waterSet.get(key);
          absorbedPositions.push(waterBlock);
          waterSet.delete(key);
          if (absorbedPositions.length >= maxAbsorbed) break;
          queue.push({ pos: waterBlock, depth: depth + 1 });
        }
      }
    }

    return {
      spongeBlock: absorbedPositions.length > 0 ? 'betterend:menger_sponge_wet' : 'betterend:menger_sponge',
      driedInstantlyInNether: false,
      absorbedCount: absorbedPositions.length,
      absorbedPositions,
      remainingWaterCount: waterSet.size,
    };
  }

  /**
   * Evaluates plant hazards & growth (`neon_cactus`, `murkweed`, `needlegrass`)
   * and bounce/cushion blocks (`hydralux_petal_block`, `jellyshroom_cap_purple`,
   * `umbrella_tree_membrane`) and `umbrella_tree_cluster` bottle harvesting.
   */
  interactWithBlockOrHazard({
    blockType,
    blockState = {},
    entity = null,
    heldItem = null,
    fallDistance = 0,
  }) {
    const id = String(blockType);

    if (id === 'betterend:neon_cactus') {
      return {
        blockType: id,
        contactDamage: 1.0,
        damageType: 'cactus',
        shapes: ['bottom', 'middle', 'top'],
        nextGrowthShapes: ['bottom', 'middle', 'top'],
        lightEmission: 15,
      };
    }

    if (id === 'betterend:murkweed') {
      const isSneaking = Boolean(entity?.isSneaking);
      return {
        blockType: id,
        blindnessApplied: !isSneaking,
        statusEffect: !isSneaking
          ? { effect: 'blindness', durationTicks: 50, amplifier: 0 }
          : null,
        particles: ['betterend:jungle_spore', 'minecraft:entity_effect'],
      };
    }

    if (id === 'betterend:needlegrass') {
      return {
        blockType: id,
        contactDamage: 0.5,
        damageType: 'cactus',
        drops: [
          { itemId: 'betterend:claw', count: 1 },
          { itemId: 'minecraft:stick', count: 1 },
        ],
      };
    }

    if (id.startsWith('betterend:hydralux_petal_block')) {
      return {
        blockType: id,
        fallDamageMultiplier: 0.0,
        negatesFallDamage: true,
        bounceVelocityY: 0.0,
      };
    }

    if (id === 'betterend:jellyshroom_cap_purple' || id === 'betterend:umbrella_tree_membrane') {
      const color = Math.max(0, Math.min(7, Number(blockState.color ?? 4)));
      const sneaking = Boolean(entity?.isSneaking);
      const bounceScale = 0.5 + (color / 7) * 0.5;
      const bounceVelocityY = sneaking
        ? 0.0
        : Number((Math.min(1.5, Math.sqrt(Math.max(1, fallDistance)) * 0.35) * bounceScale).toFixed(4));
      return {
        blockType: id,
        color,
        fallDamageMultiplier: sneaking ? 0.2 : 0.0,
        negatesFallDamage: !sneaking,
        bounceVelocityY,
      };
    }

    if (id === 'betterend:umbrella_tree_cluster') {
      const itemId = typeof heldItem === 'string' ? heldItem : heldItem?.itemId ?? heldItem?.typeId;
      if (itemId === 'minecraft:glass_bottle') {
        return {
          blockType: id,
          harvested: true,
          newBlockType: 'betterend:umbrella_tree_cluster_empty',
          preservedStates: { natural: Boolean(blockState.natural) },
          consumedItem: { itemId: 'minecraft:glass_bottle', count: 1 },
          yieldedItem: { itemId: 'betterend:umbrella_cluster_juice', count: 1 },
        };
      }
      return { blockType: id, harvested: false, reason: 'requires_glass_bottle' };
    }

    return { blockType: id };
  }

  // ============================================================================
  // 4. FLOWER POT BLOCK & PEDESTAL DISPLAY (`BLK-002`)
  // ============================================================================

  interactWithFlowerPot({
    dimension = 'minecraft:the_end',
    anchor,
    heldItem = null,
    action = 'use',
  }) {
    const key = formatAnchorKey(dimension, anchor);
    let pot = this._flowerPots.get(key);
    if (!pot) {
      pot = {
        anchorKey: key,
        soil: null,
        plant: null,
        hasSoil: false,
        empty: true,
        potLight: 0,
        lightEmission: 0,
      };
      this._flowerPots.set(key, pot);
    }

    if (action === 'break') {
      const drops = [{ itemId: 'betterend:flower_pot', count: 1 }];
      if (pot.soil) drops.push({ itemId: pot.soil, count: 1 });
      if (pot.plant) drops.push({ itemId: pot.plant, count: 1 });
      this._flowerPots.delete(key);
      return { success: true, broken: true, drops };
    }

    const itemId = typeof heldItem === 'string' ? heldItem : heldItem?.itemId ?? heldItem?.typeId ?? null;

    if (!itemId) {
      // Empty hand removes plant first, then soil
      if (pot.plant) {
        const removedPlant = pot.plant;
        pot.plant = null;
        pot.potLight = 0;
        pot.lightEmission = 0;
        return { success: true, removedItem: removedPlant, pot: { ...pot } };
      }
      if (pot.soil) {
        const removedSoil = pot.soil;
        pot.soil = null;
        pot.hasSoil = false;
        pot.empty = true;
        return { success: true, removedItem: removedSoil, pot: { ...pot } };
      }
      return { success: false, reason: 'pot_empty' };
    }

    if (!pot.hasSoil) {
      if (!POTTABLE_SOIL_BLOCKS.includes(itemId)) {
        return { success: false, reason: 'invalid_soil_block', itemId };
      }
      pot.soil = itemId;
      pot.hasSoil = true;
      pot.empty = false;
      return { success: true, stage: 'soil_inserted', pot: { ...pot } };
    }

    if (!pot.plant) {
      const plantInfo = POTTABLE_PLANTS[itemId] ?? (itemId.startsWith('betterend:') ? { light: 0 } : null);
      if (!plantInfo) {
        return { success: false, reason: 'invalid_pottable_plant', itemId };
      }
      pot.plant = itemId;
      pot.potLight = Math.min(3, Math.floor((plantInfo.light ?? 0) / 5));
      pot.lightEmission = pot.potLight * 5;
      return { success: true, stage: 'plant_inserted', pot: { ...pot } };
    }

    return { success: false, reason: 'pot_already_full' };
  }

  interactWithDisplayPedestal({
    dimension = 'minecraft:the_end',
    anchor,
    heldItem = null,
  }) {
    const key = formatAnchorKey(dimension, anchor);
    let ped = this._pedestals.get(key);
    if (!ped) {
      ped = {
        anchorKey: key,
        item: null,
        hasItem: false,
        hasLight: false,
        lightEmission: 0,
        comparatorSignal: 0,
      };
      this._pedestals.set(key, ped);
    }

    const itemId = typeof heldItem === 'string' ? heldItem : heldItem?.itemId ?? heldItem?.typeId ?? null;
    if (!ped.hasItem && itemId) {
      ped.item = { itemId, count: 1 };
      ped.hasItem = true;
      ped.hasLight = itemId === 'betterend:eternal_crystal';
      ped.lightEmission = ped.hasLight ? 12 : 0;
      ped.comparatorSignal = 15;
      return { success: true, action: 'inserted', pedestal: { ...ped } };
    }

    if (ped.hasItem) {
      const returnedItem = ped.item;
      ped.item = null;
      ped.hasItem = false;
      ped.hasLight = false;
      ped.lightEmission = 0;
      ped.comparatorSignal = 0;
      return { success: true, action: 'extracted', returnedItem, pedestal: { ...ped } };
    }

    return { success: false, reason: 'empty_hand_on_empty_pedestal' };
  }

  // ============================================================================
  // 5. `bclib:chair` SEATING (33 Stools/Chairs/Taburets) & 20 BOATS/RAFTS (`BLK-002`)
  // ============================================================================

  sitOnChair({
    dimension = 'minecraft:the_end',
    anchor,
    blockLocation,
    blockType,
    blockId,
    riderId,
    playerId,
  } = {}) {
    const id = String(blockType ?? blockId ?? '').replace(/__p\d+$/, '');
    const effAnchor = anchor ?? blockLocation ?? { x: 0, y: 64, z: 0 };
    const effRider = String(riderId ?? playerId ?? 'player_1');
    if (!this.chairBlocks.includes(id)) {
      return { seated: false, reason: 'invalid_chair_block', blockType: id };
    }

    const key = formatAnchorKey(dimension, effAnchor);
    const existingSeat = this._activeSeats.get(key);
    if (existingSeat) {
      return {
        seated: false,
        reason: 'seat_occupied',
        currentRiderId: existingSeat.riderId,
      };
    }

    const kind = id.endsWith('_bar_stool')
      ? 'bar_stool'
      : id.endsWith('_taburet')
        ? 'taburet'
        : 'chair';
    const heightOffset = CHAIR_HEIGHT_OFFSETS[kind];
    const normAnchor = normalizeBlockAnchor(effAnchor);

    const seatRecord = {
      seatEntityId: `seat_${key}`,
      anchorKey: key,
      dimension: normalizeDimensionId(dimension),
      anchor: normAnchor,
      blockType: id,
      seatKind: kind,
      heightOffset,
      riderId: effRider,
      seatPosition: {
        x: normAnchor.x + 0.5,
        y: normAnchor.y + heightOffset,
        z: normAnchor.z + 0.5,
      },
      active: true,
    };

    this._activeSeats.set(key, seatRecord);
    return {
      seated: true,
      ...JSON.parse(JSON.stringify(seatRecord)),
    };
  }

  dismountOrBreakChair({
    dimension = 'minecraft:the_end',
    anchor,
    reason = 'dismount',
  }) {
    const key = formatAnchorKey(dimension, anchor);
    const seat = this._activeSeats.get(key);
    if (!seat) {
      return { despawned: false, reason: 'no_active_seat' };
    }
    this._activeSeats.delete(key);
    return {
      despawned: true,
      reason,
      seatEntityId: seat.seatEntityId,
      formerRiderId: seat.riderId,
    };
  }

  spawnWoodBoatOrRaft({
    itemId,
    dimension = 'minecraft:the_end',
    position = { x: 0, y: 64, z: 0 },
  }) {
    const id = String(itemId);
    if (!this.boatItems.includes(id)) {
      return { spawned: false, reason: 'invalid_boat_or_raft_item', itemId: id };
    }
    const isChestVariant = id.includes('_chest_');
    const isRaft = id.endsWith('_raft');
    const boatEntityId = `boat_${this._nextEntityId++}`;
    const boat = {
      boatEntityId,
      itemId: id,
      dimension: normalizeDimensionId(dimension),
      position: { ...position },
      isRaft,
      hasChestInventory: isChestVariant,
      inventorySize: isChestVariant ? 27 : 0,
      maxPassengers: isChestVariant ? 1 : 2,
    };
    this._boats.set(boatEntityId, boat);
    return { spawned: true, boat };
  }
}

export default EcologyService;
