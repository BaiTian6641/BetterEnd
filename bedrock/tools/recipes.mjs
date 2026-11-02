import { compareText } from './source-files.mjs';

export const INFUSION_COMPASS_SLOTS = Object.freeze([
  { key: 'north', index: 0, offset: [0, 0, -3] },
  { key: 'north_east', index: 1, offset: [2, 0, -2] },
  { key: 'east', index: 2, offset: [3, 0, 0] },
  { key: 'south_east', index: 3, offset: [2, 0, 2] },
  { key: 'south', index: 4, offset: [0, 0, 3] },
  { key: 'south_west', index: 5, offset: [-2, 0, 2] },
  { key: 'west', index: 6, offset: [-3, 0, 0] },
  { key: 'north_west', index: 7, offset: [-2, 0, -2] },
]);

const INFUSION_COMPASS_BY_KEY = new Map(INFUSION_COMPASS_SLOTS.map(slot => [slot.key, slot]));

export const ANVIL_STATION_LEVELS = Object.freeze({
  'minecraft:anvil': 1,
  'minecraft:chipped_anvil': 1,
  'minecraft:damaged_anvil': 1,
  'betterend:thallasium_anvil': 2,
  'betterend:terminite_anvil': 3,
  'betterend:aeternium_anvil': 5,
});

function assertIdentifier(value, context) {
  if (typeof value !== 'string' || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/u.test(value)) {
    throw new Error(`Invalid identifier in ${context}: ${JSON.stringify(value)}`);
  }
  return value;
}

export function buildItemTagMap(resources = [], runtime = null) {
  const map = new Map();
  if (runtime?.registryTags?.['minecraft:item']) {
    for (const tag of runtime.registryTags['minecraft:item']) {
      map.set(tag.id, {
        id: tag.id,
        bound: tag.bound === true,
        members: Array.isArray(tag.members) ? [...tag.members].sort(compareText) : [],
        source: 'runtime-merged-registry-tag',
      });
    }
  }
  for (const resource of resources) {
    if (resource.category === 'tags/item' && resource.runtimeTag && !map.has(resource.id)) {
      map.set(resource.id, {
        id: resource.id,
        bound: resource.runtimeTag.bound === true,
        members: Array.isArray(resource.runtimeTag.members) ? [...resource.runtimeTag.members].sort(compareText) : [],
        source: 'catalogue-reconciled-runtime-tag',
      });
    }
  }
  return map;
}

export function parseIngredientPredicate(raw, itemTagMap = new Map(), { context = 'ingredient', allowBareTag = false } = {}) {
  if (typeof raw === 'string') {
    if (raw.startsWith('#')) {
      const tagId = assertIdentifier(raw.slice(1), `${context} tag`);
      const resolved = itemTagMap.get(tagId);
      return {
        kind: 'tag',
        raw,
        tagId,
        tagBound: resolved ? resolved.bound : false,
        items: [],
        resolvedItems: resolved?.bound ? [...resolved.members] : [],
      };
    }
    if (allowBareTag) {
      const tagId = assertIdentifier(raw, `${context} bare tag`);
      const resolved = itemTagMap.get(tagId);
      return {
        kind: 'tag',
        raw,
        tagId,
        bareTagSyntax: true,
        tagBound: resolved ? resolved.bound : false,
        items: [],
        resolvedItems: resolved?.bound ? [...resolved.members] : [],
      };
    }
    const itemId = assertIdentifier(raw, `${context} item`);
    return {
      kind: 'item',
      raw,
      tagId: null,
      tagBound: null,
      items: [itemId],
      resolvedItems: [itemId],
    };
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) throw new Error(`Empty ingredient alternatives in ${context}`);
    const items = [];
    const seen = new Set();
    for (const entry of raw) {
      if (typeof entry !== 'string' || entry.startsWith('#')) {
        throw new Error(`Unsupported ingredient alternative in ${context}: ${JSON.stringify(entry)}`);
      }
      const itemId = assertIdentifier(entry, `${context} alternative`);
      if (seen.has(itemId)) throw new Error(`Duplicate ingredient alternative ${itemId} in ${context}`);
      seen.add(itemId);
      items.push(itemId);
    }
    return {
      kind: 'alternatives',
      raw: [...items],
      tagId: null,
      tagBound: null,
      items,
      resolvedItems: [...items].sort(compareText),
    };
  }
  throw new Error(`Unsupported ingredient predicate in ${context}: ${JSON.stringify(raw)}`);
}

