import assert from 'node:assert/strict';
import test from 'node:test';
import { compileAllContent } from '../tools/content-compiler.mjs';
import {
  SITE_LAYERS,
  footprintSamples,
  molangAerialMatch,
  molangCaveMatch,
  molangFootprintGuard,
  molangLandRegionIndex,
  molangNearActiveSite,
  molangSiteHere,
  molangSurfaceRegionMatch,
  siteCoords
} from '../tools/placement-molang.mjs';
import {
  NATIVE_CELL_SIZE,
  NATIVE_LAND_SLOT_COUNT,
  NATIVE_LAND_SLOT_RANGES,
  isNativeProtectedColumn,
  nativeAerialRegionIndex,
  nativeCaveRegionIndex,
  nativeChunkInteriorMargin,
  nativeLandRegionForSlot,
  nativeLandSlot,
  nativeSurfaceRegionIndex
} from '../runtime/regions/native-cell-map.js';
import { REGION_CATALOGUE } from '../runtime/regions/region-catalogue.js';
import { createMolangContext, seededRandom } from './helpers/molang.mjs';

// ---------------------------------------------------------------------------
// Synthetic, fully deterministic terrain used by every simulation below.
// ---------------------------------------------------------------------------
function syntheticHeight(x, z) {
  const islandMask = Math.sin(x * 0.0113 + 1) * Math.cos(z * 0.0097 + 2);
  if (islandMask < -0.62) return 0; // void between islands
  return Math.floor(
    62 + 7 * Math.sin(x * 0.031) * Math.cos(z * 0.027) + 3 * Math.sin((x + z) * 0.09)
  );
}
const syntheticNoise = (x, z) => Math.sin(x * 1.7 + z * 0.9) * Math.cos(z * 1.3 - x * 0.4);

function makeContext() {
  return createMolangContext({ heightmap: syntheticHeight, noise: syntheticNoise });
}

const content = await compileAllContent();
const { features, featureRules } = content.entitiesAndFeatures;
const structureMeta = content.mcStructures.structureMeta;

// identifier -> { type, body }
const featureIndex = new Map();
for (const json of features.values()) {
  const type = Object.keys(json).find(key => key.startsWith('minecraft:'));
  featureIndex.set(json[type].description.identifier, { type, body: json[type] });
}
const ruleList = [...featureRules.entries()].map(([file, json]) => ({
  file,
  rule: json['minecraft:feature_rules']
}));

function regionIndexById(id) {
  return REGION_CATALOGUE.findIndex(region => region.id === id);
}

function findCellForRegion(regionId, minDistance = 1300) {
  const target = regionIndexById(regionId);
  const step = 32;
  for (let ring = minDistance; ring < 14000; ring += step) {
    for (let t = -ring; t <= ring; t += step) {
      for (const [x, z] of [[t, -ring], [t, ring], [-ring, t], [ring, t]]) {
        if (nativeSurfaceRegionIndex(x, z) !== target) continue;
        // require a roomy neighbourhood so the simulation window is mostly this biome
        let inside = 0;
        for (let dx = -160; dx <= 160; dx += 80) {
          for (let dz = -160; dz <= 160; dz += 80) {
            if (nativeSurfaceRegionIndex(x + dx, z + dz) === target) inside += 1;
          }
        }
        if (inside >= 20) return [x, z];
      }
    }
  }
  throw new Error(`no cell found for ${regionId}`);
}

// ---------------------------------------------------------------------------
// Feature-graph interpreter (only the node types the compiler emits)
// ---------------------------------------------------------------------------
function pickWeighted(list, rng) {
  const total = list.reduce((sum, entry) => sum + entry[1], 0);
  let roll = rng() * total;
  for (const [id, weight] of list) {
    roll -= weight;
    if (roll < 0) return id;
  }
  return list[list.length - 1][0];
}

function axisValue(spec, rng, ctx, vars) {
  if (typeof spec === 'number') return spec;
  if (typeof spec === 'string') return ctx.molang.evaluate(spec, vars);
  if (spec.distribution === 'uniform') {
    const [lo, hi] = spec.extent;
    return lo + Math.floor(rng() * (hi - lo));
  }
  throw new Error(`unsupported axis ${JSON.stringify(spec)}`);
}

