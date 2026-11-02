/**
 * BetterEnd Bedrock 26.40 — Equipment, Hammers, Crystalite Armor & Gliding Runtime Service (`EQP-001`)
 *
 * Implements:
 * - Exact stats for all BetterEnd tool, weapon, hammer, and armor tiers
 *   (`thallasium`, `terminite`, `aeternium`, `crystalite`)
 * - Hammer `3x3` orthogonal plane mining based on player look vector +
 *   `betterend:resonance` enchantment (`3x3x3` at Level I, `5x5x3` at Level II)
 *   with durability cost and hardness validation
 * - Knockback scaling based on hammer tier weight
 *   (`thallasium`, `iron`, `gold`, `diamond`, `terminite`, `netherite`, `aeternium`)
 * - Crystalite Armor piece effects (`mind_shield`, `vitality`, `agility`, `soft_landing`)
 *   and 4/4 full-set bonus (`crystalite_set_bonus` regeneration/absorption)
 * - Armored Elytra & Crystalite Elytra on the `minecraft:elytra` carrier with
 *   non-stackable dynamic properties (`betterend:elytra_variant`,
 *   `betterend:durability_damage`, `betterend:uid`), native gliding & rocket
 *   physics, hydrothermal vent updraft (`vy = 0.3` / `5.0x` boost), anvil repair,
 *   and identity survival across equip, flight, rockets, containers, transfer,
 *   death, and reconnect.
 *
 * Pure ES module with zero Node-specific imports.
 */

export const TOOL_TIERS = Object.freeze({
  thallasium: Object.freeze({
    id: 'thallasium',
    toolLevel: 2,
    anvilLevel: 1,
    durability: 320,
    miningSpeed: 7.0,
    attackDamageBonus: 1.5,
    enchantability: 12,
    fireproof: false,
    repairItems: Object.freeze(['betterend:thallasium_ingot', 'betterend:thallasium_forged_plate']),
    tools: Object.freeze({
      sword: Object.freeze({ attackDamage: 5.5, attackSpeed: 1.6, durability: 320 }),
      pickaxe: Object.freeze({ attackDamage: 3.5, attackSpeed: 1.2, durability: 320 }),
      axe: Object.freeze({ attackDamage: 8.5, attackSpeed: 0.9, durability: 320 }),
      shovel: Object.freeze({ attackDamage: 4.0, attackSpeed: 1.0, durability: 320 }),
      hoe: Object.freeze({ attackDamage: 0.5, attackSpeed: 3.0, durability: 320 }),
      spear: Object.freeze({ attackDamage: 4.5, attackSpeed: 1.4, durability: 320 }),
      hammer: Object.freeze({ attackDamage: 6.0, attackSpeed: 0.8, durability: 320 }),
    }),
  }),
  terminite: Object.freeze({
    id: 'terminite',
    toolLevel: 3,
    anvilLevel: 2,
    durability: 1230,
    miningSpeed: 8.5,
    attackDamageBonus: 3.5,
    enchantability: 14,
    fireproof: false,
    repairItems: Object.freeze(['betterend:terminite_ingot', 'betterend:terminite_forged_plate']),
    tools: Object.freeze({
      sword: Object.freeze({ attackDamage: 7.5, attackSpeed: 1.6, durability: 1230 }),
      pickaxe: Object.freeze({ attackDamage: 5.5, attackSpeed: 1.2, durability: 1230 }),
      axe: Object.freeze({ attackDamage: 9.5, attackSpeed: 1.0, durability: 1230 }),
      shovel: Object.freeze({ attackDamage: 6.0, attackSpeed: 1.0, durability: 1230 }),
      hoe: Object.freeze({ attackDamage: 1.5, attackSpeed: 4.0, durability: 1230 }),
      spear: Object.freeze({ attackDamage: 6.5, attackSpeed: 1.4, durability: 1230 }),
      hammer: Object.freeze({ attackDamage: 8.0, attackSpeed: 0.9, durability: 1230 }),
    }),
  }),
  aeternium: Object.freeze({
    id: 'aeternium',
    toolLevel: 5,
    anvilLevel: 5,
    durability: 2196,
    miningSpeed: 10.0,
    attackDamageBonus: 4.5,
    enchantability: 18,
    fireproof: true,
    repairItems: Object.freeze(['betterend:aeternium_ingot', 'betterend:aeternium_forged_plate']),
    tools: Object.freeze({
      sword: Object.freeze({ attackDamage: 8.5, attackSpeed: 1.6, durability: 2196 }),
      pickaxe: Object.freeze({ attackDamage: 6.5, attackSpeed: 1.2, durability: 2196 }),
      axe: Object.freeze({ attackDamage: 10.5, attackSpeed: 1.0, durability: 2196 }),
      shovel: Object.freeze({ attackDamage: 7.0, attackSpeed: 1.0, durability: 2196 }),
      hoe: Object.freeze({ attackDamage: 1.5, attackSpeed: 4.0, durability: 2196 }),
      spear: Object.freeze({ attackDamage: 7.5, attackSpeed: 1.4, durability: 2196 }),
      hammer: Object.freeze({ attackDamage: 10.0, attackSpeed: 1.0, durability: 2196 }),
    }),
  }),
});

