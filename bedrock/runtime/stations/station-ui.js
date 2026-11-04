/**
 * BetterEnd Bedrock 26.40 — Custom Station, Ritual, Container, Sign & Guidebook UIs
 * (`@minecraft/server-ui` 2.1.0+ & `@minecraft/server` 2.9.0+).
 *
 * Replaces all stub/cheat UIs with authoritative, inventory-backed UIs connected to:
 * - `StationsService` (`EndStoneSmelter`, `LeveledAnvil`, `InfusionPedestal`, `EternalPedestal`)
 * - `TransportService` (`RespawnObelisk`, `EternalPortal`)
 * - `EcologyService` (`SilkMothNest`, `FlowerPot`, `Pedestal`)
 * - `PresentationService` (`36 BetterEnd Advancements`, `27 Outer-End Regions`)
 *
 * Pure ES module with zero Node.js imports and zero static experimental graphics imports.
 */

import {
  DEFAULT_ALLOYING_RECIPES,
  DEFAULT_INFUSION_RECIPES,
  DEFAULT_SINGLE_INPUT_SMELTER_RECIPES,
  DEFAULT_SMITHING_RECIPES,
  ETERNAL_PORTAL_PEDESTAL_OFFSETS,
  INFUSION_COMPASS_OFFSETS,
  INFUSION_COMPASS_ORDER,
  ITEM_TAG_MEMBERS,
  SMELTER_FUEL_REGISTRY,
  matchesIngredientPredicate,
  resolveAnvilLevel,
  resolveDiggerToolLevel
} from "./stations-service.js";
import {
  TRANSACTION_STATES,
  formatAnchorKey,
  normalizeBlockAnchor,
  normalizeDimensionId
} from "../persistence/store.js";
import { REGION_CATALOGUE } from "../regions/region-catalogue.js";

/**
 * Exact Resource Pack texture path overrides for items/blocks whose `item_texture.json`
 * entry points to a block texture, variant suffix, or vanilla texture.
 */
const ICON_PATH_OVERRIDES = Object.freeze({
  "betterend:end_stone_smelter": "textures/blocks/betterend/end_stone_smelter_top",
  "betterend:infusion_pedestal": "textures/blocks/betterend/infusion_pedestal_top",
  "betterend:eternal_pedestal": "textures/blocks/betterend/flavolite_runed_1",
  "betterend:respawn_obelisk": "textures/items/betterend/respawn_obelisk",
  "betterend:thallasium_anvil": "textures/blocks/betterend/thallasium_anvil_top_0",
  "betterend:terminite_anvil": "textures/blocks/betterend/terminite_anvil_top_0",
  "betterend:aeternium_anvil": "textures/blocks/betterend/aeternium_anvil_top_0",
  "betterend:aeternium_block": "textures/blocks/betterend/aeternium_block",
  "betterend:terminite_block": "textures/blocks/betterend/terminite_block",
  "betterend:thallasium_block": "textures/blocks/betterend/thallasium_block",
  "betterend:amber_block": "textures/blocks/betterend/amber_block",
  "betterend:amber_ore": "textures/blocks/betterend/amber_ore",
  "betterend:thallasium_ore": "textures/blocks/betterend/thallasium_ore",
  "betterend:ender_ore": "textures/blocks/betterend/ender_ore",
  "betterend:aurora_crystal": "textures/blocks/betterend/aurora_crystal",
  "betterend:smaragdant_crystal": "textures/blocks/betterend/smaragdant_crystal",
  "betterend:ancient_emerald_ice": "textures/blocks/betterend/ancient_emerald_ice",
  "betterend:emerald_ice": "textures/blocks/betterend/emerald_ice",
  "betterend:dense_emerald_ice": "textures/blocks/betterend/dense_emerald_ice",
  "betterend:dense_snow": "textures/blocks/betterend/dense_snow",
  "betterend:enchanted_membrane": "textures/items/phantom_membrane",
  "betterend:enchanted_petal": "textures/items/betterend/hydralux_petal",
  "betterend:end_fish_raw": "textures/items/betterend/end_fish",
  "betterend:end_lily_leaf": "textures/blocks/betterend/end_lily_leaf_small",
  "betterend:end_stone_brick_cracked": "textures/blocks/betterend/end_stone_brick_cracked",
  "betterend:endstone_dust": "textures/blocks/betterend/endstone_dust",
  "betterend:flavolite": "textures/blocks/betterend/flavolite",
  "betterend:flavolite_polished": "textures/blocks/betterend/flavolite_polished",
  "betterend:flavolite_runed": "textures/blocks/betterend/flavolite_polished",
  "betterend:violecite": "textures/blocks/betterend/violecite",
  "betterend:umbralith": "textures/blocks/betterend/umbralith_5",
  "betterend:virid_jadestone": "textures/blocks/betterend/virid_jadestone",
  "betterend:azure_jadestone": "textures/blocks/betterend/azure_jadestone",
  "betterend:sandy_jadestone": "textures/blocks/betterend/sandy_jadestone",
  "betterend:sulphuric_rock": "textures/blocks/betterend/sulphuric_rock",
  "betterend:brimstone": "textures/blocks/betterend/inactive_brimstone",
  "betterend:hydrothermal_vent": "textures/blocks/betterend/sulphuric_rock",
  "betterend:jellyshroom_cap_purple": "textures/blocks/betterend/jellyshroom_cap",
  "betterend:menger_sponge": "textures/blocks/betterend/menger_sponge",
  "betterend:menger_sponge_wet": "textures/blocks/betterend/menger_sponge_wet",
  "betterend:shadow_berry_raw": "textures/items/betterend/shadow_berry",
  "betterend:end_mycelium": "textures/blocks/betterend/end_mycelium_top",
  "betterend:chorus_nylium": "textures/blocks/betterend/chorus_nylium_top",
  "betterend:end_moss": "textures/blocks/betterend/end_moss_top",
  "betterend:cave_moss": "textures/blocks/betterend/cave_moss_top",
  "betterend:crystal_moss": "textures/blocks/betterend/crystal_moss_top",
  "betterend:shadow_grass": "textures/blocks/betterend/shadow_grass_top",
  "betterend:pink_moss": "textures/blocks/betterend/pink_moss_top",
  "betterend:amber_moss": "textures/blocks/betterend/amber_moss_side_1",
  "betterend:jungle_moss": "textures/blocks/betterend/jungle_moss_top",
  "betterend:sangnum": "textures/blocks/betterend/sangnum_top",
  "betterend:rutiscus": "textures/blocks/betterend/rutiscus_side_1",
  "betterend:pallidium_full": "textures/blocks/betterend/pallidium_full_top",
  "betterend:charcoal_block": "textures/blocks/betterend/charcoal_block",
  "#betterend:alloying_iron": "textures/items/raw_iron",
  "#betterend:alloying_gold": "textures/items/raw_gold",
  "#betterend:alloying_copper": "textures/items/raw_copper",
  "#betterend:thallasium_alloying": "textures/items/betterend/thallasium_raw",
  "minecraft:end_stone": "textures/blocks/end_stone",
  "minecraft:obsidian": "textures/blocks/obsidian",
  "minecraft:crying_obsidian": "textures/blocks/crying_obsidian",
  "minecraft:glowstone": "textures/blocks/glowstone",
  "minecraft:sea_lantern": "textures/blocks/sea_lantern",
  "minecraft:packed_ice": "textures/blocks/ice_packed",
  "minecraft:blue_ice": "textures/blocks/blue_ice",
  "minecraft:snow_block": "textures/blocks/snow",
  "minecraft:coal_block": "textures/blocks/coal_block",
  "minecraft:dried_kelp_block": "textures/blocks/dried_kelp_top",
  "minecraft:enchanted_book": "textures/items/book_enchanted",
  "minecraft:ender_pearl": "textures/items/ender_pearl",
  "minecraft:ender_eye": "textures/items/ender_eye",
  "minecraft:popped_chorus_fruit": "textures/items/chorus_fruit_popped",
  "minecraft:chorus_fruit": "textures/items/chorus_fruit"
});

const COMPASS_LABELS = Object.freeze({
  north: "North (0, -3)",
  north_east: "North-East (+2, -2)",
  east: "East (+3, 0)",
  south_east: "South-East (+2, +2)",
  south: "South (0, +3)",
  south_west: "South-West (-2, +2)",
  west: "West (-3, 0)",
  north_west: "North-West (-2, -2)"
});

const COMPASS_SHORT_LABELS = Object.freeze({
  north: "N",
  north_east: "NE",
  east: "E",
  south_east: "SE",
  south: "S",
  south_west: "SW",
  west: "W",
  north_west: "NW"
});

