/**
 * BetterEnd Bedrock 26.40 — Worldgen Preparation Orchestrator (`GEN-001`, `GEN-002`, `GEN-003`).
 *
 * Pure ES module with zero Node.js imports. Runs identically in Node.js 24 test harnesses
 * and inside `@minecraft/server` 2.9.0 in Bedrock Dedicated Server.
 *
 * Responsibilities:
 * - Coordinates deterministic region lookup (`RegionService`) across all 27 regions
 *   and 113 features/structures (`REGION_CATALOGUE`, `FEATURE_STRUCTURE_CATALOGUE`).
 * - Protects the central End (`|x| <= 1024 && |z| <= 1024`: dragon island, exit portal,
 *   obsidian platform, gateways) from any BetterEnd terrain/feature mutation.
 * - Enforces single-owner cell preparation locking (`CAP-014`) so concurrent player
 *   approaches never execute duplicate or conflicting mutations.
 * - Executes staged, checkpointed cell preparation (`Unknown -> Planned -> TerrainReady ->
 *   Decorated -> Validated -> Committed`) backed by `PersistenceStore` so interrupted
 *   worldgen resumes idempotently or quarantines on revision/player-build conflicts.
 * - Manages bounded temporary ticking areas (`betterend:prep_*`) and cleans up leaked
 *   ticking areas on world load.
 */

import {
  DEFAULT_PLANNING_CELL_SIZE,
  JOURNAL_STATES,
  PROTECTED_CENTER_REGION,
  PROTECTED_END_RADIUS,
  RegionService
} from "../regions/region-service.js";
import {
  AERIAL_REGIONS,
  CAVE_REGIONS,
  FEATURE_STRUCTURE_CATALOGUE,
  FEATURES_BY_CATEGORY,
  FEATURES_BY_ID,
  REGION_CATALOGUE,
  REGIONS_BY_ID,
  SUB_REGIONS,
  SURFACE_REGIONS
} from "../regions/region-catalogue.js";
import { JavaRandom, MHelper } from "../regions/voronoi-hex.js";
import { normalizeDimensionId } from "../persistence/store.js";
import { generateBetterEndFeatureVoxels } from "./betterend-sdf.js";

export const TICKING_AREA_PREFIX = "betterend:prep_";

export const PREPARATION_STAGES = Object.freeze([
  JOURNAL_STATES.PLANNED,
  JOURNAL_STATES.TERRAIN_READY,
  JOURNAL_STATES.DECORATED,
  JOURNAL_STATES.VALIDATED,
  JOURNAL_STATES.COMMITTED
]);

const STAGE_ORDER = new Map([
  [JOURNAL_STATES.UNKNOWN, 0],
  [JOURNAL_STATES.PLANNED, 1],
  [JOURNAL_STATES.TERRAIN_READY, 2],
  [JOURNAL_STATES.DECORATED, 3],
  [JOURNAL_STATES.VALIDATED, 4],
  [JOURNAL_STATES.COMMITTED, 5],
  [JOURNAL_STATES.QUARANTINED, -1]
]);

const VANILLA_END_BASELINE_BLOCKS = new Set([
  "minecraft:air",
  "minecraft:void_air",
  "minecraft:cave_air",
  "minecraft:end_stone",
  "minecraft:obsidian",
  "minecraft:bedrock",
  "minecraft:chorus_plant",
  "minecraft:chorus_flower",
  "minecraft:water",
  "minecraft:flowing_water"
]);

function makeCellKey(dimension, cellX, cellZ) {
  return `${normalizeDimensionId(dimension)}:${Math.trunc(cellX)},${Math.trunc(cellZ)}`;
}

function makeTickingAreaName(cellX, cellZ) {
  const cx = Math.trunc(cellX);
  const cz = Math.trunc(cellZ);
  return `${TICKING_AREA_PREFIX}${cx}_${cz}`;
}

/**
 * Deterministic block-placement synthesizer for a feature/structure descriptor at an anchor.
 * Produces a stable, bounded list of `{ x, y, z, blockId, tag }` placements clipped to the
 * target cell's bounds or full anchor footprint.
 */
export function synthesizeAnchorPlacements(anchor, worldSeedBigInt, clipBounds = null) {
  const descriptor = FEATURES_BY_ID.get(anchor.featureId);
  if (!descriptor) return [];

  const placements = [];
  const ax = Math.trunc(anchor.position.x);
  const ay = Math.trunc(anchor.position.y);
  const az = Math.trunc(anchor.position.z);
  const seed = MHelper.getSeed3D(worldSeedBigInt, ax, ay, az);

  const pushPlacement = (x, y, z, blockId, role, props = {}) => {
    const bx = Math.trunc(x);
    const by = Math.max(2, Math.min(254, Math.trunc(y)));
    const bz = Math.trunc(z);
    if (Math.abs(bx) <= PROTECTED_END_RADIUS && Math.abs(bz) <= PROTECTED_END_RADIUS) {
      return;
    }
    if (clipBounds) {
      if (
        bx < clipBounds.minX ||
        bx > clipBounds.maxX ||
        bz < clipBounds.minZ ||
        bz > clipBounds.maxZ
      ) {
        return;
      }
    }
    placements.push({
      x: bx,
      y: by,
      z: bz,
      blockId,
      props,
      role,
      anchorId: anchor.anchorId,
      featureId: anchor.featureId,
      category: descriptor.category
    });
  };

  const fId = anchor.featureId;
  const voxels = generateBetterEndFeatureVoxels(fId, seed, 0, 0, 0, descriptor);
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    pushPlacement(ax + v.x, ay + v.y, az + v.z, v.blockId, "sdf_voxel", v.props ?? {});
  }

  return placements;
}