function placeFeature(id, pos, ctx, depth = 0) {
  const node = featureIndex.get(id);
  if (!node || depth > 8) return;
  const { type, body } = node;
  if (type === 'minecraft:weighted_random_feature') {
    placeFeature(pickWeighted(body.features, ctx.rng), pos, ctx, depth + 1);
  } else if (type === 'minecraft:aggregate_feature') {
    for (const child of body.features) placeFeature(child, pos, ctx, depth + 1);
  } else if (type === 'minecraft:scatter_feature') {
    const vars = { worldx: pos.x, worldz: pos.z, originx: ctx.originx, originz: ctx.originz };
    const iterations = Math.floor(ctx.molang.evaluate(body.iterations, vars));
    if (iterations <= 0) return;
    const gridAxes = ['x', 'y', 'z'].filter(axis => body[axis]?.distribution === 'fixed_grid');
    if (gridAxes.length > 0) {
      const extent = axis => {
        const [lo, hi] = body[axis].extent;
        return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      };
      const xs = body.x?.distribution === 'fixed_grid' ? extent('x') : [axisValue(body.x, ctx.rng, ctx, vars)];
      const zs = body.z?.distribution === 'fixed_grid' ? extent('z') : [axisValue(body.z, ctx.rng, ctx, vars)];
      for (const dx of xs) {
        for (const dz of zs) {
          const colVars = { ...vars, worldx: pos.x + dx, worldz: pos.z + dz };
          const dys =
            body.y?.distribution === 'fixed_grid'
              ? extent('y')
              : [axisValue(body.y, ctx.rng, ctx, colVars)];
          for (const dy of dys) {
            placeFeature(body.places_feature, { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz }, ctx, depth + 1);
          }
        }
      }
      return;
    }
    for (let i = 0; i < iterations; i += 1) {
      const dx = axisValue(body.x, ctx.rng, ctx, vars);
      const dy = axisValue(body.y, ctx.rng, ctx, vars);
      const dz = axisValue(body.z, ctx.rng, ctx, vars);
      ctx.anchor = { ...pos };
      placeFeature(body.places_feature, { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz }, ctx, depth + 1);
    }
  } else if (type === 'minecraft:structure_template_feature') {
    const meta = structureMeta.get(body.structure_name.split(':')[1]);
    ctx.placements.push({
      rule: ctx.ruleId,
      structure: body.structure_name,
      corner: { ...pos },
      anchor: ctx.anchor ?? { ...pos },
      size: meta.size,
      offset: meta.originOffset
    });
  } else if (type === 'minecraft:single_block_feature') {
    ctx.blocks += 1;
  }
}

function runRule(entry, chunkX, chunkZ, ctx) {
  const { rule } = entry;
  const originx = chunkX * 16;
  const originz = chunkZ * 16;
  ctx.originx = originx;
  ctx.originz = originz;
  ctx.ruleId = entry.file;
  ctx.anchor = null;
  const dist = rule.distribution;
  const vars = { originx, originz };
  const iterations = Math.floor(ctx.molang.evaluate(dist.iterations, vars));
  for (let i = 0; i < iterations; i += 1) {
    const dx = axisValue(dist.x, ctx.rng, ctx, vars);
    const dz = axisValue(dist.z, ctx.rng, ctx, vars);
    const posVars = { ...vars, worldx: originx + dx, worldz: originz + dz };
    const dy = axisValue(dist.y, ctx.rng, ctx, posVars);
    ctx.anchor = { x: originx + dx, y: dy, z: originz + dz };
    placeFeature(rule.description.places_feature, { x: originx + dx, y: dy, z: originz + dz }, ctx);
  }
  return iterations;
}

function newSimulation(seed) {
  return {
    molang: makeContext(),
    rng: seededRandom(seed),
    placements: [],
    blocks: 0,
    originx: 0,
    originz: 0,
    ruleId: '',
    anchor: null
  };
}

const rulesByPass = pass =>
  ruleList.filter(entry => entry.rule.conditions.placement_pass === pass);

function box(placement) {
  return {
    x0: placement.corner.x,
    x1: placement.corner.x + placement.size[0],
    z0: placement.corner.z,
    z1: placement.corner.z + placement.size[2]
  };
}
const insideBox = (anchor, b) => anchor.x >= b.x0 && anchor.x < b.x1 && anchor.z >= b.z0 && anchor.z < b.z1;
const isMajorRule = file => /_major_(structure|landmark)_rule|_giant_rule/.test(file);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('Java biome picker: compiled Molang and runtime JavaScript agree for surface, sub-biome, aerial and cave maps', () => {
  const molang = makeContext();
  const rng = seededRandom(7);
  const surfaceMatches = [];
  for (let regionIndex = 0; regionIndex <= 17; regionIndex += 1) {
    surfaceMatches.push(molangSurfaceRegionMatch(regionIndex, 'variable.worldx', 'variable.worldz'));
  }
  const aerialMatches = [18, 19, 20].map(i => molangAerialMatch(i, 'variable.worldx', 'variable.worldz'));
  const caveMatches = [21, 22, 23, 24, 25, 26].map(i => molangCaveMatch(i, 'variable.worldx', 'variable.worldz'));
  const landIndexExpr = molangLandRegionIndex('variable.worldx', 'variable.worldz');
  for (let i = 0; i < 4000; i += 1) {
    let x = Math.floor((rng() - 0.5) * 30000);
    let z = Math.floor((rng() - 0.5) * 30000);
    if (isNativeProtectedColumn(x, z)) x = 1200 + Math.abs(x);
    const vars = { worldx: x, worldz: z };
    const expectedSurface = nativeSurfaceRegionIndex(x, z);
    const matched = surfaceMatches.map((expr, index) => (molang.evaluate(expr, vars) ? index : -1)).filter(i => i >= 0);
    assert.deepEqual(matched, [expectedSurface], `surface mismatch at ${x},${z}`);
    const aerialExpected = nativeAerialRegionIndex(x, z);
    const aerialMatched = aerialMatches.map((expr, index) => (molang.evaluate(expr, vars) ? 18 + index : -1)).filter(i => i >= 0);
    assert.deepEqual(aerialMatched, aerialExpected >= 0 ? [aerialExpected] : [], `aerial mismatch at ${x},${z}`);
    const caveExpected = nativeCaveRegionIndex(x, z);
    const caveMatched = caveMatches.map((expr, index) => (molang.evaluate(expr, vars) ? 21 + index : -1)).filter(i => i >= 0);
    assert.deepEqual(caveMatched, caveExpected >= 0 ? [caveExpected] : [], `cave mismatch at ${x},${z}`);
    const landIndex = nativeLandRegionForSlot(nativeLandSlot(x, z));
    assert.equal(molang.evaluate(landIndexExpr, vars), landIndex, `land index mismatch at ${x},${z}`);
  }
  // The protected central island is never decorated.
  assert.equal(molang.evaluate(surfaceMatches[0], { worldx: 0, worldz: 0 }), 0);
});

