import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRecipeHyperedgeGraph, INFUSION_COMPASS_SLOTS, normalizeRecipeHyperedge, parseIngredientPredicate } from '../tools/recipes.mjs';
import { loadLockedRuntime } from '../tools/runtime-reconciliation.mjs';

const workspace = fileURLToPath(new URL('../', import.meta.url));

test('recipe hyperedge graph normalizes all 879 source recipes across 11 serializers and resolves merged tags and unlock advancements', async () => {
  const resourcesData = JSON.parse(await readFile(path.join(workspace, 'catalogue/generated/resources.json'), 'utf8'));
  const { runtime } = await loadLockedRuntime(workspace);
  const graph = buildRecipeHyperedgeGraph(resourcesData.resources, runtime);

  assert.equal(graph.counts.totalRecipes, 879);
  assert.equal(graph.counts.mainRecipes, 878);
  assert.equal(graph.counts.optionalRecipes, 1);
  assert.equal(graph.counts.ingredientTagCount, 21);
  assert.equal(graph.counts.allowedToolTagCount, 3);
  assert.equal(graph.counts.onlyHasTheRecipeAdvancements, 83);
  assert.equal(graph.counts.inventoryUnlockAdvancements, 796);
  assert.equal(graph.counts.missingUnlockAdvancements, 0);
  assert.equal(graph.counts.unresolvedTagReferences, 0);

  assert.deepEqual(graph.serializerCounts, {
    'bclib:alloying': 8,
    'bclib:smithing': 26,
    'betterend:infusion': 49,
    'minecraft:blasting': 23,
    'minecraft:campfire_cooking': 4,
    'minecraft:crafting_shaped': 487,
    'minecraft:crafting_shapeless': 126,
    'minecraft:smelting': 31,
    'minecraft:smithing_transform': 32,
    'minecraft:smoking': 4,
    'minecraft:stonecutting': 89,
  });

  const byKey = new Map(graph.edges.map(edge => [`${edge.scope}/${edge.id}`, edge]));

  // Optional guidebook boundary
  const guidebook = byKey.get('optional/patchouli_extensions/betterend:guide_book');
  assert.ok(guidebook);
  assert.equal(guidebook.activation.conditionalProfile, 'optional/patchouli_extensions');
  assert.equal(guidebook.result.itemId, 'betterend:guidebook');

  // BCLib smithing: anvil forging with retained/damaged hammer and bare allowedTools tag
  const terminiteHead = byKey.get('main/betterend:terminite_axe_head');
  assert.ok(terminiteHead);
  assert.equal(terminiteHead.station.family, 'anvil_forging');
  assert.equal(terminiteHead.station.requiredAnvilLevel, 3);
  assert.deepEqual(terminiteHead.station.stations, ['betterend:terminite_anvil', 'betterend:aeternium_anvil']);
  assert.equal(terminiteHead.inputs[0].role, 'anvil-material');
  assert.equal(terminiteHead.inputs[0].count, 3);
  assert.equal(terminiteHead.inputs[0].effect, 'consumed');
  assert.equal(terminiteHead.inputs[1].role, 'anvil-hammer');
  assert.equal(terminiteHead.inputs[1].count, 1);
  assert.equal(terminiteHead.inputs[1].effect, 'retained-and-damaged');
  assert.equal(terminiteHead.inputs[1].toolDamage, 3);
  assert.equal(terminiteHead.inputs[1].predicate.tagId, 'betterend:anvil_tool/diamond');
  assert.equal(terminiteHead.inputs[1].predicate.bareTagSyntax, true);
  assert.ok(terminiteHead.inputs[1].predicate.resolvedItems.includes('betterend:terminite_hammer'));
  assert.equal(terminiteHead.sideEffects.stationWearChance, 0.10);
  assert.equal(terminiteHead.sideEffects.bypassesVanillaAnvilXpCharge, true);
  assert.equal(terminiteHead.unlock.onlyHasTheRecipe, true);

  // Infusion: fixed compass slots, all 8 peripheral pedestals required, stored_enchantments preserved, no center inheritance
  const aquaAffinityBook = byKey.get('main/betterend:aqua_affinity_book');
  assert.ok(aquaAffinityBook);
  assert.equal(aquaAffinityBook.station.family, 'infusion_ritual');
  assert.equal(aquaAffinityBook.station.requiredPeripheralPedestalCount, 8);
  assert.equal(aquaAffinityBook.inputs.length, 9);
  assert.equal(aquaAffinityBook.inputs[0].role, 'infusion-center');
  assert.equal(aquaAffinityBook.inputs[0].effect, 'consumed');
  assert.deepEqual(
    aquaAffinityBook.inputs.slice(1).map(port => port.position),
    INFUSION_COMPASS_SLOTS.map(slot => slot.key),
  );
  assert.equal(aquaAffinityBook.inputs.slice(1).filter(port => port.effect === 'consumed').length, 8);
  assert.deepEqual(aquaAffinityBook.result.declaredComponents, {
    'minecraft:stored_enchantments': {
      'minecraft:aqua_affinity': 1,
    },
  });
  assert.equal(aquaAffinityBook.result.inheritancePolicy, 'none');

  const partialInfusion = graph.edges.find(
    edge => edge.serializer === 'betterend:infusion' && edge.placement.emptyCatalystCount > 0,
  );
  assert.ok(partialInfusion);
  assert.equal(partialInfusion.station.requiredPeripheralPedestalCount, 8);
  assert.equal(partialInfusion.inputs.length, 9);
  assert.ok(partialInfusion.inputs.slice(1).some(port => port.effect === 'required-empty'));
  assert.ok(partialInfusion.inputs.slice(1).some(port => port.effect === 'consumed'));

  // End Stone Smelter blasting: dual-station execution with distinct first and subsequent operation timings
  const blasting = graph.edges.find(edge => edge.serializer === 'minecraft:blasting');
  assert.ok(blasting);
  assert.equal(blasting.execution.stationExecutions.length, 2);
  const smelterBlasting = blasting.execution.stationExecutions.find(entry => entry.stationId === 'betterend:end_stone_smelter');
  assert.ok(smelterBlasting);
  assert.equal(smelterBlasting.firstOperationThreshold, 66);
  assert.equal(smelterBlasting.subsequentOperationThreshold, 33);
  assert.equal(smelterBlasting.progressIncrementPerTick, 2);
  assert.equal(smelterBlasting.firstOperationTicks, 33);
  assert.equal(smelterBlasting.subsequentOperationTicks, 17);
  assert.equal(smelterBlasting.fuelDurationMultiplier, 2);

  // Vanilla smithing transform: base component inheritance + WoVer setup
  const armoredElytra = graph.edges.find(
    edge => edge.serializer === 'minecraft:smithing_transform' && edge.result.itemId === 'betterend:elytra_armored',
  );
  assert.ok(armoredElytra);
  assert.equal(armoredElytra.result.inheritancePolicy, 'base-component-patch-then-result-template-then-wover-setup');
  assert.equal(armoredElytra.result.inheritedSourcePort, 'base');
  assert.deepEqual(armoredElytra.inputs.map(port => port.portId), ['template', 'base', 'addition']);
});

