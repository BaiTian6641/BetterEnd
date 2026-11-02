import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseBiomeDeclarations, parseMobDeclarations, parseShapeSnapshot, registrationIndex,
  resolveResourceLayers, resourceIdentity,
} from '../tools/catalogue.mjs';

function resource(scope, root, value) {
  return { scope, resourcePath: 'data/betterend/recipe/example.json', value, source: { path: `${root}/data/betterend/recipe/example.json`, sha256: root } };
}

test('authored resources win packaging but duplicates remain explicit policy violations', () => {
  const authored = resource('main', 'src/main/resources', { count: 1 });
  const generated = resource('main', 'src/main/generated', { count: 2 });
  const optional = resource('optional/compat', 'src/main/generated/resourcepacks/compat', { count: 3 });
  const result = resolveResourceLayers([[authored], [generated], [optional]]);
  assert.equal(result.resources.length, 2);
  assert.equal(result.resources.find(entry => entry.scope === 'main').value.count, 1);
  assert.equal(result.resources.find(entry => entry.scope === 'optional/compat').value.count, 3);
  assert.deepEqual(result.collisions.map(entry => [entry.winner.path, entry.shadowed.path]), [[authored.source.path, generated.source.path]]);
});

test('resource identity includes scope and registry category rather than output item name', () => {
  const recipe = resourceIdentity('data/betterend/recipe/aqua_affinity_book.json');
  assert.equal(recipe.id, 'betterend:aqua_affinity_book');
  assert.equal(recipe.category, 'recipe');
  const metadata = resourceIdentity('data/betterend/wover/worldgen/biome_data/umbrella_jungle.json');
  assert.equal(metadata.category, 'wover/worldgen/biome_data');
  assert.equal(metadata.id, 'betterend:umbrella_jungle');
  const structure = resourceIdentity('data/betterend/structure/village/houses/example.nbt', 'optional/compat');
  assert.equal(structure.scope, 'optional/compat');
  assert.equal(structure.id, 'betterend:village/houses/example');
});

test('enchantment tags retain their registry category and original tag identifiers', () => {
  for (const name of ['in_enchanting_table', 'tradeable']) {
    const tag = resourceIdentity(`data/minecraft/tags/enchantment/${name}.json`);
    assert.equal(tag.category, 'tags/enchantment');
    assert.equal(tag.id, `minecraft:${name}`);
    assert.equal(tag.recognizedCategory, true);
  }
});

test('registration snapshots preserve sentinel and compact values and reject duplicate/malformed IDs', () => {
  const rows = [{ id: 'betterend:crystal', fuel: '-', light: '0..15#4', predicate: 'derived/false' }];
  const index = registrationIndex(rows, 'fixture');
  assert.deepEqual(index.get('betterend:crystal'), rows[0]);
  assert.throws(() => registrationIndex([...rows, rows[0]], 'fixture'), /Duplicate registration/);
  assert.throws(() => registrationIndex([{ id: 'invalid id' }], 'fixture'), /Invalid registration/);
  assert.throws(() => registrationIndex([{ id: 'betterend:crystal', light: 0 }], 'fixture'), /Unexpected registration cell/);
});

test('shape snapshot retains waterlogging, empty collision and out-of-unit collision bounds without inventing defaults', () => {
  const shapes = parseShapeSnapshot([
    'betterend:crystal[age=0,facing=north,waterlogged=true]  shape=[0,0,0|1,1,1] collision=empty',
    'betterend:crystal[age=0,facing=north,waterlogged=false]  shape=[0,0,0|1,1,1] collision=[0,0,0|1,1.5,1]',
  ].join('\n'), new Set(['betterend:crystal']));
  const crystal = shapes.blocks.get('betterend:crystal');
  assert.equal(shapes.totalStates, 2);
  assert.equal(crystal.coverageMode, 'explicit-states');
  assert.deepEqual(crystal.properties.waterlogged, ['false', 'true']);
  assert.equal(crystal.records[0].coverage, 'explicit-state');
  assert.equal(crystal.records[0].collision, 'empty');
  assert.equal(crystal.records[1].collision, '[0,0,0|1,1.5,1]');
  assert.equal(crystal.defaultState, null);
  assert.throws(() => parseShapeSnapshot('betterend:missing  shape=empty collision=empty', new Set()), /unregistered/);
  assert.throws(() => parseShapeSnapshot('betterend:crystal  shape=empty collision=empty\nbetterend:crystal  shape=empty collision=empty', new Set(['betterend:crystal'])), /Duplicate block-state/);
});

