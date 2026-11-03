/**
 * Single source of truth for the outer-End biome cell map that the native C++ `feature_rules`
 * (compiled by `tools/content-compiler.mjs` through `tools/placement-molang.mjs`) and the
 * `@minecraft/server` runtime (`BetterEndRuntime._lookupNativeCellRegion`) both evaluate.
 *
 * The map is a domain-warped lattice of `NATIVE_CELL_SIZE` blocks. The warp is built only from
 * analytic sine terms (no `query.noise`), so Molang and JavaScript evaluate the *same* function and
 * the biome shown on the HUD / used for entity spawning always matches the biome that painted the
 * ground, grew the trees and placed the structures.
 *
 * Every angle is in degrees, exactly like Molang `math.sin`.
 */

const DEG = Math.PI / 180;

export const NATIVE_CELL_SIZE = 320;
export const NATIVE_REGION_COUNT = 27;
export const NATIVE_CELL_HASH_X = 127.1;
export const NATIVE_CELL_HASH_Z = 311.7;
export const NATIVE_CELL_HASH_SCALE = 43758.5453;
/** The central dragon island (|x| <= 1024 and |z| <= 1024) is never decorated. */
export const NATIVE_PROTECTED_HALF_EXTENT = 1024;

/**
 * Warp terms: `[a, b, amplitude, degreesPerBlock, phaseDegrees]`, contributing
 * `amplitude * sin(degreesPerBlock * (a * x + b * z) + phase)` to the warped coordinate.
 */
export const NATIVE_WARP_X_TERMS = Object.freeze([
  Object.freeze([0, 1, 70, 0.45, 0]),
  Object.freeze([1, 1, 40, 0.28, 90]),
  Object.freeze([0, 1, 26, 4.3, 31])
]);

export const NATIVE_WARP_Z_TERMS = Object.freeze([
  Object.freeze([1, 0, 70, 0.45, 90]),
  Object.freeze([-1, 1, 40, 0.28, 0]),
  Object.freeze([1, 0, 26, 4.3, 127])
]);

function warpAxis(terms, x, z) {
  let sum = 0;
  for (const [a, b, amplitude, frequency, phase] of terms) {
    sum += Math.sin((frequency * (a * x + b * z) + phase) * DEG) * amplitude;
  }
  return sum;
}

/** Returns the warped `[wx, wz]` coordinates of block column `(x, z)`. */
export function nativeWarp(x, z) {
  return [x + warpAxis(NATIVE_WARP_X_TERMS, x, z), z + warpAxis(NATIVE_WARP_Z_TERMS, x, z)];
}

/** Returns the warp displacement `[dx, dz]` at `(x, z)` (used to invert the warp). */
export function nativeWarpDisplacement(x, z) {
  return [warpAxis(NATIVE_WARP_X_TERMS, x, z), warpAxis(NATIVE_WARP_Z_TERMS, x, z)];
}

/**
 * Exact integer folded hash of integer lattice coordinates `(ix, iz)` in `0 .. 996`.
 * Uses only exact integer operations (`+`, `-`, `*`, `abs`, `mod`) with all intermediates `< 2^21`,
 * so Bedrock's 32-bit float Molang VM and JavaScript's 64-bit double runtime always agree bit-for-bit.
 */
export function nativeIntHash(ix, iz, saltA, saltB, saltC = 0) {
  const A = (Math.round(Math.abs(saltA) * 10) % 499) || 173;
  const B = (Math.round(Math.abs(saltB) * 10) % 491) || 311;
  const C = Math.round(Math.abs(saltC) * 10) % 4093;
  const u = Math.abs(ix * A + iz * B + C) % 4093;
  const v = Math.abs(u * 613 - 1254505) % 2039;
  return Math.abs(v * 733 - 747293) % 997;
}

export function nativeCellHash(cellX, cellZ) {
  return nativeIntHash(cellX, cellZ, NATIVE_CELL_HASH_X, NATIVE_CELL_HASH_Z, 0);
}

export function nativeCellRegionIndex(cellX, cellZ, count = NATIVE_REGION_COUNT) {
  return nativeCellHash(cellX, cellZ) % count;
}

