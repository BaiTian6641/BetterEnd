/**
 * Molang builders shared by `content-compiler.mjs` (which emits the native feature rules) and
 * `tests/placement.test.mjs` (which evaluates the very same expressions in JavaScript to prove
 * the placement guarantees).
 *
 * Everything is pure string construction: Bedrock feature-rule `iterations` and coordinate
 * expressions cannot declare helper variables, so each expression is fully inlined.
 */

import {
  NATIVE_AERIAL_CELL_SIZE,
  NATIVE_AERIAL_COUNT,
  NATIVE_AERIAL_FIRST_INDEX,
  NATIVE_AERIAL_GATE_PERCENT,
  NATIVE_AERIAL_HASH,
  NATIVE_CAVE_CELL_SIZE,
  NATIVE_CAVE_COUNT,
  NATIVE_CAVE_FIRST_INDEX,
  NATIVE_CAVE_GATE_PERCENT,
  NATIVE_CAVE_HASH,
  NATIVE_CELL_HASH_SCALE,
  NATIVE_CELL_HASH_X,
  NATIVE_CELL_HASH_Z,
  NATIVE_CELL_SIZE,
  NATIVE_LAND_SLOT_COUNT,
  NATIVE_LAND_SLOT_RANGES,
  NATIVE_PROTECTED_HALF_EXTENT,
  NATIVE_REGION_COUNT,
  NATIVE_SUBCELL_SIZE,
  NATIVE_SUB_BIOME_PARENTS,
  NATIVE_SUB_BIOME_PROMOTION_PERCENT,
  NATIVE_SUB_HASH_PHASE,
  NATIVE_SUB_HASH_X,
  NATIVE_SUB_HASH_Z,
  NATIVE_WARP_X_TERMS,
  NATIVE_WARP_Z_TERMS,
  nativeChunkInteriorMargin
} from '../runtime/regions/native-cell-map.js';

// ---------------------------------------------------------------------------
// Biome cell map
// ---------------------------------------------------------------------------

function sinTerm([a, b, amplitude, frequency, phase], xE, zE) {
  const parts = [];
  if (a !== 0) parts.push(`${a} * (${xE})`);
  if (b !== 0) parts.push(`${b} * (${zE})`);
  return `math.sin(${frequency} * (${parts.join(' + ')}) + ${phase}) * ${amplitude}`;
}

export function molangWarpX(xE, zE) {
  return `((${xE}) + (${NATIVE_WARP_X_TERMS.map(term => sinTerm(term, xE, zE)).join(' + ')}))`;
}

export function molangWarpZ(xE, zE) {
  return `((${zE}) + (${NATIVE_WARP_Z_TERMS.map(term => sinTerm(term, xE, zE)).join(' + ')}))`;
}

/**
 * Exact-integer folded hash of integer expressions `(ixE, izE)` in `0 .. 996`, mirroring
 * `nativeIntHash` in `runtime/regions/native-cell-map.js`. Because every intermediate value is an
 * integer `< 2^21` with no `math.sin`, 32-bit float Molang and 64-bit double JS agree bit-for-bit.
 */
export function molangIntHash(ixE, izE, saltA, saltB, saltC = 0) {
  const A = (Math.round(Math.abs(saltA) * 10) % 499) || 173;
  const B = (Math.round(Math.abs(saltB) * 10) % 491) || 311;
  const C = Math.round(Math.abs(saltC) * 10) % 4093;
  const u = `math.mod(math.abs(${ixE} * ${A} + ${izE} * ${B} + ${C}), 4093)`;
  const v = `math.mod(math.abs(${u} * 613 - 1254505), 2039)`;
  return `math.mod(math.abs(${v} * 733 - 747293), 997)`;
}

export function molangCellHash(cellXE, cellZE) {
  return molangIntHash(cellXE, cellZE, NATIVE_CELL_HASH_X, NATIVE_CELL_HASH_Z, 0);
}

/** Region-catalogue index (0..26) owning block column `(xE, zE)`. */
export function molangRegionIndex(xE, zE) {
  const cellX = `math.floor(${molangWarpX(xE, zE)} / ${NATIVE_CELL_SIZE})`;
  const cellZ = `math.floor(${molangWarpZ(xE, zE)} / ${NATIVE_CELL_SIZE})`;
  return `math.mod(${molangCellHash(cellX, cellZ)}, ${NATIVE_REGION_COUNT})`;
}

