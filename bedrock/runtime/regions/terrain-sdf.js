/**
 * Pure ES module port of BetterEnd's `IslandLayer`, `LayerOptions`, BCLib SDF
 * primitives (`SDFCappedCone`, `SDFTranslate`, `SDFScale`, `SDFSmoothUnion`,
 * `SDFRadialNoiseMap`), and `TerrainGenerator`.
 *
 * Runs identically in Node.js 24 and inside `@minecraft/server` 2.9.0 in BDS.
 */

import { OpenSimplexNoise, toSignedLong } from "./simplex-noise.js";
import { JavaRandom, MHelper } from "./voronoi-hex.js";

/**
 * Vertical density envelope across 18 steps of 8 blocks (`yIndex = 0..17`, `blockY = 0..136`).
 * Crosses `0.0` at index `4` (`blockY = 32`).
 */
export const HEIGHT_CURVE = Object.freeze([
  -1.0, -0.7, -0.4, -0.2, 0.0, 0.2, 0.5, 0.7, 0.8,
  0.8, 0.7, 0.5, 0.2, 0.0, -0.2, -0.4, -0.7, -1.0
]);

const SIN_45 = Math.sin(Math.PI * 0.25);

/**
 * Exact port of BCLib's `SDFCappedCone`.
 */
export class SDFCappedCone {
  constructor(radius1 = 0, radius2 = 0, height = 1) {
    this.radius1 = radius1;
    this.radius2 = radius2;
    this.height = height;
  }

  setRadius1(radius1) {
    this.radius1 = radius1;
    return this;
  }

  setRadius2(radius2) {
    this.radius2 = radius2;
    return this;
  }

  setHeight(height) {
    this.height = height;
    return this;
  }

  getDistance(x, y, z) {
    const qx = Math.sqrt(x * x + z * z);
    const k2x = this.radius2 - this.radius1;
    const k2y = 2.0 * this.height;
    const cax = qx - Math.min(qx, y < 0.0 ? this.radius1 : this.radius2);
    const cay = Math.abs(y) - this.height;
    const denom = k2x * k2x + k2y * k2y;
    const m = denom > 0
      ? MHelper.clamp(((this.radius2 - qx) * k2x + (this.height - y) * k2y) / denom, 0.0, 1.0)
      : 0.0;
    const cbx = qx - this.radius2 + k2x * m;
    const cby = y - this.height + k2y * m;
    const s = cbx < 0.0 && cay < 0.0 ? -1.0 : 1.0;
    return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
  }
}

/**
 * Exact port of BCLib's `SDFTranslate`.
 */
export class SDFTranslate {
  constructor(source = null, dx = 0, dy = 0, dz = 0) {
    this.source = source;
    this.dx = dx;
    this.dy = dy;
    this.dz = dz;
  }

  setSource(source) {
    this.source = source;
    return this;
  }

  setTranslate(dx, dy, dz) {
    this.dx = dx;
    this.dy = dy;
    this.dz = dz;
    return this;
  }

  getDistance(x, y, z) {
    return this.source.getDistance(x - this.dx, y - this.dy, z - this.dz);
  }
}

/**
 * Exact port of BCLib's `SDFScale`.
 */
export class SDFScale {
  constructor(source = null, scale = 1.0) {
    this.source = source;
    this.scale = scale;
  }

  setSource(source) {
    this.source = source;
    return this;
  }

  setScale(scale) {
    this.scale = scale;
    return this;
  }

  getDistance(x, y, z) {
    return this.source.getDistance(x / this.scale, y / this.scale, z / this.scale) * this.scale;
  }
}

/**
 * Exact port of BCLib's `SDFSmoothUnion`.
 */
export class SDFSmoothUnion {
  constructor(radius = 0.01, sourceA = null, sourceB = null) {
    this.radius = radius;
    this.sourceA = sourceA;
    this.sourceB = sourceB;
  }

  setRadius(radius) {
    this.radius = radius;
    return this;
  }

  setSourceA(sourceA) {
    this.sourceA = sourceA;
    return this;
  }

  setSourceB(sourceB) {
    this.sourceB = sourceB;
    return this;
  }

  getDistance(x, y, z) {
    const a = this.sourceA.getDistance(x, y, z);
    const b = this.sourceB.getDistance(x, y, z);
    const h = MHelper.clamp(0.5 + (0.5 * (b - a)) / this.radius, 0.0, 1.0);
    return MHelper.lerp(h, b, a) - this.radius * h * (1.0 - h);
  }
}

/**
 * Exact port of BCLib's `SDFRadialNoiseMap`.
 */
export class SDFRadialNoiseMap {
  constructor(source = null, seed = 0, radius = 0.5, intensity = 0.2) {
    this.source = source;
    this.noise = new OpenSimplexNoise(seed);
    this.radius = radius;
    this.intensity = intensity;
    this.offsetX = 0;
    this.offsetZ = 0;
  }

