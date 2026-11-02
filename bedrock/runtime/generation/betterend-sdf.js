/**
 * BetterEnd Bedrock 26.40 — 1:1 Port of BCLib SDF, SplineHelper, and BetterEnd
 * Tree, Bush, Multi-Block Plant, Terrain Feature, and Massive Structure Generators.
 *
 * Pure ES module with zero Node.js imports. Shared between build-time `.mcstructure`
 * compilation (`tools/mcstructure-compiler.mjs`) and runtime chunk/anchor generation
 * (`runtime/generation/generation-service.js` and `runtime/bootstrap/bootstrap.js`).
 */

import { OpenSimplexNoise } from "../regions/simplex-noise.js";
import { JavaRandom, MHelper } from "../regions/voronoi-hex.js";

const PI = Math.PI;
const PI2 = Math.PI * 2;
const PHI = Math.PI * (3.0 - Math.sqrt(5.0));

export const HORIZONTAL_DIRS = Object.freeze([
  Object.freeze({ name: "north", dx: 0, dy: 0, dz: -1, opposite: "south" }),
  Object.freeze({ name: "east", dx: 1, dy: 0, dz: 0, opposite: "west" }),
  Object.freeze({ name: "south", dx: 0, dy: 0, dz: 1, opposite: "north" }),
  Object.freeze({ name: "west", dx: -1, dy: 0, dz: 0, opposite: "east" })
]);

export const ALL_DIRS = Object.freeze([
  ...HORIZONTAL_DIRS,
  Object.freeze({ name: "up", dx: 0, dy: 1, dz: 0, opposite: "down" }),
  Object.freeze({ name: "down", dx: 0, dy: -1, dz: 0, opposite: "up" })
]);

export function nextGaussian(rng) {
  let u = 0;
  let v = 0;
  let s = 0;
  do {
    u = rng.nextFloat() * 2.0 - 1.0;
    v = rng.nextFloat() * 2.0 - 1.0;
    s = u * u + v * v;
  } while (s >= 1.0 || s === 0.0);
  return u * Math.sqrt((-2.0 * Math.log(s)) / s);
}

export function randomHorizontal(rng) {
  const angle = rng.nextFloat() * PI2;
  return { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
}

export function normalizeVec3(v) {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-6) return { x: 0, y: 1, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function crossVec3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

export function rotateAroundAxis(x, y, z, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1.0 - c;
  const ax = axis.x;
  const ay = axis.y;
  const az = axis.z;
  const dot = ax * x + ay * y + az * z;
  return {
    x: x * c + (ay * z - az * y) * s + ax * dot * t,
    y: y * c + (az * x - ax * z) * s + ay * dot * t,
    z: z * c + (ax * y - ay * x) * s + az * dot * t
  };
}

// ============================================================================
// 1. BCLib SDF Primitives & Operators (`org.betterx.bclib.sdf`)
// ============================================================================

export class SDF {
  constructor() {
    this.postProcesses = [];
  }

  getDistance(_x, _y, _z) {
    return 1e9;
  }

  getBlockState(_x, _y, _z) {
    return { blockId: "minecraft:end_stone", states: {} };
  }

  addPostProcess(fn) {
    this.postProcesses.push(fn);
    return this;
  }

  fillArea(grid, centerX, centerY, centerZ, minX, minY, minZ, maxX, maxY, maxZ, role = "sdf") {
    const placedKeys = [];
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
        for (let z = Math.floor(minZ); z <= Math.ceil(maxZ); z++) {
          const lx = x - centerX;
          const ly = y - centerY;
          const lz = z - centerZ;
          if (this.getDistance(lx, ly, lz) <= 0) {
            const st = this.getBlockState(x, y, z);
            if (st && st.blockId && st.blockId !== "minecraft:air") {
              grid.set(x, y, z, st.blockId, st.states ?? {}, role);
              placedKeys.push([x, y, z]);
            }
          }
        }
      }
    }

    for (const post of this.postProcesses) {
      const updates = [];
      for (const [x, y, z] of placedKeys) {
        const cur = grid.get(x, y, z);
        if (!cur) continue;
        const info = {
          x,
          y,
          z,
          getPos: () => ({ x, y, z }),
          getState: () => cur,
          getStateUp: () => grid.get(x, y + 1, z) ?? { blockId: "minecraft:air", states: {} },
          getStateDown: () => grid.get(x, y - 1, z) ?? { blockId: "minecraft:air", states: {} },
          getStateDir: (dir, steps = 1) =>
            grid.get(x + dir.dx * steps, y + dir.dy * steps, z + dir.dz * steps) ?? {
              blockId: "minecraft:air",
              states: {}
            },
          setBlockPos: (px, py, pz, blockId, states = {}, r = role) => {
            updates.push({ x: px, y: py, z: pz, blockId, states, role: r });
          }
        };
        const nextState = post(info);
        if (nextState && nextState.blockId) {
          updates.push({
            x,
            y,
            z,
            blockId: nextState.blockId,
            states: nextState.states ?? {},
            role
          });
        }
      }
      for (const u of updates) {
        if (u.blockId === "minecraft:air") {
          grid.delete(u.x, u.y, u.z);
        } else {
          grid.set(u.x, u.y, u.z, u.blockId, u.states, u.role);
        }
      }
    }
  }
}

export class SDFPrimitive extends SDF {
  constructor(blockId = "minecraft:end_stone", states = {}) {
    super();
    this.blockId = blockId;
    this.states = states;
    this.blockFn = null;
  }

  setBlock(blockId, states = {}) {
    if (typeof blockId === "function") {
      this.blockFn = blockId;
    } else if (typeof blockId === "object" && blockId !== null) {
      this.blockId = blockId.blockId;
      this.states = blockId.states ?? {};
    } else {
      this.blockId = blockId;
      this.states = states;
    }
    return this;
  }

  getBlockState(x, y, z) {
    if (this.blockFn) {
      return this.blockFn(x, y, z);
    }
    return { blockId: this.blockId, states: { ...this.states } };
  }
}

export class SDFSphere extends SDFPrimitive {
  constructor(radius = 1.0, blockId = "minecraft:end_stone", states = {}) {
    super(blockId, states);
    this.radius = radius;
  }

  setRadius(r) {
    this.radius = r;
    return this;
  }

  getDistance(x, y, z) {
    return Math.hypot(x, y, z) - this.radius;
  }
}

export class SDFCappedCone extends SDFPrimitive {
  constructor(radius1 = 1.0, radius2 = 1.0, height = 1.0, blockId = "minecraft:end_stone", states = {}) {
    super(blockId, states);
    this.radius1 = radius1;
    this.radius2 = radius2;
    this.height = height;
  }

  setRadius1(r1) {
    this.radius1 = r1;
    return this;
  }

  setRadius2(r2) {
    this.radius2 = r2;
    return this;
  }

  setHeight(h) {
    this.height = h;
    return this;
  }

  getDistance(x, y, z) {
    const qx = Math.hypot(x, z);
    const k2x = this.radius2 - this.radius1;
    const k2y = 2.0 * this.height;
    const cax = qx - Math.min(qx, y < 0.0 ? this.radius1 : this.radius2);
    const cay = Math.abs(y) - this.height;
    const dotK2 = k2x * k2x + k2y * k2y;
    const t =
      dotK2 > 1e-6
        ? MHelper.clamp(((this.radius2 - qx) * k2x + (this.height - y) * k2y) / dotK2, 0.0, 1.0)
        : 0.0;
    const cbx = qx - this.radius2 + k2x * t;
    const cby = y - this.height + k2y * t;
    const s = cbx < 0.0 && cay < 0.0 ? -1.0 : 1.0;
    return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
  }
}

export class SDFHexPrism extends SDFPrimitive {
  constructor(height = 1.0, radius = 1.0, blockId = "minecraft:end_stone", states = {}) {
    super(blockId, states);
    this.height = height;
    this.radius = radius;
  }

  setHeight(h) {
    this.height = h;
    return this;
  }

  setRadius(r) {
    this.radius = r;
    return this;
  }

  getDistance(x, y, z) {
    const px = Math.abs(x);
    const py = Math.abs(y);
    const pz = Math.abs(z);
    return Math.max(py - this.height, Math.max(px * 0.8660254 + pz * 0.5, pz) - this.radius);
  }
}

export class SDFTorus extends SDFPrimitive {
  constructor(bigRadius = 5.0, smallRadius = 1.0, blockId = "minecraft:end_stone", states = {}) {
    super(blockId, states);
    this.bigRadius = bigRadius;
    this.smallRadius = smallRadius;
  }

  setBigRadius(r) {
    this.bigRadius = r;
    return this;
  }

  setSmallRadius(r) {
    this.smallRadius = r;
    return this;
  }

  getDistance(x, y, z) {
    const nx = Math.hypot(x, z) - this.bigRadius;
    return Math.hypot(nx, y) - this.smallRadius;
  }
}

export class SDFLine extends SDFPrimitive {
  constructor(x1, y1, z1, x2, y2, z2, radius, blockId = "minecraft:end_stone", states = {}) {
    super(blockId, states);
    this.x1 = x1;
    this.y1 = y1;
    this.z1 = z1;
    this.x2 = x2;
    this.y2 = y2;
    this.z2 = z2;
    this.radius = radius;
  }

  getDistance(x, y, z) {
    const pax = x - this.x1;
    const pay = y - this.y1;
    const paz = z - this.z1;
    const bax = this.x2 - this.x1;
    const bay = this.y2 - this.y1;
    const baz = this.z2 - this.z1;
    const dotBA = bax * bax + bay * bay + baz * baz;
    const h = dotBA > 1e-6 ? MHelper.clamp((pax * bax + pay * bay + paz * baz) / dotBA, 0.0, 1.0) : 0.0;
    return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - this.radius;
  }
}

export class SDFFlatland extends SDFPrimitive {
  getDistance(_x, y, _z) {
    return y;
  }
}

export class SDFTranslate extends SDF {
  constructor(dx, dy, dz, source) {
    super();
    this.dx = dx;
    this.dy = dy;
    this.dz = dz;
    this.source = source;
  }

  getDistance(x, y, z) {
    return this.source.getDistance(x - this.dx, y - this.dy, z - this.dz);
  }

  getBlockState(x, y, z) {
    return this.source.getBlockState(x, y, z);
  }
}

export class SDFRotation extends SDF {
  constructor(axis, angle, source) {
    super();
    this.axis = normalizeVec3(axis);
    this.angle = angle;
    this.source = source;
  }

  getDistance(x, y, z) {
    const p = rotateAroundAxis(x, y, z, this.axis, -this.angle);
    return this.source.getDistance(p.x, p.y, p.z);
  }

  getBlockState(x, y, z) {
    return this.source.getBlockState(x, y, z);
  }
}

export class SDFScale extends SDF {
  constructor(scale, source) {
    super();
    this.scale = scale;
    this.source = source;
  }

  getDistance(x, y, z) {
    return this.source.getDistance(x / this.scale, y / this.scale, z / this.scale) * this.scale;
  }

  getBlockState(x, y, z) {
    return this.source.getBlockState(x, y, z);
  }
}

export class SDFScale3D extends SDF {
  constructor(sx, sy, sz, source) {
    super();
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.source = source;
  }

  getDistance(x, y, z) {
    return this.source.getDistance(x / this.sx, y / this.sy, z / this.sz);
  }

  getBlockState(x, y, z) {
    return this.source.getBlockState(x, y, z);
  }
}

export class SDFDisplacement extends SDF {
  constructor(fn, source) {
    super();
    this.fn = fn;
    this.source = source;
  }

  getDistance(x, y, z) {
    return this.source.getDistance(x, y, z) + this.fn(x, y, z);
  }

  getBlockState(x, y, z) {
    return this.source.getBlockState(x, y, z);
  }
}

export class SDFCoordModify extends SDF {
  constructor(fn, source) {
    super();
    this.fn = fn;
    this.source = source;
  }

  getDistance(x, y, z) {
    const p = { x, y, z };
    this.fn(p);
    return this.source.getDistance(p.x, p.y, p.z);
  }

  getBlockState(x, y, z) {
    return this.source.getBlockState(x, y, z);
  }
}

export class SDFFlatWave extends SDF {
  constructor(raysCount, intensity, angle, source) {
    super();
    this.raysCount = raysCount;
    this.intensity = intensity;
    this.angle = angle;
    this.source = source;
  }

  getDistance(x, y, z) {
    const da = Math.cos(Math.atan2(x, z) * this.raysCount + this.angle) * this.intensity;
    return this.source.getDistance(x, y + da, z);
  }

  getBlockState(x, y, z) {
    return this.source.getBlockState(x, y, z);
  }
}

export class SDFUnion extends SDF {
  constructor(sourceA, sourceB) {
    super();
    this.sourceA = sourceA;
    this.sourceB = sourceB;
  }

  getDistance(x, y, z) {
    const dA = this.sourceA.getDistance(x, y, z);
    const dB = this.sourceB.getDistance(x, y, z);
    this._pickB = dB < dA;
    return dA < dB ? dA : dB;
  }

  getBlockState(x, y, z) {
    return this._pickB ? this.sourceB.getBlockState(x, y, z) : this.sourceA.getBlockState(x, y, z);
  }
}

export class SDFSmoothUnion extends SDF {
  constructor(radius, sourceA, sourceB) {
    super();
    this.radius = radius;
    this.sourceA = sourceA;
    this.sourceB = sourceB;
  }

  getDistance(x, y, z) {
    const dA = this.sourceA.getDistance(x, y, z);
    const dB = this.sourceB.getDistance(x, y, z);
    this._pickB = dB < dA;
    const h = MHelper.clamp(0.5 + (0.5 * (dB - dA)) / this.radius, 0.0, 1.0);
    return MHelper.lerp(h, dB, dA) - this.radius * h * (1.0 - h);
  }

  getBlockState(x, y, z) {
    return this._pickB ? this.sourceB.getBlockState(x, y, z) : this.sourceA.getBlockState(x, y, z);
  }
}

export class SDFSubtraction extends SDF {
  constructor(sourceA, sourceB) {
    super();
    this.sourceA = sourceA;
    this.sourceB = sourceB;
  }

  getDistance(x, y, z) {
    const dA = this.sourceA.getDistance(x, y, z);
    const dB = this.sourceB.getDistance(x, y, z);
    return Math.max(dA, -dB);
  }

  getBlockState(x, y, z) {
    return this.sourceA.getBlockState(x, y, z);
  }
}

export class SDFRound extends SDF {
  constructor(radius, source) {
    super();
    this.radius = radius;
    this.source = source;
  }

  getDistance(x, y, z) {
    return this.source.getDistance(x, y, z) - this.radius;
  }

