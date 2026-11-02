/**
 * BetterEnd Bedrock 26.40 — Deterministic Production Pack Builder (`build-packs.mjs`).
 *
 * Builds:
 * 1. `bedrock/upstream/asset-provenance.csv`
 * 2. `bedrock/dist/packs/stable-2640/` (`behavior_pack/`, `resource_pack/`, `BetterEnd-26.40-Stable.mcaddon`, `build-manifest.json`)
 * 3. `bedrock/dist/packs/experimental-2640/` (`behavior_pack/`, `resource_pack/`, `BetterEnd-26.40-ExperimentalVV.mcaddon`, `build-manifest.json`)
 * 4. `bedrock/dist/packs/industrial_bp/` (optional compatibility / recipe interoperability pack `INT-001`)
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync } from 'fflate';
import {
  SOURCE_COMMIT,
  assertUniquePortablePaths,
  compareText,
  hashBytes,
  stableJson,
  walkFiles,
} from './source-files.mjs';
import {
  AURORA_PALETTE,
  BULB_LANTERN_COLORS,
  HELIX_LEAVES_GRADIENT,
  HYDRALUX_PETAL_COLORS,
  JELLYSHROOM_CAP_GRADIENT,
  TENANEA_PALETTE,
  buildTextureSetJson,
  decodePng,
  encodePng,
  tintPng,
  validateTextureSet,
} from './png-codec.mjs';
import { compileAllContent } from './content-compiler.mjs';
import { MATERIAL_FAMILIES, REGION_TAG_INDEX } from '../runtime/integration/compatibility-service.js';

const bedrockRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultRepoRoot = path.resolve(bedrockRoot, '..');

// Deterministic ZIP timestamp (matches build-probe.mjs)
const archiveTime = new Date(1980, 0, 1, 0, 0, 0);

export const PACK_PROFILES = Object.freeze({
  'stable-2640': Object.freeze({
    id: 'stable-2640',
    mcaddonFileName: 'BetterEnd-26.40-Stable.mcaddon',
    bpName: 'BetterEnd 26.40 BP (Stable)',
    rpName: 'BetterEnd 26.40 RP (Stable)',
    description: 'BetterEnd for Minecraft Bedrock 26.40 — Stable Production Profile (Classic + Native PBR).',
    version: [1, 0, 0],
    minEngineVersion: [1, 26, 40],
    uuids: Object.freeze({
      behaviorHeader: '7b4e2640-1000-4000-8000-000000000001',
      behaviorDataModule: '7b4e2640-1000-4000-8000-000000000002',
      behaviorScriptModule: '7b4e2640-1000-4000-8000-000000000003',
      resourceHeader: '7b4e2640-1000-4000-8000-000000000004',
      resourceModule: '7b4e2640-1000-4000-8000-000000000005',
    }),
    scriptDependencies: Object.freeze([
      { module_name: '@minecraft/server', version: '2.9.0' },
      { module_name: '@minecraft/server-ui', version: '2.1.0' },
    ]),
    rpCapabilities: Object.freeze(['pbr']),
    entryModule: './bootstrap/main-stable.js',
    includeExperimentalVvEntry: false,
  }),
  'experimental-2640': Object.freeze({
    id: 'experimental-2640',
    mcaddonFileName: 'BetterEnd-26.40-ExperimentalVV.mcaddon',
    bpName: 'BetterEnd 26.40 BP (Experimental Vibrant Visuals)',
    rpName: 'BetterEnd 26.40 RP (Experimental Vibrant Visuals)',
    description: 'BetterEnd for Minecraft Bedrock 26.40 — Experimental Vibrant Visuals & Custom Biomes Profile.',
    version: [1, 0, 0],
    minEngineVersion: [1, 26, 40],
    uuids: Object.freeze({
      behaviorHeader: '7b4e2640-2000-4000-8000-000000000001',
      behaviorDataModule: '7b4e2640-2000-4000-8000-000000000002',
      behaviorScriptModule: '7b4e2640-2000-4000-8000-000000000003',
      resourceHeader: '7b4e2640-2000-4000-8000-000000000004',
      resourceModule: '7b4e2640-2000-4000-8000-000000000005',
    }),
    scriptDependencies: Object.freeze([
      { module_name: '@minecraft/server', version: '2.9.0' },
      { module_name: '@minecraft/server-ui', version: '2.1.0' },
      { module_name: '@minecraft/server-graphics', version: '1.0.0-beta' },
    ]),
    rpCapabilities: Object.freeze(['pbr']),
    entryModule: './bootstrap/main-experimental-vv.js',
    includeExperimentalVvEntry: true,
  }),
});

export const INDUSTRIAL_BP_UUIDS = Object.freeze({
  behaviorHeader: '7b4e2640-3000-4000-8000-000000000001',
  behaviorDataModule: '7b4e2640-3000-4000-8000-000000000002',
});

export const PROVENANCE_CSV_HEADER =
  'source_commit,path,sha256,category,author,license,permitted_distribution,modifications,attribution,replacement_status';

function sanitizeCsvField(value) {
  const str = String(value ?? '').replace(/\r?\n/gu, ' ').replace(/,/gu, ';').trim();
  return str;
}

/**
 * Generates deterministic `asset-provenance.csv` content from `asset-provenance.json`
 * and `music-distribution.json`.
 */