function parseCustomResult(result, context) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`Invalid custom result in ${context}`);
  }
  const itemId = assertIdentifier(result.item, `${context} result.item`);
  const count = result.count === undefined ? 1 : result.count;
  if (!Number.isInteger(count) || count < 1) throw new Error(`Invalid result count in ${context}: ${count}`);
  const declaredComponents = result.components ? structuredClone(result.components) : Object.create(null);
  return { itemId, count, resultFormat: 'custom-item-field', declaredComponents };
}

function parseVanillaResult(result, context) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`Invalid vanilla result in ${context}`);
  }
  if (Object.hasOwn(result, 'item')) {
    throw new Error(`Vanilla result in ${context} must use 'id', not 'item'`);
  }
  const itemId = assertIdentifier(result.id, `${context} result.id`);
  const count = result.count === undefined ? 1 : result.count;
  if (!Number.isInteger(count) || count < 1) throw new Error(`Invalid result count in ${context}: ${count}`);
  const declaredComponents = result.components ? structuredClone(result.components) : Object.create(null);
  return { itemId, count, resultFormat: 'vanilla-id-field', declaredComponents };
}

export function buildAdvancementUnlockIndex(resources = []) {
  const byRecipeId = new Map();
  for (const resource of resources) {
    if (resource.category !== 'advancement' || resource.format !== 'json') continue;
    const rewardedRecipes = resource.value?.rewards?.recipes;
    if (!Array.isArray(rewardedRecipes) || rewardedRecipes.length === 0) continue;
    const criteria = resource.value.criteria ?? {};
    const criteriaNames = Object.keys(criteria).sort(compareText);
    const nonRecipeCriteria = criteriaNames.filter(name => criteria[name]?.trigger !== 'minecraft:recipe_unlocked');
    const requirements = Array.isArray(resource.value.requirements)
      ? resource.value.requirements.map(group => [...group])
      : [criteriaNames];
    for (const recipeId of rewardedRecipes) {
      const key = `${resource.scope}/${recipeId}`;
      if (byRecipeId.has(key)) throw new Error(`Duplicate unlock advancement for ${key}`);
      byRecipeId.set(key, {
        advancementId: resource.id,
        scope: resource.scope,
        sourcePath: resource.source?.path ?? null,
        criteriaNames,
        nonRecipeCriteria,
        onlyHasTheRecipe: nonRecipeCriteria.length === 0 && criteriaNames.includes('has_the_recipe'),
        hasInventoryUnlockCriteria: nonRecipeCriteria.length > 0,
        requirements,
      });
    }
  }
  return byRecipeId;
}

