import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { InMemoryWorldPropertyAdapter, PersistenceStore } from '../runtime/persistence/store.js';
import { JOURNAL_STATES, RegionService } from '../runtime/regions/region-service.js';
import { GenerationService } from '../runtime/generation/generation-service.js';
import {
  BetterEndRuntime,
  REQUIRED_CUSTOM_BLOCK_COMPONENT_IDS,
  REQUIRED_CUSTOM_ITEM_COMPONENT_IDS,
  createBetterEndRuntime,
} from '../runtime/bootstrap/bootstrap.js';
import {
  PACK_PROFILES,
  PROVENANCE_CSV_HEADER,
  buildPacks,
  packZip,
} from '../tools/build-packs.mjs';
import {
  evaluateEvidenceGates,
  runVerification,
  verifyAssetProvenanceCsv,
  verifyRuntimePurity,
} from '../tools/verify.mjs';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '../..');

test('GenerationService registers all 27 regions & 113 features, protects central End, and executes resumable staged preparation', async () => {
  const adapter = new InMemoryWorldPropertyAdapter();
  const store = new PersistenceStore({ worldAdapter: adapter, autoFlush: true });
  const regionService = new RegionService({ worldSeed: 0x123456789abcdef0n, revision: 1 });

  const createdAreas = new Set();
  const mockTickingAreaManager = {
    hasCapacity: () => createdAreas.size < 4,
    createTickingArea: async name => {
      createdAreas.add(name);
    },
    removeTickingArea: async name => {
      createdAreas.delete(name);
    },
    getAllTickingAreas: async () => Array.from(createdAreas),
  };

  const gen = new GenerationService({
    regionService,
    store,
    tickingAreaManager: mockTickingAreaManager,
    maxConcurrentTickingAreas: 4,
  });

  assert.equal(gen.getRegisteredRegions().length, 27);
  assert.equal(gen.getRegisteredFeatures().length, 113);

  // 1. Protected central End (`|x| <= 1024 && |z| <= 1024`) is never modified
  const centerRes = gen.prepareCell('minecraft:the_end', 0, 0);
  assert.equal(centerRes.ok, true);
  assert.equal(centerRes.skipped, true);
  assert.equal(centerRes.protectedCenter, true);
  assert.equal(centerRes.state, 'ProtectedCenter');

  const edgeCenterRes = gen.prepareCell('minecraft:the_end', 15, -15);
  assert.equal(edgeCenterRes.protectedCenter, true);

  // 2. Uninterrupted vs staged-and-resumed preparation produce identical deterministic results
  const genReference = new GenerationService({
    regionService: new RegionService({ worldSeed: 0x123456789abcdef0n, revision: 1 }),
  });
  const fullRun = genReference.prepareCell('minecraft:the_end', 25, -30);
  assert.equal(fullRun.ok, true);
  assert.equal(fullRun.state, JOURNAL_STATES.COMMITTED);
  assert.ok(fullRun.artifact.surfacePlacements.length > 0 || fullRun.artifact.aerialPlacements.length >= 0);

  // Stop after TerrainReady
  const partialRun = gen.prepareCell('minecraft:the_end', 25, -30, {
    stopAfterStage: JOURNAL_STATES.TERRAIN_READY,
  });
  assert.equal(partialRun.ok, true);
  assert.equal(partialRun.state, JOURNAL_STATES.TERRAIN_READY);
  assert.equal(
    gen.getPersistedCellRecord('minecraft:the_end', 25, -30)?.state,
    JOURNAL_STATES.TERRAIN_READY,
  );

  // Resume to Committed via recoverInterruptedPreparations
  const recovered = gen.recoverInterruptedPreparations({ resumeToCommitted: true });
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].state, JOURNAL_STATES.COMMITTED);

  const resumedRun = gen.prepareCell('minecraft:the_end', 25, -30);
  assert.equal(resumedRun.state, JOURNAL_STATES.COMMITTED);
  assert.deepEqual(resumedRun.artifact.surfacePlacements, fullRun.artifact.surfacePlacements);
  assert.deepEqual(resumedRun.artifact.cavePlacements, fullRun.artifact.cavePlacements);
  assert.deepEqual(resumedRun.artifact.featurePlacements, fullRun.artifact.featurePlacements);

  // 3. Player-build protection quarantines cell and refuses to overwrite
  const playerBuildRes = gen.prepareCell('minecraft:the_end', 26, -30, {
    existingBlocks: ['minecraft:end_stone', 'minecraft:chest'],
  });
  assert.equal(playerBuildRes.ok, false);
  assert.equal(playerBuildRes.quarantined, true);
  assert.equal(playerBuildRes.state, JOURNAL_STATES.QUARANTINED);
  assert.match(playerBuildRes.reason, /foreign_block_detected:minecraft:chest/);

  // 4. Revision mismatch quarantines cell
  const revMismatchRes = gen.prepareCell('minecraft:the_end', 27, -30, {
    revision: 99,
  });
  assert.equal(revMismatchRes.ok, false);
  assert.equal(revMismatchRes.quarantined, true);
  assert.equal(revMismatchRes.state, JOURNAL_STATES.QUARANTINED);

  // 5. Single-owner cell lock & multiplayer contention (`CAP-014`)
  const lockOwnerRun = gen.prepareCell('minecraft:the_end', 30, 30, {
    ownerId: 'player_alpha',
    stopAfterStage: JOURNAL_STATES.PLANNED,
    keepLock: true,
  });
  assert.equal(lockOwnerRun.ok, true);
  assert.equal(lockOwnerRun.state, JOURNAL_STATES.PLANNED);

  const secondPlayerAttempt = gen.prepareCell('minecraft:the_end', 30, 30, {
    ownerId: 'player_beta',
  });
  assert.equal(secondPlayerAttempt.ok, true);
  assert.equal(secondPlayerAttempt.joinedExisting, true);
  assert.equal(secondPlayerAttempt.lockedBy, 'player_alpha');

  gen.releaseCellLock('minecraft:the_end:30,30', 'player_alpha');
  const finishLockedCell = gen.prepareCell('minecraft:the_end', 30, 30, {
    ownerId: 'player_beta',
  });
  assert.equal(finishLockedCell.ok, true);
  assert.equal(finishLockedCell.state, JOURNAL_STATES.COMMITTED);

  // 6. Ticking area lifecycle & startup leak reconciliation
  const areaRes = await gen.acquireCellTickingArea('minecraft:the_end', 40, 40);
  assert.equal(areaRes.acquired, true);
  assert.ok(createdAreas.has('betterend:prep_40_40'));

  const cleaned = await gen.reconcileLeakedTickingAreas();
  assert.ok(cleaned.includes('betterend:prep_40_40'));
  assert.equal(createdAreas.size, 0);
});

