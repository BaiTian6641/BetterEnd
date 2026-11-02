import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  assertUniquePortablePaths,
  hashBytes,
  inside,
  portableRelativePath,
  readJsonSource,
  sourceFingerprint,
  stableJson,
  walkFiles,
} from '../tools/source-files.mjs';

const temporaryRoot = fileURLToPath(new URL('../.work/tests/', import.meta.url));

async function fixture(t) {
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, 'source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('portable source paths reject traversal, absolute paths and Windows archive hazards', () => {
  for (const candidate of ['../escape', '/absolute', 'C:\\world', 'a/../b', 'a//b', 'a/./b', 'CON.txt', 'a/nul', 'a/trailing.', 'a/trailing ', 'betterend:item', 'a\0b']) {
    assert.throws(() => portableRelativePath(candidate), Error, candidate);
  }
  assert.equal(portableRelativePath('assets\\betterend\\textures\\stone.png'), 'assets/betterend/textures/stone.png');
  assert.equal(inside('/source', 'assets/stone.png'), path.resolve('/source', 'assets/stone.png'));
});

test('archive destinations reject duplicate and case-only collisions without rejecting distinct assets', () => {
  assert.throws(() => assertUniquePortablePaths(['textures/Stone.png', 'textures/stone.png']), /Colliding/);
  assert.throws(() => assertUniquePortablePaths(['textures/stone.png', 'textures\\stone.png']), /Colliding/);
  assert.throws(() => assertUniquePortablePaths(['textures/caf\u00e9.png', 'textures/cafe\u0301.png']), /Colliding/);
  assertUniquePortablePaths(['textures/stone.png', 'textures/stone_normal.png']);
});

test('source JSON retains exact byte provenance and reports malformed input with its path', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'data'));
  const first = '{"result":{"id":"betterend:thallasium_ingot","count":2}}\n';
  await writeFile(path.join(root, 'data', 'recipe.json'), first);
  const before = await readJsonSource(root, 'data/recipe.json');
  assert.deepEqual([before.value.result.id, before.value.result.count], ['betterend:thallasium_ingot', 2]);
  assert.equal(before.source.sha256, hashBytes(Buffer.from(first)));
  await writeFile(path.join(root, 'data', 'recipe.json'), first.replace('2', '3'));
  const after = await readJsonSource(root, 'data/recipe.json');
  assert.notEqual(before.source.sha256, after.source.sha256);
  assert.equal(after.value.result.count, 3);
  await writeFile(path.join(root, 'data', 'recipe.json'), '{invalid}');
  await assert.rejects(readJsonSource(root, 'data/recipe.json'), /Invalid JSON in data\/recipe.json/);
});

test('duplicate decoded keys cannot silently overwrite source translations or recipe fields', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'lang.json'), '{"key":"first","\\u006bey":"second"}');
  await assert.rejects(readJsonSource(root, 'lang.json'), { name: 'SourceJsonError', code: 'duplicate-key', sourcePath: 'lang.json' });
  await writeFile(path.join(root, 'lang.json'), '{"left":{"key":1},"right":{"key":2}}');
  const parsed = await readJsonSource(root, 'lang.json');
  assert.deepEqual([parsed.value.left.key, parsed.value.right.key], [1, 2]);
});

test('directory discovery and fingerprints are independent of creation/input order', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'assets', 'nested'), { recursive: true });
  await writeFile(path.join(root, 'assets', 'z.json'), '{}');
  await writeFile(path.join(root, 'assets', 'nested', 'a.json'), '{}');
  await writeFile(path.join(root, 'assets', 'b.json'), '{}');
  assert.deepEqual(await walkFiles(root, 'assets'), ['assets/b.json', 'assets/nested/a.json', 'assets/z.json']);
  const one = { path: 'a.json', sha256: hashBytes('one') };
  const two = { path: 'b.json', sha256: hashBytes('two') };
  assert.equal(sourceFingerprint([one, two]), sourceFingerprint([two, one]));
  assert.notEqual(sourceFingerprint([one, two]), sourceFingerprint([one, { ...two, sha256: hashBytes('changed') }]));
  assert.throws(() => sourceFingerprint([one, one]), /Duplicate fingerprint source/);
});

test('deterministic JSON preserves array semantics while normalizing object key order', () => {
  assert.equal(stableJson({ b: 2, a: { z: 1, y: [3, 2, 1] } }), stableJson({ a: { y: [3, 2, 1], z: 1 }, b: 2 }));
  assert.deepEqual(JSON.parse(stableJson({ values: [3, 2, 1] })).values, [3, 2, 1]);
  assert.throws(() => stableJson({ value: Number.NaN }), /Nonfinite/);
  assert.throws(() => stableJson({ value: undefined }), /Unsupported/);
});