// ---------------------------------------------------------------------------
// Java BetterEnd biome-picker model, painted on the vanilla End terrain
// ---------------------------------------------------------------------------
//
// BetterEnd's `BiomePicker` only places *land* biomes on the surface map, picks them by
// `genChance` weight, promotes ~25% of cells to a parent's sub-biome, puts "void" biomes (floating
// islands) over empty space and "cave" biomes underground. Bedrock cannot reshape the terrain, so
// the native rules reproduce that selection logic with three independent warped lattices:
//
//  - surface: 15 land biomes, weights = genChance x4 (dragon_graveyards 0.25, others 1.25), plus
//    sub-biome promotion inside Megalake / Dust Wastelands on a finer lattice;
//  - aerial: Ice Starfield / Flower Islets / Waterfall Ponds above void;
//  - cave: the six cave biomes (grotto structures inside land).

/** Catalogue indices of the land biomes in picker order with their integer weights (genChance x 4). */
export const NATIVE_LAND_SLOT_TABLE = Object.freeze(
  [
    [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5],
    [11, 1], // dragon_graveyards: genChance 0.25
    [12, 5], [13, 5], [14, 5]
  ].map(entry => Object.freeze(entry))
);

/** `[lo, hi)` slot range of each land biome, derived from `NATIVE_LAND_SLOT_TABLE`. */
export const NATIVE_LAND_SLOT_RANGES = (() => {
  const ranges = new Map();
  let cursor = 0;
  for (const [regionIndex, weight] of NATIVE_LAND_SLOT_TABLE) {
    ranges.set(regionIndex, Object.freeze([cursor, cursor + weight]));
    cursor += weight;
  }
  return ranges;
})();
export const NATIVE_LAND_SLOT_COUNT = [...NATIVE_LAND_SLOT_TABLE].reduce((sum, [, w]) => sum + w, 0);

export const NATIVE_SUBCELL_SIZE = 128;
export const NATIVE_SUB_BIOME_PROMOTION_PERCENT = 25;
export const NATIVE_SUB_HASH_X = 269.5;
export const NATIVE_SUB_HASH_Z = 183.3;
export const NATIVE_SUB_HASH_PHASE = 31.7;
/** Parent region index -> sub-biome catalogue indices (megalake_grove; painted_mountains / neon_oasis). */
export const NATIVE_SUB_BIOME_PARENTS = Object.freeze({ 2: [16, 17], 3: [15] });

export const NATIVE_AERIAL_CELL_SIZE = 448;
export const NATIVE_AERIAL_FIRST_INDEX = 18;
export const NATIVE_AERIAL_COUNT = 3;
export const NATIVE_AERIAL_GATE_PERCENT = 60;
export const NATIVE_AERIAL_HASH = Object.freeze({ x: 97.3, z: 241.9, phase: 17.3, gatePhase: 59.9 });

export const NATIVE_CAVE_CELL_SIZE = 256;
export const NATIVE_CAVE_FIRST_INDEX = 21;
export const NATIVE_CAVE_COUNT = 6;
export const NATIVE_CAVE_GATE_PERCENT = 55;
export const NATIVE_CAVE_HASH = Object.freeze({ x: 163.7, z: 71.9, phase: 41.3, gatePhase: 83.1 });

function warpedCell(x, z, size) {
  const [wx, wz] = nativeWarp(x, z);
  return [Math.floor(wx / size), Math.floor(wz / size)];
}

function subHash(cellX, cellZ) {
  return nativeIntHash(cellX, cellZ, NATIVE_SUB_HASH_X, NATIVE_SUB_HASH_Z, NATIVE_SUB_HASH_PHASE);
}

/** Land-biome slot (`0 .. NATIVE_LAND_SLOT_COUNT - 1`) of the base lattice cell owning `(x, z)`. */
export function nativeLandSlot(x, z) {
  const [cellX, cellZ] = nativeCellCoords(x, z);
  return nativeCellHash(cellX, cellZ) % NATIVE_LAND_SLOT_COUNT;
}

/** Catalogue index of the land biome owning `slot`. */
export function nativeLandRegionForSlot(slot) {
  for (const [regionIndex, [lo, hi]] of NATIVE_LAND_SLOT_RANGES) {
    if (slot >= lo && slot < hi) return regionIndex;
  }
  return 0;
}

/**
 * Surface biome (land biomes 0..14 and sub-biomes 15..17) of block column `(x, z)`.
 * This is the biome the native painter, trees, structures and ponds use.
 */
export function nativeSurfaceRegionIndex(x, z) {
  const base = nativeLandRegionForSlot(nativeLandSlot(x, z));
  const subs = NATIVE_SUB_BIOME_PARENTS[base];
  if (!subs) return base;
  const [subX, subZ] = warpedCell(x, z, NATIVE_SUBCELL_SIZE);
  const hash = subHash(subX, subZ);
  if (hash % 100 >= NATIVE_SUB_BIOME_PROMOTION_PERCENT) return base;
  if (subs.length === 1) return subs[0];
  // Dust Wastelands: painted_mountains (genChance 1.25) vs neon_oasis (0.625) = 2:1
  return Math.floor(hash / 100) % 3 === 0 ? subs[1] : subs[0];
}

