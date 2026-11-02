import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { assertRuntimeSource } from './reference-inputs.mjs';
import { SOURCE_COMMIT, compareText, hashBytes, inside } from './source-files.mjs';

function index(rows, subject) {
  const result = new Map();
  for (const row of rows) {
    if (typeof row.id !== 'string' || result.has(row.id)) throw new Error(`Invalid or duplicate ${subject} identity`);
    result.set(row.id, row);
  }
  return result;
}

function sameIds(actual, expected, subject) {
  if (actual.size !== expected.size || [...actual.keys()].some(id => !expected.has(id))) throw new Error(`${subject} identities differ between the pinned audit and live profile; explicit source reconciliation is required`);
}

export function stateKey(values) {
  return Object.keys(values).sort(compareText).map(key => `${key}=${String(values[key])}`).join(',');
}

export function stateCoverage(snapshot, live) {
  const names = Object.keys(live.propertyDomains).sort(compareText);
  const domains = new Map(names.map(name => [name, new Set(live.propertyDomains[name].values.map(value => JSON.stringify(value)))]));
  let combinations = 1;
  for (const values of domains.values()) {
    if (values.size === 0) throw new Error(`Empty state domain for ${live.id}`);
    combinations *= values.size;
  }
  if (JSON.stringify(Object.keys(live.defaultState).sort(compareText)) !== JSON.stringify(names)
      || names.some(name => !domains.get(name).has(JSON.stringify(live.defaultState[name])))) throw new Error(`Default outside its typed domain for ${live.id}`);
  const states = new Set();
  for (const state of live.states) {
    if (JSON.stringify(Object.keys(state.values).sort(compareText)) !== JSON.stringify(names)) throw new Error(`Incomplete property assignment for ${live.id}`);
    for (const name of names) if (!domains.get(name).has(JSON.stringify(state.values[name]))) throw new Error(`State outside its domain for ${live.id}/${name}`);
    const key = stateKey(state.values);
    if (states.has(key)) throw new Error(`Duplicate live state for ${live.id}`);
    states.add(key);
  }
  if (states.size !== combinations || !states.has(stateKey(live.defaultState))) throw new Error(`Incomplete state domain or absent default for ${live.id}`);
  const audit = new Set(snapshot.records.map(record => stateKey(record.states)));
  return {
    id: live.id, snapshotStates: audit.size, liveStates: states.size,
    missingShapeStates: [...states].filter(key => !audit.has(key)).sort(compareText),
    staleShapeStates: [...audit].filter(key => !states.has(key)).sort(compareText),
    shapesRuntimeVerified: false,
  };
}

export async function loadLockedRuntime(workspace) {
  const lock = JSON.parse(await readFile(path.join(workspace, 'upstream/java-reference.lock.json'), 'utf8'));
  if (lock.sourceCommit !== SOURCE_COMMIT) throw new Error('Runtime corpus uses a different upstream pin');
  const bytes = {};
  for (const [key, artifact] of Object.entries({ runtime: lock.runtime, buildManifest: lock.buildManifest, receipt: lock.receipt })) {
    if (!artifact.path.startsWith('evidence/')) throw new Error('Runtime corpus must refer to retained evidence');
    bytes[key] = await readFile(inside(workspace, artifact.path));
    if (hashBytes(bytes[key]) !== artifact.sha256) throw new Error(`Changed retained runtime ${key}`);
  }
  const raw = gunzipSync(bytes.runtime);
  if (hashBytes(raw) !== lock.runtime.uncompressedSha256) throw new Error('Runtime decompression identity mismatch');
  const runtime = JSON.parse(raw);
  const manifest = JSON.parse(bytes.buildManifest);
  const receipt = JSON.parse(bytes.receipt);
  const dependencies = JSON.parse(await readFile(path.join(workspace, 'upstream/java-dependencies.lock.json'), 'utf8'));
  if ([runtime.sourceCommit, manifest.sourceCommit, receipt.sourceCommit, dependencies.sourceCommit].some(commit => commit !== lock.sourceCommit)) throw new Error('Runtime bundle commit differs from the pinned catalogue commit');
  if (!runtime.complete || runtime.issues.length || runtime.schemaVersion !== 3 || !runtime.environment.productionProfile || runtime.environment.players !== 0 || runtime.environment.minecraftVersion !== '26.3') throw new Error('Runtime corpus is not a complete empty production reference');
  if (receipt.failure !== null || receipt.exit.code !== 0 || receipt.outputSha256 !== lock.runtime.uncompressedSha256 || receipt.inputFingerprint !== lock.sourceFingerprint || manifest.sourceFingerprint !== lock.sourceFingerprint) throw new Error('Runtime receipt/build attestation mismatch');
  assertRuntimeSource(runtime, manifest, dependencies);
  return { lock, runtime };
}

