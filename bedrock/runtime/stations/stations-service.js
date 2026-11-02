/**
 * BetterEnd Bedrock 26.40 — Workstations & Rituals Runtime Service (`STA-001`, `STA-002`)
 *
 * Implements:
 * - End Stone Smelter (`bclib:alloying` + 1-input `minecraft:smelting`/`minecraft:blasting` fallback)
 * - Leveled & Aeternium Anvils (`bclib:smithing` + vanilla repair/combine with 1-unit cost reduction)
 * - Infusion Pedestal & 8-Pedestal Ritual (`betterend:infusion` with durable receipts & quarantine)
 * - Eternal Pedestal & 6-Pedestal Eternal Portal Ritual
 *
 * Pure ES module with zero Node-specific imports.
 */

import {
  PersistenceStore,
  TRANSACTION_STATES,
  formatAnchorKey,
  normalizeBlockAnchor,
  normalizeDimensionId,
} from '../persistence/store.js';

export const SMELTER_FUEL_REGISTRY = Object.freeze({
  'minecraft:coal_block': Object.freeze({ burnTime: 16000, speedMultiplier: 1.0, remainder: null }),
  'minecraft:blaze_rod': Object.freeze({ burnTime: 2400, speedMultiplier: 1.5, remainder: null }),
  'minecraft:lava_bucket': Object.freeze({
    burnTime: 20000,
    speedMultiplier: 2.0,
    remainder: 'minecraft:bucket',
  }),
  'betterend:charcoal_end': Object.freeze({ burnTime: 3200, speedMultiplier: 1.25, remainder: null }),
  'betterend:charcoal_block': Object.freeze({ burnTime: 16000, speedMultiplier: 1.25, remainder: null }),
  'betterend:amber_gem': Object.freeze({ burnTime: 3200, speedMultiplier: 1.5, remainder: null }),
  'minecraft:coal': Object.freeze({ burnTime: 1600, speedMultiplier: 1.0, remainder: null }),
  'minecraft:charcoal': Object.freeze({ burnTime: 1600, speedMultiplier: 1.0, remainder: null }),
  'minecraft:dried_kelp_block': Object.freeze({ burnTime: 4000, speedMultiplier: 1.0, remainder: null }),
});

export const ANVIL_LEVELS = Object.freeze({
  vanilla: 1,
  thallasium: 1,
  terminite: 2,
  aeternium: 5,
  'minecraft:anvil': 1,
  'minecraft:chipped_anvil': 1,
  'minecraft:damaged_anvil': 1,
  'betterend:thallasium_anvil': 1,
  'betterend:terminite_anvil': 2,
  'betterend:aeternium_anvil': 5,
});

export const DIGGER_TOOL_LEVELS = Object.freeze({
  wood: 0,
  wooden: 0,
  gold: 0,
  golden: 0,
  stone: 1,
  iron: 2,
  thallasium: 2,
  diamond: 3,
  terminite: 3,
  netherite: 4,
  crystalite: 4,
  aeternium: 5,
});

export const ALLOWED_TOOL_TAG_LEVELS = Object.freeze({
  'betterend:anvil_tool/iron': 2,
  'betterend:anvil_tool/diamond': 3,
  'betterend:anvil_tool/netherite': 4,
});

export const ITEM_TAG_MEMBERS = Object.freeze({
  'betterend:alloying_copper': Object.freeze([
    'minecraft:copper_ore',
    'minecraft:deepslate_copper_ore',
    'minecraft:raw_copper',
  ]),
  'betterend:alloying_gold': Object.freeze([
    'minecraft:gold_ore',
    'minecraft:deepslate_gold_ore',
    'minecraft:raw_gold',
  ]),
  'betterend:alloying_iron': Object.freeze([
    'minecraft:iron_ore',
    'minecraft:deepslate_iron_ore',
    'minecraft:raw_iron',
  ]),
  'betterend:thallasium_alloying': Object.freeze([
    'betterend:thallasium_ore',
    'betterend:thallasium_raw',
  ]),
});

export const INFUSION_COMPASS_OFFSETS = Object.freeze({
  north: Object.freeze([0, -3]),
  north_east: Object.freeze([2, -2]),
  east: Object.freeze([3, 0]),
  south_east: Object.freeze([2, 2]),
  south: Object.freeze([0, 3]),
  south_west: Object.freeze([-2, 2]),
  west: Object.freeze([-3, 0]),
  north_west: Object.freeze([-2, -2]),
});

export const INFUSION_COMPASS_ORDER = Object.freeze([
  'north',
  'north_east',
  'east',
  'south_east',
  'south',
  'south_west',
  'west',
  'north_west',
]);

export const ETERNAL_PORTAL_PEDESTAL_OFFSETS = Object.freeze([
  Object.freeze([-4, -5]),
  Object.freeze([-4, 5]),
  Object.freeze([-6, 0]),
  Object.freeze([4, -5]),
  Object.freeze([4, 5]),
  Object.freeze([6, 0]),
]);

export const ETERNAL_PORTAL_FRAME_OFFSETS = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([0, 6]),
  Object.freeze([-1, 0]),
  Object.freeze([1, 0]),
  Object.freeze([-1, 6]),
  Object.freeze([1, 6]),
  Object.freeze([-2, 1]),
  Object.freeze([2, 1]),
  Object.freeze([-2, 5]),
  Object.freeze([2, 5]),
  Object.freeze([-3, 2]),
  Object.freeze([3, 2]),
  Object.freeze([-3, 3]),
  Object.freeze([3, 3]),
  Object.freeze([-3, 4]),
  Object.freeze([3, 4]),
]);

export const ETERNAL_PORTAL_INTERIOR_OFFSETS = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([0, 1]),
  Object.freeze([0, 2]),
  Object.freeze([0, 3]),
  Object.freeze([0, 4]),
  Object.freeze([-1, 0]),
  Object.freeze([-1, 1]),
  Object.freeze([-1, 2]),
  Object.freeze([-1, 3]),
  Object.freeze([-1, 4]),
  Object.freeze([1, 0]),
  Object.freeze([1, 1]),
  Object.freeze([1, 2]),
  Object.freeze([1, 3]),
  Object.freeze([1, 4]),
  Object.freeze([-2, 1]),
  Object.freeze([-2, 2]),
  Object.freeze([-2, 3]),
  Object.freeze([2, 1]),
  Object.freeze([2, 2]),
  Object.freeze([2, 3]),
]);

export const DEFAULT_ALLOYING_RECIPES = Object.freeze([
  {
    id: 'betterend:additional_copper',
    type: 'bclib:alloying',
    ingredients: ['#betterend:alloying_copper', '#betterend:alloying_copper'],
    result: { item: 'minecraft:copper_ingot', count: 3 },
    smeltTime: 350,
    experience: 3.0,
  },
  {
    id: 'betterend:additional_gold',
    type: 'bclib:alloying',
    ingredients: ['#betterend:alloying_gold', '#betterend:alloying_gold'],
    result: { item: 'minecraft:gold_ingot', count: 3 },
    smeltTime: 350,
    experience: 3.0,
  },
  {
    id: 'betterend:additional_iron',
    type: 'bclib:alloying',
    ingredients: ['#betterend:alloying_iron', '#betterend:alloying_iron'],
    result: { item: 'minecraft:iron_ingot', count: 3 },
    smeltTime: 350,
    experience: 2.1,
  },
  {
    id: 'betterend:additional_netherite',
    type: 'bclib:alloying',
    ingredients: ['minecraft:ancient_debris', 'minecraft:ancient_debris'],
    result: { item: 'minecraft:netherite_scrap', count: 3 },
    smeltTime: 1000,
    experience: 6.0,
  },
  {
    id: 'betterend:aeternium_ingot',
    type: 'bclib:alloying',
    ingredients: ['betterend:terminite_ingot', 'minecraft:netherite_ingot'],
    result: { item: 'betterend:aeternium_ingot', count: 1 },
    smeltTime: 850,
    experience: 4.5,
  },
  {
    id: 'betterend:terminite_ingot',
    type: 'bclib:alloying',
    ingredients: ['minecraft:iron_ingot', 'betterend:ender_dust'],
    result: { item: 'betterend:terminite_ingot', count: 1 },
    smeltTime: 450,
    experience: 2.5,
  },
  {
    id: 'betterend:terminite_ingot_thallasium',
    type: 'bclib:alloying',
    ingredients: ['betterend:thallasium_ingot', 'betterend:ender_dust'],
    result: { item: 'betterend:terminite_ingot', count: 1 },
    smeltTime: 450,
    experience: 2.5,
  },
  {
    id: 'betterend:thallasium_ingot_alloy',
    type: 'bclib:alloying',
    ingredients: ['#betterend:thallasium_alloying', '#betterend:thallasium_alloying'],
    result: { item: 'betterend:thallasium_ingot', count: 3 },
    smeltTime: 350,
    experience: 2.1,
  },
]);

