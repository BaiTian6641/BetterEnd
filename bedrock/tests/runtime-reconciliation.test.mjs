import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { SOURCE_COMMIT, hashBytes } from '../tools/source-files.mjs';
import { parseShapeSnapshot } from '../tools/catalogue.mjs';
import { assertAssociatedEntityCoverage, loadLockedRuntime, stateCoverage, tagBindingIssue } from '../tools/runtime-reconciliation.mjs';

function liveStates() {
  return {
    id: 'betterend:crystal', defaultState: { age: 1, waterlogged: false },
    propertyDomains: { age: { values: [0, 1] }, waterlogged: { values: [true, false] } },
    states: [0, 1].flatMap(age => [true, false].map(waterlogged => ({ values: { age, waterlogged } }))),
  };
}

const audit = { records: [
  { states: { age: '0', waterlogged: 'true' } },
  { states: { age: '0', waterlogged: 'false' } },
  { states: { age: '2', waterlogged: 'false' } },
] };

test('live Cartesian state domains expose missing/stale audit shapes without inventing geometry', () => {
  const result = stateCoverage(audit, liveStates());
  assert.deepEqual(result.missingShapeStates, ['age=1,waterlogged=false', 'age=1,waterlogged=true']);
  assert.deepEqual(result.staleShapeStates, ['age=2,waterlogged=false']);
  assert.equal(result.liveStates, 4);
  assert.equal(result.coveredLiveStates, 2);
  assert.equal(result.coverageMode, 'explicit-states');
  assert.equal(result.compressedPropertyDomain, false);
  assert.equal(result.shapesRuntimeVerified, false);
});

test('uniform neutral-context audit row covers all states of a property-bearing block without false missing or stale diagnostics', () => {
  const parsed = parseShapeSnapshot(
    'betterend:amaranita_hyphae  shape=[0,0,0|1,1,1] collision=[0,0,0|1,1,1]',
    new Set(['betterend:amaranita_hyphae']),
  );
  const live = {
    id: 'betterend:amaranita_hyphae',
    defaultState: { axis: 'y' },
    propertyDomains: { axis: { values: ['x', 'y', 'z'] } },
    states: ['x', 'y', 'z'].map(axis => ({ values: { axis } })),
  };
  const result = stateCoverage(parsed.blocks.get('betterend:amaranita_hyphae'), live);
  assert.equal(result.coverageMode, 'uniform-all-states');
  assert.equal(result.compressedPropertyDomain, true);
  assert.equal(result.snapshotRows, 1);
  assert.equal(result.snapshotStates, 3);
  assert.equal(result.liveStates, 3);
  assert.equal(result.coveredLiveStates, 3);
  assert.deepEqual(result.missingShapeStates, []);
  assert.deepEqual(result.staleShapeStates, []);
  assert.equal(result.auditContext.roundingDecimals, 4);
  assert.equal(result.auditContext.getter, 'net.minecraft.world.level.EmptyBlockGetter.INSTANCE');
  assert.equal(result.shapesRuntimeVerified, false);
  assert.throws(
    () => stateCoverage({
      records: [
        { coverage: 'uniform-all-states', states: null, selection: 'empty', collision: 'empty' },
        { coverage: 'explicit-state', states: { axis: 'y' }, selection: 'empty', collision: 'empty' },
      ],
    }, live),
    /Contradictory mixed uniform and explicit/,
  );
  assert.throws(
    () => stateCoverage({
      records: [
        { coverage: 'uniform-all-states', states: null, selection: 'empty', collision: 'empty' },
        { coverage: 'uniform-all-states', states: null, selection: 'empty', collision: 'empty' },
      ],
    }, live),
    /Duplicate uniform shape audit/,
  );
});

test('incomplete, duplicate or mistyped live states/defaults cannot certify a domain', () => {
  const incomplete = liveStates();
  incomplete.states.pop();
  assert.throws(() => stateCoverage(audit, incomplete), /Incomplete state domain/);
  const duplicate = liveStates();
  duplicate.states[3] = duplicate.states[0];
  assert.throws(() => stateCoverage(audit, duplicate), /Duplicate live state/);
  const wrongType = liveStates();
  wrongType.defaultState.age = '1';
  assert.throws(() => stateCoverage(audit, wrongType), /Default outside its typed domain/);
});