export function formatTitle(shortId) {
  return String(shortId ?? "")
    .replace(/^#?betterend:/, "")
    .replace(/^minecraft:/, "")
    .replace(/__p\d+$/, "")
    .split(/[/:_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Resolves a valid Resource Pack texture path for `@minecraft/server-ui` `ActionFormData.button`.
 */
export function resolveUiIconPath(itemIdOrTag) {
  const id = String(itemIdOrTag ?? "").trim();
  if (!id) return "textures/items/betterend/guidebook";
  if (Object.hasOwn(ICON_PATH_OVERRIDES, id)) {
    return ICON_PATH_OVERRIDES[id];
  }
  if (id.startsWith("#")) {
    const tagMembers = ITEM_TAG_MEMBERS[id.slice(1)];
    if (Array.isArray(tagMembers) && tagMembers.length > 0) {
      return resolveUiIconPath(tagMembers[0]);
    }
    return "textures/items/betterend/thallasium_ingot";
  }
  if (id.startsWith("betterend:")) {
    const short = id.slice("betterend:".length).replace(/__p\d+$/, "");
    if (
      short.endsWith("_block") ||
      short.endsWith("_ore") ||
      short.endsWith("_bricks") ||
      short.endsWith("_planks") ||
      short.endsWith("_log") ||
      short.endsWith("_moss") ||
      short.endsWith("_nylium")
    ) {
      return `textures/blocks/betterend/${short}`;
    }
    return `textures/items/betterend/${short}`;
  }
  if (id.startsWith("minecraft:")) {
    const short = id.slice("minecraft:".length);
    if (
      short.endsWith("_block") ||
      short.endsWith("_ore") ||
      short.endsWith("_stone") ||
      short.endsWith("_ice")
    ) {
      return `textures/blocks/${short}`;
    }
    return `textures/items/${short}`;
  }
  return `textures/items/betterend/${id}`;
}

/**
 * Renders an ASCII progress bar for smelter heat/progress or ritual completion.
 */
export function formatProgressBar(current, max, width = 10, filledColor = "§a", emptyColor = "§8") {
  const safeMax = Math.max(1, Number(max) || 1);
  const ratio = Math.max(0, Math.min(1, (Number(current) || 0) / safeMax));
  const filled = Math.round(ratio * width);
  return `${filledColor}${"█".repeat(filled)}${emptyColor}${"▒".repeat(Math.max(0, width - filled))}§r`;
}

// ============================================================================
// PLAYER INVENTORY & EQUIPMENT ADAPTER (`@minecraft/server` 2.9+)
// ============================================================================

export function isPlayerCreative(player) {
  if (!player) return false;
  try {
    const mode =
      typeof player.getGameMode === "function"
        ? String(player.getGameMode() ?? "").toLowerCase()
        : String(player.gameMode ?? "").toLowerCase();
    return mode === "creative";
  } catch {
    return false;
  }
}

export function getPlayerContainer(player) {
  if (!player) return null;
  try {
    const inv =
      player.getComponent?.("minecraft:inventory") ??
      player.getComponent?.("inventory") ??
      player.inventory ??
      null;
    return inv?.container ?? null;
  } catch {
    return null;
  }
}

export function getPlayerEquippable(player) {
  if (!player) return null;
  try {
    return (
      player.getComponent?.("minecraft:equippable") ??
      player.getComponent?.("equippable") ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * Lists all non-empty stacks in the player's inventory container (or fallback mainhand).
 */
export function listPlayerInventoryStacks(player) {
  const stacks = [];
  const container = getPlayerContainer(player);
  if (container && typeof container.size === "number" && typeof container.getItem === "function") {
    for (let slot = 0; slot < container.size; slot++) {
      try {
        const st = container.getItem(slot);
        if (!st || !st.typeId || (st.amount ?? 1) <= 0) continue;
        const durComp = st.getComponent?.("minecraft:durability") ?? null;
        stacks.push({
          slot,
          source: "container",
          typeId: String(st.typeId),
          itemId: String(st.typeId),
          count: Number(st.amount ?? 1),
          nameTag: st.nameTag ?? null,
          damage: Number(durComp?.damage ?? st.damage ?? 0),
          maxDurability: Number(durComp?.maxDurability ?? st.maxDurability ?? 0),
          rawStack: st
        });
      } catch {}
    }
    return stacks;
  }

  // Fallback for players/mocks with only equippable Mainhand
  const eq = getPlayerEquippable(player);
  if (eq && typeof eq.getEquipment === "function") {
    try {
      const main = eq.getEquipment("Mainhand");
      if (main && main.typeId && (main.amount ?? 1) > 0) {
        const durComp = main.getComponent?.("minecraft:durability") ?? null;
        stacks.push({
          slot: 0,
          source: "equippable",
          typeId: String(main.typeId),
          itemId: String(main.typeId),
          count: Number(main.amount ?? 1),
          nameTag: main.nameTag ?? null,
          damage: Number(durComp?.damage ?? main.damage ?? 0),
          maxDurability: Number(durComp?.maxDurability ?? main.maxDurability ?? 0),
          rawStack: main
        });
      }
    } catch {}
  }
  return stacks;
}

/**
 * Counts how many items matching `predicate` exist in the player's inventory.
 */
export function countPlayerItem(player, predicate, tagMap = ITEM_TAG_MEMBERS) {
  if (!predicate) return 0;
  const stacks = listPlayerInventoryStacks(player);
  let total = 0;
  for (const st of stacks) {
    if (matchesIngredientPredicate(predicate, { itemId: st.itemId, count: st.count }, tagMap)) {
      total += st.count;
    }
  }
  return total;
}

/**
 * Consumes `count` items matching `predicate` from the player's inventory (or succeeds
 * without deduction in Creative mode).
 */
export function consumePlayerItem(player, predicate, count = 1, tagMap = ITEM_TAG_MEMBERS) {
  const needed = Math.max(1, Math.trunc(Number(count) || 1));
  if (isPlayerCreative(player)) {
    const resolvedId =
      typeof predicate === "string" && !predicate.startsWith("#")
        ? predicate
        : ITEM_TAG_MEMBERS[String(predicate).replace(/^#/, "")]?.[0] ?? "betterend:thallasium_ingot";
    return { ok: true, creative: true, consumed: needed, itemId: resolvedId };
  }

  const available = countPlayerItem(player, predicate, tagMap);
  if (available < needed) {
    return { ok: false, consumed: 0, missing: needed - available, available };
  }

  let remaining = needed;
  let matchedItemId = null;
  const container = getPlayerContainer(player);
  if (container && typeof container.size === "number" && typeof container.getItem === "function") {
    for (let slot = 0; slot < container.size && remaining > 0; slot++) {
      const st = container.getItem(slot);
      if (!st || !st.typeId) continue;
      const amt = Number(st.amount ?? 1);
      if (amt <= 0) continue;
      if (!matchesIngredientPredicate(predicate, { itemId: st.typeId, count: amt }, tagMap)) {
        continue;
      }
      if (!matchedItemId) matchedItemId = String(st.typeId);
      const take = Math.min(remaining, amt);
      remaining -= take;
      if (amt - take <= 0) {
        container.setItem(slot, undefined);
      } else {
        st.amount = amt - take;
        container.setItem(slot, st);
      }
    }
    return { ok: true, consumed: needed, itemId: matchedItemId };
  }

  const eq = getPlayerEquippable(player);
  if (eq && typeof eq.getEquipment === "function" && typeof eq.setEquipment === "function") {
    const main = eq.getEquipment("Mainhand");
    if (main && matchesIngredientPredicate(predicate, { itemId: main.typeId, count: main.amount ?? 1 }, tagMap)) {
      matchedItemId = String(main.typeId);
      const amt = Number(main.amount ?? 1);
      if (amt - needed <= 0) {
        eq.setEquipment("Mainhand", undefined);
      } else {
        main.amount = amt - needed;
        eq.setEquipment("Mainhand", main);
      }
      return { ok: true, consumed: needed, itemId: matchedItemId };
    }
  }

  return { ok: false, consumed: 0, missing: remaining };
}

/**
 * Creates a configured `@minecraft/server` `ItemStack` (or plain object fallback in unit tests)
 * and deposits it into the player's inventory container (or spawns it in the world if full).
 */
export function depositPlayerItem(player, itemSpec, serverModule = null) {
  if (!player || !itemSpec) return { ok: false };
  const itemId = String(itemSpec.itemId ?? itemSpec.item ?? itemSpec.typeId ?? "");
  const count = Math.max(1, Math.trunc(Number(itemSpec.count ?? itemSpec.amount ?? 1)));
  if (!itemId) return { ok: false };

  const ItemStackCtor = serverModule?.ItemStack ?? null;
  let stackObj = null;

  if (typeof ItemStackCtor === "function") {
    try {
      stackObj = new ItemStackCtor(itemId, count);
    } catch {}
  }
  const enchMap = itemSpec.enchantments ?? itemSpec.components?.["minecraft:enchantments"] ?? null;
  if (!stackObj) {
    stackObj = {
      typeId: itemId,
      itemId,
      amount: count,
      nameTag: undefined,
      lore: [],
      enchantments: enchMap ? { ...enchMap } : undefined,
      _durability: {
        damage: Number(itemSpec.damage ?? 0),
        maxDurability: Number(itemSpec.maxDurability ?? 500)
      },
      getComponent(compId) {
        if (compId === "minecraft:durability" || compId === "durability") {
          return this._durability;
        }
        return null;
      },
      setLore(lines) {
        this.lore = Array.isArray(lines) ? [...lines] : [];
      }
    };
  }

  const desiredName = itemSpec.nameTag ?? itemSpec.customName ?? null;
  if (desiredName) {
    try {
      stackObj.nameTag = String(desiredName);
    } catch {}
  }

  if (typeof itemSpec.damage === "number") {
    try {
      const dur = stackObj.getComponent?.("minecraft:durability");
      if (dur) dur.damage = Math.max(0, Math.trunc(itemSpec.damage));
    } catch {}
  }

  if (enchMap && typeof enchMap === "object" && Object.keys(enchMap).length > 0) {
    let appliedNativeEnchant = false;
    try {
      const enchComp =
        stackObj.getComponent?.("minecraft:enchantable") ??
        stackObj.getComponent?.("enchantable");
      if (enchComp && typeof enchComp.addEnchantment === "function") {
        for (const [enchId, lvl] of Object.entries(enchMap)) {
          const bareEnch = String(enchId).replace(/^minecraft:/, "");
          const EnchantmentTypeCtor = serverModule?.EnchantmentType;
          const typeArg =
            typeof EnchantmentTypeCtor === "function" ? new EnchantmentTypeCtor(bareEnch) : bareEnch;
          enchComp.addEnchantment({ type: typeArg, level: Number(lvl) || 1 });
        }
        appliedNativeEnchant = true;
      }
    } catch {}

    const enchDescriptions = Object.entries(enchMap).map(
      ([enchId, lvl]) => `§r§7${formatTitle(enchId)} ${toRomanNumeral(Number(lvl) || 1)}`
    );
    try {
      if (typeof stackObj.setLore === "function") {
        stackObj.setLore(["§dBetterEnd Infusion Ritual", ...enchDescriptions]);
      }
      if (!desiredName && itemId === "minecraft:enchanted_book" && !appliedNativeEnchant) {
        const firstLabel = Object.entries(enchMap)
          .map(([k, v]) => `${formatTitle(k)} ${toRomanNumeral(Number(v) || 1)}`)
          .join(", ");
        stackObj.nameTag = `§eEnchanted Book (${firstLabel})`;
      }
    } catch {}
  }

  const container = getPlayerContainer(player);
  if (container) {
    try {
      if (typeof container.addItem === "function") {
        const leftover = container.addItem(stackObj);
        if (!leftover) {
          return { ok: true, itemId, count, stack: stackObj, method: "container.addItem" };
        }
      }
      if (typeof container.size === "number" && typeof container.getItem === "function") {
        let rem = count;
        const canStack = !desiredName && !enchMap && typeof itemSpec.damage !== "number";
        if (canStack) {
          for (let s = 0; s < container.size && rem > 0; s++) {
            const cur = container.getItem(s);
            if (cur && cur.typeId === itemId && (cur.amount ?? 1) < 64) {
              const space = 64 - (cur.amount ?? 1);
              const add = Math.min(space, rem);
              cur.amount = (cur.amount ?? 1) + add;
              container.setItem(s, cur);
              rem -= add;
            }
          }
        }
        for (let s = 0; s < container.size && rem > 0; s++) {
          const cur = container.getItem(s);
          if (!cur || !cur.typeId || (cur.amount ?? 0) <= 0) {
            stackObj.amount = rem;
            container.setItem(s, stackObj);
            rem = 0;
          }
        }
        if (rem <= 0) {
          return { ok: true, itemId, count, stack: stackObj, method: "container.setItem" };
        }
      }
    } catch {}
  }

  // Fallback 1: spawn item entity at player location
  try {
    if (player.dimension && typeof player.dimension.spawnItem === "function" && player.location) {
      player.dimension.spawnItem(stackObj, player.location);
      return { ok: true, itemId, count, stack: stackObj, method: "dimension.spawnItem" };
    }
  } catch {}

  // Fallback 2: equippable mainhand if empty
  const eq = getPlayerEquippable(player);
  if (eq && typeof eq.getEquipment === "function" && typeof eq.setEquipment === "function") {
    try {
      const curMain = eq.getEquipment("Mainhand");
      if (!curMain || !curMain.typeId) {
        eq.setEquipment("Mainhand", stackObj);
        return { ok: true, itemId, count, stack: stackObj, method: "equippable.Mainhand" };
      }
    } catch {}
  }

  // Fallback 3: record for minimal mock players
  if (Array.isArray(player._depositedItems)) {
    player._depositedItems.push({ itemId, count, stack: stackObj });
  } else {
    player._depositedItems = [{ itemId, count, stack: stackObj }];
  }
  return { ok: true, itemId, count, stack: stackObj, method: "mock_deposit" };
}

/**
 * Finds the highest-tier Hammer or Digger Tool in the player's inventory (`toolLevel >= minToolLevel`).
 */
export function findBestPlayerHammerOrTool(player, minToolLevel = 0) {
  const stacks = listPlayerInventoryStacks(player);
  let best = null;
  for (const st of stacks) {
    const id = st.itemId;
    const isHammer = id.endsWith("_hammer");
    const isTool =
      isHammer ||
      id.endsWith("_pickaxe") ||
      id.endsWith("_axe") ||
      id.endsWith("_shovel") ||
      id.endsWith("_sword") ||
      id.endsWith("_hoe");
    if (!isTool) continue;
    const level = resolveDiggerToolLevel({ itemId: id });
    if (level < minToolLevel) continue;
    if (
      !best ||
      (isHammer && !best.isHammer) ||
      (isHammer === best.isHammer && level > best.toolLevel)
    ) {
      best = {
        ...st,
        isHammer,
        toolLevel: level
      };
    }
  }
  return best;
}

/**
 * Applies durability wear to a tool in the player's inventory (or no-ops in Creative mode).
 */
export function damagePlayerTool(player, toolEntry, damageAmount = 1) {
  if (!player || !toolEntry || isPlayerCreative(player)) {
    return { broken: false, damageApplied: 0 };
  }
  const dmg = Math.max(0, Math.trunc(Number(damageAmount) || 0));
  if (dmg <= 0) return { broken: false, damageApplied: 0 };

  const container = getPlayerContainer(player);
  const raw = toolEntry.rawStack;
  const durComp = raw?.getComponent?.("minecraft:durability") ?? raw?.getComponent?.("durability");
  const curDamage = Number(durComp?.damage ?? raw?.damage ?? toolEntry.damage ?? 0);
  const maxDur = Number(durComp?.maxDurability ?? raw?.maxDurability ?? toolEntry.maxDurability ?? 250);
  const nextDamage = curDamage + dmg;
  const broken = maxDur > 0 && nextDamage >= maxDur;

  try {
    if (broken) {
      if (toolEntry.source === "container" && container) {
        container.setItem(toolEntry.slot, undefined);
      } else if (toolEntry.source === "equippable") {
        getPlayerEquippable(player)?.setEquipment?.("Mainhand", undefined);
      }
      player.playSound?.("random.break");
    } else if (raw) {
      if (durComp) durComp.damage = nextDamage;
      raw.damage = nextDamage;
      if (toolEntry.source === "container" && container) {
        container.setItem(toolEntry.slot, raw);
      } else if (toolEntry.source === "equippable") {
        getPlayerEquippable(player)?.setEquipment?.("Mainhand", raw);
      }
    }
  } catch {}

  return { broken, damageApplied: dmg, remainingDurability: Math.max(0, maxDur - nextDamage) };
}

export function toRomanNumeral(num) {
  const map = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return map[(Number(num) || 1) - 1] ?? String(num);
}

function setBlockStateSafe(block, dim, loc, blockId, statePatch) {
  try {
    const targetBlock = block ?? dim?.getBlock?.(loc);
    if (!targetBlock) return false;
    let perm = targetBlock.permutation;
    if (perm && typeof perm.withState === "function") {
      for (const [k, v] of Object.entries(statePatch)) {
        try {
          perm = perm.withState(k, v);
        } catch {}
      }
      targetBlock.setPermutation(perm);
      return true;
    }
  } catch {}
  return false;
}

// ============================================================================
// 1. END STONE SMELTER & 8 END FURNACES UI (`EndStoneSmelterScreen` Parity)
// ============================================================================

export function openSmelterStationUi(runtime, player, block, options = {}) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData || !player) return;

  const blockId = String(block?.typeId ?? "betterend:end_stone_smelter");
  const shortName = blockId.replace(/^betterend:/, "").replace(/__p\d+$/, "");
  const singleInputOnly = Boolean(options.singleInputOnly || shortName.endsWith("_furnace"));
  const dim = block?.dimension ?? player.dimension;
  const dimId = normalizeDimensionId(dim?.id ?? "minecraft:the_end");
  const loc = normalizeBlockAnchor(block?.location ?? player.location ?? { x: 0, y: 64, z: 0 });
  const pid = player.id ?? player.name ?? "player";
  const creative = isPlayerCreative(player);

  let state = runtime.stationsService.getSmelterState({ dimension: dimId, anchor: loc });
  if (!state) {
    state = runtime.stationsService.createSmelter({ dimension: dimId, anchor: loc });
  }

  const isLit = state.availableHeat > 0 || state.progress > 0;
  const heatBar = formatProgressBar(state.availableHeat, Math.max(1600, state.maxHeat || 1600), 10, "§6", "§8");
  const progBar = formatProgressBar(state.progress, Math.max(200, state.smeltTime || 200), 10, "§a", "§8");

  const slotLabel = (s) => (s ? `§f${s.count}x ${formatTitle(s.itemId)}` : "§8[Empty]");
  const titleText = singleInputOnly ? formatTitle(shortName) : "End Stone Smelter";

  const bodyLines = [
    `§dStation: §f${titleText} §7@ (${loc.x}, ${loc.y}, ${loc.z})`,
    `§dState: ${isLit ? "§6🔥 Lit (Active)" : "§7❄ Unlit (Idle)"} §8| §dSpeed: §b${(state.speedMultiplier || 1).toFixed(2)}x`,
    `§dHeat: ${heatBar} §7(${state.availableHeat}/${state.maxHeat || 0})`,
    `§dSmelt: ${progBar} §7(${Math.floor(state.progress)}/${state.smeltTime || 200}t)`,
    `§dInput A: ${slotLabel(state.input0)}` + (singleInputOnly ? "" : ` §8| §dInput B: ${slotLabel(state.input1)}`),
    `§dFuel: ${slotLabel(state.fuel)} §8| §dOutput: ${slotLabel(state.output)} §8| §dXP: §a${(state.storedXp || 0).toFixed(1)}`
  ];

  const findAvailableFuelId = () => {
    if (state.availableHeat > 0) return "active_heat";
    if (state.fuel && SMELTER_FUEL_REGISTRY[state.fuel.itemId]) return state.fuel.itemId;
    for (const fuelId of Object.keys(SMELTER_FUEL_REGISTRY)) {
      if (countPlayerItem(player, fuelId) > 0) return fuelId;
    }
    return creative ? "minecraft:coal" : null;
  };

  const activeFuelSource = findAvailableFuelId();
  bodyLines.push(
    activeFuelSource === "active_heat"
      ? `§a✔ Smelter has active heat ready for smelting.`
      : activeFuelSource
        ? `§a✔ Fuel ready: §f${formatTitle(activeFuelSource)}`
        : `§e⚠ No fuel in smelter or inventory (Coal, Charcoal, End Charcoal, Amber Gem, Blaze Rod, Lava Bucket).`
  );

  const form = new ActionFormData().title(titleText).body(bodyLines.join("\n"));
  const actions = [];

  if ((state.output && state.output.count > 0) || (state.storedXp ?? 0) > 0) {
    const outLabel = state.output
      ? `Take Output: ${state.output.count}x ${formatTitle(state.output.itemId)} (+${(state.storedXp || 0).toFixed(1)} XP)`
      : `Claim Stored Smelter XP (+${(state.storedXp || 0).toFixed(1)} XP)`;
    form.button(
      `§a${outLabel}`,
      resolveUiIconPath(state.output?.itemId ?? "betterend:end_stone_smelter")
    );
    actions.push({ type: "claim_output" });
  }

  if (runtime.uiModule?.ModalFormData) {
    form.button(
      "§bLoad Ingredients & Fuel from Inventory...",
      resolveUiIconPath("betterend:charcoal_end")
    );
    actions.push({ type: "open_load_modal" });
  }

  if (state.input0 || state.input1 || state.fuel || state.output) {
    form.button(
      "§eWithdraw All Smelter Slots to Inventory",
      resolveUiIconPath("betterend:end_stone_smelter")
    );
    actions.push({ type: "withdraw_all" });
  }

  const recipeEntries = [
    ...(singleInputOnly
      ? []
      : DEFAULT_ALLOYING_RECIPES.map((r) => ({
          kind: "alloy",
          recipe: r,
          resultItem: r.result.item,
          resultCount: r.result.count,
          ingA: r.ingredients[0],
          ingB: r.ingredients[1]
        }))),
    ...DEFAULT_SINGLE_INPUT_SMELTER_RECIPES.map((r) => ({
      kind: "smelt",
      recipe: r,
      resultItem: r.result.item,
      resultCount: r.result.count,
      ingA: r.ingredient,
      ingB: null
    }))
  ];

  for (const entry of recipeEntries) {
    const hasA =
      creative ||
      (state.input0 && matchesIngredientPredicate(entry.ingA, state.input0)) ||
      countPlayerItem(player, entry.ingA) >= 1;
    const hasB =
      !entry.ingB ||
      creative ||
      (state.input1 && matchesIngredientPredicate(entry.ingB, state.input1)) ||
      (entry.ingA === entry.ingB
        ? countPlayerItem(player, entry.ingA) >= 2
        : countPlayerItem(player, entry.ingB) >= 1);
    const ready = hasA && hasB && Boolean(activeFuelSource);
    const badge = ready ? "§a[Smelt]" : "§7[Need Mat/Fuel]";
    const ingDesc = entry.ingB
      ? `${formatTitle(entry.ingA)} + ${formatTitle(entry.ingB)}`
      : `${formatTitle(entry.ingA)}`;
    form.button(
      `${badge} §r${formatTitle(entry.resultItem)} x${entry.resultCount}\n§8${ingDesc}`,
      resolveUiIconPath(entry.resultItem)
    );
    actions.push({ type: "craft_recipe", entry });
  }

  form
    .show(player)
    .then((res) => {
      if (!res || res.canceled || res.selection === undefined) return;
      const chosen = actions[res.selection];
      if (!chosen) return;

      if (chosen.type === "claim_output") {
        const latest = runtime.stationsService.getSmelterState({ dimension: dimId, anchor: loc });
        if (latest?.output && latest.output.count > 0) {
          depositPlayerItem(player, latest.output, runtime.serverModule);
          runtime.stationsService.setSmelterSlots({
            dimension: dimId,
            anchor: loc,
            output: null
          });
        }
        const xpAwarded = Number(
          runtime.stationsService.claimSmelterXp({
            dimension: dimId,
            anchor: loc
          }) || 0
        );
        if (xpAwarded > 0) {
          try {
            player.addExperience?.(Math.ceil(xpAwarded));
          } catch {}
        }
        try {
          player.playSound?.("random.orb");
          player.onScreenDisplay?.setActionBar?.(
            `§a[${titleText}] Claimed output & +${xpAwarded.toFixed(1)} XP!`
          );
        } catch {}
        return;
      }

      if (chosen.type === "withdraw_all") {
        const latest = runtime.stationsService.getSmelterState({ dimension: dimId, anchor: loc });
        if (latest) {
          for (const slotKey of ["input0", "input1", "fuel", "output"]) {
            if (latest[slotKey] && latest[slotKey].count > 0) {
              depositPlayerItem(player, latest[slotKey], runtime.serverModule);
            }
          }
          runtime.stationsService.setSmelterSlots({
            dimension: dimId,
            anchor: loc,
            input0: null,
            input1: null,
            fuel: null,
            output: null
          });
          try {
            player.playSound?.("random.pop");
            player.onScreenDisplay?.setActionBar?.(
              `§e[${titleText}] Withdrew all slots to inventory.`
            );
          } catch {}
        }
        return;
      }

      if (chosen.type === "open_load_modal") {
        openSmelterLoadModalUi(runtime, player, block, { singleInputOnly, dimId, loc, titleText });
        return;
      }

      if (chosen.type === "craft_recipe") {
        executeSmelterRecipeFromUi(runtime, player, block, chosen.entry, {
          dim,
          dimId,
          loc,
          pid,
          titleText
        });
      }
    })
    .catch(() => {});
}

function openSmelterLoadModalUi(runtime, player, block, { singleInputOnly, dimId, loc, titleText }) {
  const ModalFormData = runtime.uiModule?.ModalFormData;
  if (!ModalFormData) return;

  const invStacks = listPlayerInventoryStacks(player);
  const fuelStacks = invStacks.filter((s) => Boolean(SMELTER_FUEL_REGISTRY[s.itemId]));

  const itemChoices = [
    "[Keep Current Slot]",
    ...invStacks.map((s) => `${formatTitle(s.itemId)} (x${s.count}) [${s.itemId}]`)
  ];
  const fuelChoices = [
    "[Keep Current Fuel]",
    ...fuelStacks.map((s) => `${formatTitle(s.itemId)} (x${s.count}) [${s.itemId}]`)
  ];

  const modal = new ModalFormData()
    .title(`${titleText} — Load Slots`)
    .dropdown("Input Slot A (from Inventory):", itemChoices, { defaultValueIndex: 0 });

  if (!singleInputOnly) {
    modal.dropdown("Input Slot B (Alloying Second Input):", itemChoices, { defaultValueIndex: 0 });
  }
  modal
    .dropdown("Fuel Slot (from Inventory):", fuelChoices, { defaultValueIndex: 0 })
    .slider("Max Items to Load per Selected Slot", 1, 64, { valueStep: 1, defaultValue: 8 });

  modal
    .show(player)
    .then((res) => {
      if (!res || res.canceled || !Array.isArray(res.formValues)) return;
      const idxA = Number(res.formValues[0] ?? 0);
      const idxB = singleInputOnly ? 0 : Number(res.formValues[1] ?? 0);
      const idxFuel = Number(res.formValues[singleInputOnly ? 1 : 2] ?? 0);
      const maxCount = Math.max(1, Number(res.formValues[singleInputOnly ? 2 : 3] ?? 8));

      const state =
        runtime.stationsService.getSmelterState({ dimension: dimId, anchor: loc }) ??
        runtime.stationsService.createSmelter({ dimension: dimId, anchor: loc });

      const transferIntoSlot = (choiceIndex, sourceList, currentSlot) => {
        if (choiceIndex <= 0 || choiceIndex - 1 >= sourceList.length) return currentSlot;
        const picked = sourceList[choiceIndex - 1];
        if (!picked) return currentSlot;
        if (currentSlot && currentSlot.itemId !== picked.itemId) {
          depositPlayerItem(player, currentSlot, runtime.serverModule);
          currentSlot = null;
        }
        const want = Math.min(maxCount, picked.count);
        const consumed = consumePlayerItem(player, picked.itemId, want);
        if (!consumed.ok) return currentSlot;
        return {
          itemId: picked.itemId,
          count: (currentSlot?.count ?? 0) + consumed.consumed
        };
      };

      const nextInput0 = transferIntoSlot(idxA, invStacks, state.input0);
      const nextInput1 = singleInputOnly
        ? null
        : transferIntoSlot(idxB, invStacks, state.input1);
      const nextFuel = transferIntoSlot(idxFuel, fuelStacks, state.fuel);

      runtime.stationsService.setSmelterSlots({
        dimension: dimId,
        anchor: loc,
        input0: nextInput0,
        input1: nextInput1,
        fuel: nextFuel
      });
      runtime.stationsService.tickSmelter({ dimension: dimId, anchor: loc, ticks: 20 });
      const after = runtime.stationsService.getSmelterState({ dimension: dimId, anchor: loc });
      setBlockStateSafe(block, block?.dimension ?? player.dimension, loc, block?.typeId, {
        "betterend:lit": Boolean(after && (after.availableHeat > 0 || after.progress > 0))
      });
      try {
        player.playSound?.("random.pop");
        player.onScreenDisplay?.setActionBar?.(
          `§a[${titleText}] Loaded slots & started smelting!`
        );
      } catch {}
    })
    .catch(() => {});
}

function executeSmelterRecipeFromUi(
  runtime,
  player,
  block,
  entry,
  { dim, dimId, loc, pid, titleText }
) {
  let state =
    runtime.stationsService.getSmelterState({ dimension: dimId, anchor: loc }) ??
    runtime.stationsService.createSmelter({ dimension: dimId, anchor: loc });

  const creative = isPlayerCreative(player);

  let slot0 = state.input0;
  let slot1 = state.input1;
  let fuelSlot = state.fuel;

  let pulledA = null;
  if (!slot0 || !matchesIngredientPredicate(entry.ingA, slot0)) {
    const resA = consumePlayerItem(player, entry.ingA, 1);
    if (!resA.ok) {
      try {
        player.playSound?.("note.bass");
        player.onScreenDisplay?.setActionBar?.(
          `§c[${titleText}] Missing ingredient: ${formatTitle(entry.ingA)}`
        );
      } catch {}
      return;
    }
    pulledA = resA;
    if (slot0) depositPlayerItem(player, slot0, runtime.serverModule);
    slot0 = { itemId: resA.itemId, count: 1 };
  }

  let pulledB = null;
  if (entry.ingB) {
    if (!slot1 || !matchesIngredientPredicate(entry.ingB, slot1)) {
      const resB = consumePlayerItem(player, entry.ingB, 1);
      if (!resB.ok) {
        if (pulledA && !pulledA.creative) {
          depositPlayerItem(player, { itemId: pulledA.itemId, count: 1 }, runtime.serverModule);
        }
        try {
          player.playSound?.("note.bass");
          player.onScreenDisplay?.setActionBar?.(
            `§c[${titleText}] Missing second ingredient: ${formatTitle(entry.ingB)}`
          );
        } catch {}
        return;
      }
      pulledB = resB;
      if (slot1) depositPlayerItem(player, slot1, runtime.serverModule);
      slot1 = { itemId: resB.itemId, count: 1 };
    }
  } else if (slot1) {
    depositPlayerItem(player, slot1, runtime.serverModule);
    slot1 = null;
  }

  if (state.availableHeat <= 0 && (!fuelSlot || !SMELTER_FUEL_REGISTRY[fuelSlot.itemId])) {
    let foundFuelId = null;
    for (const fId of Object.keys(SMELTER_FUEL_REGISTRY)) {
      if (countPlayerItem(player, fId) > 0) {
        foundFuelId = fId;
        break;
      }
    }
    if (!foundFuelId && creative) {
      foundFuelId = "minecraft:coal";
    }
    if (!foundFuelId) {
      if (pulledA && !pulledA.creative) {
        depositPlayerItem(player, { itemId: pulledA.itemId, count: 1 }, runtime.serverModule);
      }
      if (pulledB && !pulledB.creative) {
        depositPlayerItem(player, { itemId: pulledB.itemId, count: 1 }, runtime.serverModule);
      }
      try {
        player.playSound?.("note.bass");
        player.onScreenDisplay?.setActionBar?.(
          `§c[${titleText}] Missing fuel (Coal, Charcoal, End Charcoal, Amber Gem, Blaze Rod, or Lava Bucket)!`
        );
      } catch {}
      return;
    }
    const consumedFuel = consumePlayerItem(player, foundFuelId, 1);
    if (consumedFuel.ok) {
      fuelSlot = { itemId: foundFuelId, count: 1 };
    }
  }

  if (state.output && state.output.itemId !== entry.resultItem) {
    depositPlayerItem(player, state.output, runtime.serverModule);
    runtime.stationsService.setSmelterSlots({ dimension: dimId, anchor: loc, output: null });
  }

  runtime.stationsService.setSmelterSlots({
    dimension: dimId,
    anchor: loc,
    input0: slot0,
    input1: slot1,
    fuel: fuelSlot
  });

  const smeltTicks = Number(entry.recipe.smeltTime ?? 200) + 10;
  const afterSmelt = runtime.stationsService.tickSmelter({
    dimension: dimId,
    anchor: loc,
    ticks: smeltTicks
  });

  if (afterSmelt.fuel && afterSmelt.fuel.itemId === "minecraft:bucket") {
    depositPlayerItem(player, afterSmelt.fuel, runtime.serverModule);
    runtime.stationsService.setSmelterSlots({ dimension: dimId, anchor: loc, fuel: null });
  }

  const latest = runtime.stationsService.getSmelterState({ dimension: dimId, anchor: loc });
  if (latest?.output && latest.output.count > 0) {
    depositPlayerItem(player, latest.output, runtime.serverModule);
    runtime.stationsService.setSmelterSlots({ dimension: dimId, anchor: loc, output: null });
  }
  const xpAwarded = Number(
    runtime.stationsService.claimSmelterXp({
      dimension: dimId,
      anchor: loc
    }) || 0
  );
  if (xpAwarded > 0) {
    try {
      player.addExperience?.(Math.ceil(xpAwarded));
    } catch {}
  }

  setBlockStateSafe(block, dim, loc, block?.typeId, {
    "betterend:lit": Boolean(latest && latest.availableHeat > 0)
  });

  runtime.presentationService?.awardAdvancement?.(pid, "betterend:end_stone_smelter");
  if (entry.resultItem === "betterend:thallasium_ingot") {
    runtime.presentationService?.awardAdvancement?.(pid, "betterend:thallasium");
  } else if (entry.resultItem === "betterend:terminite_ingot") {
    runtime.presentationService?.awardAdvancement?.(pid, "betterend:terminite");
  } else if (entry.resultItem === "betterend:aeternium_ingot") {
    runtime.presentationService?.awardAdvancement?.(pid, "betterend:aeternium");
  }

  try {
    player.playSound?.("random.fizz");
    dim?.spawnParticle?.("minecraft:basic_flame_particle", {
      x: loc.x + 0.5,
      y: loc.y + 0.8,
      z: loc.z + 0.5
    });
    player.onScreenDisplay?.setActionBar?.(
      `§a[${titleText}] Smelted ${entry.resultCount}x ${formatTitle(entry.resultItem)} (+${xpAwarded.toFixed(1)} XP)!`
    );
  } catch {}
}

/**
 * Steps all active smelters in `StationsService` during `_stepLiveWorldTick` and updates
 * their in-world `betterend:lit` block state.
 */
export function stepLiveSmelters(runtime, ticks = 10) {
  const smelters = runtime?.stationsService?._smelters;
  if (!smelters || smelters.size === 0) return;

  for (const [, smelter] of smelters) {
    if (!smelter) continue;
    const hasWork = Boolean(smelter.input0 || smelter.input1 || smelter.availableHeat > 0);
    if (!hasWork) continue;
    const prevLit = smelter.availableHeat > 0 || smelter.progress > 0;
    const updated = runtime.stationsService.tickSmelter({
      dimension: smelter.dimension,
      anchor: smelter.anchor,
      ticks
    });
    const nextLit = Boolean(updated && (updated.availableHeat > 0 || updated.progress > 0));
    if (prevLit !== nextLit || nextLit) {
      try {
        const dim = runtime.serverModule?.world?.getDimension?.(smelter.dimension);
        if (dim) {
          if (prevLit !== nextLit) {
            setBlockStateSafe(null, dim, smelter.anchor, null, { "betterend:lit": nextLit });
          }
          if (nextLit && Math.random() < 0.35) {
            dim.spawnParticle?.("minecraft:basic_flame_particle", {
              x: smelter.anchor.x + 0.5,
              y: smelter.anchor.y + 0.85,
              z: smelter.anchor.z + 0.5
            });
          }
        }
      } catch {}
    }
  }
}

// ============================================================================
// 2. LEVELED & AETERNIUM ANVILS UI (`bclib:smithing` + Repair/Combine/Rename)
// ============================================================================

export function openAnvilStationUi(runtime, player, block) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData || !player) return;

  const blockId = String(block?.typeId ?? "betterend:thallasium_anvil");
  const shortName = blockId.replace(/^betterend:/, "").replace(/__p\d+$/, "");
  const dim = block?.dimension ?? player.dimension;
  const dimId = normalizeDimensionId(dim?.id ?? "minecraft:the_end");
  const loc = normalizeBlockAnchor(block?.location ?? player.location ?? { x: 0, y: 64, z: 0 });
  const pid = player.id ?? player.name ?? "player";
  const creative = isPlayerCreative(player);

  const anvilTier = resolveAnvilLevel(blockId);
  let stationRecord = runtime.store.getStation({ dimension: dimId, anchor: loc });
  if (!stationRecord || stationRecord.stationType !== "betterend:anvil") {
    stationRecord = runtime.store.registerStation({
      dimension: dimId,
      anchor: loc,
      stationType: "betterend:anvil",
      state: {
        anvilLevel: anvilTier,
        destruction: 0,
        durability: anvilTier >= 5 ? 12 : 3,
        maxDurability: anvilTier >= 5 ? 12 : 3
      }
    });
  }

  const anvilState = stationRecord.state ?? {
    anvilLevel: anvilTier,
    destruction: 0,
    durability: 3,
    maxDurability: anvilTier >= 5 ? 12 : 3
  };
  const bestTool = findBestPlayerHammerOrTool(player, 0);
  const effectiveToolLevel = creative ? 5 : (bestTool?.toolLevel ?? -1);

  const bodyLines = [
    `§dAnvil: §f${formatTitle(shortName)} §7(Tier ${anvilTier})`,
    `§dWear Stage: §e${anvilState.destruction ?? 0}/2 §8| §dIntegrity: §a${anvilState.durability ?? 3}/${anvilState.maxDurability ?? 3}`,
    bestTool
      ? `§dEquipped Hammer/Tool: §b${formatTitle(bestTool.itemId)} §7(Tool Tier ${bestTool.toolLevel})`
      : creative
        ? `§aCreative Mode: §fAll Hammer Tiers Unlocked`
        : `§e⚠ No Hammer/Tool in inventory (Craft an Iron, Thallasium, Diamond, Terminite, Netherite, or Aeternium Hammer).`,
    `\n§7Choose §bRepair, Combine & Rename §7or forge a §dBetterEnd Smithing Recipe §7below:`
  ];

  const form = new ActionFormData()
    .title(`${formatTitle(shortName)} (Tier ${anvilTier})`)
    .body(bodyLines.join("\n"));

  const actions = [];

  if (runtime.uiModule?.ModalFormData) {
    form.button(
      "§bRepair, Combine & Rename Item...\n§81-Unit Material Cost Reduction",
      resolveUiIconPath(blockId)
    );
    actions.push({ type: "open_repair_modal" });
  }

  const available = DEFAULT_SMITHING_RECIPES.filter((r) => r.anvilLevel <= anvilTier);
  for (const r of available) {
    const ownedCount = countPlayerItem(player, r.input);
    const hasMat = creative || ownedCount >= r.inputCount;
    const hasTool = creative || effectiveToolLevel >= r.toolLevel;
    const ready = hasMat && hasTool;
    const badge = ready ? "§a[Forge]" : !hasTool ? `§c[Need Tier ${r.toolLevel} Hammer]` : "§7[Need Ingots]";
    form.button(
      `${badge} §r${formatTitle(r.result.item)} x${r.result.count}\n§8Cost: ${r.inputCount}x ${formatTitle(r.input)} (Have ${ownedCount}) | Tool Lvl ${r.toolLevel}`,
      resolveUiIconPath(r.result.item)
    );
    actions.push({ type: "smith_recipe", recipe: r });
  }

  form
    .show(player)
    .then((res) => {
      if (!res || res.canceled || res.selection === undefined) return;
      const chosen = actions[res.selection];
      if (!chosen) return;

      if (chosen.type === "open_repair_modal") {
        openAnvilRepairAndRenameModalUi(runtime, player, block, {
          dim,
          dimId,
          loc,
          blockId,
          shortName,
          anvilTier
        });
        return;
      }

      if (chosen.type === "smith_recipe") {
        const r = chosen.recipe;
        const toolEntry = findBestPlayerHammerOrTool(player, r.toolLevel);
        if (!creative && !toolEntry) {
          try {
            player.playSound?.("note.bass");
            player.onScreenDisplay?.setActionBar?.(
              `§c[${formatTitle(shortName)}] Requires a Hammer/Tool of Tier >= ${r.toolLevel}!`
            );
          } catch {}
          return;
        }
        const haveMat = countPlayerItem(player, r.input);
        if (!creative && haveMat < r.inputCount) {
          try {
            player.playSound?.("note.bass");
            player.onScreenDisplay?.setActionBar?.(
              `§c[${formatTitle(shortName)}] Requires ${r.inputCount}x ${formatTitle(r.input)} (You have ${haveMat})!`
            );
          } catch {}
          return;
        }

        const smithRes = runtime.stationsService.executeAnvilSmithing({
          anvil: blockId,
          recipeId: r.id,
          material: { itemId: r.input, count: creative ? r.inputCount : haveMat },
          tool: toolEntry
            ? {
                itemId: toolEntry.itemId,
                toolLevel: toolEntry.toolLevel,
                damage: toolEntry.damage,
                maxDurability: toolEntry.maxDurability || 500
              }
            : { itemId: "betterend:aeternium_hammer", toolLevel: 5, damage: 0, maxDurability: 2500 }
        });

        if (!smithRes.success) {
          try {
            player.playSound?.("note.bass");
            player.onScreenDisplay?.setActionBar?.(
              `§c[${formatTitle(shortName)}] Cannot forge (${smithRes.reason}).`
            );
          } catch {}
          return;
        }

        // Consume real materials & apply real hammer durability wear
        consumePlayerItem(player, r.input, r.inputCount);
        if (toolEntry) {
          damagePlayerTool(player, toolEntry, smithRes.durabilityConsumed ?? r.damage);
        }
        depositPlayerItem(player, smithRes.output, runtime.serverModule);

        // Award advancements
        runtime.presentationService?.awardAdvancement?.(pid, `betterend:${shortName}`);
        const outItem = String(r.result.item);
        if (outItem.endsWith("_forged_plate")) {
          const metal = outItem.slice("betterend:".length).split("_")[0];
          runtime.presentationService?.awardAdvancement?.(pid, `betterend:${metal}_plate`);
        } else if (outItem === "betterend:aeternium_hammer_head") {
          runtime.presentationService?.awardAdvancement?.(pid, "betterend:aeternium_hammer_head");
        } else if (
          outItem.endsWith("_head") ||
          outItem.endsWith("_blade") ||
          outItem.endsWith("_tip")
        ) {
          const metal = outItem.slice("betterend:".length).split("_")[0];
          runtime.presentationService?.awardAdvancement?.(pid, `betterend:${metal}_tool_head`);
        }

        try {
          player.playSound?.("random.anvil_use");
          player.onScreenDisplay?.setActionBar?.(
            `§a[${formatTitle(shortName)}] Forged ${r.result.count}x ${formatTitle(r.result.item)}!`
          );
        } catch {}
      }
    })
    .catch(() => {});
}

function openAnvilRepairAndRenameModalUi(
  runtime,
  player,
  block,
  { dim, dimId, loc, blockId, shortName }
) {
  const ModalFormData = runtime.uiModule?.ModalFormData;
  if (!ModalFormData) return;

  const invStacks = listPlayerInventoryStacks(player);
  if (invStacks.length === 0) {
    try {
      player.onScreenDisplay?.setActionBar?.(
        `§e[${formatTitle(shortName)}] Your inventory is empty.`
      );
    } catch {}
    return;
  }

  const targetChoices = invStacks.map(
    (s, idx) =>
      `#${idx + 1}: ${s.nameTag ? `${s.nameTag} (${formatTitle(s.itemId)})` : formatTitle(s.itemId)}${
        s.maxDurability > 0 ? ` [Dmg ${s.damage}/${s.maxDurability}]` : ""
      }`
  );
  const materialChoices = [
    "[None — Rename Only]",
    ...invStacks.map((s, idx) => `#${idx + 1}: ${formatTitle(s.itemId)} (x${s.count})`)
  ];

  const modal = new ModalFormData()
    .title(`${formatTitle(shortName)} — Repair & Rename`)
    .dropdown("Select Target Item to Repair / Combine / Rename:", targetChoices, {
      defaultValueIndex: 0
    })
    .dropdown("Select Repair Material or Secondary Item (1-Unit Discount):", materialChoices, {
      defaultValueIndex: 0
    })
    .textField("Custom Item Name (leave blank to keep current name):", "e.g. Eternal Voidblade", {
      defaultValue: invStacks[0]?.nameTag ?? ""
    });

  modal
    .show(player)
    .then((res) => {
      if (!res || res.canceled || !Array.isArray(res.formValues)) return;
      const targetIdx = Number(res.formValues[0] ?? 0);
      const matIdx = Number(res.formValues[1] ?? 0);
      const customName = String(res.formValues[2] ?? "").trim();

      const targetEntry = invStacks[targetIdx];
      if (!targetEntry) return;

      const matEntry = matIdx > 0 ? invStacks[matIdx - 1] : null;
      if (matEntry && matEntry.slot !== targetEntry.slot) {
        const repairRes = runtime.stationsService.executeAnvilRepairOrCombine({
          anvil: blockId,
          base: {
            itemId: targetEntry.itemId,
            count: 1,
            damage: targetEntry.damage,
            maxDurability: targetEntry.maxDurability || 500
          },
          addition: {
            itemId: matEntry.itemId,
            count: matEntry.count,
            damage: matEntry.damage,
            maxDurability: matEntry.maxDurability || 500
          },
          customName: customName || null
        });

        if (repairRes.success) {
          if (repairRes.repairItemCountCost > 0) {
            consumePlayerItem(player, matEntry.itemId, repairRes.repairItemCountCost);
          }
          const raw = targetEntry.rawStack;
          const durComp =
            raw?.getComponent?.("minecraft:durability") ?? raw?.getComponent?.("durability");
          if (durComp) durComp.damage = repairRes.output.damage;
          if (raw) raw.damage = repairRes.output.damage;
        }
      }

      if (customName.length > 0 && targetEntry.rawStack) {
        try {
          targetEntry.rawStack.nameTag = customName;
        } catch {}
      }

      const container = getPlayerContainer(player);
      if (targetEntry.source === "container" && container && targetEntry.rawStack) {
        try {
          container.setItem(targetEntry.slot, targetEntry.rawStack);
        } catch {}
      } else if (targetEntry.source === "equippable" && targetEntry.rawStack) {
        try {
          getPlayerEquippable(player)?.setEquipment?.("Mainhand", targetEntry.rawStack);
        } catch {}
      }

      try {
        player.playSound?.("random.anvil_use");
        player.onScreenDisplay?.setActionBar?.(
          `§a[${formatTitle(shortName)}] Updated ${customName || formatTitle(targetEntry.itemId)}!`
        );
      } catch {}
    })
    .catch(() => {});
}

// ============================================================================
// 3. INFUSION PEDESTAL, 13 PERIPHERAL PEDESTALS & 8-COMPASS RITUAL UI
// ============================================================================

/**
 * Scans the 8 compass coordinates (`INFUSION_COMPASS_OFFSETS`) around a center
 * `infusion_pedestal` in the live dimension and ensures any physical `*_pedestal`
 * blocks in the world are registered in `StationsService`.
 */
export function syncInfusionRingFromWorld(runtime, dim, dimId, centerAnchor) {
  const center = normalizeBlockAnchor(centerAnchor);
  const centerKey = formatAnchorKey(dimId, center);
  if (!runtime.stationsService._pedestals.has(centerKey)) {
    runtime.stationsService.placePedestal({
      dimension: dimId,
      anchor: center,
      blockType: "betterend:infusion_pedestal"
    });
  }

  if (!dim || typeof dim.getBlock !== "function") return;
  for (const dir of INFUSION_COMPASS_ORDER) {
    const [dx, dz] = INFUSION_COMPASS_OFFSETS[dir];
    const pos = { x: center.x + dx, y: center.y, z: center.z + dz };
    try {
      const blk = dim.getBlock(pos);
      const bId = String(blk?.typeId ?? "");
      if (bId.startsWith("betterend:") && bId.endsWith("_pedestal") && bId !== "betterend:infusion_pedestal") {
        const key = formatAnchorKey(dimId, pos);
        if (!runtime.stationsService._pedestals.has(key)) {
          runtime.stationsService.placePedestal({
            dimension: dimId,
            anchor: pos,
            blockType: bId
          });
        }
      }
    } catch {}
  }
}

/**
 * Handles right-click on any of the 13 peripheral `*_pedestal` blocks or `infusion_pedestal`:
 * - Holding an item (and not sneaking): places 1 item onto the pedestal (`betterend:has_item = true`).
 * - Empty hand on an occupied pedestal (and not sneaking): withdraws the item back to inventory.
 * - Empty hand on an empty `infusion_pedestal` (or sneaking on `infusion_pedestal`): opens the
 *   Infusion Pedestal & Recipe Book UI (`InfusionRecipeScreen` parity)!
 */
export function handlePedestalInteraction(runtime, player, block, heldItemStack) {
  const blockId = String(block?.typeId ?? "betterend:infusion_pedestal");
  const shortName = blockId.replace(/^betterend:/, "").replace(/__p\d+$/, "");
  const isCenter = shortName === "infusion_pedestal";
  const dim = block?.dimension ?? player.dimension;
  const dimId = normalizeDimensionId(dim?.id ?? "minecraft:the_end");
  const loc = normalizeBlockAnchor(block?.location ?? player.location ?? { x: 0, y: 64, z: 0 });
  const heldId = String(
    typeof heldItemStack === "string"
      ? heldItemStack
      : (heldItemStack?.typeId ?? heldItemStack?.itemId ?? "")
  );
  const isSneaking = Boolean(player?.isSneaking);

  const key = formatAnchorKey(dimId, loc);
  if (!runtime.stationsService._pedestals.has(key)) {
    runtime.stationsService.placePedestal({
      dimension: dimId,
      anchor: loc,
      blockType: isCenter ? "betterend:infusion_pedestal" : blockId
    });
  }
  const currentPedestal = runtime.stationsService.getPedestal({ dimension: dimId, anchor: loc });

  if (isCenter && (isSneaking || (!heldId && !currentPedestal?.item))) {
    openInfusionPedestalStationUi(runtime, player, block);
    return;
  }

  if (!isCenter && isSneaking) {
    const heldLabel = currentPedestal?.item
      ? `${currentPedestal.item.count}x ${formatTitle(currentPedestal.item.itemId)}`
      : "Empty";
    try {
      player.onScreenDisplay?.setActionBar?.(
        `§d[${formatTitle(shortName)}] §fHeld Item: §b${heldLabel}`
      );
    } catch {}
    return;
  }

  // Case A: Pedestal currently holds an item and player clicks with empty hand -> Withdraw item
  if (!heldId && currentPedestal?.item) {
    const res = runtime.stationsService.interactWithPedestal({
      dimension: dimId,
      anchor: loc,
      action: "extract"
    });
    if (res.success && res.extractedItem) {
      depositPlayerItem(player, res.extractedItem, runtime.serverModule);
      setBlockStateSafe(block, dim, loc, blockId, {
        "betterend:has_item": false,
        "betterend:has_light": false
      });
      try {
        player.playSound?.("random.pop");
        player.onScreenDisplay?.setActionBar?.(
          `§e[${formatTitle(shortName)}] Retrieved ${formatTitle(res.extractedItem.itemId)}.`
        );
      } catch {}
    }
    return;
  }

  // Case B: Player holds an item -> Insert 1 item onto the pedestal (swapping if already occupied)
  if (heldId && heldId !== "betterend:guidebook") {
    const consumed = consumePlayerItem(player, heldId, 1);
    if (!consumed.ok) return;

    if (currentPedestal?.item) {
      const ext = runtime.stationsService.interactWithPedestal({
        dimension: dimId,
        anchor: loc,
        action: "extract"
      });
      if (ext.extractedItem) {
        depositPlayerItem(player, ext.extractedItem, runtime.serverModule);
      }
    }

    runtime.stationsService.interactWithPedestal({
      dimension: dimId,
      anchor: loc,
      action: "insert",
      item: { itemId: heldId, count: 1 }
    });
    setBlockStateSafe(block, dim, loc, blockId, {
      "betterend:has_item": true
    });

    try {
      player.playSound?.("random.pop");
      player.onScreenDisplay?.setActionBar?.(
        `§a[${formatTitle(shortName)}] Placed 1x ${formatTitle(heldId)} on pedestal.`
      );
    } catch {}

    checkAndTriggerInfusionNear(runtime, player, dim, dimId, loc, isCenter);
    return;
  }

  // Case C: Empty peripheral pedestal clicked with empty hand -> show helpful hint
  try {
    player.onScreenDisplay?.setActionBar?.(
      `§d[${formatTitle(shortName)}] §7Empty — Right-click with an item to place catalyst, or click Center Infusion Pedestal for Recipe Book.`
    );
  } catch {}
}

function checkAndTriggerInfusionNear(runtime, player, dim, dimId, loc, isCenter) {
  const candidateCenters = [];
  if (isCenter) {
    candidateCenters.push(loc);
  } else {
    for (const dir of INFUSION_COMPASS_ORDER) {
      const [dx, dz] = INFUSION_COMPASS_OFFSETS[dir];
      candidateCenters.push({ x: loc.x - dx, y: loc.y, z: loc.z - dz });
    }
  }

  const pid = player?.id ?? player?.name ?? "player";
  for (const center of candidateCenters) {
    const centerKey = formatAnchorKey(dimId, center);
    const centerPedestal = runtime.stationsService._pedestals.get(centerKey);
    const isInfusionCenter =
      centerPedestal?.blockType === "betterend:infusion_pedestal" ||
      String(dim?.getBlock?.(center)?.typeId ?? "") === "betterend:infusion_pedestal";
    if (!isInfusionCenter) continue;

    syncInfusionRingFromWorld(runtime, dim, dimId, center);
    const ring = runtime.stationsService.validateInfusionRing({
      dimension: dimId,
      center
    });
    if (!ring.valid || !ring.centerPedestal?.item) continue;

    const matched = runtime.stationsService.matchInfusionRecipe(
      ring.centerPedestal.item,
      ring.catalysts
    );
    if (matched) {
      const startRes = runtime.stationsService.startInfusionRitual({
        dimension: dimId,
        center,
        actor: pid
      });
      if (startRes.started) {
        runtime.presentationService?.awardAdvancement?.(pid, "betterend:infusion");
        try {
          player?.playSound?.("block.enchantment_table.use");
          dim?.spawnParticle?.("minecraft:enchanting_table_particle", {
            x: center.x + 0.5,
            y: center.y + 1.2,
            z: center.z + 0.5
          });
          player?.onScreenDisplay?.setActionBar?.(
            `§d[Infusion Ritual] Channeling ${formatTitle(matched.id)} (${matched.time} ticks)...`
          );
        } catch {}
      }
      break;
    }
  }
}

export function openInfusionPedestalStationUi(runtime, player, block) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData || !player) return;

  const dim = block?.dimension ?? player.dimension;
  const dimId = normalizeDimensionId(dim?.id ?? "minecraft:the_end");
  const center = normalizeBlockAnchor(block?.location ?? player.location ?? { x: 0, y: 64, z: 0 });
  const centerKey = formatAnchorKey(dimId, center);
  const pid = player.id ?? player.name ?? "player";

  syncInfusionRingFromWorld(runtime, dim, dimId, center);
  const ring = runtime.stationsService.validateInfusionRing({
    dimension: dimId,
    center
  });
  const activeRitual = runtime.stationsService._infusionRituals.get(centerKey) ?? null;

  const compassSummaryParts = [];
  for (const dir of INFUSION_COMPASS_ORDER) {
    const ped = ring.catalystPedestals?.[dir];
    const held = ring.catalysts?.[dir];
    const shortDir = COMPASS_SHORT_LABELS[dir];
    if (!ped) {
      compassSummaryParts.push(`§c${shortDir}:MissingPedestal`);
    } else if (held) {
      compassSummaryParts.push(`§b${shortDir}:${formatTitle(held.itemId)}`);
    } else {
      compassSummaryParts.push(`§7${shortDir}:Empty`);
    }
  }

  const centerHeld = ring.centerPedestal?.item ?? null;
  const matchedRecipe =
    ring.valid && centerHeld
      ? runtime.stationsService.matchInfusionRecipe(centerHeld, ring.catalysts)
      : null;

  const gearRecipes = DEFAULT_INFUSION_RECIPES.filter(
    (r) => r.result.item !== "minecraft:enchanted_book"
  );
  const bookRecipes = DEFAULT_INFUSION_RECIPES.filter(
    (r) => r.result.item === "minecraft:enchanted_book"
  );

  const bodyLines = [
    `§dCenter Infusion Pedestal §7@ (${center.x}, ${center.y}, ${center.z})`,
    `§d8-Compass Ring: ${ring.valid ? "§a✔ Complete (8/8 Pedestals)" : `§e⚠ Incomplete (${8 - ring.missingDirections.length}/8 Pedestals)`}`,
    `§dCenter Input: ${centerHeld ? `§b${formatTitle(centerHeld.itemId)}` : "§7[Empty]"}`,
    `§dCompass Catalysts: ${compassSummaryParts.slice(0, 4).join(" §8| ")}`,
    `§d                  ${compassSummaryParts.slice(4, 8).join(" §8| ")}`,
    activeRitual && activeRitual.state !== TRANSACTION_STATES.COMPLETED
      ? `§dActive Ritual: §a${formatTitle(activeRitual.recipeId)} ${formatProgressBar(activeRitual.progress, activeRitual.time, 10, "§d", "§8")} (${activeRitual.progress}/${activeRitual.time}t)`
      : matchedRecipe
        ? `§a✔ Ready to Infuse: §f${formatTitle(matchedRecipe.id)} -> ${formatTitle(matchedRecipe.result.item)}`
        : `§7Place items directly on pedestals or select any of the §f${DEFAULT_INFUSION_RECIPES.length} Infusion Recipes §7below:`
  ];

  const form = new ActionFormData()
    .title("Infusion Pedestal & Ritual Book")
    .body(bodyLines.join("\n"));

  const actions = [];

  if (matchedRecipe || activeRitual) {
    const rLabel = matchedRecipe?.id ?? activeRitual?.recipeId;
    form.button(
      `§a⚡ Channel & Complete Active Ritual\n§8${formatTitle(rLabel)}`,
      resolveUiIconPath(matchedRecipe?.result?.item ?? "betterend:infusion_pedestal")
    );
    actions.push({ type: "complete_current_ritual" });
  }

  if (!ring.valid) {
    form.button(
      `§e✨ Highlight Missing Pedestal Sockets (${ring.missingDirections.length} missing)\n§8Spawns Infusion Mist Hints at Compass Offsets`,
      resolveUiIconPath("betterend:infusion_pedestal")
    );
    actions.push({ type: "show_socket_hints" });
  }

  const hasAnyPlacedItem =
    Boolean(centerHeld) ||
    INFUSION_COMPASS_ORDER.some((d) => Boolean(ring.catalysts?.[d]));
  if (hasAnyPlacedItem && !activeRitual) {
    form.button(
      "§eRetrieve All Placed Pedestal Items to Inventory",
      resolveUiIconPath(centerHeld?.itemId ?? "betterend:infusion_pedestal")
    );
    actions.push({ type: "retrieve_all_items" });
  }

  form.button(
    `§b📖 Enchanted Book Infusions (${bookRecipes.length} Recipes)\n§8Protection, Sharpness, Fortune, Mending, Silk Touch...`,
    resolveUiIconPath("minecraft:enchanted_book")
  );
  actions.push({ type: "open_book_category", recipes: bookRecipes });

  for (const r of gearRecipes) {
    const canCraft = canPlayerSupplyInfusionRecipe(player, r);
    const badge = canCraft ? "§a[Ready]" : "§7[Recipe]";
    form.button(
      `${badge} §r${formatTitle(r.result.item)}\n§8Center: ${formatTitle(r.input)} (${r.time}t)`,
      resolveUiIconPath(r.result.item)
    );
    actions.push({ type: "open_recipe_detail", recipe: r });
  }

  form
    .show(player)
    .then((res) => {
      if (!res || res.canceled || res.selection === undefined) return;
      const chosen = actions[res.selection];
      if (!chosen) return;

      if (chosen.type === "complete_current_ritual") {
        let cur = runtime.stationsService._infusionRituals.get(centerKey);
        if (!cur) {
          const started = runtime.stationsService.startInfusionRitual({
            dimension: dimId,
            center,
            actor: pid
          });
          if (!started.started) return;
          cur = runtime.stationsService._infusionRituals.get(centerKey);
        }
        if (cur) {
          const finished = runtime.stationsService.tickInfusionRitual({
            dimension: dimId,
            center,
            ticks: Math.max(1, cur.time - cur.progress + 1)
          });
          finalizeCompletedInfusionInWorld(runtime, player, dim, dimId, center, finished);
        }
        return;
      }

      if (chosen.type === "show_socket_hints") {
        for (const dir of ring.missingDirections) {
          const [dx, dz] = INFUSION_COMPASS_OFFSETS[dir];
          try {
            dim?.spawnParticle?.("minecraft:endrod", {
              x: center.x + dx + 0.5,
              y: center.y + 0.5,
              z: center.z + dz + 0.5
            });
          } catch {}
        }
        const missingList = ring.missingDirections
          .map((d) => `${COMPASS_SHORT_LABELS[d]}(${INFUSION_COMPASS_OFFSETS[d].join(",")})`)
          .join(", ");
        try {
          player.playSound?.("block.beacon.ambient");
          player.onScreenDisplay?.setActionBar?.(
            `§e[Infusion Hint] Place Pedestals at offsets: ${missingList}`
          );
        } catch {}
        return;
      }

      if (chosen.type === "retrieve_all_items") {
        if (centerHeld) {
          const out = runtime.stationsService.interactWithPedestal({
            dimension: dimId,
            anchor: center,
            action: "extract"
          });
          if (out.extractedItem) {
            depositPlayerItem(player, out.extractedItem, runtime.serverModule);
            setBlockStateSafe(block, dim, center, "betterend:infusion_pedestal", {
              "betterend:has_item": false
            });
          }
        }
        for (const dir of INFUSION_COMPASS_ORDER) {
          const ped = ring.catalystPedestals?.[dir];
          if (ped?.item) {
            const out = runtime.stationsService.interactWithPedestal({
              dimension: dimId,
              anchor: ped.anchor,
              action: "extract"
            });
            if (out.extractedItem) {
              depositPlayerItem(player, out.extractedItem, runtime.serverModule);
              setBlockStateSafe(null, dim, ped.anchor, null, { "betterend:has_item": false });
            }
          }
        }
        try {
          player.playSound?.("random.pop");
          player.onScreenDisplay?.setActionBar?.(
            "§e[Infusion Pedestal] Retrieved all placed items to inventory."
          );
        } catch {}
        return;
      }

      if (chosen.type === "open_book_category") {
        openInfusionBookCategoryUi(runtime, player, block, chosen.recipes, {
          dim,
          dimId,
          center
        });
        return;
      }

      if (chosen.type === "open_recipe_detail") {
        openInfusionRecipeDetailUi(runtime, player, block, chosen.recipe, {
          dim,
          dimId,
          center
        });
      }
    })
    .catch(() => {});
}

function openInfusionBookCategoryUi(runtime, player, block, bookRecipes, ctx) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData) return;

  const form = new ActionFormData()
    .title(`Enchanted Book Infusions (${bookRecipes.length})`)
    .body("§7Select any BetterEnd Enchanted Book Infusion Recipe to view its 8-Compass Catalyst diagram or channel it:");

  for (const r of bookRecipes) {
    const canCraft = canPlayerSupplyInfusionRecipe(player, r);
    const badge = canCraft ? "§a[Ready]" : "§7[Book]";
    const enchObj = r.result.enchantments ?? r.result.components?.["minecraft:enchantments"] ?? {};
    const enchSummary = Object.entries(enchObj)
      .map(([k, v]) => `${formatTitle(k)} ${toRomanNumeral(v)}`)
      .join(", ");
    form.button(
      `${badge} §r${enchSummary || formatTitle(r.id)}\n§8Time: ${r.time}t (${(r.time / 20).toFixed(1)}s)`,
      resolveUiIconPath("minecraft:enchanted_book")
    );
  }

  form
    .show(player)
    .then((res) => {
      if (!res || res.canceled || res.selection === undefined) return;
      const chosen = bookRecipes[res.selection];
      if (!chosen) return;
      openInfusionRecipeDetailUi(runtime, player, block, chosen, ctx);
    })
    .catch(() => {});
}

export function canPlayerSupplyInfusionRecipe(player, recipe) {
  if (isPlayerCreative(player)) return true;
  const requiredCounts = new Map();
  const addReq = (id) => {
    if (!id) return;
    requiredCounts.set(id, (requiredCounts.get(id) ?? 0) + 1);
  };
  addReq(recipe.input);
  for (const dir of INFUSION_COMPASS_ORDER) {
    addReq(recipe.catalysts?.[dir] ?? null);
  }
  for (const [itemId, needed] of requiredCounts.entries()) {
    if (countPlayerItem(player, itemId) < needed) return false;
  }
  return true;
}

/**
 * Displays the `InfusionRecipeScreen` Compass-Rose Detail Page for any of the 49
 * Infusion Recipes and allows auto-loading the center input + 8 catalysts from
 * the player's inventory onto the pedestals to start the ritual.
 */
export function openInfusionRecipeDetailUi(runtime, player, block, recipe, ctx = {}) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData || !player || !recipe) return;

  const dim = ctx.dim ?? block?.dimension ?? player.dimension;
  const dimId = ctx.dimId ?? normalizeDimensionId(dim?.id ?? "minecraft:the_end");
  const center =
    ctx.center ?? normalizeBlockAnchor(block?.location ?? player.location ?? { x: 0, y: 64, z: 0 });
  const pid = player.id ?? player.name ?? "player";
  const creative = isPlayerCreative(player);

  const enchObj =
    recipe.result?.enchantments ?? recipe.result?.components?.["minecraft:enchantments"] ?? null;
  const enchSummary = enchObj
    ? Object.entries(enchObj)
        .map(([k, v]) => `${formatTitle(k)} ${toRomanNumeral(v)}`)
        .join(", ")
    : null;

  const outTitle = enchSummary
    ? `Enchanted Book (${enchSummary})`
    : `${recipe.result.count}x ${formatTitle(recipe.result.item)}`;

  const hasCenterInput = creative || countPlayerItem(player, recipe.input) >= 1;
  const compassLines = [];
  for (const dir of INFUSION_COMPASS_ORDER) {
    const catId = recipe.catalysts?.[dir] ?? null;
    if (!catId) {
      compassLines.push(`  §8• ${COMPASS_LABELS[dir]}: §7[Empty Socket]`);
    } else {
      const owned = countPlayerItem(player, catId);
      const ok = creative || owned >= 1;
      compassLines.push(
        `  ${ok ? "§a✔" : "§c✖"} §f${COMPASS_LABELS[dir]}: §b${formatTitle(catId)} §7(Have ${owned})`
      );
    }
  }

  const canSupplyAll = canPlayerSupplyInfusionRecipe(player, recipe);
  const bodyLines = [
    `§dInfusion Recipe: §f${formatTitle(recipe.id)}`,
    `§dOutput: §a${outTitle}`,
    `§dInfusion Time: §b${recipe.time} ticks §7(${(recipe.time / 20).toFixed(1)}s)`,
    `§dCenter Pedestal Input: ${hasCenterInput ? "§a✔" : "§c✖"} §f${formatTitle(recipe.input)} §7(Have ${countPlayerItem(player, recipe.input)})`,
    `§d8-Compass Catalyst Layout:`,
    ...compassLines
  ];

  const form = new ActionFormData()
    .title(`Infusion: ${formatTitle(recipe.id)}`)
    .body(bodyLines.join("\n"));

  form.button(
    canSupplyAll
      ? `§a⚡ Load Catalysts from Inventory & Start Ritual\n§8Consumes Center Input + 8 Catalysts`
      : `§c⚠ Missing Required Catalysts in Inventory`,
    resolveUiIconPath(recipe.result.item)
  );
  form.button("§7⬅ Back to Infusion Pedestal", resolveUiIconPath("betterend:infusion_pedestal"));

  form
    .show(player)
    .then((res) => {
      if (!res || res.canceled || res.selection === undefined) return;
      if (res.selection === 1) {
        if (block) openInfusionPedestalStationUi(runtime, player, block);
        return;
      }

      if (!canSupplyAll) {
        try {
          player.playSound?.("note.bass");
          player.onScreenDisplay?.setActionBar?.(
            `§c[Infusion Ritual] You do not have all required catalysts for ${formatTitle(recipe.id)}!`
          );
        } catch {}
        return;
      }

      syncInfusionRingFromWorld(runtime, dim, dimId, center);
      let ring = runtime.stationsService.validateInfusionRing({
        dimension: dimId,
        center
      });

      if (!ring.valid) {
        for (const dir of ring.missingDirections) {
          const [dx, dz] = INFUSION_COMPASS_OFFSETS[dir];
          const pos = { x: center.x + dx, y: center.y, z: center.z + dz };
          runtime.stationsService.placePedestal({
            dimension: dimId,
            anchor: pos,
            blockType: "betterend:pedestal"
          });
          if (creative) {
            try {
              dim?.getBlock?.(pos)?.setType?.("betterend:andesite_pedestal");
            } catch {}
          }
        }
        ring = runtime.stationsService.validateInfusionRing({
          dimension: dimId,
          center
        });
      }

      // Return any previously placed items on the 9 pedestals to the player's inventory first
      if (ring.centerPedestal?.item) {
        const ret = runtime.stationsService.interactWithPedestal({
          dimension: dimId,
          anchor: center,
          action: "extract"
        });
        if (ret.extractedItem) depositPlayerItem(player, ret.extractedItem, runtime.serverModule);
      }
      for (const dir of INFUSION_COMPASS_ORDER) {
        const ped = ring.catalystPedestals?.[dir];
        if (ped?.item) {
          const ret = runtime.stationsService.interactWithPedestal({
            dimension: dimId,
            anchor: ped.anchor,
            action: "extract"
          });
          if (ret.extractedItem) depositPlayerItem(player, ret.extractedItem, runtime.serverModule);
        }
      }

      // Consume center input + 8 catalysts from player's inventory and place onto pedestals
      const centerConsumed = consumePlayerItem(player, recipe.input, 1);
      if (!centerConsumed.ok) return;

      runtime.stationsService.interactWithPedestal({
        dimension: dimId,
        anchor: center,
        action: "insert",
        item: { itemId: centerConsumed.itemId, count: 1 }
      });
      setBlockStateSafe(block, dim, center, "betterend:infusion_pedestal", {
        "betterend:has_item": true
      });

      for (const dir of INFUSION_COMPASS_ORDER) {
        const [dx, dz] = INFUSION_COMPASS_OFFSETS[dir];
        const pos = { x: center.x + dx, y: center.y, z: center.z + dz };
        const catPred = recipe.catalysts?.[dir] ?? null;
        if (!catPred) continue;
        const catConsumed = consumePlayerItem(player, catPred, 1);
        if (catConsumed.ok) {
          runtime.stationsService.interactWithPedestal({
            dimension: dimId,
            anchor: pos,
            action: "insert",
            item: { itemId: catConsumed.itemId, count: 1 }
          });
          setBlockStateSafe(null, dim, pos, null, { "betterend:has_item": true });
        }
      }

      const startRes = runtime.stationsService.startInfusionRitual({
        dimension: dimId,
        center,
        actor: pid
      });
      if (!startRes.started) return;

      runtime.presentationService?.awardAdvancement?.(pid, "betterend:infusion");
      const finished = runtime.stationsService.tickInfusionRitual({
        dimension: dimId,
        center,
        ticks: recipe.time + 1
      });
      finalizeCompletedInfusionInWorld(runtime, player, dim, dimId, center, finished);
    })
    .catch(() => {});
}