export const DEFAULT_SINGLE_INPUT_SMELTER_RECIPES = Object.freeze([
  {
    id: 'betterend:thallasium_ingot_furnace_ore_blasting',
    type: 'minecraft:blasting',
    ingredient: 'betterend:thallasium_ore',
    result: { item: 'betterend:thallasium_ingot', count: 1 },
    cookingTime: 100,
    experience: 0.7,
  },
  {
    id: 'betterend:thallasium_ingot_furnace_raw_blasting',
    type: 'minecraft:blasting',
    ingredient: 'betterend:thallasium_raw',
    result: { item: 'betterend:thallasium_ingot', count: 1 },
    cookingTime: 100,
    experience: 0.7,
  },
  {
    id: 'betterend:end_stone_brick_cracked_blasting',
    type: 'minecraft:blasting',
    ingredient: 'minecraft:end_stone_bricks',
    result: { item: 'betterend:end_stone_brick_cracked', count: 1 },
    cookingTime: 100,
    experience: 0.1,
  },
  {
    id: 'betterend:end_glass_smelting',
    type: 'minecraft:smelting',
    ingredient: 'betterend:endstone_dust',
    result: { item: 'minecraft:glass', count: 1 },
    cookingTime: 200,
    experience: 0.1,
  },
  {
    id: 'betterend:menger_sponge_smelting',
    type: 'minecraft:smelting',
    ingredient: 'betterend:menger_sponge_wet',
    result: { item: 'betterend:menger_sponge', count: 1 },
    cookingTime: 200,
    experience: 0.15,
  },
  {
    id: 'betterend:end_fish_smelting',
    type: 'minecraft:smelting',
    ingredient: 'betterend:end_fish_raw',
    result: { item: 'betterend:end_fish_cooked', count: 1 },
    cookingTime: 200,
    experience: 0.35,
  },
  {
    id: 'betterend:end_berry_smelting',
    type: 'minecraft:smelting',
    ingredient: 'betterend:shadow_berry_raw',
    result: { item: 'betterend:shadow_berry_cooked', count: 1 },
    cookingTime: 200,
    experience: 0.35,
  },
  {
    id: 'betterend:bolux_mushroom_smelting',
    type: 'minecraft:smelting',
    ingredient: 'betterend:bolux_mushroom',
    result: { item: 'betterend:bolux_mushroom_cooked', count: 1 },
    cookingTime: 200,
    experience: 0.35,
  },
  {
    id: 'betterend:chorus_mushroom_smelting',
    type: 'minecraft:smelting',
    ingredient: 'betterend:chorus_mushroom_raw',
    result: { item: 'betterend:chorus_mushroom_cooked', count: 1 },
    cookingTime: 200,
    experience: 0.35,
  },
  {
    id: 'betterend:end_lily_leaf_dried_smelting',
    type: 'minecraft:smelting',
    ingredient: 'betterend:end_lily_leaf',
    result: { item: 'betterend:end_lily_leaf_dried', count: 1 },
    cookingTime: 200,
    experience: 0.1,
  },
  {
    id: 'betterend:slime_ball_smelting',
    type: 'minecraft:smelting',
    ingredient: 'betterend:jellyshroom_cap_purple',
    result: { item: 'minecraft:slime_ball', count: 1 },
    cookingTime: 200,
    experience: 0.2,
  },
  {
    id: 'minecraft:iron_ingot_from_smelting_raw_iron',
    type: 'minecraft:smelting',
    ingredient: 'minecraft:raw_iron',
    result: { item: 'minecraft:iron_ingot', count: 1 },
    cookingTime: 200,
    experience: 0.7,
  },
  {
    id: 'minecraft:iron_ingot_from_smelting_iron_ore',
    type: 'minecraft:smelting',
    ingredient: 'minecraft:iron_ore',
    result: { item: 'minecraft:iron_ingot', count: 1 },
    cookingTime: 200,
    experience: 0.7,
  },
  {
    id: 'minecraft:gold_ingot_from_smelting_raw_gold',
    type: 'minecraft:smelting',
    ingredient: 'minecraft:raw_gold',
    result: { item: 'minecraft:gold_ingot', count: 1 },
    cookingTime: 200,
    experience: 1.0,
  },
]);

export const DEFAULT_SMITHING_RECIPES = Object.freeze([
  { id: 'betterend:ender_pearl_to_dust', type: 'bclib:smithing', input: 'minecraft:ender_pearl', inputCount: 1, anvilLevel: 1, toolLevel: 2, allowedTools: 'betterend:anvil_tool/iron', damage: 5, result: { item: 'betterend:ender_dust', count: 1 } },
  { id: 'betterend:ender_shard_to_dust', type: 'bclib:smithing', input: 'betterend:ender_shard', inputCount: 1, anvilLevel: 1, toolLevel: 2, allowedTools: 'betterend:anvil_tool/iron', damage: 3, result: { item: 'betterend:ender_dust', count: 1 } },
  { id: 'betterend:thallasium_forged_plate', type: 'bclib:smithing', input: 'betterend:thallasium_ingot', inputCount: 1, anvilLevel: 1, toolLevel: 2, allowedTools: 'betterend:anvil_tool/iron', damage: 2, result: { item: 'betterend:thallasium_forged_plate', count: 1 } },
  { id: 'betterend:thallasium_axe_head', type: 'bclib:smithing', input: 'betterend:thallasium_ingot', inputCount: 3, anvilLevel: 1, toolLevel: 2, allowedTools: 'betterend:anvil_tool/iron', damage: 2, result: { item: 'betterend:thallasium_axe_head', count: 1 } },
  { id: 'betterend:thallasium_pickaxe_head', type: 'bclib:smithing', input: 'betterend:thallasium_ingot', inputCount: 3, anvilLevel: 1, toolLevel: 2, allowedTools: 'betterend:anvil_tool/iron', damage: 2, result: { item: 'betterend:thallasium_pickaxe_head', count: 1 } },
  { id: 'betterend:thallasium_hammer_head', type: 'bclib:smithing', input: 'betterend:thallasium_ingot', inputCount: 3, anvilLevel: 1, toolLevel: 2, allowedTools: 'betterend:anvil_tool/iron', damage: 2, result: { item: 'betterend:thallasium_hammer_head', count: 1 } },
  { id: 'betterend:thallasium_sword_blade', type: 'bclib:smithing', input: 'betterend:thallasium_ingot', inputCount: 2, anvilLevel: 1, toolLevel: 2, allowedTools: 'betterend:anvil_tool/iron', damage: 2, result: { item: 'betterend:thallasium_sword_blade', count: 1 } },
  { id: 'betterend:thallasium_spear_tip', type: 'bclib:smithing', input: 'betterend:thallasium_ingot', inputCount: 2, anvilLevel: 1, toolLevel: 2, allowedTools: 'betterend:anvil_tool/iron', damage: 2, result: { item: 'betterend:thallasium_spear_tip', count: 1 } },
  { id: 'betterend:thallasium_hoe_head', type: 'bclib:smithing', input: 'betterend:thallasium_ingot', inputCount: 1, anvilLevel: 1, toolLevel: 2, allowedTools: 'betterend:anvil_tool/iron', damage: 2, result: { item: 'betterend:thallasium_hoe_head', count: 1 } },
  { id: 'betterend:thallasium_shovel_head', type: 'bclib:smithing', input: 'betterend:thallasium_ingot', inputCount: 1, anvilLevel: 1, toolLevel: 2, allowedTools: 'betterend:anvil_tool/iron', damage: 2, result: { item: 'betterend:thallasium_shovel_head', count: 1 } },
  { id: 'betterend:terminite_forged_plate', type: 'bclib:smithing', input: 'betterend:terminite_ingot', inputCount: 1, anvilLevel: 2, toolLevel: 3, allowedTools: 'betterend:anvil_tool/diamond', damage: 3, result: { item: 'betterend:terminite_forged_plate', count: 1 } },
  { id: 'betterend:terminite_axe_head', type: 'bclib:smithing', input: 'betterend:terminite_ingot', inputCount: 3, anvilLevel: 2, toolLevel: 3, allowedTools: 'betterend:anvil_tool/diamond', damage: 3, result: { item: 'betterend:terminite_axe_head', count: 1 } },
  { id: 'betterend:terminite_pickaxe_head', type: 'bclib:smithing', input: 'betterend:terminite_ingot', inputCount: 3, anvilLevel: 2, toolLevel: 3, allowedTools: 'betterend:anvil_tool/diamond', damage: 3, result: { item: 'betterend:terminite_pickaxe_head', count: 1 } },
  { id: 'betterend:terminite_hammer_head', type: 'bclib:smithing', input: 'betterend:terminite_ingot', inputCount: 3, anvilLevel: 2, toolLevel: 3, allowedTools: 'betterend:anvil_tool/diamond', damage: 3, result: { item: 'betterend:terminite_hammer_head', count: 1 } },
  { id: 'betterend:terminite_sword_blade', type: 'bclib:smithing', input: 'betterend:terminite_ingot', inputCount: 2, anvilLevel: 2, toolLevel: 3, allowedTools: 'betterend:anvil_tool/diamond', damage: 3, result: { item: 'betterend:terminite_sword_blade', count: 1 } },
  { id: 'betterend:terminite_spear_tip', type: 'bclib:smithing', input: 'betterend:terminite_ingot', inputCount: 2, anvilLevel: 2, toolLevel: 3, allowedTools: 'betterend:anvil_tool/diamond', damage: 3, result: { item: 'betterend:terminite_spear_tip', count: 1 } },
  { id: 'betterend:terminite_hoe_head', type: 'bclib:smithing', input: 'betterend:terminite_ingot', inputCount: 1, anvilLevel: 2, toolLevel: 3, allowedTools: 'betterend:anvil_tool/diamond', damage: 3, result: { item: 'betterend:terminite_hoe_head', count: 1 } },
  { id: 'betterend:terminite_shovel_head', type: 'bclib:smithing', input: 'betterend:terminite_ingot', inputCount: 1, anvilLevel: 2, toolLevel: 3, allowedTools: 'betterend:anvil_tool/diamond', damage: 3, result: { item: 'betterend:terminite_shovel_head', count: 1 } },
  { id: 'betterend:aeternium_forged_plate', type: 'bclib:smithing', input: 'betterend:aeternium_ingot', inputCount: 1, anvilLevel: 5, toolLevel: 4, allowedTools: 'betterend:anvil_tool/netherite', damage: 6, result: { item: 'betterend:aeternium_forged_plate', count: 1 } },
  { id: 'betterend:aeternium_axe_head', type: 'bclib:smithing', input: 'betterend:aeternium_ingot', inputCount: 1, anvilLevel: 5, toolLevel: 4, allowedTools: 'betterend:anvil_tool/netherite', damage: 6, result: { item: 'betterend:aeternium_axe_head', count: 1 } },
  { id: 'betterend:aeternium_pickaxe_head', type: 'bclib:smithing', input: 'betterend:aeternium_ingot', inputCount: 1, anvilLevel: 5, toolLevel: 4, allowedTools: 'betterend:anvil_tool/netherite', damage: 6, result: { item: 'betterend:aeternium_pickaxe_head', count: 1 } },
  { id: 'betterend:aeternium_hammer_head', type: 'bclib:smithing', input: 'betterend:aeternium_ingot', inputCount: 1, anvilLevel: 5, toolLevel: 4, allowedTools: 'betterend:anvil_tool/netherite', damage: 6, result: { item: 'betterend:aeternium_hammer_head', count: 1 } },
  { id: 'betterend:aeternium_hoe_head', type: 'bclib:smithing', input: 'betterend:aeternium_ingot', inputCount: 1, anvilLevel: 5, toolLevel: 4, allowedTools: 'betterend:anvil_tool/netherite', damage: 6, result: { item: 'betterend:aeternium_hoe_head', count: 1 } },
  { id: 'betterend:aeternium_shovel_head', type: 'bclib:smithing', input: 'betterend:aeternium_ingot', inputCount: 1, anvilLevel: 5, toolLevel: 4, allowedTools: 'betterend:anvil_tool/netherite', damage: 6, result: { item: 'betterend:aeternium_shovel_head', count: 1 } },
  { id: 'betterend:aeternium_sword_blade', type: 'bclib:smithing', input: 'betterend:aeternium_ingot', inputCount: 1, anvilLevel: 5, toolLevel: 3, allowedTools: 'betterend:anvil_tool/diamond', damage: 6, result: { item: 'betterend:aeternium_sword_blade', count: 1 } },
  { id: 'betterend:aeternium_spear_tip', type: 'bclib:smithing', input: 'betterend:aeternium_ingot', inputCount: 1, anvilLevel: 5, toolLevel: 3, allowedTools: 'betterend:anvil_tool/diamond', damage: 6, result: { item: 'betterend:aeternium_spear_tip', count: 1 } },
]);