export const HAMMER_TIER_STATS = Object.freeze({
  thallasium: Object.freeze({
    id: 'betterend:thallasium_hammer',
    tier: 'thallasium',
    toolLevel: 2,
    durability: 320,
    miningSpeed: 7.0,
    attackDamage: 6.0,
    attackSpeed: 0.8,
    weight: 1.0,
    knockbackBonus: 0.15,
    knockbackScale: 1.15,
    fireproof: false,
  }),
  iron: Object.freeze({
    id: 'betterend:iron_hammer',
    tier: 'iron',
    toolLevel: 2,
    durability: 250,
    miningSpeed: 6.0,
    attackDamage: 6.0,
    attackSpeed: 0.8,
    weight: 1.1,
    knockbackBonus: 0.2,
    knockbackScale: 1.25,
    fireproof: false,
  }),
  gold: Object.freeze({
    id: 'betterend:golden_hammer',
    tier: 'gold',
    toolLevel: 0,
    durability: 32,
    miningSpeed: 12.0,
    attackDamage: 4.0,
    attackSpeed: 0.6,
    weight: 1.25,
    knockbackBonus: 0.3,
    knockbackScale: 1.35,
    fireproof: false,
  }),
  diamond: Object.freeze({
    id: 'betterend:diamond_hammer',
    tier: 'diamond',
    toolLevel: 3,
    durability: 1561,
    miningSpeed: 8.0,
    attackDamage: 7.0,
    attackSpeed: 0.9,
    weight: 1.4,
    knockbackBonus: 0.35,
    knockbackScale: 1.45,
    fireproof: false,
  }),
  terminite: Object.freeze({
    id: 'betterend:terminite_hammer',
    tier: 'terminite',
    toolLevel: 3,
    durability: 1230,
    miningSpeed: 8.5,
    attackDamage: 8.0,
    attackSpeed: 0.9,
    weight: 1.55,
    knockbackBonus: 0.45,
    knockbackScale: 1.6,
    fireproof: false,
  }),
  netherite: Object.freeze({
    id: 'betterend:netherite_hammer',
    tier: 'netherite',
    toolLevel: 4,
    durability: 2031,
    miningSpeed: 9.0,
    attackDamage: 8.0,
    attackSpeed: 1.0,
    weight: 1.75,
    knockbackBonus: 0.55,
    knockbackScale: 1.8,
    fireproof: true,
  }),
  aeternium: Object.freeze({
    id: 'betterend:aeternium_hammer',
    tier: 'aeternium',
    toolLevel: 5,
    durability: 2196,
    miningSpeed: 10.0,
    attackDamage: 10.0,
    attackSpeed: 1.0,
    weight: 2.0,
    knockbackBonus: 0.7,
    knockbackScale: 2.0,
    fireproof: true,
  }),
});

export const ARMOR_TIERS = Object.freeze({
  thallasium: Object.freeze({
    id: 'thallasium',
    durabilityFactor: 16,
    durability: Object.freeze({ helmet: 176, chestplate: 256, leggings: 240, boots: 208 }),
    defense: Object.freeze({ helmet: 2, chestplate: 5, leggings: 4, boots: 1, total: 12 }),
    toughness: 0.0,
    knockbackResistance: 0.0,
    enchantability: 17,
    fireproof: false,
    repairItems: Object.freeze(['betterend:thallasium_ingot', 'betterend:thallasium_forged_plate']),
  }),
  terminite: Object.freeze({
    id: 'terminite',
    durabilityFactor: 25,
    durability: Object.freeze({ helmet: 275, chestplate: 400, leggings: 375, boots: 325 }),
    defense: Object.freeze({ helmet: 3, chestplate: 7, leggings: 6, boots: 3, total: 19 }),
    toughness: 1.0,
    knockbackResistance: 0.05,
    enchantability: 26,
    fireproof: false,
    repairItems: Object.freeze(['betterend:terminite_ingot', 'betterend:terminite_forged_plate']),
  }),
  crystalite: Object.freeze({
    id: 'crystalite',
    durabilityFactor: 33,
    durability: Object.freeze({ helmet: 363, chestplate: 528, leggings: 495, boots: 429 }),
    defense: Object.freeze({ helmet: 3, chestplate: 8, leggings: 7, boots: 3, total: 21 }),
    toughness: 3.2,
    knockbackResistance: 0.1,
    enchantability: 30,
    fireproof: true,
    repairItems: Object.freeze(['betterend:amber_gem', 'betterend:crystal_shards']),
    pieceEffects: Object.freeze({
      helmet: 'mind_shield',
      chestplate: 'vitality',
      leggings: 'agility',
      boots: 'soft_landing',
      fullSet: 'crystalite_set_bonus',
    }),
  }),
  aeternium: Object.freeze({
    id: 'aeternium',
    durabilityFactor: 42,
    durability: Object.freeze({ helmet: 462, chestplate: 672, leggings: 630, boots: 546 }),
    defense: Object.freeze({ helmet: 4, chestplate: 9, leggings: 7, boots: 4, total: 24 }),
    toughness: 3.5,
    knockbackResistance: 0.2,
    enchantability: 40,
    fireproof: true,
    repairItems: Object.freeze(['betterend:aeternium_ingot', 'betterend:aeternium_forged_plate']),
  }),
});