test('Java biome picker: only land biomes on the surface map, weights follow genChance, sub-biomes are promoted', () => {
  const counts = new Array(27).fill(0);
  const rng = seededRandom(21);
  const samples = 60000;
  for (let i = 0; i < samples; i += 1) {
    const x = Math.floor((rng() - 0.5) * 400000);
    const z = Math.floor((rng() - 0.5) * 400000);
    counts[nativeSurfaceRegionIndex(x, z)] += 1;
  }
  for (let index = 18; index < 27; index += 1) {
    assert.equal(counts[index], 0, `${REGION_CATALOGUE[index].id} must never paint the surface map`);
  }
  const land = Array.from({ length: 15 }, (_, i) => i);
  const dragon = regionIndexById('dragon_graveyards');
  const typical = land.filter(i => i !== dragon && i !== 2 && i !== 3).map(i => counts[i]);
  const mean = typical.reduce((a, b) => a + b, 0) / typical.length;
  for (const value of typical) assert.ok(Math.abs(value - mean) / mean < 0.25, 'equal-genChance biomes are equally likely');
  assert.ok(counts[dragon] < mean * 0.45 && counts[dragon] > mean * 0.08, `dragon_graveyards (0.25 vs 1.25) is rare: ${counts[dragon]} vs ${mean.toFixed(0)}`);
  const promoted = [15, 16, 17].map(i => counts[i]);
  assert.ok(promoted.every(v => v > 0), 'all three sub-biomes appear');
  // ~25% of megalake / dust_wastelands columns are promoted (Java 25% 7-cell promotion)
  const megalakeShare = counts[15] / (counts[15] + counts[3]);
  assert.ok(megalakeShare > 0.15 && megalakeShare < 0.35, `megalake_grove share ${megalakeShare.toFixed(2)}`);
  assert.ok(counts[16] > counts[17], 'painted_mountains (1.25) outnumbers neon_oasis (0.625)');
  assert.equal(NATIVE_LAND_SLOT_COUNT, 71);
  assert.deepEqual([...NATIVE_LAND_SLOT_RANGES.get(dragon)], [55, 56]);
});

test('painter interior fast path is sound: interior chunks never straddle a biome edge', () => {
  const molang = makeContext();
  const nearEdge = content.entitiesAndFeatures.featureRules.get(
    'feature_rules/biome_foggy_mushroomland_surface_interior_rule.json'
  );
  assert.ok(nearEdge, 'interior surface rule exists');
  const iterations = nearEdge['minecraft:feature_rules'].distribution.iterations;
  assert.ok(nativeChunkInteriorMargin() < NATIVE_CELL_SIZE / 2);
  const rng = seededRandom(11);
  let interiorChunks = 0;
  let violations = 0;
  for (let i = 0; i < 2500; i += 1) {
    const chunkX = Math.floor((rng() - 0.5) * 3000);
    const chunkZ = Math.floor((rng() - 0.5) * 3000);
    const originx = chunkX * 16;
    const originz = chunkZ * 16;
    // Force "land" so only the edge test decides.
    const vars = { originx, originz };
    const centreIdx = nativeSurfaceRegionIndex(originx + 8, originz + 8);
    const placed = molang.evaluate(iterations, vars);
    if (placed === 1) {
      interiorChunks += 1;
      for (let dx = 0; dx < 16; dx += 1) {
        for (let dz = 0; dz < 16; dz += 1) {
          if (nativeSurfaceRegionIndex(originx + dx, originz + dz) !== centreIdx) violations += 1;
        }
      }
    }
  }
  // synthetic terrain has land for many chunks; require a meaningful sample.
  assert.ok(interiorChunks > 20, `interior sample too small: ${interiorChunks}`);
  assert.equal(violations, 0);
});