/** True outside the protected central dragon island. */
export function molangOuterGuard(xE, zE) {
  return `(math.abs(${xE}) > ${NATIVE_PROTECTED_HALF_EXTENT} || math.abs(${zE}) > ${NATIVE_PROTECTED_HALF_EXTENT})`;
}

export function molangCellMatch(xE, zE, regionIndex) {
  return `(${molangOuterGuard(xE, zE)} && ${molangRegionIndex(xE, zE)} == ${regionIndex})`;
}

// --- Java biome-picker model (surface / sub-biome / aerial / cave maps) ---------------------------

/** Land-biome picker slot (0 .. 70) of the base lattice cell owning `(xE, zE)`. */
export function molangLandSlot(xE, zE) {
  const cellX = `math.floor(${molangWarpX(xE, zE)} / ${NATIVE_CELL_SIZE})`;
  const cellZ = `math.floor(${molangWarpZ(xE, zE)} / ${NATIVE_CELL_SIZE})`;
  return `math.mod(${molangCellHash(cellX, cellZ)}, ${NATIVE_LAND_SLOT_COUNT})`;
}

/** Hash of the sub-biome lattice cell (128 blocks) owning `(xE, zE)`. */
export function molangSubHash(xE, zE) {
  const cellX = `math.floor(${molangWarpX(xE, zE)} / ${NATIVE_SUBCELL_SIZE})`;
  const cellZ = `math.floor(${molangWarpZ(xE, zE)} / ${NATIVE_SUBCELL_SIZE})`;
  return molangIntHash(cellX, cellZ, NATIVE_SUB_HASH_X, NATIVE_SUB_HASH_Z, NATIVE_SUB_HASH_PHASE);
}

/**
 * Catalogue index of the land biome (0..14, parents not promoted) owning `(xE, zE)`, built as a
 * slot-range ternary chain so the (long) slot expression is evaluated lazily and mostly once.
 */
export function molangLandRegionIndex(xE, zE) {
  const slot = molangLandSlot(xE, zE);
  const groups = [];
  for (const [regionIndex, [lo, hi]] of NATIVE_LAND_SLOT_RANGES) {
    const last = groups[groups.length - 1];
    const width = hi - lo;
    if (last && last.width === width && last.width > 1 && last.nextRegion === regionIndex) {
      last.hi = hi;
      last.nextRegion += 1;
    } else {
      groups.push({ lo, hi, width, firstRegion: regionIndex, nextRegion: regionIndex + 1 });
    }
  }
  let expression = '0';
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const { lo, hi, width, firstRegion } = groups[i];
    const value = width === 1 ? `${firstRegion}` : `${firstRegion} + math.floor((${slot} - ${lo}) / ${width})`;
    expression = i === groups.length - 1 ? `(${value})` : `(${slot} < ${hi} ? ${value} : ${expression})`;
  }
  return expression;
}

/**
 * Surface-map membership of region `regionIndex` (land biome or promoted sub-biome) at column
 * `(xE, zE)`, mirroring `nativeSurfaceRegionIndex` exactly.
 */
export function molangSurfaceRegionMatch(regionIndex, xE, zE) {
  const guard = molangOuterGuard(xE, zE);
  const slotIn = (lo, hi) => {
    const slot = molangLandSlot(xE, zE);
    return hi - lo === 1 ? `${slot} == ${lo}` : `${slot} >= ${lo} && ${slot} < ${hi}`;
  };
  const baseRange = NATIVE_LAND_SLOT_RANGES.get(regionIndex);
  if (baseRange) {
    const promotable = NATIVE_SUB_BIOME_PARENTS[regionIndex];
    const notPromoted = promotable
      ? ` && math.mod(${molangSubHash(xE, zE)}, 100) >= ${NATIVE_SUB_BIOME_PROMOTION_PERCENT}`
      : '';
    return `(${guard} && ${slotIn(baseRange[0], baseRange[1])}${notPromoted})`;
  }
  for (const [parentText, subs] of Object.entries(NATIVE_SUB_BIOME_PARENTS)) {
    if (!subs.includes(regionIndex)) continue;
    const parentRange = NATIVE_LAND_SLOT_RANGES.get(Number(parentText));
    const hash = molangSubHash(xE, zE);
    let pick = '';
    if (subs.length > 1) {
      const dustPick = `math.mod(math.floor(${molangSubHash(xE, zE)} / 100), 3) == 0`;
      pick = regionIndex === subs[1] ? ` && ${dustPick}` : ` && !(${dustPick})`;
    }
    return `(${guard} && ${slotIn(parentRange[0], parentRange[1])} && math.mod(${hash}, 100) < ${NATIVE_SUB_BIOME_PROMOTION_PERCENT}${pick})`;
  }
  return '0';
}