function finalizeCompletedInfusionInWorld(runtime, player, dim, dimId, center, ritualResult) {
  if (!ritualResult || !ritualResult.completed) return;
  const pid = player?.id ?? player?.name ?? "player";

  for (const dir of INFUSION_COMPASS_ORDER) {
    const [dx, dz] = INFUSION_COMPASS_OFFSETS[dir];
    const pos = { x: center.x + dx, y: center.y, z: center.z + dz };
    setBlockStateSafe(null, dim, pos, null, { "betterend:has_item": false });
    try {
      dim?.spawnParticle?.("minecraft:endrod", {
        x: pos.x + 0.5,
        y: pos.y + 1.0,
        z: pos.z + 0.5
      });
    } catch {}
  }

  const outPedestal = runtime.stationsService.interactWithPedestal({
    dimension: dimId,
    anchor: center,
    action: "extract"
  });
  const outputStack = outPedestal.extractedItem ?? ritualResult.output;
  setBlockStateSafe(null, dim, center, "betterend:infusion_pedestal", {
    "betterend:has_item": false
  });

  if (outputStack && player) {
    depositPlayerItem(player, outputStack, runtime.serverModule);
  }

  runtime.presentationService?.awardAdvancement?.(pid, "betterend:infusion_finished");
  const outId = String(outputStack?.itemId ?? "");
  if (outId.startsWith("betterend:crystalite_")) {
    runtime.presentationService?.awardAdvancement?.(pid, "betterend:crystalite_armor");
  } else if (outId === "betterend:elytra_armored") {
    runtime.presentationService?.awardAdvancement?.(pid, "betterend:elytra_armored");
  } else if (outId === "betterend:elytra_crystalite") {
    runtime.presentationService?.awardAdvancement?.(pid, "betterend:elytra_crystalite");
  } else if (outId.startsWith("betterend:aeternium_")) {
    runtime.presentationService?.awardAdvancement?.(pid, "betterend:aeternium_tool");
  }

  try {
    player?.playSound?.("block.end_portal.spawn");
    dim?.spawnParticle?.("minecraft:dragon_breath_trail", {
      x: center.x + 0.5,
      y: center.y + 1.1,
      z: center.z + 0.5
    });
    player?.onScreenDisplay?.setActionBar?.(
      `§d[Infusion Ritual] Infused ${outputStack?.count ?? 1}x ${formatTitle(outId)}!`
    );
  } catch {}
}