export function normalizeRecipeHyperedge(recipeRecord, { itemTagMap = new Map(), unlockIndex = new Map() } = {}) {
  const { id, scope = 'main', value, source } = recipeRecord;
  if (!value || typeof value !== 'object') throw new Error(`Missing recipe JSON value for ${id}`);
  const serializer = value.type;
  if (typeof serializer !== 'string') throw new Error(`Missing serializer for ${id}`);
  const context = `${scope}/${id} (${serializer})`;
  const unlockRecord = unlockIndex.get(`${scope}/${id}`) ?? null;

  let station;
  let placement;
  let inputs;
  let result;
  let execution;
  let sideEffects;
  let stationChecksUnlock = false;

  switch (serializer) {
    case 'bclib:alloying': {
      if (!Array.isArray(value.ingredients) || value.ingredients.length !== 2) {
        throw new Error(`${context} requires exactly 2 alloying ingredients`);
      }
      const ports = value.ingredients.map((raw, index) => ({
        portId: `alloy_slot_${index}`,
        role: 'alloy-input',
        slotIndex: index,
        count: 1,
        effect: 'consumed',
        remainderPolicy: 'none',
        predicate: parseIngredientPredicate(raw, itemTagMap, { context: `${context} ingredients[${index}]` }),
      }));
      const baseResult = parseCustomResult(value.result, context);
      const smeltTime = value.smelttime ?? 350;
      const experience = value.experience ?? 0;
      station = {
        family: 'end_stone_smelter',
        stations: ['betterend:end_stone_smelter'],
        mode: 'alloying',
        requiresBothInputSlotsOccupied: true,
      };
      placement = {
        kind: 'interchangeable-pair',
        permutationsChecked: [[0, 1], [1, 0]],
      };
      inputs = ports;
      result = {
        ...baseResult,
        inheritancePolicy: 'none',
        postAssemblySetupHook: 'wover:item_stack_setup',
      };
      execution = {
        timed: true,
        declaredTime: smeltTime,
        progressIncrementPerTick: 1,
        effectiveTicks: smeltTime,
        fuelRequired: true,
        fuelAcceptancePolicy: 'end-stone-smelter-explicit-or-high-heat-providers',
        fuelDurationMultiplier: 1,
        usesFuelSpeedMultiplier: false,
      };
      sideEffects = {
        xp: experience,
        xpPayoutMode: 'per-completed-operation-floor-plus-fractional-chance',
        fuelRemainderPolicy: 'fuel-slot-when-empty',
        inputRemainderPolicy: 'none',
        toolDamage: 0,
        stationWearChance: 0,
        criteriaTrigger: 'minecraft:recipe_crafted',
      };
      break;
    }

    case 'bclib:smithing': {
      const inputCount = value.inputCount ?? 1;
      if (!Number.isInteger(inputCount) || inputCount < 1) {
        throw new Error(`${context} has invalid inputCount: ${value.inputCount}`);
      }
      const anvilLevel = value.anvilLevel ?? 1;
      const damage = value.damage ?? 0;
      if (!Number.isInteger(anvilLevel) || anvilLevel < 1) {
        throw new Error(`${context} has invalid anvilLevel: ${value.anvilLevel}`);
      }
      if (!Number.isInteger(damage) || damage < 0) {
        throw new Error(`${context} has invalid damage: ${value.damage}`);
      }
      const materialPort = {
        portId: 'material',
        role: 'anvil-material',
        count: inputCount,
        effect: 'consumed',
        remainderPolicy: 'none',
        predicate: parseIngredientPredicate(value.input, itemTagMap, { context: `${context} input` }),
      };
      const toolPredicate = parseIngredientPredicate(value.allowedTools, itemTagMap, {
        context: `${context} allowedTools`,
        allowBareTag: true,
      });
      const hammerClassificationTag = itemTagMap.get('wover:tools/hammers');
      const eligibleHammers = hammerClassificationTag?.bound
        ? toolPredicate.resolvedItems.filter(item => hammerClassificationTag.members.includes(item))
        : [...toolPredicate.resolvedItems];
      const toolPort = {
        portId: 'hammer',
        role: 'anvil-hammer',
        count: 1,
        effect: 'retained-and-damaged',
        remainderPolicy: 'retained-in-anvil-slot',
        toolDamage: damage,
        damageEquipmentSlot: 'offhand',
        durabilityGate: 'hammer.damageValue + recipe.damage < hammer.maxDamage',
        classificationTagId: 'wover:tools/hammers',
        predicate: {
          ...toolPredicate,
          resolvedItems: eligibleHammers,
        },
      };
      const eligibleStations = Object.entries(ANVIL_STATION_LEVELS)
        .filter(([, level]) => level >= anvilLevel)
        .map(([stationId]) => stationId);
      const baseResult = parseCustomResult(value.result, context);
      station = {
        family: 'anvil_forging',
        stations: eligibleStations,
        requiredAnvilLevel: anvilLevel,
        stationLevels: ANVIL_STATION_LEVELS,
      };
      placement = {
        kind: 'unordered-material-and-hammer',
        selectableResultCycling: true,
        renamingDisabledWhileActive: true,
      };
      inputs = [materialPort, toolPort];
      result = {
        ...baseResult,
        inheritancePolicy: 'none',
        postAssemblySetupHook: 'wover:item_stack_setup',
      };
      execution = {
        timed: false,
        declaredTime: 0,
        fuelRequired: false,
      };
      sideEffects = {
        xp: 0,
        xpCost: 0,
        bypassesVanillaAnvilXpCharge: true,
        fuelRemainderPolicy: 'none',
        inputRemainderPolicy: 'none',
        toolDamage: damage,
        stationWearChance: 0.10,
        stationWearTarget: 'bclib:leveled_anvil_block',
        criteriaTrigger: null,
      };
      break;
    }

    case 'betterend:infusion': {
      if (!value.catalysts || typeof value.catalysts !== 'object' || Array.isArray(value.catalysts)) {
        throw new Error(`${context} requires a compass-keyed catalysts object`);
      }
      for (const key of Object.keys(value.catalysts)) {
        if (!INFUSION_COMPASS_BY_KEY.has(key)) {
          throw new Error(`${context} has unknown infusion catalyst compass key: ${key}`);
        }
      }
      const centerPort = {
        portId: 'center',
        role: 'infusion-center',
        position: 'center',
        offset: [0, 0, 0],
        count: 1,
        effect: 'consumed',
        remainderPolicy: 'none',
        predicate: parseIngredientPredicate(value.input, itemTagMap, { context: `${context} input` }),
      };
      const catalystPorts = INFUSION_COMPASS_SLOTS.map(slot => {
        const rawCatalyst = value.catalysts[slot.key];
        if (rawCatalyst === undefined) {
          return {
            portId: `catalyst_${slot.key}`,
            role: 'infusion-catalyst',
            position: slot.key,
            compassIndex: slot.index,
            offset: slot.offset,
            count: 0,
            effect: 'required-empty',
            remainderPolicy: 'none',
            predicate: {
              kind: 'empty',
              raw: null,
              tagId: null,
              tagBound: null,
              items: [],
              resolvedItems: [],
            },
          };
        }
        return {
          portId: `catalyst_${slot.key}`,
          role: 'infusion-catalyst',
          position: slot.key,
          compassIndex: slot.index,
          offset: slot.offset,
          count: 1,
          effect: 'consumed',
          remainderPolicy: 'none',
          predicate: parseIngredientPredicate(rawCatalyst, itemTagMap, {
            context: `${context} catalysts.${slot.key}`,
          }),
        };
      });
      const baseResult = parseCustomResult(value.result, context);
      const time = value.time;
      if (!Number.isInteger(time) || time < 1) {
        throw new Error(`${context} has invalid infusion time: ${time}`);
      }
      station = {
        family: 'infusion_ritual',
        centerBlock: 'betterend:infusion_pedestal',
        peripheralBlockTag: 'betterend:pedestal',
        requiredPeripheralPedestalCount: 8,
        compassSlots: INFUSION_COMPASS_SLOTS,
      };
      placement = {
        kind: 'fixed-compass-ring',
        rotatable: false,
        populatedCatalystCount: catalystPorts.filter(port => port.effect === 'consumed').length,
        emptyCatalystCount: catalystPorts.filter(port => port.effect === 'required-empty').length,
      };
      inputs = [centerPort, ...catalystPorts];
      result = {
        ...baseResult,
        inheritancePolicy: 'none',
        postAssemblySetupHook: 'wover:item_stack_setup',
      };
      execution = {
        timed: true,
        declaredTime: time,
        progressIncrementPerTick: 1,
        effectiveTicks: time,
        fuelRequired: false,
      };
      sideEffects = {
        xp: 0,
        fuelRemainderPolicy: 'none',
        inputRemainderPolicy: 'none',
        clearsAllNinePedestalsOnComplete: true,
        toolDamage: 0,
        stationWearChance: 0,
        criteriaTrigger: 'betterend:infusion_finished',
        criteriaTriggerRadius: 16,
      };
      break;
    }

    case 'minecraft:crafting_shaped': {
      if (!Array.isArray(value.pattern) || value.pattern.length === 0 || value.pattern.length > 3) {
        throw new Error(`${context} has invalid shaped pattern rows`);
      }
      const height = value.pattern.length;
      const width = value.pattern[0].length;
      if (width < 1 || width > 3 || value.pattern.some(row => typeof row !== 'string' || row.length !== width)) {
        throw new Error(`${context} has inconsistent shaped pattern width`);
      }
      if (!value.key || typeof value.key !== 'object' || Array.isArray(value.key)) {
        throw new Error(`${context} is missing shaped key map`);
      }
      const keyPredicates = new Map();
      for (const [symbol, raw] of Object.entries(value.key)) {
        if (symbol.length !== 1 || symbol === ' ') {
          throw new Error(`${context} has invalid shaped key symbol: ${JSON.stringify(symbol)}`);
        }
        keyPredicates.set(symbol, parseIngredientPredicate(raw, itemTagMap, { context: `${context} key.${symbol}` }));
      }
      const cells = [];
      const usedSymbols = new Set();
      for (let row = 0; row < height; row += 1) {
        for (let col = 0; col < width; col += 1) {
          const symbol = value.pattern[row][col];
          if (symbol === ' ') {
            cells.push({
              portId: `cell_${row}_${col}`,
              role: 'shaped-cell',
              row,
              col,
              symbol: ' ',
              count: 0,
              effect: 'required-empty',
              remainderPolicy: 'none',
              predicate: {
                kind: 'empty',
                raw: null,
                tagId: null,
                tagBound: null,
                items: [],
                resolvedItems: [],
              },
            });
          } else {
            const predicate = keyPredicates.get(symbol);
            if (!predicate) throw new Error(`${context} pattern references undefined symbol ${JSON.stringify(symbol)}`);
            usedSymbols.add(symbol);
            cells.push({
              portId: `cell_${row}_${col}`,
              role: 'shaped-cell',
              row,
              col,
              symbol,
              count: 1,
              effect: 'consumed',
              remainderPolicy: 'item-crafting-remainder-to-slot-or-inventory',
              predicate,
            });
          }
        }
      }
      for (const symbol of keyPredicates.keys()) {
        if (!usedSymbols.has(symbol)) {
          throw new Error(`${context} defines unused key symbol ${JSON.stringify(symbol)}`);
        }
      }
      const baseResult = parseVanillaResult(value.result, context);
      station = {
        family: 'crafting_grid',
        stations: width <= 2 && height <= 2
          ? ['minecraft:player_crafting_grid', 'minecraft:crafting_table', '#c:PlayerWorkstations/crafting_tables']
          : ['minecraft:crafting_table', '#c:PlayerWorkstations/crafting_tables'],
        minGridWidth: width,
        minGridHeight: height,
      };
      placement = {
        kind: 'shaped-grid',
        width,
        height,
        pattern: [...value.pattern],
        occupiedCellCount: cells.filter(cell => cell.effect === 'consumed').length,
        emptyCellCount: cells.filter(cell => cell.effect === 'required-empty').length,
      };
      inputs = cells;
      result = {
        ...baseResult,
        inheritancePolicy: 'none',
        postAssemblySetupHook: 'wover:item_stack_setup',
      };
      execution = {
        timed: false,
        declaredTime: 0,
        fuelRequired: false,
      };
      sideEffects = {
        xp: 0,
        fuelRemainderPolicy: 'none',
        inputRemainderPolicy: 'item-crafting-remainder-to-slot-or-inventory',
        toolDamage: 0,
        stationWearChance: 0,
        criteriaTrigger: 'minecraft:recipe_crafted',
      };
      break;
    }

    case 'minecraft:crafting_shapeless': {
      if (!Array.isArray(value.ingredients) || value.ingredients.length === 0 || value.ingredients.length > 9) {
        throw new Error(`${context} has invalid shapeless ingredients list`);
      }
      const ports = value.ingredients.map((raw, index) => ({
        portId: `ingredient_${index}`,
        role: 'shapeless-input',
        occurrenceIndex: index,
        count: 1,
        effect: 'consumed',
        remainderPolicy: 'item-crafting-remainder-to-slot-or-inventory',
        predicate: parseIngredientPredicate(raw, itemTagMap, { context: `${context} ingredients[${index}]` }),
      }));
      const baseResult = parseVanillaResult(value.result, context);
      station = {
        family: 'crafting_grid',
        stations: ports.length <= 4
          ? ['minecraft:player_crafting_grid', 'minecraft:crafting_table', '#c:PlayerWorkstations/crafting_tables']
          : ['minecraft:crafting_table', '#c:PlayerWorkstations/crafting_tables'],
        minSlots: ports.length,
      };
      placement = {
        kind: 'unordered-occurrences',
        ingredientCount: ports.length,
      };
      inputs = ports;
      result = {
        ...baseResult,
        inheritancePolicy: 'none',
        postAssemblySetupHook: 'wover:item_stack_setup',
      };
      execution = {
        timed: false,
        declaredTime: 0,
        fuelRequired: false,
      };
      sideEffects = {
        xp: 0,
        fuelRemainderPolicy: 'none',
        inputRemainderPolicy: 'item-crafting-remainder-to-slot-or-inventory',
        toolDamage: 0,
        stationWearChance: 0,
        criteriaTrigger: 'minecraft:recipe_crafted',
      };
      break;
    }

    case 'minecraft:blasting':
    case 'minecraft:smelting':
    case 'minecraft:smoking': {
      const defaultTimes = {
        'minecraft:blasting': 100,
        'minecraft:smelting': 200,
        'minecraft:smoking': 100,
      };
      const cookingTime = value.cookingtime ?? defaultTimes[serializer];
      const experience = value.experience ?? 0;
      const inputPort = {
        portId: 'input',
        role: 'cooking-input',
        count: 1,
        effect: 'consumed',
        remainderPolicy: 'wet-sponge-bucket-special-case-only',
        predicate: parseIngredientPredicate(value.ingredient, itemTagMap, { context: `${context} ingredient` }),
      };
      const baseResult = parseVanillaResult(value.result, context);
      const stationExecutions = [];
      if (serializer === 'minecraft:blasting') {
        stationExecutions.push(
          {
            stationId: 'minecraft:blast_furnace',
            mode: 'vanilla-blasting',
            totalTimeFormula: 'ceil(cookingTime / speedMultiplier)',
            declaredTime: cookingTime,
            progressIncrementPerTick: 1,
            unlitDecayPerTick: 2,
            fuelAcceptancePolicy: 'data-component-cooking-fuel',
            fuelDurationMultiplier: 1,
            usesFuelSpeedMultiplier: true,
            fuelRemainderPolicy: 'fuel-slot-when-empty-else-drop',
          },
          {
            stationId: 'betterend:end_stone_smelter',
            mode: 'end-stone-smelter-single-slot-blasting',
            requiresSingleInputSlotOccupied: true,
            firstOperationThreshold: Math.trunc(cookingTime / 1.5),
            subsequentOperationThreshold: Math.trunc(cookingTime / 3),
            progressIncrementPerTick: 2,
            firstOperationTicks: Math.ceil(Math.trunc(cookingTime / 1.5) / 2),
            subsequentOperationTicks: Math.ceil(Math.trunc(cookingTime / 3) / 2),
            fuelAcceptancePolicy: 'end-stone-smelter-explicit-or-high-heat-providers',
            fuelDurationMultiplier: 2,
            usesFuelSpeedMultiplier: false,
            fuelRemainderPolicy: 'fuel-slot-when-empty',
          },
        );
      } else if (serializer === 'minecraft:smelting') {
        stationExecutions.push({
          stationId: '#wover:furnaces',
          mode: 'vanilla-smelting',
          totalTimeFormula: 'ceil(cookingTime / speedMultiplier)',
          declaredTime: cookingTime,
          progressIncrementPerTick: 1,
          unlitDecayPerTick: 2,
          fuelAcceptancePolicy: 'data-component-cooking-fuel',
          fuelDurationMultiplier: 1,
          usesFuelSpeedMultiplier: true,
          fuelRemainderPolicy: 'fuel-slot-when-empty-else-drop',
        });
      } else {
        stationExecutions.push({
          stationId: 'minecraft:smoker',
          mode: 'vanilla-smoking',
          totalTimeFormula: 'ceil(cookingTime / speedMultiplier)',
          declaredTime: cookingTime,
          progressIncrementPerTick: 1,
          unlitDecayPerTick: 2,
          fuelAcceptancePolicy: 'data-component-cooking-fuel',
          fuelDurationMultiplier: 1,
          usesFuelSpeedMultiplier: true,
          fuelRemainderPolicy: 'fuel-slot-when-empty-else-drop',
        });
      }
      station = {
        family: serializer.slice('minecraft:'.length),
        stations: stationExecutions.map(entry => entry.stationId),
      };
      placement = {
        kind: 'single-slot-input',
      };
      inputs = [inputPort];
      result = {
        ...baseResult,
        inheritancePolicy: 'none',
        postAssemblySetupHook: null,
      };
      execution = {
        timed: true,
        declaredTime: cookingTime,
        fuelRequired: true,
        stationExecutions,
      };
      sideEffects = {
        xp: experience,
        xpPayoutMode: 'per-completed-operation-floor-plus-fractional-chance',
        fuelRemainderPolicy: serializer === 'minecraft:blasting' ? 'station-dependent' : 'fuel-slot-when-empty-else-drop',
        inputRemainderPolicy: 'wet-sponge-bucket-special-case-only',
        toolDamage: 0,
        stationWearChance: 0,
        criteriaTrigger: 'minecraft:recipe_crafted',
      };
      break;
    }

    case 'minecraft:campfire_cooking': {
      const cookingTime = value.cookingtime ?? 600;
      const experience = value.experience ?? 0;
      const inputPort = {
        portId: 'input',
        role: 'campfire-input',
        count: 1,
        effect: 'consumed-on-place',
        remainderPolicy: 'none',
        predicate: parseIngredientPredicate(value.ingredient, itemTagMap, { context: `${context} ingredient` }),
      };
      const baseResult = parseVanillaResult(value.result, context);
      station = {
        family: 'campfire',
        stations: ['minecraft:campfire', 'minecraft:soul_campfire'],
        concurrentSlots: 4,
      };
      placement = {
        kind: 'campfire-slot',
      };
      inputs = [inputPort];
      result = {
        ...baseResult,
        inheritancePolicy: 'none',
        postAssemblySetupHook: null,
      };
      execution = {
        timed: true,
        declaredTime: cookingTime,
        litProgressIncrementPerTick: 1,
        unlitCooldownDecrementPerTick: 2,
        effectiveTicksWhenLit: cookingTime,
        fuelRequired: false,
      };
      sideEffects = {
        xp: experience,
        outputDelivery: 'drop-in-world-at-block-pos',
        fuelRemainderPolicy: 'none',
        inputRemainderPolicy: 'none',
        toolDamage: 0,
        stationWearChance: 0,
        criteriaTrigger: null,
      };
      break;
    }

    case 'minecraft:smithing_transform': {
      const roles = ['template', 'base', 'addition'];
      const ports = roles.map((role, index) => ({
        portId: role,
        role: `smithing-${role}`,
        slotIndex: index,
        count: 1,
        effect: 'consumed',
        remainderPolicy: 'none',
        predicate: parseIngredientPredicate(value[role], itemTagMap, { context: `${context} ${role}` }),
      }));
      const baseResult = parseVanillaResult(value.result, context);
      station = {
        family: 'smithing_table',
        stations: ['minecraft:smithing_table'],
      };
      placement = {
        kind: 'positional-triplet',
        slotOrder: roles,
      };
      inputs = ports;
      result = {
        ...baseResult,
        inheritancePolicy: 'base-component-patch-then-result-template-then-wover-setup',
        inheritedSourcePort: 'base',
        postAssemblySetupHook: 'wover:item_stack_setup',
      };
      execution = {
        timed: false,
        declaredTime: 0,
        fuelRequired: false,
      };
      sideEffects = {
        xp: 0,
        fuelRemainderPolicy: 'none',
        inputRemainderPolicy: 'none',
        toolDamage: 0,
        stationWearChance: 0,
        criteriaTrigger: 'minecraft:recipe_crafted',
      };
      break;
    }

    case 'minecraft:stonecutting': {
      const inputPort = {
        portId: 'input',
        role: 'stonecutter-input',
        count: 1,
        effect: 'consumed',
        remainderPolicy: 'none',
        predicate: parseIngredientPredicate(value.ingredient, itemTagMap, { context: `${context} ingredient` }),
      };
      const baseResult = parseVanillaResult(value.result, context);
      station = {
        family: 'stonecutter',
        stations: ['minecraft:stonecutter'],
      };
      placement = {
        kind: 'single-input-selectable-output',
      };
      inputs = [inputPort];
      result = {
        ...baseResult,
        inheritancePolicy: 'none',
        postAssemblySetupHook: null,
      };
      execution = {
        timed: false,
        declaredTime: 0,
        fuelRequired: false,
      };
      sideEffects = {
        xp: 0,
        fuelRemainderPolicy: 'none',
        inputRemainderPolicy: 'none',
        toolDamage: 0,
        stationWearChance: 0,
        criteriaTrigger: 'minecraft:recipe_crafted',
      };
      break;
    }

    default:
      throw new Error(`Unsupported recipe serializer in ${context}`);
  }

  return {
    id,
    scope,
    serializer,
    group: value.group ?? null,
    category: value.category ?? null,
    source: source ?? null,
    activation: {
      sourcePresent: true,
      effectiveResourcePresent: recipeRecord.runtimeResource != null,
      liveRecipeManagerVerified: false,
      conditionalProfile: scope === 'main' ? null : scope,
    },
    station,
    placement,
    inputs,
    result,
    execution,
    sideEffects,
    unlock: unlockRecord
      ? { ...unlockRecord, stationChecksUnlock }
      : null,
  };
}