  setSource(source) {
    this.source = source;
    return this;
  }

  setSeed(seed) {
    this.noise = new OpenSimplexNoise(seed);
    return this;
  }

  setRadius(radius) {
    this.radius = radius;
    return this;
  }

  setIntensity(intensity) {
    this.intensity = intensity;
    return this;
  }

  setOffset(x, z) {
    this.offsetX = Math.floor(x * SIN_45) & 32767;
    this.offsetZ = Math.floor(z * SIN_45) & 32767;
    return this;
  }

  getValue(x, y, z) {
    if (this.intensity === 0) return 0;
    let px = (x / this.radius) * SIN_45;
    let pz = (z / this.radius) * SIN_45;
    const dx = px + pz + this.offsetX;
    const dz = pz - px + this.offsetZ;
    px = dx;
    pz = dz;
    const dist = Math.min(1.0, Math.sqrt(x * x + z * z));
    return (
      (1.0 - dist) *
      this.intensity *
      (this.noise.eval(px, pz) * 0.5 +
        this.noise.eval(px * 2.0, pz * 2.0) * 0.3 +
        this.noise.eval(px * 4.0, pz * 4.0) * 0.2)
    );
  }

  getDistance(x, y, z) {
    return this.source.getDistance(x, y, z) + this.getValue(x, y, z);
  }
}

/**
 * Exact port of BetterEnd's `LayerOptions`.
 */
export class LayerOptions {
  /**
   * @param {number} distance Grid spacing in 8-block terrain cells (or blocks before scaling)
   * @param {number} scale Island radius scale in 8-block terrain cells
   * @param {number} center Center Y in 8-block terrain cells (default 70 / 8)
   * @param {number} heightVariation Height variation in 8-block terrain cells
   * @param {boolean} hasCentralIsland Whether (0,0) spawns a guaranteed central island
   * @param {number} [coverage=0.5] Spawn probability per grid cell
   */
  constructor(distance, scale, center, heightVariation, hasCentralIsland, coverage = 0.5) {
    this.distance = MHelper.clamp(distance, 1, 8192);
    this.scale = MHelper.clamp(scale, 0.1, 1024);
    this.center = MHelper.clamp(center, 0, 255);
    this.heightVariation = MHelper.clamp(heightVariation, 0, 255);
    this.coverage = MHelper.clamp(coverage, 0, 1);
    this.dist2 = Math.floor(this.distance / 2);
    this.maxX = 1;
    this.minX = -1;
    this.hasCentralIsland = Boolean(hasCentralIsland);
  }
}

function makeCone(radiusBottom, radiusTop, height, minY) {
  const hh = height * 0.5;
  const sdf = new SDFCappedCone(radiusBottom, radiusTop, hh);
  return new SDFTranslate(sdf, 0, minY + hh, 0);
}

/**
 * Exact port of BetterEnd's `IslandLayer`.
 */
export class IslandLayer {
  /**
   * @param {number | bigint} seed
   * @param {LayerOptions} options
   */
  constructor(seed, options) {
    this.seed = Number(BigInt.asIntN(32, toSignedLong(seed)));
    this.options = options;
    this.density = new OpenSimplexNoise(this.seed);
    this.positions = [];
    this.islands = new Map();
    this.lastX = -2147483648;
    this.lastZ = -2147483648;

    const cone1 = makeCone(0, 0.4, 0.2, -0.3);
    const cone2 = makeCone(0.4, 0.5, 0.1, -0.1);
    const cone3 = makeCone(0.5, 0.45, 0.03, 0.0);
    const cone4 = makeCone(0.45, 0, 0.02, 0.03);

    const coneBottom = new SDFSmoothUnion(0.02, cone1, cone2);
    const coneTop = new SDFSmoothUnion(0.02, cone3, cone4);
    this.noise = new SDFRadialNoiseMap(coneTop, this.seed, 0.5, 0.2);
    this.island = new SDFSmoothUnion(0.01, this.noise, coneBottom);
  }

  getSeed(x, z) {
    return MHelper.getSeed(this.seed, x, z);
  }

  getIsland(pos) {
    const key = `${pos.x},${pos.y},${pos.z}`;
    let island = this.islands.get(key);
    if (!island) {
      if (pos.x === 0 && pos.z === 0) {
        island = new SDFScale(this.island, 1.3);
      } else {
        const random = new JavaRandom(this.getSeed(pos.x, pos.z));
        island = new SDFScale(this.island, random.nextFloat() + 0.5);
      }
      this.islands.set(key, island);
    }
    return island;
  }