test('recipe hyperedge normalizer preserves alternatives vs occurrences and rejects malformed inputs', () => {
  const itemTagMap = new Map([
    ['wover:water_bottles', { id: 'wover:water_bottles', bound: true, members: ['minecraft:water_bucket'] }],
  ]);

  const sulphurGunpowder = normalizeRecipeHyperedge({
    id: 'betterend:sulphur_gunpowder',
    scope: 'main',
    value: {
      type: 'minecraft:crafting_shapeless',
      ingredients: [
        'minecraft:bone_meal',
        'betterend:crystalline_sulphur',
        ['minecraft:coal', 'minecraft:charcoal'],
      ],
      result: { id: 'minecraft:gunpowder', count: 3 },
    },
  }, { itemTagMap });

  assert.equal(sulphurGunpowder.inputs.length, 3);
  assert.equal(sulphurGunpowder.inputs[2].predicate.kind, 'alternatives');
  assert.deepEqual(sulphurGunpowder.inputs[2].predicate.items, ['minecraft:coal', 'minecraft:charcoal']);
  assert.equal(sulphurGunpowder.inputs[2].count, 1);

  assert.throws(
    () => parseIngredientPredicate({ item: 'minecraft:stone' }, itemTagMap),
    /Unsupported ingredient predicate/u,
  );
  assert.throws(
    () => normalizeRecipeHyperedge({
      id: 'betterend:bad_infusion',
      scope: 'main',
      value: {
        type: 'betterend:infusion',
        input: 'minecraft:book',
        catalysts: { up: 'betterend:amber_gem' },
        result: { item: 'minecraft:enchanted_book' },
        time: 100,
      },
    }),
    /unknown infusion catalyst compass key: up/u,
  );
});
