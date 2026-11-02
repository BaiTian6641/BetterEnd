/**
 * Deterministic Region & Worldgen Service (`REG-001`, `GEN-001..003`) for BetterEnd Bedrock 26.40.
 *
 * Pure ES module with zero Node-specific imports so it runs identically in
 * Node.js 24 and inside `@minecraft/server` 2.9.0 in Bedrock Dedicated Server.
 */

import { OpenSimplexNoise, toSignedLong } from "./simplex-noise.js";
import { BiomePicker, HexBiomeMap, JavaRandom, MHelper } from "./voronoi-hex.js";
import { TerrainGenerator } from "./terrain-sdf.js";
import {
  AERIAL_REGIONS,
  CAVE_REGIONS,
  FEATURES_BY_ID,
  REGION_CATALOGUE,
  REGIONS_BY_ID,
  SUB_REGIONS,
  SURFACE_REGIONS
} from "./region-catalogue.js";

export const PROTECTED_END_RADIUS = 1024;
export const DEFAULT_PLANNING_CELL_SIZE = 64;

export const JOURNAL_STATES = Object.freeze({
  UNKNOWN: "Unknown",
  PLANNED: "Planned",
  TERRAIN_READY: "TerrainReady",
  DECORATED: "Decorated",
  VALIDATED: "Validated",
  COMMITTED: "Committed",
  QUARANTINED: "Quarantined"
});

const VALID_STATE_TRANSITIONS = new Map([
  [JOURNAL_STATES.UNKNOWN, new Set([JOURNAL_STATES.PLANNED, JOURNAL_STATES.QUARANTINED])],
  [JOURNAL_STATES.PLANNED, new Set([JOURNAL_STATES.TERRAIN_READY, JOURNAL_STATES.QUARANTINED])],
  [JOURNAL_STATES.TERRAIN_READY, new Set([JOURNAL_STATES.DECORATED, JOURNAL_STATES.QUARANTINED])],
  [JOURNAL_STATES.DECORATED, new Set([JOURNAL_STATES.VALIDATED, JOURNAL_STATES.QUARANTINED])],
  [JOURNAL_STATES.VALIDATED, new Set([JOURNAL_STATES.COMMITTED, JOURNAL_STATES.QUARANTINED])],
  [JOURNAL_STATES.COMMITTED, new Set([JOURNAL_STATES.QUARANTINED])],
  [JOURNAL_STATES.QUARANTINED, new Set([])]
]);

export const PROTECTED_CENTER_REGION = Object.freeze({
  id: "the_end",
  upstreamId: "minecraft:the_end",
  bedrockId: "minecraft:the_end",
  layer: "protected_center",
  parent: null,
  genChance: 1.0,
  fogDensity: 1.0,
  terrainHeight: 1.0,
  hasCaves: false,
  colors: Object.freeze({
    fogColor: 10518688,
    waterColor: 4159204,
    waterFogColor: 329011,
    foliageColor: 10526880,
    skyColor: 0
  }),
  surface: Object.freeze({
    topBlock: "minecraft:end_stone",
    underBlock: "minecraft:end_stone",
    altTopBlock: null,
    rules: Object.freeze([])
  }),
  music: "minecraft:music.game.end",
  ambientSound: null,
  particles: Object.freeze([]),
  features: Object.freeze([]),
  structures: Object.freeze([]),
  spawns: Object.freeze([
    Object.freeze({ type: "minecraft:enderman", category: "monster", weight: 10, minCount: 4, maxCount: 4 })
  ]),
  tags: Object.freeze(["the_end", "minecraft:the_end", "betterend:protected_center"])
});

function isEndDimension(dimension) {
  if (!dimension) return true;
  const normalized = String(dimension).trim().toLowerCase();
  return (
    normalized === "the_end" ||
    normalized === "minecraft:the_end" ||
    normalized === "end" ||
    normalized === "betterend:the_end"
  );
}

function normalizeDimensionId(dimension) {
  if (!dimension) return "minecraft:the_end";
  const normalized = String(dimension).trim().toLowerCase();
  if (normalized === "the_end" || normalized === "end") return "minecraft:the_end";
  if (normalized === "overworld") return "minecraft:overworld";
  if (normalized === "nether" || normalized === "the_nether") return "minecraft:nether";
  return normalized;
}