  getBlockState(x, y, z) {
    return this.source.getBlockState(x, y, z);
  }
}

// ============================================================================
// 2. BCLib `SplineHelper` (`org.betterx.bclib.util.SplineHelper`)
// ============================================================================

export class SplineHelper {
  static makeSpline(x1, y1, z1, x2, y2, z2, points) {
    const spline = [{ x: x1, y: y1, z: z1 }];
    const count = points - 1;
    for (let i = 1; i < points; i++) {
      const delta = i / points;
      spline.push({
        x: MHelper.lerp(delta, x1, x2),
        y: MHelper.lerp(delta, y1, y2),
        z: MHelper.lerp(delta, z1, z2)
      });
    }
    if (count >= 0) {
      spline.push({ x: x2, y: y2, z: z2 });
    }
    return spline;
  }

  static copySpline(spline) {
    return spline.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  }

  static offsetParts(spline, rng, dx, dy, dz) {
    for (let i = 1; i < spline.length - 1; i++) {
      const pt = spline[i];
      pt.x += nextGaussian(rng) * dx;
      pt.y += nextGaussian(rng) * dy;
      pt.z += nextGaussian(rng) * dz;
    }
  }

  static powerOffset(spline, dist, power) {
    const max = spline.length - 1;
    for (let i = 1; i < spline.length; i++) {
      const t = i / max;
      spline[i].y += Math.pow(t, power) * dist;
    }
  }

  static rotateSpline(spline, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (const pt of spline) {
      const nx = pt.x * c - pt.z * s;
      const nz = pt.x * s + pt.z * c;
      pt.x = nx;
      pt.z = nz;
    }
  }

  static scale(spline, sx, sy = sx, sz = sx) {
    for (const pt of spline) {
      pt.x *= sx;
      pt.y *= sy;
      pt.z *= sz;
    }
  }

  static getPos(spline, index) {
    const i = Math.floor(index);
    const max = spline.length - 1;
    if (i >= max) return { ...spline[max] };
    const delta = index - i;
    const p1 = spline[i];
    const p2 = spline[i + 1];
    return {
      x: MHelper.lerp(delta, p1.x, p2.x),
      y: MHelper.lerp(delta, p1.y, p2.y),
      z: MHelper.lerp(delta, p1.z, p2.z)
    };
  }

  static buildSDF(spline, radius1, radius2, blockStateOrFn) {
    const count = spline.length;
    const max = count - 2;
    let result = null;
    for (let i = 0; i < count - 1; i++) {
      const p1 = spline[i];
      const p2 = spline[i + 1];
      const r = max > 0 ? MHelper.lerp(i / max, radius1, radius2) : radius1;
      const line = new SDFLine(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, r).setBlock(blockStateOrFn);
      result = result === null ? line : new SDFUnion(result, line);
    }
    return result;
  }

  static fillSpline(spline, grid, originX, originY, originZ, blockId, states = {}, role = "tree_trunk") {
    for (let i = 0; i < spline.length - 1; i++) {
      const p1 = spline[i];
      const p2 = spline[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) * 2));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const bx = Math.round(originX + p1.x + dx * t);
        const by = Math.round(originY + p1.y + dy * t);
        const bz = Math.round(originZ + p1.z + dz * t);
        grid.set(bx, by, bz, blockId, states, role);
      }
    }
  }
}

// ============================================================================
// 3. Local Voxel Grid & Fur/Support Post-Processors
// ============================================================================

export class VoxelGrid {
  constructor() {
    this.voxels = new Map();
  }

  _key(x, y, z) {
    return `${Math.trunc(x)},${Math.trunc(y)},${Math.trunc(z)}`;
  }

  set(x, y, z, blockId, states = {}, role = "feature") {
    const bx = Math.trunc(x);
    const by = Math.trunc(y);
    const bz = Math.trunc(z);
    const clonedStates = { ...states };
    this.voxels.set(`${bx},${by},${bz}`, {
      x: bx,
      y: by,
      z: bz,
      blockId,
      states: clonedStates,
      props: clonedStates,
      role
    });
  }

  get(x, y, z) {
    return this.voxels.get(this._key(x, y, z)) ?? null;
  }

  has(x, y, z) {
    return this.voxels.has(this._key(x, y, z));
  }

  delete(x, y, z) {
    this.voxels.delete(this._key(x, y, z));
  }

  toArray() {
    return [...this.voxels.values()];
  }
}

const FUR_BLOCK_IDS = new Set([
  "betterend:mossy_glowshroom_fur",
  "betterend:tenanea_outer_leaves",
  "betterend:lucernia_outer_leaves",
  "betterend:amaranita_fur",
  "betterend:glowing_pillar_leaves",
  "betterend:blue_vine_fur",
  "betterend:filalux_wings"
]);

export function pruneUnsupportedFur(grid) {
  let removed = true;
  while (removed) {
    removed = false;
    for (const v of [...grid.voxels.values()]) {
      if (!FUR_BLOCK_IDS.has(v.blockId)) continue;
      const facing = v.states?.facing ?? "up";
      const dir = ALL_DIRS.find((d) => d.name === facing);
      if (!dir) continue;
      const support = grid.get(v.x - dir.dx, v.y - dir.dy, v.z - dir.dz);
      if (!support || FUR_BLOCK_IDS.has(support.blockId) || support.blockId === "minecraft:air") {
        grid.delete(v.x, v.y, v.z);
        removed = true;
      }
    }
  }
}

// ============================================================================
// 4. All 11 BetterEnd Tree Generators (`world/features/trees/`)
// ============================================================================

export function generateMossyGlowshroom(grid, ox, oy, oz, rng, isGiant = false) {
  const height = MHelper.randRange(11.0, 17.0, rng);
  const count = Math.max(2, Math.floor(height / 4));
  const spline = SplineHelper.makeSpline(0, 0, 0, 0, height, 0, count);
  SplineHelper.offsetParts(spline, rng, 0.8, 0, 0.8);
  const trunkSDF = SplineHelper.buildSDF(spline, 1.9, 1.3, {
    blockId: "betterend:mossy_glowshroom_log",
    states: { axis: "y" }
  });
  const lastPos = spline[spline.length - 1];
  const scale = isGiant ? MHelper.randRange(1.25, 1.45, rng) : MHelper.randRange(0.65, 0.85, rng);

  // Cap & Roots SDF Graph (exact MossyGlowshroomFeature.java)
  const cone1 = new SDFCappedCone(1.5, 2.5, 2.5, "betterend:mossy_glowshroom_cap", {
    transition: false
  });
  const cone2 = new SDFCappedCone(2.5, 11.0, 3.0, "betterend:mossy_glowshroom_cap", {
    transition: false
  });
  const posedCone2 = new SDFTranslate(0, 5.0, 0, cone2);
  const posedCone3 = new SDFTranslate(0, 11.5, 0, new SDFScale(2.0, cone2));
  const upCone = new SDFSubtraction(posedCone2, posedCone3);
  const wave = new SDFFlatWave(12, 1.1, 0, upCone);
  let cones = new SDFSmoothUnion(2.5, cone1, wave);
  const innerCone = new SDFScale3D(1.15, 1.0, 1.15, new SDFTranslate(0, 1.25, 0, upCone));
  cones = new SDFUnion(cones, innerCone);

  const glowCone = new SDFCappedCone(2.0, 10.5, 3.0, "betterend:mossy_glowshroom_hymenophore", {});
  const posedGlowCone = new SDFSubtraction(new SDFTranslate(0, 4.25, 0, glowCone), posedCone3);
  cones = new SDFUnion(cones, posedGlowCone);

  const noise = new OpenSimplexNoise(1234);
  cones = new SDFCoordModify((p) => {
    const dist = Math.hypot(p.x, p.z);
    p.y = p.y + noise.eval(p.x * 0.1 + ox, p.z * 0.1 + oz) * dist * 0.25 - dist * 0.14;
  }, cones);

  const headPos = new SDFTranslate(lastPos.x, lastPos.y + 2.2, lastPos.z, cones);
  const rootsSphere = new SDFSphere(3.4, "betterend:mossy_glowshroom_bark", {});
  const roots = new SDFFlatWave(
    5,
    1.2,
    rng.nextFloat() * PI2,
    new SDFScale3D(1.0, 0.7, 1.0, rootsSphere)
  );

  let tree = new SDFSmoothUnion(3.0, trunkSDF, new SDFUnion(headPos, roots));
  tree = new SDFScale(scale, tree);
  if (isGiant) {
    tree = new SDFRound(0.8, tree);
  }

  const isLog = (id) =>
    id === "betterend:mossy_glowshroom_log" || id === "betterend:mossy_glowshroom_bark";

  tree.addPostProcess((info) => {
    const cur = info.getState();
    const up = info.getStateUp();
    const down = info.getStateDown();
    if (isLog(cur.blockId)) {
      if (rng.nextBoolean() && up.blockId === "betterend:mossy_glowshroom_cap") {
        return { blockId: "betterend:mossy_glowshroom_cap", states: { transition: true } };
      }
      if (!isLog(up.blockId) || !isLog(down.blockId)) {
        return { blockId: "betterend:mossy_glowshroom_bark", states: {} };
      }
    } else if (cur.blockId === "betterend:mossy_glowshroom_cap") {
      return {
        blockId: "betterend:mossy_glowshroom_cap",
        states: { transition: isLog(down.blockId) }
      };
    } else if (cur.blockId === "betterend:mossy_glowshroom_hymenophore") {
      for (const dir of HORIZONTAL_DIRS) {
        if (info.getStateDir(dir).blockId === "minecraft:air") {
          info.setBlockPos(
            info.x + dir.dx,
            info.y,
            info.z + dir.dz,
            "betterend:mossy_glowshroom_fur",
            { facing: dir.name, waterlogged: false },
            "tree_crown"
          );
        }
      }
      if (down.blockId === "minecraft:air") {
        info.setBlockPos(
          info.x,
          info.y - 1,
          info.z,
          "betterend:mossy_glowshroom_fur",
          { facing: "down", waterlogged: false },
          "tree_crown"
        );
      }
    }
    return null;
  });

  const maxR = Math.ceil(13 * scale) + 2;
  const maxH = Math.ceil((height + 10) * scale) + 2;
  tree.fillArea(
    grid,
    ox,
    oy,
    oz,
    ox - maxR,
    oy - 2,
    oz - maxR,
    ox + maxR,
    oy + maxH,
    oz + maxR,
    isGiant ? "structure_core" : "tree_trunk"
  );
  pruneUnsupportedFur(grid);
}

export function generatePythadendronTree(grid, ox, oy, oz, rng) {
  const size = MHelper.randRange(10.0, 15.0, rng);
  const spline = SplineHelper.makeSpline(0, 0, 0, 0, size, 0, 4);
  SplineHelper.offsetParts(spline, rng, 0.6, 0, 0.6);
  const last = spline[spline.length - 1];
  const depth = Math.max(1, Math.min(2, Math.floor(((size - 10.0) * 3.0) / 10.0 + 1.0)));
  const bsize = (10.0 - (size - 10.0)) / 10.0 + 1.3;

  const leavesBall = (bx, by, bz) => {
    const radius = MHelper.randRange(3.5, 4.8, rng);
    const noise = new OpenSimplexNoise(rng.nextInt());
    let sphere = new SDFSphere(radius, "betterend:pythadendron_leaves", {
      distance: 1,
      persistent: true,
      waterlogged: false
    });
    sphere = new SDFScale3D(1.0, 0.6, 1.0, sphere);
    sphere = new SDFDisplacement(
      (x, y, z) => noise.eval(x * 0.2, y * 0.2, z * 0.2) * 1.8 + (rng.nextFloat() * 1.4 - 0.7),
      sphere
    );
    sphere = new SDFSubtraction(sphere, new SDFTranslate(0, -radius, 0, sphere));
    const r = Math.ceil(radius + 2);
    sphere.fillArea(grid, bx, by, bz, bx - r, by - r, bz - r, bx + r, by + r, bz + r, "tree_canopy");
  };

  const branch = (x, y, z, bLen, angle, d) => {
    if (d <= 0) return;
    const dx = Math.cos(angle) * bLen * 0.15;
    const dz = Math.sin(angle) * bLen * 0.15;
    for (const sign of [1, -1]) {
      const sp = SplineHelper.makeSpline(x, y, z, x + dx * sign, y, z + dz * sign, 4);
      SplineHelper.powerOffset(sp, bLen * MHelper.randRange(0.8, 1.3, rng) * 0.35, 3);
      SplineHelper.offsetParts(sp, rng, 0.25, 0, 0.25);
      SplineHelper.fillSpline(sp, grid, ox, oy, oz, "betterend:pythadendron_bark", {}, "tree_trunk");
      const tip = sp[sp.length - 1];
      leavesBall(Math.round(ox + tip.x), Math.round(oy + tip.y), Math.round(oz + tip.z));
      branch(
        tip.x,
        tip.y,
        tip.z,
        bLen * MHelper.randRange(0.75, 0.9, rng),
        angle + PI * 0.5 + MHelper.randRange(-0.1, 0.1, rng),
        d - 1
      );
    }
  };

  branch(last.x, last.y, last.z, size * bsize * 0.5, rng.nextFloat() * PI2, depth);

  const trunkSDF = SplineHelper.buildSDF(spline, 1.6, 1.0, {
    blockId: "betterend:pythadendron_bark",
    states: {}
  });
  trunkSDF.addPostProcess((info) => {
    const up = info.getStateUp().blockId;
    const down = info.getStateDown().blockId;
    if (up.includes("pythadendron_") && down.includes("pythadendron_")) {
      return { blockId: "betterend:pythadendron_log", states: { axis: "y" } };
    }
    return null;
  });
  trunkSDF.fillArea(
    grid,
    ox,
    oy,
    oz,
    ox - 4,
    oy - 1,
    oz - 4,
    ox + 4,
    oy + Math.ceil(size) + 2,
    oz + 4,
    "tree_trunk"
  );
}