export const ELYTRA_VARIANTS = Object.freeze({
  armored: Object.freeze({
    variant: 'armored',
    id: 'betterend:elytra_armored',
    carrierTypeId: 'minecraft:elytra',
    defense: 6,
    toughness: 1,
    durability: 850,
    vanillaCarrierDurability: 432,
    movementFactor: 0.985,
    repairItem: 'betterend:aeternium_ingot',
    acceptedRepairItems: Object.freeze([
      'betterend:aeternium_ingot',
      'betterend:aeternium_forged_plate',
      'minecraft:phantom_membrane',
    ]),
    fireproof: true,
    healthRegen: false,
    countsAsCrystaliteChest: false,
  }),
  crystalite: Object.freeze({
    variant: 'crystalite',
    id: 'betterend:elytra_crystalite',
    carrierTypeId: 'minecraft:elytra',
    defense: 6,
    toughness: 3,
    durability: 950,
    vanillaCarrierDurability: 432,
    movementFactor: 0.99,
    repairItem: 'betterend:amber_gem',
    acceptedRepairItems: Object.freeze([
      'betterend:amber_gem',
      'betterend:enchanted_membrane',
    ]),
    fireproof: true,
    healthRegen: true,
    countsAsCrystaliteChest: true,
  }),
});

export const ELYTRA_DYNAMIC_PROPERTY_KEYS = Object.freeze({
  VARIANT: 'betterend:elytra_variant',
  DURABILITY_DAMAGE: 'betterend:durability_damage',
  UID: 'betterend:uid',
});

const MIND_SHIELD_BLOCKED_EFFECTS = new Set(['blindness', 'minecraft:blindness', 'darkness', 'minecraft:darkness', 'nausea', 'minecraft:nausea']);

export function resolveHammerStats(hammerOrTier) {
  if (!hammerOrTier) return null;
  if (typeof hammerOrTier === 'string') {
    const clean = hammerOrTier
      .replace(/^betterend:/, '')
      .replace(/_hammer$/, '')
      .replace(/^golden$/, 'gold');
    return HAMMER_TIER_STATS[clean] ?? null;
  }
  if (typeof hammerOrTier === 'object') {
    if (hammerOrTier.tier && HAMMER_TIER_STATS[hammerOrTier.tier]) {
      return HAMMER_TIER_STATS[hammerOrTier.tier];
    }
    const id = hammerOrTier.itemId ?? hammerOrTier.typeId ?? hammerOrTier.id;
    if (typeof id === 'string') return resolveHammerStats(id);
  }
  return null;
}

export function resolvePrimaryLookAxis(lookVector = { x: 0, y: 0, z: 1 }) {
  const vx = Number(lookVector?.x ?? 0);
  const vy = Number(lookVector?.y ?? 0);
  const vz = Number(lookVector?.z ?? 0);
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  const az = Math.abs(vz);

  if (ay >= ax && ay >= az) {
    return {
      primaryAxis: 'y',
      planeAxes: ['x', 'z'],
      forwardSign: vy >= 0 ? 1 : -1,
    };
  }
  if (ax >= ay && ax >= az) {
    return {
      primaryAxis: 'x',
      planeAxes: ['y', 'z'],
      forwardSign: vx >= 0 ? 1 : -1,
    };
  }
  return {
    primaryAxis: 'z',
    planeAxes: ['x', 'y'],
    forwardSign: vz >= 0 ? 1 : -1,
  };
}

/**
 * Computes the list of block coordinates targeted by a BetterEnd Hammer strike:
 * - Base Hammer (Resonance 0): `3x3` (`3x3x1`) orthogonal plane perpendicular to look vector (9 blocks)
 * - Resonance Level I: `3x3x3` volume extending 3 layers along look vector (27 blocks)
 * - Resonance Level II: `5x5x3` volume (`5x5` plane × `3` depth layers = 75 blocks)
 * - Sneaking: `1x1x1` (single origin block)
 */
