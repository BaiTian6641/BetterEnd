import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogue } from './catalogue.mjs';
import { buildProvenance } from './provenance.mjs';
import { SOURCE_COMMIT, stableJson } from './source-files.mjs';
import { materializePinnedSource } from './pinned-source.mjs';
import { loadLockedRuntime, reconcileCatalogue } from './runtime-reconciliation.mjs';

const bedrockRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = path.resolve(bedrockRoot, '..');

export async function sourceOutputs(root = repoRoot) {
  const { runtime, lock } = await loadLockedRuntime(bedrockRoot);
  const snapshot = await materializePinnedSource(root, bedrockRoot);
  let catalogue;
  let provenance;
  try {
    catalogue = await buildCatalogue(snapshot.root);
    provenance = await buildProvenance(snapshot.root);
  } finally {
    await snapshot.dispose();
  }
  reconcileCatalogue(catalogue, runtime, lock);
  const summary = {
    schemaVersion: 2,
    sourceCommit: SOURCE_COMMIT,
    scope: 'source-and-production-registry-inventory-not-bedrock-gameplay-certification',
    catalogue: catalogue.counts,
    recipeTypes: catalogue.recipeTypes,
    assets: provenance.counts,
    unresolved: [...catalogue.unresolved, ...provenance.unresolved],
  };
  return new Map([
    ['catalogue/generated/registrations.json', { schemaVersion: 2, sourceCommit: SOURCE_COMMIT, evidenceScope: catalogue.evidenceScope, reference: catalogue.reference, blocks: catalogue.blocks, items: catalogue.items, entities: catalogue.entities, biomes: catalogue.biomes, nonRegistryVisuals: catalogue.nonRegistryVisuals }],
    ['catalogue/generated/resources.json', { schemaVersion: 2, sourceCommit: SOURCE_COMMIT, resourcePrecedence: catalogue.resourcePrecedence, reference: catalogue.reference, resources: catalogue.resources }],
    ['catalogue/generated/parity.json', { schemaVersion: 2, sourceCommit: SOURCE_COMMIT, entries: catalogue.parity }],
    ['upstream/asset-provenance.json', provenance],
    ['upstream/source.lock.json', { schemaVersion: 1, repository: catalogue.sourceRepository, commit: SOURCE_COMMIT, branch: 'release/26.3', catalogueFingerprint: catalogue.sourceFingerprint, assetFingerprint: provenance.sourceFingerprint, sources: catalogue.sources }],
    ['reports/source-summary.json', summary],
    ['reports/runtime-reconciliation.json', catalogue.reconciliation],
  ]);
}

async function main(args) {
  const mode = args[0];
  if (args.length !== 1 || !['extract', 'check'].includes(mode)) throw new Error('Usage: node tools/source-stage.mjs extract|check');
  const outputs = await sourceOutputs();
  for (const [relative, value] of outputs) {
    const destination = path.join(bedrockRoot, relative);
    const content = stableJson(value);
    if (mode === 'extract') {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content, 'utf8');
    } else {
      const existing = await readFile(destination, 'utf8');
      if (existing !== content) throw new Error(`Source output is stale: ${relative}; inspect source changes before regenerating`);
    }
  }
  const summary = outputs.get('reports/source-summary.json');
  console.log(JSON.stringify({ mode, outputFiles: outputs.size, catalogue: summary.catalogue, assets: summary.assets, unresolved: summary.unresolved.length, referenceRegistryVerified: true, bedrockGameplayCertified: false }, null, 2));
  const sourceErrors = summary.unresolved.filter(issue => issue.severity === 'source-error');
  if (sourceErrors.length) throw new Error(`${sourceErrors.length} source resource collisions require resolution`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.stack ?? String(error));
    process.exitCode = 1;
  });
}