/**
 * Steps all active Infusion Rituals in `StationsService` during `_stepLiveWorldTick`,
 * spawning catalyst-to-center particle streams and finalizing completed rituals.
 */
export function stepLiveInfusionRituals(runtime, ticks = 10) {
  const rituals = runtime?.stationsService?._infusionRituals;
  if (!rituals || rituals.size === 0) return;

  for (const [, ritual] of rituals) {
    if (!ritual || ritual.state === TRANSACTION_STATES.COMPLETED) continue;
    const dim = runtime.serverModule?.world?.getDimension?.(ritual.dimension);
    const center = ritual.center;

    if (dim && center) {
      for (const dir of INFUSION_COMPASS_ORDER) {
        const [dx, dz] = INFUSION_COMPASS_OFFSETS[dir];
        try {
          dim.spawnParticle?.("minecraft:enchanting_table_particle", {
            x: center.x + dx * 0.5 + 0.5,
            y: center.y + 1.1,
            z: center.z + dz * 0.5 + 0.5
          });
        } catch {}
      }
    }

    const res = runtime.stationsService.tickInfusionRitual({
      dimension: ritual.dimension,
      center,
      ticks
    });
    if (res.completed) {
      const players = dim?.getPlayers?.({ location: center, maxDistance: 24 }) ?? [];
      const nearestPlayer = players[0] ?? null;
      finalizeCompletedInfusionInWorld(runtime, nearestPlayer, dim, ritual.dimension, center, res);
    }
  }
}

