import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertOwnedPath, assertSameInputs, assertRuntimeSource, collectSourceInputs } from '../tools/reference-inputs.mjs';

const temporaryRoot = fileURLToPath(new URL('../.work/tests/', import.meta.url));

async function fixture(t) {
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, 'reference-inputs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('reference source identity detects changed, added and removed inputs despite an unchanged declared commit', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'build.gradle'), 'version = "26.301.2"\n');
  await writeFile(path.join(root, 'src', 'recipe.json'), '{"count":1}\n');
  const expected = await collectSourceInputs(root);
  await mkdir(path.join(root, 'build'));
  await writeFile(path.join(root, 'build', 'classes.bin'), 'owned compiler output');
  assert.deepEqual(await collectSourceInputs(root), expected);
  await writeFile(path.join(root, 'src', 'recipe.json'), '{"count":64}\n');
  assert.throws(() => assertSameInputs([], expected, 'fixture'), /missing build.gradle/);
  assert.throws(() => assertSameInputs(expected.concat(expected[0]), expected, 'fixture'), /duplicate input paths/);
  const changed = await collectSourceInputs(root);
  assert.throws(() => assertSameInputs(changed, expected, 'fixture'), /changed src\/recipe.json/);
  await writeFile(path.join(root, 'src', 'unexpected.java'), 'class Unexpected {}\n');
  const added = await collectSourceInputs(root);
  assert.throws(() => assertSameInputs(added, expected, 'fixture'), /unexpected src\/unexpected.java/);
});

test('reference workspace ownership resolves directory links instead of trusting a lexical prefix', async t => {
  const root = await fixture(t);
  const workspace = path.join(root, 'workspace');
  const foreign = path.join(root, 'foreign');
  await mkdir(workspace);
  await mkdir(foreign);
  const alias = path.join(workspace, 'server');
  await symlink(foreign, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(assertOwnedPath(workspace, alias), /not inside its workspace/);
  await assert.rejects(collectSourceInputs(workspace), /symlink/);
});

test('a matching source label cannot conceal a different loaded BetterEnd artifact', () => {
  const sourceCommit = 'a'.repeat(40);
  const betterEndHash = 'b'.repeat(64);
  const exporterHash = 'c'.repeat(64);
  const manifest = { sourceCommit, artifacts: { betterEnd: { sha256: betterEndHash }, exporter: { sha256: exporterHash } } };
  const runtime = { sourceCommit, environment: { mods: [
    { id: 'betterend', origins: [{ sha256: betterEndHash }] },
    { id: 'betterend_reference_exporter', origins: [{ sha256: exporterHash }] },
  ] } };
  assertRuntimeSource(runtime, manifest, { sourceCommit, dependencies: [] });
  runtime.environment.mods[0].origins[0].sha256 = 'd'.repeat(64);
  assert.throws(() => assertRuntimeSource(runtime, manifest, { sourceCommit, dependencies: [] }), /attested betterend artifact/);
});