/**
 *Exact port of BetterEnd's `EndLandBiomeDecider`:
 * Resolves surface land biomes (`scale = 320.0`, with 25% 7-cell sub-biome promotion)
 * vs void / aerial small-island biomes (`maxHeight < 32`, `scale = 320.0`).
 */
export class EndLandBiomeDecider {
  /**
   * @param {bigint} seed
   * @param {TerrainGenerator} terrain
   */
  constructor(seed, terrain) {
    this.seed = toSignedLong(seed);
    this.terrain = terrain;

    this.landPicker = new BiomePicker(SURFACE_REGIONS, SUB_REGIONS);
    this.aerialPicker = new BiomePicker(AERIAL_REGIONS);

    const rand = new JavaRandom(this.seed);
    const landMapSeed = rand.nextLong();
    const aerialMapSeed = rand.nextLong();

    this.landMap = new HexBiomeMap(landMapSeed, 320.0, this.landPicker);
    this.aerialMap = new HexBiomeMap(aerialMapSeed, 320.0, this.aerialPicker);
  }

  /**
   * Resolves land/sub-biome/aerial region assignment at block coordinates `(x, z)`.
   *
   * @param {number} x
   * @param {number} z
   */
  decide(x, z) {
    const landDetails = this.landMap.getRegionDetails(x, z);
    const surfaceEntry = landDetails.surfaceBiome;
    const subEntry = landDetails.subBiome;

    const surfaceRegion = surfaceEntry ? REGIONS_BY_ID.get(surfaceEntry.id) ?? null : null;
    const subRegion = subEntry ? REGIONS_BY_ID.get(subEntry.id) ?? null : null;
    const activeLandRegion = subRegion ?? surfaceRegion;

    const terrainHeightMultiplier = activeLandRegion ? activeLandRegion.terrainHeight : 1.0;
    const maxHeight = this.terrain.getMaxHeight(x, z, terrainHeightMultiplier);
    const isLand = maxHeight >= 32;

    let aerialRegion = null;
    if (!isLand) {
      const aerialEntry = this.aerialMap.getBiome(x, z);
      aerialRegion = aerialEntry ? REGIONS_BY_ID.get(aerialEntry.id) ?? null : AERIAL_REGIONS[0];
    }

    return {
      isLand,
      maxHeight,
      surfaceRegion,
      subRegion: isLand ? subRegion : null,
      aerialRegion,
      hex: landDetails.hex
    };
  }
}

/**
 * Exact port of BetterEnd's `EndCaveBiomeDecider`:
 * Resolves underground cave biomes (`scale = 128.0`) when `hasCaves && y >= 4 && y < 48 + yNoise * 8`.
 */
export class CaveBiomeDecider {
  static CAVE_MIN_Y = 4;
  static CAVE_TOP_Y = 48.0;
  static CAVE_TOP_JITTER = 8.0;

  /**
   * @param {bigint} seed
   */
  constructor(seed) {
    this.seed = toSignedLong(seed);
    this.cavePicker = new BiomePicker(CAVE_REGIONS);

    const rand = new JavaRandom(this.seed ^ 0x434156455F4D4150n);
    this.caveMap = new HexBiomeMap(rand.nextLong(), 128.0, this.cavePicker);
    this.yNoise = new OpenSimplexNoise(toSignedLong(`${this.seed}_cave_y`));
  }

  /**
   * Computes the dynamic cave ceiling Y (`48 + yNoise * 8`) at `(x, z)`.
   *
   * @param {number} x
   * @param {number} z
   * @returns {number}
   */
  getCaveCeilingY(x, z) {
    const quartX = x >> 2;
    const quartZ = z >> 2;
    return (
      CaveBiomeDecider.CAVE_TOP_Y +
      this.yNoise.eval(quartX * 0.08, quartZ * 0.08) * CaveBiomeDecider.CAVE_TOP_JITTER
    );
  }

  /**
   * Resolves the cave region at `(x, y, z)` if `hasCaves` is true and `y` is inside the cave band.
   *
   * @param {boolean} hasCaves
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {object | null}
   */
  decide(hasCaves, x, y, z) {
    if (!hasCaves) return null;
    if (y < CaveBiomeDecider.CAVE_MIN_Y) return null;
    const maxY = this.getCaveCeilingY(x, z);
    if (y >= maxY) return null;

    const caveEntry = this.caveMap.getBiome(x, y, z);
    return caveEntry ? REGIONS_BY_ID.get(caveEntry.id) ?? null : CAVE_REGIONS[0];
  }
}