// ============================================================================
// 4. ETERNAL PEDESTAL & 6-PEDESTAL ETERNAL PORTAL RITUAL UI
// ============================================================================

export function handleEternalPedestalInteraction(runtime, player, block, heldItemStack) {
  const dim = block?.dimension ?? player.dimension;
  const dimId = normalizeDimensionId(dim?.id ?? "minecraft:the_end");
  const loc = normalizeBlockAnchor(block?.location ?? player.location ?? { x: 0, y: 64, z: 0 });
  const heldId = String(
    typeof heldItemStack === "string"
      ? heldItemStack
      : (heldItemStack?.typeId ?? heldItemStack?.itemId ?? "")
  );
  const isSneaking = Boolean(player?.isSneaking);

  const key = formatAnchorKey(dimId, loc);
  if (!runtime.stationsService._pedestals.has(key)) {
    runtime.stationsService.placePedestal({
      dimension: dimId,
      anchor: loc,
      blockType: "betterend:eternal_pedestal"
    });
  }
  const current = runtime.stationsService.getPedestal({ dimension: dimId, anchor: loc });

  if (!isSneaking && heldId === "betterend:eternal_crystal" && !current?.item) {
    const consumed = consumePlayerItem(player, "betterend:eternal_crystal", 1);
    if (!consumed.ok) return;
    runtime.stationsService.interactWithPedestal({
      dimension: dimId,
      anchor: loc,
      action: "insert",
      item: { itemId: "betterend:eternal_crystal", count: 1 }
    });
    setBlockStateSafe(block, dim, loc, "betterend:eternal_pedestal", {
      "betterend:active": true
    });
    try {
      player.playSound?.("block.end_portal_frame.fill");
      player.onScreenDisplay?.setActionBar?.(
        "§d[Eternal Pedestal] §bEternal Crystal socketed! (Place on all 6 Eternal Pedestals to open Eternal Portal)"
      );
    } catch {}
    return;
  }

  if (!isSneaking && !heldId && current?.item) {
    const out = runtime.stationsService.interactWithPedestal({
      dimension: dimId,
      anchor: loc,
      action: "extract"
    });
    if (out.extractedItem) {
      depositPlayerItem(player, out.extractedItem, runtime.serverModule);
      setBlockStateSafe(block, dim, loc, "betterend:eternal_pedestal", {
        "betterend:active": false
      });
      try {
        player.playSound?.("random.pop");
        player.onScreenDisplay?.setActionBar?.(
          "§e[Eternal Pedestal] Retrieved Eternal Crystal."
        );
      } catch {}
    }
    return;
  }

  openEternalPedestalStationUi(runtime, player, block);
}

