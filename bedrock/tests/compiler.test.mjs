import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AURORA_PALETTE,
  BULB_LANTERN_COLORS,
  HELIX_LEAVES_GRADIENT,
  HYDRALUX_PETAL_COLORS,
  JELLYSHROOM_CAP_GRADIENT,
  TENANEA_PALETTE,
  applyMultiplicativeTint,
  boostLanternColor,
  buildTextureSetJson,
  classifyMaterialPbr,
  crc32,
  decodePng,
  encodePng,
  generateMerMap,
  resolveTexturePath,
  tintPng,
  validateTextureSet,
} from '../tools/png-codec.mjs';
import {
  EXTERNAL_PARENT_TEMPLATES,
  compileAllModelsAndAssets,
} from '../tools/model-compiler.mjs';
import {
  BEDROCK_BLOCK_FORMAT_VERSION,
  BEDROCK_CLIENT_ENTITY_FORMAT_VERSION,
  BEDROCK_FEATURE_FORMAT_VERSION,
  BEDROCK_ITEM_FORMAT_VERSION,
  BEDROCK_RECIPE_FORMAT_VERSION,
  BEDROCK_SERVER_ENTITY_FORMAT_VERSION,
  MAX_BLOCK_PERMUTATIONS,
  MAX_BLOCK_TRAITS,
  compileAllContent,
} from '../tools/content-compiler.mjs';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '../..');

test('PNG codec decodes, tints, synthesizes MER maps, and round-trips real BetterEnd textures deterministically', () => {
  const sampleTextures = [
    'aurora_crystal.png',
    'tenanea_flowers.png',
    'helix_tree_leaves.png',
    'jellyshroom_cap_top.png',
    'hydralux_petal_block.png',
    'iron_bulb_lantern_color.png',
  ];

  for (const name of sampleTextures) {
    const absPath = resolveTexturePath(name, repoRoot);
    assert.ok(absPath.endsWith('.png'), `Expected resolved PNG path for ${name}`);

    const result = tintPng(name, [180, 90, 240], { repoRoot });
    assert.ok(result.width >= 16 && result.height >= 16);
    assert.equal(result.rgba.length, result.width * result.height * 4);

    // Verify PNG header & round-trip decoding
    assert.equal(result.png[0], 0x89);
    assert.equal(result.png[1], 0x50);
    assert.equal(result.png[2], 0x4e);
    assert.equal(result.png[3], 0x47);

    const redecoded = decodePng(result.png);
    assert.equal(redecoded.width, result.width);
    assert.equal(redecoded.height, result.height);
    assert.equal(redecoded.bitDepth, 8);
    assert.equal(redecoded.colorType, 6);
    assert.equal(Buffer.compare(redecoded.rgba, result.rgba), 0);

    // Verify MER synthesis & round-trip
    const merRes = generateMerMap(redecoded, {
      baseMer: classifyMaterialPbr(name).mer ?? [0, 0, 235],
      repoRoot,
    });
    const merDecoded = decodePng(merRes.png);
    assert.equal(Buffer.compare(merDecoded.rgba, merRes.rgba), 0);
  }

  // Verify exact multiplicative tint math preserving alpha
  const srcRgba = Buffer.from([255, 128, 64, 200, 100, 50, 25, 0]);
  const tinted = applyMultiplicativeTint(srcRgba, [128, 255, 64]);
  assert.deepEqual([...tinted], [
    Math.round((255 * 128) / 255),
    Math.round((128 * 255) / 255),
    Math.round((64 * 64) / 255),
    200,
    Math.round((100 * 128) / 255),
    Math.round((50 * 255) / 255),
    Math.round((25 * 64) / 255),
    0,
  ]);

  // Verify palette & gradient constants
  assert.equal(AURORA_PALETTE.length, 4);
  assert.equal(TENANEA_PALETTE.length, 4);
  assert.equal(HELIX_LEAVES_GRADIENT.length, 8);
  assert.equal(JELLYSHROOM_CAP_GRADIENT.length, 8);
  assert.equal(Object.keys(HYDRALUX_PETAL_COLORS).length, 16);
  assert.equal(Object.keys(BULB_LANTERN_COLORS).length, 16);

  // Verify saturation boost for bulb lantern colors
  const boosted = boostLanternColor([128, 64, 200]);
  assert.ok(Number.isInteger(boosted.r) && boosted.r >= 0 && boosted.r <= 255);
  assert.ok(Number.isInteger(boosted.g) && boosted.g >= 0 && boosted.g <= 255);
  assert.ok(Number.isInteger(boosted.b) && boosted.b >= 0 && boosted.b <= 255);

  // Verify IEEE 802.3 CRC32 standard check value ("123456789" -> 0xCBF43926)
  assert.equal(crc32(Buffer.from('123456789', 'ascii')), 0xcbf43926);
});