/**
 * Deterministic region preparation journal state machine:
 * `Unknown -> Planned -> TerrainReady -> Decorated -> Validated -> Committed`
 * and `Quarantined` on conflict, interruption, or existing player build detection.
 */
export class RegionPreparationJournal {
  /**
   * @param {number | string} [revision=1]
   */
  constructor(revision = 1) {
    this.revision = revision;
    this.cells = new Map();
  }

  static makeKey(cellX, cellZ) {
    return `${Math.trunc(cellX)},${Math.trunc(cellZ)}`;
  }

  getRecord(cellX, cellZ) {
    const key = RegionPreparationJournal.makeKey(cellX, cellZ);
    const existing = this.cells.get(key);
    if (existing) {
      return existing;
    }
    return {
      cellX: Math.trunc(cellX),
      cellZ: Math.trunc(cellZ),
      state: JOURNAL_STATES.UNKNOWN,
      revision: this.revision,
      history: [],
      quarantineReason: null,
      protectedPlayerBuild: false,
      anchorCount: 0
    };
  }

  getState(cellX, cellZ) {
    return this.getRecord(cellX, cellZ).state;
  }

  /**
   * Marks a cell as `Quarantined` and refuses further destructive worldgen writes.
   */
  quarantine(cellX, cellZ, reason = "quarantined_by_policy") {
    const key = RegionPreparationJournal.makeKey(cellX, cellZ);
    const prev = this.getRecord(cellX, cellZ);
    const next = {
      ...prev,
      state: JOURNAL_STATES.QUARANTINED,
      quarantineReason: reason,
      history: [...prev.history, { from: prev.state, to: JOURNAL_STATES.QUARANTINED, reason }]
    };
    this.cells.set(key, next);
    return { ok: false, state: JOURNAL_STATES.QUARANTINED, reason, record: next };
  }

  /**
   * Advances a cell's preparation state along the strict state machine:
   * `Unknown -> Planned -> TerrainReady -> Decorated -> Validated -> Committed`.
   *
   * Refuses to overwrite existing/unknown player builds or mismatched revisions,
   * transitioning the cell to `Quarantined`.
   */
  transition(cellX, cellZ, targetState, context = {}) {
    const key = RegionPreparationJournal.makeKey(cellX, cellZ);
    const current = this.getRecord(cellX, cellZ);

    if (current.state === JOURNAL_STATES.QUARANTINED) {
      return {
        ok: false,
        state: JOURNAL_STATES.QUARANTINED,
        reason: current.quarantineReason ?? "already_quarantined",
        record: current
      };
    }

    if (
      context.hasPlayerBuilds ||
      context.untrackedPlayerBlocks ||
      context.existingPlayerBuild ||
      context.conflict ||
      context.interrupted
    ) {
      const reason =
        context.reason ??
        (context.hasPlayerBuilds || context.untrackedPlayerBlocks || context.existingPlayerBuild
          ? "refusing_to_overwrite_existing_player_build"
          : context.interrupted
            ? "interrupted_preparation_step"
            : "region_preparation_conflict");
      return this.quarantine(cellX, cellZ, reason);
    }

    if (context.revision !== undefined && context.revision !== this.revision) {
      return this.quarantine(
        cellX,
        cellZ,
        `revision_mismatch:expected_${this.revision}_got_${context.revision}`
      );
    }

    if (targetState === JOURNAL_STATES.QUARANTINED) {
      return this.quarantine(cellX, cellZ, context.reason ?? "explicit_quarantine");
    }

    const allowed = VALID_STATE_TRANSITIONS.get(current.state);
    if (!allowed || !allowed.has(targetState)) {
      return this.quarantine(
        cellX,
        cellZ,
        `invalid_state_transition:${current.state}->${targetState}`
      );
    }

    const updated = {
      ...current,
      state: targetState,
      revision: this.revision,
      anchorCount: context.anchorCount ?? current.anchorCount,
      history: [...current.history, { from: current.state, to: targetState, reason: context.reason ?? "ok" }]
    };
    this.cells.set(key, updated);
    return { ok: true, state: targetState, reason: null, record: updated };
  }

  exportSnapshot() {
    return {
      revision: this.revision,
      cells: Array.from(this.cells.values())
    };
  }

  importSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.cells)) return;
    for (const cell of snapshot.cells) {
      const key = RegionPreparationJournal.makeKey(cell.cellX, cell.cellZ);
      this.cells.set(key, {
        cellX: cell.cellX,
        cellZ: cell.cellZ,
        state: cell.state ?? JOURNAL_STATES.UNKNOWN,
        revision: cell.revision ?? this.revision,
        history: Array.isArray(cell.history) ? [...cell.history] : [],
        quarantineReason: cell.quarantineReason ?? null,
        protectedPlayerBuild: Boolean(cell.protectedPlayerBuild),
        anchorCount: Number(cell.anchorCount ?? 0)
      });
    }
  }
}

/**
 * Authoritative deterministic Region & Worldgen Service (`REG-001`, `GEN-001..003`).
 */
export class RegionService {
  /**
   * @param {object} options
   * @param {bigint | string | number} options.worldSeed 64-bit world seed (string or bigint parsed without float precision loss)
   * @param {bigint | string | number} [options.portSeed=0n] Dedicated port seed / salt
   * @param {number | string} [options.revision=1] Generation revision
   * @param {number} [options.cellSize=64] Planning cell size in blocks
   */
  constructor({
    worldSeed = 0n,
    portSeed = 0n,
    revision = 1,
    cellSize = DEFAULT_PLANNING_CELL_SIZE
  } = {}) {
    this.worldSeedRaw = typeof worldSeed === "string" ? worldSeed : String(worldSeed);
    this.worldSeed = toSignedLong(worldSeed);
    this.portSeed = toSignedLong(portSeed);
    this.revision = revision;
    this.cellSize = Math.max(16, Math.trunc(cellSize));

    const revisionSalt = toSignedLong(String(revision));
    this.effectiveSeed = BigInt.asIntN(
      64,
      this.worldSeed ^ (this.portSeed * 6364136223846793005n) ^ (revisionSalt * 1442695040888963407n)
    );

    this.terrain = new TerrainGenerator(this.effectiveSeed);
    this.landDecider = new EndLandBiomeDecider(this.effectiveSeed, this.terrain);
    this.caveDecider = new CaveBiomeDecider(this.effectiveSeed);
    this.journal = new RegionPreparationJournal(this.revision);
    this.rawCellPlanCache = new Map();
  }

  /**
   * Checks whether `(x, z)` lies within the protected central End (`|x| <= 1024 && |z| <= 1024`),
   * reserving the vanilla dragon fight island, exit portal, obsidian platform, and gateway ring.
   *
   * @param {string} dimension
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  isProtectedCenter(dimension, x, z) {
    if (!isEndDimension(dimension)) return false;
    return Math.abs(x) <= PROTECTED_END_RADIUS && Math.abs(z) <= PROTECTED_END_RADIUS;
  }

  /**
   * Returns detailed protected-zone metadata for coordinates in the central End.
   */
  getProtectedZoneTags(x, z) {
    const ax = Math.abs(x);
    const az = Math.abs(z);
    if (ax > PROTECTED_END_RADIUS || az > PROTECTED_END_RADIUS) {
      return [];
    }
    const tags = ["betterend:protected_center"];
    const distSq = x * x + z * z;
    if (ax <= 8 && az <= 8) {
      tags.push("betterend:protected_exit_portal");
    }
    if (Math.abs(x - 100) <= 8 && az <= 8) {
      tags.push("betterend:protected_obsidian_platform");
    }
    if (distSq <= 256 * 256) {
      tags.push("betterend:protected_dragon_fight_island");
    }
    if (distSq >= 80 * 80 && distSq <= 112 * 112) {
      tags.push("betterend:protected_gateway_ring");
    }
    return tags;
  }