export function buildRecipeHyperedgeGraph(resources, runtime = null) {
  const itemTagMap = buildItemTagMap(resources, runtime);
  const unlockIndex = buildAdvancementUnlockIndex(resources);
  const recipeRecords = resources
    .filter(record => record.category === 'recipe' && record.format === 'json')
    .sort((a, b) => compareText(`${a.scope}/${a.id}`, `${b.scope}/${b.id}`));

  const edges = [];
  const serializerCounts = Object.create(null);
  const ingredientTagIds = new Set();
  const allowedToolTagIds = new Set();
  const unresolvedTags = [];
  let missingUnlockAdvancements = 0;
  let onlyHasTheRecipeCount = 0;
  let inventoryUnlockCount = 0;

  for (const record of recipeRecords) {
    const edge = normalizeRecipeHyperedge(record, { itemTagMap, unlockIndex });
    edges.push(edge);
    serializerCounts[edge.serializer] = (serializerCounts[edge.serializer] ?? 0) + 1;

    if (!edge.unlock) {
      missingUnlockAdvancements += 1;
    } else if (edge.unlock.onlyHasTheRecipe) {
      onlyHasTheRecipeCount += 1;
    } else if (edge.unlock.hasInventoryUnlockCriteria) {
      inventoryUnlockCount += 1;
    }

    for (const port of edge.inputs) {
      if (port.predicate.kind === 'tag') {
        if (port.role === 'anvil-hammer') allowedToolTagIds.add(port.predicate.tagId);
        else ingredientTagIds.add(port.predicate.tagId);
        if (!port.predicate.tagBound || port.predicate.resolvedItems.length === 0) {
          unresolvedTags.push({
            recipeId: edge.id,
            scope: edge.scope,
            portId: port.portId,
            tagId: port.predicate.tagId,
            tagBound: port.predicate.tagBound,
            resolvedCount: port.predicate.resolvedItems.length,
          });
        }
      }
    }
  }

  const sortedSerializerCounts = Object.fromEntries(
    Object.entries(serializerCounts).sort(([a], [b]) => compareText(a, b)),
  );

  return {
    schemaVersion: 1,
    counts: {
      totalRecipes: edges.length,
      mainRecipes: edges.filter(edge => edge.scope === 'main').length,
      optionalRecipes: edges.filter(edge => edge.scope !== 'main').length,
      ingredientTagCount: ingredientTagIds.size,
      allowedToolTagCount: allowedToolTagIds.size,
      onlyHasTheRecipeAdvancements: onlyHasTheRecipeCount,
      inventoryUnlockAdvancements: inventoryUnlockCount,
      missingUnlockAdvancements,
      unresolvedTagReferences: unresolvedTags.length,
    },
    serializerCounts: sortedSerializerCounts,
    ingredientTags: [...ingredientTagIds].sort(compareText),
    allowedToolTags: [...allowedToolTagIds].sort(compareText),
    unresolvedTags,
    edges,
  };
}
