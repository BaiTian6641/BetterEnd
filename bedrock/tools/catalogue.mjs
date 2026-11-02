import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  SOURCE_COMMIT, compareText, inside, readJsonSource, sourceFingerprint,
  sourceRecord, walkFiles,
} from './source-files.mjs';

const resourceRoots = ['src/main/resources', 'src/main/generated'];
const identifierPattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/u;
const dataCategories = [
  'wover/worldgen/biome_modifications', 'wover/worldgen/surface_rules', 'wover/worldgen/biome_data',
  'worldgen/template_pool', 'worldgen/placed_feature', 'worldgen/processor_list', 'worldgen/structure_set',
  'worldgen/structure', 'worldgen/feature', 'worldgen/carver', 'worldgen/biome',
  'wover/pottable_plant', 'wover/pottable_soil', 'wover/loot_addition',
  'tags/worldgen/biome', 'tags/item', 'tags/block', 'tags/entity_type', 'tags/damage_type', 'tags/enchantment',
  'recipe', 'loot_table', 'advancement', 'jukebox_song', 'enchantment', 'structure', 'patchouli_books', 'entities',
];

export function registrationIndex(rows, sourceName) {
  if (!Array.isArray(rows)) throw new Error(`${sourceName} must contain a registration array`);
  const result = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !identifierPattern.test(row.id ?? '')) {
      throw new Error(`Invalid registration identifier in ${sourceName}`);
    }
    if (result.has(row.id)) throw new Error(`Duplicate registration ${row.id} in ${sourceName}`);
    if (Object.values(row).some(value => typeof value !== 'string')) {
      throw new Error(`Unexpected registration cell type for ${row.id} in ${sourceName}`);
    }
    result.set(row.id, row);
  }
  return result;
}

export function resourceIdentity(resourcePath, scope = 'main') {
  const pieces = resourcePath.split('/');
  if (pieces[0] !== 'data' || pieces.length < 4) throw new Error(`Invalid data resource: ${resourcePath}`);
  const namespace = pieces[1];
  const rest = pieces.slice(2).join('/');
  const category = dataCategories.find(candidate => rest.startsWith(`${candidate}/`));
  if (!category) {
    return { scope, namespace, category: pieces[2], id: `${namespace}:${pieces.slice(3).join('/').replace(/\.[^.]+$/u, '')}`, resourcePath, recognizedCategory: false };
  }
  const idPath = rest.slice(category.length + 1).replace(/\.[^.]+$/u, '');
  const id = `${namespace}:${idPath}`;
  if (!identifierPattern.test(id)) throw new Error(`Invalid resource identifier ${id}`);
  return { scope, namespace, category, id, resourcePath, recognizedCategory: true };
}

export function resolveResourceLayers(layers) {
  const effective = new Map();
  const collisions = [];
  for (const layer of layers) {
    for (const record of layer) {
      const key = `${record.scope}\0${record.resourcePath}`;
      if (effective.has(key)) {
        const winner = effective.get(key);
        winner.shadowed.push(record.source);
        collisions.push({ scope: record.scope, resourcePath: record.resourcePath, winner: winner.source, shadowed: record.source });
      } else {
        effective.set(key, { ...record, shadowed: [] });
      }
    }
  }
  return {
    resources: [...effective.values()].sort((a, b) => compareText(`${a.scope}/${a.resourcePath}`, `${b.scope}/${b.resourcePath}`)),
    collisions,
  };
}

export function parseShapeSnapshot(text, registeredIds) {
  const blocks = new Map();
  const stateKeys = new Set();
  let totalStates = 0;
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    const match = /^([a-z0-9_.-]+:[a-z0-9_./-]+)(?:\[([^\]]*)\])?\s+shape=(.*?) collision=(.+)$/u.exec(line);
    if (!match) throw new Error(`Unrecognized block shape snapshot at line ${index + 1}`);
    const [, id, rawStates, selection, collision] = match;
    if (!registeredIds.has(id)) throw new Error(`Shape snapshot references unregistered block ${id}`);
    const states = Object.create(null);
    for (const assignment of rawStates?.split(',') ?? []) {
      const equals = assignment.indexOf('=');
      if (equals <= 0 || equals === assignment.length - 1) throw new Error(`Invalid state assignment at line ${index + 1}`);
      const key = assignment.slice(0, equals);
      if (Object.hasOwn(states, key)) throw new Error(`Duplicate state property at line ${index + 1}`);
      states[key] = assignment.slice(equals + 1);
    }
    const stateKey = `${id}[${Object.keys(states).sort(compareText).map(key => `${key}=${states[key]}`).join(',')}]`;
    if (stateKeys.has(stateKey)) throw new Error(`Duplicate block-state snapshot ${stateKey}`);
    stateKeys.add(stateKey);
    const snapshot = blocks.get(id) ?? { observedCount: 0, properties: Object.create(null), records: [], defaultState: null, runtimeVerified: false };
    for (const [key, value] of Object.entries(states)) {
      const values = snapshot.properties[key] ?? [];
      if (!values.includes(value)) values.push(value);
      snapshot.properties[key] = values;
    }
    snapshot.records.push({ states, selection, collision, sourceLine: index + 1 });
    snapshot.observedCount += 1;
    blocks.set(id, snapshot);
    totalStates += 1;
  }
  for (const value of blocks.values()) {
    for (const values of Object.values(value.properties)) values.sort(compareText);
  }
  return { blocks, totalStates };
}