test('footprint guard rejects slopes and void, accepts flat land', () => {
  const molang = makeContext();
  const meta = structureMeta.get('nbt_blossoming_spires_house');
  assert.ok(meta, 'house template exists');
  const guard = molangFootprintGuard({ size: meta.size, originOffset: meta.originOffset, mode: 'structure' });
  const { points, tolerance } = footprintSamples({ size: meta.size, originOffset: meta.originOffset, mode: 'structure' });
  assert.ok(points.length >= 9 && tolerance >= 2);
  const flat = createMolangContext({ heightmap: () => 70, noise: () => 0 });
  assert.equal(flat.evaluate(guard, { worldx: 5, worldz: 5 }), 1);
  const cliff = createMolangContext({ heightmap: (x) => (x > 5 ? 80 : 70), noise: () => 0 });
  assert.equal(cliff.evaluate(guard, { worldx: 5, worldz: 5 }), 0);
  const edge = createMolangContext({ heightmap: (x, z) => (x > 12 ? 0 : 70), noise: () => 0 });
  assert.equal(edge.evaluate(guard, { worldx: 5, worldz: 5 }), 0);
  const tooHigh = createMolangContext({ heightmap: () => 200, noise: () => 0 });
  assert.equal(tooHigh.evaluate(guard, { worldx: 5, worldz: 5 }), 0);
  assert.equal(molang.evaluate('0 + 1', {}), 1);
});

test('major site layers keep sites >= 3 chunks apart and the exclusion window is exact', () => {
  const molang = makeContext();
  const majorIndices = [];
  for (const [i, region] of REGION_CATALOGUE.entries()) {
    if (featureRules.has(`feature_rules/biome_${region.id}_major_structure_rule.json`) ||
      featureRules.has(`feature_rules/biome_${region.id}_major_landmark_rule.json`)) {
      majorIndices.push(i);
    }
  }
  assert.ok(majorIndices.length >= 5, `major biomes: ${majorIndices.join(',')}`);
  const layer = SITE_LAYERS.major;
  const hereExpr = molangSiteHere(layer);
  const nearExpr = molangNearActiveSite(layer, majorIndices, 1);
  const gateRollExpr = siteCoords(layer).gateRoll;

  const span = 90;
  const sites = [];
  const originChunk = [Math.floor(1400 / 16), Math.floor(-900 / 16)];
  for (let cx = originChunk[0]; cx < originChunk[0] + span; cx += 1) {
    for (let cz = originChunk[1]; cz < originChunk[1] + span; cz += 1) {
      const vars = { originx: cx * 16, originz: cz * 16 };
      if (molang.evaluate(hereExpr, vars) === 1) sites.push([cx, cz]);
    }
  }
  assert.ok(sites.length > 100, `expected a dense site grid, got ${sites.length}`);
  for (let i = 0; i < sites.length; i += 1) {
    for (let j = i + 1; j < sites.length; j += 1) {
      const d = Math.max(Math.abs(sites[i][0] - sites[j][0]), Math.abs(sites[i][1] - sites[j][1]));
      assert.ok(d >= 3, `sites ${sites[i]} and ${sites[j]} only ${d} chunks apart`);
    }
  }

  // Brute-force the active sites with plain JavaScript and compare to the compiled exclusion test.
  const active = [];
  for (const [cx, cz] of sites) {
    const vars = { originx: cx * 16, originz: cz * 16 };
    const roll = molang.evaluate(gateRollExpr, vars);
    const idx = nativeSurfaceRegionIndex(cx * 16 + 8, cz * 16 + 8);
    if (roll < layer.gatePercent && !isNativeProtectedColumn(cx * 16 + 8, cz * 16 + 8) && majorIndices.includes(idx)) {
      active.push([cx, cz]);
    }
  }
  let mismatches = 0;
  for (let cx = originChunk[0] + 1; cx < originChunk[0] + span - 1; cx += 1) {
    for (let cz = originChunk[1] + 1; cz < originChunk[1] + span - 1; cz += 1) {
      const vars = { originx: cx * 16, originz: cz * 16 };
      const expected = active.some(([sx, sz]) => Math.max(Math.abs(sx - cx), Math.abs(sz - cz)) <= 1) ? 1 : 0;
      if (molang.evaluate(nearExpr, vars) !== expected) mismatches += 1;
    }
  }
  assert.equal(mismatches, 0);
});