export function computeHammerAoePositions(origin, lookVector = { x: 0, y: 0, z: 1 }, resonanceLevel = 0, isSneaking = false) {
  const ox = Math.floor(Number(origin.x));
  const oy = Math.floor(Number(origin.y));
  const oz = Math.floor(Number(origin.z));

  if (isSneaking) {
    return {
      dimensions: { width: 1, height: 1, depth: 1 },
      positions: [{ x: ox, y: oy, z: oz }],
    };
  }

  const clampedResonance = Math.max(0, Math.min(2, Math.floor(Number(resonanceLevel) || 0)));
  const planeRadius = clampedResonance >= 2 ? 2 : 1; // 3x3 for lvl 0/1, 5x5 for lvl 2
  const depthCount = clampedResonance >= 1 ? 3 : 1; // 1 for lvl 0, 3 for lvl 1/2

  const { primaryAxis, planeAxes, forwardSign } = resolvePrimaryLookAxis(lookVector);
  const [axisU, axisV] = planeAxes;
  const positions = [];

  for (let d = 0; d < depthCount; d += 1) {
    for (let u = -planeRadius; u <= planeRadius; u += 1) {
      for (let v = -planeRadius; v <= planeRadius; v += 1) {
        const pos = { x: ox, y: oy, z: oz };
        pos[axisU] += u;
        pos[axisV] += v;
        pos[primaryAxis] += d * forwardSign;
        positions.push(pos);
      }
    }
  }

  const width = planeRadius * 2 + 1;
  return {
    primaryAxis,
    planeAxes,
    forwardSign,
    dimensions: {
      width,
      height: width,
      depth: depthCount,
    },
    positions,
  };
}

/**
 * Authoritative runtime service for BetterEnd Equipment (`EQP-001`).
 */
export class EquipmentService {
  constructor(options = {}) {
    this._nextUidCounter = 1;
    this.toolTiers = TOOL_TIERS;
    this.hammerTiers = HAMMER_TIER_STATS;
    this.armorTiers = ARMOR_TIERS;
    this.elytraVariants = ELYTRA_VARIANTS;
    this.options = options;
  }

  getToolTier(tierName) {
    return this.toolTiers[String(tierName).toLowerCase()] ?? null;
  }

  getArmorTier(tierName) {
    return this.armorTiers[String(tierName).toLowerCase()] ?? null;
  }

  getHammerStats(hammerOrTier) {
    return resolveHammerStats(hammerOrTier);
  }

  /**
   * Executes Hammer AoE mining (`3x3` base, `3x3x3` at Resonance I, `5x5x3` at Resonance II)
   * with block hardness, mining-level validation, and durability consumption.
   */
  mineWithHammer({
    hammer,
    origin,
    lookVector = { x: 0, y: 0, z: 1 },
    resonanceLevel = null,
    isSneaking = false,
    getBlock = null,
    breakBlock = null,
  }) {
    const stats = resolveHammerStats(hammer) ?? HAMMER_TIER_STATS.iron;
    const resolvedResonance =
      resonanceLevel !== null && resonanceLevel !== undefined
        ? Number(resonanceLevel)
        : Number(
            hammer?.enchantments?.['betterend:resonance'] ??
              hammer?.enchantments?.resonance ??
              0,
          );

    const aoe = computeHammerAoePositions(origin, lookVector, resolvedResonance, isSneaking);
    const maxDurability = Number(hammer?.maxDurability ?? stats.durability);
    const currentDamage = Number(hammer?.damage ?? 0);
    const remainingDurability =
      hammer?.remainingDurability !== undefined
        ? Number(hammer.remainingDurability)
        : Math.max(0, maxDurability - currentDamage);

    if (remainingDurability <= 0) {
      return {
        success: false,
        reason: 'broken_hammer',
        minedBlocks: [],
        skippedBlocks: aoe.positions,
        dimensions: aoe.dimensions,
        durabilityCost: 0,
        remainingDurability: 0,
        toolBroken: true,
      };
    }

    const originBlock = typeof getBlock === 'function'
      ? getBlock(origin)
      : { typeId: 'minecraft:end_stone', hardness: 3.0, requiredToolLevel: 0, mineable: true };
    const originHardness = Number(originBlock?.hardness ?? 3.0);

    const minedBlocks = [];
    const skippedBlocks = [];

    for (const pos of aoe.positions) {
      const block = typeof getBlock === 'function'
        ? getBlock(pos)
        : { ...originBlock, x: pos.x, y: pos.y, z: pos.z };

      if (!block || block.typeId === 'minecraft:air' || block.isAir) {
        skippedBlocks.push({ ...pos, reason: 'air' });
        continue;
      }

      const hardness = Number(block.hardness ?? 1.5);
      const requiredToolLevel = Number(block.requiredToolLevel ?? 0);
      const maxAllowedHardness = Math.max(originHardness * 5, 50.0);

      if (hardness < 0 || block.unbreakable) {
        skippedBlocks.push({ ...pos, typeId: block.typeId, reason: 'unbreakable' });
        continue;
      }
      if (requiredToolLevel > stats.toolLevel) {
        skippedBlocks.push({
          ...pos,
          typeId: block.typeId,
          reason: 'insufficient_tool_level',
          requiredToolLevel,
          toolLevel: stats.toolLevel,
        });
        continue;
      }
      if (hardness > maxAllowedHardness) {
        skippedBlocks.push({ ...pos, typeId: block.typeId, reason: 'hardness_exceeded' });
        continue;
      }
      if (block.mineable === false) {
        skippedBlocks.push({ ...pos, typeId: block.typeId, reason: 'not_mineable_by_hammer' });
        continue;
      }

      if (typeof breakBlock === 'function') {
        breakBlock(pos, block);
      }
      minedBlocks.push({ ...pos, typeId: block.typeId ?? 'minecraft:end_stone', hardness });
    }

    const durabilityCost = minedBlocks.length > 0 ? 1 : 0;
    const newRemainingDurability = Math.max(0, remainingDurability - durabilityCost);
    const newDamage = maxDurability - newRemainingDurability;
    const toolBroken = newRemainingDurability <= 0;

    return {
      success: true,
      hammerId: stats.id,
      tier: stats.tier,
      resonanceLevel: Math.max(0, Math.min(2, resolvedResonance)),
      dimensions: aoe.dimensions,
      minedBlocks,
      skippedBlocks,
      durabilityCost,
      damage: newDamage,
      remainingDurability: newRemainingDurability,
      toolBroken,
    };
  }