export function parseBiomeDeclarations(text) {
  const pattern = /public\s+static\s+final\s+EndBiomeKey<([^;]+?)>\s+(\w+)\s*=\s*EndBiomeBuilder\.createKey\("([a-z0-9_]+)"(?:,\s*(\w+))?\);/gu;
  const declarations = [...text.matchAll(pattern)].map(match => ({
    id: `betterend:${match[3]}`, javaType: match[1].trim(), symbol: match[2], parentSymbol: match[4] ?? null,
    sourceLine: text.slice(0, match.index).split('\n').length,
  }));
  const declaredFields = [...text.matchAll(/public\s+static\s+final\s+EndBiomeKey</gu)].length;
  if (!declarations.length || declarations.length !== declaredFields) throw new Error('Biome declarations include an unsupported registration form');
  const symbols = new Map(declarations.map(entry => [entry.symbol, entry.id]));
  if (new Set(declarations.map(entry => entry.id)).size !== declarations.length) throw new Error('Duplicate biome declaration');
  return declarations.map(entry => {
    if (entry.parentSymbol && !symbols.has(entry.parentSymbol)) throw new Error(`Unknown biome parent ${entry.parentSymbol}`);
    return { ...entry, parent: entry.parentSymbol ? symbols.get(entry.parentSymbol) : null };
  }).sort((a, b) => compareText(a.id, b.id));
}

