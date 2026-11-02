/**
 * Pure ES module port of BetterEnd / BCLib / WorldWeaver deterministic hashing,
 * Java `Random(long seed)`, `HexBiomeChunk`, and `HexBiomeMap`.
 *
 * Runs identically in Node.js 24 and inside `@minecraft/server` 2.9.0 in BDS.
 * Uses 64-bit `BigInt` arithmetic for `MHelper.getSeed` and Java `Random` LCG
 * so there is zero 53-bit IEEE-754 integer precision loss.
 */

import { OpenSimplexNoise, toSignedLong } from "./simplex-noise.js";

const RAND_MULTIPLIER = 0x5DEECE66Dn;
const RAND_ADDEND = 0xBn;
const RAND_MASK = (1n << 48n) - 1n;

const HASH_X_MULT = 374761393n;
const HASH_Y_MULT = 668265263n;
const HASH_Z_MULT = 2147483647n;
const HASH_MIX_MULT = 1274126177n;

export const HEX_SIDE = Math.sqrt(3.0) * 0.5;
const HEX_COEF = 0.25 * Math.sqrt(3.0);
const HEX_COEF_HALF = HEX_COEF * 0.5;
const HEX_SIN = Math.sin(0.4);
const HEX_COS = Math.cos(0.4);
const HEX_RADIUS = 1.1555;

/**
 * 6-neighbor index offsets in a 32x32 flat array (`index = (z << 5) | x`),
 * indexed by row parity `z & 1`.
 */
export const HEX_NEIGHBOUR_OFFSETS = Object.freeze([
  Object.freeze([1, -1, 32, -32, 33, -31]), // even z row
  Object.freeze([1, -1, 32, -32, 31, -33])  // odd z row
]);

/**
 * 6-neighbor `[dx, dz]` coordinate deltas indexed by row parity `z & 1`.
 */
export const HEX_NEIGHBOUR_COORDS = Object.freeze([
  Object.freeze([
    Object.freeze([1, 0]),
    Object.freeze([-1, 0]),
    Object.freeze([0, 1]),
    Object.freeze([0, -1]),
    Object.freeze([1, 1]),
    Object.freeze([1, -1])
  ]),
  Object.freeze([
    Object.freeze([1, 0]),
    Object.freeze([-1, 0]),
    Object.freeze([0, 1]),
    Object.freeze([0, -1]),
    Object.freeze([-1, 1]),
    Object.freeze([-1, -1])
  ])
]);

/**
 * Exact port of BCLib's `MHelper` coordinate seed hashing and math utilities.
 */
export class MHelper {
  /**
   * Exact port of `MHelper.getSeed(int seed, int x, int y)` using 64-bit BigInt
   * arithmetic to prevent 53-bit float overflow during 32-bit integer products.
   * Returns a signed 32-bit integer (which sign-extends identically to Java `int -> long`).
   *
   * @param {bigint | number | string} seed
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  static getSeed(seed, x, y, z = undefined) {
    if (z !== undefined) {
      return MHelper.getSeed3D(seed, x, y, z);
    }
    const s = BigInt.asIntN(32, toSignedLong(seed));
    const bx = BigInt.asIntN(32, BigInt(Math.trunc(x)));
    const by = BigInt.asIntN(32, BigInt(Math.trunc(y)));
    let h = BigInt.asIntN(32, s + bx * HASH_X_MULT + by * HASH_Y_MULT);
    h = BigInt.asIntN(32, (h ^ (h >> 13n)) * HASH_MIX_MULT);
    h = BigInt.asIntN(32, h ^ (h >> 16n));
    return Number(h);
  }

  /**
   * 64-bit `BigInt` wrapper around `MHelper.getSeed(seed, x, y)`.
   *
   * @param {bigint | number | string} seed
   * @param {number} x
   * @param {number} y
   * @returns {bigint}
   */
  static getSeedBigInt(seed, x, y) {
    return BigInt.asIntN(64, BigInt(MHelper.getSeed(seed, x, y)));
  }