test('Foggy Mushroomland: dense mushroom forest, giants present, nothing grows inside major footprints', () => {
  const [centreX, centreZ] = findCellForRegion('foggy_mushroomland');
  const centreChunkX = Math.floor(centreX / 16);
  const centreChunkZ = Math.floor(centreZ / 16);
  const radius = 14;
  const sim = newSimulation(1234);
  const afterSurface = rulesByPass('after_surface_pass');
  const treeRule = ruleList.find(entry => entry.file === 'feature_rules/biome_foggy_mushroomland_tree_rule.json');
  assert.ok(treeRule, 'foggy tree rule exists');

  let foggyLandChunks = 0;
  let treeAttempts = 0;
  for (let cx = centreChunkX - radius; cx <= centreChunkX + radius; cx += 1) {
    for (let cz = centreChunkZ - radius; cz <= centreChunkZ + radius; cz += 1) {
      const originx = cx * 16;
      const originz = cz * 16;
      const ownsChunk = nativeSurfaceRegionIndex(originx + 8, originz + 8) === regionIndexById('foggy_mushroomland');
      const hasLand = syntheticHeight(originx + 8, originz + 8) >= 50;
      if (ownsChunk && hasLand) {
        foggyLandChunks += 1;
        const vars = { originx, originz };
        treeAttempts += Math.floor(sim.molang.evaluate(treeRule.rule.distribution.iterations, vars));
      }
      for (const entry of afterSurface) runRule(entry, cx, cz, sim);
    }
  }

  const attemptsPerChunk = treeAttempts / Math.max(1, foggyLandChunks);
  assert.ok(foggyLandChunks > 200, `foggy sample too small: ${foggyLandChunks}`);
  // The old rule produced ~0.25 attempts per chunk; Java BetterEnd uses up to 2 (onEveryLayerMax(2)).
  assert.ok(attemptsPerChunk >= 1.0, `foggy tree attempts/chunk too low: ${attemptsPerChunk.toFixed(2)}`);
  assert.ok(attemptsPerChunk <= 3.0, `foggy tree attempts/chunk too high: ${attemptsPerChunk.toFixed(2)}`);

  const mushrooms = sim.placements.filter(p => p.structure.includes('proc_mossy_glowshroom_v'));
  const giants = sim.placements.filter(p => p.structure.includes('proc_giant_mossy_glowshroom_v'));
  assert.ok(mushrooms.length >= foggyLandChunks * 0.5, `mushrooms placed: ${mushrooms.length} over ${foggyLandChunks} chunks`);
  assert.ok(giants.length >= 3, `giant glowshrooms placed: ${giants.length}`);

  // Pre-check guarantee 1: no trunk/plant/pond/minor anchor sits inside a major or giant footprint.
  const majors = sim.placements.filter(p => isMajorRule(p.rule));
  assert.ok(majors.length >= 3, `major placements: ${majors.length}`);
  const majorBoxes = majors.map(box);
  let intruders = 0;
  for (const placement of sim.placements) {
    if (isMajorRule(placement.rule)) continue;
    if (majorBoxes.some(b => insideBox(placement.anchor, b))) intruders += 1;
  }
  assert.equal(intruders, 0, 'non-major anchors found inside major footprints: ' + JSON.stringify(sim.placements.filter(p => !isMajorRule(p.rule) && majorBoxes.some(bx => insideBox(p.anchor, bx))).slice(0, 4).map(p => ({ rule: p.rule, structure: p.structure, anchor: p.anchor }))));

  // Pre-check guarantee 2: major anchors never fall inside one another's footprint.
  for (let i = 0; i < majors.length; i += 1) {
    for (let j = 0; j < majors.length; j += 1) {
      if (i === j) continue;
      assert.ok(!insideBox(majors[i].anchor, majorBoxes[j]), `major ${i} anchored inside major ${j}`);
    }
  }

  // Pre-check guarantee 3: every placed template satisfies its own terrain footprint test.
  for (const placement of sim.placements) {
    if (/small_island|floating_spire/.test(placement.structure)) continue; // aerial: no ground guard
    const guardMode = placement.rule.includes('_giant_rule') || placement.rule.includes('_tree_rule')
      ? 'tree'
      : placement.rule.includes('_nbt_') || isMajorRule(placement.rule)
        ? 'structure'
        : null;
    if (!guardMode) continue;
    const { points, tolerance } = footprintSamples({
      size: placement.size,
      originOffset: placement.offset,
      mode: guardMode
    });
    const anchorHeight = syntheticHeight(placement.anchor.x, placement.anchor.z);
    assert.ok(anchorHeight >= 48 && anchorHeight <= 124, `${placement.structure} anchored off the build window`);
    for (const [dx, dz] of points) {
      const sx = guardMode === 'tree' ? placement.anchor.x + dx : placement.anchor.x + dx;
      const sz = placement.anchor.z + dz;
      const h = syntheticHeight(sx, sz);
      assert.ok(Math.abs(h - anchorHeight) <= tolerance, `${placement.structure} footprint exceeds tolerance`);
    }
  }
});