export class GenerationService {
  /**
   * @param {object} options
   * @param {RegionService} [options.regionService]
   * @param {import('../persistence/store.js').PersistenceStore} [options.store]
   * @param {bigint | string | number} [options.worldSeed=0n]
   * @param {bigint | string | number} [options.portSeed=0n]
   * @param {number | string} [options.revision=1]
   * @param {number} [options.cellSize=DEFAULT_PLANNING_CELL_SIZE]
   * @param {object} [options.tickingAreaManager=null]
   * @param {number} [options.maxConcurrentTickingAreas=4]
   * @param {() => number} [options.clock]
   */
  constructor({
    regionService = null,
    store = null,
    worldSeed = 0n,
    portSeed = 0n,
    revision = 1,
    cellSize = DEFAULT_PLANNING_CELL_SIZE,
    tickingAreaManager = null,
    maxConcurrentTickingAreas = 4,
    clock = () => Date.now()
  } = {}) {
    this.regionService =
      regionService ??
      new RegionService({
        worldSeed,
        portSeed,
        revision,
        cellSize
      });
    this.store = store ?? null;
    this.cellSize = this.regionService.cellSize;
    this.revision = this.regionService.revision;
    this.tickingAreaManager = tickingAreaManager;
    this.maxConcurrentTickingAreas = Math.max(1, Math.trunc(maxConcurrentTickingAreas));
    this.clock = clock;

    // Registry maps for all 27 regions and 113 features/structures
    this.regions = REGIONS_BY_ID;
    this.features = FEATURES_BY_ID;
    this.supplementalFeatures = new Map();

    // Single-owner cell preparation locks (`cellKey -> { ownerId, acquiredAt, stage }`)
    this.activeLocks = new Map();
    // Bounded ticking areas tracked in-memory (`areaName -> { cellKey, dimension, cellX, cellZ, createdAt }`)
    this.activeTickingAreas = new Map();
    // Deterministic cell artifacts (`cellKey -> preparedCellArtifact`)
    this.cellArtifacts = new Map();
    // Pending preparation queue (`cellKey -> { dimension, cellX, cellZ, requestedBy, priority, enqueuedAt }`)
    this.preparationQueue = new Map();

    if (this.store) {
      this._hydrateJournalFromStore();
    }
  }

  /**
   * Restores persisted region preparation journal records from `PersistenceStore`.
   */
  _hydrateJournalFromStore() {
    if (!this.store) return;
    const savedSnapshot = this.store.getGlobalRecord("region_journal_snapshot", null);
    if (savedSnapshot && Array.isArray(savedSnapshot.cells)) {
      this.regionService.journal.importSnapshot(savedSnapshot);
    }
  }

  _persistCellRecord(dimension, cellX, cellZ, record, artifact = null) {
    if (!this.store) return;
    const cx = Math.trunc(cellX);
    const cz = Math.trunc(cellZ);
    const regionX = cx >> 2;
    const regionZ = cz >> 2;
    const cellKey = `${cx},${cz}`;

    this.store.setRegionRecord(dimension, regionX, regionZ, `cell:${cellKey}`, {
      cellX: cx,
      cellZ: cz,
      dimension: normalizeDimensionId(dimension),
      state: record.state,
      revision: record.revision,
      quarantineReason: record.quarantineReason ?? null,
      protectedPlayerBuild: Boolean(record.protectedPlayerBuild),
      anchorCount: Number(record.anchorCount ?? 0),
      history: Array.isArray(record.history) ? record.history : [],
      checkpointStage: artifact?.checkpointStage ?? record.state,
      surfacePlacementCount: artifact?.surfacePlacements?.length ?? 0,
      cavePlacementCount: artifact?.cavePlacements?.length ?? 0,
      aerialPlacementCount: artifact?.aerialPlacements?.length ?? 0,
      featurePlacementCount: artifact?.featurePlacements?.length ?? 0,
      placedAnchorIds: artifact?.placedAnchorIds ?? [],
      updatedAt: this.clock()
    });

    this.store.setGlobalRecord(
      "region_journal_snapshot",
      this.regionService.journal.exportSnapshot()
    );
  }