  /**
   * Computes scaled knockback for a BetterEnd Hammer based on tier weight
   * (`thallasium`, `iron`, `gold`, `diamond`, `terminite`, `netherite`, `aeternium`).
   */
  computeHammerKnockback({
    hammer,
    baseKnockback = 0.4,
    direction = { x: 0, z: 1 },
    targetKnockbackResistance = 0,
  }) {
    const stats = resolveHammerStats(hammer);
    if (!stats) {
      throw new Error(`Unknown hammer tier: ${JSON.stringify(hammer)}`);
    }
    const resistanceFactor = Math.max(0, 1 - Number(targetKnockbackResistance || 0));
    const horizontalStrength =
      (Number(baseKnockback) + stats.knockbackBonus) * stats.weight * resistanceFactor;
    const dx = Number(direction?.x ?? 0);
    const dz = Number(direction?.z ?? 1);
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;

    return {
      hammerId: stats.id,
      tier: stats.tier,
      weight: stats.weight,
      knockbackBonus: stats.knockbackBonus,
      knockbackScale: stats.knockbackScale,
      horizontalStrength: Number(horizontalStrength.toFixed(4)),
      verticalStrength: Number((0.4 * resistanceFactor).toFixed(4)),
      impulse: {
        x: Number((nx * horizontalStrength).toFixed(4)),
        y: Number((0.4 * resistanceFactor).toFixed(4)),
        z: Number((nz * horizontalStrength).toFixed(4)),
      },
    };
  }