  /**
   * Resolves the complete 3D region assignment at `(dimension, x, y, z)`.
   *
   * @param {string} dimension
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {object} [options]
   * @param {boolean} [options.ignoreProtectedCenter=false]
   */
  lookup(dimension, x, y, z, options = {}) {
    const normDim = normalizeDimensionId(dimension);
    const bx = Math.floor(Number(x));
    const by = Math.floor(Number(y));
    const bz = Math.floor(Number(z));
    const position = { x: bx, y: by, z: bz };

    if (!isEndDimension(normDim)) {
      return {
        dimension: normDim,
        position,
        protectedCenter: false,
        isLand: false,
        maxHeight: 0,
        surfaceRegion: null,
        subRegion: null,
        aerialRegion: null,
        caveRegion: null,
        effectiveRegion: null,
        tags: [normDim],
        revision: this.revision,
        readiness: "NotApplicable"
      };
    }

    const protectedCenter = !options.ignoreProtectedCenter && this.isProtectedCenter(normDim, bx, bz);
    const landDecision = this.landDecider.decide(bx, bz);
    const { isLand, maxHeight, surfaceRegion, subRegion, aerialRegion } = landDecision;

    const activeSurfaceRegion = subRegion ?? surfaceRegion;
    const hasCaves = Boolean(isLand && activeSurfaceRegion && activeSurfaceRegion.hasCaves);
    const caveRegion = this.caveDecider.decide(hasCaves, bx, by, bz);

    let effectiveRegion;
    if (protectedCenter) {
      effectiveRegion = PROTECTED_CENTER_REGION;
    } else if (caveRegion) {
      effectiveRegion = caveRegion;
    } else if (!isLand) {
      effectiveRegion = aerialRegion;
    } else if (subRegion) {
      effectiveRegion = subRegion;
    } else {
      effectiveRegion = surfaceRegion;
    }

    const cellX = Math.floor(bx / this.cellSize);
    const cellZ = Math.floor(bz / this.cellSize);
    const readiness = this.journal.getState(cellX, cellZ);

    const tagSet = new Set(effectiveRegion ? effectiveRegion.tags : ["the_end"]);
    if (protectedCenter) {
      for (const t of this.getProtectedZoneTags(bx, bz)) {
        tagSet.add(t);
      }
    } else {
      tagSet.add(isLand ? "betterend:land" : "betterend:void_aerial");
      if (subRegion) {
        tagSet.add(`betterend:sub_region/${subRegion.id}`);
        tagSet.add(`betterend:surface_parent/${surfaceRegion.id}`);
      }
      if (caveRegion) {
        tagSet.add(`betterend:cave/${caveRegion.id}`);
      }
    }

    return {
      dimension: normDim,
      position,
      protectedCenter,
      isLand,
      maxHeight,
      surfaceRegion,
      subRegion,
      aerialRegion,
      caveRegion,
      effectiveRegion,
      tags: Array.from(tagSet),
      revision: this.revision,
      readiness
    };
  }

  /**
   * Advances or queries the region preparation journal for planning cell `(cellX, cellZ)`.
   */
  getCellState(cellX, cellZ) {
    return this.journal.getState(cellX, cellZ);
  }

  transitionCell(cellX, cellZ, targetState, context = {}) {
    return this.journal.transition(cellX, cellZ, targetState, context);
  }

  quarantineCell(cellX, cellZ, reason) {
    return this.journal.quarantine(cellX, cellZ, reason);
  }