test('painter cost: interior fast path + land prefilter cut Molang work versus the legacy gate', () => {
  // Pre-optimisation expressions (domain warp with query.noise terms, 5-point gate, per-column cell test).
  const legacyWarpX = (xE, zE) =>
    `(${xE} + math.sin(${zE} * 0.45) * 70 + math.cos((${xE} + ${zE}) * 0.28) * 40 + query.noise(${xE} * 0.012, ${zE} * 0.012) * 28 + query.noise(${xE} * 0.04 + 53, ${zE} * 0.04 + 53) * 8)`;
  const legacyWarpZ = (xE, zE) =>
    `(${zE} + math.cos(${xE} * 0.45) * 70 + math.sin((${zE} - ${xE}) * 0.28) * 40 + query.noise(${xE} * 0.012 + 97, ${zE} * 0.012 + 97) * 28 + query.noise(${xE} * 0.04 + 149, ${zE} * 0.04 + 149) * 8)`;
  const legacyMatch = (xE, zE, idx) =>
    `((math.abs(${xE}) > 1024 || math.abs(${zE}) > 1024) && math.mod(math.floor(math.abs(math.sin(math.floor(${legacyWarpX(xE, zE)} / 320) * 127.1 + math.floor(${legacyWarpZ(xE, zE)} / 320) * 311.7) * 43758.5453)), 27) == ${idx})`;
  const legacyChunkGate = idx =>
    `(${[
      ['variable.originx + 8', 'variable.originz + 8'],
      ['variable.originx', 'variable.originz'],
      ['variable.originx + 15', 'variable.originz + 15'],
      ['variable.originx + 15', 'variable.originz'],
      ['variable.originx', 'variable.originz + 15']
    ].map(([x, z]) => legacyMatch(x, z, idx)).join(' || ')}) ? 1 : 0`;

  const [centreX, centreZ] = findCellForRegion('shadow_forest');
  const baseChunkX = Math.floor(centreX / 16) - 20;
  const baseChunkZ = Math.floor(centreZ / 16) - 20;
  const chunks = 40;

  const weigh = counters => counters.sin + counters.cos + counters.noise * 6 + counters.heightmap;
  const legacy = makeContext();
  const modern = newSimulation(99);

  let legacyCost = 0;
  let modernCost = 0;
  const surfaceRules = rulesByPass('surface_pass');
  for (let cx = baseChunkX; cx < baseChunkX + chunks; cx += 1) {
    for (let cz = baseChunkZ; cz < baseChunkZ + chunks; cz += 1) {
      const vars = { originx: cx * 16, originz: cz * 16 };
      // legacy: evaluate all 27 chunk gates, then 256 per-column cell tests for each matching biome
      legacy.resetCounters();
      for (let idx = 0; idx < 27; idx += 1) {
        const matched = legacy.evaluate(legacyChunkGate(idx), vars);
        if (matched === 1) {
          for (let dx = 0; dx < 16; dx += 1) {
            for (let dz = 0; dz < 16; dz += 1) {
              const colVars = { worldx: vars.originx + dx, worldz: vars.originz + dz };
              legacy.evaluate(`${legacyMatch('variable.worldx', 'variable.worldz', idx)} && query.heightmap(variable.worldx, variable.worldz) >= 16 && (query.noise(variable.worldx * 0.075, variable.worldz * 0.075) + query.noise(variable.worldx * 0.21 + 37, variable.worldz * 0.21 + 71) * 0.35) <= 0.16 ? 3 : 0`, colVars);
            }
          }
        }
      }
      legacyCost += weigh(legacy.counters);

      modern.molang.resetCounters();
      modern.blocks = 0;
      for (const entry of surfaceRules) runRule(entry, cx, cz, modern);
      modernCost += weigh(modern.molang.counters);
    }
  }
  assert.ok(legacyCost > 0 && modernCost > 0);
  const ratio = modernCost / legacyCost;
  console.log(`painter Molang work: legacy=${legacyCost} modern=${modernCost} ratio=${ratio.toFixed(3)}`);
  assert.ok(ratio < 0.5, `expected at least 2x cheaper painting, got ratio ${ratio.toFixed(3)}`);
});

test('rules whose child features read variable.worldx define it through a coordinate expression', () => {
  // Bedrock only populates variable.worldx/worldz for nested features when an ancestor's coordinate
  // expression references them (regression: aerial gates logged "unknown variable 'variable.worldx'").
  const offenders = new Set();
  const walk = (id, defined, file, seen = new Set()) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = featureIndex.get(id);
    if (!node) return;
    const { body } = node;
    if (typeof body.iterations === 'string' && body.iterations.includes('variable.worldx') && !defined) {
      offenders.add(file);
    }
    const definesForChildren =
      defined || ['x', 'y', 'z'].some(key => typeof body[key] === 'string' && body[key].includes('variable.worldx'));
    const children = [
      ...(body.features ?? []).map(c => (Array.isArray(c) ? c[0] : c)),
      body.places_feature
    ].filter(Boolean);
    for (const child of children) walk(child, definesForChildren, file, new Set(seen));
  };
  for (const entry of ruleList) {
    const y = entry.rule.distribution.y;
    walk(entry.rule.description.places_feature, typeof y === 'string' && y.includes('variable.worldx'), entry.file);
  }
  assert.deepEqual([...offenders], []);
});

test('every placement rule is gated, bounded and references real features', () => {
  const missing = [];
  for (const entry of ruleList) {
    const target = entry.rule.description.places_feature;
    if (!featureIndex.has(target)) missing.push(`${entry.file} -> ${target}`);
    const iterations = entry.rule.distribution.iterations;
    assert.ok(typeof iterations === 'number' || /\?/.test(iterations) || /^\d/.test(iterations), `${entry.file} has an unguarded iterations expression`);
  }
  assert.deepEqual(missing, []);
  for (const { body } of featureIndex.values()) {
    if (body.places_feature) assert.ok(featureIndex.has(body.places_feature), `dangling ${body.places_feature}`);
    for (const child of body.features ?? []) {
      const id = Array.isArray(child) ? child[0] : child;
      assert.ok(featureIndex.has(id), `dangling ${id}`);
    }
  }
});

function findAerialColumn(target, minDistance = 1300) {
  const step = 64;
  for (let ring = minDistance; ring < 30000; ring += step) {
    for (let t = -ring; t <= ring; t += step) {
      for (const [x, z] of [[t, -ring], [t, ring], [-ring, t], [ring, t]]) {
        if (nativeAerialRegionIndex(x, z) !== target) continue;
        let inside = 0;
        for (let dx = -320; dx <= 320; dx += 160) {
          for (let dz = -320; dz <= 320; dz += 160) {
            if (nativeAerialRegionIndex(x + dx, z + dz) === target) inside += 1;
          }
        }
        if (inside >= 20) return [x, z];
      }
    }
  }
  throw new Error('no aerial cell');
}