  getPersistedCellRecord(dimension, cellX, cellZ) {
    if (!this.store) return null;
    const cx = Math.trunc(cellX);
    const cz = Math.trunc(cellZ);
    const regionX = cx >> 2;
    const regionZ = cz >> 2;
    return this.store.getRegionRecord(dimension, regionX, regionZ, `cell:${cx},${cz}`, null);
  }

  /**
   * Returns all 27 registered regions.
   */
  getRegisteredRegions() {
    return REGION_CATALOGUE;
  }

  /**
   * Returns all 113 canonical features & structures plus any registered supplemental descriptors.
   */
  getRegisteredFeatures() {
    if (this.supplementalFeatures.size === 0) {
      return FEATURE_STRUCTURE_CATALOGUE;
    }
    return [...FEATURE_STRUCTURE_CATALOGUE, ...this.supplementalFeatures.values()];
  }

  registerSupplementalFeature(descriptor) {
    if (!descriptor || typeof descriptor.id !== "string") {
      throw new Error("Supplemental feature descriptor requires an id");
    }
    const frozen = Object.freeze({ ...descriptor });
    this.supplementalFeatures.set(descriptor.id, frozen);
    return frozen;
  }

  /**
   * Checks whether any part of planning cell `(cellX, cellZ)` overlaps the protected central End
   * (`|x| <= 1024 && |z| <= 1024`).
   */
  isProtectedCell(dimension, cellX, cellZ) {
    const normDim = normalizeDimensionId(dimension);
    if (normDim !== "minecraft:the_end") return false;
    const cx = Math.trunc(cellX);
    const cz = Math.trunc(cellZ);
    const minX = cx * this.cellSize;
    const maxX = minX + this.cellSize - 1;
    const minZ = cz * this.cellSize;
    const maxZ = minZ + this.cellSize - 1;

    const closestX = Math.max(minX, Math.min(0, maxX));
    const closestZ = Math.max(minZ, Math.min(0, maxZ));
    return this.regionService.isProtectedCenter(normDim, closestX, closestZ);
  }

  /**
   * Acquires single-owner lock for a planning cell (`CAP-014`).
   */
  acquireCellLock(cellKey, ownerId = "system") {
    const existing = this.activeLocks.get(cellKey);
    if (existing && existing.ownerId !== ownerId) {
      return {
        acquired: false,
        alreadyLocked: true,
        lockedBy: existing.ownerId,
        lock: existing
      };
    }
    const lock = {
      cellKey,
      ownerId: String(ownerId),
      acquiredAt: this.clock()
    };
    this.activeLocks.set(cellKey, lock);
    return {
      acquired: true,
      alreadyLocked: Boolean(existing),
      lockedBy: lock.ownerId,
      lock
    };
  }

  releaseCellLock(cellKey, ownerId = null) {
    const existing = this.activeLocks.get(cellKey);
    if (!existing) return false;
    if (ownerId !== null && existing.ownerId !== String(ownerId)) {
      return false;
    }
    this.activeLocks.delete(cellKey);
    return true;
  }

  /**
   * Manages bounded temporary ticking areas (`betterend:prep_<cellX>_<cellZ>`)
   * with explicit capacity checks and cleanup.
   */
  async acquireCellTickingArea(dimension, cellX, cellZ) {
    const areaName = makeTickingAreaName(cellX, cellZ);
    const cellKey = makeCellKey(dimension, cellX, cellZ);
    if (this.activeTickingAreas.has(areaName)) {
      return { acquired: true, areaName, reused: true };
    }
    if (this.activeTickingAreas.size >= this.maxConcurrentTickingAreas) {
      return { acquired: false, areaName, reason: "ticking_area_capacity_reached" };
    }

    const minX = Math.trunc(cellX) * this.cellSize;
    const minZ = Math.trunc(cellZ) * this.cellSize;
    const maxX = minX + this.cellSize - 1;
    const maxZ = minZ + this.cellSize - 1;

    if (this.tickingAreaManager) {
      if (typeof this.tickingAreaManager.hasCapacity === "function") {
        const hasCap = this.tickingAreaManager.hasCapacity();
        if (!hasCap) {
          return { acquired: false, areaName, reason: "engine_ticking_area_capacity_exhausted" };
        }
      }
      if (typeof this.tickingAreaManager.createTickingArea === "function") {
        await this.tickingAreaManager.createTickingArea(areaName, {
          dimension,
          from: { x: minX, y: 0, z: minZ },
          to: { x: maxX, y: 255, z: maxZ }
        });
      }
    }

    const entry = {
      areaName,
      cellKey,
      dimension: normalizeDimensionId(dimension),
      cellX: Math.trunc(cellX),
      cellZ: Math.trunc(cellZ),
      bounds: { minX, maxX, minZ, maxZ },
      createdAt: this.clock()
    };
    this.activeTickingAreas.set(areaName, entry);
    if (this.store) {
      this.store.setGlobalRecord("active_prep_ticking_areas", Array.from(this.activeTickingAreas.keys()));
    }
    return { acquired: true, areaName, reused: false };
  }