export function openEternalPedestalStationUi(runtime, player, block) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData || !player) return;

  const dim = block?.dimension ?? player.dimension;
  const dimId = normalizeDimensionId(dim?.id ?? "minecraft:the_end");
  const loc = normalizeBlockAnchor(block?.location ?? player.location ?? { x: 0, y: 64, z: 0 });
  const pid = player.id ?? player.name ?? "player";
  const current = runtime.stationsService.getPedestal({ dimension: dimId, anchor: loc });
  const crystalCount = countPlayerItem(player, "betterend:eternal_crystal");

  const bodyLines = [
    `§dEternal Pedestal §7@ (${loc.x}, ${loc.y}, ${loc.z})`,
    `§dSocket State: ${current?.item ? "§b⚡ Active (Eternal Crystal Socketed)" : "§7○ Inactive (Requires Eternal Crystal)"}`,
    `§dEternal Crystals in Inventory: §a${crystalCount}`,
    `\n§dEternal Portal 6-Pedestal Offsets (relative to portal center):`,
    `§7  (-4, -5), (-4, +5), (-6, 0), (+4, -5), (+4, +5), (+6, 0)`,
    `§7  Frame: 16x Runed Flavolite (betterend:flavolite_runed)`
  ];

  const form = new ActionFormData()
    .title("Eternal Pedestal & Portal Ritual")
    .body(bodyLines.join("\n"));

  const actions = [];
  if (!current?.item && (crystalCount > 0 || isPlayerCreative(player))) {
    form.button(
      "§bSocket Eternal Crystal from Inventory",
      resolveUiIconPath("betterend:eternal_crystal")
    );
    actions.push("socket_crystal");
  } else if (current?.item) {
    form.button(
      "§eWithdraw Socketed Eternal Crystal",
      resolveUiIconPath("betterend:eternal_crystal")
    );
    actions.push("withdraw_crystal");
  }

  form.button(
    "§d✨ Show 6-Pedestal Eternal Portal Hints",
    resolveUiIconPath("betterend:eternal_pedestal")
  );
  actions.push("show_hints");

  form.button(
    "§a🌀 Activate Eternal Portal Ritual",
    resolveUiIconPath("betterend:flavolite_runed")
  );
  actions.push("activate_portal");

  form
    .show(player)
    .then((res) => {
      if (!res || res.canceled || res.selection === undefined) return;
      const action = actions[res.selection];
      if (action === "socket_crystal") {
        handleEternalPedestalInteraction(runtime, player, block, {
          typeId: "betterend:eternal_crystal"
        });
      } else if (action === "withdraw_crystal") {
        handleEternalPedestalInteraction(runtime, player, block, null);
      } else if (action === "show_hints") {
        for (const [ox, oz] of ETERNAL_PORTAL_PEDESTAL_OFFSETS) {
          try {
            dim?.spawnParticle?.("minecraft:endrod", {
              x: loc.x + ox + 0.5,
              y: loc.y + 0.8,
              z: loc.z + oz + 0.5
            });
          } catch {}
        }
        try {
          player.playSound?.("block.beacon.ambient");
          player.onScreenDisplay?.setActionBar?.(
            "§d[Eternal Hint] Highlighted 6 Eternal Portal pedestal sockets around this coordinate."
          );
        } catch {}
      } else if (action === "activate_portal") {
        const portalRes = runtime.stationsService.activateEternalPortalRitual({
          dimension: dimId,
          center: loc,
          actor: pid
        });
        if (portalRes.activated) {
          runtime.presentationService?.awardAdvancement?.(pid, "betterend:eternal_portal");
          try {
            player.playSound?.("block.end_portal.spawn");
            player.onScreenDisplay?.setActionBar?.(
              `§d[Eternal Portal] Linked Eternal Gateway to ${portalRes.targetDimension}!`
            );
          } catch {}
        }
      }
    })
    .catch(() => {});
}