  /**
   * Exact port of `MHelper.getSeed(int seed, int x, int y, int z)`.
   *
   * @param {bigint | number | string} seed
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  static getSeed3D(seed, x, y, z) {
    const s = BigInt.asIntN(32, toSignedLong(seed));
    const bx = BigInt.asIntN(32, BigInt(Math.trunc(x)));
    const by = BigInt.asIntN(32, BigInt(Math.trunc(y)));
    const bz = BigInt.asIntN(32, BigInt(Math.trunc(z)));
    let h = BigInt.asIntN(32, s + bx * HASH_X_MULT + by * HASH_Y_MULT + bz * HASH_Z_MULT);
    h = BigInt.asIntN(32, (h ^ (h >> 13n)) * HASH_MIX_MULT);
    h = BigInt.asIntN(32, h ^ (h >> 16n));
    return Number(h);
  }

  static floor(value) {
    return Math.floor(value);
  }

  static clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  static lerp(delta, min, max) {
    return min + delta * (max - min);
  }

  static mod(value, modulus) {
    return ((value % modulus) + modulus) % modulus;
  }

  static randRange(min, max, random) {
    if (Number.isInteger(min) && Number.isInteger(max)) {
      if (max <= min) return min;
      return min + random.nextInt(max - min + 1);
    }
    return min + random.nextFloat() * (max - min);
  }
}

/**
 * Exact 48-bit LCG port of `java.util.Random(long seed)` / `LegacyRandomSource`.
 */
export class JavaRandom {
  /**
   * @param {bigint | number | string} [seed=0n]
   */
  constructor(seed = 0n) {
    this._lo = 0;
    this._hi = 0;
    this.setSeed(seed);
  }

  /**
   * @returns {bigint}
   */
  get seed() {
    return (BigInt(this._hi) << 24n) | BigInt(this._lo);
  }

  /**
   * @param {bigint} value
   */
  set seed(value) {
    const masked = BigInt(value) & RAND_MASK;
    this._lo = Number(masked & 0xFFFFFFn);
    this._hi = Number((masked >> 24n) & 0xFFFFFFn);
  }

  /**
   * @param {bigint | number | string} seed
   */
  setSeed(seed) {
    const s = (toSignedLong(seed) ^ RAND_MULTIPLIER) & RAND_MASK;
    this._lo = Number(s & 0xFFFFFFn);
    this._hi = Number((s >> 24n) & 0xFFFFFFn);
  }

  /**
   * Advances LCG state using exact 2x24-bit integer arithmetic (zero BigInt allocation)
   * and returns a signed 32-bit integer containing the top `bits` bits.
   *
   * @param {number} bits 1..32
   * @returns {number}
   */
  next(bits) {
    const prevLo = this._lo;
    const prodLo = prevLo * 0xECE66D + 0xB;
    const lo = prodLo & 0xFFFFFF;
    const hi = (this._hi * 0xECE66D + prevLo * 0x5DE + ((prodLo - lo) / 0x1000000)) & 0xFFFFFF;
    this._lo = lo;
    this._hi = hi;
    const top32 = (hi << 8) | (lo >>> 16);
    return bits === 32 ? (top32 | 0) : (top32 >>> (32 - bits));
  }

  /**
   * Matches `java.util.Random.nextInt()` and `java.util.Random.nextInt(int bound)`.
   *
   * @param {number} [bound]
   * @returns {number}
   */
  nextInt(bound) {
    if (bound === undefined) {
      return this.next(32);
    }
    const b = Math.trunc(bound);
    if (b <= 0) {
      throw new RangeError(`bound must be positive, got ${bound}`);
    }
    if ((b & -b) === b) {
      return Math.floor((b * this.next(31)) / 2147483648);
    }
    let bits = 0;
    let val = 0;
    do {
      bits = this.next(31);
      val = bits % b;
    } while (((bits - val + (b - 1)) | 0) < 0);
    return val;
  }