test('PBR material classification and .texture_set.json validation enforce §10.2 invariants', () => {
  const metalSet = buildTextureSetJson('aeternium_block');
  assert.equal(metalSet.format_version, '1.16.100');
  assert.equal(validateTextureSet(metalSet), true);

  const itemSet = buildTextureSetJson('aeternium_sword', { isItem: true });
  assert.equal(validateTextureSet(itemSet, { isItem: true }), true);
  assert.equal(itemSet['minecraft:texture_set'].heightmap, undefined);
  assert.throws(() => buildTextureSetJson('aeternium_sword', { isItem: true, heightmap: 'sword_h' }));

  // Reject invalid texture sets with both MER and MERS or both normal and heightmap
  const invalidBothMerAndMers = {
    format_version: '1.16.100',
    'minecraft:texture_set': {
      color: 'foo',
      metalness_emissive_roughness: [0, 0, 200],
      metalness_emissive_roughness_subsurface: [0, 0, 200, 50],
    },
  };
  assert.throws(() => validateTextureSet(invalidBothMerAndMers));

  const invalidBothNormalAndHeight = {
    format_version: '1.16.100',
    'minecraft:texture_set': {
      color: 'foo',
      metalness_emissive_roughness: [0, 0, 200],
      normal: 'foo_n',
      heightmap: 'foo_h',
    },
  };
  assert.throws(() => validateTextureSet(invalidBothNormalAndHeight));

  // Ensure material PBR never mixes high metalness with subsurface
  for (const name of ['aeternium_block', 'aurora_crystal', 'tenanea_leaves', 'violecite', 'dragon_tree_planks']) {
    const pbr = classifyMaterialPbr(name, { useSubsurface: true });
    if (pbr.mers) {
      assert.ok(!(pbr.mers[0] > 0 && pbr.mers[3] > 0), `Material ${name} cannot mix metalness and subsurface`);
    }
  }
});

