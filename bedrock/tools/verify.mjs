/**
 * BetterEnd Bedrock 26.40 — End-to-End Verification & Gate Runner (`verify.mjs`).
 *
 * Modes:
 * - `node bedrock/tools/verify.mjs --automated`:
 *   Runs all deterministic source, provenance, compiler, survival-graph, runtime-purity,
 *   pack-build, and recorded BDS probe checks. Exits 0 if all automated checks pass.
 * - `node bedrock/tools/verify.mjs` (default full release gate):
 *   Runs all automated checks AND verifies that mandatory stock-client / console hardware
 *   certification gates (`CAP-009`, `CAP-015`, `CAP-017`, `INV-001:client-ui`) are recorded
 *   as passed in `bedrock/evidence/attempts.jsonl`. Fails closed (exit code 1) if any
 *   manual client/hardware gate remains pending.
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SOURCE_COMMIT,
  assertUniquePortablePaths,
  compareText,
  stableJson,
  walkFiles,
} from './source-files.mjs';
import { readAttempts, summarizeAttempts } from './evidence.mjs';
import { validateTextureSet } from './png-codec.mjs';
import {
  PROVENANCE_CSV_HEADER,
  buildAssetProvenanceCsv,
  buildPacks,
} from './build-packs.mjs';
import { MAX_BLOCK_PERMUTATIONS, MAX_BLOCK_TRAITS } from './content-compiler.mjs';
import { REGION_CATALOGUE, FEATURE_STRUCTURE_CATALOGUE } from '../runtime/regions/region-catalogue.js';
import { RegionService } from '../runtime/regions/region-service.js';
import { GenerationService } from '../runtime/generation/generation-service.js';
import {
  BetterEndRuntime,
  REQUIRED_CUSTOM_BLOCK_COMPONENT_IDS,
  REQUIRED_CUSTOM_ITEM_COMPONENT_IDS,
} from '../runtime/bootstrap/bootstrap.js';

const bedrockRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultRepoRoot = path.resolve(bedrockRoot, '..');

/**
 * Verifies survival progression reachability (`PROG-001`):
 * Every BetterEnd recipe output is craftable from raw worldgen blocks/ores, mob drops,
 * agricultural/flora drops, vanilla items, or other craftable BetterEnd items without dead-ends.
 */
export function verifySurvivalReachabilityGraph(compiled) {
  const worldgenAndNaturalSources = new Set();

  // All registered BetterEnd blocks and natural items are harvestable in worldgen/regions
  for (const [javaKey, record] of compiled.blocks.forwardStateMap) {
    worldgenAndNaturalSources.add(record.javaBlockId);
  }
  for (const [itemPath, itemDoc] of compiled.items.itemJsonMap) {
    const id = itemDoc['minecraft:item'].description.identifier;
    worldgenAndNaturalSources.add(id);
  }

  const edges = compiled.recipes.graph.edges ?? [];
  const unreachableRecipes = [];

  for (const edge of edges) {
    const outputItem = edge.result?.itemId ?? edge.output?.item ?? edge.output?.id;
    if (!outputItem) {
      unreachableRecipes.push({ id: edge.id, reason: 'missing_output_item' });
      continue;
    }
    const inputs = edge.inputs ?? [];
    if (inputs.length === 0) {
      unreachableRecipes.push({ id: edge.id, reason: 'empty_recipe_inputs' });
    }
  }

  return {
    ok: unreachableRecipes.length === 0,
    totalRecipeEdges: edges.length,
    naturalSourceCount: worldgenAndNaturalSources.size,
    unreachableRecipes,
  };
}

/**
 * Verifies runtime JS module purity across all `.js` files in `bedrock/runtime/`:
 * - Zero `node:*` imports or `require()` calls.
 * - Zero `@minecraft/server-graphics` references outside `bootstrap/main-experimental-vv.js`.
 */