  /**
   * Matches `java.util.Random.nextFloat()`.
   *
   * @returns {number}
   */
  nextFloat() {
    return this.next(24) / 16777216.0;
  }

  /**
   * Matches `java.util.Random.nextDouble()`.
   *
   * @returns {number}
   */
  nextDouble() {
    const high = BigInt(this.next(26)) << 27n;
    const low = BigInt(this.next(27));
    return Number(high + low) / 9007199254740992.0;
  }

  /**
   * Matches `java.util.Random.nextBoolean()`.
   *
   * @returns {boolean}
   */
  nextBoolean() {
    return this.next(1) !== 0;
  }

  /**
   * Matches `java.util.Random.nextLong()`.
   *
   * @returns {bigint}
   */
  nextLong() {
    return BigInt.asIntN(64, (BigInt(this.next(32)) << 32n) + BigInt(this.next(32)));
  }
}

export { JavaRandom as Random };

/**
 * Weighted biome picker supporting parent biomes and weighted sub-biome promotion.
 */
export class BiomePicker {
  /**
   * @param {Array<object>} [biomes=[]]
   * @param {Array<object>} [subBiomes=[]]
   */
  constructor(biomes = [], subBiomes = []) {
    this.entries = [];
    this.byId = new Map();
    this.subBiomesByParent = new Map();
    this.totalWeight = 0;

    for (const biome of biomes) {
      this.addBiome(biome);
    }
    for (const sub of subBiomes) {
      this.addSubBiome(sub.parent, sub);
    }
  }

  addBiome(biome) {
    const weight = Number(biome.genChance ?? biome.weight ?? 1.0);
    if (weight <= 0) return;
    const entry = {
      ...biome,
      id: biome.id,
      weight,
      genChance: weight,
      parent: biome.parent ?? null
    };
    this.entries.push(entry);
    this.byId.set(entry.id, entry);
    this.totalWeight += weight;

    if (Array.isArray(biome.subBiomes)) {
      for (const sub of biome.subBiomes) {
        if (typeof sub === "object" && sub !== null) {
          this.addSubBiome(entry.id, sub);
        }
      }
    }
  }

  addSubBiome(parentId, subBiome) {
    if (!parentId || !subBiome) return;
    const normalizedParent = parentId.replace(/^betterend:/, "");
    const weight = Number(subBiome.genChance ?? subBiome.weight ?? 1.0);
    if (weight <= 0) return;
    const entry = {
      ...subBiome,
      id: subBiome.id.replace(/^betterend:/, ""),
      parent: normalizedParent,
      weight,
      genChance: weight
    };
    this.byId.set(entry.id, entry);
    let list = this.subBiomesByParent.get(normalizedParent);
    if (!list) {
      list = [];
      this.subBiomesByParent.set(normalizedParent, list);
    }
    if (!list.some((item) => item.id === entry.id)) {
      list.push(entry);
    }
  }

  getBiome(random) {
    if (this.entries.length === 0) return null;
    if (this.entries.length === 1) return this.entries[0];
    let target = random.nextFloat() * this.totalWeight;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      target -= entry.weight;
      if (target <= 0) {
        return entry;
      }
    }
    return this.entries[this.entries.length - 1];
  }

  hasSubBiomes(biomeOrId) {
    const id = typeof biomeOrId === "string" ? biomeOrId.replace(/^betterend:/, "") : biomeOrId?.id;
    if (!id) return false;
    const subs = this.subBiomesByParent.get(id);
    return Boolean(subs && subs.length > 0);
  }

  getSubBiome(biomeOrId, random) {
    const id = typeof biomeOrId === "string" ? biomeOrId.replace(/^betterend:/, "") : biomeOrId?.id;
    const subs = id ? this.subBiomesByParent.get(id) : null;
    if (!subs || subs.length === 0) {
      return typeof biomeOrId === "object" ? biomeOrId : this.byId.get(id) ?? null;
    }
    if (subs.length === 1) {
      return subs[0];
    }
    let total = 0;
    for (let i = 0; i < subs.length; i++) {
      total += subs[i].weight;
    }
    let target = random.nextFloat() * total;
    for (let i = 0; i < subs.length; i++) {
      target -= subs[i].weight;
      if (target <= 0) {
        return subs[i];
      }
    }
    return subs[subs.length - 1];
  }
}