test('Model, blockstate, visual preset, lighting, sound, and localization compiler resolves entire BetterEnd graph', async () => {
  const assets = await compileAllModelsAndAssets({ repoRoot });

  assert.equal(assets.counts.blockstates, 732);
  assert.ok(assets.counts.betterendModels >= 2548);
  assert.equal(assets.counts.patterns, 75);
  assert.ok(Object.keys(EXTERNAL_PARENT_TEMPLATES).length >= 105);
  assert.ok(assets.counts.geometries >= 1800);
  assert.equal(assets.counts.regions, 27);

  // Verify zero unresolved #texture variables across all concrete blockstate models
  for (const [blockId, bsDef] of assets.flattenedBlockstates) {
    const modelChoices = [...(bsDef.variants ?? []), ...(bsDef.multipartRules ?? [])];
    for (const choice of modelChoices) {
      const flat = choice.flattened;
      assert.ok(flat, `Missing flattened model for ${blockId} -> ${choice.modelId}`);
      for (const elem of flat.elements) {
        for (const face of Object.values(elem.faces ?? {})) {
          assert.ok(
            face.resolvedTexture && !String(face.resolvedTexture).startsWith('#'),
            `Unresolved texture variable ${face.texture} (${face.resolvedTexture}) in concrete blockstate model ${choice.modelId} for ${blockId}`,
          );
        }
      }
    }
  }

  // Verify every generated .texture_set.json passes strict validation
  for (const [texSetPath, texSetJson] of assets.textureSets) {
    const isItem = texSetPath.includes('/items/');
    assert.equal(validateTextureSet(texSetJson, { isItem }), true, `Invalid texture set at ${texSetPath}`);
  }

  // Verify all 27 region water configs use format_version 1.26.20 and NEVER include sampleWidth
  assert.equal(assets.visualPresets.water.size, 27);
  for (const [waterPath, waterJson] of assets.visualPresets.water) {
    assert.equal(waterJson.format_version, '1.26.20', `Unexpected water format_version in ${waterPath}`);
    const rawStr = JSON.stringify(waterJson);
    assert.equal(rawStr.includes('sampleWidth'), false, `Forbidden sampleWidth found in ${waterPath}`);
  }

  // Verify local_lighting/local_lighting.json
  const blockLightColors =
    assets.localLightingJson['minecraft:local_lighting_settings']?.block_light_colors ?? {};
  assert.ok(Object.keys(blockLightColors).length >= 79);
  assert.equal(blockLightColors['betterend:smaragdant_crystal'].light_color, '#17cfbd');
  assert.equal(blockLightColors['betterend:end_stone_smelter'].light_color, '#ff9436');
  assert.equal(blockLightColors['betterend:hydrothermal_vent'].light_color, '#65c8ff');

  // Verify sound_definitions.json and localization provenance
  assert.equal(assets.soundDefinitionsJson.format_version, '1.20.20');
  assert.ok(Object.keys(assets.soundDefinitionsJson.sound_definitions).length > 25);
  assert.ok(assets.localization.enUsLang.includes('block.betterend.end_stone_smelter=End Stone Smelter'));
  assert.equal(assets.localization.restrictedAssets.length, 3);
});