  /**
   * Evaluates Crystalite Armor piece effects and 4/4 full-set bonus:
   * - Helmet: `mind_shield` status immunity (clears/blocks `blindness`, `darkness`, `nausea`)
   * - Chestplate (or Crystalite Elytra): `vitality` regeneration / haste
   * - Leggings: `agility` movement boost (+speed & +4 max health)
   * - Boots: `soft_landing` fall damage reduction
   * - 4/4 Full Set: `crystalite_set_bonus` (regeneration + absorption)
   */
  evaluateCrystaliteArmor({
    equipment = {},
    activeEffects = [],
    incomingFallDamage = 0,
  } = {}) {
    const headId = this._extractItemId(equipment.head ?? equipment.helmet);
    const chestStack = equipment.chest ?? equipment.chestplate;
    const chestId = this._extractItemId(chestStack);
    const legsId = this._extractItemId(equipment.legs ?? equipment.leggings);
    const feetId = this._extractItemId(equipment.feet ?? equipment.boots);

    const isCrystaliteElytraCarrier =
      chestStack?.dynamicProperties?.[ELYTRA_DYNAMIC_PROPERTY_KEYS.VARIANT] === 'crystalite' ||
      chestId === 'betterend:elytra_crystalite';

    const hasHelmet = headId === 'betterend:crystalite_helmet';
    const hasChestplate = chestId === 'betterend:crystalite_chestplate' || isCrystaliteElytraCarrier;
    const hasLeggings = legsId === 'betterend:crystalite_leggings';
    const hasBoots = feetId === 'betterend:crystalite_boots';

    const pieceCount =
      (hasHelmet ? 1 : 0) +
      (hasChestplate ? 1 : 0) +
      (hasLeggings ? 1 : 0) +
      (hasBoots ? 1 : 0);
    const hasFullSet = pieceCount === 4;

    const activePieceEffects = [];
    const grantedStatusEffects = [];
    const cancelledEffects = [];

    if (hasHelmet) {
      activePieceEffects.push('mind_shield');
      for (const eff of activeEffects) {
        const effName = typeof eff === 'string' ? eff : eff?.typeId ?? eff?.id;
        if (effName && MIND_SHIELD_BLOCKED_EFFECTS.has(effName)) {
          cancelledEffects.push(effName);
        }
      }
    }

    if (hasChestplate) {
      activePieceEffects.push('vitality');
      grantedStatusEffects.push(
        { effect: 'regeneration', amplifier: 0, durationTicks: 80, source: 'vitality' },
        { effect: 'haste', amplifier: 0, durationTicks: 80, source: 'vitality' },
      );
    }

    if (hasLeggings) {
      activePieceEffects.push('agility');
      grantedStatusEffects.push({ effect: 'speed', amplifier: 0, durationTicks: 80, source: 'agility' });
    }

    let adjustedFallDamage = Number(incomingFallDamage) || 0;
    if (hasBoots) {
      activePieceEffects.push('soft_landing');
      adjustedFallDamage = Math.max(0, Number((adjustedFallDamage * 0.25).toFixed(4)));
    }

    if (hasFullSet) {
      activePieceEffects.push('crystalite_set_bonus');
      grantedStatusEffects.push(
        { effect: 'regeneration', amplifier: 1, durationTicks: 100, source: 'crystalite_set_bonus' },
        { effect: 'absorption', amplifier: 0, durationTicks: 100, source: 'crystalite_set_bonus' },
      );
    }

    return {
      pieceCount,
      hasFullSet,
      pieces: {
        helmet: hasHelmet,
        chestplate: hasChestplate,
        leggings: hasLeggings,
        boots: hasBoots,
      },
      activePieceEffects,
      mindShieldActive: hasHelmet,
      vitalityActive: hasChestplate,
      agilityActive: hasLeggings,
      softLandingActive: hasBoots,
      crystaliteSetBonusActive: hasFullSet,
      movementSpeedMultiplier: hasLeggings ? 1.2 : 1.0,
      maxHealthBonus: hasLeggings ? 4 : 0,
      cancelledEffects,
      grantedStatusEffects,
      incomingFallDamage: Number(incomingFallDamage) || 0,
      adjustedFallDamage,
    };
  }

  _extractItemId(stackOrId) {
    if (!stackOrId) return null;
    if (typeof stackOrId === 'string') return stackOrId;
    return stackOrId.itemId ?? stackOrId.typeId ?? stackOrId.id ?? null;
  }

  // ============================================================================
  // ARMORED ELYTRA & CRYSTALITE ELYTRA (`minecraft:elytra` Carrier)
  // ============================================================================

  /**
   * Creates a non-stackable `minecraft:elytra` carrier stack with BetterEnd
   * dynamic properties (`betterend:elytra_variant`, `betterend:durability_damage`, `betterend:uid`).
   */
  createElytraCarrier(variant = 'armored', options = {}) {
    const cleanVariant = String(variant)
      .replace(/^betterend:elytra_/, '')
      .replace(/^betterend:/, '')
      .toLowerCase();
    const spec = this.elytraVariants[cleanVariant];
    if (!spec) {
      throw new Error(`Unsupported BetterEnd Elytra variant: ${variant}`);
    }

    const uid = options.uid ?? `be_elytra_${cleanVariant}_${this._nextUidCounter++}`;
    const damage = Math.max(0, Math.min(spec.durability, Math.floor(Number(options.damage ?? 0))));
    const vanillaDamage = this._mapCustomDamageToVanillaCarrier(damage, spec.durability, spec.vanillaCarrierDurability);

    return {
      typeId: 'minecraft:elytra',
      itemId: spec.id,
      carrierTypeId: 'minecraft:elytra',
      maxAmount: 1,
      maxStackSize: 1,
      isStackable: false,
      variant: spec.variant,
      defense: spec.defense,
      toughness: spec.toughness,
      maxDurability: spec.durability,
      damage,
      remainingDurability: spec.durability - damage,
      vanillaCarrierDamage: vanillaDamage,
      movementFactor: spec.movementFactor,
      repairItem: spec.repairItem,
      fireproof: spec.fireproof,
      healthRegen: spec.healthRegen,
      enchantments: options.enchantments ? JSON.parse(JSON.stringify(options.enchantments)) : {},
      components: options.components ? JSON.parse(JSON.stringify(options.components)) : {},
      dynamicProperties: {
        [ELYTRA_DYNAMIC_PROPERTY_KEYS.VARIANT]: spec.variant,
        [ELYTRA_DYNAMIC_PROPERTY_KEYS.DURABILITY_DAMAGE]: damage,
        [ELYTRA_DYNAMIC_PROPERTY_KEYS.UID]: uid,
      },
    };
  }