/** Aerial (void) biome index 18..20 over `(x, z)`, or -1 when this lattice cell hosts none. */
export function nativeAerialRegionIndex(x, z) {
  const [cellX, cellZ] = warpedCell(x, z, NATIVE_AERIAL_CELL_SIZE);
  const hash = nativeIntHash(cellX, cellZ, NATIVE_AERIAL_HASH.x, NATIVE_AERIAL_HASH.z, NATIVE_AERIAL_HASH.phase);
  const gate = nativeIntHash(cellX, cellZ, NATIVE_AERIAL_HASH.x, NATIVE_AERIAL_HASH.z, NATIVE_AERIAL_HASH.gatePhase);
  if (gate % 100 >= NATIVE_AERIAL_GATE_PERCENT) return -1;
  return NATIVE_AERIAL_FIRST_INDEX + (hash % NATIVE_AERIAL_COUNT);
}

/** Cave biome index 21..26 at `(x, z)`, or -1 when this lattice cell hosts none. */
export function nativeCaveRegionIndex(x, z) {
  const [cellX, cellZ] = warpedCell(x, z, NATIVE_CAVE_CELL_SIZE);
  const hash = nativeIntHash(cellX, cellZ, NATIVE_CAVE_HASH.x, NATIVE_CAVE_HASH.z, NATIVE_CAVE_HASH.phase);
  const gate = nativeIntHash(cellX, cellZ, NATIVE_CAVE_HASH.x, NATIVE_CAVE_HASH.z, NATIVE_CAVE_HASH.gatePhase);
  if (gate % 100 >= NATIVE_CAVE_GATE_PERCENT) return -1;
  return NATIVE_CAVE_FIRST_INDEX + (hash % NATIVE_CAVE_COUNT);
}

/** Returns the lattice cell `[cellX, cellZ]` that owns block column `(x, z)`. */
export function nativeCellCoords(x, z) {
  const [wx, wz] = nativeWarp(x, z);
  return [Math.floor(wx / NATIVE_CELL_SIZE), Math.floor(wz / NATIVE_CELL_SIZE)];
}

/** Returns the region-catalogue index owning block column `(x, z)`. */
export function nativeRegionIndex(x, z, count = NATIVE_REGION_COUNT) {
  const [cellX, cellZ] = nativeCellCoords(x, z);
  return nativeCellRegionIndex(cellX, cellZ, count);
}

/** True when `(x, z)` lies inside the protected central dragon island. */
export function isNativeProtectedColumn(x, z) {
  return (
    Math.abs(x) <= NATIVE_PROTECTED_HALF_EXTENT && Math.abs(z) <= NATIVE_PROTECTED_HALF_EXTENT
  );
}

/**
 * Conservative bound on how far (in warped blocks) the warped coordinate of any column of a
 * 16x16 chunk can drift from the warped coordinate of the chunk's centre column. A chunk whose
 * centre sits further than this from every cell edge lies entirely inside one cell, which lets the
 * native painter skip the per-column cell test for ~55% of chunks.
 */
export function nativeChunkInteriorMargin() {
  const half = 8;
  const slope = terms => terms.reduce((sum, [a, b, amplitude, frequency]) => {
    const rate = amplitude * frequency * DEG;
    return sum + rate * (Math.abs(a) + Math.abs(b));
  }, 0);
  const worst = Math.max(slope(NATIVE_WARP_X_TERMS), slope(NATIVE_WARP_Z_TERMS));
  return Math.ceil(half * (1 + worst));
}

/**
 * Finds a block column near the centre of `(cellX, cellZ)` whose *warped* coordinates land on the
 * cell centre, so the column genuinely belongs to that cell.
 */
export function nativeCellCentreColumn(cellX, cellZ) {
  const targetX = cellX * NATIVE_CELL_SIZE + NATIVE_CELL_SIZE / 2;
  const targetZ = cellZ * NATIVE_CELL_SIZE + NATIVE_CELL_SIZE / 2;
  let x = targetX;
  let z = targetZ;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const [dx, dz] = nativeWarpDisplacement(x, z);
    x = Math.round(targetX - dx);
    z = Math.round(targetZ - dz);
  }
  return [x, z];
}