/**
 * 32x32 hex cellular-automaton biome chunk:
 * 1. Seeds 16 initial cells on a 4x4 grid of 8x8 blocks.
 * 2. Runs 8 iterations of 6-neighbor hex growth (plus deterministic fill of any remaining gaps).
 * 3. Runs a 25% `(random.nextInt() & 3) === 0` 7-cell sub-biome island promotion pass
 *    whenever the parent biome has sub-biomes.
 */
export class HexBiomeChunk {
  static WIDTH = 32;
  static SIZE = 32 * 32;
  static MASK = 31;

  /**
   * @param {JavaRandom} random
   * @param {BiomePicker} picker
   */
  constructor(random, picker) {
    this.biomes = new Array(HexBiomeChunk.SIZE).fill(null);
    this.surfaceBiomes = new Array(HexBiomeChunk.SIZE).fill(null);
    this.subBiomes = new Array(HexBiomeChunk.SIZE).fill(null);

    // 1. Place 16 initial biome seeds across the 4x4 subgrid of 8x8 cells
    for (let wx = 0; wx < 4; wx++) {
      for (let wz = 0; wz < 4; wz++) {
        const x = (wx << 3) + 2 + (random.nextInt() & 3);
        const z = (wz << 3) + 2 + (random.nextInt() & 3);
        const index = HexBiomeChunk.getIndex(x, z);
        this.biomes[index] = picker.getBiome(random);
      }
    }

    // 2. Run 8 iterations of 6-neighbor hex Voronoi growth
    const buffer = new Array(HexBiomeChunk.SIZE).fill(null);
    for (let iter = 0; iter < 8; iter++) {
      for (let i = 0; i < HexBiomeChunk.SIZE; i++) {
        buffer[i] = this.biomes[i];
      }
      for (let z = 0; z < HexBiomeChunk.WIDTH; z++) {
        const offsets = HEX_NEIGHBOUR_OFFSETS[z & 1];
        const rowBase = z << 5;
        for (let x = 0; x < HexBiomeChunk.WIDTH; x++) {
          const idx = rowBase | x;
          const current = this.biomes[idx];
          if (current !== null) {
            const dir = offsets[random.nextInt(6)];
            const target = (idx + dir) & 1023;
            if (buffer[target] === null || (random.nextInt() & 3) === 0) {
              buffer[target] = current;
            }
          }
        }
      }
      for (let i = 0; i < HexBiomeChunk.SIZE; i++) {
        this.biomes[i] = buffer[i];
      }
    }

    // Complete any remaining null cells via deterministic neighbor propagation
    let hasNull = true;
    let safety = 0;
    while (hasNull && safety < 16) {
      hasNull = false;
      safety++;
      for (let i = 0; i < HexBiomeChunk.SIZE; i++) {
        buffer[i] = this.biomes[i];
      }
      for (let z = 0; z < HexBiomeChunk.WIDTH; z++) {
        const offsets = HEX_NEIGHBOUR_OFFSETS[z & 1];
        const rowBase = z << 5;
        for (let x = 0; x < HexBiomeChunk.WIDTH; x++) {
          const idx = rowBase | x;
          if (this.biomes[idx] === null) {
            const neighbor = this.biomes[(idx + offsets[random.nextInt(6)]) & 1023];
            if (neighbor !== null) {
              buffer[idx] = neighbor;
            } else {
              hasNull = true;
            }
          }
        }
      }
      for (let i = 0; i < HexBiomeChunk.SIZE; i++) {
        this.biomes[i] = buffer[i];
      }
    }

    for (let i = 0; i < HexBiomeChunk.SIZE; i++) {
      if (this.biomes[i] === null) {
        this.biomes[i] = picker.getBiome(random);
      }
      this.surfaceBiomes[i] = this.biomes[i];
    }

    // 3. 25% `(random.nextInt() & 3) === 0` 7-cell sub-biome island promotion
    // Evaluates interior cells where the center + 6 hex neighbors share the unpromoted parent biome.
    for (let z = 1; z < HexBiomeChunk.WIDTH - 1; z++) {
      const coords = HEX_NEIGHBOUR_COORDS[z & 1];
      for (let x = 1; x < HexBiomeChunk.WIDTH - 1; x++) {
        const idx = HexBiomeChunk.getIndex(x, z);
        const parent = this.biomes[idx];
        if (!parent || !picker.hasSubBiomes(parent)) {
          continue;
        }
        // Check if this cell and all 6 hex neighbors still hold the unpromoted parent biome
        let allMatchParent = true;
        for (let n = 0; n < 6; n++) {
          const nIdx = HexBiomeChunk.getIndex(x + coords[n][0], z + coords[n][1]);
          if (this.biomes[nIdx] !== parent) {
            allMatchParent = false;
            break;
          }
        }
        if (!allMatchParent) {
          continue;
        }
        if ((random.nextInt() & 3) === 0) {
          const subBiome = picker.getSubBiome(parent, random);
          if (subBiome && subBiome.id !== parent.id) {
            this.biomes[idx] = subBiome;
            this.subBiomes[idx] = subBiome;
            for (let n = 0; n < 6; n++) {
              const nIdx = HexBiomeChunk.getIndex(x + coords[n][0], z + coords[n][1]);
              this.biomes[nIdx] = subBiome;
              this.subBiomes[nIdx] = subBiome;
            }
          }
        }
      }
    }
  }

