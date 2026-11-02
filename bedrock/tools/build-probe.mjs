import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { SOURCE_COMMIT, assertUniquePortablePaths, compareText, hashBytes, stableJson } from './source-files.mjs';
import { inventoryProbeDefinitions } from '../probes/inventory/definitions.mjs';

const bedrockRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = path.resolve(bedrockRoot, '..');
// ZIP stores local calendar fields; a UTC instant can become 1979 west of UTC.
const archiveTime = new Date(1980, 0, 1, 0, 0, 0);

function jsonFile(files, fileName, value) {
  files.set(fileName, Buffer.from(stableJson(value)));
}

export function packZip(files) {
  assertUniquePortablePaths([...files.keys()]);
  const input = Object.fromEntries([...files].sort(([a], [b]) => compareText(a, b)).map(([name, bytes]) => [name, [bytes, { mtime: archiveTime }]]));
  return Buffer.from(zipSync(input, { level: 6 }));
}

async function writePack(root, files) {
  for (const [relative, bytes] of files) {
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
}

export async function buildProbe() {
  const identity = JSON.parse(await readFile(path.join(bedrockRoot, 'probes/engine/identity.json'), 'utf8'));
  const bp = new Map();
  const rp = new Map();
  const { version } = identity;
  jsonFile(bp, 'manifest.json', {
    format_version: 2,
    header: { name: 'BetterEnd engine capability probes', description: 'Diagnostic native blocks, End features and inventory custody. Not the complete BetterEnd port.', uuid: identity.behaviorHeader, version, min_engine_version: [1, 26, 40] },
    modules: [
      { type: 'data', uuid: identity.behaviorDataModule, version },
      { type: 'script', language: 'javascript', entry: 'scripts/main.js', uuid: identity.behaviorScriptModule, version },
    ],
    dependencies: [{ uuid: identity.resourceHeader, version }, { module_name: '@minecraft/server', version: '2.9.0' }],
  });
  jsonFile(rp, 'manifest.json', {
    format_version: 2,
    header: { name: 'BetterEnd capability material board', description: 'Classic-complete diagnostic albedo and native VV PBR controls; no shader injection.', uuid: identity.resourceHeader, version, min_engine_version: [1, 26, 40] },
    modules: [{ type: 'resources', uuid: identity.resourceModule, version }], capabilities: ['pbr'],
  });
  const material = finish => ({ '*': { texture: `betterend_probe_flavolite_${finish}`, render_method: 'opaque' } });
  jsonFile(bp, 'blocks/flavolite.json', {
    format_version: '1.26.20',
    'minecraft:block': {
      description: { identifier: 'betterend_probe:flavolite', menu_category: { category: 'construction' }, states: { 'betterend_probe:finish': ['rough', 'metal', 'emissive'] } },
      components: { 'minecraft:display_name': 'Flavolite - engine probe', 'minecraft:geometry': 'minecraft:geometry.full_block', 'minecraft:material_instances': material('rough'), 'minecraft:light_emission': 0 },
      permutations: ['metal', 'emissive'].map(finish => ({ condition: `query.block_state('betterend_probe:finish') == '${finish}'`, components: { 'minecraft:material_instances': material(finish) } })),
    },
  });
  jsonFile(bp, 'items/thallasium_ingot.json', {
    format_version: '1.26.30',
    'minecraft:item': {
      description: { identifier: 'betterend_probe:thallasium_ingot', menu_category: { category: 'items' } },
      components: { 'minecraft:display_name': { value: 'Thallasium ingot - engine probe' }, 'minecraft:icon': { textures: { default: 'betterend_probe_thallasium_ingot' } }, 'minecraft:max_stack_size': 64 },
    },
  });
  jsonFile(bp, 'features/flavolite_feature.json', {
    format_version: '1.13.0',
    'minecraft:single_block_feature': {
      description: { identifier: 'betterend_probe:flavolite_feature' },
      places_block: { name: 'betterend_probe:flavolite', states: { 'betterend_probe:finish': 'rough' } },
      enforce_placement_rules: false, enforce_survivability_rules: false, may_replace: [{ name: 'minecraft:end_stone' }],
    },
  });
  jsonFile(bp, 'feature_rules/outer_end_rule.json', {
    format_version: '1.13.0',
    'minecraft:feature_rules': {
      description: { identifier: 'betterend_probe:outer_end_rule', places_feature: 'betterend_probe:flavolite_feature' },
      conditions: { placement_pass: 'surface_pass', 'minecraft:biome_filter': [{ test: 'has_biome_tag', operator: '==', value: 'the_end' }] },
      distribution: { iterations: '(math.abs(variable.originx + 8) > 1024 || math.abs(variable.originz + 8) > 1024) ? 1 : 0', coordinate_eval_order: 'xzy', x: 8, y: 'query.heightmap(variable.worldx, variable.worldz) - 1', z: 8 },
    },
  });
  bp.set('scripts/main.js', await readFile(path.join(bedrockRoot, 'probes/engine/scripts/main.js')));
  const inventory = inventoryProbeDefinitions();
  for (const [name, value] of inventory.behavior) jsonFile(bp, name, value);
  for (const [name, value] of inventory.resources) jsonFile(rp, name, value);
  for (const name of ['inventory.js', 'inventory-constants.js']) bp.set(`scripts/${name}`, await readFile(path.join(bedrockRoot, 'probes/inventory/scripts', name)));
  jsonFile(rp, 'textures/terrain_texture.json', {
    resource_pack_name: 'betterend_probe', texture_name: 'atlas.terrain', padding: 8, num_mip_levels: 4,
    texture_data: Object.fromEntries(['rough', 'metal', 'emissive'].map(finish => [`betterend_probe_flavolite_${finish}`, { textures: `textures/blocks/flavolite_${finish}` }])),
  });
  jsonFile(rp, 'textures/item_texture.json', { resource_pack_name: 'betterend_probe', texture_name: 'atlas.items', texture_data: { betterend_probe_thallasium_ingot: { textures: 'textures/items/thallasium_ingot' } } });
  const flavolitePath = 'src/main/resources/assets/betterend/textures/block/flavolite.png';
  const ingotPath = 'src/main/resources/assets/betterend/textures/item/thallasium_ingot.png';
  const flavolite = await readFile(path.join(repoRoot, flavolitePath));
  const ingot = await readFile(path.join(repoRoot, ingotPath));
  for (const texture of inventory.textures) rp.set(texture.destination, await readFile(path.join(repoRoot, texture.source)));
  const finishes = { rough: [0, 0, 255], metal: [255, 0, 32], emissive: [0, 255, 255] };
  for (const [finish, mer] of Object.entries(finishes)) {
    rp.set(`textures/blocks/flavolite_${finish}.png`, flavolite);
    jsonFile(rp, `textures/blocks/flavolite_${finish}.texture_set.json`, { format_version: '1.16.100', 'minecraft:texture_set': { color: `flavolite_${finish}`, metalness_emissive_roughness: mer } });
  }
  rp.set('textures/items/thallasium_ingot.png', ingot);
  jsonFile(rp, 'textures/items/thallasium_ingot.texture_set.json', { format_version: '1.16.100', 'minecraft:texture_set': { color: 'thallasium_ingot', metalness_emissive_roughness: [255, 0, 96] } });
  const notice = await readFile(path.join(repoRoot, 'LICENSE'));
  const assetsNotice = await readFile(path.join(repoRoot, 'LICENSE.ASSETS'));
  bp.set('LICENSE.txt', notice);
  rp.set('LICENSE.txt', notice);
  rp.set('LICENSE.ASSETS.txt', assetsNotice);
  const sourceAssets = [
    { source: flavolitePath, sha256: hashBytes(flavolite), license: 'MIT', basis: 'repository-license-inheritance; not among explicit LICENSE.ASSETS exceptions', destinations: [...['rough', 'metal', 'emissive'].map(finish => `textures/blocks/flavolite_${finish}.png`), ...inventory.textures.filter(texture => texture.source === flavolitePath).map(texture => texture.destination)] },
    { source: ingotPath, sha256: hashBytes(ingot), license: 'MIT', basis: 'repository-license-inheritance; not among explicit LICENSE.ASSETS exceptions', destinations: ['textures/items/thallasium_ingot.png'] },
  ];
  const outputRoot = path.join(bedrockRoot, 'dist/probes/stable');
  await writePack(path.join(outputRoot, 'behavior_pack'), bp);
  await writePack(path.join(outputRoot, 'resource_pack'), rp);
  const bpArchive = packZip(bp);
  const rpArchive = packZip(rp);
  const addon = packZip(new Map([['BetterEnd-Probe-BP.mcpack', bpArchive], ['BetterEnd-Probe-RP.mcpack', rpArchive]]));
  await writeFile(path.join(outputRoot, 'BetterEnd-Probes.mcaddon'), addon);
  const manifest = {
    schemaVersion: 1, purpose: 'capability-diagnostics-not-production-port', target: '26.40', sourceCommit: SOURCE_COMMIT,
    identity, sourceAssets, calibrationNote: 'MER extremes are diagnostic controls, not claimed upstream material properties. All block states retain gameplay light level zero.',
    files: [...bp].map(([name, bytes]) => ({ pack: 'behavior', path: name, sha256: hashBytes(bytes) })).concat([...rp].map(([name, bytes]) => ({ pack: 'resource', path: name, sha256: hashBytes(bytes) }))),
    archive: { path: 'BetterEnd-Probes.mcaddon', bytes: addon.length, sha256: hashBytes(addon) },
  };
  await writeFile(path.join(outputRoot, 'build-manifest.json'), stableJson(manifest));
  console.log(JSON.stringify({ output: 'bedrock/dist/probes/stable', files: manifest.files.length, archive: manifest.archive, productionPort: false }, null, 2));
  return { outputRoot, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildProbe().catch(error => { console.error(error.stack ?? String(error)); process.exitCode = 1; });
}