  async releaseCellTickingArea(cellX, cellZ) {
    const areaName = makeTickingAreaName(cellX, cellZ);
    const existed = this.activeTickingAreas.delete(areaName);
    if (this.tickingAreaManager && typeof this.tickingAreaManager.removeTickingArea === "function") {
      try {
        await this.tickingAreaManager.removeTickingArea(areaName);
      } catch {
        // Ignore if already removed by engine
      }
    }
    if (this.store) {
      this.store.setGlobalRecord("active_prep_ticking_areas", Array.from(this.activeTickingAreas.keys()));
    }
    return existed;
  }

  /**
   * Startup reconciliation: removes any leaked `betterend:prep_*` ticking areas left behind
   * by an unclean server stop (`GEN-002`).
   */
  async reconcileLeakedTickingAreas() {
    const removed = [];
    const tracked = this.store
      ? this.store.getGlobalRecord("active_prep_ticking_areas", [])
      : [];
    const candidates = new Set([
      ...(Array.isArray(tracked) ? tracked : []),
      ...this.activeTickingAreas.keys()
    ]);

    if (this.tickingAreaManager && typeof this.tickingAreaManager.getAllTickingAreas === "function") {
      const engineAreas = await this.tickingAreaManager.getAllTickingAreas();
      if (Array.isArray(engineAreas)) {
        for (const area of engineAreas) {
          const id = typeof area === "string" ? area : area?.identifier;
          if (typeof id === "string" && id.startsWith(TICKING_AREA_PREFIX)) {
            candidates.add(id);
          }
        }
      }
    }

    for (const areaName of candidates) {
      if (!String(areaName).startsWith(TICKING_AREA_PREFIX)) continue;
      if (this.tickingAreaManager && typeof this.tickingAreaManager.removeTickingArea === "function") {
        try {
          await this.tickingAreaManager.removeTickingArea(areaName);
        } catch {
          // Ignore already-absent area
        }
      }
      this.activeTickingAreas.delete(areaName);
      removed.push(areaName);
    }

    if (this.store) {
      this.store.setGlobalRecord("active_prep_ticking_areas", []);
    }
    return removed;
  }

  /**
   * Detects whether a cell contains existing player builds or foreign blocks that must never
   * be overwritten by worldgen (`GEN-002` / §7.7).
   */
  detectPlayerBuildInCell(dimension, cellX, cellZ, options = {}) {
    if (options.hasPlayerBuilds || options.existingPlayerBuild) {
      return { hasPlayerBuilds: true, reason: "explicit_player_build_flag" };
    }
    if (Array.isArray(options.untrackedPlayerBlocks) && options.untrackedPlayerBlocks.length > 0) {
      return { hasPlayerBuilds: true, reason: "untracked_player_blocks_present" };
    }
    if (Array.isArray(options.existingBlocks)) {
      for (const blk of options.existingBlocks) {
        const blockId = typeof blk === "string" ? blk : blk?.typeId ?? blk?.blockId;
        if (blockId && !VANILLA_END_BASELINE_BLOCKS.has(blockId)) {
          return { hasPlayerBuilds: true, reason: `foreign_block_detected:${blockId}` };
        }
      }
    }
    return { hasPlayerBuilds: false, reason: null };
  }

  /**
   * Deterministic Stage 1 (`Planned`): computes the regional surface/cave/aerial column plan
   * and resolves cross-border 3x3 halo feature & structure anchors.
   */
  _buildStagePlanned(dimension, cx, cz) {
    const featurePlan = this.regionService.planCellFeatures(cx, cz);
    const minX = featurePlan.bounds.minX;
    const minZ = featurePlan.bounds.minZ;

    // Sample column grid (every 4 blocks across the 64x64 cell = 16x16 = 256 columns)
    const columnStep = 4;
    const columns = [];
    const regionCounts = new Map();

    for (let x = minX; x <= featurePlan.bounds.maxX; x += columnStep) {
      for (let z = minZ; z <= featurePlan.bounds.maxZ; z += columnStep) {
        const surfaceLookup = this.regionService.lookup(dimension, x, 72, z);
        const region = surfaceLookup.effectiveRegion;
        if (region) {
          regionCounts.set(region.id, (regionCounts.get(region.id) ?? 0) + 1);
        }
        let caveRegionId = null;
        if (surfaceLookup.isLand && region?.hasCaves) {
          const caveLookup = this.regionService.lookup(dimension, x, 28, z);
          caveRegionId = caveLookup.caveRegion?.id ?? null;
        }
        columns.push({
          x,
          z,
          isLand: surfaceLookup.isLand,
          maxHeight: surfaceLookup.maxHeight,
          regionId: region?.id ?? "the_end",
          layer: region?.layer ?? "surface",
          caveRegionId
        });
      }
    }

    let dominantRegionId = "foggy_mushroomland";
    let bestCount = -1;
    for (const [regId, count] of regionCounts.entries()) {
      if (count > bestCount) {
        bestCount = count;
        dominantRegionId = regId;
      }
    }

    return {
      cellX: cx,
      cellZ: cz,
      dimension: normalizeDimensionId(dimension),
      revision: this.revision,
      dominantRegionId,
      bounds: featurePlan.bounds,
      columns,
      featurePlan,
      surfacePlacements: [],
      cavePlacements: [],
      aerialPlacements: [],
      featurePlacements: [],
      placedAnchorIds: [],
      checkpointStage: JOURNAL_STATES.PLANNED
    };
  }