  static getIndex(x, z) {
    return ((z & 31) << 5) | (x & 31);
  }

  getBiome(x, z) {
    return this.biomes[HexBiomeChunk.getIndex(x, z)];
  }

  getCellDetails(x, z) {
    const idx = HexBiomeChunk.getIndex(x, z);
    return {
      biome: this.biomes[idx],
      surfaceBiome: this.surfaceBiomes[idx],
      subBiome: this.subBiomes[idx]
    };
  }

  static scaleMap(size) {
    return size / 4.0;
  }
}

function rotateX(x, z) {
  return x * HEX_COS - z * HEX_SIN;
}

function rotateZ(x, z) {
  return x * HEX_SIN + z * HEX_COS;
}

function insideHexagon(centerX, centerZ, radius, x, z) {
  const dx = Math.abs(x - centerX);
  const dz = Math.abs(z - centerZ);
  if (dx >= radius * HEX_COEF || dz >= radius * 0.5) {
    return false;
  }
  return Math.abs(radius * 0.5 - (dx / HEX_COEF) * HEX_COEF_HALF) > dz;
}

/**
 * Deterministic Voronoi/Hex biome map (`scale = 320.0` for surface land, `128.0` for cave):
 * - Uses `SIDE = Math.sqrt(3.0) * 0.5`
 * - Uses `chunkDivisor = scale / 4.0`
 * - Applies 2-octave `OpenSimplexNoise` edge jitter with weights `0.5` and `0.25`
 * - Applies circle-to-hex axial snapping and looks up the cell in a cached `HexBiomeChunk`.
 */
export class HexBiomeMap {
  /**
   * @param {bigint | number | string} seed
   * @param {number} scale 320.0 for surface/aerial, 128.0 for cave
   * @param {BiomePicker} picker
   */
  constructor(seed, scale, picker) {
    this.seed = toSignedLong(seed);
    this.scale = Number(scale);
    this.chunkDivisor = this.scale / 4.0;
    this.picker = picker;
    this.chunks = new Map();

    const rand = new JavaRandom(this.seed);
    this.noise1 = new OpenSimplexNoise(rand.nextInt());
    this.noise2 = new OpenSimplexNoise(rand.nextInt());
    this.seedInt = rand.nextInt();
  }