function warpedLatticeHash(xE, zE, size, hashCfg, phase) {
  const cellX = `math.floor(${molangWarpX(xE, zE)} / ${size})`;
  const cellZ = `math.floor(${molangWarpZ(xE, zE)} / ${size})`;
  return molangIntHash(cellX, cellZ, hashCfg.x, hashCfg.z, phase);
}

/** Aerial (void) biome map membership: Ice Starfield / Flower Islets / Waterfall Ponds. */
export function molangAerialMatch(regionIndex, xE, zE) {
  const gate = warpedLatticeHash(xE, zE, NATIVE_AERIAL_CELL_SIZE, NATIVE_AERIAL_HASH, NATIVE_AERIAL_HASH.gatePhase);
  const pick = warpedLatticeHash(xE, zE, NATIVE_AERIAL_CELL_SIZE, NATIVE_AERIAL_HASH, NATIVE_AERIAL_HASH.phase);
  return `(${molangOuterGuard(xE, zE)} && math.mod(${gate}, 100) < ${NATIVE_AERIAL_GATE_PERCENT} && math.mod(${pick}, ${NATIVE_AERIAL_COUNT}) == ${regionIndex - NATIVE_AERIAL_FIRST_INDEX})`;
}

/** Cave biome map membership (six cave biomes, grotto structures inside land). */
export function molangCaveMatch(regionIndex, xE, zE) {
  const gate = warpedLatticeHash(xE, zE, NATIVE_CAVE_CELL_SIZE, NATIVE_CAVE_HASH, NATIVE_CAVE_HASH.gatePhase);
  const pick = warpedLatticeHash(xE, zE, NATIVE_CAVE_CELL_SIZE, NATIVE_CAVE_HASH, NATIVE_CAVE_HASH.phase);
  return `(${molangOuterGuard(xE, zE)} && math.mod(${gate}, 100) < ${NATIVE_CAVE_GATE_PERCENT} && math.mod(${pick}, ${NATIVE_CAVE_COUNT}) == ${regionIndex - NATIVE_CAVE_FIRST_INDEX})`;
}

/** Membership test for any region, routed to the map its layer uses. */
export function molangRegionMatch(region, regionIndex, xE, zE) {
  if (region.layer === 'aerial') return molangAerialMatch(regionIndex, xE, zE);
  if (region.layer === 'cave') return molangCaveMatch(regionIndex, xE, zE);
  return molangSurfaceRegionMatch(regionIndex, xE, zE);
}

export const CHUNK_CENTER_X = 'variable.originx + 8';
export const CHUNK_CENTER_Z = 'variable.originz + 8';

/** Five-point chunk membership test (centre + four corners) used by the border painter. */
export function molangChunkAnyMatch(matchAt) {
  const points = [
    [CHUNK_CENTER_X, CHUNK_CENTER_Z],
    ['variable.originx', 'variable.originz'],
    ['variable.originx + 15', 'variable.originz + 15'],
    ['variable.originx + 15', 'variable.originz'],
    ['variable.originx', 'variable.originz + 15']
  ];
  return `(${points.map(([x, z]) => matchAt(x, z)).join(' || ')})`;
}

/**
 * True when the chunk centre is within the drift margin of an edge of any of the given lattices,
 * i.e. the chunk may straddle two cells and needs the exact per-column test.
 */
export function molangChunkNearCellEdge(sizes = [NATIVE_CELL_SIZE]) {
  const margin = nativeChunkInteriorMargin();
  const wx = molangWarpX(CHUNK_CENTER_X, CHUNK_CENTER_Z);
  const wz = molangWarpZ(CHUNK_CENTER_X, CHUNK_CENTER_Z);
  const tests = sizes.flatMap(size => {
    const half = size / 2;
    const limit = half - margin;
    if (limit <= 0) throw new Error(`lattice ${size} is too small for the drift margin ${margin}`);
    const fraction = warped => `(${warped} - math.floor(${warped} / ${size}) * ${size})`;
    return [`math.abs(${fraction(wx)} - ${half}) > ${limit}`, `math.abs(${fraction(wz)} - ${half}) > ${limit}`];
  });
  return `(${tests.join(' || ')})`;
}