export function generateLacugrove(grid, ox, oy, oz, rng) {
  const size = MHelper.randRange(12.0, 18.0, rng);
  const spline = SplineHelper.makeSpline(0, 0, 0, 0, size, 0, 6);
  SplineHelper.offsetParts(spline, rng, 0.8, 0, 0.8);
  const noise = new OpenSimplexNoise(rng.nextInt());
  const radius = MHelper.randRange(4.8, 6.2, rng);
  const center = spline[4];
  const cx = Math.round(ox + center.x);
  const cy = Math.round(oy + center.y);
  const cz = Math.round(oz + center.z);

  let sphere = new SDFSphere(radius, "betterend:lacugrove_leaves", {
    distance: 1,
    persistent: true,
    waterlogged: false
  });
  sphere = new SDFDisplacement(
    (x, y, z) => noise.eval(x * 0.2, y * 0.2, z * 0.2) * 2.0 + (rng.nextFloat() * 1.4 - 0.7),
    sphere
  );
  sphere = new SDFSubtraction(sphere, new SDFTranslate(0, -radius - 2, 0, sphere));
  const r = Math.ceil(radius + 2);
  sphere.fillArea(grid, cx, cy, cz, cx - r, cy - r, cz - r, cx + r, cy + r, cz + r, "tree_canopy");

  const trunkSDF = SplineHelper.buildSDF(spline, MHelper.randRange(1.2, 1.6, rng), 0.7, {
    blockId: "betterend:lacugrove_bark",
    states: {}
  });
  trunkSDF.addPostProcess((info) => {
    const up = info.getStateUp().blockId;
    const down = info.getStateDown().blockId;
    if (up.includes("lacugrove_") && down.includes("lacugrove_")) {
      return { blockId: "betterend:lacugrove_log", states: { axis: "y" } };
    }
    return null;
  });
  trunkSDF.fillArea(
    grid,
    ox,
    oy,
    oz,
    ox - 4,
    oy - 1,
    oz - 4,
    ox + 4,
    oy + Math.ceil(size) + 2,
    oz + 4,
    "tree_trunk"
  );

  // Ground Root Pillars (LacugroveFeature.java lines 96-132)
  const parity = rng.nextInt(2);
  for (let i = 0; i < 45; i++) {
    const px = ox + MHelper.randRange(-4.0, 4.0, rng);
    const pz = oz + MHelper.randRange(-4.0, 4.0, rng);
    const mx = Math.floor(px + 0.5);
    const mz = Math.floor(pz + 0.5);
    if (((mx + mz + parity) & 1) === 0) {
      const distance = 3.2 - Math.hypot(px - ox, pz - oz) * 0.5;
      if (distance > 0) {
        const minY = Math.floor(oy - distance * 0.5);
        const maxY = Math.floor(oy + distance + rng.nextFloat());
        const top = maxY - 1;
        for (let y = top; y >= minY; y--) {
          grid.set(
            mx,
            y,
            mz,
            y === top ? "betterend:lacugrove_bark" : "betterend:lacugrove_log",
            y === top ? {} : { axis: "y" },
            "tree_trunk"
          );
        }
      }
    }
  }
}

const DRAGON_BRANCH = [
  { x: 0, y: 0, z: 0 },
  { x: 0.1, y: 0.3, z: 0 },
  { x: 0.4, y: 0.6, z: 0 },
  { x: 0.8, y: 0.8, z: 0 },
  { x: 1.0, y: 1.0, z: 0 }
];
const DRAGON_ROOT = [
  { x: 0, y: 0.55, z: 0 },
  { x: 0.1, y: 0.25, z: 0 },
  { x: 0.3, y: -0.15, z: 0 },
  { x: 0.7, y: -0.4, z: 0 },
  { x: 0.8, y: -0.65, z: 0 }
];

export function generateDragonTree(grid, ox, oy, oz, rng) {
  const size = MHelper.randRange(11.0, 17.0, rng);
  const spline = SplineHelper.makeSpline(0, 0, 0, 0, size, 0, 6);
  SplineHelper.offsetParts(spline, rng, 0.8, 0, 0.8);
  const capOrigin = SplineHelper.getPos(spline, 3.5);
  const noise = new OpenSimplexNoise(rng.nextInt());
  const radius = size * MHelper.randRange(0.45, 0.6, rng);

  const capX = Math.round(ox + capOrigin.x);
  const capY = Math.round(oy + capOrigin.y);
  const capZ = Math.round(oz + capOrigin.z);
  const count = Math.max(4, Math.floor(radius));
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * PI2;
    const brScale = radius * MHelper.randRange(0.85, 1.15, rng);
    const br = SplineHelper.copySpline(DRAGON_BRANCH);
    SplineHelper.rotateSpline(br, angle);
    SplineHelper.scale(br, brScale);
    SplineHelper.fillSpline(br, grid, capX, capY, capZ, "betterend:dragon_tree_bark", {}, "tree_trunk");
  }

  const ballCenterY = capY + Math.floor(radius);
  const ballRadius = radius * 1.1 + 1.5;
  let sphere = new SDFSphere(ballRadius, "betterend:dragon_tree_leaves", {
    distance: 1,
    persistent: true,
    waterlogged: false
  });
  const sub = new SDFTranslate(0, -ballRadius * 5, 0, new SDFScale(5, sphere));
  sphere = new SDFSubtraction(sphere, sub);
  sphere = new SDFScale3D(1.0, 0.5, 1.0, sphere);
  sphere = new SDFDisplacement(
    (x, y, z) => noise.eval(x * 0.2, y * 0.2, z * 0.2) * 1.3 + (rng.nextFloat() * 1.4 - 0.7),
    sphere
  );
  const r = Math.ceil(ballRadius + 2);
  sphere.fillArea(
    grid,
    capX,
    ballCenterY,
    capZ,
    capX - r,
    ballCenterY - Math.ceil(r * 0.6),
    capZ - r,
    capX + r,
    ballCenterY + Math.ceil(r * 0.6),
    capZ + r,
    "tree_canopy"
  );

  // Roots
  const rootCount = Math.max(4, Math.floor(radius * 1.2));
  for (let i = 0; i < rootCount; i++) {
    const angle = (i / rootCount) * PI2;
    const rt = SplineHelper.copySpline(DRAGON_ROOT);
    SplineHelper.rotateSpline(rt, angle);
    SplineHelper.scale(rt, radius * MHelper.randRange(0.85, 1.1, rng) * 0.65);
    SplineHelper.fillSpline(rt, grid, ox, oy, oz, "betterend:dragon_tree_bark", {}, "tree_trunk");
  }

  const trunkSDF = SplineHelper.buildSDF(spline, MHelper.randRange(1.3, 1.9, rng), 1.1, {
    blockId: "betterend:dragon_tree_bark",
    states: {}
  });
  trunkSDF.addPostProcess((info) => {
    const up = info.getStateUp().blockId;
    const down = info.getStateDown().blockId;
    if (up.includes("dragon_tree_") && down.includes("dragon_tree_")) {
      return { blockId: "betterend:dragon_tree_log", states: { axis: "y" } };
    }
    return null;
  });
  trunkSDF.fillArea(
    grid,
    ox,
    oy,
    oz,
    ox - 4,
    oy - 2,
    oz - 4,
    ox + 4,
    oy + Math.ceil(size) + 2,
    oz + 4,
    "tree_trunk"
  );
}

export function generateDragonHelixTree(grid, ox, oy, oz, rng) {
  const height = MHelper.randRange(11, 17, rng);
  const maxRadius = MHelper.randRange(3, 4, rng);
  const foliageStart = MHelper.randRange(2, 3, rng);
  const topY = oy + height;
  const helixPhase = rng.nextFloat() * PI2;
  const HELIX_TURN = 1.15;
  const HELIX_REACH = 1.8;

  for (let i = 0; i <= height; i++) {
    grid.set(ox, oy + i, oz, "betterend:dragon_tree_log", { axis: "y" }, "tree_trunk");
  }

  const lowestRingY = oy + foliageStart;
  const skirt = [];
  for (let y = lowestRingY; y <= topY; y++) {
    const fromTop = topY - y;
    const radius = Math.min(maxRadius, Math.floor((fromTop + 1) / 2));
    const helixAngle = helixPhase + (y - lowestRingY) * HELIX_TURN;
    const scan = radius + Math.ceil(HELIX_REACH);
    for (let dx = -scan; dx <= scan; dx++) {
      for (let dz = -scan; dz <= scan; dz++) {
        if (dx === 0 && dz === 0) continue;
        const d2 = dx * dx + dz * dz;
        const align = Math.max(0, Math.cos(Math.atan2(dz, dx) - helixAngle));
        const effR = radius + align * HELIX_REACH;
        if (d2 > effR * effR) continue;
        grid.set(
          ox + dx,
          y,
          oz + dz,
          "betterend:lucernia_leaves",
          { distance: 1, persistent: true, waterlogged: false },
          "tree_canopy"
        );
        if (y === lowestRingY && d2 >= (effR - 1) * (effR - 1)) {
          skirt.push({ x: ox + dx, y, z: oz + dz });
        }
      }
    }
  }

  for (let t = 1; t <= 2; t++) {
    grid.set(
      ox,
      topY + t,
      oz,
      "betterend:lucernia_leaves",
      { distance: 1, persistent: true, waterlogged: false },
      "tree_canopy"
    );
  }

  for (const leafPos of skirt) {
    if (rng.nextFloat() < 0.6) {
      const len = MHelper.randRange(1, 3, rng);
      for (let k = 1; k <= len; k++) {
        const shape = k === len ? "bottom" : k === 1 ? "top" : "middle";
        grid.set(leafPos.x, leafPos.y - k, leafPos.z, "betterend:bulb_vine", { shape }, "tree_crown");
      }
    }
  }
}

const TENANEA_SPLINE = [
  { x: 0.0, y: 0.0, z: 0.0 },
  { x: 0.1, y: 0.35, z: 0.0 },
  { x: 0.2, y: 0.5, z: 0.0 },
  { x: 0.3, y: 0.55, z: 0.0 },
  { x: 0.42, y: 0.7, z: 0.0 },
  { x: 0.5, y: 1.0, z: 0.0 }
];

export function generateTenanea(grid, ox, oy, oz, rng) {
  const size = MHelper.randRange(7, 10, rng);
  const count = Math.max(3, Math.floor(size * 0.45));
  const variation = PI2 / (count * 3);
  const start = rng.nextFloat() * PI2;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * PI2 + rng.nextFloat() * variation + start;
    const spline = SplineHelper.copySpline(TENANEA_SPLINE);
    SplineHelper.rotateSpline(spline, angle);
    SplineHelper.scale(spline, size + rng.nextFloat() * size * 0.4);
    SplineHelper.offsetParts(spline, rng, 0.7, 0, 0.7);
    SplineHelper.fillSpline(spline, grid, ox, oy, oz, "betterend:tenanea_bark", {}, "tree_trunk");
    const last = spline[spline.length - 1];
    const lx = Math.round(ox + last.x);
    const ly = Math.round(oy + last.y);
    const lz = Math.round(oz + last.z);
    const leavesRadius = (size * 0.3 + MHelper.randRange(0.8, 1.4, rng)) * 1.25;
    const noise = new OpenSimplexNoise(rng.nextInt());

    let sphere = new SDFSphere(leavesRadius, "betterend:tenanea_leaves", {
      distance: 1,
      persistent: true,
      waterlogged: false
    });
    const sub = new SDFTranslate(0, -leavesRadius * 5, 0, new SDFScale(5, sphere));
    sphere = new SDFSubtraction(sphere, sub);
    sphere = new SDFScale3D(1.0, 0.75, 1.0, sphere);
    sphere = new SDFDisplacement(
      (x, y, z) => noise.eval(x * 0.2, y * 0.2, z * 0.2) * 1.6 + MHelper.randRange(-1.0, 1.0, rng),
      sphere
    );

    const flowerSupports = [];
    sphere.addPostProcess((info) => {
      if (rng.nextInt(6) === 0 && info.getStateDown().blockId === "minecraft:air") {
        flowerSupports.push({ x: info.x, y: info.y - 1, z: info.z });
      }
      for (const dir of ALL_DIRS) {
        if (info.getStateDir(dir).blockId === "minecraft:air" && rng.nextInt(3) !== 0) {
          info.setBlockPos(
            info.x + dir.dx,
            info.y + dir.dy,
            info.z + dir.dz,
            "betterend:tenanea_outer_leaves",
            { facing: dir.name, waterlogged: false },
            "tree_crown"
          );
        }
      }
      return null;
    });

    const r = Math.ceil(leavesRadius + 2);
    sphere.fillArea(grid, lx, ly, lz, lx - r, ly - r, lz - r, lx + r, ly + r, lz + r, "tree_canopy");
    grid.set(lx, ly, lz, "betterend:tenanea_bark", {}, "tree_trunk");

    for (const sup of flowerSupports) {
      const above = grid.get(sup.x, sup.y + 1, sup.z);
      if (above && above.blockId === "betterend:tenanea_leaves") {
        const vLen = MHelper.randRange(3, 6, rng);
        for (let k = 0; k < vLen; k++) {
          const shape = k === vLen - 1 ? "bottom" : k === 0 ? "top" : "middle";
          grid.set(sup.x, sup.y - k, sup.z, "betterend:tenanea_flowers", { shape }, "tree_crown");
        }
      }
    }
  }
  pruneUnsupportedFur(grid);
}