export function buildAssetProvenanceCsv(provenance, musicDistribution = null) {
  const lines = [exportCsvHeader()];
  const commit = provenance.sourceCommit ?? SOURCE_COMMIT;

  const sortedAssets = [...(provenance.assets ?? [])].sort((a, b) =>
    compareText(a.source.path, b.source.path),
  );

  for (const asset of sortedAssets) {
    const sourcePath = asset.source.path;
    const sha256 = asset.source.sha256;
    const category = asset.kind ?? 'other-source-asset';
    const spdx = asset.declaredLicense?.spdx ?? 'MIT';
    const isRestricted = spdx === 'CC-BY-NC-SA-4.0';
    const author = isRestricted ? 'Team BetterX' : 'paulevsGitch';
    const permittedDistribution = isRestricted
      ? 'noncommercial-sharealike-or-isolated'
      : 'permissive-mit';
    const modifications = asset.proposedDestination
      ? `compiled:${asset.proposedDestination}`
      : 'source-metadata';
    const attribution = isRestricted
      ? 'Team BetterX (CC BY-NC-SA 4.0)'
      : 'Copyright (c) 2020 paulevsGitch';

    let replacementStatus = 'retained-mit';
    if (sourcePath.endsWith('/icon_updater.png')) {
      replacementStatus = 'excluded-updater-icon';
    } else if (isRestricted) {
      replacementStatus = 'isolated-or-attributed-cc-by-nc-sa-4.0';
    } else if (category === 'non-content-metadata') {
      replacementStatus = 'excluded-non-content';
    }

    lines.push(
      [
        sanitizeCsvField(commit),
        sanitizeCsvField(sourcePath),
        sanitizeCsvField(sha256),
        sanitizeCsvField(category),
        sanitizeCsvField(author),
        sanitizeCsvField(spdx),
        sanitizeCsvField(permittedDistribution),
        sanitizeCsvField(modifications),
        sanitizeCsvField(attribution),
        sanitizeCsvField(replacementStatus),
      ].join(','),
    );
  }

  if (musicDistribution && Array.isArray(musicDistribution.tracks)) {
    const sortedTracks = [...musicDistribution.tracks].sort((a, b) =>
      compareText(a.member, b.member),
    );
    for (const track of sortedTracks) {
      lines.push(
        [
          sanitizeCsvField(commit),
          sanitizeCsvField(track.member),
          sanitizeCsvField(track.sha256),
          sanitizeCsvField('audio-music-distribution'),
          sanitizeCsvField(track.artistCredit ?? 'noqwww'),
          sanitizeCsvField('MIT'),
          sanitizeCsvField('permissive-mit-distribution-archive'),
          sanitizeCsvField(`sound-stream:${track.id}`),
          sanitizeCsvField(`Music by ${track.artistCredit ?? 'noqwww'}`),
          sanitizeCsvField('recovered-from-modrinth-26.301.2'),
        ].join(','),
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function exportCsvHeader() {
  return 'source_commit,path,sha256,category,author,license,permitted_distribution,modifications,attribution,replacement_status';
}

export async function writeAssetProvenanceCsv(repoRoot = defaultRepoRoot) {
  const provenancePath = path.resolve(repoRoot, 'bedrock/upstream/asset-provenance.json');
  const musicPath = path.resolve(repoRoot, 'bedrock/upstream/music-distribution.json');
  const csvPath = path.resolve(repoRoot, 'bedrock/upstream/asset-provenance.csv');

  const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  const musicDistribution = JSON.parse(await readFile(musicPath, 'utf8'));
  const csvContent = buildAssetProvenanceCsv(provenance, musicDistribution);
  await writeFile(csvPath, csvContent, 'utf8');
  return { csvPath, bytes: Buffer.byteLength(csvContent, 'utf8') };
}

export function packZip(files) {
  assertUniquePortablePaths([...files.keys()]);
  const input = Object.fromEntries(
    [...files]
      .sort(([a], [b]) => compareText(a, b))
      .map(([name, bytes]) => {
        const isPreCompressed = name.endsWith('.ogg') || name.endsWith('.png');
        return [name, [bytes, { mtime: archiveTime, level: isPreCompressed ? 0 : 6 }]];
      }),
  );
  return Buffer.from(zipSync(input, { level: 6 }));
}

function jsonBytes(value) {
  return Buffer.from(stableJson(value), 'utf8');
}

function stripSoundProvenance(soundDefinitionsJson) {
  const cleanDefs = Object.create(null);
  for (const [eventKey, def] of Object.entries(soundDefinitionsJson.sound_definitions ?? {})) {
    cleanDefs[eventKey] = {
      category: def.category,
      sounds: (def.sounds ?? []).map(s => {
        if (typeof s !== 'object' || s === null) return s;
        const { __provenance, ...rest } = s;
        return rest;
      }),
    };
  }
  return {
    format_version: soundDefinitionsJson.format_version,
    sound_definitions: cleanDefs,
  };
}

/**
 * Generates all pre-baked tinted block PNGs and their matching `.texture_set.json` files
 * so every terrain_texture.json entry and `.texture_set.json` is backed by a real PNG.
 */
function generateTintedTextures(repoRoot) {
  const files = new Map();
  const textureSets = new Map();

  const addTinted = (shortName, baseTextureName, hexColor, alphaScale = 1.0) => {
    const tinted = tintPng(baseTextureName, hexColor, { repoRoot });
    let pngBytes = tinted.png;
    if (alphaScale < 0.999) {
      const scaled = Buffer.from(tinted.data);
      for (let i = 3; i < scaled.length; i += 4) {
        scaled[i] = Math.max(0, Math.min(255, Math.round(scaled[i] * alphaScale)));
      }
      pngBytes = encodePng(tinted.width, tinted.height, scaled);
    }
    const relDir = 'textures/blocks/betterend/tinted';
    files.set(`${relDir}/${shortName}.png`, pngBytes);
    textureSets.set(
      `${relDir}/${shortName}.texture_set.json`,
      buildTextureSetJson(shortName, { isItem: false }),
    );
  };

  for (let i = 0; i < AURORA_PALETTE.length; i += 1) {
    addTinted(`aurora_crystal_${i}`, 'aurora_crystal.png', AURORA_PALETTE[i], 0.48);
  }

  for (let i = 0; i < TENANEA_PALETTE.length; i += 1) {
    addTinted(`tenanea_flowers_${i}`, 'tenanea_flowers.png', TENANEA_PALETTE[i]);
  }

  for (let i = 0; i < HELIX_LEAVES_GRADIENT.length; i += 1) {
    addTinted(`helix_tree_leaves_${i}`, 'helix_tree_leaves.png', HELIX_LEAVES_GRADIENT[i]);
    addTinted(`jellyshroom_cap_${i}`, 'jellyshroom_cap_top.png', JELLYSHROOM_CAP_GRADIENT[i], 0.68);
  }

  for (const [colorName, hexColor] of Object.entries(HYDRALUX_PETAL_COLORS)) {
    addTinted(`hydralux_petal_block_${colorName}`, 'hydralux_petal_block.png', hexColor);
  }

  for (const [colorName, hexColor] of Object.entries(BULB_LANTERN_COLORS)) {
    addTinted(
      `bulb_vine_lantern_bulb_${colorName}`,
      'iron_bulb_lantern_color.png',
      hexColor,
    );
  }

  return { files, textureSets };
}

/**
 * Loads all runtime `.js` modules under `bedrock/runtime/`.
 */
async function loadRuntimeModules(repoRoot) {
  const prefix = 'bedrock/runtime/';
  const relPaths = await walkFiles(repoRoot, 'bedrock/runtime');
  const modules = new Map();
  for (const fullRel of relPaths) {
    if (!fullRel.endsWith('.js')) continue;
    const rel = fullRel.slice(prefix.length);
    const content = await readFile(path.resolve(repoRoot, fullRel));
    modules.set(rel, content);
  }
  return modules;
}

async function writeDirectoryTree(rootDir, fileMap) {
  assertUniquePortablePaths([...fileMap.keys()]);
  for (const [relPath, bytes] of fileMap) {
    const dest = path.join(rootDir, relPath);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
  }
}

/**
 * Builds the Behavior Pack and Resource Pack file maps for a single profile
 * (`stable-2640` or `experimental-2640`).
 */
function buildProfilePackMaps({
  profileConfig,
  compiled,
  provenance,
  runtimeModules,
  binaryAssets,
  tintedAssets,
  licenseBytes,
  assetLicenseBytes,
  packIconBytes,
}) {
  const bp = new Map();
  const rp = new Map();

  // 1. Behavior Pack Manifest
  bp.set(
    'manifest.json',
    jsonBytes({
      format_version: 2,
      header: {
        name: profileConfig.bpName,
        description: profileConfig.description,
        uuid: profileConfig.uuids.behaviorHeader,
        version: profileConfig.version,
        min_engine_version: profileConfig.minEngineVersion,
      },
      modules: [
        {
          type: 'data',
          uuid: profileConfig.uuids.behaviorDataModule,
          version: profileConfig.version,
        },
        {
          type: 'script',
          language: 'javascript',
          entry: 'scripts/main.js',
          uuid: profileConfig.uuids.behaviorScriptModule,
          version: profileConfig.version,
        },
      ],
      dependencies: [
        {
          uuid: profileConfig.uuids.resourceHeader,
          version: profileConfig.version,
        },
        ...profileConfig.scriptDependencies,
      ],
    }),
  );

  bp.set('pack_icon.png', packIconBytes);
  bp.set('LICENSE.txt', licenseBytes);
  bp.set('LICENSE.ASSETS.txt', assetLicenseBytes);

  // 2. Blocks, Items, Recipes, Entities, Loot Tables, Features & Feature Rules
  for (const [rel, doc] of compiled.blocks.blockJsonMap) {
    bp.set(rel, jsonBytes(doc));
  }
  for (const [rel, doc] of compiled.items.standaloneItemJsonMap ?? compiled.items.itemJsonMap) {
    bp.set(rel, jsonBytes(doc));
  }
  for (const [rel, doc] of compiled.recipes.nativeRecipeFiles) {
    bp.set(rel, jsonBytes(doc));
  }
  for (const [rel, doc] of compiled.entitiesAndFeatures.serverEntities) {
    bp.set(rel, jsonBytes(doc));
  }
  for (const [rel, doc] of compiled.entitiesAndFeatures.entityLootTables) {
    bp.set(rel, jsonBytes(doc));
  }
  for (const [rel, doc] of compiled.entitiesAndFeatures.biomes ?? []) {
    bp.set(rel, jsonBytes(doc));
  }
  for (const [rel, doc] of compiled.entitiesAndFeatures.features) {
    bp.set(rel, jsonBytes(doc));
  }
  for (const [rel, doc] of compiled.entitiesAndFeatures.featureRules) {
    bp.set(rel, jsonBytes(doc));
  }
  for (const [rel, bytes] of compiled.entitiesAndFeatures.structures ?? []) {
    bp.set(rel, bytes);
  }

  // 3. Runtime ES Modules in `scripts/`
  for (const [rel, bytes] of runtimeModules) {
    if (!profileConfig.includeExperimentalVvEntry && rel === 'bootstrap/main-experimental-vv.js') {
      continue;
    }
    bp.set(`scripts/${rel}`, bytes);
  }
  bp.set(
    'scripts/main.js',
    Buffer.from(
      `import "${profileConfig.entryModule}";\nexport { runtime, default } from "${profileConfig.entryModule}";\n`,
      'utf8',
    ),
  );

  // 4. Resource Pack Manifest
  rp.set(
    'manifest.json',
    jsonBytes({
      format_version: 2,
      header: {
        name: profileConfig.rpName,
        description: profileConfig.description,
        uuid: profileConfig.uuids.resourceHeader,
        version: profileConfig.version,
        min_engine_version: profileConfig.minEngineVersion,
      },
      modules: [
        {
          type: 'resources',
          uuid: profileConfig.uuids.resourceModule,
          version: profileConfig.version,
        },
      ],
      capabilities: [...profileConfig.rpCapabilities],
    }),
  );

  rp.set('pack_icon.png', packIconBytes);
  rp.set('LICENSE.txt', licenseBytes);
  rp.set('LICENSE.ASSETS.txt', assetLicenseBytes);

  // 5. Resource Pack Atlas & Block Sound Mapping
  rp.set('blocks.json', jsonBytes(compiled.modelAssets.blocksJson));
  rp.set('textures/terrain_texture.json', jsonBytes(compiled.modelAssets.terrainTextureJson));
  rp.set('textures/item_texture.json', jsonBytes(compiled.modelAssets.itemTextureJson));

  // 6. Block & Entity Geometries, Client Entities, Render Controllers, Animations
  for (const [geoId, geoDoc] of compiled.modelAssets.geometries) {
    const shortGeo = geoId.replace(/^geometry\.betterend\./u, '');
    rp.set(`models/blocks/${shortGeo}.geo.json`, jsonBytes(geoDoc));
  }
  for (const [rel, doc] of compiled.entitiesAndFeatures.entityGeometries) {
    rp.set(rel, jsonBytes(doc));
  }
  for (const [rel, doc] of compiled.entitiesAndFeatures.clientEntities) {
    rp.set(rel, jsonBytes(doc));
  }
  for (const [rel, doc] of compiled.entitiesAndFeatures.renderControllers) {
    rp.set(rel, jsonBytes(doc));
  }
  for (const [rel, doc] of compiled.entitiesAndFeatures.animations) {
    rp.set(rel, jsonBytes(doc));
  }

  // 7. Fogs, PBR, Local Lighting, and Vibrant Visuals Presets
  rp.set('biomes_client.json', jsonBytes(compiled.modelAssets.visualPresets.biomesClient));
  for (const [rel, doc] of compiled.modelAssets.visualPresets.fogs) {
    rp.set(rel, jsonBytes(doc));
  }
  for (const [rel, doc] of compiled.modelAssets.visualPresets.water) {
    rp.set(rel, jsonBytes(doc));
  }
  for (const [rel, doc] of compiled.modelAssets.visualPresets.lighting) {
    rp.set(rel, jsonBytes(doc));
  }
  rp.set(
    'pbr/global.json',
    jsonBytes({
      format_version: '1.21.40',
      'minecraft:pbr_fallback_settings': {
        blocks: { global_metalness_emissive_roughness: [0, 0, 235] },
        items: { global_metalness_emissive_roughness: [0, 0, 235] },
      },
    }),
  );
  rp.set(
    'point_lights/global.json',
    jsonBytes({
      format_version: '1.21.40',
      'minecraft:point_light_settings': compiled.modelAssets.localLightingJson[
        'minecraft:point_light_settings'
      ] ?? { colors: [] },
    }),
  );

  for (const [rel, doc] of compiled.modelAssets.visualPresets.atmospherics) {
    rp.set(rel, jsonBytes(doc));
  }
  for (const [rel, doc] of compiled.modelAssets.visualPresets.colorGrading) {
    rp.set(rel, jsonBytes(doc));
  }

  // 8. Sound Definitions & Localization
  rp.set(
    'sounds/sound_definitions.json',
    jsonBytes(stripSoundProvenance(compiled.modelAssets.soundDefinitionsJson)),
  );
  rp.set('texts/en_US.lang', Buffer.from(compiled.modelAssets.localization.enUsLang, 'utf8'));
  rp.set('texts/languages.json', jsonBytes(compiled.modelAssets.localization.languagesJson));

  // 9. Binary PNGs and OGG Audio Files
  for (const [destPath, bytes] of binaryAssets) {
    rp.set(destPath, bytes);
  }
  for (const [destPath, bytes] of tintedAssets.files) {
    rp.set(destPath, bytes);
  }

  // 10. Texture Sets (`.texture_set.json`) with §10.1 invariant enforcement
  for (const [tsPath, tsDoc] of compiled.modelAssets.textureSets) {
    const isItem = tsPath.startsWith('textures/items/');
    validateTextureSet(tsDoc, { isItem });
    const dir = path.posix.dirname(tsPath);
    const colorName = tsDoc['minecraft:texture_set'].color;
    const expectedPngPath = `${dir}/${colorName}.png`;
    if (!rp.has(expectedPngPath)) {
      throw new Error(
        `Texture set ${tsPath} references missing color image ${expectedPngPath}`,
      );
    }
    rp.set(tsPath, jsonBytes(tsDoc));
  }
  for (const [tsPath, tsDoc] of tintedAssets.textureSets) {
    validateTextureSet(tsDoc, { isItem: false });
    const dir = path.posix.dirname(tsPath);
    const colorName = tsDoc['minecraft:texture_set'].color;
    const expectedPngPath = `${dir}/${colorName}.png`;
    if (!rp.has(expectedPngPath)) {
      throw new Error(
        `Tinted texture set ${tsPath} references missing color image ${expectedPngPath}`,
      );
    }
    rp.set(tsPath, jsonBytes(tsDoc));
  }

  assertUniquePortablePaths([...bp.keys()]);
  assertUniquePortablePaths([...rp.keys()]);

  return { bp, rp };
}

/**
 * Builds the optional `industrial_bp` compatibility pack (`INT-001`).
 */
function buildIndustrialCompatibilityPack({ licenseBytes, assetLicenseBytes, packIconBytes }) {
  const files = new Map();
  files.set(
    'manifest.json',
    jsonBytes({
      format_version: 2,
      header: {
        name: 'BetterEnd 26.40 Industrial Compatibility BP',
        description:
          'Optional compatibility behavior pack providing cross-add-on ore/metal/wood tags and industrial crusher/alloy recipes.',
        uuid: INDUSTRIAL_BP_UUIDS.behaviorHeader,
        version: [1, 0, 0],
        min_engine_version: [1, 26, 40],
      },
      modules: [
        {
          type: 'data',
          uuid: INDUSTRIAL_BP_UUIDS.behaviorDataModule,
          version: [1, 0, 0],
        },
      ],
      dependencies: [
        {
          uuid: PACK_PROFILES['stable-2640'].uuids.behaviorHeader,
          version: [1, 0, 0],
        },
      ],
    }),
  );

  files.set('pack_icon.png', packIconBytes);
  files.set('LICENSE.txt', licenseBytes);
  files.set('LICENSE.ASSETS.txt', assetLicenseBytes);

  files.set(
    'compatibility/interoperability-tags.json',
    jsonBytes({
      schemaVersion: 1,
      materialFamilies: MATERIAL_FAMILIES,
      regionTags: REGION_TAG_INDEX,
    }),
  );

  // Standard vanilla blast furnace / furnace compatibility recipes for thallasium & ender ore
  files.set(
    'recipes/industrial_thallasium_ingot_from_raw.json',
    jsonBytes({
      format_version: '1.20.10',
      'minecraft:recipe_furnace': {
        description: { identifier: 'betterend_industrial:thallasium_ingot_from_raw' },
        tags: ['furnace', 'blast_furnace'],
        input: 'betterend:thallasium_raw',
        output: 'betterend:thallasium_ingot',
      },
    }),
  );

  assertUniquePortablePaths([...files.keys()]);
  return files;
}

/**
 * Builds all BetterEnd 26.40 packs and writes them to `bedrock/dist/packs/`.
 */
export async function buildPacks({
  repoRoot = defaultRepoRoot,
  outputRoot = path.resolve(repoRoot, 'bedrock/dist/packs'),
  writeToDisk = true,
  writeCsv = true,
} = {}) {
  if (writeCsv) {
    await writeAssetProvenanceCsv(repoRoot);
  }

  const provenance = JSON.parse(
    await readFile(path.resolve(repoRoot, 'bedrock/upstream/asset-provenance.json'), 'utf8'),
  );
  const licenseBytes = await readFile(path.resolve(repoRoot, 'LICENSE'));
  const assetLicenseBytes = await readFile(path.resolve(repoRoot, 'LICENSE.ASSETS'));
  const packIconBytes = await readFile(
    path.resolve(repoRoot, 'src/main/resources/assets/betterend/icon.png'),
  );

  const compiled = await compileAllContent({ repoRoot });
  const runtimeModules = await loadRuntimeModules(repoRoot);
  const tintedAssets = generateTintedTextures(repoRoot);

  // Load binary PNGs and OGG audio files referenced by provenance
  const binaryAssets = new Map();
  for (const asset of provenance.assets) {
    if (!asset.proposedDestination) continue;
    // Exclude non-content metadata and updater icon
    if (asset.kind === 'non-content-metadata') continue;
    if (asset.source.path.endsWith('/icon_updater.png')) continue;
    // Skip raw _e / _s / _n auxiliary masks that are compiled into MER maps / texture_set.json
    if (
      asset.kind === 'texture' &&
      (asset.resourcePath.endsWith('_e.png') ||
        asset.resourcePath.endsWith('_s.png') ||
        asset.resourcePath.endsWith('_n.png'))
    ) {
      continue;
    }
    const bytes = await readFile(path.resolve(repoRoot, asset.source.path));
    binaryAssets.set(asset.proposedDestination, bytes);
  }

  // Extract recovered music tracks (ender_hollow.ogg & moonlit_undercurrents.ogg) from Modrinth archive
  const musicDistPath = path.resolve(repoRoot, 'bedrock/upstream/music-distribution.json');
  if (existsSync(musicDistPath)) {
    const musicDist = JSON.parse(await readFile(musicDistPath, 'utf8'));
    const jarPath = path.resolve(
      repoRoot,
      musicDist.sourceArchive?.localPath ?? 'bedrock/.work/downloads/better-end-26.301.2.jar',
    );
    if (existsSync(jarPath)) {
      const jarBytes = await readFile(jarPath);
      const wantedMembers = new Set((musicDist.tracks ?? []).map(t => t.member));
      const unzipped = unzipSync(new Uint8Array(jarBytes), {
        filter: file => wantedMembers.has(file.name),
      });
      for (const track of musicDist.tracks ?? []) {
        const entryBytes = unzipped[track.member];
        if (entryBytes) {
          const destRel = track.member.replace(/^assets\/betterend\//u, '');
          binaryAssets.set(destRel, Buffer.from(entryBytes));
        }
      }
    }
  }

  const profilesResult = Object.create(null);

  for (const [profileId, profileConfig] of Object.entries(PACK_PROFILES)) {
    const { bp, rp } = buildProfilePackMaps({
      profileConfig,
      compiled,
      provenance,
      runtimeModules,
      binaryAssets,
      tintedAssets,
      licenseBytes,
      assetLicenseBytes,
      packIconBytes,
    });

    // Combine BP + RP into deterministic .mcaddon archive
    const mcaddonEntries = new Map();
    for (const [rel, bytes] of bp) {
      mcaddonEntries.set(`behavior_pack/${rel}`, bytes);
    }
    for (const [rel, bytes] of rp) {
      mcaddonEntries.set(`resource_pack/${rel}`, bytes);
    }
    const mcaddonBytes = packZip(mcaddonEntries);
    const mcaddonSha256 = hashBytes(mcaddonBytes);

    const buildManifest = {
      schemaVersion: 1,
      sourceCommit: SOURCE_COMMIT,
      profile: profileId,
      minEngineVersion: profileConfig.minEngineVersion,
      uuids: profileConfig.uuids,
      mcaddonFileName: profileConfig.mcaddonFileName,
      mcaddonSha256,
      mcaddonBytes: mcaddonBytes.length,
      counts: {
        behaviorPackFiles: bp.size,
        resourcePackFiles: rp.size,
        ...compiled.counts,
        geometries: compiled.modelAssets.counts.geometries,
        textureSets: compiled.modelAssets.counts.textureSets + tintedAssets.textureSets.size,
        fogs: compiled.modelAssets.counts.regions,
      },
    };

    profilesResult[profileId] = {
      profileConfig,
      behaviorPack: bp,
      resourcePack: rp,
      mcaddonBytes,
      mcaddonSha256,
      buildManifest,
    };

    if (writeToDisk) {
      const profileDir = path.join(outputRoot, profileId);
      await rm(profileDir, { recursive: true, force: true });
      await writeDirectoryTree(path.join(profileDir, 'behavior_pack'), bp);
      await writeDirectoryTree(path.join(profileDir, 'resource_pack'), rp);
      await writeFile(path.join(profileDir, profileConfig.mcaddonFileName), mcaddonBytes);
      await writeFile(
        path.join(profileDir, 'build-manifest.json'),
        stableJson(buildManifest),
        'utf8',
      );
    }
  }

  const industrialBp = buildIndustrialCompatibilityPack({
    licenseBytes,
    assetLicenseBytes,
    packIconBytes,
  });

  if (writeToDisk) {
    const industrialDir = path.join(outputRoot, 'industrial_bp');
    await rm(industrialDir, { recursive: true, force: true });
    await writeDirectoryTree(industrialDir, industrialBp);
  }

  return {
    sourceCommit: SOURCE_COMMIT,
    outputRoot,
    compiled,
    profiles: profilesResult,
    industrialBp,
  };
}

async function main() {
  const result = await buildPacks();
  const summary = {
    sourceCommit: result.sourceCommit,
    profiles: Object.fromEntries(
      Object.entries(result.profiles).map(([id, p]) => [
        id,
        {
          mcaddonFileName: p.buildManifest.mcaddonFileName,
          mcaddonSha256: p.buildManifest.mcaddonSha256,
          mcaddonBytes: p.buildManifest.mcaddonBytes,
          counts: p.buildManifest.counts,
        },
      ]),
    ),
    industrialBpFiles: result.industrialBp.size,
  };
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.stack ?? String(error));
    process.exitCode = 1;
  });
}