/** Cheap "is there any land in this chunk" prefilter (nine heightmap probes). */
export function molangChunkHasLand(minY = 16) {
  const offsets = [2, 8, 13];
  const probes = [];
  for (const dx of offsets) {
    for (const dz of offsets) {
      probes.push(`query.heightmap(variable.originx + ${dx}, variable.originz + ${dz}) >= ${minY}`);
    }
  }
  return `(${probes.join(' || ')})`;
}

/** True when the whole 3x3-chunk area around this chunk is void (floating features may spawn). */
export function molangVoidAround(maxY = 16, chunkDx = 0, chunkDz = 0) {
  // `chunkDx/chunkDz` re-centre the 3x3 window on the chunk `(-chunkDx, -chunkDz)` away, i.e. on the
  // site chunk of a multi-chunk structure when evaluated from one of its tiles.
  const offsets = [-8, 8, 24];
  const probes = [];
  for (const dx of offsets) {
    for (const dz of offsets) {
      const ox = dx - chunkDx * 16;
      const oz = dz - chunkDz * 16;
      const x = ox < 0 ? `variable.originx - ${-ox}` : `variable.originx + ${ox}`;
      const z = oz < 0 ? `variable.originz - ${-oz}` : `variable.originz + ${oz}`;
      probes.push(`query.heightmap(${x}, ${z}) < ${maxY}`);
    }
  }
  return `(${probes.join(' && ')})`;
}

// ---------------------------------------------------------------------------
// Chunk hashes and spaced "site" grids
// ---------------------------------------------------------------------------

export const CHUNK_X = 'math.floor(variable.originx / 16)';
export const CHUNK_Z = 'math.floor(variable.originz / 16)';

export function molangChunkHash(cxE, czE, [saltA, saltB, saltC]) {
  return molangIntHash(cxE, czE, saltA, saltB, saltC);
}

export function chunkOffsetExpr(base, delta) {
  if (delta === 0) return base;
  return delta > 0 ? `(${base} + ${delta})` : `(${base} - ${-delta})`;
}

/**
 * A spaced site layer places at most one site per `cell x cell` chunk block, at a hashed chunk
 * `innerMin .. innerMin + innerSpan - 1` inside that block. Because `innerMin >= 1` and the
 * outermost row/column of every block is always empty, a 3x3-chunk exclusion window around any
 * chunk can only ever contain the site of the chunk's *own* block - one evaluation, never four.
 */
export const SITE_LAYERS = Object.freeze({
  major: Object.freeze({
    id: 'major',
    cell: 6,
    innerMin: 1,
    innerSpan: 4,
    gatePercent: 45,
    salts: Object.freeze({
      x: [173.3, 91.7, 17.1],
      z: [211.9, 57.3, 43.9],
      gate: [89.1, 301.3, 7.7],
      kind: [113.5, 257.9, 29.3],
      pick: [59.9, 149.1, 71.3]
    })
  }),
  /** Dense, widely-spaced layer for a biome's signature giant (Foggy Mushroomland giant glowshrooms). */
  giant: Object.freeze({
    id: 'giant',
    cell: 5,
    innerMin: 1,
    innerSpan: 3,
    gatePercent: 80,
    salts: Object.freeze({
      x: [151.3, 63.7, 19.3],
      z: [229.1, 83.9, 47.3],
      gate: [97.9, 283.1, 11.9],
      kind: [127.7, 241.3, 33.1],
      pick: [53.3, 163.9, 77.9]
    })
  }),
  star: Object.freeze({
    id: 'star',
    cell: 4,
    innerMin: 1,
    innerSpan: 2,
    gatePercent: 70,
    salts: Object.freeze({
      x: [131.9, 77.3, 23.9],
      z: [167.1, 101.9, 61.1],
      gate: [193.7, 47.9, 13.1],
      kind: [71.9, 223.1, 37.7],
      pick: [43.1, 181.7, 83.3]
    })
  }),
  /**
   * Java `GiantIceStarStructure` placement: `randomPlacement(spacing 16, separation 8)` = one attempt per
   * 16x16-chunk region at a random chunk 4..11 inside it (stars are 40-70 blocks across).
   */
  giantStar: Object.freeze({
    id: 'giantStar',
    cell: 16,
    innerMin: 4,
    innerSpan: 8,
    gatePercent: 100,
    salts: Object.freeze({
      x: [199.1, 53.9, 13.7],
      z: [101.3, 167.9, 27.1],
      gate: [73.1, 211.3, 5.3],
      kind: [97.7, 131.3, 39.7],
      pick: [157.3, 29.9, 63.1]
    })
  }),
  /** Floating islands in void biomes (Flower Islets, Waterfall Ponds): one 21x21 island per block. */
  island: Object.freeze({
    id: 'island',
    cell: 5,
    innerMin: 1,
    innerSpan: 3,
    gatePercent: 65,
    salts: Object.freeze({
      x: [181.3, 109.7, 29.9],
      z: [139.1, 71.3, 53.9],
      gate: [211.7, 61.1, 19.7],
      kind: [103.3, 197.9, 41.3],
      pick: [67.7, 127.3, 91.9]
    })
  })
});