export function generateHelixTree(grid, ox, oy, oz, rng) {
  const angle = rng.nextFloat() * PI2;
  const radiusRange = MHelper.randRange(4.2, 5.5, rng);
  const scale = MHelper.randRange(0.55, 0.85, rng);

  const spline = [];
  for (let i = 0; i < 10; i++) {
    const r = (0.9 - i * 0.1) * radiusRange;
    spline.push({
      x: Math.sin(i + angle) * r,
      y: i * 2.0,
      z: Math.cos(i + angle) * r
    });
  }
  const sdf1 = SplineHelper.buildSDF(spline, 1.5, 0.5, {
    blockId: "betterend:helix_tree_bark",
    states: {}
  });
  const sdf2 = new SDFRotation({ x: 0, y: 1, z: 0 }, PI, sdf1);
  const spline2 = SplineHelper.makeSpline(0, 0, 0, 0, 16, 0, 5);
  const stem = new SDFTranslate(
    0,
    18,
    0,
    SplineHelper.buildSDF(spline2, 1.0, 0.5, { blockId: "betterend:helix_tree_bark", states: {} })
  );
  const fullStem = new SDFScale(scale, new SDFSmoothUnion(2.5, new SDFUnion(sdf1, sdf2), stem));
  fullStem.addPostProcess((info) => {
    const up = info.getStateUp().blockId;
    const down = info.getStateDown().blockId;
    if (up.includes("helix_tree_") && down.includes("helix_tree_")) {
      return { blockId: "betterend:helix_tree_log", states: { axis: "y" } };
    }
    return null;
  });

  const maxR = Math.ceil(8 * scale) + 2;
  const maxH = Math.ceil(36 * scale) + 2;
  fullStem.fillArea(grid, ox, oy, oz, ox - maxR, oy - 1, oz - maxR, ox + maxR, oy + maxH, oz + maxR, "tree_trunk");

  // Force-fill both helix splines & stem so scaled sections never disconnect
  const spA = SplineHelper.copySpline(spline);
  SplineHelper.scale(spA, scale);
  SplineHelper.fillSpline(spA, grid, ox, oy, oz, "betterend:helix_tree_bark", {}, "tree_trunk");
  SplineHelper.rotateSpline(spA, PI);
  SplineHelper.fillSpline(spA, grid, ox, oy, oz, "betterend:helix_tree_bark", {}, "tree_trunk");

  const leafStartY = oy + Math.round(18 * scale);
  const spStem = SplineHelper.copySpline(spline2);
  SplineHelper.scale(spStem, scale);
  SplineHelper.fillSpline(spStem, grid, ox, leafStartY, oz, "betterend:helix_tree_log", { axis: "y" }, "tree_trunk");

  // Spiral leaf ribs (HelixTreeFeature.java lines 96-143)
  const rad = MHelper.randRange(7.5, 10.0, rng);
  const count = MHelper.randRange(18, 24, rng);
  const scaleM = (20.0 / count) * scale * 1.6;
  const hscale = (20.0 / count) * 0.05;
  const leafSpline = [];
  for (let i = 0; i <= count; i++) {
    let r = 1.0 - i * hscale;
    r = r * r * 2.0 - 1.0;
    r *= r;
    r = (1.0 - r) * rad * scale;
    leafSpline.push({
      x: Math.sin(i * 0.45 + angle) * r,
      y: i * scaleM,
      z: Math.cos(i * 0.45 + angle) * r
    });
  }

  const fillLeafLine = (sx, sy, sz, ex, ey, ez, colorOffset) => {
    const dx = ex - sx;
    const dy = ey - sy;
    const dz = ez - sz;
    const maxStep = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz))));
    for (let s = 0; s <= maxStep; s++) {
      const bx = Math.floor(ox + sx + (dx * s) / maxStep);
      const by = Math.floor(leafStartY + sy + (dy * s) / maxStep);
      const bz = Math.floor(oz + sz + (dz * s) / maxStep);
      const color = MHelper.clamp(Math.floor((s / maxStep) * 7.0 + 0.5) + colorOffset, 0, 7);
      if (!grid.has(bx, by, bz)) {
        grid.set(bx, by, bz, "betterend:helix_tree_leaves", { color }, "tree_canopy");
      }
    }
  };

  let prevPt = leafSpline[0];
  for (let i = 1; i < leafSpline.length; i++) {
    const pt = leafSpline[i];
    const minY = Math.floor(prevPt.y);
    const maxY = Math.floor(pt.y);
    const div = Math.max(0.1, pt.y - prevPt.y);
    const colorOff = Math.floor(i / 2) - 1;
    for (let py = minY; py <= maxY; py += 0.35) {
      const delta = (py - minY) / div;
      const px = MHelper.lerp(delta, prevPt.x, pt.x);
      const pz = MHelper.lerp(delta, prevPt.z, pt.z);
      fillLeafLine(0, py, 0, px, py, pz, colorOff);
      if (Math.abs(px) > Math.abs(pz)) {
        fillLeafLine(0, py, 1, px, py, pz + 1, colorOff);
      } else {
        fillLeafLine(1, py, 0, px + 1, py, pz, colorOff);
      }
    }
    prevPt = pt;
  }

  const topTipY = leafStartY + Math.floor(prevPt.y);
  for (let t = 0; t < 3; t++) {
    grid.set(ox, topTipY + t, oz, "betterend:helix_tree_leaves", { color: 7 }, "tree_crown");
  }
}

export function generateUmbrellaTree(grid, ox, oy, oz, rng) {
  const size = MHelper.randRange(10, 15, rng);
  const count = Math.max(2, Math.floor(size * 0.2));
  const variation = PI2 / (count * 3);
  const start = rng.nextFloat() * PI2;
  const centers = [];
  let sdf = null;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * PI2 + rng.nextFloat() * variation + start;
    const spline = SplineHelper.copySpline(TENANEA_SPLINE);
    const sizeXZ = (size + rng.nextFloat() * size * 0.4) * 0.65;
    SplineHelper.scale(spline, sizeXZ, sizeXZ * MHelper.randRange(1.1, 1.6, rng), sizeXZ);
    SplineHelper.rotateSpline(spline, angle);
    SplineHelper.offsetParts(spline, rng, 0.4, 0, 0.4);

    const branch = SplineHelper.buildSDF(spline, 1.3, 0.85, {
      blockId: "betterend:umbrella_tree_bark",
      states: {}
    });
    const vec = spline[spline.length - 1];
    const radius = (size + rng.nextFloat() * size * 0.4) * 0.38;
    const px = Math.floor(vec.x) + 0.5;
    const py = Math.floor(vec.y) + 0.5;
    const pz = Math.floor(vec.z) + 0.5;

    sdf = sdf === null ? branch : new SDFUnion(sdf, branch);

    let sphere = new SDFSphere(radius, "betterend:umbrella_tree_membrane", { color: 1 });
    sphere = new SDFSubtraction(sphere, new SDFTranslate(0, -4, 0, sphere));
    sphere = new SDFScale3D(1.0, 0.5, 1.0, sphere);
    sphere = new SDFTranslate(0, 1.0 - radius * 0.5, 0, sphere);
    const rays = Math.max(5, Math.floor(MHelper.randRange(radius, radius * 2, rng)));
    sphere = new SDFFlatWave(rays, 0.6, rng.nextFloat() * PI2, sphere);
    const cent = new SDFSphere(2.3, "betterend:umbrella_tree_membrane", { color: 0 });
    const mem = new SDFTranslate(px, py, pz, new SDFUnion(sphere, cent));

    sdf = new SDFSmoothUnion(2.0, sdf, mem);
    centers.push({ px: ox + px, py: oy + py, pz: oz + pz, radius });
  }

  sdf.addPostProcess((info) => {
    const cur = info.getState();
    const up = info.getStateUp().blockId;
    const down = info.getStateDown().blockId;
    if (cur.blockId === "betterend:umbrella_tree_bark" && up.includes("umbrella_tree_") && down.includes("umbrella_tree_")) {
      return { blockId: "betterend:umbrella_tree_log", states: { axis: "y" } };
    }
    if (cur.blockId === "betterend:umbrella_tree_membrane" && cur.states?.color === 1) {
      let bestC = centers[0];
      let bestD = Infinity;
      for (const c of centers) {
        const d = Math.hypot(c.px - info.x, c.pz - info.z);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      const color = MHelper.clamp(Math.floor((bestD / bestC.radius) * 7), 1, 7);
      return { blockId: "betterend:umbrella_tree_membrane", states: { color } };
    }
    return null;
  });

  const maxR = Math.ceil(size * 0.9) + 4;
  const maxH = Math.ceil(size * 1.8) + 4;
  sdf.fillArea(grid, ox, oy, oz, ox - maxR, oy - 2, oz - maxR, ox + maxR, oy + maxH, oz + maxR, "tree_canopy");

  // Roots
  const rootRadius = size * 0.45 + 2;
  const rootCount = Math.max(4, Math.floor(rootRadius * 1.2));
  for (let i = 0; i < rootCount; i++) {
    const rt = SplineHelper.copySpline(DRAGON_ROOT);
    SplineHelper.rotateSpline(rt, (i / rootCount) * PI2);
    SplineHelper.scale(rt, rootRadius * MHelper.randRange(0.85, 1.1, rng));
    SplineHelper.fillSpline(rt, grid, ox, oy, oz, "betterend:umbrella_tree_bark", {}, "tree_trunk");
  }

  // Hanging fruit clusters under membrane centers
  for (const c of centers) {
    const fCount = MHelper.randRange(4, 8, rng);
    const startAngle = rng.nextFloat() * PI2;
    for (let i = 0; i < fCount; i++) {
      const angle = (i / fCount) * PI2 + startAngle;
      const dist = MHelper.randRange(1.2, 2.2, rng);
      const fx = Math.floor(c.px + Math.sin(angle) * dist);
      const fz = Math.floor(c.pz + Math.cos(angle) * dist);
      for (let step = 0; step < 6; step++) {
        const fy = Math.floor(c.py - 1 - step);
        if (!grid.has(fx, fy, fz)) {
          const above = grid.get(fx, fy + 1, fz);
          if (above && above.blockId === "betterend:umbrella_tree_membrane") {
            grid.set(fx, fy, fz, "betterend:umbrella_tree_cluster", { natural: true }, "tree_crown");
          }
          break;
        }
      }
    }
  }
}

export function generateJellyshroom(grid, ox, oy, oz, rng) {
  const height = MHelper.randRange(5, 8, rng);
  const radius = height * MHelper.randRange(0.18, 0.25, rng);
  const spline = SplineHelper.makeSpline(0, -1, 0, 0, height, 0, 3);
  SplineHelper.offsetParts(spline, rng, 0.4, 0, 0.4);
  const trunk = SplineHelper.buildSDF(spline, radius, 0.8, {
    blockId: "betterend:jellyshroom_bark",
    states: {}
  });

  const membraneRadius = Math.max(2.5, height * MHelper.randRange(0.7, 0.9, rng));
  let cap = new SDFSphere(membraneRadius, "betterend:jellyshroom_cap_purple", { color: 0 });
  cap = new SDFSubtraction(cap, new SDFTranslate(0, -4, 0, cap));
  cap = new SDFScale3D(1.0, 0.5, 1.0, cap);
  cap = new SDFTranslate(0, 1.0 - membraneRadius * 0.5, 0, cap);
  const rays = Math.max(3, Math.floor(MHelper.randRange(membraneRadius * 0.5, membraneRadius, rng)));
  cap = new SDFFlatWave(rays, 0.2, rng.nextFloat() * PI2, cap);

  const last = spline[spline.length - 1];
  const posedCap = new SDFTranslate(last.x, last.y, last.z, cap);
  const sdf = new SDFSmoothUnion(2.5, trunk, posedCap);

  sdf.addPostProcess((info) => {
    const cur = info.getState();
    const up = info.getStateUp().blockId;
    const down = info.getStateDown().blockId;
    if (cur.blockId === "betterend:jellyshroom_bark" && up.includes("jellyshroom_") && down.includes("jellyshroom_")) {
      return { blockId: "betterend:jellyshroom_log", states: { axis: "y" } };
    }
    if (cur.blockId === "betterend:jellyshroom_cap_purple") {
      const dx = info.x - ox - last.x;
      const dz = info.z - oz - last.z;
      const color = MHelper.clamp(Math.floor((Math.hypot(dx, dz) / membraneRadius) * 7.0), 0, 7);
      return { blockId: "betterend:jellyshroom_cap_purple", states: { color } };
    }
    return null;
  });

  const maxR = Math.ceil(membraneRadius + 3);
  sdf.fillArea(grid, ox, oy, oz, ox - maxR, oy - 2, oz - maxR, ox + maxR, oy + height + 5, oz + maxR, "tree_canopy");
}

export function generateGiganticAmaranita(grid, ox, oy, oz, rng) {
  const size = MHelper.randRange(6, 10, rng);
  const spline = SplineHelper.makeSpline(0, 0, 0, 0, size, 0, 5);
  SplineHelper.offsetParts(spline, rng, 0.6, 0, 0.6);
  const radius = size * 0.17;
  const stemSDF = SplineHelper.buildSDF(spline, radius, 0.25, {
    blockId: "betterend:amaranita_stem",
    states: { axis: "y" }
  });
  stemSDF.addPostProcess((info) => {
    const up = info.getStateUp().blockId;
    const down = info.getStateDown().blockId;
    if (up !== "betterend:amaranita_stem" || down !== "betterend:amaranita_stem") {
      return { blockId: "betterend:amaranita_hyphae", states: { axis: "y" } };
    }
    return null;
  });
  stemSDF.fillArea(grid, ox, oy, oz, ox - 4, oy - 1, oz - 4, ox + 4, oy + size + 2, oz + 4, "tree_trunk");

  for (let i = 0; i < 3; i++) {
    const copy = SplineHelper.copySpline(spline);
    SplineHelper.offsetParts(copy, rng, 0.2, 0, 0.2);
    SplineHelper.fillSpline(copy, grid, ox, oy, oz, "betterend:amaranita_hyphae", { axis: "y" }, "tree_trunk");
  }

  const capPos = spline[spline.length - 1];
  const hx = Math.floor(ox + capPos.x + 0.5);
  const hy = Math.floor(oy + capPos.y + 1.5);
  const hz = Math.floor(oz + capPos.z + 0.5);
  const headR = Math.floor(size / 1.6);

  // Exact GiganticAmaranitaFeature.makeHead
  if (headR < 4) {
    const px = hx - 1;
    const pz = hz - 1;
    for (let i = -2; i <= 1; i++) {
      grid.set(px - i, hy, pz - 2, "betterend:amaranita_hymenophore", {}, "tree_canopy");
      grid.set(px - i, hy, pz + 3, "betterend:amaranita_hymenophore", {}, "tree_canopy");
      grid.set(px + 3, hy, pz - i, "betterend:amaranita_hymenophore", {}, "tree_canopy");
      grid.set(px - 2, hy, pz - i, "betterend:amaranita_hymenophore", {}, "tree_canopy");
    }
    for (let x = -1; x < 3; x++) {
      for (let z = -1; z < 3; z++) {
        grid.set(px + x, hy, pz + z, "betterend:amaranita_lantern", {}, "tree_crown");
        if (x >> 1 === 0 || z >> 1 === 0) {
          grid.set(px + x, hy - 1, pz + z, "betterend:amaranita_lantern", {}, "tree_crown");
          grid.set(
            px + x,
            hy - 2,
            pz + z,
            "betterend:amaranita_fur",
            { facing: "down", waterlogged: false },
            "tree_crown"
          );
        } else {
          grid.set(
            px + x,
            hy - 1,
            pz + z,
            "betterend:amaranita_fur",
            { facing: "down", waterlogged: false },
            "tree_crown"
          );
        }
      }
    }
    const h = Math.max(2, headR - 1);
    for (let y = 0; y < h; y++) {
      for (let x = -1; x < 3; x++) {
        for (let z = -1; z < 3; z++) {
          grid.set(px + x, hy + y + 1, pz + z, "betterend:amaranita_cap", {}, "tree_canopy");
        }
      }
    }
    for (let x = -1; x < 3; x++) {
      for (let z = -1; z < 3; z++) {
        if (x >> 1 === 0 || z >> 1 === 0) {
          grid.set(px + x, hy + h + 1, pz + z, "betterend:amaranita_cap", {}, "tree_canopy");
        }
      }
    }
  } else {
    for (let i = -2; i <= 2; i++) {
      for (const dir of HORIZONTAL_DIRS) {
        const perpX = dir.dz;
        const perpZ = dir.dx;
        grid.set(hx + dir.dx * 3 + perpX * i, hy, hz + dir.dz * 3 + perpZ * i, "betterend:amaranita_hymenophore", {}, "tree_canopy");
        grid.set(hx + dir.dx * 3 + perpX * i, hy + 1, hz + dir.dz * 3 + perpZ * i, "betterend:amaranita_hymenophore", {}, "tree_canopy");
        grid.set(hx + dir.dx * 4 + perpX * i, hy + 1, hz + dir.dz * 4 + perpZ * i, "betterend:amaranita_hymenophore", {}, "tree_canopy");
      }
    }
    for (const sx of [-3, 3]) {
      for (const sz of [-3, 3]) {
        grid.set(hx + sx, hy + 1, hz + sz, "betterend:amaranita_hymenophore", {}, "tree_canopy");
      }
    }
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        grid.set(hx + x, hy, hz + z, "betterend:amaranita_lantern", {}, "tree_crown");
        if (Math.trunc(x / 2) === 0 || Math.trunc(z / 2) === 0) {
          grid.set(hx + x, hy - 1, hz + z, "betterend:amaranita_lantern", {}, "tree_crown");
          grid.set(
            hx + x,
            hy - 2,
            hz + z,
            "betterend:amaranita_fur",
            { facing: "down", waterlogged: false },
            "tree_crown"
          );
        } else {
          grid.set(
            hx + x,
            hy - 1,
            hz + z,
            "betterend:amaranita_fur",
            { facing: "down", waterlogged: false },
            "tree_crown"
          );
        }
      }
    }
    for (let y = 1; y <= 3; y++) {
      for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
          grid.set(hx + x, hy + y, hz + z, "betterend:amaranita_cap", {}, "tree_canopy");
        }
      }
    }
    const h = headR + 1;
    for (let y = 4; y <= h; y++) {
      for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
          if (y < 6) {
            if (Math.trunc(x / 2) === 0 || Math.trunc(z / 2) === 0) {
              grid.set(hx + x, hy + y, hz + z, "betterend:amaranita_cap", {}, "tree_canopy");
            }
          } else if ((x === 0 || z === 0) && Math.abs(x) < 2 && Math.abs(z) < 2) {
            grid.set(hx + x, hy + y, hz + z, "betterend:amaranita_cap", {}, "tree_canopy");
          }
        }
      }
    }
  }
  pruneUnsupportedFur(grid);
}