// ============================================================================
// 5. RESPAWN OBELISK, SILK MOTH NEST, FLOWER POT, COMPOSTER, CONTAINERS & SIGNS
// ============================================================================

export function handleRespawnObeliskInteraction(runtime, player, block, heldItemStack) {
  const dim = block?.dimension ?? player.dimension;
  const dimId = normalizeDimensionId(dim?.id ?? "minecraft:the_end");
  const loc = normalizeBlockAnchor(block?.location ?? player.location ?? { x: 0, y: 64, z: 0 });
  const pid = player?.id ?? player?.name ?? "player";
  const heldId = String(
    typeof heldItemStack === "string"
      ? heldItemStack
      : (heldItemStack?.typeId ?? heldItemStack?.itemId ?? "")
  );
  const creative = isPlayerCreative(player);

  let bottomY = loc.y;
  try {
    const below1 = dim?.getBlock?.({ x: loc.x, y: loc.y - 1, z: loc.z });
    const below2 = dim?.getBlock?.({ x: loc.x, y: loc.y - 2, z: loc.z });
    if (String(below2?.typeId ?? "") === "betterend:respawn_obelisk") bottomY = loc.y - 2;
    else if (String(below1?.typeId ?? "") === "betterend:respawn_obelisk") bottomY = loc.y - 1;
  } catch {}
  const bottomAnchor = { x: loc.x, y: bottomY, z: loc.z };

  if (!runtime.transportService.getRespawnObeliskAt({ dimension: dimId, pos: loc })) {
    runtime.transportService.placeRespawnObelisk({
      dimension: dimId,
      bottomAnchor
    });
  }

  const amberOwned = countPlayerItem(player, "betterend:amber_gem");
  const holdingAmber = heldId === "betterend:amber_gem" && (amberOwned >= 6 || creative);

  if (!player?.isSneaking && (holdingAmber || creative)) {
    const consumeRes = consumePlayerItem(player, "betterend:amber_gem", 6);
    if (!consumeRes.ok) {
      openRespawnObeliskUi(runtime, player, block, bottomAnchor);
      return;
    }
    const actRes = runtime.transportService.activateRespawnObelisk({
      playerId: pid,
      dimension: dimId,
      pos: loc,
      heldItem: { itemId: "betterend:amber_gem", count: Math.max(6, amberOwned) },
      isCreative: creative
    });
    if (actRes.activated) {
      runtime.presentationService?.awardAdvancement?.(pid, "betterend:respawn_obelisk");
      try {
        player.setSpawnPoint?.({
          dimension: dim,
          x: bottomAnchor.x + 1,
          y: bottomAnchor.y,
          z: bottomAnchor.z
        });
        player.playSound?.("respawn_anchor.set_spawn");
        dim?.spawnParticle?.("minecraft:totem_particle", {
          x: bottomAnchor.x + 0.5,
          y: bottomAnchor.y + 1.5,
          z: bottomAnchor.z + 0.5
        });
        player.onScreenDisplay?.setActionBar?.(
          `§d[Respawn Obelisk] §aBound End Respawn Point at (${bottomAnchor.x}, ${bottomAnchor.y}, ${bottomAnchor.z})! (-6 Amber Gems)`
        );
      } catch {}
      return;
    }
  }

  openRespawnObeliskUi(runtime, player, block, bottomAnchor);
}

export function openRespawnObeliskUi(runtime, player, block, bottomAnchor) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData || !player) return;

  const pid = player.id ?? player.name ?? "player";
  const creative = isPlayerCreative(player);
  const amberOwned = countPlayerItem(player, "betterend:amber_gem");
  const canBind = creative || amberOwned >= 6;
  const currentBinding = runtime.transportService._playerBindings?.get?.(pid) ?? null;

  const bodyLines = [
    `§dRespawn Obelisk §7@ (${bottomAnchor.x}, ${bottomAnchor.y}, ${bottomAnchor.z})`,
    `§dCurrent Bound Obelisk: ${
      currentBinding
        ? `§a(${currentBinding.bottomAnchor.x}, ${currentBinding.bottomAnchor.y}, ${currentBinding.bottomAnchor.z}) in ${currentBinding.dimension}`
        : "§7None"
    }`,
    `§dActivation Cost: §66x Amber Gem §7(You have: ${canBind ? `§a${amberOwned}` : `§c${amberOwned}`})`,
    `\n§7Charging the Respawn Obelisk with §66x Amber Gem §7binds your respawn point to this End island.`
  ];

  const form = new ActionFormData()
    .title("Respawn Obelisk")
    .body(bodyLines.join("\n"))
    .button(
      canBind
        ? "§a⚡ Charge & Bind Respawn Obelisk (6x Amber Gem)"
        : "§c⚠ Requires 6x Amber Gem in Inventory",
      resolveUiIconPath("betterend:amber_gem")
    );

  form
    .show(player)
    .then((res) => {
      if (!res || res.canceled || res.selection !== 0) return;
      if (!canBind) {
        try {
          player.playSound?.("note.bass");
          player.onScreenDisplay?.setActionBar?.(
            "§c[Respawn Obelisk] Requires 6x Amber Gem to bind Respawn Point!"
          );
        } catch {}
        return;
      }
      handleRespawnObeliskInteraction(runtime, player, block, {
        typeId: "betterend:amber_gem"
      });
    })
    .catch(() => {});
}

export function handleSilkMothHousingInteraction(runtime, player, block, heldItemStack) {
  const blockId = String(block?.typeId ?? "betterend:silk_moth_nest");
  const shortName = blockId.replace(/^betterend:/, "").replace(/__p\d+$/, "");
  const dim = block?.dimension ?? player.dimension;
  const dimId = normalizeDimensionId(dim?.id ?? "minecraft:the_end");
  const loc = normalizeBlockAnchor(block?.location ?? player.location ?? { x: 0, y: 64, z: 0 });
  const heldId = String(
    typeof heldItemStack === "string"
      ? heldItemStack
      : (heldItemStack?.typeId ?? heldItemStack?.itemId ?? "")
  );

  let worldFullness = 3;
  try {
    const f = block?.permutation?.getState?.("betterend:fullness");
    if (typeof f === "number") worldFullness = f;
  } catch {}

  const key = formatAnchorKey(dimId, loc);
  if (!runtime.ecologyService._hives.has(key)) {
    runtime.ecologyService.placeSilkMothHousing({
      dimension: dimId,
      anchor: loc,
      blockType: blockId,
      fullness: worldFullness
    });
  } else {
    const rec = runtime.ecologyService._hives.get(key);
    if (rec && worldFullness > rec.fullness) rec.fullness = worldFullness;
  }

  if (heldId === "minecraft:shears" || heldId === "minecraft:glass_bottle") {
    const harvestRes = runtime.ecologyService.harvestSilkMothHousing({
      dimension: dimId,
      anchor: loc,
      tool: heldId
    });
    if (!harvestRes.success) {
      try {
        player.playSound?.("note.bass");
        player.onScreenDisplay?.setActionBar?.(
          `§e[${formatTitle(shortName)}] Not ready to harvest yet (Fullness ${harvestRes.actualFullness ?? worldFullness}/3).`
        );
      } catch {}
      return;
    }

    if (heldId === "minecraft:glass_bottle") {
      consumePlayerItem(player, "minecraft:glass_bottle", 1);
    } else {
      const shearsTool = listPlayerInventoryStacks(player).find(
        (s) => s.itemId === "minecraft:shears"
      );
      if (shearsTool) damagePlayerTool(player, shearsTool, 1);
    }

    for (const drop of harvestRes.drops ?? []) {
      const dropId = drop.equivalentVanillaId ?? drop.itemId;
      depositPlayerItem(player, { itemId: dropId, count: drop.count }, runtime.serverModule);
    }
    setBlockStateSafe(block, dim, loc, blockId, {
      "betterend:fullness": harvestRes.fullness ?? 0
    });
    try {
      player.playSound?.(
        heldId === "minecraft:shears" ? "block.beehive.shear" : "bucket.fill"
      );
      const dropText = (harvestRes.drops ?? [])
        .map((d) => `${d.count}x ${formatTitle(d.itemId)}`)
        .join(" + ");
      player.onScreenDisplay?.setActionBar?.(
        `§a[${formatTitle(shortName)}] Harvested ${dropText}!`
      );
    } catch {}
    return;
  }

  // Open status UI when clicked without shears/bottle
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData) return;
  const housing = runtime.ecologyService.getSilkMothHousing({
    dimension: dimId,
    anchor: loc
  });
  const fullness = housing?.fullness ?? worldFullness;
  const hasShears = countPlayerItem(player, "minecraft:shears") > 0 || isPlayerCreative(player);

  const form = new ActionFormData()
    .title(formatTitle(shortName))
    .body(
      `§dBlock: §f${formatTitle(shortName)} §7@ (${loc.x}, ${loc.y}, ${loc.z})\n` +
        `§dSilk Fullness: ${formatProgressBar(fullness, 3, 6, "§e", "§8")} §f(${fullness}/3)\n\n` +
        `§7Use §fShears §7at Fullness >= 2/3 to harvest §bSilk Fiber §7+ §dSilk Moth Matrix§7, or §fGlass Bottle §7for §eHoney Bottle§7.`
    )
    .button(
      fullness >= 2 && hasShears
        ? `§a✂ Shear Silk Fiber (Fullness ${fullness}/3)`
        : "§7Close Status",
      resolveUiIconPath("betterend:silk_fiber")
    );

  form
    .show(player)
    .then((res) => {
      if (!res || res.canceled || res.selection !== 0) return;
      if (fullness >= 2 && hasShears) {
        handleSilkMothHousingInteraction(runtime, player, block, {
          typeId: "minecraft:shears"
        });
      }
    })
    .catch(() => {});
}

export function openStorageContainerUi(runtime, player, block) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData || !player || !block) return;

  const blockId = String(block.typeId ?? "betterend:mossy_glowshroom_barrel");
  const shortName = blockId.replace(/^betterend:/, "").replace(/__p\d+$/, "");
  const isBookshelf = shortName.endsWith("_bookshelf");
  const isBarrel = shortName.endsWith("_barrel");
  const maxSlots = isBookshelf ? 6 : 27;
  const dim = block.dimension ?? player.dimension;
  const dimId = normalizeDimensionId(dim?.id ?? "minecraft:the_end");
  const loc = normalizeBlockAnchor(block.location ?? { x: 0, y: 64, z: 0 });

  let record = runtime.store.getStation({ dimension: dimId, anchor: loc });
  if (!record) {
    record = runtime.store.registerStation({
      dimension: dimId,
      anchor: loc,
      stationType: `betterend:${isBookshelf ? "chiseled_bookshelf" : isBarrel ? "barrel" : "chest"}`,
      state: { items: [] }
    });
  }
  const storedItems = Array.isArray(record.state?.items) ? [...record.state.items] : [];

  if (isBarrel) {
    setBlockStateSafe(block, dim, loc, blockId, { "betterend:open": true });
    try {
      player.playSound?.("random.barrel.open");
    } catch {}
  }

  const syncBookshelfStates = (itemsList) => {
    if (!isBookshelf) return;
    const patch = {};
    for (let i = 0; i < 6; i++) {
      patch[`betterend:slot_${i}_occupied`] = Boolean(itemsList[i]);
    }
    setBlockStateSafe(block, dim, loc, blockId, patch);
  };

  const form = new ActionFormData()
    .title(`${formatTitle(shortName)} (${storedItems.length}/${maxSlots})`)
    .body(
      storedItems.length === 0
        ? `§7This ${formatTitle(shortName)} is empty. Deposit items from your inventory below:`
        : `§dStored Contents (${storedItems.length}/${maxSlots} slots):\n` +
            storedItems.map((it, idx) => `§7• Slot ${idx + 1}: §f${it.count}x ${formatTitle(it.itemId)}`).join("\n")
    );

  const actions = [];
  if (storedItems.length < maxSlots && runtime.uiModule?.ModalFormData) {
    form.button(
      isBookshelf ? "§b📥 Insert Book from Inventory..." : "§b📥 Deposit Item from Inventory...",
      resolveUiIconPath(isBookshelf ? "minecraft:enchanted_book" : blockId)
    );
    actions.push({ type: "deposit_modal" });
  }

  for (let i = 0; i < storedItems.length; i++) {
    const it = storedItems[i];
    form.button(
      `§e📤 Withdraw ${it.count}x ${formatTitle(it.itemId)}`,
      resolveUiIconPath(it.itemId)
    );
    actions.push({ type: "withdraw_index", index: i });
  }

  form
    .show(player)
    .then((res) => {
      if (isBarrel) {
        setBlockStateSafe(block, dim, loc, blockId, { "betterend:open": false });
      }
      if (!res || res.canceled || res.selection === undefined) return;
      const chosen = actions[res.selection];
      if (!chosen) return;

      if (chosen.type === "withdraw_index") {
        const removed = storedItems.splice(chosen.index, 1)[0];
        if (removed) {
          depositPlayerItem(player, removed, runtime.serverModule);
          runtime.store.updateStationState({
            dimension: dimId,
            anchor: loc,
            generationId: record.generationId,
            statePatch: { items: storedItems }
          });
          syncBookshelfStates(storedItems);
          try {
            player.playSound?.("random.pop");
            player.onScreenDisplay?.setActionBar?.(
              `§a[${formatTitle(shortName)}] Withdrew ${removed.count}x ${formatTitle(removed.itemId)}.`
            );
          } catch {}
        }
        return;
      }

      if (chosen.type === "deposit_modal") {
        const ModalFormData = runtime.uiModule?.ModalFormData;
        if (!ModalFormData) return;
        const inv = listPlayerInventoryStacks(player).filter((s) =>
          isBookshelf
            ? s.itemId.includes("book") || s.itemId === "betterend:guidebook"
            : true
        );
        if (inv.length === 0) {
          try {
            player.onScreenDisplay?.setActionBar?.(
              isBookshelf
                ? "§e[Chiseled Bookshelf] No books in your inventory to insert."
                : "§e[Container] Your inventory is empty."
            );
          } catch {}
          return;
        }
        const modal = new ModalFormData()
          .title(`Deposit into ${formatTitle(shortName)}`)
          .dropdown(
            "Select Item from Inventory:",
            inv.map((s) => `${formatTitle(s.itemId)} (x${s.count})`),
            { defaultValueIndex: 0 }
          )
          .slider("Amount to Deposit", 1, isBookshelf ? 1 : 64, {
            valueStep: 1,
            defaultValue: isBookshelf ? 1 : 16
          });

        modal
          .show(player)
          .then((mRes) => {
            if (!mRes || mRes.canceled || !Array.isArray(mRes.formValues)) return;
            const pick = inv[Number(mRes.formValues[0] ?? 0)];
            if (!pick) return;
            const amt = Math.min(pick.count, Math.max(1, Number(mRes.formValues[1] ?? 1)));
            const cRes = consumePlayerItem(player, pick.itemId, amt);
            if (!cRes.ok) return;
            storedItems.push({ itemId: pick.itemId, count: cRes.consumed });
            runtime.store.updateStationState({
              dimension: dimId,
              anchor: loc,
              generationId: record.generationId,
              statePatch: { items: storedItems }
            });
            syncBookshelfStates(storedItems);
            try {
              player.playSound?.("random.pop");
              player.onScreenDisplay?.setActionBar?.(
                `§a[${formatTitle(shortName)}] Stored ${cRes.consumed}x ${formatTitle(pick.itemId)}.`
              );
            } catch {}
          })
          .catch(() => {});
      }
    })
    .catch(() => {});
}