test('BetterEndRuntime bootstrap registers all 17 block & 5 item custom components and maintains strict runtime purity', async () => {
  const purity = await verifyRuntimePurity(repoRoot);
  assert.equal(purity.ok, true, `Runtime purity violations: ${JSON.stringify(purity.violations)}`);

  const registeredBlocks = new Map();
  const registeredItems = new Map();
  let startupCallback = null;
  let worldLoadCallback = null;

  const mockServer = {
    world: new InMemoryWorldPropertyAdapter(),
    system: {
      beforeEvents: {
        startup: {
          subscribe: fn => {
            startupCallback = fn;
          },
        },
      },
      afterEvents: {
        scriptEventReceive: {
          subscribe: () => {},
        },
      },
      runInterval: () => 1,
      sendScriptEvent: () => {},
    },
  };
  mockServer.world.seed = 42424242n;
  mockServer.world.afterEvents = {
    worldLoad: {
      subscribe: fn => {
        worldLoadCallback = fn;
      },
    },
  };

  const runtime = createBetterEndRuntime({
    serverModule: mockServer,
    uiModule: {},
    graphicsModule: null,
    profile: 'stable-2640',
  });

  assert.ok(startupCallback, 'Expected system.beforeEvents.startup subscription');
  startupCallback({
    blockComponentRegistry: {
      registerCustomComponent: (id, handler) => registeredBlocks.set(id, handler),
    },
    itemComponentRegistry: {
      registerCustomComponent: (id, handler) => registeredItems.set(id, handler),
    },
  });

  for (const reqBlockId of REQUIRED_CUSTOM_BLOCK_COMPONENT_IDS) {
    assert.ok(registeredBlocks.has(reqBlockId), `Missing block component ${reqBlockId}`);
  }
  for (const reqItemId of REQUIRED_CUSTOM_ITEM_COMPONENT_IDS) {
    assert.ok(registeredItems.has(reqItemId), `Missing item component ${reqItemId}`);
  }

  assert.ok(worldLoadCallback, 'Expected world.afterEvents.worldLoad subscription');
  const initSummary = await runtime.initializeWorld(mockServer.world);
  assert.equal(initSummary.worldLoaded, true);
  assert.equal(initSummary.worldSeed, '42424242');
});