export function generateLucernia(grid, ox, oy, oz, rng) {
  const size = MHelper.randRange(11, 16, rng);
  const count = Math.max(3, Math.floor(size * 0.3));
  const variation = PI2 / (count * 3);
  const start = rng.nextFloat() * PI2;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * PI2 + rng.nextFloat() * variation + start;
    const spline = SplineHelper.copySpline(TENANEA_SPLINE);
    SplineHelper.rotateSpline(spline, angle);
    SplineHelper.scale(spline, size * MHelper.randRange(0.55, 0.9, rng));
    SplineHelper.offsetParts(spline, rng, 0.7, 0, 0.7);
    SplineHelper.fillSpline(spline, grid, ox, oy, oz, "betterend:lucernia_bark", {}, "tree_trunk");
    const last = spline[spline.length - 1];
    const lx = Math.round(ox + last.x);
    const ly = Math.round(oy + last.y);
    const lz = Math.round(oz + last.z);
    const leavesRadius = (size * 0.13 + MHelper.randRange(0.8, 1.4, rng)) * 1.3;
    const noise = new OpenSimplexNoise(rng.nextInt());

    let sphere = new SDFSphere(leavesRadius, "betterend:lucernia_leaves", {
      distance: 1,
      persistent: true,
      waterlogged: false
    });
    const sub = new SDFTranslate(0, -leavesRadius * 5, 0, new SDFScale(5, sphere));
    sphere = new SDFSubtraction(sphere, sub);
    sphere = new SDFScale3D(1.0, 0.75, 1.0, sphere);
    sphere = new SDFDisplacement(
      (x, y, z) => noise.eval(x * 0.2, y * 0.2, z * 0.2) * 1.6 + MHelper.randRange(-1.0, 1.0, rng),
      sphere
    );

    const filaluxSupports = [];
    sphere.addPostProcess((info) => {
      if (rng.nextInt(6) === 0 && info.getStateDown().blockId === "minecraft:air") {
        filaluxSupports.push({ x: info.x, y: info.y - 1, z: info.z });
      }
      for (const dir of ALL_DIRS) {
        if (info.getStateDir(dir).blockId === "minecraft:air" && rng.nextInt(3) !== 0) {
          info.setBlockPos(
            info.x + dir.dx,
            info.y + dir.dy,
            info.z + dir.dz,
            "betterend:lucernia_outer_leaves",
            { facing: dir.name, waterlogged: false },
            "tree_crown"
          );
        }
      }
      return null;
    });

    const r = Math.ceil(leavesRadius + 2);
    sphere.fillArea(grid, lx, ly, lz, lx - r, ly - r, lz - r, lx + r, ly + r, lz + r, "tree_canopy");
    grid.set(lx, ly, lz, "betterend:lucernia_bark", {}, "tree_trunk");

    for (const sup of filaluxSupports) {
      const above = grid.get(sup.x, sup.y + 1, sup.z);
      if (above && above.blockId === "betterend:lucernia_leaves") {
        const vLen = MHelper.randRange(3, 6, rng);
        for (let k = 0; k < vLen; k++) {
          const shape = k === vLen - 1 ? "bottom" : k === 0 ? "top" : "middle";
          grid.set(sup.x, sup.y - k, sup.z, "betterend:filalux", { shape }, "tree_crown");
        }
      }
    }
  }

  // Roots
  const rootRadius = size * 0.35;
  const rootCount = Math.max(4, Math.floor(rootRadius * 1.4));
  const rootY = oy + MHelper.randRange(2, 4, rng);
  for (let i = 0; i < rootCount; i++) {
    const rt = SplineHelper.copySpline(DRAGON_ROOT);
    SplineHelper.rotateSpline(rt, (i / rootCount) * PI2);
    SplineHelper.scale(rt, rootRadius * MHelper.randRange(0.85, 1.15, rng));
    SplineHelper.fillSpline(rt, grid, ox, rootY, oz, "betterend:lucernia_bark", {}, "tree_trunk");
  }
  pruneUnsupportedFur(grid);
}

// ============================================================================
// 5. All 6 BetterEnd Bush & Mushroom Features (`world/features/bushes/`)
// ============================================================================

export function generateBush(grid, ox, oy, oz, rng, leavesBlock, stemBlock, outerLeavesBlock = null, hangingBlock = null) {
  const radius = MHelper.randRange(1.8, 3.2, rng);
  const noise = new OpenSimplexNoise(rng.nextInt());
  const isLeaves = leavesBlock.endsWith("_leaves");
  let sphere = new SDFSphere(
    radius,
    leavesBlock,
    isLeaves ? { distance: 1, persistent: true, waterlogged: false } : {}
  );
  sphere = new SDFScale3D(1.0, hangingBlock ? 0.75 : 0.5, 1.0, sphere);
  sphere = new SDFDisplacement(
    (x, y, z) => noise.eval(x * 0.2, y * 0.2, z * 0.2) * 2.2 + MHelper.randRange(-1.2, 1.2, rng),
    sphere
  );
  sphere = new SDFSubtraction(sphere, new SDFTranslate(0, -radius, 0, sphere));

  const supports = [];
  sphere.addPostProcess((info) => {
    const manhattan = Math.abs(info.x - ox) + Math.abs(info.y - oy) + Math.abs(info.z - oz);
    if (manhattan >= 7) {
      return { blockId: "minecraft:air", states: {} };
    }
    if (hangingBlock && rng.nextInt(4) === 0 && info.getStateDown().blockId === "minecraft:air") {
      supports.push({ x: info.x, y: info.y - 1, z: info.z });
    }
    if (outerLeavesBlock) {
      for (const dir of ALL_DIRS) {
        if (info.getStateDir(dir).blockId === "minecraft:air" && rng.nextInt(2) === 0) {
          info.setBlockPos(
            info.x + dir.dx,
            info.y + dir.dy,
            info.z + dir.dz,
            outerLeavesBlock,
            { facing: dir.name, waterlogged: false },
            "bush_foliage"
          );
        }
      }
    }
    return null;
  });

  const r = Math.ceil(radius + 2);
  sphere.fillArea(grid, ox, oy, oz, ox - r, oy - 1, oz - r, ox + r, oy + r, oz + r, "bush_foliage");
  grid.set(ox, oy, oz, stemBlock, {}, "bush_stem");
  for (const dir of ALL_DIRS) {
    if (dir.name === "down") continue;
    if (!grid.has(ox + dir.dx, oy + dir.dy, oz + dir.dz)) {
      grid.set(
        ox + dir.dx,
        oy + dir.dy,
        oz + dir.dz,
        leavesBlock,
        isLeaves ? { distance: 1, persistent: true, waterlogged: false } : {},
        "bush_foliage"
      );
    }
  }

  if (hangingBlock) {
    for (const sup of supports) {
      const above = grid.get(sup.x, sup.y + 1, sup.z);
      if (above && above.blockId === leavesBlock && sup.y > oy) {
        const len = MHelper.randRange(2, 4, rng);
        for (let k = 0; k < len; k++) {
          if (sup.y - k <= oy) break;
          const shape = k === len - 1 ? "bottom" : k === 0 ? "top" : "middle";
          grid.set(sup.x, sup.y - k, sup.z, hangingBlock, { shape }, "bush_foliage");
        }
      }
    }
  }
  if (outerLeavesBlock) {
    pruneUnsupportedFur(grid);
  }
}

export function generateLumecorn(grid, ox, oy, oz, rng) {
  const height = MHelper.randRange(4, 7, rng);
  if (height === 4) {
    grid.set(ox, oy, oz, "betterend:lumecorn", { shape: "bottom_small" }, "feature_primary");
    grid.set(ox, oy + 1, oz, "betterend:lumecorn", { shape: "light_bottom" }, "feature_accent");
    grid.set(ox, oy + 2, oz, "betterend:lumecorn", { shape: "light_top_middle" }, "feature_accent");
    grid.set(ox, oy + 3, oz, "betterend:lumecorn", { shape: "light_top" }, "feature_accent");
    return;
  }
  if (rng.nextBoolean()) {
    grid.set(ox, oy, oz, "betterend:lumecorn", { shape: "bottom_small" }, "feature_primary");
    grid.set(ox, oy + 1, oz, "betterend:lumecorn", { shape: "light_bottom" }, "feature_accent");
    for (let y = 2; y < height - 2; y++) {
      grid.set(ox, oy + y, oz, "betterend:lumecorn", { shape: "light_middle" }, "feature_accent");
    }
    grid.set(ox, oy + height - 2, oz, "betterend:lumecorn", { shape: "light_top_middle" }, "feature_accent");
    grid.set(ox, oy + height - 1, oz, "betterend:lumecorn", { shape: "light_top" }, "feature_accent");
  } else {
    grid.set(ox, oy, oz, "betterend:lumecorn", { shape: "bottom_big" }, "feature_primary");
    grid.set(ox, oy + 1, oz, "betterend:lumecorn", { shape: "middle" }, "feature_primary");
    grid.set(ox, oy + 2, oz, "betterend:lumecorn", { shape: "light_bottom" }, "feature_accent");
    for (let y = 3; y < height - 2; y++) {
      grid.set(ox, oy + y, oz, "betterend:lumecorn", { shape: "light_middle" }, "feature_accent");
    }
    grid.set(ox, oy + height - 2, oz, "betterend:lumecorn", { shape: "light_top_middle" }, "feature_accent");
    grid.set(ox, oy + height - 1, oz, "betterend:lumecorn", { shape: "light_top" }, "feature_accent");
  }
}

export function generateLargeAmaranita(grid, ox, oy, oz, rng) {
  const height = MHelper.randRange(2, 3, rng);
  grid.set(ox, oy, oz, "betterend:large_amaranita_mushroom", { shape: "bottom" }, "feature_primary");
  if (height > 2) {
    grid.set(ox, oy + 1, oz, "betterend:large_amaranita_mushroom", { shape: "middle" }, "feature_primary");
    grid.set(ox, oy + 2, oz, "betterend:large_amaranita_mushroom", { shape: "top" }, "feature_accent");
  } else {
    grid.set(ox, oy + 1, oz, "betterend:large_amaranita_mushroom", { shape: "top" }, "feature_accent");
  }
}

export function generateAmaranitaPatchMushroom(grid, ox, oy, oz, rng) {
  const height = MHelper.randRange(3, 6, rng);
  for (let y = 0; y < height; y++) {
    grid.set(
      ox,
      oy + y,
      oz,
      y === 0 || y === height - 1 ? "betterend:amaranita_hyphae" : "betterend:amaranita_stem",
      { axis: "y" },
      "tree_trunk"
    );
  }
  const glowing = rng.nextInt(3) === 0;
  const lanternSide = HORIZONTAL_DIRS[rng.nextInt(4)].name;
  for (const dir of HORIZONTAL_DIRS) {
    if (glowing && dir.name === lanternSide) {
      grid.set(ox + dir.dx, oy + height - 1, oz + dir.dz, "betterend:amaranita_lantern", {}, "tree_crown");
      grid.set(
        ox + dir.dx,
        oy + height - 2,
        oz + dir.dz,
        "betterend:amaranita_fur",
        { facing: "down", waterlogged: false },
        "tree_crown"
      );
    } else {
      grid.set(ox + dir.dx, oy + height - 1, oz + dir.dz, "betterend:amaranita_hymenophore", {}, "tree_canopy");
    }
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      grid.set(ox + dx, oy + height, oz + dz, "betterend:amaranita_cap", {}, "tree_canopy");
    }
  }
  grid.set(ox, oy + height + 1, oz, "betterend:amaranita_cap", {}, "tree_canopy");
  for (const dir of HORIZONTAL_DIRS) {
    grid.set(ox + dir.dx, oy + height + 1, oz + dir.dz, "betterend:amaranita_cap", {}, "tree_canopy");
  }
}

// ============================================================================
// 6. Multi-Block Plant Features (`world/features/`)
// ============================================================================

export function generateEndLotusLeafPad(grid, cx, cy, cz) {
  grid.set(cx, cy, cz, "betterend:end_lotus_leaf", { shape: "bottom", facing: "north" }, "feature_primary");
  for (const dir of HORIZONTAL_DIRS) {
    grid.set(
      cx + dir.dx,
      cy,
      cz + dir.dz,
      "betterend:end_lotus_leaf",
      { shape: "middle", facing: dir.name },
      "feature_primary"
    );
  }
  for (let i = 0; i < 4; i++) {
    const d1 = HORIZONTAL_DIRS[i];
    const d2 = HORIZONTAL_DIRS[(i + 1) & 3];
    grid.set(
      cx + d1.dx + d2.dx,
      cy,
      cz + d1.dz + d2.dz,
      "betterend:end_lotus_leaf",
      { shape: "top", facing: d1.name },
      "feature_primary"
    );
  }
}

