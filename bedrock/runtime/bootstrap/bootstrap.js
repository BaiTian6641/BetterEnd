/**
 * BetterEnd Bedrock 26.40 — Runtime Bootstrap & Event Wiring (`bootstrap.js`).
 *
 * Pure ES module with zero Node.js imports and zero static experimental graphics
 * imports. Shared by both the Stable (`main-stable.js`) and Experimental Vibrant Visuals
 * (`main-experimental-vv.js`) entrypoints.
 */

import { InMemoryWorldPropertyAdapter, PersistenceStore } from "../persistence/store.js";
import { RegionService } from "../regions/region-service.js";
import {
  isNativeProtectedColumn,
  nativeAerialRegionIndex,
  nativeCaveRegionIndex,
  nativeSurfaceRegionIndex
} from "../regions/native-cell-map.js";
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
import {
  ELYTRA_MOVEMENT_FACTORS,
  ElytraGlideController,
  fireworkBoostTicks,
  updateGlideState
} from "../equipment/elytra-physics.js";
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

/**
 * Surface blocks that mean "something was already built/grown here" (natively generated trees,
 * mushrooms, structure blocks). Script decorators refuse to carve or place through them.
 */
const POND_OBSTRUCTION_PATTERN =
  /^(betterend|minecraft):.*(log|leaves|planks|bark|_cap|hymenophore|stem|brick|slab|stairs|fence|wall|door|polished|chest|lantern|obsidian|chorus_plant|chorus_flower)/;