export function siteCoords(layer, cxE = CHUNK_X, czE = CHUNK_Z) {
  const siteCellX = `math.floor(${cxE} / ${layer.cell})`;
  const siteCellZ = `math.floor(${czE} / ${layer.cell})`;
  const hashAt = salts => molangChunkHash(siteCellX, siteCellZ, salts);
  const px = `(${siteCellX} * ${layer.cell} + ${layer.innerMin} + math.mod(${hashAt(layer.salts.x)}, ${layer.innerSpan}))`;
  const pz = `(${siteCellZ} * ${layer.cell} + ${layer.innerMin} + math.mod(${hashAt(layer.salts.z)}, ${layer.innerSpan}))`;
  return {
    px,
    pz,
    gateRoll: `math.mod(${hashAt(layer.salts.gate)}, 100)`,
    kindRoll: `math.mod(${hashAt(layer.salts.kind)}, 100)`,
    pickHash: hashAt(layer.salts.pick)
  };
}

/** True when the current chunk is the site chunk of its own block. */
export function molangSiteHere(layer, chunkDx = 0, chunkDz = 0) {
  // With a non-zero offset: "the site chunk is `chunkDx` chunks west / `chunkDz` north of this one".
  const cxE = chunkOffsetExpr(CHUNK_X, -chunkDx);
  const czE = chunkOffsetExpr(CHUNK_Z, -chunkDz);
  const { px, pz } = siteCoords(layer, cxE, czE);
  return `(${cxE} == ${px} && ${czE} == ${pz})`;
}

/** True when the layer's site chunk lies within `radius` chunks (Chebyshev) of `(cxE, czE)`. */
export function molangSiteWithin(layer, cxE, czE, radius = 1) {
  if (radius > layer.innerMin) {
    throw new Error(`site window radius ${radius} exceeds innerMin ${layer.innerMin} of layer ${layer.id}`);
  }
  const { px, pz } = siteCoords(layer, cxE, czE);
  return `(math.abs(${px} - ${cxE}) <= ${radius} && math.abs(${pz} - ${czE}) <= ${radius})`;
}

/**
 * Whether the layer's site in the block owning chunk `(cxE, czE)` is *active*: its block-column
 * centre is outside the protected island, belongs to a biome in `activeRegionIndices`, and wins the
 * layer's gate roll. The region test is a bit-mask lookup so the (long) region expression is
 * inlined exactly once.
 */
export function molangSiteActive(layer, activeRegionIndices, cxE = CHUNK_X, czE = CHUNK_Z) {
  if (activeRegionIndices.length === 0) return '0';
  const maxIndex = Math.max(...activeRegionIndices);
  const minIndex = Math.min(...activeRegionIndices);
  if (maxIndex - minIndex >= 24) {
    throw new Error('active region mask exceeds the 24 exact float32 bits');
  }
  const mask = activeRegionIndices.reduce((bits, index) => bits + 2 ** (index - minIndex), 0);
  const { px, pz, gateRoll } = siteCoords(layer, cxE, czE);
  const siteX = `(${px} * 16 + 8)`;
  const siteZ = `(${pz} * 16 + 8)`;
  const regionIndex = molangLandRegionIndex(siteX, siteZ);
  return `(${gateRoll} < ${layer.gatePercent} && ${molangOuterGuard(siteX, siteZ)} && math.mod(math.floor(${mask} / math.pow(2, ${regionIndex} - ${minIndex})), 2) == 1)`;
}