export function generateEndLotus(grid, ox, oy, oz, rng) {
  const stemHeight = MHelper.randRange(2, 4, rng);
  for (let y = 0; y < stemHeight; y++) {
    const shape = y === 0 ? "bottom" : y === stemHeight - 1 ? "top" : "middle";
    grid.set(
      ox,
      oy + y,
      oz,
      "betterend:end_lotus_stem",
      { shape, facing: "up", leaf: false, waterlogged: y < stemHeight - 1 },
      "feature_primary"
    );
  }
  grid.set(ox, oy + stemHeight, oz, "betterend:end_lotus_flower", {}, "feature_accent");
}

export function generateLanceleaf(grid, ox, oy, oz, rng) {
  const height = MHelper.randRange(4, 6, rng);
  const rotation = rng.nextInt(4);
  grid.set(ox, oy, oz, "betterend:lanceleaf", { shape: "bottom", rotation }, "feature_primary");
  grid.set(ox, oy + 1, oz, "betterend:lanceleaf", { shape: "pre_bottom", rotation }, "feature_primary");
  for (let i = 2; i <= height - 3; i++) {
    grid.set(ox, oy + i, oz, "betterend:lanceleaf", { shape: "middle", rotation }, "feature_primary");
  }
  grid.set(ox, oy + height - 2, oz, "betterend:lanceleaf", { shape: "pre_top", rotation }, "feature_primary");
  grid.set(ox, oy + height - 1, oz, "betterend:lanceleaf", { shape: "top", rotation }, "feature_accent");
}

export function generateBlueVine(grid, ox, oy, oz, rng) {
  const height = MHelper.randRange(2, 5, rng);
  grid.set(ox, oy, oz, "betterend:blue_vine", { shape: "bottom" }, "feature_primary");
  for (let i = 1; i < height; i++) {
    grid.set(ox, oy + i, oz, "betterend:blue_vine", { shape: "middle" }, "feature_primary");
  }
  grid.set(ox, oy + height, oz, "betterend:blue_vine", { shape: "top" }, "feature_primary");
  const ly = oy + height + 1;
  grid.set(ox, ly, oz, "betterend:blue_vine_lantern", { natural: true }, "feature_accent");
  for (const dir of HORIZONTAL_DIRS) {
    grid.set(
      ox + dir.dx,
      ly,
      oz + dir.dz,
      "betterend:blue_vine_fur",
      { facing: dir.name, waterlogged: false },
      "feature_accent"
    );
  }
  grid.set(ox, ly + 1, oz, "betterend:blue_vine_fur", { facing: "up", waterlogged: false }, "feature_accent");
}

export function generateGlowPillar(grid, ox, oy, oz, rng) {
  const height = MHelper.randRange(1, 2, rng);
  if (height === 1) {
    grid.set(ox, oy, oz, "betterend:glowing_pillar_roots", { shape: "middle" }, "feature_primary");
  } else {
    grid.set(ox, oy, oz, "betterend:glowing_pillar_roots", { shape: "bottom" }, "feature_primary");
    grid.set(ox, oy + 1, oz, "betterend:glowing_pillar_roots", { shape: "top" }, "feature_primary");
  }
  const ly = oy + height;
  grid.set(ox, ly, oz, "betterend:glowing_pillar_luminophor", { natural: true }, "feature_accent");
  for (const dir of HORIZONTAL_DIRS) {
    grid.set(
      ox + dir.dx,
      ly,
      oz + dir.dz,
      "betterend:glowing_pillar_leaves",
      { facing: dir.name, waterlogged: false },
      "feature_accent"
    );
  }
  grid.set(ox, ly + 1, oz, "betterend:glowing_pillar_leaves", { facing: "up", waterlogged: false }, "feature_accent");
}

export function generateNeonCactus(grid, ox, oy, oz, rng) {
  const h = MHelper.randRange(4, 7, rng);
  for (let y = 0; y < h; y++) {
    const shape = y === h - 1 ? "top" : y >= h - 2 ? "middle" : "bottom";
    grid.set(
      ox,
      oy + y,
      oz,
      "betterend:neon_cactus",
      { shape, bottom: y === 0 ? "sand" : "empty", facing: "up", waterlogged: false },
      "feature_primary"
    );
  }
  const branchCount = MHelper.randRange(1, 2, rng);
  for (let b = 0; b < branchCount; b++) {
    const dir = HORIZONTAL_DIRS[(b * 2 + rng.nextInt(2)) & 3];
    const by = oy + MHelper.randRange(1, Math.max(2, h - 2), rng);
    grid.set(
      ox + dir.dx,
      by,
      oz + dir.dz,
      "betterend:neon_cactus",
      { shape: "middle", bottom: "empty", facing: dir.name, waterlogged: false },
      "feature_primary"
    );
    const armH = MHelper.randRange(1, 3, rng);
    for (let ay = 1; ay <= armH; ay++) {
      grid.set(
        ox + dir.dx,
        by + ay,
        oz + dir.dz,
        "betterend:neon_cactus",
        { shape: ay === armH ? "top" : "middle", bottom: "empty", facing: "up", waterlogged: false },
        "feature_accent"
      );
    }
  }
}

export function generateFilalux(grid, ox, oy, oz, rng) {
  grid.set(ox, oy, oz, "betterend:filalux_lantern", {}, "feature_primary");
  grid.set(ox, oy + 1, oz, "betterend:filalux_wings", { facing: "up", waterlogged: false }, "feature_accent");
  for (const dir of HORIZONTAL_DIRS) {
    grid.set(
      ox + dir.dx,
      oy,
      oz + dir.dz,
      "betterend:filalux_wings",
      { facing: dir.name, waterlogged: false },
      "feature_accent"
    );
  }
  const len = MHelper.randRange(1, 3, rng);
  for (let i = 1; i <= len; i++) {
    const shape = i === 1 ? (len > 1 ? "top" : "bottom") : i === len ? "bottom" : "middle";
    grid.set(ox, oy - i, oz, "betterend:filalux", { shape }, "hanging_vine");
  }
}

export function generateHydralux(grid, ox, oy, oz, rng) {
  const h = MHelper.randRange(4, 6, rng);
  const big = rng.nextBoolean();
  grid.set(ox, oy, oz, "betterend:hydralux", { shape: "roots" }, "feature_primary");
  for (let i = 1; i <= h - 3; i++) {
    grid.set(ox, oy + i, oz, "betterend:hydralux", { shape: "vine" }, "feature_primary");
  }
  grid.set(
    ox,
    oy + h - 2,
    oz,
    "betterend:hydralux",
    { shape: big ? "flower_big_bottom" : "flower_small_bottom" },
    "feature_accent"
  );
  grid.set(
    ox,
    oy + h - 1,
    oz,
    "betterend:hydralux",
    { shape: big ? "flower_big_top" : "flower_small_top" },
    "feature_accent"
  );
}

// ============================================================================
// 7. Terrain Features & Massive Structures (`world/features/terrain/` & `world/structures/`)
// ============================================================================

export function generateBigAuroraCrystal(grid, ox, oy, oz, rng) {
  // Exact BigAuroraCrystalFeature.java: rotated SDFHexPrism
  const height = MHelper.randRange(5, 11, rng);
  const radius = MHelper.randRange(1.7, 2.6, rng);
  const prism = new SDFHexPrism(height * 0.5, radius, "betterend:aurora_crystal", { color_shift: 0 });
  const axis = randomHorizontal(rng);
  const angle = rng.nextFloat() * 0.55;
  const rotated = new SDFRotation(axis, angle, prism);
  const cy = oy + Math.floor(height * 0.45);
  const maxR = Math.ceil(radius + height * 0.35) + 1;
  const maxH = Math.ceil(height * 0.6) + 1;
  rotated.fillArea(
    grid,
    ox,
    cy,
    oz,
    ox - maxR,
    oy - 2,
    oz - maxR,
    ox + maxR,
    cy + maxH,
    oz + maxR,
    "formation_body"
  );
  grid.set(ox, oy, oz, "betterend:aurora_crystal", { color_shift: 0 }, "formation_cap");
}

export function generateSmaragdantCrystal(grid, ox, oy, oz, rng) {
  // Exact SmaragdantCrystalFeature.java: Gaussian cluster of columns + budding + shards
  const count = MHelper.randRange(14, 24, rng);
  for (let i = 0; i < count; i++) {
    const dx = Math.floor(nextGaussian(rng) * 1.6 + 0.5);
    const dz = Math.floor(nextGaussian(rng) * 1.6 + 0.5);
    const dist = Math.floor(1.8 - Math.hypot(dx, dz)) + rng.nextInt(3);
    if (dist > 0) {
      for (let j = 0; j <= dist; j++) {
        const budding = rng.nextInt(8) === 0;
        grid.set(
          ox + dx,
          oy + j,
          oz + dz,
          budding ? "betterend:budding_smaragdant_crystal" : "betterend:smaragdant_crystal",
          {},
          "formation_body"
        );
        if (budding) {
          for (const dir of HORIZONTAL_DIRS) {
            if (rng.nextBoolean() && !grid.has(ox + dx + dir.dx, oy + j, oz + dz + dir.dz)) {
              grid.set(
                ox + dx + dir.dx,
                oy + j,
                oz + dz + dir.dz,
                "betterend:smaragdant_crystal_shard",
                { facing: dir.name, waterlogged: false },
                "formation_cap"
              );
            }
          }
        }
      }
      grid.set(
        ox + dx,
        oy + dist + 1,
        oz + dz,
        "betterend:smaragdant_crystal_shard",
        { facing: "up", waterlogged: false },
        "formation_cap"
      );
    }
  }
}

export function generateIceStar(grid, ox, oy, oz, rng, minSize, maxSize, minCount, maxCount) {
  // Exact IceStarFeature.java & GiantIceStarStructure.java: Fibonacci cones + 4-layer distance post-process
  const size = MHelper.randRange(minSize, maxSize, rng);
  const count = MHelper.randRange(minCount, maxCount, rng);
  const maxIdx = Math.max(1, count - 1);
  const points = [];
  for (let i = 0; i < count; i++) {
    const y = 1.0 - (i / maxIdx) * 2.0;
    const r = Math.sqrt(Math.max(0, 1.0 - y * y));
    const theta = PHI * i;
    points.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
  }

  let spike = new SDFCappedCone(3.0 + (size - 5.0) * 0.2, 0.0, size, "betterend:dense_snow", {});
  spike = new SDFTranslate(0, size - 0.5, 0, spike);

  let sdf = null;
  const upVec = { x: 0, y: 1, z: 0 };
  for (const pt of points) {
    const norm = normalizeVec3(pt);
    const dot = MHelper.clamp(norm.y, -1.0, 1.0);
    const angle = Math.acos(dot);
    let rotated = spike;
    if (angle > 0.01 && angle < 3.13) {
      const axis = normalizeVec3(crossVec3(upVec, norm));
      rotated = new SDFRotation(axis, angle, spike);
    } else if (angle > 1.0) {
      rotated = new SDFRotation({ x: 0, y: 0, z: 1 }, PI, spike);
    }
    sdf = sdf === null ? rotated : new SDFUnion(sdf, rotated);
  }

  const ancientRadius = size * 0.7;
  const denseRadius = size * 0.9;
  const iceRadius = size < 7.0 ? size * 5.0 : size * 1.3;
  const randScale = size * 0.3;
  const sdfCopy = sdf;

  sdf.addPostProcess((info) => {
    const px = info.x - ox;
    const py = info.y - oy;
    const pz = info.z - oz;
    const distance =
      Math.hypot(px, py, pz) + sdfCopy.getDistance(px, py, pz) * 0.4 + rng.nextFloat() * randScale;
    if (distance < ancientRadius) {
      return { blockId: "betterend:ancient_emerald_ice", states: {} };
    }
    if (distance < denseRadius) {
      return { blockId: "betterend:dense_emerald_ice", states: {} };
    }
    if (distance < iceRadius) {
      return { blockId: "betterend:emerald_ice", states: {} };
    }
    return { blockId: "betterend:dense_snow", states: {} };
  });

  const bound = Math.ceil(size + 2);
  sdf.fillArea(
    grid,
    ox,
    oy,
    oz,
    ox - bound,
    oy - bound,
    oz - bound,
    ox + bound,
    oy + bound,
    oz + bound,
    "structure_core"
  );
}

export function generateSpire(grid, ox, oy, oz, rng, isFloating = false) {
  // Exact SpireFeature.java & FloatingSpireFeature.java
  const addSegment = (sdf, radius) => {
    const sphere = new SDFSphere(radius, "minecraft:end_stone", {});
    const offseted = new SDFTranslate(0, radius + rng.nextFloat() * 0.25 * radius, 0, sdf);
    return new SDFSmoothUnion(radius * 0.5, sphere, offseted);
  };

  let sdf = new SDFSphere(MHelper.randRange(2.0, 2.8, rng), "minecraft:end_stone", {});
  const count = MHelper.randRange(3, 4, rng);
  let totalY = 0;
  for (let i = 0; i < count; i++) {
    const rMin = i * 1.1 + 2.2;
    const r = MHelper.randRange(rMin, rMin + 1.0, rng);
    totalY += r * 1.15;
    sdf = addSegment(sdf, r);
  }
  if (isFloating) {
    for (let i = count - 1; i > 0; i--) {
      const rMin = i * 1.1 + 2.2;
      const r = MHelper.randRange(rMin, rMin + 1.0, rng);
      totalY += r * 1.15;
      sdf = addSegment(sdf, r);
    }
  }

  const noise = new OpenSimplexNoise(rng.nextInt());
  sdf = new SDFDisplacement(
    (x, y, z) =>
      Math.abs(noise.eval(x * 0.1, y * 0.1, z * 0.1)) * 2.2 +
      Math.abs(noise.eval(x * 0.3, y * 0.3 + 100, z * 0.3)) * 1.0,
    sdf
  );

  sdf.addPostProcess((info) => {
    if (info.getStateUp().blockId === "minecraft:air") {
      return { blockId: "betterend:pink_moss", states: {} };
    }
    return null;
  });

  const maxR = 8;
  sdf.fillArea(
    grid,
    ox,
    oy,
    oz,
    ox - maxR,
    oy - 3,
    oz - maxR,
    ox + maxR,
    oy + Math.ceil(totalY) + 4,
    oz + maxR,
    "formation_body"
  );
}

