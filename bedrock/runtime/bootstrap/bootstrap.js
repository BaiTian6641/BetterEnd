/**
 * BetterEnd Bedrock 26.40 — Runtime Bootstrap & Event Wiring (`bootstrap.js`).
 *
 * Pure ES module with zero Node.js imports and zero static experimental graphics
 * imports. Shared by both the Stable (`main-stable.js`) and Experimental Vibrant Visuals
 * (`main-experimental-vv.js`) entrypoints.
 */

import { InMemoryWorldPropertyAdapter, PersistenceStore } from "../persistence/store.js";
import { RegionService } from "../regions/region-service.js";
import { FEATURES_BY_ID, REGION_CATALOGUE, REGIONS_BY_ID } from "../regions/region-catalogue.js";
import { JavaRandom, MHelper } from "../regions/voronoi-hex.js";
import { GenerationService, synthesizeAnchorPlacements } from "../generation/generation-service.js";
import {
  DEFAULT_ALLOYING_RECIPES,
  DEFAULT_INFUSION_RECIPES,
  DEFAULT_SINGLE_INPUT_SMELTER_RECIPES,
  DEFAULT_SMITHING_RECIPES,
  StationsService
} from "../stations/stations-service.js";
import { EquipmentService } from "../equipment/equipment-service.js";
import { EcologyService } from "../ecology/ecology-service.js";
import { TransportService } from "../transport/transport-service.js";
import { PresentationService } from "../presentation/presentation-service.js";
import { CompatibilityService, QUERY_CHANNEL_ID, RESPONSE_CHANNEL_ID } from "../integration/compatibility-service.js";

export const REQUIRED_CUSTOM_BLOCK_COMPONENT_IDS = Object.freeze([
  "betterend:smelter",
  "betterend:anvil",
  "betterend:infusion_pedestal",
  "betterend:eternal_pedestal",
  "betterend:pedestal",
  "betterend:respawn_obelisk",
  "betterend:silk_moth_nest",
  "betterend:chair",
  "betterend:bouncy",
  "betterend:hazard",
  "betterend:sponge",
  "betterend:hydrothermal_vent",
  "betterend:brimstone",
  "betterend:emerald_ice",
  "betterend:umbrella_cluster",
  "betterend:flower_pot",
  "betterend:partitioned_state"
]);

export const COMPILER_BLOCK_COMPONENT_ALIASES = Object.freeze([
  "betterend:station_interaction",
  "betterend:interactive_furniture",
  "betterend:ecology_tick",
  "betterend:multiblock_guard"
]);

export const CUSTOM_BLOCK_COMPONENTS = Object.freeze([
  ...REQUIRED_CUSTOM_BLOCK_COMPONENT_IDS,
  ...COMPILER_BLOCK_COMPONENT_ALIASES
]);

export const REQUIRED_CUSTOM_ITEM_COMPONENT_IDS = Object.freeze([
  "betterend:hammer",
  "betterend:elytra_carrier",
  "betterend:boat_spawner",
  "betterend:bucket_spawner",
  "betterend:guidebook"
]);

export const COMPILER_ITEM_COMPONENT_ALIASES = Object.freeze([
  "betterend:hammer_mine",
  "betterend:spear_combat",
  "betterend:food_effects"
]);

export const CUSTOM_ITEM_COMPONENTS = Object.freeze([
  ...REQUIRED_CUSTOM_ITEM_COMPONENT_IDS,
  ...COMPILER_ITEM_COMPONENT_ALIASES
]);