/** Exclusion expression: an active site of `layer` lies within `radius` chunks of this chunk. */
export function molangNearActiveSite(layer, activeRegionIndices, radius = 1) {
  if (activeRegionIndices.length === 0) return '0';
  return `(${molangSiteWithin(layer, CHUNK_X, CHUNK_Z, radius)} && ${molangSiteActive(layer, activeRegionIndices)})`;
}

// ---------------------------------------------------------------------------
// Terrain footprint pre-checks
// ---------------------------------------------------------------------------

export const FOOTPRINT_MIN_Y = 48;
export const FOOTPRINT_MAX_Y = 124;

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

function axisSamples(offset, size) {
  if (size <= 3) return [offset + Math.floor(size / 2)];
  const count = size >= 21 ? 5 : size >= 9 ? 3 : 2;
  const lo = offset + 1;
  const hi = offset + size - 2;
  const values = new Set();
  for (let i = 0; i < count; i += 1) {
    values.add(Math.round(lo + ((hi - lo) * i) / (count - 1)));
  }
  return [...values].sort((a, b) => a - b);
}

/**
 * Describes the terrain samples a template's footprint must pass (`mode`: `tree`, `structure` or
 * `pond`). Returned as plain data so the test-suite can re-verify placements independently.
 */
export function footprintSamples({ size, originOffset, mode }) {
  const [sx, , sz] = size;
  const [ox, , oz] = originOffset;
  if (mode === 'tree') {
    const radius = clamp(Math.floor(Math.min(sx, sz) / 4), 1, 4);
    const points = [
      [radius, 0], [-radius, 0], [0, radius], [0, -radius],
      [radius, radius], [-radius, -radius], [radius, -radius], [-radius, radius]
    ];
    return { points, tolerance: radius >= 3 ? 4 : 3 };
  }
  const xs = axisSamples(ox, sx);
  const zs = axisSamples(oz, sz);
  const points = [];
  for (const x of xs) for (const z of zs) points.push([x, z]);
  const tolerance =
    mode === 'pond' ? 2 : clamp(Math.round(Math.max(sx, sz) / 5), 2, 6);
  return { points, tolerance };
}

/**
 * `iterations` expression for a `structure_template_feature` placement scatter: 1 only when the
 * anchor column is on land inside the build window and every footprint sample stays within the
 * mode's height tolerance of the anchor.
 */
export function molangFootprintGuard({ size, originOffset, mode }) {
  const { points, tolerance } = footprintSamples({ size, originOffset, mode });
  const anchor = 'query.heightmap(variable.worldx, variable.worldz)';
  const checks = [`${anchor} >= ${FOOTPRINT_MIN_Y}`, `${anchor} <= ${FOOTPRINT_MAX_Y}`];
  for (const [dx, dz] of points) {
    if (dx === 0 && dz === 0) continue;
    const sampleX = dx === 0 ? 'variable.worldx' : dx > 0 ? `variable.worldx + ${dx}` : `variable.worldx - ${-dx}`;
    const sampleZ = dz === 0 ? 'variable.worldz' : dz > 0 ? `variable.worldz + ${dz}` : `variable.worldz - ${-dz}`;
    checks.push(`math.abs(query.heightmap(${sampleX}, ${sampleZ}) - ${anchor}) <= ${tolerance}`);
  }
  return `${checks.join(' && ')} ? 1 : 0`;
}

// ---------------------------------------------------------------------------
// Vegetation density
// ---------------------------------------------------------------------------

/**
 * Number of tree attempts for a chunk: `density` (BetterEnd `onEveryLayerMax(n)`) modulated by a
 * Perlin grove field, dithered with the chunk hash so fractional expectations are honoured.
 */
export function molangTreeCount({ density, noiseSalt, hashExpr, max = 4 }) {
  const noise = `query.noise(variable.originx * 0.025 + ${noiseSalt}, variable.originz * 0.025 + ${noiseSalt})`;
  const dither = `(math.mod(${hashExpr}, 100) / 100)`;
  return `math.clamp(math.floor(${density} * (0.75 + 0.75 * ${noise}) + ${dither}), 0, ${max})`;
}