export function generateUmbralithArch(grid, ox, oy, oz, rng, isThin = false) {
  // Exact ArchFeature.java & ThinArchFeature.java: rotated SDFTorus
  const bigRadius = isThin ? MHelper.randRange(9.0, 12.0, rng) : MHelper.randRange(8.0, 12.0, rng);
  const smallRadius = isThin ? MHelper.randRange(1.0, 1.5, rng) : MHelper.randRange(2.4, 3.6, rng);
  let arch = new SDFTorus(bigRadius, smallRadius, "betterend:umbralith", {});
  arch = new SDFRotation(randomHorizontal(rng), PI * 0.5, arch);
  const noise = new OpenSimplexNoise(rng.nextInt());
  arch = new SDFDisplacement(
    (x, y, z) =>
      Math.abs(noise.eval(x * 0.1, y * 0.1, z * 0.1)) * 1.8 -
      smallRadius * Math.abs(1.0 - y / bigRadius) * 0.35,
    arch
  );

  const surfaceNoise = new OpenSimplexNoise(1512);
  arch.addPostProcess((info) => {
    if (info.getStateUp().blockId === "minecraft:air") {
      const val = surfaceNoise.eval(info.x * 0.05, info.z * 0.05);
      if (val > 0.35) return { blockId: "betterend:pallidium_full", states: {} };
      if (val > 0.1) return { blockId: "betterend:pallidium_heavy", states: {} };
      if (val > -0.15) return { blockId: "betterend:pallidium_thin", states: {} };
      if (val > -0.35) return { blockId: "betterend:pallidium_tiny", states: {} };
    }
    return null;
  });

  const side = Math.ceil(bigRadius + smallRadius + 2);
  arch.fillArea(
    grid,
    ox,
    oy,
    oz,
    ox - side,
    oy - 2,
    oz - side,
    ox + side,
    oy + side,
    oz + side,
    "formation_body"
  );
}

export function generateGeyserOrSulphurPool(grid, ox, oy, oz, rng) {
  // Exact SulphuricLakeFeature + SurfaceVentFeature + SulphurFloorMix
  const radius = MHelper.randRange(5.0, 7.5, rng);
  const noise = new OpenSimplexNoise(15152);
  const rBound = Math.ceil(radius * 1.4);
  for (let dx = -rBound; dx <= rBound; dx++) {
    for (let dz = -rBound; dz <= rBound; dz++) {
      const r = radius * (noise.eval((ox + dx) * 0.2, (oz + dz) * 0.2) * 0.25 + 0.75);
      const r2 = r * 1.35;
      const d2 = dx * dx + dz * dz;
      if (d2 <= (r - 1.2) * (r - 1.2)) {
        grid.set(ox + dx, oy - 2, oz + dz, "betterend:sulphuric_rock", {}, "formation_body");
        grid.set(ox + dx, oy - 1, oz + dz, "betterend:brimstone", { active: true }, "formation_body");
        grid.set(ox + dx, oy, oz + dz, "minecraft:water", {}, "formation_cap");
        if (d2 <= 4 && rng.nextInt(3) === 0) {
          grid.set(
            ox + dx,
            oy - 1,
            oz + dz,
            "betterend:hydrothermal_vent",
            { active: true, waterlogged: true },
            "formation_cap"
          );
          grid.set(ox + dx, oy, oz + dz, "betterend:vent_bubble_column", {}, "formation_cap");
        }
      } else if (d2 <= r * r) {
        grid.set(ox + dx, oy - 1, oz + dz, "betterend:sulphuric_rock", {}, "formation_body");
        grid.set(ox + dx, oy, oz + dz, "betterend:brimstone", { active: true }, "formation_buttress");
        if (rng.nextInt(6) === 0) {
          grid.set(
            ox + dx,
            oy + 1,
            oz + dz,
            "betterend:sulphur_crystal",
            { facing: "up", stage: rng.nextInt(3), waterlogged: false },
            "formation_cap"
          );
        }
      } else if (d2 <= r2 * r2) {
        grid.set(ox + dx, oy, oz + dz, "betterend:sulphuric_rock", {}, "formation_buttress");
      }
    }
  }
}

export function generateObsidianBoulder(grid, ox, oy, oz, rng) {
  // Exact ObsidianBoulderFeature.java
  const radius = MHelper.randRange(2.0, 4.0, rng);
  const noise = new OpenSimplexNoise(rng.nextInt());
  let sphere = new SDFSphere(radius, "minecraft:obsidian", {});
  sphere = new SDFScale3D(
    MHelper.randRange(0.75, 1.25, rng),
    MHelper.randRange(0.7, 1.15, rng),
    MHelper.randRange(0.75, 1.25, rng),
    sphere
  );
  sphere = new SDFDisplacement((x, y, z) => noise.eval(x * 0.2, y * 0.2, z * 0.2) * 1.2, sphere);
  sphere.addPostProcess((info) => {
    if (info.getStateUp().blockId === "minecraft:air" && rng.nextFloat() > 0.1) {
      return { blockId: "betterend:mossy_obsidian", states: {} };
    }
    return null;
  });
  const b = Math.ceil(radius + 2);
  sphere.fillArea(grid, ox, oy, oz, ox - b, oy - b, oz - b, ox + b, oy + b, oz + b, "formation_body");
}

export function generateObsidianPillarBasement(grid, ox, oy, oz, rng, isFallen = false) {
  // Exact ObsidianPillarBasementFeature.java & FallenPillarFeature.java
  const height = isFallen ? MHelper.randRange(10.0, 16.0, rng) : MHelper.randRange(10.0, 18.0, rng);
  const radius = MHelper.randRange(2.2, 3.8, rng);
  const noise = new OpenSimplexNoise(rng.nextInt());
  let pillar = new SDFCappedCone(radius, radius, height * 0.5, "minecraft:obsidian", {});
  pillar = new SDFTranslate(0, height * 0.5 - 2, 0, pillar);
  if (isFallen) {
    pillar = new SDFDisplacement((x, y, z) => noise.eval(x * 0.3, y * 0.3, z * 0.3) * 0.5, pillar);
    pillar = new SDFRotation(randomHorizontal(rng), PI * 0.48, pillar);
  } else {
    let cut = new SDFFlatland("minecraft:obsidian", {});
    cut = new SDFDisplacement((x, y, z) => noise.eval(x * 0.2, y * 0.2, z * 0.2) * 2.5, cut);
    cut = new SDFRotation(randomHorizontal(rng), rng.nextFloat() * 0.5 + PI, cut);
    cut = new SDFTranslate(0, height * 0.7 - 2, 0, cut);
    pillar = new SDFSubtraction(pillar, cut);
    pillar = new SDFRotation(randomHorizontal(rng), rng.nextFloat() * 0.15, pillar);
  }
  pillar.addPostProcess((info) => {
    if (info.getStateUp().blockId === "minecraft:air" && rng.nextFloat() > 0.1) {
      return { blockId: "betterend:mossy_obsidian", states: {} };
    }
    return null;
  });
  const b = isFallen ? Math.ceil(height * 0.6 + 3) : Math.ceil(radius + 4);
  const h = isFallen ? Math.ceil(radius + 4) : Math.ceil(height + 2);
  pillar.fillArea(grid, ox, oy, oz, ox - b, oy - 3, oz - b, ox + b, oy + h, oz + b, "formation_body");
}

export function generateSmallFloatingIsland(grid, ox, oy, oz, rng, isFlowerIslets = false) {
  // Exact SmallIslandStructure.java: 4-cone SDFSmoothUnion + surface coat + stalactites/vines
  const radius = isFlowerIslets ? MHelper.randRange(6.0, 9.0, rng) : MHelper.randRange(8.0, 11.0, rng);
  const scale = radius / 0.5;
  const makeCone = (r1, r2, h, y) =>
    new SDFTranslate(0, y, 0, new SDFCappedCone(r1, r2, h, "minecraft:end_stone", {}));
  const cone1 = makeCone(0.0, 0.4, 0.2, -0.3);
  const cone2 = makeCone(0.4, 0.5, 0.1, -0.1);
  const cone3 = makeCone(0.5, 0.45, 0.03, 0.0);
  const cone4 = makeCone(0.45, 0.0, 0.02, 0.03);
  const coneBottom = new SDFSmoothUnion(0.05, cone1, cone2);
  const coneTop = new SDFSmoothUnion(0.05, cone3, cone4);
  const island = new SDFScale(scale, new SDFSmoothUnion(0.04, coneBottom, coneTop));

  const coatNoise = new OpenSimplexNoise(rng.nextInt());
  const underPositions = [];
  island.addPostProcess((info) => {
    if (info.getStateUp().blockId === "minecraft:air") {
      if (isFlowerIslets) {
        if (rng.nextFloat() < 0.55) {
          return { blockId: "betterend:sangnum", states: {} };
        }
        return { blockId: "betterend:pallidium_full", states: {} };
      }
      return { blockId: "betterend:end_moss", states: {} };
    }
    if (info.getStateDown().blockId === "minecraft:air") {
      underPositions.push({ x: info.x, y: info.y - 1, z: info.z });
    }
    return null;
  });

  const r = Math.ceil(radius + 2);
  const d = Math.ceil(radius * 1.1 + 2);
  island.fillArea(grid, ox, oy, oz, ox - r, oy - d, oz - r, ox + r, oy + 3, oz + r, "formation_body");

  for (const u of underPositions) {
    const patch = coatNoise.eval(u.x * 0.14, u.z * 0.14) > 0.05;
    if (isFlowerIslets) {
      if (rng.nextFloat() < (patch ? 0.5 : 0.08)) {
        const len = MHelper.randRange(2, 5, rng);
        const vineId =
          rng.nextFloat() < 0.5
            ? "betterend:bulb_vine"
            : rng.nextFloat() < 0.5
              ? "betterend:twisted_vine"
              : "betterend:jungle_vine";
        for (let i = 0; i < len; i++) {
          const shape = i === len - 1 ? "bottom" : i === 0 ? "top" : "middle";
          grid.set(u.x, u.y - i, u.z, vineId, { shape }, "hanging_vine");
        }
      }
    } else if (rng.nextFloat() < (patch ? 0.45 : 0.05)) {
      const len = MHelper.randRange(2, 4, rng);
      for (let i = 0; i < len; i++) {
        grid.set(
          u.x,
          u.y - i,
          u.z,
          "betterend:end_stone_stalactite",
          { size: Math.min(7, len - 1 - i), is_floor: false, waterlogged: false },
          "formation_buttress"
        );
      }
    }
  }
}

export function generateWaterLakeBasin(grid, ox, oy, oz, rng, radiusMin = 6, radiusMax = 10) {
  // Exact EndLakePiece / DesertLakeFeature / LakePiece water basin with End Lotus & End Lily
  const radius = MHelper.randRange(radiusMin, radiusMax, rng);
  const noise = new OpenSimplexNoise(15152);
  const rBound = Math.ceil(radius * 1.3);
  for (let dx = -rBound; dx <= rBound; dx++) {
    for (let dz = -rBound; dz <= rBound; dz++) {
      const r = radius * (noise.eval((ox + dx) * 0.2, (oz + dz) * 0.2) * 0.22 + 0.78);
      const d = Math.hypot(dx, dz);
      if (d <= r - 1.2) {
        const depth = Math.max(1, Math.min(3, Math.round(((r - d) / r) * 3)));
        grid.set(ox + dx, oy - depth - 1, oz + dz, "minecraft:end_stone", {}, "structure_base");
        grid.set(ox + dx, oy - depth, oz + dz, "betterend:endstone_dust", {}, "structure_base");
        for (let wy = -depth + 1; wy <= 0; wy++) {
          grid.set(ox + dx, oy + wy, oz + dz, "minecraft:water", {}, "structure_core");
        }
        grid.set(ox + dx, oy + 1, oz + dz, "minecraft:air", {}, "structure_apex");
        grid.set(ox + dx, oy + 2, oz + dz, "minecraft:air", {}, "structure_apex");
        grid.set(ox + dx, oy + 3, oz + dz, "minecraft:air", {}, "structure_apex");
        if (d <= r - 2.5 && rng.nextInt(16) === 0) {
          grid.set(ox + dx, oy + 1, oz + dz, "betterend:end_lotus_flower", {}, "structure_apex");
        } else if (d <= r - 2.0 && rng.nextInt(20) === 0) {
          grid.set(ox + dx, oy + 1, oz + dz, "betterend:end_lily", { shape: "top" }, "structure_apex");
        }
      } else if (d <= r) {
        grid.set(ox + dx, oy - 1, oz + dz, "minecraft:end_stone", {}, "structure_base");
        grid.set(
          ox + dx,
          oy,
          oz + dz,
          rng.nextFloat() < 0.08 ? "betterend:endstone_dust" : "betterend:end_moss",
          {},
          "structure_canopy"
        );
        grid.set(ox + dx, oy + 1, oz + dz, "minecraft:air", {}, "structure_apex");
        grid.set(ox + dx, oy + 2, oz + dz, "minecraft:air", {}, "structure_apex");
      }
    }
  }
}

export function generateCrystalMountainOutcrop(grid, ox, oy, oz, rng) {
  // Exact CrystalMountainPiece spire + crystal moss cone
  const r = MHelper.randRange(5, 8, rng);
  const h = MHelper.randRange(7, 12, rng);
  const noise = new OpenSimplexNoise(rng.nextInt());
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      const dist = 1.0 - Math.pow(d2 / (r * r), 0.35);
      const colH = Math.max(1, Math.round(dist * h * (noise.eval((ox + dx) * 0.1, (oz + dz) * 0.1) * 0.25 + 0.85)));
      for (let y = 0; y < colH; y++) {
        const isTop = y === colH - 1;
        grid.set(
          ox + dx,
          oy + y,
          oz + dz,
          isTop ? "betterend:crystal_moss" : "minecraft:end_stone",
          {},
          isTop ? "structure_canopy" : "structure_core"
        );
      }
    }
  }
  generateBigAuroraCrystal(grid, ox, oy + Math.floor(h * 0.7), oz, rng);
}

export function generatePaintedMountainStrata(grid, ox, oy, oz, rng) {
  // Exact PaintedMountainPiece layered strata
  const strata = [
    "minecraft:end_stone",
    "betterend:flavolite",
    "betterend:violecite",
    "betterend:virid_jadestone",
    "betterend:azure_jadestone",
    "betterend:sandy_jadestone"
  ];
  const r = MHelper.randRange(6, 9, rng);
  const h = MHelper.randRange(7, 11, rng);
  const noise = new OpenSimplexNoise(rng.nextInt());
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      const dist = 1.0 - d2 / (r * r);
      const colH = Math.max(1, Math.round(dist * h * (noise.eval((ox + dx) * 0.1, (oz + dz) * 0.1) * 0.2 + 0.9)));
      const offset = noise.eval((ox + dx) * 0.07, (oz + dz) * 0.07) * 4.0 + 7.0;
      for (let y = 0; y < colH; y++) {
        const idx = MHelper.mod(Math.floor((oy + y + offset) * 0.65), strata.length);
        grid.set(
          ox + dx,
          oy + y,
          oz + dz,
          strata[idx],
          {},
          y === colH - 1 ? "structure_canopy" : "structure_core"
        );
      }
    }
  }
}