test('Ice Starfield: Java star frequencies over void, including enormous tiled giant stars', () => {
  const [centreX, centreZ] = findAerialColumn(regionIndexById('ice_starfield'));
  const centreChunkX = Math.floor(centreX / 16);
  const centreChunkZ = Math.floor(centreZ / 16);
  const radius = 64;
  const sim = newSimulation(4321);
  // pure void everywhere
  sim.molang = createMolangContext({ heightmap: () => 0, noise: syntheticNoise });
  const starRules = rulesByPass('after_surface_pass').filter(entry => /ice_starfield_star_/.test(entry.file));
  assert.ok(starRules.some(r => /star_small_rule/.test(r.file)) && starRules.some(r => /star_medium_rule/.test(r.file)));
  const tileRules = starRules.filter(r => /star_giant_v\d_t\d_\d_rule/.test(r.file));
  assert.ok(tileRules.length >= 30, `giant star tile rules: ${tileRules.length}`);
  let iceChunks = 0;
  for (let cx = centreChunkX - radius; cx <= centreChunkX + radius; cx += 1) {
    for (let cz = centreChunkZ - radius; cz <= centreChunkZ + radius; cz += 1) {
      const inIce = nativeAerialRegionIndex(cx * 16 + 8, cz * 16 + 8) === regionIndexById('ice_starfield');
      if (inIce) iceChunks += 1;
      for (const entry of starRules) runRule(entry, cx, cz, sim);
    }
  }
  const small = sim.placements.filter(p => /proc_ice_star_small_v/.test(p.structure)).length;
  const medium = sim.placements.filter(p => /proc_ice_star_v\d$/.test(p.structure)).length;
  assert.ok(iceChunks > 3000, `ice sample ${iceChunks}`);
  // Java: small 1/8 chunks, medium 1/15 chunks (not every attempt survives the biome gate at borders)
  assert.ok(Math.abs(small / iceChunks - 1 / 8) < 0.04, `small stars per chunk ${(small / iceChunks).toFixed(3)} (want ~0.125)`);
  assert.ok(Math.abs(medium / iceChunks - 1 / 15) < 0.03, `medium stars per chunk ${(medium / iceChunks).toFixed(3)} (want ~0.067)`);

  // Re-assemble the giant stars from their per-chunk tiles (ignoring stars whose site chunk lies
  // within 2 chunks of the simulated box edge, since part of their 5x5 tile window is outside the box).
  const stars = new Map();
  for (const p of sim.placements.filter(p => /proc_giant_ice_star_v\d_tile_\d_\d/.test(p.structure))) {
    const [, variant, tx, tz] = p.structure.match(/_v(\d)_tile_(\d)_(\d)/).map(Number);
    const chunkX = Math.floor(p.corner.x / 16);
    const chunkZ = Math.floor(p.corner.z / 16);
    const sx = chunkX - (tx - 2);
    const sz = chunkZ - (tz - 2);
    if (Math.abs(sx - centreChunkX) > radius - 2 || Math.abs(sz - centreChunkZ) > radius - 2) continue;
    const siteKey = `${sx},${sz}`;
    if (!stars.has(siteKey)) stars.set(siteKey, { variant, tiles: [], anchorY: new Set() });
    const star = stars.get(siteKey);
    assert.equal(star.variant, variant, 'every tile of one star uses the same variant');
    star.tiles.push({ x0: p.corner.x, x1: p.corner.x + p.size[0], z0: p.corner.z, z1: p.corner.z + p.size[2], blocksY: p.size[1] });
    star.anchorY.add(p.corner.y - p.offset[1]);
  }
  assert.ok(stars.size >= 3, `giant stars assembled: ${stars.size}`);
  for (const [siteKey, star] of stars) {
    const minX = Math.min(...star.tiles.map(t => t.x0));
    const maxX = Math.max(...star.tiles.map(t => t.x1));
    const minZ = Math.min(...star.tiles.map(t => t.z0));
    const maxZ = Math.max(...star.tiles.map(t => t.z1));
    assert.ok(star.tiles.length >= 12, `star ${siteKey} has ${star.tiles.length} tiles`);
    assert.ok(maxX - minX >= 48 && maxZ - minZ >= 48, `star ${siteKey} spans only ${maxX - minX}x${maxZ - minZ}`);
    assert.equal(star.anchorY.size, 1, 'all tiles of a star share one height');
    const y = [...star.anchorY][0];
    assert.ok(y >= 32 && y <= 128, `giant star height ${y}`);
    // every tile stays inside its own chunk (never relies on cross-chunk writes)
    for (const t of star.tiles) {
      assert.ok(Math.floor(t.x0 / 16) === Math.floor((t.x1 - 1) / 16) && Math.floor(t.z0 / 16) === Math.floor((t.z1 - 1) / 16), 'tile inside one chunk');
    }
  }
  const sites = [...stars.keys()].map(k => k.split(',').map(Number));
  for (let i = 0; i < sites.length; i += 1) {
    for (let j = i + 1; j < sites.length; j += 1) {
      assert.ok(Math.max(Math.abs(sites[i][0] - sites[j][0]), Math.abs(sites[i][1] - sites[j][1])) >= 4, 'giant stars are spaced out');
    }
  }
});