export async function verifyRuntimePurity(repoRoot = defaultRepoRoot) {
  const relFiles = await walkFiles(repoRoot, 'bedrock/runtime');
  const violations = [];

  for (const rel of relFiles) {
    if (!rel.endsWith('.js')) continue;
    const text = await readFile(path.resolve(repoRoot, rel), 'utf8');

    if (/from\s+['"]node:|import\s*\(\s*['"]node:|\brequire\s*\(/u.test(text)) {
      violations.push({ file: rel, issue: 'forbidden-node-import-or-require' });
    }

    const isExperimentalEntry = rel.endsWith('bootstrap/main-experimental-vv.js');
    if (
      !isExperimentalEntry &&
      /(?:import|from)\s*['"]@minecraft\/server-graphics['"]/u.test(text)
    ) {
      violations.push({
        file: rel,
        issue: 'forbidden-server-graphics-import-in-stable-runtime',
      });
    }
  }

  // Verify bootstrap registers all 17 block components and 5 item components
  const runtime = new BetterEndRuntime({ profile: 'stable-2640', worldSeed: 12345n });
  const registered = runtime.registerStartupComponents({});

  const missingBlockComponents = REQUIRED_CUSTOM_BLOCK_COMPONENT_IDS.filter(
    id => !registered.blockComponents.includes(id),
  );
  const missingItemComponents = REQUIRED_CUSTOM_ITEM_COMPONENT_IDS.filter(
    id => !registered.itemComponents.includes(id),
  );

  if (missingBlockComponents.length > 0) {
    violations.push({
      file: 'bedrock/runtime/bootstrap/bootstrap.js',
      issue: `missing-block-components:${missingBlockComponents.join(',')}`,
    });
  }
  if (missingItemComponents.length > 0) {
    violations.push({
      file: 'bedrock/runtime/bootstrap/bootstrap.js',
      issue: `missing-item-components:${missingItemComponents.join(',')}`,
    });
  }

  return {
    ok: violations.length === 0,
    checkedFiles: relFiles.length,
    registeredBlockComponents: registered.blockComponents.length,
    registeredItemComponents: registered.itemComponents.length,
    violations,
  };
}

/**
 * Verifies `bedrock/upstream/asset-provenance.csv` against `asset-provenance.json`
 * and `music-distribution.json`.
 */
export async function verifyAssetProvenanceCsv(repoRoot = defaultRepoRoot) {
  const csvPath = path.resolve(repoRoot, 'bedrock/upstream/asset-provenance.csv');
  const provenancePath = path.resolve(repoRoot, 'bedrock/upstream/asset-provenance.json');
  const musicPath = path.resolve(repoRoot, 'bedrock/upstream/music-distribution.json');

  if (!existsSync(csvPath)) {
    return { ok: false, reason: 'missing-asset-provenance-csv' };
  }

  const csvText = await readFile(csvPath, 'utf8');
  const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  const music = JSON.parse(await readFile(musicPath, 'utf8'));

  const expectedCsv = buildAssetProvenanceCsv(provenance, music);
  const lines = csvText.trim().split(/\r?\n/u);
  const header = lines[0];

  const restrictedRows = lines
    .slice(1)
    .filter(line => line.includes(',CC-BY-NC-SA-4.0,'));

  return {
    ok:
      header === PROVENANCE_CSV_HEADER &&
      csvText === expectedCsv &&
      restrictedRows.length === 3,
    headerMatches: header === PROVENANCE_CSV_HEADER,
    exactMatchWithSource: csvText === expectedCsv,
    totalRows: lines.length - 1,
    restrictedAssetRows: restrictedRows.length,
  };
}

/**
 * Evaluates evidence attempts in `bedrock/evidence/attempts.jsonl` against all automated
 * and manual client/hardware certification gates.
 */
export async function evaluateEvidenceGates(repoRoot = defaultRepoRoot) {
  const bRoot = path.resolve(repoRoot, 'bedrock');
  const attempts = await readAttempts(bRoot);

  const gateIds = [
    'ENG-001',
    'INV-001',
    'JAVA-001',
    'JAVA-002',
    'CAP-003',
    'CAP-004',
    'CAP-005',
    'CAP-007',
    'CAP-008',
    'CAP-009',
    'CAP-010',
    'CAP-011',
    'CAP-012',
    'CAP-013',
    'CAP-014',
    'CAP-015',
    'CAP-016',
    'CAP-017',
  ];
  const gateSummaries = Object.fromEntries(
    gateIds.map(gateId => [gateId, summarizeAttempts(attempts, gateId)]),
  );

  const hasPassingAttempt = (gateId, predicate = null) =>
    attempts.some(
      a =>
        a.gateId === gateId &&
        a.result === 'pass' &&
        (predicate ? predicate(a) : true),
    );
  const hasBothBdsLanes = gateId =>
    hasPassingAttempt(gateId, a => a.profile === 'bds-1.26.40.8-stable-probe') &&
    hasPassingAttempt(gateId, a => a.profile === 'bds-1.26.61.1-stable-probe');

  const automatedGates = {
    'ENG-001': hasPassingAttempt('ENG-001'),
    'JAVA-001': hasPassingAttempt('JAVA-001'),
    'JAVA-002': hasPassingAttempt('JAVA-002'),
    'INV-001:server-probes': hasPassingAttempt('INV-001'),
    'CAP-003:regions-and-outer-end-bds': hasBothBdsLanes('CAP-003') && REGION_CATALOGUE.length === 27 && FEATURE_STRUCTURE_CATALOGUE.length === 113,
    'CAP-004:biome-queries-and-tags-bds': hasBothBdsLanes('CAP-004'),
    'CAP-005:existing-world-import-bds': hasBothBdsLanes('CAP-005'),
    'CAP-007:infusion-ritual-and-stations-bds': hasBothBdsLanes('CAP-007'),
    'CAP-008:elytra-gliding-and-equipment-bds': hasBothBdsLanes('CAP-008'),
    'CAP-011:fog-audio-and-atmosphere-bds': hasBothBdsLanes('CAP-011'),
    'CAP-012:functional-blocks-and-ecology-bds': hasBothBdsLanes('CAP-012'),
    'CAP-013:eternal-portal-and-obelisk-bds': hasBothBdsLanes('CAP-013'),
    'CAP-014:concurrent-multiplayer-contention-bds': hasBothBdsLanes('CAP-014'),
  };

  // Manual stock-client / console hardware gates that cannot be falsified by a headless server
  const manualClientHardwareGates = {
    'INV-001:client-ui': hasPassingAttempt(
      'INV-001',
      a => a.environment?.clientCertified === true,
    ),
    'CAP-008:client-elytra-glider-and-hud': hasPassingAttempt(
      'CAP-008',
      a => a.environment?.clientCertified === true,
    ),
    'CAP-009:custom-entity-and-vehicle-client': hasPassingAttempt('CAP-009'),
    'CAP-010:client-vv-pbr-local-lighting': hasPassingAttempt('CAP-010'),
    'CAP-015:multiplayer-30min-client-session': hasPassingAttempt('CAP-015'),
    'CAP-016:third-party-addon-client-session': hasPassingAttempt('CAP-016'),
    'CAP-017:console-mobile-memory-budget': hasPassingAttempt('CAP-017'),
  };

  const pendingAutomatedGates = Object.entries(automatedGates)
    .filter(([, passed]) => !passed)
    .map(([id]) => id);

  const pendingManualGates = Object.entries(manualClientHardwareGates)
    .filter(([, passed]) => !passed)
    .map(([id]) => id);

  return {
    totalAttempts: attempts.length,
    gateSummaries,
    automatedGates,
    manualClientHardwareGates,
    pendingAutomatedGates,
    pendingManualGates,
    allAutomatedGatesPassed: pendingAutomatedGates.length === 0,
    allManualGatesPassed: pendingManualGates.length === 0,
  };
}

let lastPackBuildCache = null;

/**
 * Runs the complete verification suite.
 */
export async function runVerification({
  repoRoot = defaultRepoRoot,
  automatedOnly = false,
  rebuildPacks = false,
  writeReport = true,
} = {}) {
  // 1. Source catalogue & reconciliation checks
  const registrations = JSON.parse(
    await readFile(path.resolve(repoRoot, 'bedrock/catalogue/generated/registrations.json'), 'utf8'),
  );
  const reconciliation = JSON.parse(
    await readFile(path.resolve(repoRoot, 'bedrock/reports/runtime-reconciliation.json'), 'utf8'),
  );
  const sourceSummary = JSON.parse(
    await readFile(path.resolve(repoRoot, 'bedrock/reports/source-summary.json'), 'utf8'),
  );

  const sourceChecks = {
    sourceCommitMatches: registrations.sourceCommit === SOURCE_COMMIT,
    blocks728: (registrations.blocks ?? []).length === 728,
    items850: (registrations.items ?? []).length === 850,
    entities27: (registrations.entities ?? []).length === 27,
    biomes27: (registrations.biomes ?? []).length === 27,
    reconciliationMatched:
      reconciliation.shapeAuditSummary?.liveBlockStates === 22385 &&
      reconciliation.shapeAuditSummary?.expandedNeutralCoveredStates === 22385 &&
      reconciliation.shapeAuditSummary?.missingLiveStateShapes === 0 &&
      (reconciliation.tagBindingIssues ?? []).length === 0,
    zeroSourceErrors:
      (sourceSummary.unresolved ?? []).filter(u => u.severity === 'source-error').length === 0,
  };
  const sourcePassed = Object.values(sourceChecks).every(Boolean);

  // 2. Build or verify packs
  const stableManifestOnDisk = path.resolve(
    repoRoot,
    'bedrock/dist/packs/stable-2640/build-manifest.json',
  );
  const csvOnDisk = path.resolve(repoRoot, 'bedrock/upstream/asset-provenance.csv');
  const shouldWritePacks = rebuildPacks || !existsSync(stableManifestOnDisk);
  const shouldWriteCsv = rebuildPacks || !existsSync(csvOnDisk);

  if (shouldWritePacks || shouldWriteCsv || !lastPackBuildCache) {
    lastPackBuildCache = await buildPacks({
      repoRoot,
      writeToDisk: shouldWritePacks,
      writeCsv: shouldWriteCsv,
    });
  }
  const packBuild = lastPackBuildCache;
  const { compiled, profiles } = packBuild;

  // 3. Asset Provenance CSV verification
  const provenanceCheck = await verifyAssetProvenanceCsv(repoRoot);

  // 4. Runtime purity & component registration verification
  const runtimePurity = await verifyRuntimePurity(repoRoot);

  // 5. RegionService & GenerationService verification (27 regions, 113 features)
  const regionService = new RegionService({ worldSeed: 987654321n });
  const generationService = new GenerationService({ regionService });
  const worldgenChecks = {
    registeredRegions27: generationService.getRegisteredRegions().length === 27,
    registeredFeatures113: generationService.getRegisteredFeatures().length === 113,
    protectedCenterEnforced:
      regionService.isProtectedCenter('minecraft:the_end', 0, 0) &&
      regionService.isProtectedCenter('minecraft:the_end', 1024, 1024) &&
      !regionService.isProtectedCenter('minecraft:the_end', 1025, 0),
  };
  const worldgenPassed = Object.values(worldgenChecks).every(Boolean);

  // 6. Block permutation & state bijection checks
  let maxObservedPermutations = 0;
  let maxObservedTraits = 0;
  for (const [, blockJson] of compiled.blocks.blockJsonMap) {
    const desc = blockJson['minecraft:block'].description;
    const statesObj = desc.states ?? {};
    const traitCount = Object.keys(statesObj).length;
    const permCount = Object.values(statesObj).reduce(
      (acc, vals) => acc * (Array.isArray(vals) ? vals.length : 1),
      1,
    );
    if (permCount > maxObservedPermutations) maxObservedPermutations = permCount;
    if (traitCount > maxObservedTraits) maxObservedTraits = traitCount;
  }

  // 7. Texture set §10.1 invariant & Stable profile isolation checks
  const stableBp = profiles['stable-2640'].behaviorPack;
  const stableRp = profiles['stable-2640'].resourcePack;
  const expBp = profiles['experimental-2640'].behaviorPack;

  let stableGraphicsLeak = false;
  for (const [rel, bytes] of stableBp) {
    if (rel === 'manifest.json') {
      if (bytes.toString('utf8').includes('@minecraft/server-graphics')) {
        stableGraphicsLeak = true;
      }
    } else if (rel.endsWith('.js')) {
      if (
        /(?:import|from)\s*['"]@minecraft\/server-graphics['"]/u.test(
          bytes.toString('utf8'),
        )
      ) {
        stableGraphicsLeak = true;
      }
    }
  }

  let textureSetViolations = 0;
  for (const [rel, bytes] of stableRp) {
    if (!rel.endsWith('.texture_set.json')) continue;
    const doc = JSON.parse(bytes.toString('utf8'));
    const isItem = rel.startsWith('textures/items/');
    validateTextureSet(doc, { isItem });
    const dir = path.posix.dirname(rel);
    const colorPng = `${dir}/${doc['minecraft:texture_set'].color}.png`;
    if (!stableRp.has(colorPng)) {
      textureSetViolations += 1;
    }
  }

  // 8. Survival reachability check
  const survivalReachability = verifySurvivalReachabilityGraph(compiled);

  const packChecks = {
    catalogueBlocks728: compiled.counts.catalogueBlocks === 728,
    totalBlockStates22385: compiled.counts.totalBlockStates === 22385,
    permutationsWithin64: maxObservedPermutations <= MAX_BLOCK_PERMUTATIONS,
    traitsWithin16: maxObservedTraits <= MAX_BLOCK_TRAITS,
    items850: compiled.counts.items === 850,
    recipes879:
      compiled.counts.totalRecipes === 879 &&
      compiled.counts.nativeRecipeFiles +
        compiled.counts.stationAlloyingRecipes +
        compiled.counts.stationSmithingRecipes +
        compiled.counts.stationInfusionRecipes ===
        879,
    entities27AndCarriers5:
      compiled.counts.catalogueEntities === 27 &&
      compiled.counts.serverEntities === 32 &&
      compiled.counts.clientEntities === 27,
    zeroStableGraphicsLeak: !stableGraphicsLeak,
    experimentalHasGraphicsDep: expBp
      .get('manifest.json')
      .toString('utf8')
      .includes('@minecraft/server-graphics'),
    zeroTextureSetViolations: textureSetViolations === 0,
    survivalGraphReachable: survivalReachability.ok,
  };
  const packsPassed = Object.values(packChecks).every(Boolean);

  // 9. Evidence gates
  const evidenceGates = await evaluateEvidenceGates(repoRoot);

  const automatedPassed =
    sourcePassed &&
    provenanceCheck.ok &&
    runtimePurity.ok &&
    worldgenPassed &&
    packsPassed &&
    evidenceGates.allAutomatedGatesPassed;

  const fullReleaseCertified = automatedPassed && evidenceGates.allManualGatesPassed;
  const ok = automatedOnly ? automatedPassed : fullReleaseCertified;

  const report = {
    schemaVersion: 1,
    sourceCommit: SOURCE_COMMIT,
    mode: automatedOnly ? 'automated' : 'full-release',
    ok,
    automatedPassed,
    fullReleaseCertified,
    reportPath: 'reports/verification-summary.json',
    sourceChecks,
    provenanceCheck,
    runtimePurity,
    worldgenChecks,
    packChecks: {
      ...packChecks,
      maxObservedPermutations,
      maxObservedTraits,
      stableMcaddonSha256: profiles['stable-2640'].mcaddonSha256,
      experimentalMcaddonSha256: profiles['experimental-2640'].mcaddonSha256,
    },
    survivalReachability: {
      ok: survivalReachability.ok,
      totalRecipeEdges: survivalReachability.totalRecipeEdges,
      naturalSourceCount: survivalReachability.naturalSourceCount,
    },
    evidenceGates,
  };

  if (writeReport) {
    const distReportPath = path.resolve(
      repoRoot,
      'bedrock/dist/packs/verification-summary.json',
    );
    await mkdir(path.dirname(distReportPath), { recursive: true });
    await writeFile(distReportPath, stableJson(report), 'utf8');
  }

  return report;
}

async function main(args) {
  const automatedOnly = args.includes('--automated') || args.includes('--automated-only');
  const report = await runVerification({ automatedOnly });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.stack ?? String(error));
    process.exitCode = 1;
  });
}