export function generateEternalPortalStructure(grid, ox, oy, oz) {
  // Exact EternalPortalStructure.java / portal/eternal_portal.nbt layout
  for (let dx = -5; dx <= 5; dx++) {
    for (let dz = -5; dz <= 5; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= 28) {
        grid.set(ox + dx, oy - 1, oz + dz, "betterend:flavolite_tiles", {}, "structure_base");
      }
      if (d2 >= 18 && d2 <= 28) {
        grid.set(ox + dx, oy, oz + dz, "betterend:flavolite_stairs", {}, "structure_canopy");
      }
    }
  }
  // Center runed flavolite & portal arch
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      grid.set(
        ox + dx,
        oy,
        oz + dz,
        "betterend:flavolite_runed_eternal",
        { active: false },
        "structure_core"
      );
    }
  }
  for (let y = 1; y <= 5; y++) {
    grid.set(ox - 2, oy + y, oz, "betterend:flavolite_pillar", { axis: "y" }, "structure_core");
    grid.set(ox + 2, oy + y, oz, "betterend:flavolite_pillar", { axis: "y" }, "structure_core");
  }
  for (let dx = -2; dx <= 2; dx++) {
    grid.set(
      ox + dx,
      oy + 6,
      oz,
      "betterend:flavolite_runed_eternal",
      { active: false },
      "structure_apex"
    );
  }
  // 6 Eternal Pedestals around the portal ring
  const pedOffsets = [
    [-4, -2],
    [-4, 2],
    [4, -2],
    [4, 2],
    [0, -4],
    [0, 4]
  ];
  for (const [px, pz] of pedOffsets) {
    grid.set(ox + px, oy, oz + pz, "betterend:eternal_pedestal", {}, "structure_apex");
  }
}

export function generateEndBridgeSegment(grid, ox, oy, oz, rng) {
  // Exact EndBridgePiece.java arched brick bridge with walls
  const span = 7;
  for (let s = -span; s <= span; s++) {
    const t = (s + span) / (2 * span);
    const rise = Math.round(3.0 * 4.0 * t * (1.0 - t));
    const halfW = Math.abs(s) >= span - 1 ? 2 : 1;
    for (let w = -halfW; w <= halfW; w++) {
      const roll = rng.nextFloat();
      const brick =
        roll < 0.75
          ? "minecraft:end_bricks"
          : roll < 0.9
            ? "betterend:end_stone_brick_cracked"
            : "betterend:end_stone_brick_weathered";
      grid.set(ox + s, oy + rise, oz + w, brick, {}, "structure_core");
      if (Math.abs(w) === halfW && rng.nextFloat() < 0.8) {
        grid.set(ox + s, oy + rise + 1, oz + w, "betterend:end_stone_brick_wall", {}, "structure_canopy");
      }
    }
  }
}

// ============================================================================
// 8. Unified Feature / Structure Dispatcher (`generateBetterEndFeatureVoxels`)
// ============================================================================

export function generateBetterEndFeatureVoxels(featureId, seedOrRng, ox = 0, oy = 0, oz = 0, descriptor = null) {
  if (typeof ox === "object" && ox !== null) {
    descriptor = ox;
    ox = 0;
    oy = 0;
    oz = 0;
  }
  const rng =
    seedOrRng instanceof JavaRandom
      ? seedOrRng
      : new JavaRandom(MHelper.getSeed3D(seedOrRng ?? 0n, ox, oy, oz));
  const grid = new VoxelGrid();

  switch (featureId) {
    // 11 Trees + Giant Mossy Glowshroom
    case "mossy_glowshroom":
      generateMossyGlowshroom(grid, ox, oy, oz, rng, false);
      break;
    case "giant_mossy_glowshroom":
      generateMossyGlowshroom(grid, ox, oy, oz, rng, true);
      break;
    case "pythadendron_tree":
      generatePythadendronTree(grid, ox, oy, oz, rng);
      break;
    case "lacugrove":
      generateLacugrove(grid, ox, oy, oz, rng);
      break;
    case "dragon_tree":
      generateDragonTree(grid, ox, oy, oz, rng);
      break;
    case "dragon_helix_tree":
      generateDragonHelixTree(grid, ox, oy, oz, rng);
      break;
    case "tenanea":
      generateTenanea(grid, ox, oy, oz, rng);
      break;
    case "helix_tree":
      generateHelixTree(grid, ox, oy, oz, rng);
      break;
    case "umbrella_tree":
      generateUmbrellaTree(grid, ox, oy, oz, rng);
      break;
    case "jellyshroom":
      generateJellyshroom(grid, ox, oy, oz, rng);
      break;
    case "gigantic_amaranita":
      generateGiganticAmaranita(grid, ox, oy, oz, rng);
      break;
    case "lucernia":
      generateLucernia(grid, ox, oy, oz, rng);
      break;

    // 6 Bushes & Mushrooms
    case "pythadendron_bush":
      generateBush(grid, ox, oy, oz, rng, "betterend:pythadendron_leaves", "betterend:pythadendron_bark");
      break;
    case "dragon_tree_bush":
      generateBush(grid, ox, oy, oz, rng, "betterend:dragon_tree_leaves", "betterend:dragon_tree_bark");
      break;
    case "cave_bush":
      generateBush(grid, ox, oy, oz, rng, "betterend:cave_bush", "betterend:cave_bush");
      break;
    case "lucernia_bush":
    case "lucernia_bush_rare":
      generateBush(
        grid,
        ox,
        oy,
        oz,
        rng,
        "betterend:lucernia_leaves",
        "betterend:lucernia_bark",
        "betterend:lucernia_outer_leaves"
      );
      break;
    case "tenanea_bush":
      generateBush(
        grid,
        ox,
        oy,
        oz,
        rng,
        "betterend:tenanea_leaves",
        "betterend:tenanea_bark",
        "betterend:tenanea_outer_leaves",
        "betterend:tenanea_flowers"
      );
      break;
    case "lumecorn":
      generateLumecorn(grid, ox, oy, oz, rng);
      break;
    case "large_amaranita":
      generateLargeAmaranita(grid, ox, oy, oz, rng);
      break;
    case "small_amaranita":
      generateAmaranitaPatchMushroom(grid, ox, oy, oz, rng);
      break;

    // Multi-Block Plants
    case "end_lotus":
      generateEndLotus(grid, ox, oy, oz, rng);
      break;
    case "end_lotus_leaf":
      generateEndLotusLeafPad(grid, ox, oy, oz);
      break;
    case "end_lily":
    case "end_lily_rare":
      grid.set(ox, oy, oz, "betterend:end_lily", { shape: "bottom" }, "feature_primary");
      grid.set(ox, oy + 1, oz, "betterend:end_lily", { shape: "middle" }, "feature_primary");
      grid.set(ox, oy + 2, oz, "betterend:end_lily", { shape: "top" }, "feature_accent");
      break;
    case "hydralux":
      generateHydralux(grid, ox, oy, oz, rng);
      break;
    case "lanceleaf":
      generateLanceleaf(grid, ox, oy, oz, rng);
      break;
    case "blue_vine":
      generateBlueVine(grid, ox, oy, oz, rng);
      break;
    case "glow_pillar":
      generateGlowPillar(grid, ox, oy, oz, rng);
      break;
    case "neon_cactus":
      generateNeonCactus(grid, ox, oy, oz, rng);
      break;
    case "filalux":
      generateFilalux(grid, ox, oy, oz, rng);
      break;
    case "menger_sponge":
      grid.set(ox, oy, oz, "betterend:menger_sponge_wet", {}, "feature_primary");
      if (rng.nextBoolean()) {
        for (const dir of HORIZONTAL_DIRS) {
          if (rng.nextBoolean()) {
            grid.set(ox + dir.dx, oy, oz + dir.dz, "betterend:menger_sponge_wet", {}, "feature_accent");
          }
        }
      }
      break;
    case "silk_moth_nest": {
      const dir = HORIZONTAL_DIRS[rng.nextInt(4)].name;
      grid.set(
        ox,
        oy,
        oz,
        "betterend:silk_moth_nest",
        { facing: dir, active: false, fullness: 0 },
        "feature_primary"
      );
      grid.set(
        ox,
        oy - 1,
        oz,
        "betterend:silk_moth_nest",
        { facing: dir, active: true, fullness: 0 },
        "feature_accent"
      );
      break;
    }
    case "umbrella_moss":
    case "umbrella_moss_rare": {
      const rot = rng.nextInt(4);
      grid.set(ox, oy, oz, "betterend:umbrella_moss_tall", { rotation: rot, top: false }, "feature_primary");
      grid.set(ox, oy + 1, oz, "betterend:umbrella_moss_tall", { rotation: rot, top: true }, "feature_accent");
      break;
    }
    case "twisted_umbrella_moss":
    case "twisted_umbrella_moss_rare": {
      const rot = rng.nextInt(4);
      grid.set(
        ox,
        oy,
        oz,
        "betterend:twisted_umbrella_moss_tall",
        { rotation: rot, top: false },
        "feature_primary"
      );
      grid.set(
        ox,
        oy + 1,
        oz,
        "betterend:twisted_umbrella_moss_tall",
        { rotation: rot, top: true },
        "feature_accent"
      );
      break;
    }
    case "dense_vine":
    case "twisted_vine":
    case "bulb_vine":
    case "jungle_vine":
    case "rubinea":
    case "magnula": {
      const vLen = MHelper.randRange(3, 6, rng);
      for (let i = 0; i < vLen; i++) {
        const shape = i === vLen - 1 ? "bottom" : i === 0 ? "top" : "middle";
        grid.set(ox, oy - i, oz, `betterend:${featureId}`, { shape }, "hanging_vine");
      }
      break;
    }

    // Terrain Features & Massive Structures
    case "big_aurora_crystal":
      generateBigAuroraCrystal(grid, ox, oy, oz, rng);
      break;
    case "smaragdant_crystal":
      generateSmaragdantCrystal(grid, ox, oy, oz, rng);
      break;
    case "ice_star_small":
      generateIceStar(grid, ox, oy, oz, rng, 3.0, 5.0, 7, 11);
      break;
    case "ice_star":
      generateIceStar(grid, ox, oy, oz, rng, 5.0, 8.0, 10, 16);
      break;
    case "giant_ice_star":
      generateIceStar(grid, ox, oy, oz, rng, 8.0, 11.5, 14, 22);
      break;
    case "spire":
      generateSpire(grid, ox, oy, oz, rng, false);
      break;
    case "floating_spire":
      generateSpire(grid, ox, oy, oz, rng, true);
      break;
    case "umbralith_arch":
      generateUmbralithArch(grid, ox, oy, oz, rng, false);
      break;
    case "thin_umbralith_arch":
      generateUmbralithArch(grid, ox, oy, oz, rng, true);
      break;
    case "geyser":
    case "surface_vent":
    case "sulphur_hill":
    case "sulphuric_lake":
    case "sulphuric_cave":
      generateGeyserOrSulphurPool(grid, ox, oy, oz, rng);
      break;
    case "obsidian_boulder":
      generateObsidianBoulder(grid, ox, oy, oz, rng);
      break;
    case "obsidian_pillar_basement":
      generateObsidianPillarBasement(grid, ox, oy, oz, rng, false);
      break;
    case "fallen_pillar":
      generateObsidianPillarBasement(grid, ox, oy, oz, rng, true);
      break;
    case "small_island":
    case "biome_island":
      generateSmallFloatingIsland(grid, ox, oy, oz, rng, false);
      break;
    case "megalake":
    case "megalake_small":
      generateWaterLakeBasin(grid, ox, oy, oz, rng, 8, 12);
      break;
    case "end_lake":
    case "end_lake_normal":
    case "end_lake_rare":
    case "desert_lake":
    case "pond_with_waterfall":
      generateWaterLakeBasin(grid, ox, oy, oz, rng, 5, 8);
      break;
    case "mountain":
      generateCrystalMountainOutcrop(grid, ox, oy, oz, rng);
      break;
    case "painted_mountain":
      generatePaintedMountainStrata(grid, ox, oy, oz, rng);
      break;
    case "eternal_portal":
      generateEternalPortalStructure(grid, ox, oy, oz);
      break;
    case "end_bridge":
      generateEndBridgeSegment(grid, ox, oy, oz, rng);
      break;
    case "end_stone_stalactite":
    case "end_stone_stalactite_cavemoss":
    case "stalagmite":
    case "stalagmite_cavemoss": {
      const isFloor = featureId.startsWith("stalagmite");
      const blk = featureId.includes("cavemoss")
        ? "betterend:end_stone_stalactite_cavemoss"
        : "betterend:end_stone_stalactite";
      const h = MHelper.randRange(3, 6, rng);
      const dir = isFloor ? 1 : -1;
      for (let i = 0; i < h; i++) {
        grid.set(
          ox,
          oy + i * dir,
          oz,
          blk,
          { size: Math.min(7, h - 1 - i), is_floor: isFloor, waterlogged: false },
          "formation_body"
        );
      }
      break;
    }

    default: {
      const palette = descriptor?.palette ?? [];
      const isArr = Array.isArray(palette);
      const primary = (isArr ? palette[0] : palette.primary) ?? "betterend:end_moss";
      const secondary = (isArr ? palette[1] : palette.secondary) ?? primary;
      const accent = (isArr ? palette[2] : palette.accent) ?? secondary;
      if (descriptor?.category === "structures") {
        // Authentic ruined flavolite / end_stone_brick shrine from BetterEnd ruins
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            grid.set(ox + dx, oy - 1, oz + dz, secondary, {}, "structure_base");
            if (Math.abs(dx) === 2 && Math.abs(dz) === 2) {
              const colH = MHelper.randRange(3, 5, rng);
              for (let y = 0; y < colH; y++) {
                grid.set(ox + dx, oy + y, oz + dz, primary, {}, "structure_core");
              }
            }
          }
        }
        grid.set(ox, oy, oz, accent, {}, "structure_apex");
      } else {
        grid.set(ox, oy, oz, primary, {}, "feature_primary");
        if (accent && accent !== primary) {
          grid.set(ox, oy + 1, oz, accent, {}, "feature_accent");
        }
      }
      break;
    }
  }

  return grid.toArray();
}