test('unqualified shape snapshot rows represent uniform neutral-context coverage distinctly from explicit states and reject mixed forms', () => {
  const shapes = parseShapeSnapshot(
    'betterend:amaranita_hyphae  shape=[0,0,0|1,1,1] collision=[0,0,0|1,1,1]',
    new Set(['betterend:amaranita_hyphae']),
  );
  const hyphae = shapes.blocks.get('betterend:amaranita_hyphae');
  assert.equal(hyphae.coverageMode, 'uniform-all-states');
  assert.equal(hyphae.defaultState, null);
  assert.equal(hyphae.runtimeVerified, false);
  assert.deepEqual(Object.keys(hyphae.properties), []);
  assert.equal(hyphae.auditContext.roundingDecimals, 4);
  assert.equal(hyphae.auditContext.getter, 'net.minecraft.world.level.EmptyBlockGetter.INSTANCE');
  assert.deepEqual(hyphae.records, [{
    coverage: 'uniform-all-states',
    states: null,
    selection: '[0,0,0|1,1,1]',
    collision: '[0,0,0|1,1,1]',
    sourceLine: 1,
  }]);
  assert.throws(
    () => parseShapeSnapshot([
      'betterend:amaranita_hyphae  shape=[0,0,0|1,1,1] collision=[0,0,0|1,1,1]',
      'betterend:amaranita_hyphae[axis=y]  shape=[0,0,0|1,1,1] collision=[0,0,0|1,1,1]',
    ].join('\n'), new Set(['betterend:amaranita_hyphae'])),
    /Contradictory mixed uniform and explicit/,
  );
  assert.throws(
    () => parseShapeSnapshot([
      'betterend:amaranita_hyphae[axis=y]  shape=[0,0,0|1,1,1] collision=[0,0,0|1,1,1]',
      'betterend:amaranita_hyphae  shape=[0,0,0|1,1,1] collision=[0,0,0|1,1,1]',
    ].join('\n'), new Set(['betterend:amaranita_hyphae'])),
    /Contradictory mixed uniform and explicit/,
  );
  assert.throws(
    () => parseShapeSnapshot([
      'betterend:crystal[age=0]  shape=empty collision=empty',
      'betterend:crystal[age=1,waterlogged=false]  shape=empty collision=empty',
    ].join('\n'), new Set(['betterend:crystal'])),
    /Inconsistent state property keys/,
  );
  assert.throws(
    () => parseShapeSnapshot('betterend:crystal  shape=unavailable collision=empty', new Set(['betterend:crystal'])),
    /Unavailable block shape/,
  );
});

test('biome declarations preserve parent relationships and exclude codec registration identifiers', () => {
  const declarations = parseBiomeDeclarations([
    'public static final EndBiomeKey<MainBiome, ?> MAIN = EndBiomeBuilder.createKey("main");',
    'public static final EndBiomeKey<ChildBiome, MainBiome> CHILD = EndBiomeBuilder.createKey("child", MAIN);',
    'BiomeCodecRegistry.register(BetterEnd.C.mk("codec_not_a_biome"), EndBiome.CODEC);',
  ].join('\n'));
  assert.deepEqual(declarations.map(entry => [entry.id, entry.parent]), [['betterend:child', 'betterend:main'], ['betterend:main', null]]);
  assert.throws(() => parseBiomeDeclarations('public static final EndBiomeKey<A, ?> A = unsupportedFactory();'), /unsupported registration/);
  assert.throws(() => parseBiomeDeclarations('public static final EndBiomeKey<A, B> A = EndBiomeBuilder.createKey("a", MISSING);'), /Unknown biome parent/);
});

test('explicit mob extraction does not treat spawn eggs or registry helper methods as additional mobs', () => {
  const declarations = parseMobDeclarations('public static final BCLEntityWrapper<DragonflyEntity> DRAGONFLY = register("dragonfly", MobCategory.AMBIENT);\nEndItems.registerEndEgg("spawn_egg_dragonfly", type, 1, 2);');
  assert.deepEqual(declarations.map(entry => [entry.id, entry.javaType]), [['betterend:dragonfly', 'DragonflyEntity']]);
  assert.throws(() => parseMobDeclarations('public static final BCLEntityWrapper<FishEntity> FISH = anotherFactory();'), /unsupported registration/);
});
