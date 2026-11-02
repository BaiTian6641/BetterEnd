/**
 * BetterEnd Bedrock 26.40 — Runtime Bootstrap & Event Wiring (`bootstrap.js`).
 *
 * Pure ES module with zero Node.js imports and zero static experimental graphics
 * imports. Shared by both the Stable (`main-stable.js`) and Experimental Vibrant Visuals
 * (`main-experimental-vv.js`) entrypoints.
 */

import { InMemoryWorldPropertyAdapter, PersistenceStore } from "../persistence/store.js";
import { RegionService } from "../regions/region-service.js";
import { GenerationService } from "../generation/generation-service.js";
import { StationsService } from "../stations/stations-service.js";
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

    const adapter =
      worldAdapter ??
      (serverModule?.world && typeof serverModule.world.getDynamicProperty === "function"
        ? serverModule.world
        : new InMemoryWorldPropertyAdapter());

    this.store = new PersistenceStore({
      worldAdapter: adapter,
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
      tickingAreaManager: serverModule?.world?.tickingAreaManager ?? null
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
   * Initializes world seed, recovers interrupted station and generation transactions,
   * reconciles leaked `betterend:prep_*` ticking areas and `betterend:region_fog_*` fogs,
   * and wires runtime tick intervals.
   */
  async initializeWorld(worldInstance = null) {
    const world = worldInstance ?? this.serverModule?.world ?? null;

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

  /**
   * Attaches event listeners to `@minecraft/server` (`system.beforeEvents.startup`,
   * `world.afterEvents.worldLoad`, `system.afterEvents.scriptEventReceive`, and bounded intervals).
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

    if (system?.afterEvents?.scriptEventReceive?.subscribe) {
      system.afterEvents.scriptEventReceive.subscribe((event) => {
        if (event?.id === QUERY_CHANNEL_ID) {
          this.compatibilityService.handleScriptEvent(event.id, event.message);
        }
      });
    }

    if (system && typeof system.runInterval === "function") {
      system.runInterval(() => {
        this.generationService.stepPreparationQueue({ maxCells: 1 });
      }, 4);
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