  _mapCustomDamageToVanillaCarrier(customDamage, customMax, vanillaMax = 432) {
    if (customDamage <= 0) return 0;
    if (customDamage >= customMax - 1) return vanillaMax - 1;
    return Math.min(vanillaMax - 2, Math.floor((customDamage / customMax) * (vanillaMax - 1)));
  }

  /**
   * Reads and validates a BetterEnd Elytra carrier's dynamic properties.
   */
  inspectElytraCarrier(carrierStack) {
    if (!carrierStack || typeof carrierStack !== 'object') return null;
    const dyn = carrierStack.dynamicProperties ?? {};
    const variantKey =
      dyn[ELYTRA_DYNAMIC_PROPERTY_KEYS.VARIANT] ??
      carrierStack.variant ??
      (carrierStack.itemId === 'betterend:elytra_crystalite'
        ? 'crystalite'
        : carrierStack.itemId === 'betterend:elytra_armored'
          ? 'armored'
          : null);
    if (!variantKey || !this.elytraVariants[variantKey]) return null;

    const spec = this.elytraVariants[variantKey];
    const damage = Number(dyn[ELYTRA_DYNAMIC_PROPERTY_KEYS.DURABILITY_DAMAGE] ?? carrierStack.damage ?? 0);
    const uid = dyn[ELYTRA_DYNAMIC_PROPERTY_KEYS.UID] ?? null;
    const remainingDurability = Math.max(0, spec.durability - damage);

    return {
      isValidCarrier: carrierStack.typeId === 'minecraft:elytra' || carrierStack.carrierTypeId === 'minecraft:elytra',
      variant: spec.variant,
      id: spec.id,
      uid,
      defense: spec.defense,
      toughness: spec.toughness,
      maxDurability: spec.durability,
      damage,
      remainingDurability,
      canGlide: remainingDurability > 1,
      movementFactor: spec.movementFactor,
      repairItem: spec.repairItem,
      healthRegen: spec.healthRegen,
      enchantments: carrierStack.enchantments ? { ...carrierStack.enchantments } : {},
      dynamicProperties: { ...dyn },
    };
  }

  /**
   * Simulates a tick or interval of native Elytra gliding, firework rocket boost,
   * and optional hydrothermal vent updraft (`vy = 0.3` / `5.0x` updraft boost).
   */
  tickElytraFlight({
    carrier,
    velocity = { x: 0, y: -0.05, z: 0.8 },
    flightTicks = 20,
    fireworkRocketUsed = false,
    overHydrothermalVent = false,
    ventActive = true,
    distanceAboveVent = 5,
  }) {
    const info = this.inspectElytraCarrier(carrier);
    if (!info) {
      throw new Error('Invalid BetterEnd Elytra carrier stack');
    }
    if (!info.canGlide) {
      return {
        gliding: false,
        reason: 'elytra_unusable_at_1_durability',
        carrier: JSON.parse(JSON.stringify(carrier)),
        velocity: { ...velocity },
      };
    }

    const spec = this.elytraVariants[info.variant];
    const unbreakingLevel = Number(info.enchantments['minecraft:unbreaking'] ?? info.enchantments.unbreaking ?? 0);
    // 1 durability per 20 flight ticks, reduced by Unbreaking
    const rawFlightDamage = Math.floor(Number(flightTicks) / 20);
    const effectiveDamage =
      unbreakingLevel > 0 ? Math.ceil(rawFlightDamage / (unbreakingLevel + 1)) : rawFlightDamage;

    const newDamage = Math.min(spec.durability - 1, info.damage + effectiveDamage);
    const updatedCarrier = this.createElytraCarrier(spec.variant, {
      uid: info.uid,
      damage: newDamage,
      enchantments: info.enchantments,
      components: carrier.components,
    });

    let vx = Number(velocity.x ?? 0) * spec.movementFactor;
    let vy = Number(velocity.y ?? -0.05);
    let vz = Number(velocity.z ?? 0) * spec.movementFactor;

    if (fireworkRocketUsed) {
      const horizLen = Math.hypot(vx, vz) || 1;
      vx = (vx / horizLen) * 1.5 * spec.movementFactor;
      vz = (vz / horizLen) * 1.5 * spec.movementFactor;
      vy = Math.max(vy + 0.35, 0.5);
    }

    let updraftBoostMultiplier = 1.0;
    if (overHydrothermalVent) {
      const maxColumnHeight = ventActive ? 85 : 25;
      if (distanceAboveVent >= 0 && distanceAboveVent <= maxColumnHeight) {
        updraftBoostMultiplier = 5.0;
        vy = Math.max(0.3, vy + 0.3);
      }
    }

    return {
      gliding: true,
      nativeBedrockGliding: true,
      fireworkRocketApplied: Boolean(fireworkRocketUsed),
      hydrothermalUpdraftApplied: Boolean(overHydrothermalVent && updraftBoostMultiplier > 1.0),
      updraftBoostMultiplier,
      velocity: {
        x: Number(vx.toFixed(4)),
        y: Number(vy.toFixed(4)),
        z: Number(vz.toFixed(4)),
      },
      healthRegenActive: spec.healthRegen,
      carrier: updatedCarrier,
    };
  }