  /**
   * Generates the raw deterministic feature/structure candidate anchors owned by `(cellX, cellZ)`
   * before cross-border halo conflict resolution.
   */
  _generateRawCellCandidates(cellX, cellZ) {
    const cx = Math.trunc(cellX);
    const cz = Math.trunc(cellZ);
    const key = `${cx},${cz}`;
    const cached = this.rawCellPlanCache.get(key);
    if (cached) return cached;

    if (this.rawCellPlanCache.size > 512) {
      this.rawCellPlanCache.clear();
    }

    const minBlockX = cx * this.cellSize;
    const minBlockZ = cz * this.cellSize;
    const centerBlockX = minBlockX + (this.cellSize >> 1);
    const centerBlockZ = minBlockZ + (this.cellSize >> 1);

    // Never generate custom BetterEnd anchors inside the protected central End
    if (this.isProtectedCenter("minecraft:the_end", centerBlockX, centerBlockZ)) {
      const empty = Object.freeze([]);
      this.rawCellPlanCache.set(key, empty);
      return empty;
    }

    const cellSeed = MHelper.getSeed3D(this.effectiveSeed, cx, cz, Number(this.revision) || 1);
    const random = new JavaRandom(cellSeed);
    const candidates = [];

    // Sample a 2x2 sub-grid of anchor slots inside the planning cell
    const subStep = this.cellSize >> 1;
    for (let sx = 0; sx < 2; sx++) {
      for (let sz = 0; sz < 2; sz++) {
        const anchorX = minBlockX + sx * subStep + 4 + random.nextInt(Math.max(1, subStep - 8));
        const anchorZ = minBlockZ + sz * subStep + 4 + random.nextInt(Math.max(1, subStep - 8));

        if (this.isProtectedCenter("minecraft:the_end", anchorX, anchorZ)) {
          continue;
        }

        const surfaceSample = this.lookup("minecraft:the_end", anchorX, 72, anchorZ);
        const region = surfaceSample.effectiveRegion;
        if (!region || region.layer === "protected_center") {
          continue;
        }

        const anchorY = surfaceSample.isLand ? Math.max(56, surfaceSample.maxHeight) : 64 + random.nextInt(24);

        // 1. Structure candidate (at most 1 per sub-slot when region has structures)
        if (region.structures.length > 0 && (random.nextInt() & 1) === 0) {
          const structId = region.structures[random.nextInt(region.structures.length)];
          const descriptor = FEATURES_BY_ID.get(structId);
          if (descriptor) {
            const radius = descriptor.radius ?? 16;
            const priority = descriptor.priority ?? 90;
            const tieBreaker = MHelper.getSeed3D(cellSeed, anchorX, anchorY, anchorZ);
            candidates.push({
              anchorId: `${this.revision}:${cx},${cz}:${descriptor.id}:${anchorX},${anchorY},${anchorZ}`,
              featureId: descriptor.id,
              category: descriptor.category,
              step: descriptor.step,
              regionId: region.id,
              ownerCell: { cellX: cx, cellZ: cz },
              position: { x: anchorX, y: anchorY, z: anchorZ },
              radius,
              priority,
              tieBreaker,
              palette: descriptor.palette,
              bounds: {
                minX: anchorX - radius,
                maxX: anchorX + radius,
                minZ: anchorZ - radius,
                maxZ: anchorZ + radius
              }
            });
          }
        }

        // 2. Surface / Aerial feature candidate
        if (region.features.length > 0) {
          const featId = region.features[random.nextInt(region.features.length)];
          const descriptor = FEATURES_BY_ID.get(featId);
          if (descriptor) {
            const fx = anchorX + random.nextInt(9) - 4;
            const fz = anchorZ + random.nextInt(9) - 4;
            const ownerX = Math.floor(fx / this.cellSize);
            const ownerZ = Math.floor(fz / this.cellSize);
            if (ownerX === cx && ownerZ === cz && !this.isProtectedCenter("minecraft:the_end", fx, fz)) {
              const radius = descriptor.radius ?? 6;
              const priority = descriptor.priority ?? 40;
              const tieBreaker = MHelper.getSeed3D(cellSeed, fx, anchorY, fz);
              candidates.push({
                anchorId: `${this.revision}:${cx},${cz}:${descriptor.id}:${fx},${anchorY},${fz}`,
                featureId: descriptor.id,
                category: descriptor.category,
                step: descriptor.step,
                regionId: region.id,
                ownerCell: { cellX: cx, cellZ: cz },
                position: { x: fx, y: anchorY, z: fz },
                radius,
                priority,
                tieBreaker,
                palette: descriptor.palette,
                bounds: {
                  minX: fx - radius,
                  maxX: fx + radius,
                  minZ: fz - radius,
                  maxZ: fz + radius
                }
              });
            }
          }
        }

        // 3. Cave feature candidate when the column has caves
        if (surfaceSample.isLand && region.hasCaves) {
          const caveY = 16 + random.nextInt(24);
          const caveSample = this.lookup("minecraft:the_end", anchorX, caveY, anchorZ);
          const caveRegion = caveSample.caveRegion;
          if (caveRegion && caveRegion.features.length > 0) {
            const caveFeatId = caveRegion.features[random.nextInt(caveRegion.features.length)];
            const descriptor = FEATURES_BY_ID.get(caveFeatId);
            if (descriptor) {
              const radius = descriptor.radius ?? 6;
              const priority = descriptor.priority ?? 50;
              const tieBreaker = MHelper.getSeed3D(cellSeed, anchorX, caveY, anchorZ);
              candidates.push({
                anchorId: `${this.revision}:${cx},${cz}:${descriptor.id}:${anchorX},${caveY},${anchorZ}`,
                featureId: descriptor.id,
                category: descriptor.category,
                step: descriptor.step,
                regionId: caveRegion.id,
                ownerCell: { cellX: cx, cellZ: cz },
                position: { x: anchorX, y: caveY, z: anchorZ },
                radius,
                priority,
                tieBreaker,
                palette: descriptor.palette,
                bounds: {
                  minX: anchorX - radius,
                  maxX: anchorX + radius,
                  minZ: anchorZ - radius,
                  maxZ: anchorZ + radius
                }
              });
            }
          }
        }
      }
    }

    const frozen = Object.freeze(candidates);
    this.rawCellPlanCache.set(key, frozen);
    return frozen;
  }