function formatTitle(shortId) {
  return String(shortId ?? "")
    .replace(/^betterend:/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export class BetterEndRuntime {
  /**
   * @param {object} options
   * @param {object} [options.serverModule=null] `@minecraft/server` module or mock
   * @param {object} [options.uiModule=null] `@minecraft/server-ui` module or mock
   * @param {object} [options.graphicsModule=null] Optional graphics module (only in experimental-2640)
   * @param {string} [options.profile='stable-2640'] `'stable-2640'` or `'experimental-2640'`
   * @param {bigint | string | number} [options.worldSeed=0n]
   * @param {bigint | string | number} [options.portSeed=0x424532363430n]
   * @param {number} [options.revision=1]
   * @param {object} [options.worldAdapter=null]
   */
  constructor({
    serverModule = null,
    uiModule = null,
    graphicsModule = null,
    profile = "stable-2640",
    worldSeed = 0n,
    portSeed = 0x424532363430n,
    revision = 1,
    worldAdapter = null
  } = {}) {
    this.serverModule = serverModule;
    this.uiModule = uiModule;
    this.graphicsModule = graphicsModule;
    this.profile = profile;
    this.worldSeed = worldSeed;
    this.portSeed = portSeed;
    this.revision = revision;
    this.explicitWorldAdapter = worldAdapter;

    // Avoid accessing native World getters (`tickingAreaManager`, `getDynamicProperty`)
    // during early execution before `world.afterEvents.worldLoad` fires.
    const isMockWorld =
      worldAdapter !== null ||
      serverModule?.world instanceof InMemoryWorldPropertyAdapter;

    const initialAdapter =
      worldAdapter ??
      (isMockWorld ? serverModule.world : new InMemoryWorldPropertyAdapter());

    let initialTickingAreaManager = null;
    if (isMockWorld && serverModule?.world?.tickingAreaManager) {
      initialTickingAreaManager = serverModule.world.tickingAreaManager;
    }

    this.store = new PersistenceStore({
      worldAdapter: initialAdapter,
      autoFlush: true
    });

    this.regionService = new RegionService({
      worldSeed: this.worldSeed,
      portSeed: this.portSeed,
      revision: this.revision
    });

    this.generationService = new GenerationService({
      regionService: this.regionService,
      store: this.store,
      tickingAreaManager: initialTickingAreaManager
    });

    this.stationsService = new StationsService({
      store: this.store
    });

    this.equipmentService = new EquipmentService({
      store: this.store
    });

    this.ecologyService = new EcologyService({
      store: this.store
    });

    this.transportService = new TransportService({
      store: this.store,
      regionService: this.regionService,
      stationsService: this.stationsService
    });

    this.presentationService = new PresentationService({
      store: this.store,
      regionService: this.regionService,
      profile: this.profile,
      graphicsApi: this.graphicsModule
    });

    this.compatibilityService = new CompatibilityService({
      regionService: this.regionService,
      store: this.store,
      emitScriptEvent: (id, message) => {
        if (this.serverModule?.system && typeof this.serverModule.system.sendScriptEvent === "function") {
          this.serverModule.system.sendScriptEvent(id, message);
        }
      }
    });

    this.registeredBlockComponents = new Map();
    this.registeredItemComponents = new Map();
    this.worldLoaded = false;
    this.startupRegistered = false;
    this._decoratedLiveChunks = new Set();
    this._welcomedPlayers = new Set();
    this._tickCounter = 0;
  }

  /**
   * Builds custom block component handlers for all 17 required BetterEnd block components
   * plus compiler aliases.
   */
  _createBlockComponentHandlers() {
    const handlers = new Map();

    const makeStationHandler = (stationKind) => ({
      onPlayerInteract: (event) => {
        if (!event?.block) return;
        const dim = event.dimension?.id ?? "minecraft:the_end";
        const loc = event.block.location ?? { x: 0, y: 64, z: 0 };
        this.stationsService.ensureStation?.({
          dimension: dim,
          anchor: loc,
          stationType: stationKind
        });
      },
      onPlayerBreak: (event) => {
        if (!event?.block) return;
        const dim = event.dimension?.id ?? "minecraft:the_end";
        const loc = event.block.location ?? { x: 0, y: 64, z: 0 };
        this.store.breakStation({ dimension: dim, anchor: loc, reason: "player_break" });
      }
    });

    handlers.set("betterend:smelter", makeStationHandler("end_stone_smelter"));
    handlers.set("betterend:anvil", makeStationHandler("anvil"));
    handlers.set("betterend:infusion_pedestal", makeStationHandler("infusion_pedestal"));
    handlers.set("betterend:eternal_pedestal", makeStationHandler("eternal_pedestal"));
    handlers.set("betterend:pedestal", makeStationHandler("pedestal"));
    handlers.set("betterend:station_interaction", makeStationHandler("station"));

    handlers.set("betterend:respawn_obelisk", {
      onPlayerInteract: (event) => {
        if (!event?.block || !event?.player) return;
        this.transportService.interactRespawnObelisk?.({
          playerId: event.player.id ?? "player",
          dimension: event.dimension?.id ?? "minecraft:the_end",
          anchor: event.block.location ?? { x: 0, y: 64, z: 0 }
        });
      }
    });

    handlers.set("betterend:silk_moth_nest", {
      onTick: (event) => {
        if (!event?.block) return;
        this.ecologyService.tickSilkMothNest?.({
          dimension: event.dimension?.id ?? "minecraft:the_end",
          position: event.block.location ?? { x: 0, y: 64, z: 0 }
        });
      },
      onPlayerInteract: (event) => {
        if (!event?.block || !event?.player) return;
        this.ecologyService.harvestSilkMothNest?.({
          playerId: event.player.id ?? "player",
          dimension: event.dimension?.id ?? "minecraft:the_end",
          position: event.block.location ?? { x: 0, y: 64, z: 0 }
        });
      }
    });

    handlers.set("betterend:chair", {
      onPlayerInteract: (event) => {
        if (!event?.block || !event?.player) return;
        this.ecologyService.sitOnChair({
          playerId: event.player.id ?? "player",
          blockId: event.block.typeId ?? "betterend:mossy_glowshroom_chair",
          dimension: event.dimension?.id ?? "minecraft:the_end",
          blockLocation: event.block.location ?? { x: 0, y: 64, z: 0 }
        });
      }
    });

    handlers.set("betterend:interactive_furniture", handlers.get("betterend:chair"));

    const makeEnvironmentalHandler = (family) => ({
      onTick: (event) => {
        if (!event?.block) return;
        this.ecologyService.tickEnvironmentalBlock?.({
          family,
          blockId: event.block.typeId,
          dimension: event.dimension?.id ?? "minecraft:the_end",
          position: event.block.location ?? { x: 0, y: 64, z: 0 }
        });
      },
      onStepOn: (event) => {
        if (!event?.block || !event?.entity) return;
        this.ecologyService.handleBlockStep?.({
          family,
          blockId: event.block.typeId,
          entityId: event.entity.id
        });
      }
    });

    handlers.set("betterend:bouncy", makeEnvironmentalHandler("bouncy"));
    handlers.set("betterend:hazard", makeEnvironmentalHandler("hazard"));
    handlers.set("betterend:sponge", makeEnvironmentalHandler("sponge"));
    handlers.set("betterend:hydrothermal_vent", makeEnvironmentalHandler("hydrothermal_vent"));
    handlers.set("betterend:brimstone", makeEnvironmentalHandler("brimstone"));
    handlers.set("betterend:emerald_ice", makeEnvironmentalHandler("emerald_ice"));
    handlers.set("betterend:umbrella_cluster", makeEnvironmentalHandler("umbrella_cluster"));
    handlers.set("betterend:ecology_tick", makeEnvironmentalHandler("ecology_tick"));

    handlers.set("betterend:flower_pot", {
      onPlayerInteract: (event) => {
        if (!event?.block || !event?.player) return;
        this.ecologyService.interactFlowerPot?.({
          playerId: event.player.id ?? "player",
          dimension: event.dimension?.id ?? "minecraft:the_end",
          position: event.block.location ?? { x: 0, y: 64, z: 0 }
        });
      }
    });

    handlers.set("betterend:partitioned_state", {
      onPlace: () => {},
      onPlayerBreak: () => {}
    });

    handlers.set("betterend:multiblock_guard", {
      onPlayerBreak: () => {}
    });

    return handlers;
  }

  /**
   * Builds custom item component handlers for all 5 required BetterEnd item components
   * plus compiler aliases.
   */
  _createItemComponentHandlers() {
    const handlers = new Map();

    const hammerHandler = {
      onMineBlock: (event) => {
        if (!event?.block || !event?.source) return;
        this.equipmentService.executeHammerMine?.({
          playerId: event.source.id ?? "player",
          itemId: event.itemStack?.typeId ?? "betterend:iron_hammer",
          origin: event.block.location ?? { x: 0, y: 64, z: 0 }
        });
      }
    };
    handlers.set("betterend:hammer", hammerHandler);
    handlers.set("betterend:hammer_mine", hammerHandler);

    handlers.set("betterend:elytra_carrier", {
      onUse: (event) => {
        if (!event?.source) return;
        this.equipmentService.equipCustomElytra?.({
          playerId: event.source.id ?? "player",
          itemId: event.itemStack?.typeId ?? "betterend:elytra_armored"
        });
      }
    });

    handlers.set("betterend:boat_spawner", {
      onUseOn: (event) => {
        if (!event?.source) return;
        this.ecologyService.placeBoatOrRaft({
          playerId: event.source.id ?? "player",
          itemId: event.itemStack?.typeId ?? "betterend:mossy_glowshroom_boat",
          dimension: event.source.dimension?.id ?? "minecraft:the_end",
          position: event.block?.location ?? { x: 0, y: 64, z: 0 }
        });
      }
    });

    handlers.set("betterend:bucket_spawner", {
      onUseOn: (event) => {
        if (!event?.source) return;
        this.ecologyService.releaseFishBucket?.({
          playerId: event.source.id ?? "player",
          itemId: event.itemStack?.typeId ?? "betterend:bucket_end_fish",
          dimension: event.source.dimension?.id ?? "minecraft:the_end",
          position: event.block?.location ?? { x: 0, y: 64, z: 0 }
        });
      }
    });

    handlers.set("betterend:guidebook", {
      onUse: (event) => {
        if (!event?.source) return;
        this.presentationService.openGuidebook?.(event.source.id ?? "player");
        this._openLiveGuidebookUi(event.source);
      }
    });

    handlers.set("betterend:spear_combat", {
      onHitEntity: () => {}
    });

    handlers.set("betterend:food_effects", {
      onConsume: () => {}
    });

    return handlers;
  }

  /**
   * Registers all custom block and item components into the provided registries
   * (`startupEvent.blockComponentRegistry` and `startupEvent.itemComponentRegistry`).
   */
  registerStartupComponents(startupEvent = {}) {
    const blockRegistry = startupEvent.blockComponentRegistry;
    const itemRegistry = startupEvent.itemComponentRegistry;

    const blockHandlers = this._createBlockComponentHandlers();
    for (const [id, handler] of blockHandlers.entries()) {
      this.registeredBlockComponents.set(id, handler);
      if (blockRegistry && typeof blockRegistry.registerCustomComponent === "function") {
        blockRegistry.registerCustomComponent(id, handler);
      }
    }

    const itemHandlers = this._createItemComponentHandlers();
    for (const [id, handler] of itemHandlers.entries()) {
      this.registeredItemComponents.set(id, handler);
      if (itemRegistry && typeof itemRegistry.registerCustomComponent === "function") {
        itemRegistry.registerCustomComponent(id, handler);
      }
    }

    this.startupRegistered = true;
    return {
      blockComponents: Array.from(this.registeredBlockComponents.keys()),
      itemComponents: Array.from(this.registeredItemComponents.keys())
    };
  }

  /**
   * Initializes world seed, binds dynamic properties & tickingAreaManager after `worldLoad`,
   * recovers interrupted station and generation transactions, and reconciles leaked
   * `betterend:prep_*` ticking areas.
   */
  async initializeWorld(worldInstance = null) {
    const world = worldInstance ?? this.serverModule?.world ?? null;

    if (world && !this.explicitWorldAdapter) {
      try {
        if (typeof world.getDynamicProperty === "function") {
          this.store.worldAdapter = world;
          this.store.world = world;
          this.store._loadIndicesFromWorld?.();
          this.generationService._hydrateJournalFromStore();
        }
      } catch {
        // Fallback to in-memory store if dynamic properties are restricted
      }

      try {
        if (world.tickingAreaManager) {
          this.generationService.tickingAreaManager = world.tickingAreaManager;
        }
      } catch {
        // Ignore if tickingAreaManager is unavailable
      }
    }

    try {
      if (world && world.seed !== undefined && world.seed !== null) {
        this.worldSeed = world.seed;
        this.regionService = new RegionService({
          worldSeed: this.worldSeed,
          portSeed: this.portSeed,
          revision: this.revision
        });
        this.generationService.regionService = this.regionService;
        this.transportService.regionService = this.regionService;
        this.presentationService.regionService = this.regionService;
        this.compatibilityService.regionService = this.regionService;
      }
    } catch {
      // Ignore if world.seed is not exposed
    }

    const quarantinedTransactions = this.store.recoverInterruptedTransactions();
    const recoveredCells = this.generationService.recoverInterruptedPreparations({
      resumeToCommitted: true
    });
    const removedTickingAreas = await this.generationService.reconcileLeakedTickingAreas();

    this.worldLoaded = true;
    return {
      worldLoaded: true,
      profile: this.profile,
      worldSeed: String(this.worldSeed),
      quarantinedTransactionCount: quarantinedTransactions.length,
      recoveredCellCount: recoveredCells.length,
      removedTickingAreaCount: removedTickingAreas.length
    };
  }

  // ============================================================================
  // LIVE WORLD BIOME DECORATION & GUIDEBOOK TELEPORTER
  // ============================================================================

  /**
   * Computes the native C++ feature_rules biome region for outer-End `(x, z)`
   * using the exact 256x256 cell formula in `biome_<id>_surface_rule.json`.
   */
  _lookupNativeCellRegion(x, z) {
    const cellX = Math.floor(x / 256);
    const cellZ = Math.floor(z / 256);
    const idx = Math.abs(cellX * 73 + cellZ * 199) % REGION_CATALOGUE.length;
    return REGION_CATALOGUE[idx] ?? REGION_CATALOGUE[0];
  }

  /**
   * Finds a deterministic outer-End coordinate (`|x| > 1024 || |z| > 1024`) belonging
   * to `targetRegionId`.
   */
  _findRegionCoordinate(targetRegionId) {
    for (let radiusCells = 5; radiusCells <= 24; radiusCells++) {
      for (let cx = -radiusCells; cx <= radiusCells; cx++) {
        for (let cz = -radiusCells; cz <= radiusCells; cz++) {
          if (Math.abs(cx) !== radiusCells && Math.abs(cz) !== radiusCells) continue;
          const x = cx * 256 + 128;
          const z = cz * 256 + 128;
          if (Math.abs(x) <= 1080 && Math.abs(z) <= 1080) continue;
          const region = this._lookupNativeCellRegion(x, z);
          if (region.id === targetRegionId) {
            return { x, y: 68, z };
          }
        }
      }
    }
    return { x: 1408, y: 68, z: 1408 };
  }

  /**
   * Chooses the top and under surface block for a region at `(x, z)`.
   */
  _chooseSurfaceBlocks(region, x, z) {
    const surface = region?.surface ?? {};
    let topBlock = surface.topBlock ?? "betterend:end_moss";
    if (topBlock === "minecraft:end_stone" && region?.layer === "aerial") {
      topBlock = "betterend:end_moss";
    }
    const underBlock = surface.underBlock ?? "minecraft:end_stone";
    const seed = MHelper.getSeed3D(this.regionService.effectiveSeed, x, z, 1);
    const rng = new JavaRandom(seed);
    if (surface.altTopBlock && rng.nextInt(4) === 0) {
      topBlock = surface.altTopBlock;
    } else if (Array.isArray(surface.rules)) {
      for (const rule of surface.rules) {
        if (rng.nextDouble() < (rule.chance ?? 0.35)) {
          topBlock = rule.topBlock ?? topBlock;
          break;
        }
      }
    }
    return { topBlock, underBlock, rng };
  }

  /**
   * Ensures a safe landing on a Guidebook teleport to `(cx, cy, cz)`:
   * - If a natural End island already exists at `(cx, cz)` (decorated natively by C++
   *   `feature_rules`), leaves the natural terrain untouched and teleports the player
   *   onto its surface.
   * - Only if `(cx, cz)` is over open void (`topY < 40`) does it construct a seamless
   *   21x21 BetterEnd biome island so the player never falls into the void.
   */
  _generateBiomeIslandAt(dimension, cx, cy, cz, regionId, player = null) {
    if (!dimension || typeof dimension.getBlock !== "function") return;
    try {
      if (typeof dimension.getTopmostBlock === "function") {
        const existingTop = dimension.getTopmostBlock({ x: Math.trunc(cx), z: Math.trunc(cz) }, 120);
        if (existingTop && existingTop.location.y >= 40) {
          if (player && typeof player.teleport === "function") {
            player.teleport(
              { x: Math.trunc(cx) + 0.5, y: existingTop.location.y + 2, z: Math.trunc(cz) + 0.5 },
              { dimension }
            );
          }
          return;
        }
      }
    } catch {}

    const region = REGIONS_BY_ID.get(regionId) ?? REGION_CATALOGUE[0];
    const radius = 10;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const distSq = dx * dx + dz * dz;
        if (distSq > radius * radius) continue;
        const x = Math.trunc(cx + dx);
        const z = Math.trunc(cz + dz);
        const { topBlock, underBlock, rng } = this._chooseSurfaceBlocks(region, x, z);
        const thickness = Math.max(2, Math.round((1 - distSq / (radius * radius)) * 5));

        try {
          for (let dy = -thickness; dy <= -1; dy++) {
            const blk = dimension.getBlock({ x, y: cy + dy, z });
            if (blk) {
              blk.setType(dy === -1 ? underBlock : "minecraft:end_stone");
            }
          }
          const topBlk = dimension.getBlock({ x, y: cy, z });
          if (topBlk) {
            topBlk.setType(topBlock);
          }
          // Clear 4 blocks of headroom at the center landing pad
          if (distSq <= 4) {
            for (let ay = 1; ay <= 4; ay++) {
              const airBlk = dimension.getBlock({ x, y: cy + ay, z });
              if (airBlk && airBlk.typeId !== "minecraft:air") {
                airBlk.setType("minecraft:air");
              }
            }
          } else if (distSq >= 9 && distSq <= (radius - 2) * (radius - 2) && rng.nextInt(7) === 0) {
            const customFeatures = [...(region.structures ?? []), ...(region.features ?? [])].filter(
              (f) =>
                ![
                  "crashed_ship",
                  "tunel_cave",
                  "cave_surface_coat",
                  "ender_ore",
                  "amber_ore",
                  "thallasium_ore",
                  "flavolite_layer",
                  "violecite_layer",
                  "silk_moth_nest",
                  "hydralux"
                ].includes(f)
            );
            if (customFeatures.length > 0) {
              const featId = customFeatures[rng.nextInt(customFeatures.length)];
              const placements = synthesizeAnchorPlacements(
                {
                  anchorId: `island:${x},${cy + 1},${z}`,
                  featureId: featId,
                  position: { x, y: cy + 1, z }
                },
                this.regionService.effectiveSeed
              );
              for (const p of placements) {
                const target = dimension.getBlock({ x: p.x, y: p.y, z: p.z });
                if (target && target.typeId === "minecraft:air") {
                  target.setType(p.blockId);
                }
              }
            }
          }
        } catch {
          // Ignore if chunk still loading
        }
      }
    }
  }

  /**
   * Lightweight landmark-only decorator for natural End chunks:
   * - Never touches ground surface blocks (C++ surface_pass handles 100% of ground 3 layers deep).
   * - Clears stray vanilla Chorus stems in non-chorus biomes.
   * - Places 1 authentic multi-block BetterEnd landmark/structure per chunk (`structures`, `trees`, `bushes`, `terrain_features`).
   */
  _decorateChunkLandmarks(dimension, chunkX, chunkZ) {
    if (!dimension || typeof dimension.getTopmostBlock !== "function") return;
    const baseX = chunkX * 16;
    const baseZ = chunkZ * 16;
    const centerX = baseX + 8;
    const centerZ = baseZ + 8;
    if (Math.abs(centerX) <= 1024 && Math.abs(centerZ) <= 1024) return;

    const region = this._lookupNativeCellRegion(centerX, centerZ);
    if (!region) return;

    // 1. Clear stray vanilla Chorus plants in non-chorus biomes
    if (region.id !== "chorus_forest") {
      for (let sx = 2; sx < 16; sx += 4) {
        for (let sz = 2; sz < 16; sz += 4) {
          try {
            const top = dimension.getTopmostBlock({ x: baseX + sx, z: baseZ + sz }, 120);
            if (top && (top.typeId === "minecraft:chorus_flower" || top.typeId === "minecraft:chorus_plant")) {
              const topY = top.location.y;
              for (let dy = 0; dy >= -18; dy--) {
                const b = dimension.getBlock({ x: baseX + sx, y: topY + dy, z: baseZ + sz });
                if (!b || (b.typeId !== "minecraft:chorus_plant" && b.typeId !== "minecraft:chorus_flower")) break;
                b.setType("minecraft:air");
              }
            }
          } catch {}
        }
      }
    }

    // 2. Place 1 multi-block BetterEnd landmark / structure in the chunk if solid ground exists
    const landmarkPool = [...(region.structures ?? []), ...(region.features ?? [])].filter((fId) => {
      if (
        [
          "crashed_ship",
          "tunel_cave",
          "cave_surface_coat",
          "ender_ore",
          "amber_ore",
          "thallasium_ore",
          "flavolite_layer",
          "violecite_layer",
          "silk_moth_nest",
          "hydralux",
          "end_lake",
          "end_lake_rare",
          "megalake"
        ].includes(fId)
      ) {
        return false;
      }
      const desc = FEATURES_BY_ID.get(fId);
      return (
        desc &&
        (desc.category === "structures" ||
          desc.category === "trees" ||
          desc.category === "bushes" ||
          desc.category === "terrain_features")
      );
    });
    if (landmarkPool.length === 0) return;

    const seed = MHelper.getSeed3D(this.regionService.effectiveSeed, chunkX, chunkZ, 77);
    const rng = new JavaRandom(seed);
    if (rng.nextInt(2) !== 0) return;

    const ax = baseX + 4 + rng.nextInt(8);
    const az = baseZ + 4 + rng.nextInt(8);
    try {
      const topBlk = dimension.getTopmostBlock({ x: ax, z: az }, 120);
      if (!topBlk || topBlk.location.y < 42) return;
      const topY = topBlk.location.y;
      const featId = landmarkPool[rng.nextInt(landmarkPool.length)];
      const placements = synthesizeAnchorPlacements(
        {
          anchorId: `chunk:${chunkX},${chunkZ}:${featId}`,
          featureId: featId,
          position: { x: ax, y: topY + 1, z: az }
        },
        this.regionService.effectiveSeed
      );
      for (const p of placements) {
        if (p.role === "structure_base") continue;
        const target = dimension.getBlock({ x: p.x, y: p.y, z: p.z });
        if (
          target &&
          (target.typeId === "minecraft:air" ||
            target.typeId === "minecraft:chorus_plant" ||
            target.typeId === "minecraft:chorus_flower")
        ) {
          target.setType(p.blockId);
        }
      }
    } catch {}
  }

  // ============================================================================
  // INTERACTIVE UIs (`@minecraft/server-ui` 2.1.0)
  // ============================================================================

  _openLiveGuidebookUi(player) {
    const ActionFormData = this.uiModule?.ActionFormData;
    if (!ActionFormData || !player) return;

    const loc = player.location ?? { x: 0, y: 68, z: 0 };
    const dimId = player.dimension?.id ?? "minecraft:the_end";
    const lookup = this.regionService.lookup(dimId, loc.x, loc.y, loc.z);
    const prog = this.presentationService.getPlayerProgression(player.id ?? "player");

    const currentRegionLabel = lookup.protectedCenter
      ? "Central End Dragon Island (Protected Radius <= 1024)"
      : `${formatTitle(lookup.effectiveRegion?.id ?? "the_end")} (${lookup.effectiveRegion?.layer ?? "surface"})`;

    const form = new ActionFormData()
      .title("BetterEnd 26.40 — Guidebook")
      .body(
        `§dCurrent Position: §f(${Math.round(loc.x)}, ${Math.round(loc.y)}, ${Math.round(loc.z)})\n` +
        `§dCurrent Region: §b${currentRegionLabel}\n` +
        `§dSurface / Cave / Aerial: §f${formatTitle(lookup.surfaceRegion?.id)} / ${formatTitle(lookup.caveRegion?.id ?? "none")} / ${formatTitle(lookup.aerialRegion?.id ?? "none")}\n` +
        `§dDiscovered Biomes: §a${prog.discoveredRegionsCount}/27 §7| §dAdvancements: §a${prog.unlockedCount}/${prog.totalAdvancements}\n\n` +
        `§7Select any of the 27 BetterEnd regions below to teleport directly to that outer-End biome and generate its terrain:`
      );

    for (const region of REGION_CATALOGUE) {
      form.button(`${formatTitle(region.id)} [${region.layer}]`);
    }

    form.show(player).then((response) => {
      if (!response || response.canceled || response.selection === undefined) return;
      const chosen = REGION_CATALOGUE[response.selection];
      if (!chosen) return;

      const target = this._findRegionCoordinate(chosen.id);
      const endDim =
        this.serverModule?.world?.getDimension?.("minecraft:the_end") ?? player.dimension;

      try {
        player.teleport(
          { x: target.x + 0.5, y: target.y + 2, z: target.z + 0.5 },
          { dimension: endDim }
        );
      } catch {
        try {
          player.runCommand?.(`tp @s ${target.x} ${target.y + 2} ${target.z}`);
        } catch {}
      }

      // Ensure safe landing after a short tick delay once the destination chunk is loaded
      const runGenerate = () => {
        this._generateBiomeIslandAt(endDim, target.x, target.y, target.z, chosen.id, player);
        this.generationService.enqueuePlayerApproach(
          player.id ?? "player",
          "minecraft:the_end",
          target,
          { radiusCells: 1 }
        );
        this.generationService.stepPreparationQueue({ maxCells: 2 });
        const pres = this.presentationService.updatePlayerPresentation({
          playerId: player.id ?? "player",
          dimension: "minecraft:the_end",
          regionId: chosen.id,
          immediate: true,
          playerHandle: player
        });
        this._applyLivePlayerPresentation(player, pres);
        try {
          player.onScreenDisplay?.setActionBar?.(
            `§dBetterEnd §8| §b${formatTitle(chosen.id)} §7(${chosen.layer}) — §aTop: ${formatTitle(chosen.surface?.topBlock)}`
          );
        } catch {}
      };

      if (this.serverModule?.system?.runTimeout) {
        this.serverModule.system.runTimeout(runGenerate, 8);
      } else {
        runGenerate();
      }
    }).catch(() => {});
  }

  _openSmelterUi(player, block) {
    const ActionFormData = this.uiModule?.ActionFormData;
    if (!ActionFormData || !player) return;

    const allRecipes = [
      ...DEFAULT_ALLOYING_RECIPES.map((r) => ({
        label: `Alloy: ${formatTitle(r.result.item)} x${r.result.count} (${r.ingredients.map(formatTitle).join(" + ")})`,
        resultItem: r.result.item,
        resultCount: r.result.count
      })),
      ...DEFAULT_SINGLE_INPUT_SMELTER_RECIPES.map((r) => ({
        label: `Smelt: ${formatTitle(r.result.item)} x${r.result.count} (${formatTitle(r.ingredient)})`,
        resultItem: r.result.item,
        resultCount: r.result.count
      }))
    ];

    const form = new ActionFormData()
      .title("End Stone Smelter")
      .body("§7Select an alloying or smelting recipe to execute at this End Stone Smelter:");

    for (const r of allRecipes) {
      form.button(r.label);
    }

    form.show(player).then((res) => {
      if (!res || res.canceled || res.selection === undefined) return;
      const chosen = allRecipes[res.selection];
      if (!chosen) return;
      try {
        player.runCommand?.(`give @s ${chosen.resultItem} ${chosen.resultCount}`);
        player.playSound?.("random.fizz");
        player.onScreenDisplay?.setActionBar?.(
          `§a[End Stone Smelter] Smelted ${chosen.resultCount}x ${formatTitle(chosen.resultItem)}!`
        );
      } catch {}
    }).catch(() => {});
  }

  _openAnvilUi(player, block) {
    const ActionFormData = this.uiModule?.ActionFormData;
    if (!ActionFormData || !player) return;

    const blockId = block?.typeId ?? "betterend:thallasium_anvil";
    const anvilTier = blockId.includes("aeternium")
      ? 5
      : blockId.includes("terminite")
        ? 2
        : 1;

    const available = DEFAULT_SMITHING_RECIPES.filter((r) => r.anvilLevel <= anvilTier);
    const form = new ActionFormData()
      .title(`${formatTitle(blockId)} (Tier ${anvilTier})`)
      .body(`§7Available BetterEnd Anvil Smithing Recipes (Anvil Level <= ${anvilTier}):`);

    for (const r of available) {
      form.button(
        `${formatTitle(r.result.item)} x${r.result.count} (${r.inputCount}x ${formatTitle(r.input)})`
      );
    }

    form.show(player).then((res) => {
      if (!res || res.canceled || res.selection === undefined) return;
      const chosen = available[res.selection];
      if (!chosen) return;
      try {
        player.runCommand?.(`give @s ${chosen.result.item} ${chosen.result.count}`);
        player.playSound?.("random.anvil_use");
        player.onScreenDisplay?.setActionBar?.(
          `§a[Anvil Smithing] Forged ${chosen.result.count}x ${formatTitle(chosen.result.item)}!`
        );
      } catch {}
    }).catch(() => {});
  }

  _openInfusionPedestalUi(player, block) {
    const ActionFormData = this.uiModule?.ActionFormData;
    if (!ActionFormData || !player) return;

    const coreInfusions = DEFAULT_INFUSION_RECIPES.slice(0, 12);
    const form = new ActionFormData()
      .title("Infusion Pedestal Ritual")
      .body("§d8-Pedestal Infusion Ritual\n§7Select an Infusion Ritual recipe to channel:");

    for (const r of coreInfusions) {
      form.button(
        `${formatTitle(r.id)} -> ${formatTitle(r.result.item)} (Input: ${formatTitle(r.input)})`
      );
    }

    form.show(player).then((res) => {
      if (!res || res.canceled || res.selection === undefined) return;
      const chosen = coreInfusions[res.selection];
      if (!chosen) return;
      try {
        player.runCommand?.(`give @s ${chosen.result.item} ${chosen.result.count}`);
        player.playSound?.("block.end_portal.spawn");
        player.onScreenDisplay?.setActionBar?.(
          `§d[Infusion Ritual] Infused ${chosen.result.count}x ${formatTitle(chosen.result.item)}!`
        );
      } catch {}
    }).catch(() => {});
  }

  _applyLivePlayerPresentation(player, presResult) {
    if (!player || !presResult) return;
    try {
      if (presResult.transitioned && Array.isArray(presResult.fogStack)) {
        try {
          player.runCommand?.(`fog @s remove "betterend_active_fog"`);
        } catch {}
        const topFog = presResult.fogStack[presResult.fogStack.length - 1];
        if (topFog?.fogDefinitionId) {
          try {
            player.runCommand?.(`fog @s push "${topFog.fogDefinitionId}" "betterend_active_fog"`);
          } catch {}
        }
        if (presResult.ambientSoundId) {
          try {
            player.playSound?.(presResult.ambientSoundId);
          } catch {}
        }
      }
    } catch {}
  }

  _handleLiveBlockInteract(event) {
    const block = event?.block;
    const player = event?.player;
    if (!block || !player) return;

    const blockId = String(block.typeId ?? "");
    if (!blockId.startsWith("betterend:")) return;
    const shortName = blockId.slice("betterend:".length).replace(/__p\d+$/, "");
    const dimId = block.dimension?.id ?? player.dimension?.id ?? "minecraft:the_end";
    const loc = block.location ?? { x: 0, y: 64, z: 0 };

    if (shortName === "end_stone_smelter") {
      this.stationsService.ensureStation?.({
        dimension: dimId,
        anchor: loc,
        stationType: "end_stone_smelter"
      });
      this._openSmelterUi(player, block);
    } else if (shortName.endsWith("_anvil")) {
      this.stationsService.ensureStation?.({
        dimension: dimId,
        anchor: loc,
        stationType: "anvil"
      });
      this._openAnvilUi(player, block);
    } else if (shortName === "infusion_pedestal") {
      this.stationsService.ensureStation?.({
        dimension: dimId,
        anchor: loc,
        stationType: "infusion_pedestal"
      });
      this._openInfusionPedestalUi(player, block);
    } else if (shortName === "eternal_pedestal" || shortName.endsWith("_pedestal")) {
      this.stationsService.ensureStation?.({
        dimension: dimId,
        anchor: loc,
        stationType: "pedestal"
      });
      try {
        player.onScreenDisplay?.setActionBar?.(
          `§d[${formatTitle(shortName)}] §fPedestal active at (${loc.x}, ${loc.y}, ${loc.z})`
        );
      } catch {}
    } else if (shortName === "respawn_obelisk") {
      this.transportService.placeRespawnObelisk({ dimension: dimId, bottomAnchor: loc });
      this.transportService.activateRespawnObelisk?.({
        playerId: player.id ?? "player",
        dimension: dimId,
        pos: loc,
        amberGemCount: 6
      });
      try {
        player.setSpawnPoint?.({
          dimension: block.dimension ?? player.dimension,
          x: loc.x + 1,
          y: loc.y,
          z: loc.z
        });
        player.playSound?.("respawn_anchor.set_spawn");
        player.onScreenDisplay?.setActionBar?.(
          `§d[Respawn Obelisk] §aEnd Respawn Anchor bound to (${loc.x}, ${loc.y}, ${loc.z})!`
        );
      } catch {}
    } else if (shortName === "silk_moth_nest" || shortName === "silk_moth_hive") {
      this.ecologyService.harvestSilkMothNest?.({
        playerId: player.id ?? "player",
        dimension: dimId,
        position: loc
      });
      try {
        player.runCommand?.("give @s betterend:silk_fiber 2");
        player.playSound?.("block.beehive.shear");
        player.onScreenDisplay?.setActionBar?.("§aHarvested 2x Silk Fiber from Silk Moth Nest!");
      } catch {}
    } else if (
      shortName.endsWith("_chair") ||
      shortName.endsWith("_bar_stool") ||
      shortName.endsWith("_taburet")
    ) {
      this.ecologyService.sitOnChair({
        playerId: player.id ?? "player",
        blockId,
        dimension: dimId,
        blockLocation: loc
      });
      try {
        const seatEntity = block.dimension?.spawnEntity?.("bclib:chair", {
          x: loc.x + 0.5,
          y: loc.y + 0.1,
          z: loc.z + 0.5
        });
        const rideable = seatEntity?.getComponent?.("minecraft:rideable");
        rideable?.addRider?.(player);
      } catch {}
    }
  }

  _handleLiveBlockBreak(event) {
    const player = event?.player;
    const block = event?.block;
    const itemStack = event?.itemStackBeforeBreak ?? event?.itemStack;
    if (!player || !block) return;

    const itemId = String(itemStack?.typeId ?? "");
    const loc = block.location;
    const dim = block.dimension ?? player.dimension;

    if (itemId.startsWith("betterend:") && itemId.endsWith("_hammer") && loc && dim) {
      const look =
        typeof player.getViewDirection === "function"
          ? player.getViewDirection()
          : { x: 0, y: 0, z: 1 };
      this.equipmentService.mineWithHammer({
        hammer: { id: itemId },
        origin: loc,
        lookVector: look,
        isSneaking: Boolean(player.isSneaking),
        getBlock: (pos) => {
          try {
            const b = dim.getBlock(pos);
            return b ? { typeId: b.typeId, hardness: 1.5, requiredToolLevel: 0, mineable: true } : null;
          } catch {
            return null;
          }
        },
        breakBlock: (pos, blk) => {
          if (pos.x === loc.x && pos.y === loc.y && pos.z === loc.z) return;
          if (!blk || blk.typeId === "minecraft:bedrock" || blk.typeId === "minecraft:end_portal_frame") return;
          try {
            dim.runCommand?.(`setblock ${pos.x} ${pos.y} ${pos.z} air destroy`);
          } catch {}
        }
      });
    }
  }

  _stepLiveWorldTick() {
    this._tickCounter += 1;
    this.generationService.stepPreparationQueue({ maxCells: 1 });

    const world = this.serverModule?.world;
    if (!world || typeof world.getAllPlayers !== "function") return;

    let players = [];
    try {
      players = world.getAllPlayers();
    } catch {
      return;
    }

    for (const player of players) {
      if (!player || !player.location) continue;
      const pid = player.id ?? player.name ?? "player";
      const dim = player.dimension;
      const dimId = dim?.id ?? "minecraft:overworld";
      const loc = player.location;

      // Welcome player with BetterEnd Guidebook once per session
      if (!this._welcomedPlayers.has(pid)) {
        this._welcomedPlayers.add(pid);
        try {
          player.runCommand?.("give @s betterend:guidebook 1");
        } catch {}
      }

      // Check bouncy blocks & hydrothermal vents under player
      try {
        const below = dim?.getBlock?.({
          x: Math.floor(loc.x),
          y: Math.floor(loc.y) - 1,
          z: Math.floor(loc.z)
        });
        const belowId = String(below?.typeId ?? "");
        if (
          belowId.includes("mossy_glowshroom_hymenophore") ||
          belowId.includes("umbrella_tree_membrane") ||
          belowId.includes("gelatine_block")
        ) {
          player.applyKnockback?.(0, 0, 0, 0.9);
        } else if (belowId.includes("hydrothermal_vent") && player.isGliding) {
          player.applyKnockback?.(0, 0, 0, 1.2);
        }
      } catch {}

      if (dimId === "minecraft:the_end") {
        const lookup = this.regionService.lookup("minecraft:the_end", loc.x, loc.y, loc.z);
        if (lookup.protectedCenter) {
          if (this._tickCounter % 5 === 0) {
            try {
              player.onScreenDisplay?.setActionBar?.(
                "§dBetterEnd §8| §eCentral Dragon Island (Protected <=1024m) §7— Use §bGuidebook §7to visit 27 Outer Biomes!"
              );
            } catch {}
          }
        } else {
          const nativeRegion = this._lookupNativeCellRegion(loc.x, loc.z);
          const regionId = nativeRegion?.id ?? lookup.effectiveRegion?.id ?? "foggy_mushroomland";
          const pres = this.presentationService.updatePlayerPresentation({
            playerId: pid,
            dimension: "minecraft:the_end",
            regionId,
            ticks: 10,
            currentTick: this._tickCounter * 10,
            playerHandle: player
          });
          this._applyLivePlayerPresentation(player, pres);

          if (this._tickCounter % 4 === 0) {
            try {
              player.onScreenDisplay?.setActionBar?.(
                `§dBetterEnd §8| §b${formatTitle(regionId)} §7(${nativeRegion?.layer ?? "surface"})`
              );
            } catch {}
          }

          this.generationService.enqueuePlayerApproach(pid, "minecraft:the_end", loc, {
            radiusCells: 1
          });

          // Decorate 1 nearby chunk per tick with multi-block BetterEnd landmarks & clear stray Chorus stems
          const pChunkX = Math.floor(loc.x / 16);
          const pChunkZ = Math.floor(loc.z / 16);
          for (let r = 0; r <= 3; r++) {
            let decoratedOne = false;
            for (let dcx = -r; dcx <= r && !decoratedOne; dcx++) {
              for (let dcz = -r; dcz <= r && !decoratedOne; dcz++) {
                const cx = pChunkX + dcx;
                const cz = pChunkZ + dcz;
                const key = `${cx},${cz}`;
                if (!this._decoratedLiveChunks.has(key)) {
                  this._decoratedLiveChunks.add(key);
                  this._decorateChunkLandmarks(dim, cx, cz);
                  decoratedOne = true;
                }
              }
            }
            if (decoratedOne) break;
          }
        }
      }
    }
  }

  /**
   * Attaches event listeners to `@minecraft/server` (`system.beforeEvents.startup`,
   * `world.afterEvents.worldLoad`, `system.afterEvents.scriptEventReceive`, live gameplay
   * events, and bounded intervals).
   */
  attachServerEvents() {
    const system = this.serverModule?.system;
    const world = this.serverModule?.world;

    if (system?.beforeEvents?.startup?.subscribe) {
      system.beforeEvents.startup.subscribe((event) => {
        this.registerStartupComponents(event);
      });
    } else {
      this.registerStartupComponents({});
    }

    if (world?.afterEvents?.worldLoad?.subscribe) {
      world.afterEvents.worldLoad.subscribe((event) => {
        void this.initializeWorld(event?.world ?? world);
      });
    }

    if (world?.afterEvents?.playerInteractWithBlock?.subscribe) {
      world.afterEvents.playerInteractWithBlock.subscribe((event) => {
        this._handleLiveBlockInteract(event);
      });
    }

    if (world?.afterEvents?.playerBreakBlock?.subscribe) {
      world.afterEvents.playerBreakBlock.subscribe((event) => {
        this._handleLiveBlockBreak(event);
      });
    }

    if (world?.afterEvents?.itemUse?.subscribe) {
      world.afterEvents.itemUse.subscribe((event) => {
        const itemId = String(event?.itemStack?.typeId ?? "");
        const player = event?.source;
        if (!player) return;
        if (itemId === "betterend:guidebook") {
          this.presentationService.openGuidebook?.(player.id ?? "player");
          this._openLiveGuidebookUi(player);
        } else if (itemId === "betterend:elytra_armored" || itemId === "betterend:elytra_crystalite") {
          this.equipmentService.equipCustomElytra?.({
            playerId: player.id ?? "player",
            itemId
          });
          if (player.isGliding) {
            try {
              const dir = player.getViewDirection?.() ?? { x: 0, y: 0.3, z: 1 };
              player.applyKnockback?.(dir.x, dir.z, 1.4, 0.45);
            } catch {}
          }
        }
      });
    }

    if (world?.afterEvents?.itemUseOn?.subscribe) {
      world.afterEvents.itemUseOn.subscribe((event) => {
        const itemId = String(event?.itemStack?.typeId ?? "");
        const player = event?.source;
        const block = event?.block;
        if (!player || !block) return;
        const loc = block.location ?? { x: 0, y: 64, z: 0 };
        const dim = player.dimension;
        if (itemId === "betterend:bucket_end_fish" || itemId === "betterend:bucket_cubozoa") {
          const entityId =
            itemId === "betterend:bucket_cubozoa" ? "betterend:cubozoa" : "betterend:end_fish";
          this.ecologyService.releaseFishBucket?.({
            playerId: player.id ?? "player",
            itemId,
            dimension: dim?.id ?? "minecraft:the_end",
            position: loc
          });
          try {
            dim?.spawnEntity?.(entityId, { x: loc.x + 0.5, y: loc.y + 1, z: loc.z + 0.5 });
          } catch {}
        }
      });
    }

    if (system?.afterEvents?.scriptEventReceive?.subscribe) {
      system.afterEvents.scriptEventReceive.subscribe((event) => {
        if (event?.id === QUERY_CHANNEL_ID) {
          this.compatibilityService.handleScriptEvent(event.id, event.message);
        }
      });
    }

    if (system && typeof system.runInterval === "function") {
      system.runInterval(() => {
        this._stepLiveWorldTick();
      }, 10);
    }

    return this;
  }
}

export function createBetterEndRuntime(options = {}) {
  const runtime = new BetterEndRuntime(options);
  runtime.attachServerEvents();
  return runtime;
}

export default createBetterEndRuntime;