  /**
   * Evaluates the relative SDF distance from `(px, py, pz)` to an island centered at `center`.
   */
  getRelativeDistance(sdf, center, px, py, pz) {
    const x = (px - center.x) / this.options.scale;
    const y = (py - center.y) / this.options.scale;
    const z = (pz - center.z) / this.options.scale;
    return sdf.getDistance(x, y, z);
  }

  calculateSDF(x, y, z) {
    let distance = 10.0;
    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i];
      const dx = (x - pos.x) / this.options.scale;
      const dz = (z - pos.z) / this.options.scale;
      if (dx * dx + dz * dz > 2.25 && distance < 1.0) {
        continue;
      }
      const island = pos.island ?? this.getIsland(pos);
      const dy = (y - pos.y) / this.options.scale;
      const dist = island.getDistance(dx, dy, dz);
      if (dist < distance) {
        distance = dist;
      }
    }
    return distance;
  }

  updatePositions(x, z) {
    const ix = Math.floor((x + this.options.dist2) / this.options.distance);
    const iz = Math.floor((z + this.options.dist2) / this.options.distance);
    if (this.lastX !== ix || this.lastZ !== iz) {
      this.lastX = ix;
      this.lastZ = iz;
      this.positions.length = 0;
      for (let pox = this.options.minX; pox <= this.options.maxX; pox++) {
        const px = pox + ix;
        const px2 = px * this.options.distance;
        for (let poz = this.options.minX; poz <= this.options.maxX; poz++) {
          const pz = poz + iz;
          const pz2 = pz * this.options.distance;
          if (this.options.hasCentralIsland && px === 0 && pz === 0) {
            const pos = { x: 0, y: this.options.center, z: 0, island: null };
            pos.island = this.getIsland(pos);
            this.positions.push(pos);
          } else {
            const random = new JavaRandom(this.getSeed(px, pz));
            if (random.nextFloat() < this.options.coverage) {
              const pointX = (random.nextFloat() - 0.5) * this.options.dist2 + px2;
              const pointY = (random.nextFloat() - 0.5) * this.options.heightVariation + this.options.center;
              const pointZ = (random.nextFloat() - 0.5) * this.options.dist2 + pz2;
              const pos = { x: pointX, y: pointY, z: pointZ, island: null };
              pos.island = this.getIsland(pos);
              this.positions.push(pos);
            }
          }
        }
      }
    }
  }

  getDensity(x, y, z, height = 1.0) {
    this.noise.setOffset(x, z);
    this.noise.setIntensity(0.2 * height);
    this.noise.setRadius(0.5 / (1.0 + height));
    return -this.calculateSDF(x, y, z);
  }

  clearCache() {
    if (this.islands.size > 4096) {
      this.islands.clear();
    }
  }
}

/**
 * Exact port of BetterEnd's `TerrainGenerator` combining `largeIslands`,
 * `mediumIslands`, `smallIslands`, detail `OpenSimplexNoise` fields, and `HEIGHT_CURVE`.
 */
export class TerrainGenerator {
  static SCALE_XZ = 8.0;
  static SCALE_Y = 4.0;
  static HEIGHT_CURVE = HEIGHT_CURVE;

  /**
   * @param {bigint | number | string} seed
   */
  constructor(seed = 0n) {
    this.seed = toSignedLong(seed);
    const random = new JavaRandom(this.seed);

    this.largeIslands = new IslandLayer(
      random.nextInt(),
      new LayerOptions(300 / 8.0, 200 / 8.0, 70 / 8.0, 30 / 8.0, false, 0.5)
    );
    this.mediumIslands = new IslandLayer(
      random.nextInt(),
      new LayerOptions(150 / 8.0, 100 / 8.0, 70 / 8.0, 20 / 8.0, true, 0.5)
    );
    this.smallIslands = new IslandLayer(
      random.nextInt(),
      new LayerOptions(60 / 8.0, 50 / 8.0, 70 / 8.0, 30 / 8.0, false, 0.5)
    );
    this.noise1 = new OpenSimplexNoise(random.nextInt());
    this.noise2 = new OpenSimplexNoise(random.nextInt());
    this.heightCache = new Map();
  }

