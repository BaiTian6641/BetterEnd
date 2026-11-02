import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  assetKind, assetReferences, buildProvenance, classifyLicense, derivedAssetProvenance,
  parseRestrictedAssets, proposedBinaryDestination,
} from '../tools/provenance.mjs';
import { hashBytes } from '../tools/source-files.mjs';

const restrictedPath = 'src/main/resources/assets/betterend/textures/gui/infusion.png';
const restrictionText = `Some assets use CC BY-NC-SA 4.0. Attribution: Team BetterX.\n * ${restrictedPath}\n`;
const evidence = { code: { path: 'LICENSE' }, assets: { path: 'LICENSE.ASSETS' } };

test('an exact normalized restricted asset cannot inherit the ordinary repository license', () => {
  const restricted = parseRestrictedAssets(restrictionText);
  const listed = classifyLicense(restrictedPath.replaceAll('/', '\\'), restricted, evidence);
  assert.equal(listed.spdx, 'CC-BY-NC-SA-4.0');
  assert.deepEqual(listed.attribution, ['Team BetterX']);
  assert.equal(listed.audit, 'pending');
  const other = classifyLicense('src/main/resources/assets/betterend/icon.png', restricted, evidence);
  assert.equal(other.spdx, 'MIT');
  assert.equal(other.basis, 'repository-license-inheritance');
  assert.equal(other.audit, 'pending');
  assert.throws(() => parseRestrictedAssets('All assets are free.'), /Unrecognized/);
  assert.throws(() => parseRestrictedAssets(`${restrictionText} * ${restrictedPath}\n`), /duplicate/);
});

test('renaming or combining restricted artwork preserves its obligations and byte-bound source identities', () => {
  const restricted = parseRestrictedAssets(restrictionText);
  const original = { source: { path: restrictedPath, sha256: hashBytes('pixels') }, declaredLicense: classifyLicense(restrictedPath, restricted, evidence) };
  const renamed = derivedAssetProvenance('textures/ui/independent_name.png', [original]);
  assert.deepEqual(renamed.licenses, ['CC-BY-NC-SA-4.0']);
  assert.ok(renamed.obligations.includes('noncommercial'));
  assert.equal(renamed.audit, 'pending');
  const changed = derivedAssetProvenance('textures/ui/independent_name.png', [{ ...original, source: { ...original.source, sha256: hashBytes('changed pixels') } }]);
  assert.notEqual(renamed.sources[0].sha256, changed.sources[0].sha256);
  assert.throws(() => derivedAssetProvenance('../outside.png', [original]), /Unsafe/);
  assert.throws(() => derivedAssetProvenance('textures/unattributed.png', []), /no source contributors/);
});

test('destination mapping preserves colliding basenames and separates namespaces and image classes', () => {
  const first = proposedBinaryDestination('betterend/textures/images/infusion_ritual/ritual_finished.png');
  const second = proposedBinaryDestination('betterend/textures/images/eternal_ritual/ritual_finished.png');
  assert.notEqual(first, second);
  assert.equal(proposedBinaryDestination('betterend/textures/block/flavolite.png'), 'textures/blocks/betterend/flavolite.png');
  assert.equal(proposedBinaryDestination('betterend/sounds/music/the-tides-ammil.ogg'), 'sounds/betterend/music/the-tides-ammil.ogg');
  assert.equal(proposedBinaryDestination('betterend/models/block/flavolite.json'), null);
  assert.equal(assetKind('minecraft/optifine/ctm/desktop.ini'), 'non-content-metadata');
  assert.throws(() => proposedBinaryDestination('betterend/textures/block/../other.png'), /Unsafe/);
});

test('typed references distinguish bindings, templates, external models and actual audio files', () => {
  const models = assetReferences('model', { parent: 'bclib:block/anvil', textures: { top: '#side', side: 'betterend:block/flavolite', template: '%texture%' } });
  assert.equal(models[0].resourcePath, 'bclib/models/block/anvil.json');
  assert.equal(models[1].resolution, 'binding');
  assert.equal(models[2].resourcePath, 'betterend/textures/block/flavolite.png');
  assert.equal(models[3].resolution, 'template-parameter');
  const audio = assetReferences('sound-events', { track: { sounds: ['betterend:music/ender_hollow', { name: 'betterend:other_event', type: 'event' }] } });
  assert.equal(audio[0].resourcePath, 'betterend/sounds/music/ender_hollow.ogg');
  assert.equal(audio[1].resolution, 'event-reference');
  const item = assetReferences('item-definition', { model: { type: 'minecraft:special', base: 'betterend:item/chest', model: { type: 'minecraft:chest', texture: 'betterend:dragon_tree' } } });
  assert.deepEqual(item.map(entry => entry.resourcePath), ['betterend/models/item/chest.json']);
});

test('invalid source JSON remains inventoried with a blocking diagnostic rather than silently overwritten', async t => {
  const temporaryRoot = fileURLToPath(new URL('../.work/tests/', import.meta.url));
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(path.join(temporaryRoot, 'provenance-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'src/main/resources/assets/betterend/textures/gui'), { recursive: true });
  await mkdir(path.join(root, 'src/main/resources/assets/colored_lights'), { recursive: true });
  await mkdir(path.join(root, 'src/main/generated/assets'), { recursive: true });
  await writeFile(path.join(root, 'LICENSE'), 'MIT License\nCopyright (c) 2020 paulevsGitch\n');
  await writeFile(path.join(root, 'LICENSE.ASSETS'), restrictionText);
  const pngHeader = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(pngHeader);
  pngHeader.write('IHDR', 12, 'ascii');
  pngHeader.writeUInt32BE(16, 16);
  pngHeader.writeUInt32BE(16, 20);
  await writeFile(path.join(root, restrictedPath), pngHeader);
  const ambiguous = '{"colors":{"same":"red","same":"green"}}';
  const ambiguousPath = 'src/main/resources/assets/colored_lights/light_colors.json';
  await writeFile(path.join(root, ambiguousPath), ambiguous);
  const inventory = await buildProvenance(root);
  const record = inventory.assets.find(asset => asset.source.path === ambiguousPath);
  assert.equal(record.source.sha256, hashBytes(ambiguous));
  assert.equal(record.metadata.jsonIssue.code, 'duplicate-key');
  assert.equal(record.metadata.referenceAnalysis, 'blocked-by-invalid-source-json');
  assert.equal(record.distributionStatus, 'review-required');
  assert.ok(inventory.unresolved.some(issue => issue.code === 'invalid-source-asset-json' && issue.source === ambiguousPath && issue.severity === 'release-blocker'));
});