  /**
   * Computes custom armor & toughness damage reduction for Armored / Crystalite Elytra.
   */
  computeElytraDamageMitigation(carrier, rawIncomingDamage) {
    const info = this.inspectElytraCarrier(carrier);
    if (!info) {
      return { rawDamage: rawIncomingDamage, mitigatedDamage: rawIncomingDamage, reductionFraction: 0 };
    }
    const defense = info.defense;
    const toughness = info.toughness;
    const dmg = Math.max(0, Number(rawIncomingDamage) || 0);
    // Standard armor + toughness formula: min(20, max(defense / 5, defense - 4 * dmg / (toughness + 8))) / 25
    const effectivePoints = Math.min(
      20,
      Math.max(defense / 5, defense - (4 * dmg) / (toughness + 8)),
    );
    const reductionFraction = effectivePoints / 25;
    const mitigatedDamage = Number((dmg * (1 - reductionFraction)).toFixed(4));
    return {
      variant: info.variant,
      defense,
      toughness,
      rawDamage: dmg,
      mitigatedDamage,
      reductionFraction: Number(reductionFraction.toFixed(4)),
    };
  }

  /**
   * Repairs an Armored or Crystalite Elytra carrier on an anvil using its
   * designated repair material (`betterend:aeternium_ingot` or `betterend:amber_gem`),
   * preserving `betterend:uid`, `betterend:elytra_variant`, and enchantments.
   */
  repairElytraOnAnvil({
    carrier,
    material,
    isBetterEndAnvil = true,
  }) {
    const info = this.inspectElytraCarrier(carrier);
    if (!info) {
      return { success: false, reason: 'invalid_elytra_carrier' };
    }
    const spec = this.elytraVariants[info.variant];
    const matId = this._extractItemId(material);
    const matCount = Number(material?.count ?? material?.amount ?? 0);

    if (!matId || !spec.acceptedRepairItems.includes(matId) || matCount <= 0) {
      return {
        success: false,
        reason: 'invalid_repair_material',
        expectedRepairItem: spec.repairItem,
        actualRepairItem: matId,
      };
    }

    if (info.damage <= 0) {
      return { success: false, reason: 'already_fully_repaired' };
    }

    const repairPerUnit = Math.floor(spec.durability / 4);
    const unitsNeeded = Math.ceil(info.damage / repairPerUnit);
    const vanillaUnits = Math.min(matCount, unitsNeeded);
    const materialCost = isBetterEndAnvil && vanillaUnits > 1 ? Math.max(1, vanillaUnits - 1) : vanillaUnits;
    const newDamage = Math.max(0, info.damage - vanillaUnits * repairPerUnit);

    const repairedCarrier = this.createElytraCarrier(spec.variant, {
      uid: info.uid,
      damage: newDamage,
      enchantments: info.enchantments,
      components: carrier.components,
    });

    return {
      success: true,
      variant: spec.variant,
      uid: info.uid,
      previousDamage: info.damage,
      newDamage,
      vanillaItemCountCost: vanillaUnits,
      materialCost,
      remainingMaterialCount: matCount - materialCost,
      carrier: repairedCarrier,
    };
  }

  /**
   * Transfers or recovers a BetterEnd Elytra carrier across equip, container
   * storage, player-to-player transfer, death drop/pickup, or server reconnect,
   * asserting 100% survival of its non-stackable dynamic properties.
   */
  transferElytraCarrier(carrier, operation = 'container_transfer') {
    const info = this.inspectElytraCarrier(carrier);
    if (!info || !info.uid) {
      throw new Error(`Carrier identity missing during ${operation}`);
    }
    const cloned = this.createElytraCarrier(info.variant, {
      uid: info.uid,
      damage: info.damage,
      enchantments: info.enchantments,
      components: carrier.components,
    });
    cloned.lastLifecycleOperation = operation;
    return cloned;
  }
}

export default EquipmentService;