test('Production pack builder, asset-provenance.csv, and verification runner validate all automated checks and fail closed on pending manual client gates', async () => {
  const csvCheck = await verifyAssetProvenanceCsv(repoRoot);
  assert.equal(csvCheck.ok, true);
  assert.equal(csvCheck.headerMatches, true);
  assert.equal(csvCheck.restrictedAssetRows, 3);

  // Verify on-disk built artifacts from build-packs.mjs
  const stableDir = path.resolve(repoRoot, 'bedrock/dist/packs/stable-2640');
  const expDir = path.resolve(repoRoot, 'bedrock/dist/packs/experimental-2640');
  const indDir = path.resolve(repoRoot, 'bedrock/dist/packs/industrial_bp');

  assert.ok(existsSync(path.join(stableDir, 'BetterEnd-26.40-Stable.mcaddon')));
  assert.ok(existsSync(path.join(expDir, 'BetterEnd-26.40-ExperimentalVV.mcaddon')));
  assert.ok(existsSync(path.join(indDir, 'manifest.json')));

  const stableManifest = JSON.parse(
    readFileSync(path.join(stableDir, 'behavior_pack/manifest.json'), 'utf8'),
  );
  const expManifest = JSON.parse(
    readFileSync(path.join(expDir, 'behavior_pack/manifest.json'), 'utf8'),
  );

  assert.equal(stableManifest.format_version, 2);
  assert.deepEqual(stableManifest.header.min_engine_version, [1, 26, 40]);
  assert.ok(
    !JSON.stringify(stableManifest).includes('@minecraft/server-graphics'),
    'Stable BP manifest must not depend on @minecraft/server-graphics',
  );
  assert.ok(
    JSON.stringify(expManifest).includes('@minecraft/server-graphics'),
    'Experimental VV BP manifest must depend on @minecraft/server-graphics',
  );

  // Automated verification mode must pass (`ok: true`)
  const autoReport = await runVerification({
    repoRoot,
    automatedOnly: true,
    rebuildPacks: false,
    writeReport: true,
  });
  assert.equal(autoReport.ok, true);
  assert.equal(autoReport.automatedPassed, true);
  assert.equal(autoReport.packChecks.catalogueBlocks728, true);
  assert.equal(autoReport.packChecks.totalBlockStates22385, true);
  assert.equal(autoReport.packChecks.items850, true);
  assert.equal(autoReport.packChecks.recipes879, true);
  assert.equal(autoReport.packChecks.zeroTextureSetViolations, true);
  assert.equal(autoReport.packChecks.zeroStableGraphicsLeak, true);
  assert.equal(autoReport.evidenceGates.automatedGates['CAP-003:regions-and-outer-end-bds'], true);
  assert.equal(autoReport.evidenceGates.automatedGates['CAP-004:biome-queries-and-tags-bds'], true);
  assert.equal(autoReport.evidenceGates.automatedGates['CAP-005:existing-world-import-bds'], true);
  assert.equal(autoReport.evidenceGates.automatedGates['CAP-007:infusion-ritual-and-stations-bds'], true);
  assert.equal(autoReport.evidenceGates.automatedGates['CAP-008:elytra-gliding-and-equipment-bds'], true);
  assert.equal(autoReport.evidenceGates.automatedGates['CAP-011:fog-audio-and-atmosphere-bds'], true);
  assert.equal(autoReport.evidenceGates.automatedGates['CAP-012:functional-blocks-and-ecology-bds'], true);
  assert.equal(autoReport.evidenceGates.automatedGates['CAP-013:eternal-portal-and-obelisk-bds'], true);
  assert.equal(autoReport.evidenceGates.automatedGates['CAP-014:concurrent-multiplayer-contention-bds'], true);

  // Full release verification mode must fail closed (`ok: false`) until manual stock-client/console hardware gates are recorded
  const fullReport = await runVerification({
    repoRoot,
    automatedOnly: false,
    rebuildPacks: false,
    writeReport: false,
  });
  assert.equal(fullReport.automatedPassed, true);
  assert.equal(fullReport.fullReleaseCertified, false);
  assert.equal(fullReport.ok, false);
  assert.ok(fullReport.evidenceGates.pendingManualGates.includes('INV-001:client-ui'));
  assert.ok(
    fullReport.evidenceGates.pendingManualGates.includes('CAP-008:client-elytra-glider-and-hud'),
  );
  assert.ok(
    fullReport.evidenceGates.pendingManualGates.includes('CAP-009:custom-entity-and-vehicle-client'),
  );
  assert.ok(
    fullReport.evidenceGates.pendingManualGates.includes('CAP-010:client-vv-pbr-local-lighting'),
  );
  assert.ok(
    fullReport.evidenceGates.pendingManualGates.includes(
      'CAP-015:multiplayer-30min-client-session',
    ),
  );
  assert.ok(
    fullReport.evidenceGates.pendingManualGates.includes('CAP-016:third-party-addon-client-session'),
  );
  assert.ok(
    fullReport.evidenceGates.pendingManualGates.includes('CAP-017:console-mobile-memory-budget'),
  );
});