  /**
   * Evaluates combined 3D terrain density on the 8-block coarse terrain grid `(gx, gy, gz)`.
   *
   * @param {number} gx Grid X (`blockX / 8.0`)
   * @param {number} gy Grid Y (`0..17`, where `blockY = gy * 8`)
   * @param {number} gz Grid Z (`blockZ / 8.0`)
   * @param {number} [terrainHeight=1.0] Biome terrain height multiplier
   * @returns {number}
   */
  getDensity(gx, gy, gz, terrainHeight = 1.0) {
    const yIndex = MHelper.clamp(Math.floor(gy), 0, HEIGHT_CURVE.length - 1);
    let dist = HEIGHT_CURVE[yIndex];

    this.largeIslands.updatePositions(gx, gz);
    this.mediumIslands.updatePositions(gx, gz);
    this.smallIslands.updatePositions(gx, gz);

    dist = Math.max(dist, this.largeIslands.getDensity(gx, gy, gz, terrainHeight));
    dist = Math.max(dist, this.mediumIslands.getDensity(gx, gy, gz, terrainHeight));
    dist = Math.max(dist, this.smallIslands.getDensity(gx, gy, gz, terrainHeight));

    if (dist > -0.5) {
      dist += this.noise1.eval(gx * 0.08, gy * 0.08, gz * 0.08) * 0.03;
      dist += this.noise2.eval(gx * 0.16, gy * 0.16, gz * 0.16) * 0.015;
    }

    return dist;
  }

  /**
   * Evaluates a vertical 18-step density column at block coordinates `(blockX, blockZ)`.
   *
   * @param {number} blockX
   * @param {number} blockZ
   * @param {number} [terrainHeight=1.0]
   * @returns {Float64Array}
   */
  sampleColumn(blockX, blockZ, terrainHeight = 1.0) {
    const gx = blockX / TerrainGenerator.SCALE_XZ;
    const gz = blockZ / TerrainGenerator.SCALE_XZ;

    this.largeIslands.updatePositions(gx, gz);
    this.mediumIslands.updatePositions(gx, gz);
    this.smallIslands.updatePositions(gx, gz);

    const column = new Float64Array(HEIGHT_CURVE.length);
    for (let y = 0; y < HEIGHT_CURVE.length; y++) {
      let dist = this.largeIslands.getDensity(gx, y, gz, terrainHeight);
      dist = Math.max(dist, this.mediumIslands.getDensity(gx, y, gz, terrainHeight));
      dist = Math.max(dist, this.smallIslands.getDensity(gx, y, gz, terrainHeight));
      if (dist > -0.5) {
        dist += this.noise1.eval(gx * 0.08, y * 0.08, gz * 0.08) * 0.03;
        dist += this.noise2.eval(gx * 0.16, y * 0.16, gz * 0.16) * 0.015;
      }
      // Combine with vertical envelope
      column[y] = dist + HEIGHT_CURVE[y];
    }

    this.largeIslands.clearCache();
    this.mediumIslands.clearCache();
    this.smallIslands.clearCache();

    return column;
  }

  /**
   * Returns the maximum solid surface height (in blocks, `0..136`) at block coordinates `(x, z)`.
   * Returns `< 32` (`0`) when the column is void / aerial (`isLand(x, z) === false`).
   *
   * @param {number} x Block X
   * @param {number} z Block Z
   * @param {number} [terrainHeight=1.0]
   * @returns {number}
   */
  getMaxHeight(x, z, terrainHeight = 1.0) {
    const cellX = Math.floor(x / TerrainGenerator.SCALE_XZ);
    const cellZ = Math.floor(z / TerrainGenerator.SCALE_XZ);
    const cacheKey = `${cellX},${cellZ},${terrainHeight}`;
    const cached = this.heightCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    if (this.heightCache.size > 16384) {
      this.heightCache.clear();
    }

    const gx = cellX;
    const gz = cellZ;

    this.largeIslands.updatePositions(gx, gz);
    this.mediumIslands.updatePositions(gx, gz);
    this.smallIslands.updatePositions(gx, gz);

    let maxHeight = 0;
    for (let y = HEIGHT_CURVE.length - 2; y >= 4; y--) {
      let dist = this.largeIslands.getDensity(gx, y, gz, terrainHeight);
      dist = Math.max(dist, this.mediumIslands.getDensity(gx, y, gz, terrainHeight));
      dist = Math.max(dist, this.smallIslands.getDensity(gx, y, gz, terrainHeight));
      if (dist > -0.5) {
        dist += this.noise1.eval(gx * 0.08, y * 0.08, gz * 0.08) * 0.03;
        dist += this.noise2.eval(gx * 0.16, y * 0.16, gz * 0.16) * 0.015;
      }
      if (dist + HEIGHT_CURVE[y] > 0.0) {
        maxHeight = y * 8;
        break;
      }
    }

    this.largeIslands.clearCache();
    this.mediumIslands.clearCache();
    this.smallIslands.clearCache();

    this.heightCache.set(cacheKey, maxHeight);
    return maxHeight;
  }

  /**
   * Returns `true` when `(x, z)` has main End island land (`getMaxHeight(x, z) >= 32`),
   * or `false` when in void / aerial small-island space (`getMaxHeight(x, z) < 32`).
   *
   * @param {number} x Block X
   * @param {number} z Block Z
   * @returns {boolean}
   */
  isLand(x, z) {
    return this.getMaxHeight(x, z) >= 32;
  }
}