export function openSignEditorUi(runtime, player, block) {
  const ModalFormData = runtime.uiModule?.ModalFormData;
  if (!ModalFormData || !player || !block) return;

  const blockId = String(block.typeId ?? "betterend:mossy_glowshroom_sign");
  const shortName = blockId.replace(/^betterend:/, "").replace(/__p\d+$/, "");
  const dim = block.dimension ?? player.dimension;
  const dimId = normalizeDimensionId(dim?.id ?? "minecraft:the_end");
  const loc = normalizeBlockAnchor(block.location ?? { x: 0, y: 64, z: 0 });

  let record = runtime.store.getStation({ dimension: dimId, anchor: loc });
  if (!record) {
    record = runtime.store.registerStation({
      dimension: dimId,
      anchor: loc,
      stationType: "betterend:sign",
      state: { lines: ["", "", "", ""], glowing: false, color: "§f" }
    });
  }
  const lines = Array.isArray(record.state?.lines) ? record.state.lines : ["", "", "", ""];
  const glowing = Boolean(record.state?.glowing);

  const modal = new ModalFormData()
    .title(`Edit ${formatTitle(shortName)}`)
    .textField("Line 1:", "Enter sign text...", { defaultValue: lines[0] ?? "" })
    .textField("Line 2:", "Enter sign text...", { defaultValue: lines[1] ?? "" })
    .textField("Line 3:", "Enter sign text...", { defaultValue: lines[2] ?? "" })
    .textField("Line 4:", "Enter sign text...", { defaultValue: lines[3] ?? "" })
    .toggle("Glowing Sign Text", { defaultValue: glowing });

  modal
    .show(player)
    .then((res) => {
      if (!res || res.canceled || !Array.isArray(res.formValues)) return;
      const nextLines = [
        String(res.formValues[0] ?? "").slice(0, 32),
        String(res.formValues[1] ?? "").slice(0, 32),
        String(res.formValues[2] ?? "").slice(0, 32),
        String(res.formValues[3] ?? "").slice(0, 32)
      ];
      const nextGlow = Boolean(res.formValues[4]);
      runtime.store.updateStationState({
        dimension: dimId,
        anchor: loc,
        generationId: record.generationId,
        statePatch: {
          lines: nextLines,
          glowing: nextGlow
        }
      });
      const preview = nextLines.filter(Boolean).join(" | ") || "(Blank Sign)";
      try {
        player.playSound?.("item.book.page_turn");
        player.onScreenDisplay?.setActionBar?.(
          `${nextGlow ? "§b" : "§f"}[${formatTitle(shortName)}] ${preview}`
        );
      } catch {}
    })
    .catch(() => {});
}

// ============================================================================
// 6. MULTI-CHAPTER BETTEREND GUIDEBOOK UI (`openGuidebookUi`)
// ============================================================================

export function openGuidebookUi(runtime, player) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData || !player) return;

  const loc = player.location ?? { x: 0, y: 68, z: 0 };
  const dimId = player.dimension?.id ?? "minecraft:the_end";
  const pid = player.id ?? player.name ?? "player";
  const lookup = runtime.regionService.lookup(dimId, loc.x, loc.y, loc.z);
  const prog = runtime.presentationService.getPlayerProgression(pid);

  const currentRegionLabel = lookup.protectedCenter
    ? "Central End Dragon Island (Protected Radius <= 1024)"
    : `${formatTitle(lookup.effectiveRegion?.id ?? "the_end")} (${lookup.effectiveRegion?.layer ?? "surface"})`;

  const form = new ActionFormData()
    .title("BetterEnd 26.40 — Guidebook")
    .body(
      `§dCurrent Position: §f(${Math.round(loc.x)}, ${Math.round(loc.y)}, ${Math.round(loc.z)})\n` +
        `§dCurrent Region: §b${currentRegionLabel}\n` +
        `§dSurface / Cave / Aerial: §f${formatTitle(lookup.surfaceRegion?.id)} / ${formatTitle(lookup.caveRegion?.id ?? "none")} / ${formatTitle(lookup.aerialRegion?.id ?? "none")}\n` +
        `§dDiscovered Biomes: §a${prog.discoveredRegionsCount}/27 §7| §dAdvancements: §a${prog.unlockedCount}/${prog.totalAdvancements}\n\n` +
        `§7Select any of the 27 Outer-End Regions to teleport, or open a Guidebook Encyclopedia Chapter:`
    );

  // Keep the 27 regions at indices 0..26 so existing guidebook teleport automation continues to work,
  // and place the 5 Encyclopedia & Progression Chapters right after!
  for (const region of REGION_CATALOGUE) {
    const topBlock = region.surface?.topBlock ?? "betterend:end_moss";
    form.button(
      `§b${formatTitle(region.id)} [${region.layer}]\n§8Surface: ${formatTitle(topBlock)}`,
      resolveUiIconPath(topBlock)
    );
  }

  const chapterOffset = REGION_CATALOGUE.length;
  form.button(
    `§d📖 Chapter 1: Infusion Ritual Recipe Book (${DEFAULT_INFUSION_RECIPES.length} Recipes)`,
    resolveUiIconPath("betterend:infusion_pedestal")
  );
  form.button(
    `§6🔥 Chapter 2: End Stone Smelter & Alloying Guide`,
    resolveUiIconPath("betterend:end_stone_smelter")
  );
  form.button(
    `§b⚒ Chapter 3: Anvil Smithing, Hammers & Crystalite Gear`,
    resolveUiIconPath("betterend:aeternium_anvil")
  );
  form.button(
    `§e🌀 Chapter 4: Respawn Obelisk & Eternal Portal Guide`,
    resolveUiIconPath("betterend:respawn_obelisk")
  );
  form.button(
    `§a🏆 Chapter 5: Advancements & Biome Discovery (${prog.unlockedCount}/${prog.totalAdvancements})`,
    resolveUiIconPath("betterend:aurora_crystal")
  );

  form
    .show(player)
    .then((response) => {
      if (!response || response.canceled || response.selection === undefined) return;
      const sel = response.selection;
      if (sel < chapterOffset) {
        const chosen = REGION_CATALOGUE[sel];
        if (chosen) teleportPlayerToRegion(runtime, player, chosen);
        return;
      }
      const ch = sel - chapterOffset;
      if (ch === 0) openGuidebookInfusionChapter(runtime, player);
      else if (ch === 1) openGuidebookSmelterChapter(runtime, player);
      else if (ch === 2) openGuidebookAnvilChapter(runtime, player);
      else if (ch === 3) openGuidebookPortalsChapter(runtime, player);
      else if (ch === 4) openGuidebookAdvancementsChapter(runtime, player);
    })
    .catch(() => {});
}

export function teleportPlayerToRegion(runtime, player, chosen) {
  const target = runtime._findRegionCoordinate(chosen.id);
  const endDim =
    runtime.serverModule?.world?.getDimension?.("minecraft:the_end") ?? player.dimension;

  try {
    player.teleport(
      { x: target.x + 0.5, y: target.y + 2, z: target.z + 0.5 },
      { dimension: endDim }
    );
  } catch {
    try {
      player.runCommand?.(`tp @s ${target.x} ${target.y + 2} ${target.z}`);
    } catch {}
  }

  const runGenerate = () => {
    runtime._generateBiomeIslandAt(endDim, target.x, target.y, target.z, chosen.id, player);
    runtime.generationService.enqueuePlayerApproach(
      player.id ?? "player",
      "minecraft:the_end",
      target,
      { radiusCells: 1 }
    );
    runtime.generationService.stepPreparationQueue({ maxCells: 2 });
    const pres = runtime.presentationService.updatePlayerPresentation({
      playerId: player.id ?? "player",
      dimension: "minecraft:the_end",
      regionId: chosen.id,
      immediate: true,
      playerHandle: player
    });
    runtime._applyLivePlayerPresentation(player, pres);
    try {
      player.onScreenDisplay?.setActionBar?.(
        `§dBetterEnd §8| §b${formatTitle(chosen.id)} §7(${chosen.layer}) — §aTop: ${formatTitle(chosen.surface?.topBlock)}`
      );
    } catch {}
  };

  if (runtime.serverModule?.system?.runTimeout) {
    runtime.serverModule.system.runTimeout(runGenerate, 8);
  } else {
    runGenerate();
  }
}

function openGuidebookInfusionChapter(runtime, player) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData) return;

  const form = new ActionFormData()
    .title("Guidebook — Infusion Rituals (49)")
    .body(
      "§d8-Pedestal Infusion Ritual Setup:\n" +
        "§7Place 1 §fInfusion Pedestal §7in the center and 8 peripheral §fPedestals §7at:\n" +
        "§bN(0,-3), NE(+2,-2), E(+3,0), SE(+2,+2), S(0,+3), SW(-2,+2), W(-3,0), NW(-2,-2)\n\n" +
        "§7Select any recipe below to inspect its exact 8-Compass Catalyst diagram:"
    );

  form.button("§7⬅ Back to Guidebook Main Menu", resolveUiIconPath("betterend:guidebook"));
  for (const r of DEFAULT_INFUSION_RECIPES) {
    const enchObj =
      r.result?.enchantments ?? r.result?.components?.["minecraft:enchantments"] ?? null;
    const enchSummary = enchObj
      ? Object.entries(enchObj)
          .map(([k, v]) => `${formatTitle(k)} ${toRomanNumeral(v)}`)
          .join(", ")
      : null;
    const label = enchSummary
      ? `Enchanted Book: ${enchSummary}`
      : `${formatTitle(r.result.item)}`;
    form.button(
      `${label}\n§8Center: ${formatTitle(r.input)} (${r.time}t)`,
      resolveUiIconPath(r.result.item)
    );
  }

  form
    .show(player)
    .then((res) => {
      if (!res || res.canceled || res.selection === undefined) return;
      if (res.selection === 0) {
        openGuidebookUi(runtime, player);
        return;
      }
      const recipe = DEFAULT_INFUSION_RECIPES[res.selection - 1];
      if (recipe) {
        openInfusionRecipeDetailUi(runtime, player, null, recipe);
      }
    })
    .catch(() => {});
}

function openGuidebookSmelterChapter(runtime, player) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData) return;

  const alloyText = DEFAULT_ALLOYING_RECIPES.map(
    (r) =>
      `§b• ${formatTitle(r.result.item)} x${r.result.count}§7: ${r.ingredients.map(formatTitle).join(" + ")} (${r.smeltTime}t)`
  ).join("\n");

  const fuelText = Object.entries(SMELTER_FUEL_REGISTRY)
    .map(([fId, f]) => `§6• ${formatTitle(fId)}§7: Heat ${f.burnTime}, Speed ${f.speedMultiplier}x`)
    .join("\n");

  const form = new ActionFormData()
    .title("Guidebook — End Stone Smelter")
    .body(
      `§dEnd Stone Smelter Alloying Recipes (${DEFAULT_ALLOYING_RECIPES.length}):\n${alloyText}\n\n` +
        `§6Valid High-Heat Smelter Fuels:\n${fuelText}`
    )
    .button("§7⬅ Back to Guidebook Main Menu", resolveUiIconPath("betterend:guidebook"));

  form
    .show(player)
    .then(() => openGuidebookUi(runtime, player))
    .catch(() => {});
}

function openGuidebookAnvilChapter(runtime, player) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData) return;

  const smithText = DEFAULT_SMITHING_RECIPES.map(
    (r) =>
      `§b• ${formatTitle(r.result.item)} x${r.result.count}§7: ${r.inputCount}x ${formatTitle(r.input)} (Anvil Lvl ${r.anvilLevel}, Tool Lvl ${r.toolLevel})`
  ).join("\n");

  const form = new ActionFormData()
    .title("Guidebook — Anvil Smithing & Gear")
    .body(
      `§dBetterEnd Anvil Tiers:\n` +
        `§7• §fThallasium Anvil (Tier 1) §8| §fTerminite Anvil (Tier 2) §8| §fAeternium Anvil (Tier 5)\n` +
        `§7• All BetterEnd Anvils reduce material repair costs by §a1 unit§7!\n\n` +
        `§dCrystalite Set & Elytra Abilities:\n` +
        `§7• §bCrystalite Helmet: §fBlindness/Darkness Immunity\n` +
        `§7• §bCrystalite Chestplate / Elytra: §fHaste I\n` +
        `§7• §bCrystalite Leggings: §fHealth Boost I\n` +
        `§7• §bCrystalite Boots: §fSpeed I\n` +
        `§7• §bFull 4-Piece Set: §fRegeneration I + Absorption I\n\n` +
        `§dAnvil Smithing Recipes (${DEFAULT_SMITHING_RECIPES.length}):\n${smithText}`
    )
    .button("§7⬅ Back to Guidebook Main Menu", resolveUiIconPath("betterend:guidebook"));

  form
    .show(player)
    .then(() => openGuidebookUi(runtime, player))
    .catch(() => {});
}

function openGuidebookPortalsChapter(runtime, player) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData) return;

  const form = new ActionFormData()
    .title("Guidebook — Obelisk & Eternal Portal")
    .body(
      `§d1. Respawn Obelisk:\n` +
        `§7• Craft with §fAmber Blocks §7+ §fCrying Obsidian §7+ §fAurora Crystal§7.\n` +
        `§7• Right-click with §66x Amber Gem §7to bind your End Respawn Point.\n\n` +
        `§d2. Eternal Portal & Eternal Pedestals:\n` +
        `§7• Build a 16-block §fRuned Flavolite §7portal frame.\n` +
        `§7• Place 6 §fEternal Pedestals §7at offsets §b(-4,-5), (-4,+5), (-6,0), (+4,-5), (+4,+5), (+6,0)§7.\n` +
        `§7• Socket an §bEternal Crystal §7into all 6 pedestals and activate to open the Eternal Gateway.`
    )
    .button("§7⬅ Back to Guidebook Main Menu", resolveUiIconPath("betterend:guidebook"));

  form
    .show(player)
    .then(() => openGuidebookUi(runtime, player))
    .catch(() => {});
}

function openGuidebookAdvancementsChapter(runtime, player) {
  const ActionFormData = runtime.uiModule?.ActionFormData;
  if (!ActionFormData) return;

  const pid = player.id ?? player.name ?? "player";
  const prog = runtime.presentationService.getPlayerProgression(pid);
  const unlockedSet = new Set(prog.unlockedAdvancements);

  const advLines = runtime.presentationService.advancements.map((a) => {
    const done = unlockedSet.has(a.id);
    return `${done ? "§a✔" : "§7○"} §f${a.title} §8(${a.shortId}) [${a.category}]`;
  });

  const form = new ActionFormData()
    .title(`BetterEnd Advancements (${prog.unlockedCount}/${prog.totalAdvancements})`)
    .body(
      `§dDiscovered Outer-End Regions: §a${prog.discoveredRegionsCount}/27\n` +
        `§dUnlocked BetterEnd Advancements: §a${prog.unlockedCount}/${prog.totalAdvancements}\n\n` +
        advLines.join("\n")
    )
    .button("§7⬅ Back to Guidebook Main Menu", resolveUiIconPath("betterend:guidebook"));

  form
    .show(player)
    .then(() => openGuidebookUi(runtime, player))
    .catch(() => {});
}