function obligation(kind, id, sources, details = {}) {
  return { key: `${kind}/${id}`, kind, upstreamId: id, targetId: `betterend_bedrock:${id.split(':')[1]}`, status: 'Unproven', evidence: [], sources, ...details };
}

export function tagBindingIssue(registry, id, tag) {
  if (!tag) return { code: 'missing-runtime-tag', registry, id };
  if (tag.bound !== true) return { code: 'unbound-runtime-tag', registry, id };
  if (!Array.isArray(tag.members)) throw new Error(`Bound runtime tag has no member array: ${registry}/${id}`);
  return null;
}

export function assertAssociatedEntityCoverage(runtime, furniture) {
  const entities = index(runtime.entities, 'live entity');
  for (const item of runtime.items) {
    if (item.implementationClass === 'net.minecraft.world.item.BoatItem' && !entities.has(item.id)) throw new Error(`Vehicle item has no live entity: ${item.id}`);
  }
  if (furniture.length && !entities.has('bclib:chair')) throw new Error('Seating blocks have no live bclib:chair helper');
}

export function reconcileCatalogue(catalogue, runtime, lock) {
  const blocks = index(runtime.blocks, 'block');
  const items = index(runtime.items, 'item');
  const biomes = index(runtime.biomes, 'biome');
  sameIds(blocks, index(catalogue.blocks, 'audit block'), 'Block');
  sameIds(items, index(catalogue.items, 'audit item'), 'Item');
  sameIds(biomes, index(catalogue.biomes, 'declared biome'), 'Biome');
  const evidencePath = lock.runtime.path;
  const coverage = [];
  for (const block of catalogue.blocks) {
    block.runtime = blocks.get(block.id);
    block.itemAssociation = { sameIdentifierPresent: items.has(block.id), runtimeVerified: true, actualItemId: block.runtime.blockItemId };
    coverage.push(stateCoverage(block.stateSnapshot, block.runtime));
  }
  for (const item of catalogue.items) {
    const live = items.get(item.id);
    if (JSON.stringify([...live.componentIds].sort(compareText)) !== JSON.stringify(Object.keys(live.components).sort(compareText))) throw new Error(`Missing intrinsic components for ${item.id}`);
    item.runtimeComponents = live.components;
    item.runtimeComponentEncodings = live.componentEncodings;
    item.runtimeClass = live.implementationClass;
    item.runtimeMaxStackSize = live.defaultMaxStackSize;
  }
  for (const biome of catalogue.biomes) biome.runtime = biomes.get(biome.id).value;
  const declared = index(catalogue.entities, 'wildlife declaration');
  const entityRows = [];
  const furnitureClasses = new Set(['org.betterx.bclib.furniture.block.BaseChair$Wood', 'org.betterx.bclib.furniture.block.BaseTaburet$Wood', 'org.betterx.bclib.furniture.block.BaseBarStool$Wood']);
  const furniture = runtime.blocks.filter(block => furnitureClasses.has(block.implementationClass)).map(block => block.id).sort(compareText);
  assertAssociatedEntityCoverage(runtime, furniture);
  const woodSource = 'src/main/java/org/betterx/betterend/registry/block/EndWoodBlocks.java';
  const materialSource = 'src/main/java/org/betterx/betterend/complexmaterials/EndWoodenComplexMaterial.java';
  for (const live of runtime.entities) {
    if (declared.has(live.id)) {
      entityRows.push({ ...declared.get(live.id), kind: 'wildlife', runtime: live });
      declared.delete(live.id);
    } else if (items.get(live.id)?.implementationClass === 'net.minecraft.world.item.BoatItem' && /_(boat|raft)$/u.test(live.id)) {
      const chest = /_chest_(boat|raft)$/u.test(live.id);
      const requirements = ['item-placement', 'native-passengers', 'water-transport', 'survival-recovery', 'unload-and-restart-persistence', ...(chest ? ['native-cargo-inventory', 'cargo-recovery', 'concurrent-access'] : [])];
      entityRows.push({ id: live.id, kind: 'vehicle', vehicleKind: live.id.endsWith('_raft') ? 'raft' : 'boat', chest, itemId: live.id, runtime: live, sourcePaths: [woodSource, materialSource], requirements });
      catalogue.parity.push(obligation('vehicle', live.id, [woodSource, materialSource, evidencePath], { associatedItemId: live.id, requirements }));
    } else if (live.id === 'bclib:chair') {
      const requirements = ['single-occupant-riding', 'player-interaction', 'eligible-mob-autoboarding', 'upper-half-forwarding', 'orphan-cleanup', 'reload-reconciliation'];
      entityRows.push({ id: live.id, kind: 'shared-helper', runtime: live, associatedBlocks: furniture, sourcePaths: [materialSource], requirements });
      catalogue.parity.push(obligation('entity-helper', live.id, [materialSource, evidencePath], { associatedBlocks: furniture, requirements }));
    } else {
      throw new Error(`Unclassified live entity ${live.id}; dependency ownership is not an exclusion`);
    }
  }
  if (declared.size) throw new Error('Declared wildlife is missing from the live reference');
  catalogue.entities = entityRows;
  const aliases = new Map([['betterend:custom_chorus_plant', 'minecraft:chorus_plant'], ['betterend:custom_chorus_flower', 'minecraft:chorus_flower']]);
  for (const visual of catalogue.nonRegistryVisuals) {
    if (!aliases.has(visual.id)) continue;
    visual.registryAlias = aliases.get(visual.id);
    const source = 'src/main/java/org/betterx/betterend/mixin/client/BlockStateModelLoaderMixin.java';
    const behavior = `src/main/java/org/betterx/betterend/mixin/common/${visual.id.endsWith('_plant') ? 'ChorusPlantBlockMixin' : 'ChorusFlowerBlockMixin'}.java`;
    catalogue.parity.push(obligation('vanilla-block-override', visual.registryAlias, [source, behavior, visual.source.path], { targetId: visual.registryAlias, visualResourceId: visual.id, requirements: ['classic-and-vv-visuals', 'source-substrate-and-growth-behavior', 'vanilla-progression-safety'] }));
  }
  const effective = index(runtime.effectiveDataResources, 'effective JSON resource');
  const boundTags = new Map(Object.entries(runtime.registryTags).map(([registry, rows]) => [registry, index(rows, `${registry} tag`)]));
  const resourceDifferences = [];
  const tagBindingIssues = [];
  for (const resource of catalogue.resources) {
    if (resource.scope !== 'main' || resource.format !== 'json') continue;
    const parts = resource.resourcePath.split('/');
    const id = `${parts[1]}:${parts.slice(2).join('/')}`;
    const observed = effective.get(id);
    resource.runtimeResource = observed ? { id, semantics: 'highest-priority-raw-resource-not-merged-tag', sourcePack: observed.sourcePack, sha256: observed.sha256, matchesSourceBytes: observed.sha256 === resource.source.sha256, recipeActivationCertified: false } : null;
    if (resource.category.startsWith('tags/')) {
      const registry = `minecraft:${resource.category.slice('tags/'.length)}`;
      const tag = boundTags.get(registry)?.get(resource.id);
      resource.runtimeTag = tag ? { registry, ...tag } : null;
      const issue = tagBindingIssue(registry, resource.id, tag);
      if (issue) tagBindingIssues.push({ ...issue, source: resource.source.path });
    }
    if (!observed || observed.sha256 !== resource.source.sha256) resourceDifferences.push({ id, source: resource.source, runtime: resource.runtimeResource, resolution: resource.runtimeTag?.bound ? 'use-merged-runtime-tag-membership' : 'unresolved-raw-resource-difference' });
  }
  catalogue.unresolved = catalogue.unresolved.filter(issue => !['runtime-registry-not-exported', 'snapshot-flammability-disagreement'].includes(issue.code) && !(issue.code === 'nonregistry-blockstate-resource' && aliases.has(issue.id)));
  const missingShapes = coverage.reduce((sum, entry) => sum + entry.missingShapeStates.length, 0);
  const staleShapes = coverage.reduce((sum, entry) => sum + entry.staleShapeStates.length, 0);
  if (missingShapes || staleShapes) catalogue.unresolved.push({ code: 'shape-audit-domain-mismatch', severity: 'release-blocker', missingLiveStateShapes: missingShapes, staleAuditStateShapes: staleShapes, detail: 'Live domains are authoritative; neutral/context-dependent collision geometry is not invented for missing audit rows.' });
  const unresolvedResources = resourceDifferences.filter(entry => entry.resolution === 'unresolved-raw-resource-difference');
  if (unresolvedResources.length) catalogue.unresolved.push({ code: 'runtime-resource-differences', severity: 'review', count: unresolvedResources.length, detail: 'Inspect selected-pack/source-byte differences in reports/runtime-reconciliation.json; raw resource visibility does not prove recipe activation.' });
  if (tagBindingIssues.length) catalogue.unresolved.push({ code: 'missing-runtime-tag-bindings', severity: 'release-blocker', count: tagBindingIssues.length, detail: 'A matching raw JSON file does not replace missing or unbound merged tag membership.' });
  catalogue.parity.sort((a, b) => compareText(a.key, b.key));
  if (new Set(catalogue.parity.map(entry => entry.key)).size !== catalogue.parity.length) throw new Error('Duplicate reconciled parity key');
  catalogue.evidenceScope = 'pinned-source-with-attested-production-registry-defaults-not-gameplay-parity';
  catalogue.reference = lock;
  Object.assign(catalogue.counts, { liveBlockStates: coverage.reduce((sum, entry) => sum + entry.liveStates, 0), runtimeEntities: entityRows.length, vehicles: entityRows.filter(entry => entry.kind === 'vehicle').length, sharedHelpers: entityRows.filter(entry => entry.kind === 'shared-helper').length, seatingBlocks: furniture.length, effectiveRuntimeJsonResources: effective.size, parityEntries: catalogue.parity.length, unresolved: catalogue.unresolved.length });
  catalogue.reconciliation = {
    schemaVersion: 1, sourceCommit: SOURCE_COMMIT, reference: lock,
    scope: 'Registry/default-component and raw effective JSON reconciliation; physical interactions and target parity remain unproven.',
    counts: catalogue.counts, blockStateCoverage: coverage, resourceDifferences, tagBindingIssues,
    flammability: { id: 'betterend:dragon_tree_planks', sourceRequest: { igniteOdds: 5, burnOdds: 20 }, runtime: blocks.get('betterend:dragon_tree_planks').flammability, resolution: 'Use observed production odds; do not silently rebalance the source request.' },
    entityGroups: { wildlife: entityRows.filter(entry => entry.kind === 'wildlife').map(entry => entry.id), vehicles: entityRows.filter(entry => entry.kind === 'vehicle').map(entry => entry.id), sharedHelpers: entityRows.filter(entry => entry.kind === 'shared-helper').map(entry => entry.id) },
  };
  return catalogue;
}