const ENCHANTED_BOOK_INFUSIONS = [
  ['aqua_affinity_book', 'minecraft:aqua_affinity', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:prismarine_crystals', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:prismarine_crystals', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:prismarine_crystals', north_west: 'minecraft:lapis_lazuli' }],
  ['bane_of_arthropods_book', 'minecraft:bane_of_arthropods', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:fermented_spider_eye', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:iron_ingot', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:fermented_spider_eye', north_west: 'minecraft:lapis_lazuli' }],
  ['blast_protection_book', 'minecraft:blast_protection', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:obsidian', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:obsidian', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:obsidian', north_west: 'minecraft:lapis_lazuli' }],
  ['channeling_book', 'minecraft:channeling', 375, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:iron_chain', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:heart_of_the_sea', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:iron_chain', north_west: 'minecraft:lapis_lazuli' }],
  ['depth_strider_book', 'minecraft:depth_strider', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:lily_pad', south_east: 'minecraft:lapis_lazuli', south: 'betterend:end_lily_seed', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:lily_pad', north_west: 'minecraft:lapis_lazuli' }],
  ['efficiency_book', 'minecraft:efficiency', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'betterend:amber_gem', south_east: 'minecraft:lapis_lazuli', south: 'betterend:amber_gem', south_west: 'minecraft:lapis_lazuli', west: 'betterend:amber_gem', north_west: 'minecraft:lapis_lazuli' }],
  ['end_veil_book', 'betterend:end_veil', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'betterend:ender_dust', south_east: 'minecraft:lapis_lazuli', south: 'betterend:ender_shard', south_west: 'minecraft:lapis_lazuli', west: 'betterend:ender_dust', north_west: 'minecraft:lapis_lazuli' }],
  ['feather_falling_book', 'minecraft:feather_falling', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:feather', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:feather', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:feather', north_west: 'minecraft:lapis_lazuli' }],
  ['fire_aspect_book', 'minecraft:fire_aspect', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:blaze_powder', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:magma_cream', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:blaze_powder', north_west: 'minecraft:lapis_lazuli' }],
  ['fire_protection_book', 'minecraft:fire_protection', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:blaze_rod', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:blaze_rod', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:blaze_rod', north_west: 'minecraft:lapis_lazuli' }],
  ['flame_book', 'minecraft:flame', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:blaze_powder', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:spectral_arrow', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:blaze_powder', north_west: 'minecraft:lapis_lazuli' }],
  ['fortune_book', 'minecraft:fortune', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:emerald', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:rabbit_foot', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:emerald', north_west: 'minecraft:lapis_lazuli' }],
  ['frost_walker_book', 'minecraft:frost_walker', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', south_east: 'minecraft:lapis_lazuli', south: 'betterend:ancient_emerald_ice', south_west: 'minecraft:lapis_lazuli', north_west: 'minecraft:lapis_lazuli' }],
  ['impaling_book', 'minecraft:impaling', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:prismarine_shard', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:iron_sword', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:prismarine_shard', north_west: 'minecraft:lapis_lazuli' }],
  ['infinity_book', 'minecraft:infinity', 375, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:spectral_arrow', south_east: 'minecraft:lapis_lazuli', south: 'betterend:eternal_crystal', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:spectral_arrow', north_west: 'minecraft:lapis_lazuli' }],
  ['knockback_book', 'minecraft:knockback', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:redstone', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:piston', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:redstone', north_west: 'minecraft:lapis_lazuli' }],
  ['looting_book', 'minecraft:looting', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:emerald', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:gold_ingot', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:emerald', north_west: 'minecraft:lapis_lazuli' }],
  ['loyalty_book', 'minecraft:loyalty', 375, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:ender_eye', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:heart_of_the_sea', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:ender_eye', north_west: 'minecraft:lapis_lazuli' }],
  ['luck_of_sea_book', 'minecraft:luck_of_the_sea', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:emerald', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:fishing_rod', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:emerald', north_west: 'minecraft:lapis_lazuli' }],
  ['lunge_book', 'minecraft:lunge', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:rabbit_foot', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:rabbit_foot', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:rabbit_foot', north_west: 'minecraft:lapis_lazuli' }],
  ['lure_book', 'minecraft:lure', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:gold_nugget', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:fishing_rod', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:gold_nugget', north_west: 'minecraft:lapis_lazuli' }],
  ['mending_book', 'minecraft:mending', 375, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:experience_bottle', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:anvil', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:experience_bottle', north_west: 'minecraft:lapis_lazuli' }],
  ['multishot_book', 'minecraft:multishot', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:arrow', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:spectral_arrow', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:arrow', north_west: 'minecraft:lapis_lazuli' }],
  ['piercing_book', 'minecraft:piercing', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:glowstone_dust', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:spectral_arrow', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:glowstone_dust', north_west: 'minecraft:lapis_lazuli' }],
  ['power_book', 'minecraft:power', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'betterend:amber_gem', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:diamond_sword', south_west: 'minecraft:lapis_lazuli', west: 'betterend:amber_gem', north_west: 'minecraft:lapis_lazuli' }],
  ['projectile_protection_book', 'minecraft:projectile_protection', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:turtle_scute', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:shield', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:turtle_scute', north_west: 'minecraft:lapis_lazuli' }],
  ['protection_book', 'minecraft:protection', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:turtle_helmet', south_west: 'minecraft:lapis_lazuli', north_west: 'minecraft:lapis_lazuli' }],
  ['punch_book', 'minecraft:punch', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:popped_chorus_fruit', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:spectral_arrow', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:popped_chorus_fruit', north_west: 'minecraft:lapis_lazuli' }],
  ['quick_charge_book', 'minecraft:quick_charge', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:quartz', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:glowstone_dust', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:quartz', north_west: 'minecraft:lapis_lazuli' }],
  ['resonance_1_book', 'betterend:resonance', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:echo_shard', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:echo_shard', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:echo_shard', north_west: 'minecraft:lapis_lazuli' }],
  ['respiration_book', 'minecraft:respiration', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:nautilus_shell', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:nautilus_shell', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:nautilus_shell', north_west: 'minecraft:lapis_lazuli' }],
  ['riptide_book', 'minecraft:riptide', 375, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:lead', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:heart_of_the_sea', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:lead', north_west: 'minecraft:lapis_lazuli' }],
  ['sharpness_book', 'minecraft:sharpness', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:netherite_scrap', south_west: 'minecraft:lapis_lazuli', north_west: 'minecraft:lapis_lazuli' }],
  ['silk_touch_book', 'minecraft:silk_touch', 375, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:cobweb', south_east: 'minecraft:lapis_lazuli', south: 'betterend:eternal_crystal', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:cobweb', north_west: 'minecraft:lapis_lazuli' }],
  ['smite_book', 'minecraft:smite', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:sunflower', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:gold_ingot', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:sunflower', north_west: 'minecraft:lapis_lazuli' }],
  ['soul_speed_book', 'minecraft:soul_speed', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: ['minecraft:soul_sand', 'minecraft:soul_soil'], south_east: 'minecraft:lapis_lazuli', south: ['minecraft:soul_sand', 'minecraft:soul_soil'], south_west: 'minecraft:lapis_lazuli', west: ['minecraft:soul_sand', 'minecraft:soul_soil'], north_west: 'minecraft:lapis_lazuli' }],
  ['sweeping_book', 'minecraft:sweeping_edge', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:golden_sword', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:iron_sword', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:golden_sword', north_west: 'minecraft:lapis_lazuli' }],
  ['swift_sneak_book', 'minecraft:swift_sneak', 500, { north: 'betterend:eternal_crystal', north_east: 'minecraft:sculk_vein', east: 'minecraft:sculk_sensor', south_east: 'betterend:enchanted_petal', south: 'minecraft:sculk_catalyst', south_west: 'betterend:enchanted_petal', west: 'minecraft:sculk_sensor', north_west: 'minecraft:sculk_vein' }],
  ['thorns_book', 'minecraft:thorns', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:cactus', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:cactus', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:cactus', north_west: 'minecraft:lapis_lazuli' }],
  ['unbreaking_book', 'minecraft:unbreaking', 300, { north: 'betterend:enchanted_petal', north_east: 'minecraft:lapis_lazuli', east: 'minecraft:diamond', south_east: 'minecraft:lapis_lazuli', south: 'minecraft:diamond', south_west: 'minecraft:lapis_lazuli', west: 'minecraft:diamond', north_west: 'minecraft:lapis_lazuli' }],
];

export const DEFAULT_INFUSION_RECIPES = Object.freeze([
  {
    id: 'betterend:enchanted_petal',
    type: 'betterend:infusion',
    input: 'betterend:hydralux_petal',
    catalysts: {
      north: 'betterend:crystal_shards',
      east: 'betterend:crystal_shards',
      south: 'betterend:crystal_shards',
      west: 'betterend:crystal_shards',
    },
    result: { item: 'betterend:enchanted_petal', count: 1 },
    time: 75,
  },
  {
    id: 'betterend:enchanted_membrane',
    type: 'betterend:infusion',
    input: 'minecraft:phantom_membrane',
    catalysts: {
      north: 'betterend:crystal_shards',
      east: 'betterend:crystal_shards',
      south: 'betterend:crystal_shards',
      west: 'betterend:crystal_shards',
    },
    result: { item: 'betterend:enchanted_membrane', count: 1 },
    time: 75,
  },
  {
    id: 'betterend:runed_flavolite',
    type: 'betterend:infusion',
    input: 'betterend:flavolite_polished',
    catalysts: {
      north: 'betterend:crystal_shards',
      east: 'betterend:crystal_shards',
      south: 'betterend:crystal_shards',
      west: 'betterend:crystal_shards',
    },
    result: { item: 'betterend:flavolite_runed', count: 1 },
    time: 100,
  },
  {
    id: 'betterend:eternal_crystal',
    type: 'betterend:infusion',
    input: 'minecraft:end_crystal',
    catalysts: {
      north: 'betterend:crystal_shards',
      north_east: 'betterend:ender_shard',
      east: 'betterend:crystal_shards',
      south_east: 'betterend:ender_shard',
      south: 'betterend:crystal_shards',
      south_west: 'betterend:ender_shard',
      west: 'betterend:crystal_shards',
      north_west: 'betterend:ender_shard',
    },
    result: { item: 'betterend:eternal_crystal', count: 1 },
    time: 250,
  },
  {
    id: 'betterend:crystalite_helmet',
    type: 'betterend:infusion',
    input: 'betterend:terminite_helmet',
    catalysts: {
      north: 'betterend:amber_gem',
      east: 'betterend:crystal_shards',
      west: 'betterend:crystal_shards',
    },
    result: { item: 'betterend:crystalite_helmet', count: 1 },
    time: 150,
  },
  {
    id: 'betterend:crystalite_chestplate',
    type: 'betterend:infusion',
    input: 'betterend:terminite_chestplate',
    catalysts: {
      north: 'betterend:amber_gem',
      north_east: 'betterend:crystal_shards',
      south_east: 'betterend:crystal_shards',
      south_west: 'betterend:crystal_shards',
      north_west: 'betterend:crystal_shards',
    },
    result: { item: 'betterend:crystalite_chestplate', count: 1 },
    time: 300,
  },
  {
    id: 'betterend:crystalite_leggings',
    type: 'betterend:infusion',
    input: 'betterend:terminite_leggings',
    catalysts: {
      north: 'betterend:amber_gem',
      east: 'betterend:crystal_shards',
      south: 'betterend:crystal_shards',
      west: 'betterend:crystal_shards',
    },
    result: { item: 'betterend:crystalite_leggings', count: 1 },
    time: 225,
  },
  {
    id: 'betterend:crystalite_boots',
    type: 'betterend:infusion',
    input: 'betterend:terminite_boots',
    catalysts: {
      north: 'betterend:amber_gem',
      east: 'betterend:crystal_shards',
      west: 'betterend:crystal_shards',
    },
    result: { item: 'betterend:crystalite_boots', count: 1 },
    time: 150,
  },
  {
    id: 'betterend:crystalite_elytra',
    type: 'betterend:infusion',
    input: 'minecraft:elytra',
    catalysts: {
      north: 'betterend:amber_gem',
      north_east: 'betterend:crystal_shards',
      east: 'betterend:enchanted_membrane',
      south_east: 'betterend:crystal_shards',
      south: 'betterend:enchanted_membrane',
      south_west: 'betterend:crystal_shards',
      west: 'betterend:enchanted_membrane',
      north_west: 'betterend:crystal_shards',
    },
    result: { item: 'betterend:elytra_crystalite', count: 1 },
    time: 500,
  },
  ...ENCHANTED_BOOK_INFUSIONS.map(([name, enchantId, time, catalysts]) => ({
    id: `betterend:${name}`,
    type: 'betterend:infusion',
    group: 'enchantment',
    input: 'minecraft:book',
    catalysts,
    result: {
      item: 'minecraft:enchanted_book',
      count: 1,
      components: {
        'minecraft:stored_enchantments': {
          [enchantId]: 1,
        },
      },
    },
    time,
  })),
]);

function cloneItem(stack) {
  if (!stack || typeof stack !== 'object') return null;
  const itemId = stack.itemId ?? stack.typeId ?? stack.id ?? stack.item;
  const count = Number(stack.count ?? stack.amount ?? 1);
  if (!itemId || count <= 0) return null;
  const cloned = {
    itemId,
    count,
    maxStackSize: Number(stack.maxStackSize ?? 64),
  };
  if (stack.damage !== undefined) cloned.damage = Number(stack.damage) || 0;
  if (stack.maxDurability !== undefined) cloned.maxDurability = Number(stack.maxDurability);
  if (stack.remainingDurability !== undefined) cloned.remainingDurability = Number(stack.remainingDurability);
  if (stack.tier !== undefined) cloned.tier = stack.tier;
  if (stack.toolLevel !== undefined) cloned.toolLevel = Number(stack.toolLevel);
  if (stack.components) cloned.components = JSON.parse(JSON.stringify(stack.components));
  if (stack.dynamicProperties) cloned.dynamicProperties = JSON.parse(JSON.stringify(stack.dynamicProperties));
  if (stack.enchantments) cloned.enchantments = JSON.parse(JSON.stringify(stack.enchantments));
  if (stack.customName !== undefined) cloned.customName = stack.customName;
  if (stack.lore) cloned.lore = [...stack.lore];
  return cloned;
}

function sameItemAndComponents(a, b) {
  if (!a || !b) return false;
  const idA = a.itemId ?? a.typeId ?? a.id ?? a.item;
  const idB = b.itemId ?? b.typeId ?? b.id ?? b.item;
  if (idA !== idB) return false;
  const compA = JSON.stringify(a.components ?? {});
  const compB = JSON.stringify(b.components ?? {});
  const dynA = JSON.stringify(a.dynamicProperties ?? {});
  const dynB = JSON.stringify(b.dynamicProperties ?? {});
  return compA === compB && dynA === dynB;
}

export function matchesIngredientPredicate(predicate, itemStack, tagMap = ITEM_TAG_MEMBERS) {
  const stack = cloneItem(itemStack);
  if (!predicate) {
    return stack === null;
  }
  if (!stack) {
    return false;
  }
  const itemId = stack.itemId;
  if (typeof predicate === 'string') {
    if (predicate.startsWith('#')) {
      const tagId = predicate.slice(1);
      const members = tagMap[tagId] ?? [];
      return members.includes(itemId);
    }
    return itemId === predicate;
  }
  if (Array.isArray(predicate)) {
    return predicate.some(entry => matchesIngredientPredicate(entry, stack, tagMap));
  }
  if (typeof predicate === 'object') {
    if (predicate.tag) {
      const members = tagMap[predicate.tag.replace(/^#/, '')] ?? [];
      return members.includes(itemId);
    }
    if (predicate.item || predicate.id) {
      return itemId === (predicate.item ?? predicate.id);
    }
  }
  return false;
}

export function resolveAnvilLevel(anvilOrLevel) {
  if (typeof anvilOrLevel === 'number') return anvilOrLevel;
  if (typeof anvilOrLevel === 'string') {
    if (Object.hasOwn(ANVIL_LEVELS, anvilOrLevel)) return ANVIL_LEVELS[anvilOrLevel];
    const shortName = anvilOrLevel.replace(/^betterend:/, '').replace(/_anvil$/, '');
    if (Object.hasOwn(ANVIL_LEVELS, shortName)) return ANVIL_LEVELS[shortName];
  }
  if (anvilOrLevel && typeof anvilOrLevel === 'object') {
    if (typeof anvilOrLevel.anvilLevel === 'number') return anvilOrLevel.anvilLevel;
    if (typeof anvilOrLevel.level === 'number') return anvilOrLevel.level;
    if (typeof anvilOrLevel.typeId === 'string') return resolveAnvilLevel(anvilOrLevel.typeId);
  }
  return 1;
}

export function resolveDiggerToolLevel(toolStack) {
  if (!toolStack || typeof toolStack !== 'object') return -1;
  if (typeof toolStack.toolLevel === 'number') return toolStack.toolLevel;
  if (typeof toolStack.tier === 'string' && Object.hasOwn(DIGGER_TOOL_LEVELS, toolStack.tier.toLowerCase())) {
    return DIGGER_TOOL_LEVELS[toolStack.tier.toLowerCase()];
  }
  const itemId = String(toolStack.itemId ?? toolStack.typeId ?? toolStack.id ?? '');
  const bare = itemId.includes(':') ? itemId.split(':')[1] : itemId;
  for (const [tierName, level] of Object.entries(DIGGER_TOOL_LEVELS)) {
    if (bare.startsWith(`${tierName}_`)) {
      return level;
    }
  }
  return 0;
}

/**
 * Authoritative runtime service for BetterEnd stations & rituals (`STA-001`, `STA-002`).
 */
export class StationsService {
  constructor(options = {}) {
    this.store = options.store ?? new PersistenceStore({ world: options.world });
    this.fuelRegistry = {
      ...SMELTER_FUEL_REGISTRY,
      ...(options.fuelRegistry ?? {}),
    };
    this.tagMap = {
      ...ITEM_TAG_MEMBERS,
      ...(options.tagMap ?? {}),
    };
    this.alloyingRecipes = [...DEFAULT_ALLOYING_RECIPES, ...(options.alloyingRecipes ?? [])];
    this.singleInputSmelterRecipes = [
      ...DEFAULT_SINGLE_INPUT_SMELTER_RECIPES,
      ...(options.singleInputSmelterRecipes ?? []),
    ];
    this.smithingRecipes = [...DEFAULT_SMITHING_RECIPES, ...(options.smithingRecipes ?? [])];
    this.infusionRecipes = [...DEFAULT_INFUSION_RECIPES, ...(options.infusionRecipes ?? [])];

    // Live runtime state caches keyed by anchorKey
    this._smelters = new Map();
    this._pedestals = new Map();
    this._infusionRituals = new Map();
    this._eternalPortals = new Map();
  }

  // ============================================================================
  // 1. END STONE SMELTER (`STA-001`)
  // ============================================================================

  createSmelter({ dimension = 'minecraft:the_end', anchor, slots = {} }) {
    const station = this.store.registerStation({
      dimension,
      anchor,
      stationType: 'betterend:end_stone_smelter',
      state: {
        availableHeat: 0,
        maxHeat: 0,
        speedMultiplier: 1.0,
        progress: 0,
        smeltTime: 0,
        activeRecipeId: null,
        activeMode: null,
        storedXp: 0,
        pausedReason: null,
      },
    });
    const smelterState = {
      stationId: station.stationId,
      generationId: station.generationId,
      dimension: station.dimension,
      anchor: station.anchor,
      anchorKey: station.anchorKey,
      input0: cloneItem(slots.input0 ?? null),
      input1: cloneItem(slots.input1 ?? null),
      fuel: cloneItem(slots.fuel ?? null),
      output: cloneItem(slots.output ?? null),
      availableHeat: 0,
      maxHeat: 0,
      speedMultiplier: 1.0,
      progress: 0,
      smeltTime: 0,
      activeRecipeId: null,
      activeMode: null,
      storedXp: 0,
      recipeCraftCounts: {},
      pausedReason: null,
    };
    this._smelters.set(station.anchorKey, smelterState);
    return this.getSmelterState(station);
  }

  getSmelterState({ dimension = 'minecraft:the_end', anchor }) {
    const key = formatAnchorKey(dimension, anchor);
    const state = this._smelters.get(key);
    return state ? JSON.parse(JSON.stringify(state)) : null;
  }

  setSmelterSlots({ dimension = 'minecraft:the_end', anchor, input0, input1, fuel, output }) {
    const key = formatAnchorKey(dimension, anchor);
    let state = this._smelters.get(key);
    if (!state) {
      this.createSmelter({ dimension, anchor });
      state = this._smelters.get(key);
    }
    if (input0 !== undefined) state.input0 = cloneItem(input0);
    if (input1 !== undefined) state.input1 = cloneItem(input1);
    if (fuel !== undefined) state.fuel = cloneItem(fuel);
    if (output !== undefined) state.output = cloneItem(output);
    return this.getSmelterState({ dimension, anchor });
  }

  matchSmelterRecipe(input0, input1) {
    const s0 = cloneItem(input0);
    const s1 = cloneItem(input1);

    // 1. Try 2-input `bclib:alloying` recipes (order-independent matching of slots 0 & 1)
    if (s0 && s1) {
      for (const recipe of this.alloyingRecipes) {
        const [ingA, ingB] = recipe.ingredients;
        const directMatch =
          matchesIngredientPredicate(ingA, s0, this.tagMap) &&
          matchesIngredientPredicate(ingB, s1, this.tagMap);
        const swappedMatch =
          matchesIngredientPredicate(ingA, s1, this.tagMap) &&
          matchesIngredientPredicate(ingB, s0, this.tagMap);
        if (directMatch || swappedMatch) {
          return {
            mode: 'alloying',
            recipe,
            recipeTime: Number(recipe.smeltTime ?? recipe.smelttime ?? 350),
            experience: Number(recipe.experience ?? 0),
            result: {
              itemId: recipe.result.item ?? recipe.result.id,
              count: Number(recipe.result.count ?? 1),
              components: recipe.result.components ? JSON.parse(JSON.stringify(recipe.result.components)) : undefined,
            },
            consumeSlots: ['input0', 'input1'],
          };
        }
      }
    }

    // 2. Fallback to 1-input `minecraft:blasting` / `minecraft:smelting` when a single input is present
    const singleSlot = s0 && !s1 ? 'input0' : !s0 && s1 ? 'input1' : null;
    if (singleSlot) {
      const targetStack = singleSlot === 'input0' ? s0 : s1;
      for (const recipe of this.singleInputSmelterRecipes) {
        if (matchesIngredientPredicate(recipe.ingredient, targetStack, this.tagMap)) {
          const defaultCook = recipe.type === 'minecraft:blasting' ? 100 : 200;
          return {
            mode: recipe.type === 'minecraft:blasting' ? 'blasting' : 'smelting',
            recipe,
            recipeTime: Number(recipe.cookingTime ?? recipe.cookingtime ?? defaultCook),
            experience: Number(recipe.experience ?? 0),
            result: {
              itemId: recipe.result.item ?? recipe.result.id,
              count: Number(recipe.result.count ?? 1),
              components: recipe.result.components ? JSON.parse(JSON.stringify(recipe.result.components)) : undefined,
            },
            consumeSlots: [singleSlot],
          };
        }
      }
    }

    return null;
  }

  _canSmelterStoreOutput(currentOutput, recipeResult) {
    if (!currentOutput) return true;
    if (!sameItemAndComponents(currentOutput, recipeResult)) return false;
    const maxStack = Number(currentOutput.maxStackSize ?? 64);
    return currentOutput.count + recipeResult.count <= maxStack;
  }

  _consumeSmelterFuel(state) {
    if (!state.fuel || state.fuel.count <= 0) return false;
    const fuelEntry = this.fuelRegistry[state.fuel.itemId];
    if (!fuelEntry || fuelEntry.burnTime <= 0) return false;

    state.availableHeat += fuelEntry.burnTime;
    state.maxHeat = fuelEntry.burnTime;
    state.speedMultiplier = Number(fuelEntry.speedMultiplier ?? 1.0);
    state.fuel.count -= 1;

    if (state.fuel.count <= 0) {
      state.fuel = fuelEntry.remainder
        ? { itemId: fuelEntry.remainder, count: 1, maxStackSize: 16 }
        : null;
    }
    return true;
  }

  /**
   * Advances the End Stone Smelter by `ticks` server ticks.
   */
  tickSmelter({ dimension = 'minecraft:the_end', anchor, ticks = 1 }) {
    const key = formatAnchorKey(dimension, anchor);
    const state = this._smelters.get(key);
    if (!state) {
      throw new Error(`No End Stone Smelter registered at ${key}`);
    }

    const totalTicks = Math.max(1, Math.floor(Number(ticks) || 1));
    let completedCrafts = 0;

    for (let t = 0; t < totalTicks; t += 1) {
      const matched = this.matchSmelterRecipe(state.input0, state.input1);
      const canOutput = matched ? this._canSmelterStoreOutput(state.output, matched.result) : false;

      if (matched && !canOutput) {
        state.pausedReason = 'output_full';
      } else if (!matched) {
        state.pausedReason = 'no_recipe';
      } else {
        state.pausedReason = null;
      }

      // Consume fuel if needed and a valid recipe can proceed into output
      if (state.availableHeat <= 0 && matched && canOutput) {
        this._consumeSmelterFuel(state);
      }

      const isLit = state.availableHeat > 0;
      if (isLit) {
        state.availableHeat = Math.max(0, state.availableHeat - 1);
      }

      if (matched && canOutput) {
        const targetSmeltTime = Math.ceil(matched.recipeTime / (state.speedMultiplier || 1.0));
        if (state.activeRecipeId !== matched.recipe.id) {
          state.activeRecipeId = matched.recipe.id;
          state.activeMode = matched.mode;
          state.smeltTime = targetSmeltTime;
          state.progress = 0;
        } else {
          state.smeltTime = targetSmeltTime;
        }

        if (isLit) {
          state.progress += 1;
          if (state.progress >= state.smeltTime) {
            // Consume inputs
            for (const slotName of matched.consumeSlots) {
              if (state[slotName]) {
                state[slotName].count -= 1;
                if (state[slotName].count <= 0) state[slotName] = null;
              }
            }
            // Deposit output
            if (!state.output) {
              state.output = {
                itemId: matched.result.itemId,
                count: matched.result.count,
                maxStackSize: 64,
                ...(matched.result.components ? { components: matched.result.components } : {}),
              };
            } else {
              state.output.count += matched.result.count;
            }
            // Accumulate XP reward (`experience * count`)
            const xpGain = matched.experience * matched.result.count;
            state.storedXp = Number((state.storedXp + xpGain).toFixed(4));
            state.recipeCraftCounts[matched.recipe.id] =
              (state.recipeCraftCounts[matched.recipe.id] ?? 0) + matched.result.count;

            state.progress = 0;
            completedCrafts += 1;
          }
        } else if (state.progress > 0) {
          // Unlit decay: -2 progress per tick
          state.progress = Math.max(0, state.progress - 2);
        }
      } else {
        if (!matched) {
          state.activeRecipeId = null;
          state.activeMode = null;
          state.smeltTime = 0;
          state.progress = 0;
        } else if (!isLit && state.progress > 0) {
          state.progress = Math.max(0, state.progress - 2);
        }
      }
    }

    this.store.updateStationState({
      dimension: state.dimension,
      anchor: state.anchor,
      generationId: state.generationId,
      statePatch: {
        availableHeat: state.availableHeat,
        maxHeat: state.maxHeat,
        speedMultiplier: state.speedMultiplier,
        progress: state.progress,
        smeltTime: state.smeltTime,
        activeRecipeId: state.activeRecipeId,
        activeMode: state.activeMode,
        storedXp: state.storedXp,
        pausedReason: state.pausedReason,
      },
    });

    return {
      ...this.getSmelterState({ dimension, anchor }),
      completedCrafts,
    };
  }

  claimSmelterXp({ dimension = 'minecraft:the_end', anchor }) {
    const key = formatAnchorKey(dimension, anchor);
    const state = this._smelters.get(key);
    if (!state) return 0;
    const xp = state.storedXp;
    state.storedXp = 0;
    state.recipeCraftCounts = {};
    return xp;
  }

  // ============================================================================
  // 2. LEVELED & AETERNIUM ANVILS (`STA-001`)
  // ============================================================================

  /**
   * Executes a `bclib:smithing` recipe on a Leveled or Aeternium Anvil.
   * Enforces:
   * - `anvilLevel >= recipe.anvilLevel` (`thallasium=1, terminite=2, aeternium=5, vanilla=1`)
   * - `toolLevel >= recipe.toolLevel` (`wood/gold=0, stone=1, iron/thallasium=2, diamond/terminite=3, netherite/crystalite=4, aeternium=5`)
   * - Tool `damage` durability consumption (breaking the tool when `damage >= remainingDurability`, or returning the damaged tool)
   */
  executeAnvilSmithing({ anvil, material, tool, recipeId = null }) {
    const stationAnvilLevel = resolveAnvilLevel(anvil);
    const matStack = cloneItem(material);
    const toolStack = cloneItem(tool);

    if (!matStack || !toolStack) {
      return { success: false, reason: 'missing_inputs' };
    }

    const actualToolLevel = resolveDiggerToolLevel(toolStack);
    const candidates = this.smithingRecipes.filter(r => {
      if (recipeId && r.id !== recipeId) return false;
      return matchesIngredientPredicate(r.input, matStack, this.tagMap);
    });

    if (candidates.length === 0) {
      return { success: false, reason: 'no_matching_recipe' };
    }

    const recipe = candidates[0];
    const requiredAnvilLevel = Number(recipe.anvilLevel ?? 1);
    if (stationAnvilLevel < requiredAnvilLevel) {
      return {
        success: false,
        reason: 'insufficient_anvil_level',
        stationAnvilLevel,
        requiredAnvilLevel,
      };
    }

    const requiredToolLevel =
      recipe.toolLevel !== undefined
        ? Number(recipe.toolLevel)
        : ALLOWED_TOOL_TAG_LEVELS[recipe.allowedTools] ?? 0;

    if (actualToolLevel < requiredToolLevel) {
      return {
        success: false,
        reason: 'insufficient_tool_level',
        actualToolLevel,
        requiredToolLevel,
      };
    }

    const requiredCount = Number(recipe.inputCount ?? 1);
    if (matStack.count < requiredCount) {
      return {
        success: false,
        reason: 'insufficient_material_count',
        availableCount: matStack.count,
        requiredCount,
      };
    }

    const maxDurability = Number(toolStack.maxDurability ?? 250);
    const currentDamage = Number(toolStack.damage ?? 0);
    const remainingDurability =
      toolStack.remainingDurability !== undefined
        ? Number(toolStack.remainingDurability)
        : Math.max(0, maxDurability - currentDamage);

    if (remainingDurability <= 0) {
      return { success: false, reason: 'broken_tool' };
    }

    const recipeDamage = Number(recipe.damage ?? 1);
    const toolBroken = recipeDamage >= remainingDurability;
    const newRemainingDurability = Math.max(0, remainingDurability - recipeDamage);
    const newDamage = maxDurability - newRemainingDurability;

    const remainingTool = toolBroken
      ? null
      : {
          ...toolStack,
          damage: newDamage,
          remainingDurability: newRemainingDurability,
        };

    const remainingMaterialCount = matStack.count - requiredCount;
    const remainingMaterial =
      remainingMaterialCount > 0
        ? {
            ...matStack,
            count: remainingMaterialCount,
          }
        : null;

    const output = {
      itemId: recipe.result.item ?? recipe.result.id,
      count: Number(recipe.result.count ?? 1),
      maxStackSize: 64,
    };
    if (matStack.components || recipe.result.components) {
      output.components = {
        ...(matStack.components ? JSON.parse(JSON.stringify(matStack.components)) : {}),
        ...(recipe.result.components ? JSON.parse(JSON.stringify(recipe.result.components)) : {}),
      };
    }
    if (matStack.dynamicProperties) {
      output.dynamicProperties = JSON.parse(JSON.stringify(matStack.dynamicProperties));
    }
    if (matStack.enchantments) {
      output.enchantments = JSON.parse(JSON.stringify(matStack.enchantments));
    }

    return {
      success: true,
      recipeId: recipe.id,
      stationAnvilLevel,
      actualToolLevel,
      output,
      remainingMaterial,
      remainingTool,
      toolBroken,
      durabilityConsumed: Math.min(remainingDurability, recipeDamage),
    };
  }

  /**
   * Executes vanilla anvil material repair or two-item combine with BetterEnd's
   * 1-material-unit cost reduction (`repairItemCountCost = Math.max(1, vanillaCount - 1)`
   * when `vanillaCount > 1`), while preserving `DataComponentPatch`, dynamic
   * properties, and enchantments on the output item.
   */
  executeAnvilRepairOrCombine({ anvil = 'betterend:aeternium_anvil', base, addition, customName = null }) {
    const baseStack = cloneItem(base);
    const addStack = cloneItem(addition);
    if (!baseStack || !addStack) {
      return { success: false, reason: 'missing_inputs' };
    }

    const maxDurability = Number(baseStack.maxDurability ?? 500);
    const currentDamage = Number(baseStack.damage ?? 0);

    // Case 1: Combining two items of the same type
    if (baseStack.itemId === addStack.itemId) {
      const addDamage = Number(addStack.damage ?? 0);
      const addRemaining = Math.max(0, maxDurability - addDamage);
      const bonus = Math.floor(maxDurability * 0.12);
      const newDamage = Math.max(0, currentDamage - (addRemaining + bonus));
      const mergedEnchantments = {
        ...(baseStack.enchantments ?? {}),
      };
      if (addStack.enchantments) {
        for (const [ench, lvl] of Object.entries(addStack.enchantments)) {
          const prev = Number(mergedEnchantments[ench] ?? 0);
          mergedEnchantments[ench] = prev === lvl ? prev + 1 : Math.max(prev, Number(lvl));
        }
      }
      const mergedComponents = {
        ...(baseStack.components ?? {}),
        ...(addStack.components ?? {}),
      };
      const mergedDynamic = {
        ...(baseStack.dynamicProperties ?? {}),
        ...(addStack.dynamicProperties ?? {}),
      };
      if (mergedDynamic['betterend:durability_damage'] !== undefined) {
        mergedDynamic['betterend:durability_damage'] = newDamage;
      }

      const output = {
        ...baseStack,
        damage: newDamage,
        remainingDurability: maxDurability - newDamage,
        components: mergedComponents,
        dynamicProperties: mergedDynamic,
        enchantments: mergedEnchantments,
        ...(customName ? { customName } : {}),
      };

      return {
        success: true,
        mode: 'combine',
        vanillaItemCountCost: 1,
        repairItemCountCost: 1,
        output,
        remainingAddition: null,
      };
    }

    // Case 2: Material unit repair with BetterEnd 1-unit cost reduction
    if (currentDamage <= 0) {
      return { success: false, reason: 'already_fully_repaired' };
    }

    const repairPerUnit = Math.max(1, Math.floor(maxDurability / 4));
    const unitsNeeded = Math.ceil(currentDamage / repairPerUnit);
    const vanillaCount = Math.min(addStack.count, unitsNeeded);
    if (vanillaCount <= 0) {
      return { success: false, reason: 'no_repair_units' };
    }

    const isBetterEndAnvil =
      typeof anvil === 'string'
        ? anvil.startsWith('betterend:') || anvil === 'thallasium' || anvil === 'terminite' || anvil === 'aeternium'
        : resolveAnvilLevel(anvil) >= 1;

    const repairItemCountCost =
      isBetterEndAnvil && vanillaCount > 1 ? Math.max(1, vanillaCount - 1) : vanillaCount;

    const restoredDurability = vanillaCount * repairPerUnit;
    const newDamage = Math.max(0, currentDamage - restoredDurability);
    const remainingDurability = maxDurability - newDamage;

    const preservedComponents = baseStack.components
      ? JSON.parse(JSON.stringify(baseStack.components))
      : {};
    const preservedDynamic = baseStack.dynamicProperties
      ? JSON.parse(JSON.stringify(baseStack.dynamicProperties))
      : {};
    if (preservedDynamic['betterend:durability_damage'] !== undefined) {
      preservedDynamic['betterend:durability_damage'] = newDamage;
    }

    const output = {
      ...baseStack,
      damage: newDamage,
      remainingDurability,
      components: preservedComponents,
      dynamicProperties: preservedDynamic,
      ...(baseStack.enchantments ? { enchantments: JSON.parse(JSON.stringify(baseStack.enchantments)) } : {}),
      ...(customName ? { customName } : {}),
    };

    const leftoverCount = addStack.count - repairItemCountCost;
    const remainingAddition =
      leftoverCount > 0
        ? {
            ...addStack,
            count: leftoverCount,
          }
        : null;

    return {
      success: true,
      mode: 'material_repair',
      vanillaItemCountCost: vanillaCount,
      repairItemCountCost,
      restoredDurability: currentDamage - newDamage,
      output,
      remainingAddition,
    };
  }

  // ============================================================================
  // 3. INFUSION PEDESTAL & 8-PEDESTAL RITUAL (`STA-002`)
  // ============================================================================

  /**
   * Places a center `betterend:infusion_pedestal` or a peripheral pedestal.
   */
  placePedestal({ dimension = 'minecraft:the_end', anchor, blockType = 'betterend:pedestal', item = null }) {
    const station = this.store.registerStation({
      dimension,
      anchor,
      stationType: blockType,
      state: {
        item: cloneItem(item ? { ...item, count: 1 } : null),
        lockedByRitual: null,
      },
    });
    const pedState = {
      stationId: station.stationId,
      generationId: station.generationId,
      dimension: station.dimension,
      anchor: station.anchor,
      anchorKey: station.anchorKey,
      blockType,
      item: cloneItem(item ? { ...item, count: 1 } : null),
      lockedByRitual: null,
    };
    this._pedestals.set(station.anchorKey, pedState);
    return JSON.parse(JSON.stringify(pedState));
  }

  /**
   * Convenience helper to place a complete 9-pedestal Infusion ring (center + 8 compass pedestals).
   */
  setupInfusionRing({ dimension = 'minecraft:the_end', center, centerItem = null, catalysts = {} }) {
    const normCenter = normalizeBlockAnchor(center);
    const centerPed = this.placePedestal({
      dimension,
      anchor: normCenter,
      blockType: 'betterend:infusion_pedestal',
      item: centerItem,
    });
    const peripheral = {};
    for (const dir of INFUSION_COMPASS_ORDER) {
      const [dx, dz] = INFUSION_COMPASS_OFFSETS[dir];
      const pos = { x: normCenter.x + dx, y: normCenter.y, z: normCenter.z + dz };
      peripheral[dir] = this.placePedestal({
        dimension,
        anchor: pos,
        blockType: 'betterend:pedestal',
        item: catalysts[dir] ?? null,
      });
    }
    return { center: centerPed, peripheral };
  }

  getPedestal({ dimension = 'minecraft:the_end', anchor }) {
    const key = formatAnchorKey(dimension, anchor);
    const ped = this._pedestals.get(key);
    return ped ? JSON.parse(JSON.stringify(ped)) : null;
  }

  /**
   * Player or hopper interaction with a pedestal.
   * Rejects concurrent access while the pedestal is locked by an active ritual.
   */
  interactWithPedestal({
    dimension = 'minecraft:the_end',
    anchor,
    action = 'extract',
    item = null,
    actor = 'player',
  }) {
    const key = formatAnchorKey(dimension, anchor);
    const ped = this._pedestals.get(key);
    if (!ped) {
      return { success: false, reason: 'pedestal_not_found' };
    }
    if (ped.lockedByRitual) {
      return {
        success: false,
        reason: 'pedestal_locked_by_ritual',
        lockedByRitual: ped.lockedByRitual,
        actor,
      };
    }

    if (action === 'insert') {
      if (ped.item) {
        return { success: false, reason: 'pedestal_occupied' };
      }
      const inserted = cloneItem(item ? { ...item, count: 1 } : null);
      if (!inserted) {
        return { success: false, reason: 'empty_item' };
      }
      ped.item = inserted;
    } else if (action === 'extract') {
      if (!ped.item) {
        return { success: false, reason: 'pedestal_empty' };
      }
      const extracted = cloneItem(ped.item);
      ped.item = null;
      this.store.updateStationState({
        dimension: ped.dimension,
        anchor: ped.anchor,
        generationId: ped.generationId,
        statePatch: { item: null },
      });
      return { success: true, extractedItem: extracted, pedestal: JSON.parse(JSON.stringify(ped)) };
    } else {
      return { success: false, reason: `unknown_action:${action}` };
    }

    this.store.updateStationState({
      dimension: ped.dimension,
      anchor: ped.anchor,
      generationId: ped.generationId,
      statePatch: { item: ped.item },
    });
    return { success: true, pedestal: JSON.parse(JSON.stringify(ped)) };
  }

  /**
   * Validates the 8 compass catalyst pedestals around `center`.
   */
  validateInfusionRing({ dimension = 'minecraft:the_end', center }) {
    const normDim = normalizeDimensionId(dimension);
    const normCenter = normalizeBlockAnchor(center);
    const centerKey = formatAnchorKey(normDim, normCenter);
    const centerPed = this._pedestals.get(centerKey);
    if (!centerPed || centerPed.blockType !== 'betterend:infusion_pedestal') {
      return {
        valid: false,
        reason: 'missing_center_infusion_pedestal',
        missingDirections: [...INFUSION_COMPASS_ORDER],
      };
    }

    const missingDirections = [];
    const catalysts = {};
    const catalystPedestals = {};

    for (const dir of INFUSION_COMPASS_ORDER) {
      const [dx, dz] = INFUSION_COMPASS_OFFSETS[dir];
      const pos = { x: normCenter.x + dx, y: normCenter.y, z: normCenter.z + dz };
      const key = formatAnchorKey(normDim, pos);
      const ped = this._pedestals.get(key);
      if (!ped) {
        missingDirections.push(dir);
      } else {
        catalysts[dir] = cloneItem(ped.item);
        catalystPedestals[dir] = ped;
      }
    }

    return {
      valid: missingDirections.length === 0,
      reason: missingDirections.length === 0 ? null : 'incomplete_catalyst_ring',
      missingDirections,
      centerPedestal: centerPed,
      catalystPedestals,
      catalysts,
    };
  }

  /**
   * Matches `centerItem` and the 8 compass `catalysts` against `betterend:infusion` recipes.
   * Supports both directional compass order (`checkCatalystOrder !== false`) and
   * order-agnostic matching when `recipe.checkCatalystOrder === false` or `options.checkCatalystOrder === false`.
   */
  matchInfusionRecipe(centerItem, catalysts = {}, options = {}) {
    const centerStack = cloneItem(centerItem);
    if (!centerStack) return null;

    for (const recipe of this.infusionRecipes) {
      if (!matchesIngredientPredicate(recipe.input, centerStack, this.tagMap)) {
        continue;
      }

      const enforceOrder =
        options.checkCatalystOrder !== undefined
          ? Boolean(options.checkCatalystOrder)
          : recipe.checkCatalystOrder !== false;

      if (enforceOrder) {
        let allDirectionsMatch = true;
        for (const dir of INFUSION_COMPASS_ORDER) {
          const expectedPred = recipe.catalysts?.[dir] ?? null;
          const actualStack = catalysts[dir] ?? null;
          if (!matchesIngredientPredicate(expectedPred, actualStack, this.tagMap)) {
            allDirectionsMatch = false;
            break;
          }
        }
        if (allDirectionsMatch) return recipe;
      } else {
        // Order-agnostic multiset matching across the 8 catalyst sockets
        const expectedPreds = INFUSION_COMPASS_ORDER.map(dir => recipe.catalysts?.[dir] ?? null);
        const actualStacks = INFUSION_COMPASS_ORDER.map(dir => catalysts[dir] ?? null);
        const usedIndices = new Set();
        let allMatched = true;
        for (const pred of expectedPreds) {
          let found = false;
          for (let i = 0; i < actualStacks.length; i += 1) {
            if (usedIndices.has(i)) continue;
            if (matchesIngredientPredicate(pred, actualStacks[i], this.tagMap)) {
              usedIndices.add(i);
              found = true;
              break;
            }
          }
          if (!found) {
            allMatched = false;
            break;
          }
        }
        if (allMatched) return recipe;
      }
    }

    return null;
  }

  /**
   * Starts an 8-pedestal Infusion ritual, acquiring deterministic locks on all 9
   * pedestals and writing `preparing -> active` transaction receipts to `PersistenceStore`.
   */
  startInfusionRitual({ dimension = 'minecraft:the_end', center, actor = 'player', checkCatalystOrder }) {
    const normDim = normalizeDimensionId(dimension);
    const normCenter = normalizeBlockAnchor(center);
    const ring = this.validateInfusionRing({ dimension: normDim, center: normCenter });
    if (!ring.valid) {
      return { started: false, reason: ring.reason, missingDirections: ring.missingDirections };
    }

    const centerPed = ring.centerPedestal;
    if (centerPed.lockedByRitual) {
      return { started: false, reason: 'ritual_already_active', txId: centerPed.lockedByRitual };
    }

    for (const dir of INFUSION_COMPASS_ORDER) {
      if (ring.catalystPedestals[dir].lockedByRitual) {
        return {
          started: false,
          reason: `catalyst_${dir}_locked_by_other_ritual`,
          txId: ring.catalystPedestals[dir].lockedByRitual,
        };
      }
    }

    const recipe = this.matchInfusionRecipe(centerPed.item, ring.catalysts, { checkCatalystOrder });
    if (!recipe) {
      return { started: false, reason: 'no_matching_infusion_recipe' };
    }

    const participants = [
      {
        role: 'center',
        anchor: centerPed.anchor,
        anchorKey: centerPed.anchorKey,
        generationId: centerPed.generationId,
        item: cloneItem(centerPed.item),
      },
      ...INFUSION_COMPASS_ORDER.map(dir => {
        const ped = ring.catalystPedestals[dir];
        return {
          role: `catalyst_${dir}`,
          direction: dir,
          anchor: ped.anchor,
          anchorKey: ped.anchorKey,
          generationId: ped.generationId,
          item: cloneItem(ped.item),
        };
      }),
    ];

    const expectedOutput = {
      itemId: recipe.result.item ?? recipe.result.id,
      count: Number(recipe.result.count ?? 1),
      ...(recipe.result.components ? { components: JSON.parse(JSON.stringify(recipe.result.components)) } : {}),
    };

    const tx = this.store.beginTransaction({
      dimension: normDim,
      anchor: normCenter,
      generationId: centerPed.generationId,
      stationType: 'betterend:infusion_pedestal',
      recipeId: recipe.id,
      actor,
      inputs: participants.filter(p => p.item !== null).map(p => ({ role: p.role, item: p.item })),
      expectedOutputs: [expectedOutput],
      participants,
    });

    // Lock all 9 pedestals in deterministic anchorKey order
    const allPedestals = [centerPed, ...INFUSION_COMPASS_ORDER.map(dir => ring.catalystPedestals[dir])].sort((a, b) =>
      a.anchorKey.localeCompare(b.anchorKey),
    );
    for (const ped of allPedestals) {
      ped.lockedByRitual = tx.txId;
    }

    const activeTx = this.store.activateTransaction(tx.txId, {
      inputReceipts: participants
        .filter(p => p.item !== null)
        .map(p => ({
          role: p.role,
          anchorKey: p.anchorKey,
          generationId: p.generationId,
          item: p.item,
        })),
    });

    const ritualState = {
      txId: activeTx.txId,
      dimension: normDim,
      center: normCenter,
      centerKey: centerPed.anchorKey,
      generationId: centerPed.generationId,
      recipeId: recipe.id,
      recipe,
      progress: 0,
      time: Number(recipe.time ?? 100),
      state: TRANSACTION_STATES.ACTIVE,
      participants,
      expectedOutput,
    };

    this._infusionRituals.set(centerPed.anchorKey, ritualState);
    return {
      started: true,
      txId: activeTx.txId,
      recipeId: recipe.id,
      time: ritualState.time,
      ritual: JSON.parse(JSON.stringify(ritualState)),
    };
  }

  /**
   * Advances an active Infusion ritual by `ticks` ticks.
   * Verifies every participant pedestal's `generationId` and item integrity on
   * each step; if any pedestal was broken or tampered with, immediately
   * quarantines the transaction without duplicating outputs or losing items.
   */
  tickInfusionRitual({ dimension = 'minecraft:the_end', center, ticks = 1 }) {
    const normDim = normalizeDimensionId(dimension);
    const normCenter = normalizeBlockAnchor(center);
    const centerKey = formatAnchorKey(normDim, normCenter);
    const ritual = this._infusionRituals.get(centerKey);
    if (!ritual) {
      return { active: false, reason: 'no_active_ritual' };
    }

    const stepCount = Math.max(1, Math.floor(Number(ticks) || 1));
    for (let i = 0; i < stepCount; i += 1) {
      // Verify all 9 pedestals still exist with matching generationId and uncorrupted contents
      for (const part of ritual.participants) {
        const livePed = this._pedestals.get(part.anchorKey);
        const storeStation = this.store.getStation({
          dimension: normDim,
          anchor: part.anchor,
          generationId: part.generationId,
        });
        const itemMatches =
          (part.item === null && livePed?.item === null) ||
          sameItemAndComponents(part.item, livePed?.item);

        if (!livePed || !storeStation || livePed.generationId !== part.generationId || !itemMatches) {
          return this.interruptInfusionRitual({
            dimension: normDim,
            center: normCenter,
            reason: `participant_compromised:${part.role}`,
            evidence: {
              role: part.role,
              anchorKey: part.anchorKey,
              expectedGenerationId: part.generationId,
              actualGenerationId: livePed?.generationId ?? null,
              itemMatches,
            },
          });
        }
      }

      ritual.progress += 1;
      if (ritual.progress >= ritual.time) {
        // Transition receipt to `completing` before consuming catalysts
        this.store.markCompleting(ritual.txId, {
          pendingOutputs: [ritual.expectedOutput],
        });

        // Consume all 8 catalysts and install output on center pedestal atomically
        for (const part of ritual.participants) {
          const livePed = this._pedestals.get(part.anchorKey);
          if (!livePed) continue;
          if (part.role === 'center') {
            livePed.item = cloneItem(ritual.expectedOutput);
          } else {
            livePed.item = null;
          }
          livePed.lockedByRitual = null;
          this.store.updateStationState({
            dimension: normDim,
            anchor: livePed.anchor,
            generationId: livePed.generationId,
            statePatch: {
              item: livePed.item,
              lockedByRitual: null,
            },
          });
        }

        const committed = this.store.commitTransaction(ritual.txId, {
          outputReceipts: [
            {
              anchorKey: centerKey,
              generationId: ritual.generationId,
              output: cloneItem(ritual.expectedOutput),
            },
          ],
        });

        ritual.state = TRANSACTION_STATES.COMPLETED;
        this._infusionRituals.delete(centerKey);

        return {
          active: false,
          completed: true,
          txId: ritual.txId,
          recipeId: ritual.recipeId,
          progress: ritual.progress,
          time: ritual.time,
          output: cloneItem(ritual.expectedOutput),
          receipt: committed,
        };
      }
    }

    this.store.updateTransactionProgress(ritual.txId, ritual.progress);
    return {
      active: true,
      completed: false,
      txId: ritual.txId,
      recipeId: ritual.recipeId,
      progress: ritual.progress,
      time: ritual.time,
    };
  }

  /**
   * Breaks a pedestal at `(dimension, anchor)`. If the pedestal was participating
   * in an active Infusion ritual, immediately quarantines the ritual and drops
   * only the broken pedestal's actual held item (zero duplication, zero silent loss).
   */
  breakPedestal({ dimension = 'minecraft:the_end', anchor }) {
    const normDim = normalizeDimensionId(dimension);
    const normAnchor = normalizeBlockAnchor(anchor);
    const key = formatAnchorKey(normDim, normAnchor);
    const ped = this._pedestals.get(key);
    if (!ped) return null;

    const droppedItems = [];
    if (ped.item) {
      droppedItems.push(cloneItem(ped.item));
    }

    let quarantinedRitual = null;
    if (ped.lockedByRitual) {
      for (const [centerKey, ritual] of this._infusionRituals.entries()) {
        if (ritual.txId === ped.lockedByRitual) {
          quarantinedRitual = this.interruptInfusionRitual({
            dimension: ritual.dimension,
            center: ritual.center,
            reason: `pedestal_broken:${key}`,
            evidence: {
              brokenAnchorKey: key,
              brokenGenerationId: ped.generationId,
              progressAtBreak: ritual.progress,
            },
          });
          this._infusionRituals.delete(centerKey);
          break;
        }
      }
    }

    this._pedestals.delete(key);
    this.store.breakStation({ dimension: normDim, anchor: normAnchor, reason: 'pedestal_broken' });

    return {
      brokenPedestal: JSON.parse(JSON.stringify(ped)),
      droppedItems,
      quarantinedRitual,
    };
  }

  interruptInfusionRitual({ dimension = 'minecraft:the_end', center, reason = 'ritual_interrupted', evidence = null }) {
    const normDim = normalizeDimensionId(dimension);
    const normCenter = normalizeBlockAnchor(center);
    const centerKey = formatAnchorKey(normDim, normCenter);
    const ritual = this._infusionRituals.get(centerKey);
    if (!ritual) {
      return { interrupted: false, reason: 'no_active_ritual' };
    }

    const receipt = this.store.quarantineTransaction(ritual.txId, reason, {
      progress: ritual.progress,
      time: ritual.time,
      recipeId: ritual.recipeId,
      ...evidence,
    });

    // Release locks on surviving pedestals while preserving their physical items intact
    for (const part of ritual.participants) {
      const livePed = this._pedestals.get(part.anchorKey);
      if (livePed && livePed.lockedByRitual === ritual.txId) {
        livePed.lockedByRitual = null;
      }
    }

    ritual.state = TRANSACTION_STATES.QUARANTINED;
    this._infusionRituals.delete(centerKey);

    return {
      active: false,
      completed: false,
      interrupted: true,
      quarantined: true,
      txId: ritual.txId,
      reason,
      receipt,
    };
  }

  // ============================================================================
  // 4. ETERNAL PEDESTAL & ETERNAL PORTAL RITUAL (`STA-002`)
  // ============================================================================

  /**
   * Validates the 6-pedestal Eternal Portal frame structure and activates the
   * portal linking transaction when all 16 `flavolite_runed` frame positions and
   * all 6 `betterend:eternal_pedestal` positions hold matching key items (`betterend:eternal_crystal`).
   */
  activateEternalPortalRitual({
    dimension = 'minecraft:the_end',
    center,
    axis = 'x',
    targetDimension = null,
    keyItem = 'betterend:eternal_crystal',
    pedestals = null,
    frameBlocksValid = true,
    actor = 'player',
  }) {
    const normDim = normalizeDimensionId(dimension);
    const normCenter = normalizeBlockAnchor(center);
    const resolvedTargetDim = normalizeDimensionId(
      targetDimension ?? (normDim === 'minecraft:the_end' ? 'minecraft:overworld' : 'minecraft:the_end'),
    );

    if (!frameBlocksValid) {
      return { activated: false, reason: 'invalid_runed_flavolite_frame' };
    }

    const expectedPedestals = ETERNAL_PORTAL_PEDESTAL_OFFSETS.map(([ox, oz], idx) => {
      const dx = axis === 'z' ? oz : ox;
      const dz = axis === 'z' ? ox : oz;
      const pos = { x: normCenter.x + dx, y: normCenter.y, z: normCenter.z + dz };
      const provided = Array.isArray(pedestals) ? pedestals[idx] : null;
      const heldItem = provided?.item ?? provided?.itemId ?? keyItem;
      return {
        index: idx,
        offset: [ox, oz],
        anchor: pos,
        anchorKey: formatAnchorKey(normDim, pos),
        activated: provided ? provided.activated !== false : true,
        itemId: typeof heldItem === 'string' ? heldItem : heldItem?.itemId ?? null,
      };
    });

    const invalidPedestal = expectedPedestals.find(
      p => !p.activated || !p.itemId || p.itemId !== keyItem,
    );
    if (invalidPedestal) {
      return {
        activated: false,
        reason: 'incomplete_eternal_pedestals',
        invalidPedestal,
      };
    }

    const station = this.store.registerStation({
      dimension: normDim,
      anchor: normCenter,
      stationType: 'betterend:eternal_portal',
      state: {
        active: true,
        axis,
        keyItem,
        targetDimension: resolvedTargetDim,
      },
    });

    const tx = this.store.beginTransaction({
      dimension: normDim,
      anchor: normCenter,
      generationId: station.generationId,
      stationType: 'betterend:eternal_portal',
      recipeId: 'betterend:eternal_portal_activation',
      actor,
      inputs: expectedPedestals.map(p => ({ anchorKey: p.anchorKey, itemId: p.itemId })),
      expectedOutputs: [{ portalBlocks: ETERNAL_PORTAL_INTERIOR_OFFSETS.length, targetDimension: resolvedTargetDim }],
      participants: expectedPedestals,
    });

    this.store.activateTransaction(tx.txId, {
      inputReceipts: expectedPedestals.map(p => ({ anchorKey: p.anchorKey, itemId: p.itemId })),
    });
    this.store.markCompleting(tx.txId, {
      pendingOutputs: [{ portalBlocks: ETERNAL_PORTAL_INTERIOR_OFFSETS.length }],
    });
    const receipt = this.store.commitTransaction(tx.txId, {
      outputReceipts: [
        {
          portalCenter: normCenter,
          sourceDimension: normDim,
          targetDimension: resolvedTargetDim,
          interiorPortalBlockCount: ETERNAL_PORTAL_INTERIOR_OFFSETS.length,
          activeFrameBlockCount: ETERNAL_PORTAL_FRAME_OFFSETS.length,
        },
      ],
    });

    const portalRecord = {
      portalId: station.stationId,
      generationId: station.generationId,
      txId: tx.txId,
      sourceDimension: normDim,
      targetDimension: resolvedTargetDim,
      center: normCenter,
      axis,
      keyItem,
      active: true,
      pedestals: expectedPedestals,
      frameBlockCount: ETERNAL_PORTAL_FRAME_OFFSETS.length,
      interiorBlockCount: ETERNAL_PORTAL_INTERIOR_OFFSETS.length,
      receipt,
    };

    this._eternalPortals.set(station.anchorKey, portalRecord);
    return {
      activated: true,
      ...JSON.parse(JSON.stringify(portalRecord)),
    };
  }
}

export default StationsService;