  /**
   * Deterministic Stage 2 (`TerrainReady`): generates surface block replacements (`topBlock`,
   * `underBlock`, `altTopBlock`, `surface.rules`), cave carving/lining (`4 <= y < 48`),
   * and aerial small-island formations (`ice_starfield`, `flower_islets`, `waterfall_ponds`).
   */
  _buildStageTerrainReady(artifact) {
    const surfacePlacements = [];
    const cavePlacements = [];
    const aerialPlacements = [];

    for (const col of artifact.columns) {
      const region = REGIONS_BY_ID.get(col.regionId);
      if (!region) continue;

      const colSeed = MHelper.getSeed3D(
        this.regionService.effectiveSeed,
        col.x,
        col.z,
        Number(this.revision) || 1
      );
      const rng = new JavaRandom(colSeed);

      if (col.isLand) {
        const topY = Math.max(54, Math.min(120, Math.trunc(col.maxHeight)));
        const surface = region.surface ?? {};
        let chosenTop = surface.topBlock ?? "minecraft:end_stone";
        if (surface.altTopBlock && (rng.nextInt(4) === 0)) {
          chosenTop = surface.altTopBlock;
        } else if (Array.isArray(surface.rules) && surface.rules.length > 0) {
          for (const rule of surface.rules) {
            if (rng.nextDouble() < (rule.chance ?? 0.35)) {
              chosenTop = rule.topBlock ?? chosenTop;
              break;
            }
          }
        }
        const underBlock = surface.underBlock ?? "minecraft:end_stone";

        if (chosenTop !== "minecraft:end_stone") {
          surfacePlacements.push({
            x: col.x,
            y: topY,
            z: col.z,
            blockId: chosenTop,
            role: "surface_top",
            regionId: region.id
          });
        }
        if (underBlock !== "minecraft:end_stone") {
          surfacePlacements.push({
            x: col.x,
            y: topY - 1,
            z: col.z,
            blockId: underBlock,
            role: "surface_under",
            regionId: region.id
          });
        }

        // Cave carving and lining in `4 <= y < 48`
        if (col.caveRegionId) {
          const caveRegion = REGIONS_BY_ID.get(col.caveRegionId);
          if (caveRegion) {
            const caveFloorY = 14 + (rng.nextInt(16) & 15);
            const caveCeilY = caveFloorY + 6 + (rng.nextInt(6) & 3);
            const floorBlock = caveRegion.surface?.topBlock ?? "betterend:cave_moss";
            const wallBlock = caveRegion.surface?.underBlock ?? "minecraft:end_stone";
            cavePlacements.push({
              x: col.x,
              y: caveFloorY,
              z: col.z,
              blockId: floorBlock,
              role: "cave_floor",
              regionId: caveRegion.id
            });
            cavePlacements.push({
              x: col.x,
              y: caveCeilY,
              z: col.z,
              blockId: wallBlock,
              role: "cave_ceiling",
              regionId: caveRegion.id
            });
          }
        }
      } else if (region.layer === "aerial") {
        // Void / aerial small-island formations
        if (rng.nextInt(3) === 0) {
          const islandY = 58 + rng.nextInt(24);
          const topBlock = region.surface?.topBlock ?? "betterend:end_moss";
          const underBlock = region.surface?.underBlock ?? "minecraft:end_stone";
          aerialPlacements.push({
            x: col.x,
            y: islandY,
            z: col.z,
            blockId: topBlock,
            role: "aerial_island_top",
            regionId: region.id
          });
          aerialPlacements.push({
            x: col.x,
            y: islandY - 1,
            z: col.z,
            blockId: underBlock,
            role: "aerial_island_core",
            regionId: region.id
          });
        }
      }
    }

    artifact.surfacePlacements = surfacePlacements;
    artifact.cavePlacements = cavePlacements;
    artifact.aerialPlacements = aerialPlacements;
    artifact.checkpointStage = JOURNAL_STATES.TERRAIN_READY;
    return artifact;
  }

  /**
   * Deterministic Stage 3 (`Decorated`): places all owned feature & structure anchors
   * and clipped contributions from neighbor-owned 3x3 halo anchors without duplicate placement.
   */
  _buildStageDecorated(artifact) {
    const featurePlacements = [];
    const placedAnchorIds = new Set(artifact.placedAnchorIds ?? []);
    const allAnchors = [
      ...artifact.featurePlan.ownedAnchors,
      ...artifact.featurePlan.overlappingHaloAnchors
    ];

    for (const anchor of allAnchors) {
      if (placedAnchorIds.has(anchor.anchorId)) {
        continue;
      }
      const placements = synthesizeAnchorPlacements(
        anchor,
        this.regionService.effectiveSeed,
        artifact.bounds
      );
      for (let i = 0; i < placements.length; i++) {
        featurePlacements.push(placements[i]);
      }
      placedAnchorIds.add(anchor.anchorId);
    }

    artifact.featurePlacements = featurePlacements;
    artifact.placedAnchorIds = Array.from(placedAnchorIds);
    artifact.checkpointStage = JOURNAL_STATES.DECORATED;
    return artifact;
  }