test('vehicle items and seating blocks cannot survive while their mandatory entity obligations disappear', () => {
  const runtime = {
    items: [{ id: 'betterend:end_lotus_raft', implementationClass: 'net.minecraft.world.item.BoatItem' }],
    entities: [{ id: 'bclib:chair' }],
  };
  assert.throws(() => assertAssociatedEntityCoverage(runtime, ['betterend:dragon_tree_chair']), /Vehicle item has no live entity/);
  runtime.entities = [{ id: 'betterend:end_lotus_raft' }];
  assert.throws(() => assertAssociatedEntityCoverage(runtime, ['betterend:dragon_tree_chair']), /no live bclib:chair helper/);
});

test('missing or unbound merged tags remain distinct from valid empty membership', () => {
  assert.equal(tagBindingIssue('minecraft:item', 'betterend:thallasium/repair', undefined).code, 'missing-runtime-tag');
  assert.equal(tagBindingIssue('minecraft:item', 'betterend:thallasium/repair', { bound: false, members: null }).code, 'unbound-runtime-tag');
  assert.equal(tagBindingIssue('minecraft:item', 'betterend:thallasium/repair', { bound: true, members: [] }), null);
  assert.throws(() => tagBindingIssue('minecraft:item', 'betterend:thallasium/repair', { bound: true, members: null }), /no member array/);
});

test('coherently rehashed evidence from another commit cannot be relabeled with the catalogue pin', async t => {
  const temporaryRoot = fileURLToPath(new URL('../.work/tests/', import.meta.url));
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, 'runtime-identity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'upstream'));
  await mkdir(path.join(root, 'evidence'));
  const otherCommit = '1'.repeat(40);
  const fingerprint = '2'.repeat(64);
  const betterEndHash = '3'.repeat(64);
  const exporterHash = '4'.repeat(64);
  const runtime = {
    schemaVersion: 3, complete: true, issues: [], sourceCommit: otherCommit,
    environment: { productionProfile: true, players: 0, minecraftVersion: '26.3', mods: [
      { id: 'betterend', origins: [{ sha256: betterEndHash }] },
      { id: 'betterend_reference_exporter', origins: [{ sha256: exporterHash }] },
    ] },
  };
  const raw = Buffer.from(JSON.stringify(runtime));
  const corpus = gzipSync(raw);
  const manifest = Buffer.from(JSON.stringify({ sourceCommit: otherCommit, sourceFingerprint: fingerprint, artifacts: { betterEnd: { sha256: betterEndHash }, exporter: { sha256: exporterHash } } }));
  const receipt = Buffer.from(JSON.stringify({ sourceCommit: otherCommit, failure: null, exit: { code: 0 }, outputSha256: hashBytes(raw), inputFingerprint: fingerprint }));
  for (const [name, bytes] of [['runtime.json.gz', corpus], ['build.json', manifest], ['receipt.json', receipt]]) await writeFile(path.join(root, 'evidence', name), bytes);
  await writeFile(path.join(root, 'upstream/java-reference.lock.json'), JSON.stringify({
    sourceCommit: SOURCE_COMMIT, sourceFingerprint: fingerprint,
    runtime: { path: 'evidence/runtime.json.gz', sha256: hashBytes(corpus), uncompressedSha256: hashBytes(raw) },
    buildManifest: { path: 'evidence/build.json', sha256: hashBytes(manifest) },
    receipt: { path: 'evidence/receipt.json', sha256: hashBytes(receipt) },
  }));
  await writeFile(path.join(root, 'upstream/java-dependencies.lock.json'), JSON.stringify({ sourceCommit: otherCommit, dependencies: [] }));
  await assert.rejects(loadLockedRuntime(root), /commit differs from the pinned catalogue commit/);
});