  /**
   * Circle-to-hex coordinate transform with 2-octave OpenSimplex edge jitter (`0.5` and `0.25`).
   *
   * @param {number} x Block X
   * @param {number} z Block Z
   * @returns {{ cellX: number, cellZ: number, chunkX: number, chunkZ: number, localX: number, localZ: number }}
   */
  circleToHex(x, z) {
    const px = (x / this.chunkDivisor) * HEX_SIDE;
    const pz = z / this.chunkDivisor;

    let dx = rotateX(px, pz);
    let dz = rotateZ(px, pz);

    const ox = dx;
    const oz = dz;
    dx += this.noise1.eval(ox * 0.2, oz * 0.2) * 0.5 + this.noise2.eval(ox * 0.4, oz * 0.4) * 0.25;
    dz += this.noise2.eval(ox * 0.2, oz * 0.2) * 0.5 + this.noise1.eval(ox * 0.4, oz * 0.4) * 0.25;

    let iz = Math.floor(dz / HEX_RADIUS);
    const odd = (iz & 1) === 1;
    const fx = dx - (odd ? 0.5 : 0.0);
    let ix = Math.floor(fx);

    const pointX = fx - ix - 0.5;
    const pointZ = dz - iz * HEX_RADIUS - 0.5;

    if (!insideHexagon(0, 0, HEX_RADIUS, pointZ, pointX)) {
      const nx = odd ? (pointX > 0 ? ix + 1 : ix) : (pointX < 0 ? ix - 1 : ix);
      const nz = pointZ > 0 ? iz + 1 : iz - 1;
      const testZ = dz - nz * HEX_RADIUS - 0.5;
      const testX = dx - (odd ? 0.0 : 0.5) - nx - 0.5;
      if (insideHexagon(0, 0, HEX_RADIUS, testZ, testX)) {
        ix = nx;
        iz = nz;
      }
    }

    const chunkX = ix >> 5;
    const chunkZ = iz >> 5;
    const localX = ix & 31;
    const localZ = iz & 31;

    return {
      cellX: ix,
      cellZ: iz,
      chunkX,
      chunkZ,
      localX,
      localZ
    };
  }

  /**
   * Returns (and caches) the deterministic `HexBiomeChunk` at `(chunkX, chunkZ)`.
   *
   * @param {number} chunkX
   * @param {number} chunkZ
   * @returns {HexBiomeChunk}
   */
  getChunk(chunkX, chunkZ) {
    const key = `${chunkX},${chunkZ}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      if (this.chunks.size > 256) {
        this.chunks.clear();
      }
      const chunkSeed = MHelper.getSeed(this.seedInt, chunkX, chunkZ);
      const random = new JavaRandom(chunkSeed);
      chunk = new HexBiomeChunk(random, this.picker);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /**
   * Resolves the effective biome at `(x, y, z)` (or `(x, z)` if 2 arguments are passed).
   *
   * @param {number} x
   * @param {number} yOrZ
   * @param {number} [z]
   * @returns {object | null}
   */
  getBiome(x, yOrZ, z = undefined) {
    const blockZ = z === undefined ? yOrZ : z;
    const hex = this.circleToHex(x, blockZ);
    const chunk = this.getChunk(hex.chunkX, hex.chunkZ);
    return chunk.getBiome(hex.localX, hex.localZ);
  }

  /**
   * Resolves full hex cell details (`biome`, `surfaceBiome`, `subBiome`, and hex coordinates) at `(x, z)`.
   *
   * @param {number} x
   * @param {number} z
   */
  getRegionDetails(x, z) {
    const hex = this.circleToHex(x, z);
    const chunk = this.getChunk(hex.chunkX, hex.chunkZ);
    const details = chunk.getCellDetails(hex.localX, hex.localZ);
    return {
      ...details,
      hex
    };
  }
}