  /**
   * Plans deterministic feature & structure anchors for `(cellX, cellZ)` using a 3x3 cell halo
   * so cross-border structures have a single canonical anchor owner and deterministic conflict priority.
   *
   * @param {number} cellX
   * @param {number} cellZ
   */
  planCellFeatures(cellX, cellZ) {
    const cx = Math.trunc(cellX);
    const cz = Math.trunc(cellZ);
    const cellMinX = cx * this.cellSize;
    const cellMaxX = cellMinX + this.cellSize - 1;
    const cellMinZ = cz * this.cellSize;
    const cellMaxZ = cellMinZ + this.cellSize - 1;

    // 1. Gather all raw candidates across the 3x3 halo around (cx, cz)
    const haloCandidates = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const raw = this._generateRawCellCandidates(cx + dx, cz + dz);
        for (let i = 0; i < raw.length; i++) {
          haloCandidates.push(raw[i]);
        }
      }
    }

    // 2. Sort deterministically by priority DESC, tieBreaker DESC, anchorId ASC
    haloCandidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.tieBreaker !== a.tieBreaker) return b.tieBreaker - a.tieBreaker;
      return a.anchorId < b.anchorId ? -1 : a.anchorId > b.anchorId ? 1 : 0;
    });

    // 3. Deduplicate and resolve spatial conflicts across cell borders
    const acceptedHalo = [];
    const seenIds = new Set();

    for (const candidate of haloCandidates) {
      if (seenIds.has(candidate.anchorId)) continue;

      let conflicts = false;
      for (const winner of acceptedHalo) {
        // Only check horizontal conflict if within the same vertical band (within 24 blocks Y)
        if (Math.abs(candidate.position.y - winner.position.y) > 24) continue;
        const dx = candidate.position.x - winner.position.x;
        const dz = candidate.position.z - winner.position.z;
        const minSeparation = Math.max(4, Math.floor((candidate.radius + winner.radius) * 0.5));
        if (dx * dx + dz * dz < minSeparation * minSeparation) {
          conflicts = true;
          break;
        }
      }

      if (!conflicts) {
        seenIds.add(candidate.anchorId);
        acceptedHalo.push(candidate);
      }
    }

    // 4. Partition into anchors owned by (cx, cz) and neighbor-owned halo anchors that overlap (cx, cz)
    const ownedAnchors = [];
    const overlappingHaloAnchors = [];

    for (const anchor of acceptedHalo) {
      const crossesBorder =
        anchor.bounds.minX < cellMinX ||
        anchor.bounds.maxX > cellMaxX ||
        anchor.bounds.minZ < cellMinZ ||
        anchor.bounds.maxZ > cellMaxZ;

      const overlapsTargetCell =
        anchor.bounds.maxX >= cellMinX &&
        anchor.bounds.minX <= cellMaxX &&
        anchor.bounds.maxZ >= cellMinZ &&
        anchor.bounds.minZ <= cellMaxZ;

      const enriched = Object.freeze({
        ...anchor,
        crossesBorder
      });

      if (anchor.ownerCell.cellX === cx && anchor.ownerCell.cellZ === cz) {
        ownedAnchors.push(enriched);
      } else if (overlapsTargetCell) {
        overlappingHaloAnchors.push(enriched);
      }
    }

    return {
      cellX: cx,
      cellZ: cz,
      cellSize: this.cellSize,
      revision: this.revision,
      bounds: {
        minX: cellMinX,
        maxX: cellMaxX,
        minZ: cellMinZ,
        maxZ: cellMaxZ
      },
      anchors: ownedAnchors,
      ownedAnchors,
      overlappingHaloAnchors
    };
  }
}

export { REGION_CATALOGUE, REGIONS_BY_ID };