test('Content compiler lowers all 728 blocks (22,385 states), 850 items, 879 recipes, and 27+5 entities with bijective stateMap', async () => {
  const compiled = await compileAllContent({ repoRoot });

  // 1. Blocks & Bijective State Map (728 blocks, 22,385 states)
  assert.equal(compiled.counts.catalogueBlocks, 728);
  assert.equal(compiled.counts.totalBlockStates, 22385);
  assert.equal(compiled.blocks.forwardStateMap.size, 22385);
  assert.equal(compiled.blocks.reverseStateMap.size, 22385);

  // Verify every emitted Bedrock block definition obeys format_version 1.26.20, <= 64 permutations, <= 16 traits
  for (const [filePath, blockJson] of compiled.blocks.blockJsonMap) {
    assert.equal(blockJson.format_version, BEDROCK_BLOCK_FORMAT_VERSION, `Wrong format_version in ${filePath}`);
    const blockDef = blockJson['minecraft:block'];
    assert.ok(blockDef?.description?.identifier?.startsWith('betterend:'));

    const statesObj = blockDef.description.states ?? {};
    const traitKeys = Object.keys(statesObj);
    assert.ok(
      traitKeys.length <= MAX_BLOCK_TRAITS,
      `Block ${filePath} has ${traitKeys.length} traits (> ${MAX_BLOCK_TRAITS})`,
    );

    let domainProduct = 1;
    for (const [traitName, domain] of Object.entries(statesObj)) {
      assert.ok(traitName.startsWith('betterend:'), `Trait ${traitName} in ${filePath} must be namespaced`);
      assert.ok(
        Array.isArray(domain) && domain.length >= 1 && domain.length <= 16,
        `Trait ${traitName} in ${filePath} has invalid domain length ${domain?.length}`,
      );
      domainProduct *= domain.length;
    }
    assert.ok(
      domainProduct <= MAX_BLOCK_PERMUTATIONS,
      `Block ${filePath} state domain product ${domainProduct} exceeds ${MAX_BLOCK_PERMUTATIONS}`,
    );

    const perms = blockDef.permutations ?? [];
    assert.ok(
      perms.length <= MAX_BLOCK_PERMUTATIONS,
      `Block ${filePath} permutation count ${perms.length} exceeds ${MAX_BLOCK_PERMUTATIONS}`,
    );

    // Check collision_box and selection_box bounds
    for (const boxKey of ['minecraft:collision_box', 'minecraft:selection_box']) {
      const box = blockDef.components[boxKey];
      if (box !== false) {
        assert.equal(box.origin.length, 3);
        assert.equal(box.size.length, 3);
        assert.ok(box.origin[0] >= -8 && box.origin[0] <= 8);
        assert.ok(box.origin[1] >= 0 && box.origin[1] <= 16);
        assert.ok(box.origin[2] >= -8 && box.origin[2] <= 8);
        assert.ok(box.origin[0] + box.size[0] <= 8.001);
        assert.ok(box.origin[2] + box.size[2] <= 8.001);
      }
    }

    // Verify geometry, bone_visibility, material_instances, terrain_texture, and blocks.json sound
    const checkGeoAndMaterials = (comp, ctxLabel) => {
      const geo = comp['minecraft:geometry'];
      const matInst = comp['minecraft:material_instances'];
      if (geo) {
        if (geo.identifier !== 'minecraft:geometry.full_block') {
          const geoDoc = compiled.modelAssets.geometries.get(geo.identifier);
          assert.ok(geoDoc, `Missing geometry ${geo.identifier} in ${ctxLabel}`);
          const boneNames = new Set(
            (geoDoc['minecraft:geometry']?.[0]?.bones ?? []).map(b => b.name),
          );
          for (const visBone of Object.keys(geo.bone_visibility ?? {})) {
            assert.ok(
              boneNames.has(visBone),
              `Missing bone_visibility bone '${visBone}' in ${geo.identifier} (${ctxLabel})`,
            );
          }
          for (const bone of geoDoc['minecraft:geometry']?.[0]?.bones ?? []) {
            for (const cube of bone.cubes ?? []) {
              for (const faceUv of Object.values(cube.uv ?? {})) {
                if (faceUv?.material_instance) {
                  assert.ok(
                    matInst?.[faceUv.material_instance],
                    `Missing material_instance '${faceUv.material_instance}' for ${geo.identifier} in ${ctxLabel}`,
                  );
                }
              }
            }
          }
        }
      }
      if (matInst) {
        for (const [slotKey, inst] of Object.entries(matInst)) {
          assert.ok(
            compiled.modelAssets.terrainTextureJson.texture_data[inst.texture],
            `Missing terrain_texture.json entry '${inst.texture}' for slot '${slotKey}' in ${ctxLabel}`,
          );
        }
      }
    };

    checkGeoAndMaterials(blockDef.components, filePath);
    for (const [pIdx, perm] of perms.entries()) {
      checkGeoAndMaterials(perm.components, `${filePath}#perm${pIdx}`);
    }

    const blockSound = compiled.modelAssets.blocksJson[blockDef.description.identifier]?.sound;
    assert.ok(
      blockSound && blockSound !== 'normal',
      `Invalid or missing sound '${blockSound}' for ${blockDef.description.identifier}`,
    );
  }

  // Ensure zero unprefixed vanilla keys in terrain_texture.json
  for (const tKey of Object.keys(compiled.modelAssets.terrainTextureJson.texture_data)) {
    assert.ok(
      tKey.startsWith('betterend_'),
      `Unprefixed key '${tKey}' in terrain_texture.json would overwrite vanilla atlas entry`,
    );
  }
  assert.equal(compiled.entitiesAndFeatures.biomes.size, 27);

  // Verify bijective round-trip across ALL 22,385 states
  for (const [javaKey, record] of compiled.blocks.forwardStateMap) {
    const forwardLookup = compiled.blocks.lookupBedrockState(record.javaBlockId, record.javaProperties);
    assert.ok(forwardLookup, `Missing forward lookup for ${javaKey}`);
    const reverseLookup = compiled.blocks.lookupJavaState(
      forwardLookup.bedrockBlockId,
      forwardLookup.bedrockStates,
    );
    assert.ok(reverseLookup, `Missing reverse lookup for ${forwardLookup.canonicalBedrockStateKey}`);
    assert.equal(reverseLookup.canonicalJavaStateKey, javaKey);
    assert.equal(reverseLookup.javaStateIndex, record.javaStateIndex);
  }

  // 2. Items (all 850 items)
  assert.equal(compiled.counts.items, 850);
  for (const [itemPath, itemJson] of compiled.items.itemJsonMap) {
    assert.equal(itemJson.format_version, BEDROCK_ITEM_FORMAT_VERSION, `Wrong format_version in ${itemPath}`);
    const comp = itemJson['minecraft:item'].components;
    assert.ok(comp['minecraft:max_stack_size'] >= 1 && comp['minecraft:max_stack_size'] <= 64);
    const iconKey = comp['minecraft:icon']?.textures?.default;
    assert.ok(
      compiled.modelAssets.itemTextureJson.texture_data[iconKey],
      `Item ${itemPath} icon ${iconKey} is registered in item_texture.json`,
    );
  }

  // Spot-check key items (pickaxe, chestplate, armored elytra, cooked chorus mushroom)
  const pickaxe = compiled.items.itemJsonMap.get('items/aeternium_pickaxe.item.json')['minecraft:item'].components;
  assert.equal(pickaxe['minecraft:durability'].max_durability, 2196);
  assert.ok(pickaxe['minecraft:digger']);
  assert.deepEqual(pickaxe['minecraft:fire_resistant'], { value: true });

  const chestplate = compiled.items.itemJsonMap.get('items/aeternium_chestplate.item.json')['minecraft:item'].components;
  assert.equal(chestplate['minecraft:wearable'].slot, 'slot.armor.chest');
  assert.ok(chestplate['minecraft:wearable'].protection > 0);

  const elytra = compiled.items.itemJsonMap.get('items/elytra_armored.item.json')['minecraft:item'].components;
  assert.equal(elytra['minecraft:wearable'].slot, 'slot.armor.chest');

  const food = compiled.items.itemJsonMap.get('items/chorus_mushroom_cooked.item.json')['minecraft:item'].components;
  assert.equal(food['minecraft:food'].nutrition, 6);

  // 3. Recipes (all 879 recipes: 796 native + 8 alloying + 26 smithing + 49 infusion)
  assert.equal(compiled.counts.totalRecipes, 879);
  assert.equal(compiled.counts.nativeRecipeFiles, 796);
  assert.equal(compiled.counts.stationAlloyingRecipes, 8);
  assert.equal(compiled.counts.stationSmithingRecipes, 26);
  assert.equal(compiled.counts.stationInfusionRecipes, 49);
  assert.equal(
    compiled.counts.nativeRecipeFiles +
      compiled.counts.stationAlloyingRecipes +
      compiled.counts.stationSmithingRecipes +
      compiled.counts.stationInfusionRecipes,
    879,
  );
  assert.equal(compiled.recipes.stationRecipes.blastingSmelterFallback.length, 23);

  for (const [, recipeJson] of compiled.recipes.nativeRecipeFiles) {
    assert.equal(recipeJson.format_version, BEDROCK_RECIPE_FORMAT_VERSION);
  }

  // 4. Entities & Features (27 catalogue entities + 5 station carriers, 3 ore features + rules)
  assert.equal(compiled.counts.catalogueEntities, 27);
  assert.equal(compiled.counts.serverEntities, 32);
  assert.equal(compiled.counts.clientEntities, 27);
  assert.equal(compiled.entitiesAndFeatures.entityLootTables.size, 6);

  for (const [, serverEnt] of compiled.entitiesAndFeatures.serverEntities) {
    assert.equal(serverEnt.format_version, BEDROCK_SERVER_ENTITY_FORMAT_VERSION);
  }
  for (const [, clientEnt] of compiled.entitiesAndFeatures.clientEntities) {
    assert.equal(clientEnt.format_version, BEDROCK_CLIENT_ENTITY_FORMAT_VERSION);
  }
  for (const [, feat] of compiled.entitiesAndFeatures.features) {
    assert.equal(feat.format_version, BEDROCK_FEATURE_FORMAT_VERSION);
  }
  for (const [, rule] of compiled.entitiesAndFeatures.featureRules) {
    assert.equal(rule.format_version, BEDROCK_FEATURE_FORMAT_VERSION);
    assert.ok(
      String(rule['minecraft:feature_rules'].distribution.iterations).includes('1024'),
      'Feature rule must enforce >1024 outer-End protection',
    );
  }
});