/** Decoration queue tuning: per-run time budget, look-ahead and retry limits. */
const DECORATION_BUDGET_MS = 4;
/** Java BCLib `BaseVineBlock` family: extends only via bone meal, up to `maxGrowLength` segments. */
const PLAIN_BONEMEAL_VINES = new Set([
  "dense_vine",
  "twisted_vine",
  "jungle_vine",
  "filalux",
  "rubinea",
  "magnula",
  "tenanea_flowers"
]);
const VINE_MAX_GROW_LENGTH = 32;
/** Java `NeonCactusPlantBlock.MAX_LENGTH`. */
const NEON_CACTUS_MAX_LENGTH = 12;
const DECORATION_MAX_PER_RUN = 6;
const DECORATION_SCAN_RADIUS = 7;
const DECORATION_LOOKAHEAD_RADIUS = 3;
const DECORATION_MAX_PROBES_PER_RUN = 24;
const DECORATION_LOOKAHEAD_CHUNKS = 5;
const DECORATION_MAX_RETRIES = 40;
const DECORATION_MEMORY_LIMIT = 6000;

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
    this._decorationQueue = new Map();
    this._decorationScanKeys = new Map();
    this._pumpTick = 0;
    this._welcomedPlayers = new Set();
    this._playerElytraVariant = new Map();
    this._playerAirTicks = new Map();
    this._playerGlidingState = new Map();
    this._playerGlideSpeed = new Map();
    this._playerGlideState = new Map();
    this._playerLastPos = new Map();
    this._playerGlideVel = new Map();
    this._playerGlideCtl = new Map();
    this._playerGlideTicks = new Map();
    this._playerFireworkTicks = new Map();
    this._fastTick = 0;
    this._tickCounter = 0;
  }

  /**
   * Builds custom block component handlers for all 17 required BetterEnd block components
   * plus compiler aliases.
   */
  _createBlockComponentHandlers() {
    const handlers = new Map();

    const makeStationHandler = (stationKind) => ({
      beforeOnPlayerPlace: (event) => this._handleBeforePlayerPlace(event),
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
      beforeOnPlayerPlace: (event) => this._handleBeforePlayerPlace(event),
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
      beforeOnPlayerPlace: (event) => this._handleBeforePlayerPlace(event),
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
      beforeOnPlayerPlace: (event) => this._handleBeforePlayerPlace(event),
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
      beforeOnPlayerPlace: (event) => this._handleBeforePlayerPlace(event),
      ...(family === "hydrothermal_vent"
        ? {
            onTick: (event) => {
              if (!event?.block) return;
              const dim = event.dimension ?? event.block.dimension;
              const loc = event.block.location ?? { x: 0, y: 64, z: 0 };
              this.ecologyService.tickEnvironmentalBlock?.({
                family,
                blockId: event.block.typeId,
                dimension: dim?.id ?? "minecraft:the_end",
                position: loc
              });
            }
          }
        : {}),
      ...(family === "ecology_tick"
        ? {
            onRandomTick: (event) => {
              if (!event?.block) return;
              const dim = event.dimension ?? event.block.dimension;
              const loc = event.block.location ?? { x: 0, y: 64, z: 0 };
              if (dim && Math.random() < 0.25) {
                this._growBetterEndPlantAt(dim, loc, event.block.typeId, { isBoneMeal: false });
              }
            }
          }
        : {}),
      ...(family === "bouncy" || family === "hazard"
        ? {
            onStepOn: (event) => {
              if (!event?.block || !event?.entity) return;
              this.ecologyService.handleBlockStep?.({
                family,
                blockId: event.block.typeId,
                entityId: event.entity.id
              });
            }
          }
        : {})
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
      beforeOnPlayerPlace: (event) => this._handleBeforePlayerPlace(event),
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
      beforeOnPlayerPlace: (event) => this._handleBeforePlayerPlace(event),
      onPlace: () => {},
      onPlayerBreak: () => {}
    });

    handlers.set("betterend:multiblock_guard", {
      beforeOnPlayerPlace: (event) => this._handleBeforePlayerPlace(event),
      onPlayerBreak: () => {}
    });

    return handlers;
  }

  /**
   * Enforces Java ceiling/wall/floor placement constraints and orients directional
   * BetterEnd blocks on player placement (`axis`, `facing`, `half`, `type`, `is_floor`, `rotation`).
   */
  _handleBeforePlayerPlace(event) {
    const perm = event?.permutationToPlace;
    const blockId = String(perm?.type?.id ?? event?.block?.typeId ?? "");
    const shortName = blockId.replace(/^betterend:/, "").replace(/__p\d+$/, "");
    const face = String(event?.face ?? "Up").toLowerCase();
    const isHorizFace = face === "north" || face === "south" || face === "east" || face === "west";
    const loc = event?.block?.location;
    const dim = event?.dimension ?? event?.block?.dimension;

    // 1. Enforce ceiling-only, wall-only, and floor-only plant survivability rules (matching Java canSurvive)
    const ceilingOnlyPlants = new Set([
      "bulb_vine_seed",
      "cave_pumpkin_seed",
      "bulb_vine",
      "dense_vine",
      "twisted_vine",
      "jungle_vine",
      "filalux",
      "rubinea",
      "magnula",
      "tenanea_flowers"
    ]);
    const horizWallOnlyPlants = new Set([
      "aurant_polypore",
      "bulb_moss",
      "cyan_moss",
      "jungle_fern",
      "purple_polypore",
      "ruscus",
      "tail_moss",
      "twisted_moss",
      "tube_worm"
    ]);
    const floorOnlyPlants = new Set([
      "umbrella_moss",
      "umbrella_moss_tall",
      "twisted_umbrella_moss",
      "twisted_umbrella_moss_tall",
      "creeping_moss",
      "shadow_berry",
      "murkweed",
      "needlegrass",
      "bolux_mushroom",
      "small_jellyshroom",
      "small_amaranita_mushroom",
      "large_amaranita_mushroom",
      "flammalix",
      "pond_anemone",
      "bubble_coral",
      "charnia_cyan",
      "charnia_green",
      "charnia_light_blue",
      "charnia_orange",
      "charnia_purple",
      "charnia_red",
      "aeridium",
      "amber_grass",
      "blooming_cooksonia",
      "bushy_grass",
      "cave_grass",
      "chorus_grass",
      "clawfern",
      "crystal_grass",
      "fracturn",
      "globulagus",
      "inflexia",
      "jungle_grass",
      "lamellarium",
      "lutebus",
      "orango",
      "salteago",
      "shadow_plant",
      "vaiolush_fern"
    ]);

    if (ceilingOnlyPlants.has(shortName)) {
      if (loc && dim && typeof dim.getBlock === "function") {
        try {
          const aboveBlk = dim.getBlock({ x: loc.x, y: loc.y + 1, z: loc.z });
          if (!aboveBlk || aboveBlk.typeId === "minecraft:air") {
            event.cancel = true;
            return;
          }
        } catch {}
      }
    } else if (horizWallOnlyPlants.has(shortName)) {
      if (!isHorizFace) {
        event.cancel = true;
        return;
      }
    } else if (
      floorOnlyPlants.has(shortName) ||
      shortName.endsWith("_sapling") ||
      (shortName.endsWith("_seed") && !ceilingOnlyPlants.has(shortName))
    ) {
      if (loc && dim && typeof dim.getBlock === "function") {
        try {
          const belowBlk = dim.getBlock({ x: loc.x, y: loc.y - 1, z: loc.z });
          if (!belowBlk || belowBlk.typeId === "minecraft:air") {
            event.cancel = true;
            return;
          }
        } catch {}
      }
    }

    if (!perm || typeof perm.getAllStates !== "function" || typeof perm.withState !== "function") {
      return;
    }
    let states;
    try {
      states = perm.getAllStates();
    } catch {
      return;
    }
    if (!states || Object.keys(states).length === 0) return;

    const faceY = Number(event?.faceLocation?.y ?? 0.5);
    const view = event?.player?.getViewDirection?.() ?? { x: 0, y: 0, z: 1 };

    const absX = Math.abs(view.x ?? 0);
    const absZ = Math.abs(view.z ?? 1);
    const playerHoriz = absX > absZ ? (view.x > 0 ? "east" : "west") : (view.z > 0 ? "south" : "north");
    const oppositeMap = { north: "south", south: "north", east: "west", west: "east" };
    const oppositeHoriz = oppositeMap[playerHoriz] ?? "north";

    let newPerm = perm;
    const trySetState = (key, val) => {
      try {
        newPerm = newPerm.withState(key, val);
        return true;
      } catch {
        return false;
      }
    };

    if ("betterend:axis" in states) {
      const targetAxis =
        face === "east" || face === "west"
          ? "x"
          : face === "north" || face === "south"
            ? "z"
            : "y";
      trySetState("betterend:axis", targetAxis);
    }

    if ("betterend:facing" in states) {
      const isWallAttached =
        shortName.endsWith("_ladder") ||
        shortName.endsWith("_wall_sign") ||
        shortName.endsWith("_hanging_wall_sign") ||
        shortName.endsWith("_shelf") ||
        shortName.endsWith("_moss") ||
        shortName.endsWith("_polypore") ||
        shortName.endsWith("_fur") ||
        shortName.endsWith("_outer_leaves");
      const isStairOrDoorOrGate =
        shortName.endsWith("_stairs") ||
        shortName.endsWith("_door") ||
        shortName.endsWith("_gate");
      const isSixWay =
        shortName === "neon_cactus" ||
        shortName === "smaragdant_crystal_shard" ||
        shortName.endsWith("_fur") ||
        shortName.endsWith("_outer_leaves");

      if (isSixWay) {
        if (!trySetState("betterend:facing", face)) {
          trySetState("betterend:facing", isHorizFace ? face : oppositeHoriz);
        }
      } else if (isWallAttached) {
        const wallDir = isHorizFace ? face : oppositeHoriz;
        trySetState("betterend:facing", wallDir);
      } else if (isStairOrDoorOrGate) {
        trySetState("betterend:facing", playerHoriz);
      } else {
        trySetState("betterend:facing", oppositeHoriz);
      }
    }

    if ("betterend:type" in states && shortName.endsWith("_slab")) {
      const slabType = face === "down" || (face !== "up" && faceY > 0.5) ? "top" : "bottom";
      trySetState("betterend:type", slabType);
    }

    if ("betterend:half" in states) {
      if (shortName.endsWith("_door")) {
        trySetState("betterend:half", "lower");
        const loc = event.block?.location;
        const dim = event.dimension ?? event.block?.dimension;
        if (loc && dim && this.serverModule?.system?.run) {
          this.serverModule.system.run(() => {
            try {
              const upperBlk = dim.getBlock({ x: loc.x, y: loc.y + 1, z: loc.z });
              if (upperBlk && upperBlk.typeId === "minecraft:air") {
                const upperPerm = newPerm.withState("betterend:half", "upper");
                upperBlk.setPermutation(upperPerm);
              }
            } catch {}
          });
        }
      } else {
        const halfVal = face === "down" || (face !== "up" && faceY > 0.5) ? "top" : "bottom";
        trySetState("betterend:half", halfVal);
      }
    }

    if ("betterend:is_floor" in states) {
      trySetState("betterend:is_floor", face !== "down");
    }

    if ("betterend:rotation" in states) {
      const angle = Math.atan2(-(view.x ?? 0), view.z ?? 1);
      const rot16 = ((Math.round((angle / (Math.PI * 2)) * 16) % 16) + 16) % 16;
      if (!trySetState("betterend:rotation", rot16)) {
        trySetState("betterend:rotation", rot16 % 4);
      }
    }

    event.permutationToPlace = newPerm;
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
        const itemId = event.itemStack?.typeId ?? "betterend:elytra_armored";
        this.equipmentService.equipCustomElytra?.({
          playerId: event.source.id ?? "player",
          itemId
        });
        this._equipBetterEndElytraCarrier(event.source, itemId);
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
   * Surface biome (15 land biomes + promoted sub-biomes) of outer-End `(x, z)` using the shared Java
   * biome-picker model (`regions/native-cell-map.js`) that `tools/placement-molang.mjs` compiles into
   * every native rule - so the HUD, entity spawning and script decorators always agree with the
   * biome that painted the ground and grew the trees / structures.
   */
  _lookupNativeCellRegion(x, z) {
    return REGION_CATALOGUE[nativeSurfaceRegionIndex(x, z)] ?? REGION_CATALOGUE[0];
  }

  /**
   * The biome a player is actually in: aerial biome while over void, cave biome while well below
   * the surface of a cave lattice cell, otherwise the surface biome.
   */
  _resolvePlayerRegion(dimension, loc) {
    const surface = this._lookupNativeCellRegion(loc.x, loc.z);
    try {
      const bx = Math.floor(loc.x);
      const bz = Math.floor(loc.z);
      const top = dimension?.getTopmostBlock?.({ x: bx, z: bz }, 130);
      const topY = top?.location?.y;
      const aerial = nativeAerialRegionIndex(loc.x, loc.z);
      if (aerial >= 0) {
        if (topY === undefined || topY < 16) {
          return REGION_CATALOGUE[aerial] ?? surface;
        }
        const lowBlk = dimension?.getBlock?.({ x: bx, y: 24, z: bz });
        const midBlk = dimension?.getBlock?.({ x: bx, y: 38, z: bz });
        if (
          (!lowBlk || lowBlk.typeId === "minecraft:air") &&
          (!midBlk || midBlk.typeId === "minecraft:air")
        ) {
          return REGION_CATALOGUE[aerial] ?? surface;
        }
      }
      if (topY !== undefined && loc.y < topY - 7) {
        const cave = nativeCaveRegionIndex(loc.x, loc.z);
        if (cave >= 0) return REGION_CATALOGUE[cave] ?? surface;
      }
    } catch {}
    return surface;
  }

  /**
   * Finds a deterministic outer-End coordinate (`|x| > 1120 || |z| > 1120`) belonging to
   * `targetRegionId`, searching square rings outward from the protected central island.
   */
  _findRegionCoordinate(targetRegionId) {
    const target = REGION_CATALOGUE.findIndex((region) => region.id === targetRegionId);
    const layer = REGION_CATALOGUE[target]?.layer ?? "surface";
    const indexAt =
      layer === "aerial"
        ? nativeAerialRegionIndex
        : layer === "cave"
          ? nativeCaveRegionIndex
          : nativeSurfaceRegionIndex;
    const step = 64;
    for (let ring = 1152; ring <= 12000; ring += step) {
      for (let t = -ring; t <= ring; t += step) {
        for (const [x, z] of [
          [t, -ring],
          [t, ring],
          [-ring, t],
          [ring, t]
        ]) {
          if (indexAt(x, z) === target) {
            return { x, y: layer === "aerial" ? 84 : 68, z };
          }
        }
      }
    }
    return { x: 1440, y: 68, z: 1440 };
  }

  /**
   * Chooses the top and under surface block for a region at `(x, z)`.
   */
  _chooseSurfaceBlocks(region, x, z) {
    const caveDefaults = {
      empty_aurora_cave: { top: "betterend:violecite", alt: "betterend:crystal_moss" },
      lush_aurora_cave: { top: "betterend:cave_moss", alt: "betterend:crystal_moss" },
      empty_smaragdant_cave: { top: "betterend:virid_jadestone", alt: "betterend:cave_moss" },
      lush_smaragdant_cave: { top: "betterend:cave_moss", alt: "betterend:virid_jadestone" },
      jade_cave: { top: "betterend:virid_jadestone", alt: "betterend:azure_jadestone" },
      empty_end_cave: { top: "betterend:flavolite", alt: "betterend:violecite" }
    }[region?.id];
    const surface = region?.surface ?? {};
    let topBlock = caveDefaults?.top ?? surface.topBlock ?? "betterend:end_moss";
    if (topBlock === "minecraft:end_stone" && region?.layer === "aerial") {
      topBlock = "betterend:end_moss";
    }
    const underBlock = surface.underBlock ?? "minecraft:end_stone";
    const seed = MHelper.getSeed3D(this.regionService.effectiveSeed, x, z, 1);
    const rng = new JavaRandom(seed);
    const altTop = caveDefaults?.alt ?? surface.altTopBlock;
    if (altTop && rng.nextInt(4) === 0) {
      topBlock = altTop;
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
   * 3D BFS flood-fill remover for connected vanilla Chorus trees (`minecraft:chorus_plant`
   * and `minecraft:chorus_flower`) in non-chorus BetterEnd biomes.
   */
  _removeChorusTreeAt(dimension, startX, startY, startZ) {
    if (!dimension || typeof dimension.getBlock !== "function") return;
    const queue = [{ x: startX, y: startY, z: startZ }];
    const visited = new Set([`${startX},${startY},${startZ}`]);
    const dirs = [
      [0, -1, 0],
      [0, 1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1]
    ];
    let removed = 0;
    while (queue.length > 0 && removed < 160) {
      const cur = queue.shift();
      try {
        const blk = dimension.getBlock(cur);
        if (!blk) continue;
        const tid = blk.typeId;
        if (tid !== "minecraft:chorus_plant" && tid !== "minecraft:chorus_flower") continue;
        blk.setType("minecraft:air");
        removed += 1;
        for (const [dx, dy, dz] of dirs) {
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          const nz = cur.z + dz;
          const k = `${nx},${ny},${nz}`;
          if (!visited.has(k)) {
            visited.add(k);
            queue.push({ x: nx, y: ny, z: nz });
          }
        }
      } catch {}
    }
  }

  /**
   * Ensures a safe landing on a Guidebook teleport to `(cx, cy, cz)`:
   * - If a natural End island already exists at `(cx, cz)` (decorated natively by C++
   *   `feature_rules`), leaves the natural terrain untouched (or places a 3D Cave Grotto
   *   for cave biomes) and teleports the player onto its surface.
   * - Only if `(cx, cz)` is over open void (`topY < 40`) does it construct a seamless
   *   21x21 BetterEnd biome island so the player never falls into the void.
   */
  _generateBiomeIslandAt(dimension, cx, cy, cz, regionId, player = null) {
    if (!dimension || typeof dimension.getBlock !== "function") return;
    const region = REGIONS_BY_ID.get(regionId) ?? REGION_CATALOGUE[0];

    try {
      if (typeof dimension.getTopmostBlock === "function" && region?.layer !== "aerial") {
        const existingTop = dimension.getTopmostBlock({ x: Math.trunc(cx), z: Math.trunc(cz) }, 120);
        if (existingTop && existingTop.location.y >= 40) {
          const landY = existingTop.location.y;
          if (regionId !== "chorus_forest") {
            const baseChunkX = Math.floor(cx / 16);
            const baseChunkZ = Math.floor(cz / 16);
            for (let dcx = -1; dcx <= 1; dcx++) {
              for (let dcz = -1; dcz <= 1; dcz++) {
                this._decorateChunkLandmarks(dimension, baseChunkX + dcx, baseChunkZ + dcz);
              }
            }
          }
          if (region?.layer === "cave") {
            const grottoFeat =
              regionId.includes("aurora")
                ? "aurora_cave_grotto"
                : regionId.includes("smaragdant")
                  ? "smaragdant_cave_grotto"
                  : regionId === "jade_cave"
                    ? "jade_cave_grotto"
                    : "stalactite_cluster";
            try {
              dimension.runCommand?.(
                `structure load betterend:proc_${grottoFeat}_v0 ${Math.trunc(cx) - 8} ${landY} ${Math.trunc(cz) - 8}`
              );
            } catch {}
          }
          if (player && typeof player.teleport === "function") {
            player.teleport(
              { x: Math.trunc(cx) + 0.5, y: landY + 2, z: Math.trunc(cz) + 0.5 },
              { dimension }
            );
          }
          return;
        }
      }
    } catch {}

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
          } else if (dx === 6 && dz === 0) {
            if (region?.layer === "cave") {
              const grottoFeat =
                regionId.includes("aurora")
                  ? "aurora_cave_grotto"
                  : regionId.includes("smaragdant")
                    ? "smaragdant_cave_grotto"
                    : regionId === "jade_cave"
                      ? "jade_cave_grotto"
                      : "stalactite_cluster";
              try {
                dimension.runCommand?.(
                  `structure load betterend:proc_${grottoFeat}_v0 ${Math.trunc(cx) - 8} ${cy} ${Math.trunc(cz) - 8}`
                );
              } catch {}
            } else if (region?.layer === "aerial") {
              const aerialFeat =
                regionId === "flower_islets"
                  ? "small_island_flower"
                  : regionId === "waterfall_ponds"
                    ? "small_island"
                    : "ice_star";
              try {
                dimension.runCommand?.(
                  `structure load betterend:proc_${aerialFeat}_v0 ${Math.trunc(cx) - 9} ${cy - 8} ${Math.trunc(cz) - 9}`
                );
              } catch {}
            } else {
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
                    "hydralux",
                    "eternal_portal",
                    "end_village",
                    "painted_mountain",
                    "end_lake",
                    "end_lake_rare",
                    "megalake"
                  ].includes(f)
              );
              if (customFeatures.length > 0) {
                const featId = customFeatures[rng.nextInt(customFeatures.length)];
                try {
                  dimension.runCommand?.(
                    `structure load betterend:proc_${featId}_v0 ${x - 4} ${cy + 1} ${z - 4}`
                  );
                } catch {}
              }
            }
          }
        } catch {
          // Ignore if chunk still loading
        }
      }
    }
  }

  _applyBlockPlacement(targetBlock, blockId, props = null) {
    if (!targetBlock || !blockId) return;
    try {
      const BlockPermutation = this.serverModule?.BlockPermutation;
      if (
        BlockPermutation &&
        typeof BlockPermutation.resolve === "function" &&
        props &&
        blockId.startsWith("betterend:") &&
        Object.keys(props).length > 0
      ) {
        const states = {};
        for (const [k, v] of Object.entries(props)) {
          const traitKey = k.startsWith("betterend:") ? k : `betterend:${k}`;
          if (v === "true" || v === true) states[traitKey] = true;
          else if (v === "false" || v === false) states[traitKey] = false;
          else if (typeof v === "number") states[traitKey] = v;
          else if (/^\d+$/.test(String(v))) states[traitKey] = Number(v);
          else states[traitKey] = String(v);
        }
        try {
          targetBlock.setPermutation(BlockPermutation.resolve(blockId, states));
          return;
        } catch {}
      }
      targetBlock.setType(blockId);
    } catch {}
  }

  /**
   * Carves an organic noise-contoured multi-depth water lake/pond with End Lotus, End Lily,
   * Charnia, Pond Anemone, and schooling End Fish / Cubozoa when a flat island basin is present
   * in lake biomes (`megalake`, `megalake_grove`, `foggy_mushroomland`, `sulphur_springs`,
   * `neon_oasis`, `waterfall_ponds`, `umbrella_jungle`).
   */
  _carveBiomeWaterPond(dimension, cx, cz, region, rng) {
    const isMega = region.id === "megalake" || region.id === "megalake_grove";
    const isSulphur = region.id === "sulphur_springs";
    const pondRadius = isMega ? 6 : 4;
    try {
      const centerTop = dimension.getTopmostBlock({ x: cx, z: cz }, 120);
      if (!centerTop || centerTop.location.y < 52 || centerTop.location.y > 76) return;
      if (centerTop.typeId === "minecraft:water" || centerTop.typeId === "minecraft:flowing_water") return;
      const waterY = centerTop.location.y;

      // Pre-check: never carve through natively generated trees, mushrooms, buildings or other ponds.
      // Sample the whole disc (plus a 2-block margin) on a 3-block lattice and refuse on any obstruction.
      const reach = pondRadius + 2;
      for (let ox = -reach; ox <= reach; ox += 3) {
        for (let oz = -reach; oz <= reach; oz += 3) {
          if (ox * ox + oz * oz > reach * reach) continue;
          const sample = dimension.getTopmostBlock({ x: cx + ox, z: cz + oz }, 120);
          if (!sample) return;
          if (POND_OBSTRUCTION_PATTERN.test(sample.typeId)) return;
          if (sample.typeId === "minecraft:water" || sample.typeId === "minecraft:flowing_water") return;
          if (Math.abs(sample.location.y - waterY) > 3) return;
        }
      }

      // Verify 8 perimeter rim points are at >= waterY so the pond basin is completely enclosed
      const checks = [
        [pondRadius + 1, 0],
        [-pondRadius - 1, 0],
        [0, pondRadius + 1],
        [0, -pondRadius - 1],
        [pondRadius, pondRadius],
        [-pondRadius, pondRadius],
        [pondRadius, -pondRadius],
        [-pondRadius, -pondRadius]
      ];
      for (const [ox, oz] of checks) {
        const rimTop = dimension.getTopmostBlock({ x: cx + ox, z: cz + oz }, 120);
        if (!rimTop || rimTop.location.y < waterY - 1 || rimTop.location.y > waterY + 3) return;
      }

      const shoreBlock = isSulphur
        ? "betterend:brimstone"
        : (region.surface?.altTopBlock ?? region.surface?.topBlock ?? "betterend:endstone_dust");
      const bedBlock = isSulphur ? "betterend:brimstone" : "betterend:endstone_dust";
      const deg = Math.PI / 180;

      for (let dx = -pondRadius; dx <= pondRadius; dx++) {
        for (let dz = -pondRadius; dz <= pondRadius; dz++) {
          const x = cx + dx;
          const z = cz + dz;
          const angleWarp =
            Math.sin((x * 19.3 + z * 23.7) * deg) * 0.65 +
            Math.cos((x * 31.1 - z * 17.9) * deg) * 0.45;
          const effR = pondRadius + angleWarp;
          const d = Math.hypot(dx, dz);
          if (d > effR + 0.8) continue;

          if (d <= effR - 0.9) {
            const depth = d <= effR * 0.45 ? 2 : 1;
            const subFloor = dimension.getBlock({ x, y: waterY - depth - 1, z });
            if (subFloor) subFloor.setType("minecraft:end_stone");
            const bedBlk = dimension.getBlock({ x, y: waterY - depth, z });
            if (bedBlk) {
              if (isSulphur && d <= 1.5 && rng.nextInt(5) === 0) {
                bedBlk.setType("betterend:hydrothermal_vent");
              } else {
                bedBlk.setType(bedBlock);
              }
            }
            for (let wy = -depth + 1; wy <= 0; wy++) {
              const wBlk = dimension.getBlock({ x, y: waterY + wy, z });
              if (wBlk) wBlk.setType("minecraft:water");
            }
            const aboveBlk = dimension.getBlock({ x, y: waterY + 1, z });
            if (aboveBlk) {
              if (!isSulphur && d <= effR - 1.8 && rng.nextInt(10) === 0) {
                aboveBlk.setType("betterend:end_lotus_flower");
              } else if (!isSulphur && d <= effR - 1.5 && rng.nextInt(12) === 0) {
                this._applyBlockPlacement(aboveBlk, "betterend:end_lily", { shape: "top" });
              } else if (rng.nextInt(14) === 0) {
                aboveBlk.setType("betterend:flamaea");
              } else {
                aboveBlk.setType("minecraft:air");
              }
            }
          } else {
            const rimFloor = dimension.getBlock({ x, y: waterY - 1, z });
            if (rimFloor && rimFloor.typeId === "minecraft:air") {
              rimFloor.setType("minecraft:end_stone");
            }
            const rimBlk = dimension.getBlock({ x, y: waterY, z });
            if (rimBlk && rimBlk.typeId !== "minecraft:water") {
              rimBlk.setType(shoreBlock);
            }
          }
        }
      }

      // Spawn a small school of End Fish (and Cubozoa in Megalake / Sulphur Springs) inside the newly formed lake
      const fishCount = 3 + rng.nextInt(3);
      for (let i = 0; i < fishCount; i++) {
        try {
          const fish = dimension.spawnEntity?.("betterend:end_fish", {
            x: cx + (rng.nextFloat() - 0.5) * 2.5,
            y: waterY,
            z: cz + (rng.nextFloat() - 0.5) * 2.5
          });
          if (fish) this._assignEntityBiomeVariant(fish, region.id);
        } catch {}
      }
      if (isMega || isSulphur) {
        const cuboCount = 2 + rng.nextInt(2);
        for (let i = 0; i < cuboCount; i++) {
          try {
            const cubo = dimension.spawnEntity?.("betterend:cubozoa", {
              x: cx + (rng.nextFloat() - 0.5) * 2.5,
              y: waterY,
              z: cz + (rng.nextFloat() - 0.5) * 2.5
            });
            if (cubo) this._assignEntityBiomeVariant(cubo, region.id);
          } catch {}
        }
      }
    } catch {}
  }

  /**
   * Whether `(x, z)` is inside a generated, loaded chunk. `Dimension.getBlock` throws (or returns
   * undefined) over unloaded chunks - decorating then would silently do nothing, so callers retry.
   */
  _isColumnLoaded(dimension, x, z) {
    try {
      // Prefer the exception-free probe: probing unloaded chunks with getBlock() throws, and a fast
      // flight queues hundreds of them per second (stack-trace garbage = GC stalls).
      if (typeof dimension.isChunkLoaded === "function") {
        return Boolean(dimension.isChunkLoaded({ x, y: 64, z }));
      }
      return Boolean(dimension.getBlock({ x, y: 64, z }));
    } catch {
      return false;
    }
  }

  /**
   * Lightweight landmark, lake-basin & Chorus-clearing decorator for natural End chunks:
   * - Never touches ground surface blocks (C++ surface_pass handles 100% of ground 3 layers deep).
   * - Thoroughly removes connected vanilla Chorus trees in non-chorus biomes via 3D BFS flood-fill.
   * - Carves enclosed water ponds with End Lotus & End Fish schools in lake biomes, after a
   *   whole-disc obstruction pre-check.
   *
   * @returns {"done" | "skipped" | "not_ready"} `not_ready` means the chunk (or a neighbour the
   * decorator would write into) was not loaded yet and the chunk must be retried later.
   */
  _decorateChunkLandmarks(dimension, chunkX, chunkZ) {
    if (!dimension || typeof dimension.getTopmostBlock !== "function") return "skipped";
    const baseX = chunkX * 16;
    const baseZ = chunkZ * 16;
    const centerX = baseX + 8;
    const centerZ = baseZ + 8;
    if (Math.abs(centerX) <= 1024 && Math.abs(centerZ) <= 1024) return "skipped";

    // The pond carver writes up to ~8 blocks past the chunk centre: require a loaded 3x3 chunk window.
    for (const [ox, oz] of [[0, 0], [15, 15], [-8, 8], [24, 8], [8, -8], [8, 24]]) {
      if (!this._isColumnLoaded(dimension, baseX + ox, baseZ + oz)) return "not_ready";
    }

    const region = this._lookupNativeCellRegion(centerX, centerZ);
    if (!region) return "skipped";

    // Thoroughly remove all pre-generated vanilla Chorus trees in non-chorus biomes
    if (region.id !== "chorus_forest") {
      for (let sx = 0; sx < 16; sx += 2) {
        for (let sz = 0; sz < 16; sz += 2) {
          try {
            const top = dimension.getTopmostBlock({ x: baseX + sx, z: baseZ + sz }, 130);
            if (top && (top.typeId === "minecraft:chorus_flower" || top.typeId === "minecraft:chorus_plant")) {
              this._removeChorusTreeAt(dimension, top.location.x, top.location.y, top.location.z);
            }
          } catch {}
        }
      }
    }

    // Carve natural water ponds in lake/water biomes using deterministic noise gate
    const lakeBiomes = new Set([
      "megalake",
      "megalake_grove",
      "foggy_mushroomland",
      "sulphur_springs",
      "neon_oasis",
      "waterfall_ponds",
      "umbrella_jungle"
    ]);
    if (lakeBiomes.has(region.id)) {
      const seed = MHelper.getSeed3D(this.regionService.effectiveSeed, chunkX, chunkZ, 77);
      const rng = new JavaRandom(seed);
      const chance = region.id === "megalake" || region.id === "megalake_grove" ? 2 : 4;
      if (rng.nextInt(chance) === 0) {
        this._carveBiomeWaterPond(dimension, centerX, centerZ, region, rng);
      }
    }
    return "done";
  }

  /**
   * Time-budgeted decoration pump. Scans a ring around each player *and* a look-ahead point along
   * their velocity (so fast Elytra flight decorates ahead of the camera instead of behind it),
   * queues undecorated chunks nearest-first, and decorates as many as fit in
   * `DECORATION_BUDGET_MS`. Chunks that are not loaded yet are retried, never marked done.
   */
  _pumpDecorationQueue(players) {
    const now = () => (typeof Date !== "undefined" ? Date.now() : 0);
    this._pumpTick = (this._pumpTick ?? 0) + 1;
    const tick = this._pumpTick;
    const targets = [];
    for (const player of players) {
      const dim = player?.dimension;
      if (!player?.location || dim?.id !== "minecraft:the_end") continue;
      const vel = player.getVelocity?.() ?? { x: 0, z: 0 };
      const speed = Math.hypot(vel.x ?? 0, vel.z ?? 0);
      const px = Math.floor(player.location.x / 16);
      const pz = Math.floor(player.location.z / 16);
      const ahead = speed > 0.15 ? DECORATION_LOOKAHEAD_CHUNKS : 0;
      const ax = px + Math.round(((vel.x ?? 0) / Math.max(speed, 0.001)) * ahead);
      const az = pz + Math.round(((vel.z ?? 0) / Math.max(speed, 0.001)) * ahead);
      targets.push({ dim, px, pz, ax, az, pid: player.id ?? player.name ?? "player" });
    }
    if (targets.length === 0) return;

    // Re-scan the surrounding chunks only when a player (or their look-ahead point) changed chunk.
    for (const t of targets) {
      const scanKey = `${t.px},${t.pz},${t.ax},${t.az}`;
      if (this._decorationScanKeys.get(t.pid) === scanKey && tick % 40 !== 0) continue;
      this._decorationScanKeys.set(t.pid, scanKey);
      for (const [centerCx, centerCz, radius] of [
        [t.px, t.pz, DECORATION_SCAN_RADIUS],
        [t.ax, t.az, DECORATION_LOOKAHEAD_RADIUS]
      ]) {
        for (let dcx = -radius; dcx <= radius; dcx++) {
          for (let dcz = -radius; dcz <= radius; dcz++) {
            const cx = centerCx + dcx;
            const cz = centerCz + dcz;
            const key = `${cx},${cz}`;
            if (this._decoratedLiveChunks.has(key) || this._decorationQueue.has(key)) continue;
            this._decorationQueue.set(key, { cx, cz, dim: t.dim, tries: 0, retryAt: 0 });
          }
        }
      }
    }
    if (this._decorationQueue.size === 0) return;

    const priority = entry => {
      let best = Infinity;
      for (const t of targets) {
        const d1 = Math.hypot(entry.cx - t.px, entry.cz - t.pz);
        const d2 = Math.hypot(entry.cx - t.ax, entry.cz - t.az) - 1.5;
        best = Math.min(best, d1, d2);
      }
      return best;
    };
    const pending = [];
    for (const [key, entry] of this._decorationQueue) {
      if (entry.retryAt > tick) continue; // backing off: chunk was not loaded yet
      pending.push({ key, entry, score: priority(entry) });
    }
    if (pending.length === 0) return;
    pending.sort((x, y) => x.score - y.score);

    const startedAt = now();
    let processed = 0;
    let probes = 0;
    for (const { key, entry, score } of pending) {
      if (processed >= DECORATION_MAX_PER_RUN || now() - startedAt > DECORATION_BUDGET_MS) break;
      if (score > DECORATION_SCAN_RADIUS + 2) {
        this._decorationQueue.delete(key); // player moved away; it will be re-queued if they return
        continue;
      }
      if (probes >= DECORATION_MAX_PROBES_PER_RUN) break;
      probes += 1;
      let status = "skipped";
      try {
        status = this._decorateChunkLandmarks(entry.dim, entry.cx, entry.cz);
      } catch {
        status = "skipped";
      }
      if (status === "not_ready") {
        entry.tries += 1;
        if (entry.tries > DECORATION_MAX_RETRIES) {
          this._decorationQueue.delete(key);
        } else {
          // exponential back-off in pump ticks (2 game ticks each): 2, 4, 8, ... capped at 40
          entry.retryAt = tick + Math.min(40, 2 ** Math.min(entry.tries, 5));
        }
        continue;
      }
      this._decorationQueue.delete(key);
      this._decoratedLiveChunks.add(key);
      processed += 1;
    }

    if (this._decoratedLiveChunks.size > DECORATION_MEMORY_LIMIT) {
      for (const key of this._decoratedLiveChunks) {
        const [cx, cz] = key.split(",").map(Number);
        const far = targets.every((t) => Math.hypot(cx - t.px, cz - t.pz) > 48);
        if (far) this._decoratedLiveChunks.delete(key);
      }
    }
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

  /**
   * Grows a BetterEnd sapling, seed, moss, or vine at `loc` in `dim` (via Bone Meal or natural random tick),
   * using original BetterEnd `.mcstructure` templates or multi-stage block states.
   */
  _growBetterEndPlantAt(dim, loc, blockId, { isBoneMeal = false } = {}) {
    if (!dim || !loc || typeof dim.getBlock !== "function") return false;
    const rawId = String(blockId ?? "");
    if (!rawId.startsWith("betterend:")) return false;
    const shortName = rawId.slice("betterend:".length).replace(/__p\d+$/, "");
    const x = Math.trunc(loc.x);
    const y = Math.trunc(loc.y);
    const z = Math.trunc(loc.z);

    // 1. Tree saplings & multi-block plant seeds backed by 1:1 BetterEnd .mcstructure templates
    const structureSeedMap = {
      mossy_glowshroom_sapling: { feat: "mossy_glowshroom", ox: -6, oy: 0, oz: -6 },
      pythadendron_sapling: { feat: "pythadendron", ox: -6, oy: 0, oz: -6 },
      end_lotus_sapling: { feat: "end_lotus", ox: -2, oy: 0, oz: -2 },
      end_lotus_seed: { feat: "end_lotus", ox: -2, oy: 0, oz: -2 },
      lacugrove_sapling: { feat: "lacugrove", ox: -5, oy: 0, oz: -5 },
      dragon_tree_sapling: { feat: "dragon_tree", ox: -6, oy: 0, oz: -6 },
      tenanea_sapling: { feat: "tenanea", ox: -6, oy: 0, oz: -6 },
      helix_tree_sapling: { feat: "helix_tree", ox: -5, oy: 0, oz: -5 },
      umbrella_tree_sapling: { feat: "umbrella_tree", ox: -6, oy: 0, oz: -6 },
      jellyshroom_sapling: { feat: "jellyshroom", ox: -5, oy: 0, oz: -5 },
      lucernia_sapling: { feat: "lucernia", ox: -6, oy: 0, oz: -6 },
      small_amaranita_mushroom: { feat: "small_amaranita", ox: -2, oy: 0, oz: -2 },
      large_amaranita_mushroom: { feat: "large_amaranita", ox: -4, oy: 0, oz: -4 },
      hydralux_sapling: { feat: "hydralux", ox: -1, oy: 0, oz: -1 },
      lanceleaf_seed: { feat: "lanceleaf", ox: 0, oy: 0, oz: 0 },
      lumecorn_seed: { feat: "lumecorn", ox: 0, oy: 0, oz: 0 },
      glowing_pillar_seed: { feat: "glow_pillar", ox: -1, oy: 0, oz: -1 },
      blue_vine_seed: { feat: "blue_vine", ox: -1, oy: 0, oz: -1 },
      end_lily_seed: { feat: "end_lily", ox: 0, oy: 0, oz: 0 }
    };

    try {
      const blk = dim.getBlock({ x, y, z });
      if (!blk) return false;
      const perm = blk.permutation;
      const curAge = perm?.getState?.("betterend:age");

      if (shortName in structureSeedMap) {
        if (typeof curAge === "number" && curAge < 3 && !isBoneMeal) {
          blk.setPermutation(perm.withState("betterend:age", curAge + 1));
          return true;
        }
        const { feat, ox, oy, oz } = structureSeedMap[shortName];
        const variantIdx = Math.floor(Math.random() * 3);
        blk.setType("minecraft:air");
        dim.runCommand?.(
          `structure load betterend:proc_${feat}_v${variantIdx} ${x + ox} ${y + oy} ${z + oz}`
        );
        return true;
      }

      // 2. Ceiling-hanging Bulb Vine Seed -> grows downward Bulb Vine chain with glowing lantern tip
      if (shortName === "bulb_vine_seed") {
        if (typeof curAge === "number" && curAge < 3) {
          blk.setPermutation(perm.withState("betterend:age", curAge + 1));
          return true;
        }
        const len = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < len; i++) {
          const vBlk = dim.getBlock({ x, y: y - i, z });
          if (!vBlk || (i > 0 && vBlk.typeId !== "minecraft:air")) break;
          const shape = i === 0 ? "top" : i === len - 1 ? "bottom" : "middle";
          this._applyBlockPlacement(vBlk, "betterend:bulb_vine", { shape });
        }
        return true;
      }

      // 3. Ceiling-hanging Cave Pumpkin Seed -> grows Cave Pumpkin below at age 3
      if (shortName === "cave_pumpkin_seed") {
        if (typeof curAge === "number" && curAge < 3) {
          blk.setPermutation(perm.withState("betterend:age", curAge + 1));
          return true;
        }
        const belowBlk = dim.getBlock({ x, y: y - 1, z });
        if (belowBlk && belowBlk.typeId === "minecraft:air") {
          belowBlk.setType("betterend:cave_pumpkin");
          return true;
        }
        return false;
      }

      // 4. Crop seeds (amber_root_seed, blossom_berry_seed, chorus_mushroom_seed, shadow_berry)
      if (typeof curAge === "number" && curAge < 3) {
        blk.setPermutation(perm.withState("betterend:age", curAge + 1));
        return true;
      }

      // 5. 1-block Umbrella Moss / Twisted Umbrella Moss -> 2-block tall variant
      if (shortName === "umbrella_moss" || shortName === "twisted_umbrella_moss") {
        const aboveBlk = dim.getBlock({ x, y: y + 1, z });
        if (aboveBlk && aboveBlk.typeId === "minecraft:air") {
          const tallId = `betterend:${shortName}_tall`;
          const rot = Math.floor(Math.random() * 4);
          this._applyBlockPlacement(blk, tallId, { rotation: rot, top: false });
          this._applyBlockPlacement(aboveBlk, tallId, { rotation: rot, top: true });
          return true;
        }
        return false;
      }

      // 6. Neon Cactus upward growth. Java `NeonCactusPlantBlock` stops at MAX_LENGTH (12) segments; without
      //    the cap a ticking cactus column grew without bound (hundreds of blocks per minute in a probe).
      if (shortName === "neon_cactus") {
        let length = 1;
        for (let dy = 1; dy <= NEON_CACTUS_MAX_LENGTH; dy++) {
          const below = dim.getBlock({ x, y: y - dy, z });
          if (!below || !String(below.typeId ?? "").startsWith("betterend:neon_cactus")) break;
          length += 1;
        }
        for (let dy = 1; dy <= NEON_CACTUS_MAX_LENGTH; dy++) {
          const above = dim.getBlock({ x, y: y + dy, z });
          if (!above || !String(above.typeId ?? "").startsWith("betterend:neon_cactus")) break;
          length += 1;
        }
        if (length >= NEON_CACTUS_MAX_LENGTH) return false;
        const aboveBlk = dim.getBlock({ x, y: y + 1, z });
        if (aboveBlk && aboveBlk.typeId === "minecraft:air") {
          this._applyBlockPlacement(blk, "betterend:neon_cactus", { facing: "up", shape: "middle" });
          this._applyBlockPlacement(aboveBlk, "betterend:neon_cactus", { facing: "up", shape: "top" });
          return true;
        }
        return false;
      }

      // 7. Hanging vines downward extension. Java `BaseVineBlock` (dense/twisted/jungle vine, rubinea, magnula,
      //    filalux, tenanea flowers) never random-ticks - it only extends when bone-mealed, and at most to
      //    `maxGrowLength` (32) segments from the anchor. `bulb_vine` refuses bone meal and only exists as the
      //    product of a `bulb_vine_seed`. So natural/ecology ticks must never lengthen a vine.
      if (PLAIN_BONEMEAL_VINES.has(shortName)) {
        if (!isBoneMeal) return false;
        const vineId = `betterend:${shortName}`;
        const isVineAt = (vy) => {
          const b = dim.getBlock({ x, y: vy, z });
          return Boolean(b) && String(b.typeId ?? "").startsWith(vineId);
        };
        let bottomY = y;
        let topY = y;
        while (y - bottomY < VINE_MAX_GROW_LENGTH && isVineAt(bottomY - 1)) bottomY -= 1;
        while (topY - y < VINE_MAX_GROW_LENGTH && isVineAt(topY + 1)) topY += 1;
        const length = topY - bottomY + 1;
        if (length >= VINE_MAX_GROW_LENGTH) return false;
        const curBottom = dim.getBlock({ x, y: bottomY, z });
        const targetAir = dim.getBlock({ x, y: bottomY - 1, z });
        if (curBottom && targetAir && targetAir.typeId === "minecraft:air") {
          this._applyBlockPlacement(curBottom, vineId, { shape: length === 1 ? "top" : "middle" });
          this._applyBlockPlacement(targetAir, vineId, { shape: "bottom" });
          return true;
        }
        return false;
      }
    } catch {}
    return false;
  }

  /**
   * Cascade-breaks connected vertical segments of multi-block plants, vines, lanterns, and doors
   * when any segment is broken by a player.
   */
  _cascadeBreakMultiblockPlant(dim, loc, brokenId) {
    if (!dim || !loc || typeof dim.getBlock !== "function") return;
    const rawId = String(brokenId ?? "");
    if (!rawId.startsWith("betterend:")) return;
    const shortName = rawId.slice("betterend:".length).replace(/__p\d+$/, "");

    const multiblockFamilies = [
      ["lumecorn"],
      ["lanceleaf"],
      ["blue_vine", "blue_vine_lantern", "blue_vine_fur"],
      ["end_lily"],
      ["hydralux", "hydralux_petal_block"],
      ["end_lotus_stem", "end_lotus_flower"],
      ["bulb_vine"],
      ["tenanea_flowers"],
      ["filalux", "filalux_wings", "filalux_lantern"],
      ["rubinea"],
      ["magnula"],
      ["dense_vine"],
      ["twisted_vine"],
      ["jungle_vine"],
      ["umbrella_moss_tall"],
      ["twisted_umbrella_moss_tall"],
      ["neon_cactus"],
      ["glowing_pillar_roots", "glowing_pillar_luminophor", "glowing_pillar_leaves"],
      ["silk_moth_nest"],
      ["cave_pumpkin_seed", "cave_pumpkin"]
    ];

    let activeFamily = null;
    if (shortName.endsWith("_door")) {
      activeFamily = [shortName];
    } else {
      for (const fam of multiblockFamilies) {
        if (fam.some((prefix) => shortName === prefix || shortName.startsWith(`${prefix}_`))) {
          activeFamily = fam;
          break;
        }
      }
    }
    if (!activeFamily) return;

    const matchesFamily = (tid) => {
      const s = String(tid ?? "").replace(/^betterend:/, "").replace(/__p\d+$/, "");
      return activeFamily.some((prefix) => s === prefix || s.startsWith(`${prefix}_`));
    };

    const x = Math.trunc(loc.x);
    const y = Math.trunc(loc.y);
    const z = Math.trunc(loc.z);

    // Scan upward and downward along the vertical column and break connected segments
    for (const dir of [1, -1]) {
      for (let step = 1; step <= 14; step++) {
        const ny = y + dir * step;
        try {
          const blk = dim.getBlock({ x, y: ny, z });
          if (!blk || !matchesFamily(blk.typeId)) break;
          blk.setType("minecraft:air");
        } catch {
          break;
        }
      }
    }
  }

  _handleLiveBlockInteract(event) {
    const block = event?.block;
    const player = event?.player;
    if (!block || !player) return;

    const blockId = String(block.typeId ?? "");
    if (!blockId.startsWith("betterend:")) return;
    const shortName = blockId.slice("betterend:".length).replace(/__p\d+$/, "");
    const dim = block.dimension ?? player.dimension;
    const dimId = dim?.id ?? "minecraft:the_end";
    const loc = block.location ?? { x: 0, y: 64, z: 0 };
    const heldItemId = String(event?.itemStack?.typeId ?? "");

    // Bone Meal growth on BetterEnd saplings, seeds, mosses, and vines
    if (heldItemId === "minecraft:bone_meal" && dim) {
      if (this._growBetterEndPlantAt(dim, loc, blockId, { isBoneMeal: true })) {
        try {
          player.playSound?.("item.bone_meal.use");
          dim.spawnParticle?.("minecraft:crop_growth_emitter", {
            x: loc.x + 0.5,
            y: loc.y + 0.5,
            z: loc.z + 0.5
          });
        } catch {}
        return;
      }
    }

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
    } else if (
      shortName.endsWith("_door") ||
      shortName.endsWith("_trapdoor") ||
      shortName.endsWith("_gate")
    ) {
      try {
        const perm = block.permutation;
        const curOpen = perm?.getState?.("betterend:open");
        if (typeof curOpen === "boolean") {
          const nextOpen = !curOpen;
          block.setPermutation(perm.withState("betterend:open", nextOpen));
          if (shortName.endsWith("_door")) {
            const curHalf = perm?.getState?.("betterend:half");
            const otherY = curHalf === "upper" ? loc.y - 1 : loc.y + 1;
            const otherBlk = dim?.getBlock?.({ x: loc.x, y: otherY, z: loc.z });
            if (otherBlk && String(otherBlk.typeId ?? "").startsWith(`betterend:${shortName}`)) {
              const otherPerm = otherBlk.permutation;
              if (typeof otherPerm?.withState === "function") {
                otherBlk.setPermutation(otherPerm.withState("betterend:open", nextOpen));
              }
            }
          }
          player.playSound?.(nextOpen ? "random.door_open" : "random.door_close");
        }
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
    const brokenId = String(
      event?.brokenBlockPermutation?.type?.id ?? block?.typeId ?? ""
    );

    if (loc && dim && brokenId.startsWith("betterend:")) {
      this._cascadeBreakMultiblockPlant(dim, loc, brokenId);
    }

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

  _applyPlayerImpulse(player, vx, vy, vz) {
    if (!player) return;
    try {
      if (typeof player.applyImpulse === "function") {
        player.applyImpulse({ x: vx, y: vy, z: vz });
        return;
      }
    } catch {}
    try {
      if (typeof player.applyKnockback === "function") {
        player.applyKnockback({ x: vx, z: vz }, vy);
      }
    } catch {}
  }

  _isClimbableBetterEndBlock(typeId) {
    const id = String(typeId ?? "");
    if (!id.startsWith("betterend:")) return false;
    const short = id.slice("betterend:".length).replace(/__p\d+$/, "");
    return (
      short.endsWith("_ladder") ||
      short === "bulb_vine" ||
      short === "dense_vine" ||
      short === "twisted_vine" ||
      short === "jungle_vine" ||
      short === "filalux" ||
      short === "rubinea" ||
      short === "magnula"
    );
  }

  _detectCarrierVariant(itemStack) {
    if (!itemStack || itemStack.typeId !== "minecraft:elytra") return null;
    try {
      const dyn = itemStack.getDynamicProperty?.("betterend:elytra_variant");
      if (dyn === "elytra_crystalite" || dyn === "elytra_armored") return dyn;
    } catch {}
    if (typeof itemStack.nameTag === "string") {
      if (itemStack.nameTag.includes("Crystalite Elytra")) return "elytra_crystalite";
      if (itemStack.nameTag.includes("Armored Elytra")) return "elytra_armored";
    }
    return null;
  }

  /**
   * Equips `betterend:elytra_armored` or `betterend:elytra_crystalite` directly into the Chest slot
   * and keeps the genuine `betterend:elytra_*` item permanently in `Chest` (so the custom item icon
   * and 3D wings attachable `attachables/elytra_*.json` always render on the player's back).
   */
  _equipBetterEndElytraCarrier(player, itemIdOrVariant) {
    if (!player) return false;
    const isCrystalite = String(itemIdOrVariant ?? "").includes("crystalite");
    const normVariant = isCrystalite ? "elytra_crystalite" : "elytra_armored";
    const customItemId = `betterend:${normVariant}`;
    const label = isCrystalite ? "Crystalite Elytra" : "Armored Elytra";
    const pid = player.id ?? player.name ?? "player";
    this._playerElytraVariant.set(pid, normVariant);

    let equipped = false;
    try {
      const ItemStack = this.serverModule?.ItemStack;
      const equippable =
        player.getComponent?.("minecraft:equippable") ?? player.getComponent?.("equippable");
      if (equippable && typeof equippable.setEquipment === "function" && ItemStack) {
        const prevChest = equippable.getEquipment?.("Chest");
        const targetStack = new ItemStack(customItemId, 1);
        equippable.setEquipment("Chest", targetStack);
        const mainhand = equippable.getEquipment?.("Mainhand");
        if (
          mainhand &&
          (mainhand.typeId === "betterend:elytra_armored" ||
            mainhand.typeId === "betterend:elytra_crystalite")
        ) {
          if (
            prevChest &&
            prevChest.typeId !== "betterend:elytra_armored" &&
            prevChest.typeId !== "betterend:elytra_crystalite" &&
            !this._detectCarrierVariant(prevChest)
          ) {
            equippable.setEquipment("Mainhand", prevChest);
          } else {
            equippable.setEquipment("Mainhand", undefined);
          }
        }
        equipped = true;
      }
    } catch {}

    if (equipped) {
      try {
        player.playSound?.("armor.equip_elytra");
        player.onScreenDisplay?.setActionBar?.(
          `§d[BetterEnd] §bEquipped ${label}! §7(Jump in mid-air to glide & use Firework Rockets)`
        );
      } catch {}
    }
    return equipped;
  }

  /**
   * Synchronizes BetterEnd Elytra & Crystalite Armor:
   * - Never replaces `betterend:elytra_armored` or `betterend:elytra_crystalite` with `minecraft:elytra`
   *   so the item in the Chest slot and the 3D wings on the player's back stay intact at all times.
   * - Converts any legacy `minecraft:elytra` carrier back into `betterend:elytra_*`.
   * - Applies exact Java BetterEnd `CrystaliteArmor` & `CrystaliteElytra` effects:
   *   - `crystalite_helmet`: Blindness Resistance (clears `blindness` & `darkness`)
   *   - `crystalite_chestplate` / `elytra_crystalite`: Haste I (`dig_speed`)
   *   - `crystalite_leggings`: Health Boost I (+2 hearts)
   *   - `crystalite_boots`: Speed I (`movement_speed`)
   *   - Full 4-piece Crystalite Set (Helmet + Chestplate/Crystalite Elytra + Leggings + Boots):
   *     Regeneration I + Absorption I (`crystalite_health_regen`)
   *   - `elytra_armored`: Resistance II + Fire Resistance I
   */
  _syncPlayerElytraAndArmor(player) {
    if (!player) return;
    try {
      const ItemStack = this.serverModule?.ItemStack;
      const equippable =
        player.getComponent?.("minecraft:equippable") ?? player.getComponent?.("equippable");
      if (!equippable || typeof equippable.getEquipment !== "function") return;

      const pid = player.id ?? player.name ?? "player";
      const head = equippable.getEquipment("Head");
      const chest = equippable.getEquipment("Chest");
      const legs = equippable.getEquipment("Legs");
      const feet = equippable.getEquipment("Feet");

      let chestId = String(chest?.typeId ?? "");
      let activeElytraVariant = null;

      // Convert any legacy carrier in Chest back into the genuine BetterEnd Elytra item
      if (chestId === "minecraft:elytra") {
        const legacyVariant = this._detectCarrierVariant(chest);
        if (legacyVariant && ItemStack) {
          equippable.setEquipment("Chest", new ItemStack(`betterend:${legacyVariant}`, 1));
          chestId = `betterend:${legacyVariant}`;
        }
      }

      if (chestId === "betterend:elytra_armored" || chestId === "betterend:elytra_crystalite") {
        activeElytraVariant =
          chestId === "betterend:elytra_crystalite" ? "elytra_crystalite" : "elytra_armored";
        this._playerElytraVariant.set(pid, activeElytraVariant);
      } else {
        this._playerElytraVariant.delete(pid);
        this._playerGlidingState.set(pid, false);
      }

      // Restore any tagged carrier in the player's inventory back to the genuine BetterEnd Elytra item
      // (36-slot scan: only every 6th sync, i.e. every ~3 s)
      if (ItemStack && this._tickCounter % 6 === 0) {
        try {
          const inv =
            player.getComponent?.("minecraft:inventory") ?? player.getComponent?.("inventory");
          const container = inv?.container;
          if (container && typeof container.size === "number") {
            for (let slot = 0; slot < container.size; slot++) {
              const st = container.getItem(slot);
              const v = this._detectCarrierVariant(st);
              if (v) {
                container.setItem(slot, new ItemStack(`betterend:${v}`, 1));
              }
            }
          }
        } catch {}
      }

      if (activeElytraVariant === "elytra_armored") {
        try {
          player.addEffect?.("resistance", 160, { amplifier: 1, showParticles: false });
          player.addEffect?.("fire_resistance", 160, { amplifier: 0, showParticles: false });
        } catch {}
      } else if (activeElytraVariant === "elytra_crystalite") {
        try {
          player.addEffect?.("resistance", 160, { amplifier: 0, showParticles: false });
        } catch {}
      }

      const headId = String(head?.typeId ?? "");
      const legsId = String(legs?.typeId ?? "");
      const feetId = String(feet?.typeId ?? "");

      const hasCrystaliteHead = headId === "betterend:crystalite_helmet";
      const hasCrystaliteChest =
        chestId === "betterend:crystalite_chestplate" || activeElytraVariant === "elytra_crystalite";
      const hasCrystaliteLegs = legsId === "betterend:crystalite_leggings";
      const hasCrystaliteFeet = feetId === "betterend:crystalite_boots";

      if (hasCrystaliteHead) {
        try {
          player.removeEffect?.("blindness");
          player.removeEffect?.("darkness");
        } catch {}
      }
      if (hasCrystaliteChest) {
        try {
          player.addEffect?.("haste", 160, { amplifier: 0, showParticles: false });
        } catch {}
      }
      if (hasCrystaliteLegs) {
        try {
          player.addEffect?.("health_boost", 160, { amplifier: 0, showParticles: false });
        } catch {}
      }
      if (hasCrystaliteFeet) {
        try {
          player.addEffect?.("speed", 160, { amplifier: 0, showParticles: false });
        } catch {}
      }
      if (hasCrystaliteHead && hasCrystaliteChest && hasCrystaliteLegs && hasCrystaliteFeet) {
        try {
          player.addEffect?.("regeneration", 160, { amplifier: 0, showParticles: false });
          player.addEffect?.("absorption", 160, { amplifier: 0, showParticles: false });
        } catch {}
      }
    } catch {}
  }

  /**
   * Resolves biome-specific BetterEnd wildlife species & skin variants matching Java BetterEnd biomes.
   */
  _resolveWildlifeForBiome(regionId) {
    const id = String(regionId ?? "foggy_mushroomland");
    if (id === "foggy_mushroomland") {
      return [
        { entityId: "betterend:dragonfly", variant: 0, mode: "air" },
        { entityId: "betterend:end_slime", variant: 1, mode: "ground" },
        { entityId: "betterend:end_fish", variant: 0, mode: "water" }
      ];
    }
    if (id === "megalake" || id === "megalake_grove") {
      return [
        { entityId: "betterend:dragonfly", variant: 0, mode: "air" },
        { entityId: "betterend:end_slime", variant: 2, mode: "ground" },
        { entityId: "betterend:end_fish", variant: 1, mode: "water" },
        { entityId: "betterend:cubozoa", variant: 0, mode: "water" }
      ];
    }
    if (id === "amber_land") {
      return [
        { entityId: "betterend:end_slime", variant: 3, mode: "ground" },
        { entityId: "betterend:dragonfly", variant: 0, mode: "air" }
      ];
    }
    if (id === "blossoming_spires") {
      return [{ entityId: "betterend:silk_moth", variant: 0, mode: "air" }];
    }
    if (id === "sulphur_springs") {
      return [
        { entityId: "betterend:cubozoa", variant: 1, mode: "water" },
        { entityId: "betterend:end_fish", variant: 5, mode: "water" }
      ];
    }
    if (id === "shadow_forest" || id === "dragon_graveyards" || id === "umbra_valley") {
      return [{ entityId: "betterend:shadow_walker", variant: 0, mode: "ground" }];
    }
    if (id === "chorus_forest") {
      return [{ entityId: "betterend:end_slime", variant: 0, mode: "ground" }];
    }
    return [
      { entityId: "betterend:end_slime", variant: 0, mode: "ground" },
      { entityId: "betterend:dragonfly", variant: 0, mode: "air" },
      { entityId: "betterend:silk_moth", variant: 0, mode: "air" }
    ];
  }

  _assignEntityBiomeVariant(entity, regionId, explicitSize = null) {
    if (!entity || typeof entity.triggerEvent !== "function") return;
    const typeId = String(entity.typeId ?? "");
    if (!typeId.startsWith("betterend:")) return;
    const rid = String(regionId ?? "");
    try {
      if (typeId === "betterend:end_slime") {
        const v =
          rid === "foggy_mushroomland"
            ? 1
            : rid === "megalake" || rid === "megalake_grove"
              ? 2
              : rid === "amber_land"
                ? 3
                : 0;
        entity.triggerEvent(`betterend:variant_${v}`);
        const sizeRoll = Math.random();
        const size =
          explicitSize !== null
            ? explicitSize
            : sizeRoll < 0.45
              ? 1
              : sizeRoll < 0.82
                ? 2
                : 4;
        entity.triggerEvent(`betterend:size_${size}`);
        try {
          entity.setDynamicProperty?.("betterend:slime_variant", v);
          entity.setDynamicProperty?.("betterend:slime_size", size);
        } catch {}
      } else if (typeId === "betterend:cubozoa") {
        const v = rid === "sulphur_springs" ? 1 : 0;
        entity.triggerEvent(`betterend:variant_${v}`);
        entity.triggerEvent(`betterend:scale_${Math.floor(Math.random() * 4)}`);
      } else if (typeId === "betterend:end_fish") {
        const v =
          rid === "sulphur_springs"
            ? 5 + Math.floor(Math.random() * 3)
            : Math.floor(Math.random() * 5);
        entity.triggerEvent(`betterend:variant_${v}`);
        entity.triggerEvent(`betterend:scale_${Math.floor(Math.random() * 4)}`);
      } else if (typeId === "betterend:dragonfly" || typeId === "betterend:silk_moth") {
        entity.triggerEvent("betterend:variant_0");
        entity.triggerEvent(`betterend:scale_${Math.floor(Math.random() * 3)}`);
      } else {
        entity.triggerEvent("betterend:variant_0");
      }
    } catch {}
  }

  _spawnBiomeWildlifeNearPlayer(player, dim, loc, regionId) {
    if (!dim || typeof dim.getEntities !== "function" || typeof dim.spawnEntity !== "function") {
      return;
    }
    try {
      const nearby = dim.getEntities({
        location: loc,
        maxDistance: 48,
        families: ["betterend"]
      });
      if (Array.isArray(nearby) && nearby.length >= 10) return;

      const candidates = this._resolveWildlifeForBiome(regionId);
      if (!candidates || candidates.length === 0) return;
      const choice = candidates[Math.floor(Math.random() * candidates.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist = 12 + Math.random() * 14;
      const sx = Math.trunc(loc.x + Math.cos(angle) * dist);
      const sz = Math.trunc(loc.z + Math.sin(angle) * dist);
      const topBlk = dim.getTopmostBlock?.({ x: sx, z: sz }, 120);
      if (!topBlk || topBlk.location.y < 48) return;

      if (choice.mode === "water") {
        // Only spawn aquatic entities when an actual water block exists at or near the surface
        let waterY = null;
        for (let dy = -2; dy <= 1; dy++) {
          const checkBlk = dim.getBlock?.({ x: sx, y: topBlk.location.y + dy, z: sz });
          const tid = String(checkBlk?.typeId ?? "");
          if (tid === "minecraft:water" || tid === "minecraft:flowing_water") {
            waterY = topBlk.location.y + dy;
            break;
          }
        }
        if (waterY === null) return;

        // Java EndFishEntity & CubozoaEntity spawn in schools (AbstractSchoolingFish)!
        const schoolSize =
          choice.entityId === "betterend:end_fish"
            ? 4 + Math.floor(Math.random() * 3)
            : 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < schoolSize; i++) {
          const ox = (Math.random() - 0.5) * 2.5;
          const oz = (Math.random() - 0.5) * 2.5;
          const spawned = dim.spawnEntity(choice.entityId, {
            x: sx + 0.5 + ox,
            y: waterY,
            z: sz + 0.5 + oz
          });
          if (spawned) {
            this._assignEntityBiomeVariant(spawned, regionId);
          }
        }
        return;
      }

      const sy =
        choice.mode === "air"
          ? topBlk.location.y + 2 + Math.floor(Math.random() * 4)
          : topBlk.location.y + 1;

      const spawned = dim.spawnEntity(choice.entityId, { x: sx + 0.5, y: sy, z: sz + 0.5 });
      if (spawned) {
        this._assignEntityBiomeVariant(spawned, regionId);
      }
    } catch {}
  }

  /**
   * Steps authentic BetterEnd entity behaviors for nearby wildlife:
   * - `betterend:end_fish`: Schooling/swarming cohesion (`AbstractSchoolingFish`), underwater bubbles,
   *   and flopping when stranded on dry land (`EndFishEntity.java`).
   * - `betterend:cubozoa`: Schooling cohesion and stinging players on contact with Poison I (`CubozoaEntity.java`).
   * - `betterend:silk_moth`: Pollinating nearby `silk_moth_nest` / `silk_moth_hive` blocks to increase
   *   `betterend:fullness` (`0..3`) (`SilkMothEntity.java`).
   * - `betterend:shadow_walker`: Emitting dark smoke/ash particles (`ShadowWalkerEntity.java`).
   */
  _stepWildlifeBehavior(dim, playerLoc) {
    if (!dim || typeof dim.getEntities !== "function") return;
    try {
      const entities = dim.getEntities({
        location: playerLoc,
        maxDistance: 64,
        families: ["betterend"]
      });
      if (!Array.isArray(entities) || entities.length === 0) return;

      const fishList = [];
      const cubozoaList = [];

      for (const ent of entities) {
        if (!ent || ent.isValid === false) continue;
        let eloc;
        try {
          eloc = ent.location;
        } catch {
          continue;
        }
        if (!eloc) continue;
        const tid = String(ent.typeId ?? "");

        if (tid === "betterend:end_fish") {
          const blk = dim.getBlock?.({
            x: Math.floor(eloc.x),
            y: Math.floor(eloc.y),
            z: Math.floor(eloc.z)
          });
          const btype = String(blk?.typeId ?? "");
          const inWater = btype === "minecraft:water" || btype === "minecraft:flowing_water";
          if (inWater) {
            fishList.push(ent);
            if (Math.random() < 0.25) {
              try {
                dim.spawnParticle?.("minecraft:basic_bubble_particle", eloc);
              } catch {}
            }
          } else if (ent.isOnGround) {
            // Land flopping ONLY when on solid ground (EndFishEntity.java)
            try {
              ent.applyImpulse?.({
                x: (Math.random() - 0.5) * 0.14,
                y: 0.16,
                z: (Math.random() - 0.5) * 0.14
              });
            } catch {}
          } else {
            // Airborne recovery: pull any floating sky-fish from old saves back down or despawn if high in sky
            try {
              if (eloc.y > 92) {
                ent.remove?.();
              } else {
                ent.applyImpulse?.({ x: 0, y: -0.45, z: 0 });
              }
            } catch {}
          }
        } else if (tid === "betterend:cubozoa") {
          const blk = dim.getBlock?.({
            x: Math.floor(eloc.x),
            y: Math.floor(eloc.y),
            z: Math.floor(eloc.z)
          });
          const btype = String(blk?.typeId ?? "");
          const inWater = btype === "minecraft:water" || btype === "minecraft:flowing_water";
          if (inWater) {
            cubozoaList.push(ent);
          } else if (!ent.isOnGround) {
            try {
              if (eloc.y > 92) {
                ent.remove?.();
              } else {
                ent.applyImpulse?.({ x: 0, y: -0.45, z: 0 });
              }
            } catch {}
          }
          // Sting players within 1.35m with Poison (CubozoaEntity.java playerTouch)
          try {
            const nearPlayers = dim.getPlayers?.({ location: eloc, maxDistance: 1.35 }) ?? [];
            for (const p of nearPlayers) {
              p.addEffect?.("poison", 60, { amplifier: 0, showParticles: true });
            }
          } catch {}
        } else if (tid === "betterend:end_slime") {
          if (ent.isOnGround) {
            // Grounded slime hop ONLY when on solid ground
            if (Math.random() < 0.35) {
              try {
                const rot = ent.getRotation?.() ?? { x: 0, y: Math.random() * 360 };
                const yawRad = ((rot.y ?? 0) * Math.PI) / 180;
                ent.applyImpulse?.({
                  x: -Math.sin(yawRad) * 0.18,
                  y: 0.32,
                  z: Math.cos(yawRad) * 0.18
                });
              } catch {}
            }
          } else {
            // Airborne recovery: pull any floating sky-slimes from old saves back down to the island
            try {
              const evel = ent.getVelocity?.() ?? { x: 0, y: 0, z: 0 };
              if (eloc.y > 96) {
                ent.remove?.();
              } else if ((evel.y ?? 0) > 0.05) {
                ent.applyImpulse?.({ x: 0, y: -0.45, z: 0 });
              }
            } catch {}
          }
        } else if (tid === "betterend:shadow_walker") {
          if (Math.random() < 0.4) {
            try {
              dim.spawnParticle?.("minecraft:basic_smoke_particle", {
                x: eloc.x,
                y: eloc.y + 0.9,
                z: eloc.z
              });
            } catch {}
          }
        } else if (tid === "betterend:silk_moth") {
          if (Math.random() < 0.15) {
            const bx = Math.floor(eloc.x);
            const by = Math.floor(eloc.y);
            const bz = Math.floor(eloc.z);
            const offsets = [
              [0, 0, 0],
              [1, 0, 0],
              [-1, 0, 0],
              [0, 1, 0],
              [0, -1, 0],
              [0, 0, 1],
              [0, 0, -1]
            ];
            for (const [dx, dy, dz] of offsets) {
              const blk = dim.getBlock?.({ x: bx + dx, y: by + dy, z: bz + dz });
              const btype = String(blk?.typeId ?? "");
              if (
                btype === "betterend:silk_moth_nest" ||
                btype === "betterend:silk_moth_hive"
              ) {
                try {
                  const states = blk.permutation?.getAllStates?.() ?? {};
                  const fullness = Number(states["betterend:fullness"] ?? 0);
                  if (fullness < 3) {
                    this._setBlockWithStates(dim, blk.location, btype, {
                      ...states,
                      "betterend:fullness": fullness + 1
                    });
                  }
                } catch {}
                break;
              }
            }
          }
        }
      }

      // Horizontal schooling cohesion impulse for underwater End Fish swarms (4..8 fish swimming together)
      if (fishList.length >= 2) {
        const leader = fishList[0];
        const lpos = leader.location;
        for (let i = 1; i < fishList.length; i++) {
          const follower = fishList[i];
          const fpos = follower.location;
          const dx = lpos.x - fpos.x;
          const dz = lpos.z - fpos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 1.8 && dist < 12) {
            try {
              follower.applyImpulse?.({
                x: (dx / dist) * 0.04,
                y: 0,
                z: (dz / dist) * 0.04
              });
            } catch {}
          }
        }
      }

      // Horizontal schooling cohesion impulse for underwater Cubozoa swarms
      if (cubozoaList.length >= 2) {
        const leader = cubozoaList[0];
        const lpos = leader.location;
        for (let i = 1; i < cubozoaList.length; i++) {
          const follower = cubozoaList[i];
          const fpos = follower.location;
          const dx = lpos.x - fpos.x;
          const dz = lpos.z - fpos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 1.8 && dist < 10) {
            try {
              follower.applyImpulse?.({
                x: (dx / dist) * 0.03,
                y: 0,
                z: (dz / dist) * 0.03
              });
            } catch {}
          }
        }
      }
    } catch {}
  }

  /**
   * Cheap per-tick chest check: which BetterEnd Elytra (if any) is worn. The heavier armor-set /
   * effect / legacy-carrier clean-up runs every 10 ticks in `_syncPlayerElytraAndArmor`.
   */
  _refreshElytraVariant(player, pid) {
    // The chest slot only needs re-reading every few ticks: 5 while no elytra is cached (equipping takes
    // longer than that to matter), 4 while one is worn (unequipping still ends the glide within 4 ticks).
    // Doing the two component/equipment lookups on every tick of every player was pure per-tick overhead.
    const cached = this._playerElytraVariant.get(pid) ?? null;
    if (this._fastTick % (cached ? 4 : 5) !== 0) return cached;
    try {
      const equippable =
        player.getComponent?.("minecraft:equippable") ?? player.getComponent?.("equippable");
      const chestId = String(equippable?.getEquipment?.("Chest")?.typeId ?? "");
      if (chestId === "betterend:elytra_armored") this._playerElytraVariant.set(pid, "elytra_armored");
      else if (chestId === "betterend:elytra_crystalite") this._playerElytraVariant.set(pid, "elytra_crystalite");
      else this._playerElytraVariant.delete(pid);
    } catch {}
    return this._playerElytraVariant.get(pid) ?? null;
  }

  /**
   * Drives BetterEnd Armored / Crystalite Elytra flight with the vanilla (Java) fall-flying model:
   * - glide starts with a fresh jump press in mid-air (never automatically while merely falling),
   *   ends on landing or water;
   * - each tick the velocity is recomputed from the *measured* displacement with lift, dive
   *   acceleration and pull-up climbing (`stepElytraGlide`), with BCLib's per-item movement factor
   *   (Armored 0.97, Crystalite 1.0) as horizontal drag;
   * - firework rockets boost for their Java lifetime, fly-into-wall damage and per-second elytra
   *   durability wear match Java.
   */
  _stepElytraFlight(player, pid, variant, dim, loc, view, vel) {
    const previousState = this._playerGlideState.get(pid) ?? { gliding: false, wasJumping: false, airTicks: 0 };
    const lastPos = this._playerLastPos.get(pid);
    this._playerLastPos.set(pid, { x: loc.x, y: loc.y, z: loc.z });

    if (!variant) {
      if (previousState.gliding) this._stopGlideAnimation(player);
      this._playerGlideState.set(pid, { gliding: false, wasJumping: Boolean(player.isJumping), airTicks: 0 });
      this._playerGlidingState.set(pid, false);
      this._playerFireworkTicks.delete(pid);
      this._playerGlideVel.delete(pid);
      return;
    }

    const result = updateGlideState(previousState, {
      onGround: Boolean(player.isOnGround),
      inWater: Boolean(player.isInWater),
      flying: Boolean(player.isFlying),
      jumping: Boolean(player.isJumping)
    });
    this._playerGlideState.set(pid, result.state);
    this._playerGlidingState.set(pid, result.state.gliding);

    if (result.stopped) {
      this._stopGlideAnimation(player);
      this._playerFireworkTicks.delete(pid);
      this._playerGlideVel.delete(pid);
      this._playerGlideTicks.delete(pid);
      this._playerGlideCtl.get(pid)?.reset();
    }
    if (!result.state.gliding) return;

    const engineVelocity = { x: vel.x ?? 0, y: vel.y ?? 0, z: vel.z ?? 0 };
    const displacement =
      lastPos && !result.started
        ? { x: loc.x - lastPos.x, y: loc.y - lastPos.y, z: loc.z - lastPos.z }
        : engineVelocity;
    // Teleports / dimension changes: trust the engine velocity instead of a huge displacement.
    const measured =
      Math.hypot(displacement.x, displacement.y, displacement.z) > 6 ? engineVelocity : displacement;

    let controller = this._playerGlideCtl.get(pid);
    if (!controller) {
      controller = new ElytraGlideController();
      this._playerGlideCtl.set(pid, controller);
    }
    if (result.started) {
      controller.reset();
      this._startGlideAnimation(player);
      this._playerGlideTicks.set(pid, 0);
    }

    const boostLeft = this._playerFireworkTicks.get(pid) ?? 0;
    if (boostLeft > 0) this._playerFireworkTicks.set(pid, boostLeft - 1);

    const step = controller.step({
      measured,
      engineVelocity,
      look: view,
      movementFactor: ELYTRA_MOVEMENT_FACTORS[variant] ?? 0.99,
      boosting: boostLeft > 0,
      started: result.started
    });
    this._playerGlideVel.set(pid, step.model);

    // Java fly-into-wall damage
    if (step.wallDamage > 0) {
      try {
        player.applyDamage?.(step.wallDamage, { cause: "flyIntoWall" });
      } catch {}
    }

    try {
      if (this._fastTick % 5 === 0 || result.started) {
        player.addEffect?.("slow_falling", 12, { amplifier: 0, showParticles: false });
      }
      this._applyPlayerImpulse(player, step.impulse.x, step.impulse.y, step.impulse.z);
      if (variant === "elytra_crystalite" && this._fastTick % 3 === 0) {
        dim.spawnParticle?.("minecraft:endrod", {
          x: loc.x - view.x * 0.5,
          y: loc.y + 0.9,
          z: loc.z - view.z * 0.5
        });
      }
      if (boostLeft > 0 && this._fastTick % 2 === 0) {
        dim.spawnParticle?.("minecraft:basic_flame_particle", {
          x: loc.x - view.x * 0.6,
          y: loc.y + 0.8,
          z: loc.z - view.z * 0.6
        });
      }
    } catch {}

    // Java wears the elytra by one durability point per second of flight.
    const glideTicks = (this._playerGlideTicks.get(pid) ?? 0) + 1;
    this._playerGlideTicks.set(pid, glideTicks);
    if (glideTicks % 20 === 0) this._wearElytra(player);
  }

  _startGlideAnimation(player) {
    try {
      player.playAnimation?.("animation.betterend.player.glide", {
        blendOutTime: 0.2,
        stopExpression: "q.is_on_ground || q.is_in_water"
      });
    } catch {}
  }

  _stopGlideAnimation(player) {
    try {
      player.playAnimation?.("animation.betterend.player.glide_stop", {
        blendOutTime: 0.15,
        stopExpression: "1"
      });
    } catch {}
  }

  _wearElytra(player) {
    try {
      if (player.getGameMode?.() === "creative") return;
      const equippable =
        player.getComponent?.("minecraft:equippable") ?? player.getComponent?.("equippable");
      const chest = equippable?.getEquipment?.("Chest");
      const durability = chest?.getComponent?.("minecraft:durability");
      if (!durability) return;
      durability.damage = Math.min(durability.maxDurability, durability.damage + 1);
      if (durability.damage >= durability.maxDurability) {
        equippable.setEquipment("Chest", undefined);
        player.playSound?.("random.break");
      } else {
        equippable.setEquipment("Chest", chest);
      }
    } catch {}
  }

  /**
   * 1-tick (20Hz) physics loop for:
   * 1. Responsive BetterEnd Elytra (`betterend:elytra_armored` & `betterend:elytra_crystalite`)
   *    aerodynamic gliding + horizontal player gliding posture (`animation.betterend.player.glide`)
   *    while keeping the genuine BetterEnd Elytra item in `Chest` (so its 3D wings attachable
   *    always renders on the player's back).
   * 2. Responsive BetterEnd ladder/vine climbing (`betterend:end_lily_vine`, `betterend:bulb_vine`,
   *    `betterend:jungle_vine`, `betterend:twisted_vine`, `betterend:*_ladder`, etc.).
   */
  _stepFastPlayerPhysics() {
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
      if (!dim || typeof dim.getBlock !== "function") continue;
      const loc = player.location;
      const view = player.getViewDirection?.() ?? { x: 0, y: 0, z: 1 };
      const vel = player.getVelocity?.() ?? { x: 0, y: 0, z: 0 };

      // 1. BetterEnd Elytra: Java-accurate flight model (runtime/equipment/elytra-physics.js)
      this._fastTick += 1;
      const elytraVariant = this._refreshElytraVariant(player, pid);
      this._stepElytraFlight(player, pid, elytraVariant, dim, loc, view, vel);

      // A gliding player cannot climb: skip the four block lookups below for the whole flight.
      if (this._playerGlidingState.get(pid) === true) continue;

      // 2. BetterEnd Ladder & Vine Climbing
      const bx = Math.floor(loc.x);
      const by = Math.floor(loc.y);
      const bz = Math.floor(loc.z);
      const fx = Math.floor(loc.x + (view.x ?? 0) * 0.42);
      const fz = Math.floor(loc.z + (view.z ?? 0) * 0.42);

      let onClimbable = false;
      try {
        const checkCoords = [
          { x: bx, y: by, z: bz },
          { x: bx, y: by + 1, z: bz },
          { x: fx, y: by, z: fz },
          { x: fx, y: by + 1, z: fz }
        ];
        for (const pos of checkCoords) {
          const blk = dim.getBlock(pos);
          if (blk && this._isClimbableBetterEndBlock(blk.typeId)) {
            onClimbable = true;
            break;
          }
        }
      } catch {}

      if (onClimbable) {
        try {
          player.addEffect?.("slow_falling", 8, { amplifier: 0, showParticles: false });
          if (!player.isSneaking && (player.isJumping || (view.y ?? 0) > -0.15)) {
            player.clearVelocity?.();
            this._applyPlayerImpulse(player, (view.x ?? 0) * 0.03, 0.24, (view.z ?? 0) * 0.03);
          } else if (player.isSneaking) {
            player.clearVelocity?.();
            this._applyPlayerImpulse(player, 0, 0.04, 0);
          }
        } catch {}
      }
    }
  }

  _stepLiveWorldTick() {
    this._tickCounter += 1;
    // NOTE: the staged cell-preparation pipeline (generationService.enqueuePlayerApproach /
    // stepPreparationQueue) is deliberately NOT driven from here any more. Native feature rules do
    // all terrain decoration; the pipeline only produced journal records nothing consumed, yet cost
    // a multi-millisecond plan + persistence write + cached artifact per approached 64-block cell,
    // which showed up as periodic hitches (and Watchdog "High memory usage") during Elytra flight.
    // It is still used by the Guidebook teleport and the verification gates.

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

      // Sync Armored/Crystalite Elytra & Crystalite armor abilities
      this._syncPlayerElytraAndArmor(player);

      // Check bouncy blocks & hydrothermal vents under player
      try {
        const below = dim?.getBlock?.({
          x: Math.floor(loc.x),
          y: Math.floor(loc.y) - 1,
          z: Math.floor(loc.z)
        });
        const belowId = String(below?.typeId ?? "");
        const isPlayerGliding =
          Boolean(player.isGliding) || Boolean(this._playerGlidingState.get(pid));
        if (
          belowId.includes("mossy_glowshroom_hymenophore") ||
          belowId.includes("umbrella_tree_membrane") ||
          belowId.includes("gelatine_block")
        ) {
          this._applyPlayerImpulse(player, 0, 0.9, 0);
        } else if (belowId.includes("hydrothermal_vent") && isPlayerGliding) {
          this._applyPlayerImpulse(player, 0, 1.2, 0);
          this._playerGlideSpeed.set(pid, 1.35);
        }
      } catch {}

      if (dimId === "minecraft:the_end") {
        // Cheap shared-map protection test; the hex-biome RegionService.lookup caches ~14 KB per new
        // far cell and is only needed for the Guidebook UI.
        if (isNativeProtectedColumn(loc.x, loc.z)) {
          if (this._tickCounter % 5 === 0) {
            try {
              player.onScreenDisplay?.setActionBar?.(
                "§dBetterEnd §8| §eCentral Dragon Island (Protected <=1024m) §7— Use §bGuidebook §7to visit 27 Outer Biomes!"
              );
            } catch {}
          }
        } else {
          const nativeRegion = this._resolvePlayerRegion(dim, loc);
          const regionId = nativeRegion?.id ?? "foggy_mushroomland";
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

          if (this._tickCounter % 8 === 0) {
            this._spawnBiomeWildlifeNearPlayer(player, dim, loc, regionId);
          }
          if (this._tickCounter % 3 === 0) {
            this._stepWildlifeBehavior(dim, loc);
          }

          // Chunk decoration (chorus clearing, script ponds) runs in the budgeted `_pumpDecorationQueue`.
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

    if (world?.afterEvents?.entitySpawn?.subscribe) {
      world.afterEvents.entitySpawn.subscribe((event) => {
        // Entities can be removed (despawn, our own sky/void clean-up) before this event is handled:
        // touching them then throws InvalidEntityError, so guard every access.
        try {
          const entity = event?.entity;
          if (!entity || entity.isValid === false) return;
          if (!String(entity.typeId ?? "").startsWith("betterend:")) return;
          const loc = entity.location ?? { x: 0, y: 64, z: 0 };
          const region = this._lookupNativeCellRegion(loc.x, loc.z);
          this._assignEntityBiomeVariant(entity, region?.id ?? "foggy_mushroomland");
        } catch {}
      });
    }

    // Java EndSlimeEntity splits into 2..4 half-size child End Slimes of the same biome variant on death!
    if (world?.afterEvents?.entityDie?.subscribe) {
      world.afterEvents.entityDie.subscribe((event) => {
        const dead = event?.deadEntity;
        if (!dead || String(dead.typeId ?? "") !== "betterend:end_slime") return;
        try {
          const dim = dead.dimension;
          const loc = dead.location;
          if (!dim || !loc) return;
          const size = Number(dead.getDynamicProperty?.("betterend:slime_size") ?? 2);
          const variant = Number(dead.getDynamicProperty?.("betterend:slime_variant") ?? 0);
          if (size > 1) {
            const nextSize = Math.max(1, Math.floor(size / 2));
            const count = 2 + Math.floor(Math.random() * 3); // 2..4 smaller slimes
            for (let i = 0; i < count; i++) {
              const ox = ((i % 2) - 0.5) * 0.8;
              const oz = (Math.floor(i / 2) - 0.5) * 0.8;
              const child = dim.spawnEntity?.("betterend:end_slime", {
                x: loc.x + ox,
                y: loc.y + 0.25,
                z: loc.z + oz
              });
              if (child) {
                child.triggerEvent?.(`betterend:variant_${variant}`);
                child.triggerEvent?.(`betterend:size_${nextSize}`);
                child.setDynamicProperty?.("betterend:slime_variant", variant);
                child.setDynamicProperty?.("betterend:slime_size", nextSize);
              }
            }
          }
        } catch {}
      });
    }

    // Java ShadowWalkerEntity applies 60 ticks of Blindness on melee hit unless blocked by Crystalite Helmet!
    if (world?.afterEvents?.entityHurt?.subscribe) {
      world.afterEvents.entityHurt.subscribe((event) => {
        const attacker = event?.damageSource?.damagingEntity;
        const hurt = event?.hurtEntity;
        if (!attacker || !hurt) return;
        const attackerType = String(attacker.typeId ?? "");
        if (attackerType === "betterend:shadow_walker" && String(hurt.typeId ?? "") === "minecraft:player") {
          try {
            const eq =
              hurt.getComponent?.("minecraft:equippable") ?? hurt.getComponent?.("equippable");
            const headId = String(eq?.getEquipment?.("Head")?.typeId ?? "");
            if (headId !== "betterend:crystalite_helmet") {
              hurt.addEffect?.("blindness", 60, { amplifier: 0, showParticles: true });
            }
          } catch {}
        }
      });
    }

    // Catching End Fish or Cubozoa with a Water Bucket (EndFishEntity.java / CubozoaEntity.java)
    if (world?.afterEvents?.playerInteractWithEntity?.subscribe) {
      world.afterEvents.playerInteractWithEntity.subscribe((event) => {
        const player = event?.player;
        const target = event?.target;
        const item = event?.itemStack;
        if (!player || !target || !item) return;
        const targetId = String(target.typeId ?? "");
        if (
          item.typeId === "minecraft:water_bucket" &&
          (targetId === "betterend:end_fish" || targetId === "betterend:cubozoa")
        ) {
          try {
            const ItemStack = this.serverModule?.ItemStack;
            const bucketId =
              targetId === "betterend:cubozoa"
                ? "betterend:bucket_cubozoa"
                : "betterend:bucket_end_fish";
            const eq =
              player.getComponent?.("minecraft:equippable") ?? player.getComponent?.("equippable");
            if (eq && ItemStack) {
              eq.setEquipment("Mainhand", new ItemStack(bucketId, 1));
              target.remove?.();
              player.playSound?.("bucket.fill_fish");
            }
          } catch {}
        } else if (item.typeId === "betterend:blossom_berry" && targetId === "betterend:silk_moth") {
          try {
            const dim = target.dimension;
            const loc = target.location;
            if (dim && loc) {
              dim.spawnParticle?.("minecraft:heart_particle", {
                x: loc.x,
                y: loc.y + 0.6,
                z: loc.z
              });
              const baby = dim.spawnEntity?.("betterend:silk_moth", {
                x: loc.x + 0.4,
                y: loc.y + 0.2,
                z: loc.z + 0.4
              });
              if (baby) {
                baby.triggerEvent?.("betterend:scale_0");
              }
            }
          } catch {}
        }
      });
    }

    if (world?.afterEvents?.itemUse?.subscribe) {
      world.afterEvents.itemUse.subscribe((event) => {
        const itemId = String(event?.itemStack?.typeId ?? "");
        const player = event?.source;
        if (!player) return;
        const pid = player.id ?? player.name ?? "player";
        if (itemId === "betterend:guidebook") {
          this.presentationService.openGuidebook?.(pid);
          this._openLiveGuidebookUi(player);
        } else if (itemId === "betterend:elytra_armored" || itemId === "betterend:elytra_crystalite") {
          this.equipmentService.equipCustomElytra?.({
            playerId: pid,
            itemId
          });
          this._equipBetterEndElytraCarrier(player, itemId);
        } else if (
          (itemId === "minecraft:firework_rocket" || itemId === "minecraft:fireworks") &&
          this._playerGlidingState.get(pid)
        ) {
          // Vanilla: a firework rocket only boosts while gliding. The boost lasts its Java lifetime.
          this._playerFireworkTicks.set(pid, fireworkBoostTicks(1));
          try {
            player.playSound?.("firework.launch");
          } catch {}
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
            const spawned = dim?.spawnEntity?.(entityId, {
              x: loc.x + 0.5,
              y: loc.y + 1,
              z: loc.z + 0.5
            });
            if (spawned) {
              const region = this._lookupNativeCellRegion(loc.x, loc.z);
              this._assignEntityBiomeVariant(spawned, region?.id ?? "foggy_mushroomland");
            }
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
        this._stepFastPlayerPhysics();
      }, 1);
      system.runInterval(() => {
        this._stepLiveWorldTick();
      }, 10);
      system.runInterval(() => {
        try {
          const players = world?.getAllPlayers?.() ?? [];
          this._pumpDecorationQueue(players);
        } catch {}
      }, 2);
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