export function parseMobDeclarations(text) {
  const pattern = /public\s+static\s+final\s+BCLEntityWrapper<(\w+)>\s+(\w+)\s*=\s*register\(\s*"([a-z0-9_]+)"/gu;
  const declarations = [...text.matchAll(pattern)].map(match => ({
    id: `betterend:${match[3]}`, javaType: match[1], symbol: match[2],
    sourceLine: text.slice(0, match.index).split('\n').length,
  }));
  const declaredFields = [...text.matchAll(/public\s+static\s+final\s+BCLEntityWrapper</gu)].length;
  if (!declarations.length || declarations.length !== declaredFields) throw new Error('Entity declarations include an unsupported registration form');
  if (new Set(declarations.map(entry => entry.id)).size !== declarations.length) throw new Error('Duplicate explicit mob declaration');
  return declarations.sort((a, b) => compareText(a.id, b.id));
}

async function resourceLayer(repoRoot, root, scope) {
  const files = await walkFiles(repoRoot, `${root}/data`);
  const layer = [];
  for (const sourcePath of files) {
    const resourcePath = sourcePath.slice(root.length + 1);
    if (sourcePath.endsWith('.json')) {
      const { value, source } = await readJsonSource(repoRoot, sourcePath);
      layer.push({ ...resourceIdentity(resourcePath, scope), format: 'json', value, source });
    } else {
      layer.push({ ...resourceIdentity(resourcePath, scope), format: path.extname(sourcePath).slice(1), source: await sourceRecord(repoRoot, sourcePath) });
    }
  }
  return layer;
}

async function visualBlockstates(repoRoot) {
  const records = new Map();
  for (const root of resourceRoots) {
    for (const sourcePath of await walkFiles(repoRoot, `${root}/assets/betterend/blockstates`)) {
      if (!sourcePath.endsWith('.json')) throw new Error(`Unexpected blockstate resource ${sourcePath}`);
      const id = `betterend:${sourcePath.slice(`${root}/assets/betterend/blockstates/`.length, -5)}`;
      if (records.has(id)) throw new Error(`Duplicate visual blockstate resource ${id}`);
      records.set(id, await readJsonSource(repoRoot, sourcePath));
    }
  }
  return records;
}

function matchingResources(resources, category, id) {
  return resources.filter(record => record.scope === 'main' && record.category === category && record.id === id);
}

function portEntry(kind, id, sources) {
  return { key: `${kind}/${id}`, kind, upstreamId: id, targetId: id.startsWith('betterend:') ? `betterend_bedrock:${id.slice('betterend:'.length)}` : null, status: 'Unproven', evidence: [], sources };
}

export async function buildCatalogue(repoRoot) {
  const blockSource = await readJsonSource(repoRoot, 'src/main/generated/block_registrations.json');
  const itemSource = await readJsonSource(repoRoot, 'src/main/generated/item_registrations.json');
  const propertySource = await readJsonSource(repoRoot, 'src/main/generated/block_properties.json');
  const blockIndex = registrationIndex(blockSource.value, blockSource.source.path);
  const itemIndex = registrationIndex(itemSource.value, itemSource.source.path);
  const propertyIndex = registrationIndex(propertySource.value, propertySource.source.path);
  if (blockIndex.size !== propertyIndex.size || [...blockIndex.keys()].some(id => !propertyIndex.has(id))) {
    throw new Error('Block registration and property snapshots disagree on identifiers');
  }

  const shapeSource = await sourceRecord(repoRoot, 'src/main/generated/block_shapes.txt');
  const shapes = parseShapeSnapshot(await readFile(inside(repoRoot, shapeSource.path), 'utf8'), new Set(blockIndex.keys()));
  const visuals = await visualBlockstates(repoRoot);
  const layers = [];
  for (const root of resourceRoots) layers.push(await resourceLayer(repoRoot, root, 'main'));
  const optionalRoot = 'src/main/generated/resourcepacks';
  for (const pack of (await readdir(inside(repoRoot, optionalRoot), { withFileTypes: true })).sort((a, b) => compareText(a.name, b.name))) {
    if (pack.isDirectory()) layers.push(await resourceLayer(repoRoot, `${optionalRoot}/${pack.name}`, `optional/${pack.name}`));
  }
  const resolved = resolveResourceLayers(layers);
  const resources = resolved.resources;
  const biomeSource = await sourceRecord(repoRoot, 'src/main/java/org/betterx/betterend/registry/EndBiomes.java');
  const mobSource = await sourceRecord(repoRoot, 'src/main/java/org/betterx/betterend/registry/EndEntities.java');
  const declaredBiomes = parseBiomeDeclarations(await readFile(inside(repoRoot, biomeSource.path), 'utf8'));
  const explicitMobs = parseMobDeclarations(await readFile(inside(repoRoot, mobSource.path), 'utf8'));
  const unresolved = [
    { code: 'runtime-registry-not-exported', severity: 'release-blocker', detail: 'Checked-in registration/property/shape audits do not prove live default states, intrinsic item components, conditional registrations, or dependency-created entity types.' },
    { code: 'dependency-assets-not-resolved', severity: 'release-blocker', detail: 'BCLib, WorldWeaver, WunderLib, vanilla reference assets and any external WunderVault inputs require pinned provenance and runtime reconciliation.' },
    { code: 'snapshot-flammability-disagreement', severity: 'release-blocker', detail: 'EndWoodenComplexMaterial requests non-log flammability 5/20 while the checked-in dragon_tree_planks audit reports 5/5; resolve with the pinned Java runtime.', sources: ['src/main/java/org/betterx/betterend/complexmaterials/EndWoodenComplexMaterial.java', blockSource.source.path] },
  ];
  for (const collision of resolved.collisions) unresolved.push({ code: 'duplicate-resource', severity: 'source-error', ...collision });
  for (const record of resources) {
    if (!record.recognizedCategory) unresolved.push({ code: 'unclassified-resource-category', severity: 'review', scope: record.scope, resourcePath: record.resourcePath });
  }
  const blocks = [...blockIndex].sort(([a], [b]) => compareText(a, b)).map(([id, registration]) => {
    const visual = visuals.get(id);
    const stateSnapshot = shapes.blocks.get(id);
    if (!stateSnapshot) throw new Error(`Missing shape/state snapshot for ${id}`);
    if (!visual) unresolved.push({ code: 'missing-blockstate-resource', severity: 'review', id });
    return {
      id, registration, properties: propertyIndex.get(id), stateSnapshot,
      visual: visual ? { value: visual.value, source: visual.source } : null,
      itemAssociation: { sameIdentifierPresent: itemIndex.has(id), runtimeVerified: false },
      sources: [blockSource.source, propertySource.source, shapeSource],
    };
  });
  const items = [...itemIndex].sort(([a], [b]) => compareText(a, b)).map(([id, registration]) => ({ id, registration, sources: [itemSource.source], runtimeComponents: null }));
  const nonRegistryVisuals = [...visuals].filter(([id]) => !blockIndex.has(id)).map(([id, record]) => ({ id, value: record.value, source: record.source }));
  for (const entry of nonRegistryVisuals) unresolved.push({ code: 'nonregistry-blockstate-resource', severity: 'review', id: entry.id, source: entry.source.path });
  const biomes = declaredBiomes.map(entry => {
    const attached = ['worldgen/biome', 'wover/worldgen/biome_data', 'wover/worldgen/surface_rules'].map(category => {
      const matches = matchingResources(resources, category, entry.id);
      if (matches.length !== 1) throw new Error(`Biome ${entry.id} requires one ${category} resource, found ${matches.length}`);
      return matches[0];
    });
    return { ...entry, source: biomeSource, resources: attached.map(record => ({ category: record.category, source: record.source, value: record.value })) };
  });
  const actualBiomeIds = resources.filter(record => record.scope === 'main' && record.category === 'worldgen/biome' && record.namespace === 'betterend').map(record => record.id).sort(compareText);
  if (JSON.stringify(actualBiomeIds) !== JSON.stringify(biomes.map(entry => entry.id))) throw new Error('Biome declaration and resource identity sets disagree');

  const select = category => resources.filter(record => record.category === category);
  const recipes = select('recipe');
  const recipeTypes = Object.create(null);
  for (const recipe of recipes) {
    if (typeof recipe.value.type !== 'string') throw new Error(`Recipe has no serializer: ${recipe.source.path}`);
    recipeTypes[recipe.value.type] = (recipeTypes[recipe.value.type] ?? 0) + 1;
  }
  const parity = [
    ...blocks.map(entry => portEntry('block', entry.id, entry.sources.map(source => source.path))),
    ...items.map(entry => portEntry('item', entry.id, entry.sources.map(source => source.path))),
    ...explicitMobs.map(entry => portEntry('mob', entry.id, [mobSource.path])),
    ...biomes.map(entry => portEntry('biome', entry.id, [biomeSource.path, ...entry.resources.map(record => record.source.path)])),
    ...resources.map(entry => portEntry(`${entry.scope}/${entry.category}`, entry.id, [entry.source.path])),
  ].sort((a, b) => compareText(a.key, b.key));
  const sourceRecords = new Map();
  for (const source of [blockSource.source, itemSource.source, propertySource.source, shapeSource, biomeSource, mobSource, ...resources.map(entry => entry.source), ...[...visuals.values()].map(entry => entry.source)]) {
    sourceRecords.set(source.path, source);
  }
  const inputs = [...sourceRecords.values()].sort((a, b) => compareText(a.path, b.path));
  return {
    schemaVersion: 1, sourceCommit: SOURCE_COMMIT, sourceRepository: 'https://github.com/quiqueck/BetterEnd',
    evidenceScope: 'checked-in-source-and-audit-snapshots-not-live-runtime',
    resourcePrecedence: { roots: resourceRoots, duplicateBuildPolicy: 'error', packagingSafetyNet: 'first-resource-wins', evidence: 'build.gradle:259-302' },
    sourceFingerprint: sourceFingerprint(inputs), sources: inputs,
    counts: { blocks: blocks.length, items: items.length, explicitMobs: explicitMobs.length, biomes: biomes.length, blockStateSnapshotRows: shapes.totalStates, resources: resources.length, recipes: recipes.length, mainRecipes: recipes.filter(entry => entry.scope === 'main').length, optionalRecipes: recipes.filter(entry => entry.scope !== 'main').length, parityEntries: parity.length, unresolved: unresolved.length },
    recipeTypes, blocks, items, entities: explicitMobs.map(entry => ({ ...entry, source: mobSource })), biomes,
    recipes, lootTables: select('loot_table'), tags: resources.filter(entry => entry.category.startsWith('tags/')),
    structures: select('structure'), advancements: select('advancement'), jukeboxSongs: select('jukebox_song'), enchantments: select('enchantment'),
    resources, nonRegistryVisuals, parity, unresolved,
  };
}
