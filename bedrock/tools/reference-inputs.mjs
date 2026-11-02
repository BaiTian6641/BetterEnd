import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { materializePinnedSource } from './pinned-source.mjs';
import { SOURCE_COMMIT, compareText, hashFile, inside, sourceFingerprint, sourceRecord, walkFiles } from './source-files.mjs';

export async function assertOwnedPath(workspace, candidate) {
  const root = await realpath(workspace);
  const actual = await realpath(candidate);
  const relative = path.relative(root, actual);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Reference path is not inside its workspace: ${candidate}`);
  return actual;
}

export async function collectSourceInputs(root) {
  const files = [];
  for (const entry of (await readdir(root)).sort(compareText)) {
    // Only Gradle's root output/cache directories are not source inputs.
    if (entry === 'build' || entry === '.gradle') continue;
    files.push(...await walkFiles(root, entry));
  }
  const records = [];
  for (const file of files.sort(compareText)) records.push(await sourceRecord(root, file));
  return records;
}

export function assertSameInputs(actual, expected, subject) {
  const byPath = new Map(expected.map(entry => [entry.path, entry.sha256]));
  if (byPath.size !== expected.length || new Set(actual.map(entry => entry.path)).size !== actual.length) throw new Error(`${subject}: duplicate input paths`);
  const changes = [];
  for (const entry of actual) {
    if (!byPath.has(entry.path)) changes.push(`unexpected ${entry.path}`);
    else if (byPath.get(entry.path) !== entry.sha256) changes.push(`changed ${entry.path}`);
    byPath.delete(entry.path);
  }
  for (const missing of byPath.keys()) changes.push(`missing ${missing}`);
  if (changes.length) throw new Error(`${subject}: ${changes.length} input differences: ${changes.slice(0, 12).join('; ')}`);
}

export async function verifyPinnedInputs(workspace, sourceRoot, commit) {
  if (commit !== SOURCE_COMMIT) throw new Error('Reference source pin does not match the audited port baseline');
  await assertOwnedPath(workspace, sourceRoot);
  const snapshot = await materializePinnedSource(path.resolve(workspace, '..'), workspace, commit);
  try {
    const expected = await collectSourceInputs(snapshot.root);
    assertSameInputs(await collectSourceInputs(sourceRoot), expected, 'Pinned reference source');
    return expected;
  } finally {
    await snapshot.dispose();
  }
}

export async function buildAttestation(workspace, sourceInputs, commit) {
  const sourceRoot = path.join(workspace, '.work/java-reference/source');
  assertSameInputs(await collectSourceInputs(sourceRoot), sourceInputs, 'Source changed during reference build');
  const exporterInputs = [];
  for (const file of ['tools/java-reference.init.gradle', ...await walkFiles(workspace, 'java-exporter/src')]) exporterInputs.push(await sourceRecord(workspace, file));
  const artifacts = {};
  for (const [name, relative] of Object.entries({
    betterEnd: '.work/java-reference/source/build/libs/better-end-26.301.2.jar',
    exporter: '.work/java-reference/exports/betterend-reference-exporter-0.1.0.jar',
    classpath: '.work/java-reference/exports/build-classpath.json',
  })) {
    await assertOwnedPath(workspace, inside(workspace, relative));
    artifacts[name] = await sourceRecord(workspace, relative);
  }
  const classpath = JSON.parse(await readFile(inside(workspace, artifacts.classpath.path), 'utf8'));
  for (const entries of [classpath.compileClasspath, classpath.runtimeClasspath, classpath.pluginClasspath]) {
    for (const entry of entries) {
      const absolute = await assertOwnedPath(workspace, entry.file);
      if (await hashFile(absolute) !== entry.sha256) throw new Error('Resolved classpath changed after Gradle captured it');
      entry.file = path.relative(workspace, absolute).replaceAll('\\', '/');
    }
  }
  return { schemaVersion: 1, sourceCommit: commit, sourceProfile: 'pinned-checked-in-resources-before-datagen-no-vault', sourceFingerprint: sourceFingerprint(sourceInputs), sourceInputs, exporterInputs, artifacts, classpath };
}

export async function verifyBuildForExport(workspace, attempts, commit) {
  const latest = attempts.filter(entry => entry.gateId === 'JAVA-001').at(-1);
  if (latest?.result !== 'pass' || !latest.referenceManifest || !latest.artifacts.some(artifact => artifact.path === latest.referenceManifest)) throw new Error('A successful input-attested reference build is required before export');
  const manifest = JSON.parse(await readFile(inside(workspace, latest.referenceManifest), 'utf8'));
  if (manifest.sourceCommit !== commit || manifest.sourceFingerprint !== sourceFingerprint(manifest.sourceInputs)) throw new Error('Reference build input identity mismatch');
  assertSameInputs(await collectSourceInputs(path.join(workspace, '.work/java-reference/source')), manifest.sourceInputs, 'Reference inputs changed after build');
  for (const entry of [...manifest.exporterInputs, ...Object.values(manifest.artifacts)]) {
    const absolute = await assertOwnedPath(workspace, inside(workspace, entry.path));
    if (await hashFile(absolute) !== entry.sha256) throw new Error(`Reference build artifact/input changed: ${entry.path}`);
  }
  return manifest;
}

export function assertRuntimeSource(runtime, manifest, lock) {
  if (runtime.sourceCommit !== manifest.sourceCommit || runtime.sourceCommit !== lock.sourceCommit) throw new Error('Runtime source declaration mismatch');
  for (const [id, expected] of [['betterend', manifest.artifacts.betterEnd], ['betterend_reference_exporter', manifest.artifacts.exporter], ...lock.dependencies.map(entry => [entry.modId, entry])]) {
    const mod = runtime.environment.mods.find(entry => entry.id === id);
    if (!mod || mod.origins?.length !== 1 || mod.origins[0].sha256 !== expected.sha256) throw new Error(`Runtime does not contain the attested ${id} artifact`);
  }
}