test('Lantern Woods: Filalux floats in open air (Java SkyScatterFeature), above the terrain', () => {
  const [centreX, centreZ] = findCellForRegion('lantern_woods');
  const centreChunkX = Math.floor(centreX / 16);
  const centreChunkZ = Math.floor(centreZ / 16);
  const radius = 12;
  const sim = newSimulation(777);
  const skyRule = ruleList.find(entry => entry.file === 'feature_rules/biome_lantern_woods_sky_scatter_rule.json');
  assert.ok(skyRule, 'lantern woods sky scatter rule exists');
  let landChunks = 0;
  for (let cx = centreChunkX - radius; cx <= centreChunkX + radius; cx += 1) {
    for (let cz = centreChunkZ - radius; cz <= centreChunkZ + radius; cz += 1) {
      const owns = nativeSurfaceRegionIndex(cx * 16 + 8, cz * 16 + 8) === regionIndexById('lantern_woods');
      if (owns && syntheticHeight(cx * 16 + 8, cz * 16 + 8) >= 50) landChunks += 1;
      runRule(skyRule, cx, cz, sim);
    }
  }
  const lanterns = sim.placements.filter(p => /proc_filalux_v/.test(p.structure));
  assert.ok(landChunks > 80, `lantern woods sample ${landChunks}`);
  const perChunk = lanterns.length / landChunks;
  assert.ok(perChunk >= 6 && perChunk <= 20, `filalux per chunk ${perChunk.toFixed(1)} (Java ~13)`);
  for (const lantern of lanterns) {
    const ground = syntheticHeight(lantern.anchor.x, lantern.anchor.z);
    assert.ok(lantern.anchor.y >= ground + 6, `filalux at y=${lantern.anchor.y} sits above terrain ${ground}`);
    assert.ok(lantern.anchor.y <= 192 + 10, `filalux height ${lantern.anchor.y}`);
  }
  const heights = lanterns.map(p => p.anchor.y - syntheticHeight(p.anchor.x, p.anchor.z));
  assert.ok(Math.max(...heights) - Math.min(...heights) > 40, 'lanterns spread over many heights, not one layer');
});

test('32-bit float + LUT sin (Bedrock C++ Molang VM) agrees 100% with 64-bit JS on site coords and cell hashes', () => {
  const f = Math.fround;
  const SIN_TABLE = new Float32Array(65536);
  for (let i = 0; i < 65536; i += 1) SIN_TABLE[i] = f(Math.sin((i * Math.PI * 2) / 65536));
  const mceSinDeg = deg => SIN_TABLE[Math.trunc(f(f(deg) * f(Math.PI / 180) * f(10430.378))) & 65535];
  const M32 = {
    sin: mceSinDeg,
    cos: deg => mceSinDeg(f(deg + 90)),
    floor: x => Math.floor(f(x)),
    abs: x => f(Math.abs(f(x))),
    max: Math.max,
    min: Math.min,
    pow: (a, b) => f(Math.pow(f(a), f(b))),
    mod: (a, b) => f(f(a) % f(b)),
    clamp: (v, lo, hi) => f(Math.max(f(lo), Math.min(f(hi), f(v)))),
  };
  const compile32 = expr => {
    const js = String(expr)
      .replace(/\bvariable\.(\w+)/g, 'V.$1')
      .replace(/\bmath\.(\w+)/g, 'M.$1');
    // eslint-disable-next-line no-new-func
    return new Function('V', 'M', `return (${js});`);
  };
  const molang64 = makeContext();
  for (const layer of Object.values(SITE_LAYERS)) {
    const sc = siteCoords(layer);
    const fnPx = compile32(sc.px);
    const fnPz = compile32(sc.pz);
    const fnGate = compile32(sc.gateRoll);
    const fnKind = compile32(sc.kindRoll);
    const fnPick = compile32(sc.pickHash);
    for (let bx = -20; bx <= 20; bx += 4) {
      for (let bz = -20; bz <= 20; bz += 4) {
        const vars = { originx: bx * layer.cell * 16, originz: bz * layer.cell * 16 };
        assert.equal(fnPx(vars, M32), molang64.evaluate(sc.px, vars), `${layer.id} px at ${bx},${bz}`);
        assert.equal(fnPz(vars, M32), molang64.evaluate(sc.pz, vars), `${layer.id} pz at ${bx},${bz}`);
        assert.equal(fnGate(vars, M32), molang64.evaluate(sc.gateRoll, vars), `${layer.id} gate at ${bx},${bz}`);
        assert.equal(fnKind(vars, M32), molang64.evaluate(sc.kindRoll, vars), `${layer.id} kind at ${bx},${bz}`);
        assert.equal(fnPick(vars, M32), molang64.evaluate(sc.pickHash, vars), `${layer.id} pick at ${bx},${bz}`);
      }
    }
  }
});