  /**
   * Deterministic Stage 4 (`Validated`): verifies that no placements fall inside the
   * protected central End, all placements lie within the cell bounds, and revision matches.
   */
  _validateCellArtifact(artifact, requestedRevision) {
    if (requestedRevision !== undefined && requestedRevision !== this.revision) {
      return {
        ok: false,
        reason: `revision_mismatch:expected_${this.revision}_got_${requestedRevision}`
      };
    }

    const { minX, maxX, minZ, maxZ } = artifact.bounds;
    const allLists = [
      artifact.surfacePlacements,
      artifact.cavePlacements,
      artifact.aerialPlacements,
      artifact.featurePlacements
    ];

    for (const list of allLists) {
      for (const p of list) {
        if (this.regionService.isProtectedCenter(artifact.dimension, p.x, p.z)) {
          return {
            ok: false,
            reason: `placement_in_protected_center:${p.x},${p.z}`
          };
        }
        if (p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ) {
          return {
            ok: false,
            reason: `placement_outside_cell_bounds:${p.x},${p.z}`
          };
        }
      }
    }

    artifact.checkpointStage = JOURNAL_STATES.VALIDATED;
    return { ok: true, reason: null };
  }

  /**
   * Executes or resumes deterministic preparation for planning cell `(cellX, cellZ)`.
   *
   * Supports:
   * - Single-owner locking (`options.ownerId`) so concurrent player approaches share a
   *   single authoritative execution (`CAP-014`).
   * - Staged checkpointing (`options.stopAfterStage`) so interrupted preparation resumes
   *   idempotently from the last committed checkpoint (`Planned`, `TerrainReady`, `Decorated`, `Validated`).
   * - Quarantine protection on player builds (`options.hasPlayerBuilds`) or revision mismatch.
   *
   * @param {string} dimension
   * @param {number} cellX
   * @param {number} cellZ
   * @param {object} [options]
   */
  prepareCell(dimension, cellX, cellZ, options = {}) {
    const normDim = normalizeDimensionId(dimension);
    const cx = Math.trunc(cellX);
    const cz = Math.trunc(cellZ);
    const cellKey = makeCellKey(normDim, cx, cz);

    // 1. Non-End dimensions are untouched
    if (normDim !== "minecraft:the_end") {
      return {
        ok: true,
        skipped: true,
        protectedCenter: false,
        state: "NotApplicable",
        cellX: cx,
        cellZ: cz,
        dimension: normDim
      };
    }

    // 2. Central End protection (`|x| <= 1024 && |z| <= 1024`)
    if (!options.ignoreProtectedCenter && this.isProtectedCell(normDim, cx, cz)) {
      return {
        ok: true,
        skipped: true,
        protectedCenter: true,
        state: "ProtectedCenter",
        cellX: cx,
        cellZ: cz,
        dimension: normDim,
        protectedTags: this.regionService.getProtectedZoneTags(
          cx * this.cellSize + (this.cellSize >> 1),
          cz * this.cellSize + (this.cellSize >> 1)
        )
      };
    }

    // 3. Check if already committed or quarantined
    const currentState = this.regionService.getCellState(cx, cz);
    if (currentState === JOURNAL_STATES.QUARANTINED) {
      const record = this.regionService.journal.getRecord(cx, cz);
      return {
        ok: false,
        quarantined: true,
        state: JOURNAL_STATES.QUARANTINED,
        reason: record.quarantineReason,
        record,
        artifact: this.cellArtifacts.get(cellKey) ?? null
      };
    }

    if (currentState === JOURNAL_STATES.COMMITTED && options.revision === undefined) {
      const record = this.regionService.journal.getRecord(cx, cz);
      return {
        ok: true,
        alreadyCommitted: true,
        state: JOURNAL_STATES.COMMITTED,
        record,
        artifact: this.cellArtifacts.get(cellKey) ?? null
      };
    }

    // 4. Single-owner lock enforcement (`CAP-014`)
    const ownerId = options.ownerId ?? "system";
    const lockResult = this.acquireCellLock(cellKey, ownerId);
    if (!lockResult.acquired) {
      return {
        ok: true,
        joinedExisting: true,
        lockedBy: lockResult.lockedBy,
        state: currentState,
        cellX: cx,
        cellZ: cz,
        artifact: this.cellArtifacts.get(cellKey) ?? null
      };
    }

    try {
      // 5. Player-build / foreign block check before mutating
      const playerBuildCheck = this.detectPlayerBuildInCell(normDim, cx, cz, options);
      if (playerBuildCheck.hasPlayerBuilds) {
        const res = this.regionService.transitionCell(cx, cz, JOURNAL_STATES.QUARANTINED, {
          hasPlayerBuilds: true,
          reason: playerBuildCheck.reason
        });
        this._persistCellRecord(normDim, cx, cz, res.record, null);
        return {
          ok: false,
          quarantined: true,
          state: JOURNAL_STATES.QUARANTINED,
          reason: res.reason,
          record: res.record,
          artifact: null
        };
      }

      // 6. Revision mismatch check
      if (options.revision !== undefined && options.revision !== this.revision) {
        const res = this.regionService.transitionCell(cx, cz, JOURNAL_STATES.QUARANTINED, {
          revision: options.revision
        });
        this._persistCellRecord(normDim, cx, cz, res.record, null);
        return {
          ok: false,
          quarantined: true,
          state: JOURNAL_STATES.QUARANTINED,
          reason: res.reason,
          record: res.record,
          artifact: null
        };
      }

      const stopAfterStage = options.stopAfterStage ?? JOURNAL_STATES.COMMITTED;
      const stopOrder = STAGE_ORDER.get(stopAfterStage) ?? 5;

      let artifact = this.cellArtifacts.get(cellKey);
      let state = this.regionService.getCellState(cx, cz);

      // Stage 1: Unknown -> Planned
      if (STAGE_ORDER.get(state) < 1 && stopOrder >= 1) {
        artifact = this._buildStagePlanned(normDim, cx, cz);
        this.cellArtifacts.set(cellKey, artifact);
        const step = this.regionService.transitionCell(cx, cz, JOURNAL_STATES.PLANNED, {
          revision: this.revision,
          anchorCount: artifact.featurePlan.ownedAnchors.length,
          reason: "planned_anchors_and_columns"
        });
        if (!step.ok) {
          this._persistCellRecord(normDim, cx, cz, step.record, artifact);
          return { ok: false, quarantined: true, state: step.state, reason: step.reason, record: step.record };
        }
        this._persistCellRecord(normDim, cx, cz, step.record, artifact);
        state = step.state;
      }

      if (!artifact) {
        artifact = this._buildStagePlanned(normDim, cx, cz);
        this.cellArtifacts.set(cellKey, artifact);
      }

      // Stage 2: Planned -> TerrainReady
      if (STAGE_ORDER.get(state) < 2 && stopOrder >= 2) {
        this._buildStageTerrainReady(artifact);
        const step = this.regionService.transitionCell(cx, cz, JOURNAL_STATES.TERRAIN_READY, {
          revision: this.revision,
          reason: "surface_cave_and_aerial_terrain_ready"
        });
        if (!step.ok) {
          this._persistCellRecord(normDim, cx, cz, step.record, artifact);
          return { ok: false, quarantined: true, state: step.state, reason: step.reason, record: step.record };
        }
        this._persistCellRecord(normDim, cx, cz, step.record, artifact);
        state = step.state;
      }

      // Stage 3: TerrainReady -> Decorated
      if (STAGE_ORDER.get(state) < 3 && stopOrder >= 3) {
        if (artifact.surfacePlacements.length === 0 && artifact.cavePlacements.length === 0) {
          this._buildStageTerrainReady(artifact);
        }
        this._buildStageDecorated(artifact);
        const step = this.regionService.transitionCell(cx, cz, JOURNAL_STATES.DECORATED, {
          revision: this.revision,
          anchorCount: artifact.placedAnchorIds.length,
          reason: "features_and_structures_decorated"
        });
        if (!step.ok) {
          this._persistCellRecord(normDim, cx, cz, step.record, artifact);
          return { ok: false, quarantined: true, state: step.state, reason: step.reason, record: step.record };
        }
        this._persistCellRecord(normDim, cx, cz, step.record, artifact);
        state = step.state;
      }

      // Stage 4: Decorated -> Validated
      if (STAGE_ORDER.get(state) < 4 && stopOrder >= 4) {
        const validation = this._validateCellArtifact(artifact, options.revision);
        if (!validation.ok) {
          const q = this.regionService.quarantineCell(cx, cz, validation.reason);
          this._persistCellRecord(normDim, cx, cz, q.record, artifact);
          return { ok: false, quarantined: true, state: q.state, reason: q.reason, record: q.record };
        }
        const step = this.regionService.transitionCell(cx, cz, JOURNAL_STATES.VALIDATED, {
          revision: this.revision,
          reason: "validated_bounds_and_revision"
        });
        if (!step.ok) {
          this._persistCellRecord(normDim, cx, cz, step.record, artifact);
          return { ok: false, quarantined: true, state: step.state, reason: step.reason, record: step.record };
        }
        this._persistCellRecord(normDim, cx, cz, step.record, artifact);
        state = step.state;
      }

      // Stage 5: Validated -> Committed
      if (STAGE_ORDER.get(state) < 5 && stopOrder >= 5) {
        artifact.checkpointStage = JOURNAL_STATES.COMMITTED;
        const step = this.regionService.transitionCell(cx, cz, JOURNAL_STATES.COMMITTED, {
          revision: this.revision,
          anchorCount: artifact.placedAnchorIds.length,
          reason: "committed_cell_preparation"
        });
        if (!step.ok) {
          this._persistCellRecord(normDim, cx, cz, step.record, artifact);
          return { ok: false, quarantined: true, state: step.state, reason: step.reason, record: step.record };
        }
        this._persistCellRecord(normDim, cx, cz, step.record, artifact);
        state = step.state;
      }

      const finalRecord = this.regionService.journal.getRecord(cx, cz);
      return {
        ok: true,
        quarantined: false,
        protectedCenter: false,
        state,
        cellX: cx,
        cellZ: cz,
        dimension: normDim,
        record: finalRecord,
        artifact
      };
    } finally {
      if (!options.keepLock) {
        this.releaseCellLock(cellKey, ownerId);
      }
    }
  }

  /**
   * Enqueues planning cells around an approaching player in the End (`CAP-014`).
   * Deduplicates requests so two players approaching the same cell share the single queue entry.
   */
  enqueuePlayerApproach(playerId, dimension, position, { radiusCells = 1 } = {}) {
    const normDim = normalizeDimensionId(dimension);
    if (normDim !== "minecraft:the_end" || !position) {
      return [];
    }
    const centerCellX = Math.floor(Number(position.x) / this.cellSize);
    const centerCellZ = Math.floor(Number(position.z) / this.cellSize);
    const r = Math.max(0, Math.min(2, Math.trunc(radiusCells)));
    const enqueued = [];

    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const cx = centerCellX + dx;
        const cz = centerCellZ + dz;
        if (this.isProtectedCell(normDim, cx, cz)) continue;
        const state = this.regionService.getCellState(cx, cz);
        if (state === JOURNAL_STATES.COMMITTED || state === JOURNAL_STATES.QUARANTINED) {
          continue;
        }
        const cellKey = makeCellKey(normDim, cx, cz);
        const existing = this.preparationQueue.get(cellKey);
        if (existing) {
          if (!existing.requesters.includes(String(playerId))) {
            existing.requesters.push(String(playerId));
          }
          enqueued.push({ cellKey, cellX: cx, cellZ: cz, joinedQueue: true });
        } else {
          const entry = {
            cellKey,
            dimension: normDim,
            cellX: cx,
            cellZ: cz,
            requesters: [String(playerId)],
            priority: dx === 0 && dz === 0 ? 100 : 50,
            enqueuedAt: this.clock()
          };
          this.preparationQueue.set(cellKey, entry);
          enqueued.push({ cellKey, cellX: cx, cellZ: cz, joinedQueue: false });
        }
      }
    }

    return enqueued;
  }

  /**
   * Advances queued cell preparations within a bounded tick budget.
   */
  stepPreparationQueue({ maxCells = 2 } = {}) {
    const entries = Array.from(this.preparationQueue.values()).sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.enqueuedAt - b.enqueuedAt;
    });

    const processed = [];
    const limit = Math.max(1, Math.trunc(maxCells));

    for (let i = 0; i < Math.min(limit, entries.length); i++) {
      const entry = entries[i];
      this.preparationQueue.delete(entry.cellKey);
      const ownerId = entry.requesters[0] ?? "queue";
      const result = this.prepareCell(entry.dimension, entry.cellX, entry.cellZ, { ownerId });
      processed.push(result);
    }

    return processed;
  }

  /**
   * Recovers any cells left in intermediate preparation states (`Planned`, `TerrainReady`,
   * `Decorated`, `Validated`) after an unclean stop, either resuming them to `Committed`
   * or quarantining them if their revision mismatches.
   */
  recoverInterruptedPreparations({ resumeToCommitted = true } = {}) {
    const snapshot = this.regionService.journal.exportSnapshot();
    const results = [];

    for (const cell of snapshot.cells) {
      if (
        cell.state === JOURNAL_STATES.UNKNOWN ||
        cell.state === JOURNAL_STATES.COMMITTED ||
        cell.state === JOURNAL_STATES.QUARANTINED
      ) {
        continue;
      }

      if (cell.revision !== this.revision) {
        const q = this.regionService.quarantineCell(
          cell.cellX,
          cell.cellZ,
          `recovery_revision_mismatch:expected_${this.revision}_got_${cell.revision}`
        );
        this._persistCellRecord("minecraft:the_end", cell.cellX, cell.cellZ, q.record, null);
        results.push({ cellX: cell.cellX, cellZ: cell.cellZ, action: "quarantined", state: q.state });
      } else if (resumeToCommitted) {
        const res = this.prepareCell("minecraft:the_end", cell.cellX, cell.cellZ, {
          ownerId: "recovery"
        });
        results.push({ cellX: cell.cellX, cellZ: cell.cellZ, action: "resumed", state: res.state });
      }
    }

    return results;
  }
}

export default GenerationService;
