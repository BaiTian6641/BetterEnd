/**
 * BetterEnd Bedrock 26.40 — Per-Player Presentation, Audio/Fog, Optional VV Graphics
 * & Progression Discovery Service (`VIS-002`, `VIS-003`, `PROG-001`)
 *
 * Implements:
 * - Per-player region presentation state machine with border hysteresis
 *   (minimum residency ticks before switching music/fog)
 * - Owned `/fog` stack entry reconciliation (`betterend:region_fog_<regionId>`)
 *   on join, dimension change, death, and region transition without touching
 *   foreign add-on fog IDs
 * - Regional music & ambient loops via `SoundInstance` (`stop()` on transition)
 *   and localized region particles (`firefly`, `amber_sphere`, `geyser`,
 *   `smaragdant`, `snow_fog`, `sulphur`, `tenanea_petal`, `jungle_spore`, `black_spore`)
 * - Optional dependency-injected graphics adapter hook for `@minecraft/server-graphics`
 *   `1.0.0-beta` (`getPlayerAtmospherics`, `getPlayerColorGrading`,
 *   `getPlayerLighting`, `getPlayerWater` with property-specific `reset*()` methods)
 *   with ZERO static beta imports
 * - Bedrock-native progression/discovery tracking (`PROG-001`) matching BetterEnd's
 *   36 advancements
 *
 * Pure ES module with zero Node-specific imports.
 */

export const OWNED_FOG_USER_ID_PREFIX = 'betterend:region_fog_';
export const DEFAULT_HYSTERESIS_TICKS = 40;

export const REGION_PARTICLE_FAMILIES = Object.freeze([
  'firefly',
  'amber_sphere',
  'geyser',
  'smaragdant',
  'snow_fog',
  'sulphur',
  'tenanea_petal',
  'jungle_spore',
  'black_spore',
]);

export const REGION_PRESENTATION_PRESETS = Object.freeze({
  foggy_mushroomland: Object.freeze({
    regionId: 'foggy_mushroomland',
    fullId: 'betterend:foggy_mushroomland',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_foggy_mushroomland',
    fogUserId: 'betterend:region_fog_foggy_mushroomland',
    fogColor: '#292246',
    waterColor: '#75cb89',
    fogDensity: 3.0,
    musicTrack: 'betterend.music.forest',
    ambientLoop: 'betterend.ambient.foggy_mushroomland',
    particles: Object.freeze(['firefly']),
  }),
  chorus_forest: Object.freeze({
    regionId: 'chorus_forest',
    fullId: 'betterend:chorus_forest',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_chorus_forest',
    fogUserId: 'betterend:region_fog_chorus_forest',
    fogColor: '#572e58',
    waterColor: '#4a2846',
    fogDensity: 1.5,
    musicTrack: 'betterend.music.dark',
    ambientLoop: 'betterend.ambient.chorus_forest',
    particles: Object.freeze(['black_spore']),
  }),
  dust_wastelands: Object.freeze({
    regionId: 'dust_wastelands',
    fullId: 'betterend:dust_wastelands',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_dust_wastelands',
    fogUserId: 'betterend:region_fog_dust_wastelands',
    fogColor: '#e2d9a4',
    waterColor: '#ffe89f',
    fogDensity: 2.0,
    musicTrack: 'betterend.music.openpace',
    ambientLoop: 'betterend.ambient.dust_wastelands',
    particles: Object.freeze(['snow_fog']),
  }),
  megalake: Object.freeze({
    regionId: 'megalake',
    fullId: 'betterend:megalake',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_megalake',
    fogUserId: 'betterend:region_fog_megalake',
    fogColor: '#b1e2ff',
    waterColor: '#60a2ff',
    fogDensity: 1.75,
    musicTrack: 'betterend.music.water',
    ambientLoop: 'betterend.ambient.megalake',
    particles: Object.freeze(['firefly']),
  }),
  megalake_grove: Object.freeze({
    regionId: 'megalake_grove',
    fullId: 'betterend:megalake_grove',
    layer: 'sub_region',
    parentRegion: 'megalake',
    fogDefinitionId: 'betterend:fog_megalake_grove',
    fogUserId: 'betterend:region_fog_megalake_grove',
    fogColor: '#b1e2ff',
    waterColor: '#60a2ff',
    fogDensity: 2.0,
    musicTrack: 'betterend.music.water',
    ambientLoop: 'betterend.ambient.megalake_grove',
    particles: Object.freeze(['firefly']),
  }),
  crystal_mountains: Object.freeze({
    regionId: 'crystal_mountains',
    fullId: 'betterend:crystal_mountains',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_crystal_mountains',
    fogUserId: 'betterend:region_fog_crystal_mountains',
    fogColor: '#a0c5ea',
    waterColor: '#3f76e4',
    fogDensity: 1.0,
    musicTrack: 'betterend.music.openpace',
    ambientLoop: 'betterend.ambient.caves',
    particles: Object.freeze(['smaragdant']),
  }),
  painted_mountains: Object.freeze({
    regionId: 'painted_mountains',
    fullId: 'betterend:painted_mountains',
    layer: 'sub_region',
    parentRegion: 'dust_wastelands',
    fogDefinitionId: 'betterend:fog_painted_mountains',
    fogUserId: 'betterend:region_fog_painted_mountains',
    fogColor: '#e2d9a4',
    waterColor: '#ffe89f',
    fogDensity: 2.0,
    musicTrack: 'betterend.music.openpace',
    ambientLoop: 'betterend.ambient.dust_wastelands',
    particles: Object.freeze(['amber_sphere']),
  }),
  shadow_forest: Object.freeze({
    regionId: 'shadow_forest',
    fullId: 'betterend:shadow_forest',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_shadow_forest',
    fogUserId: 'betterend:region_fog_shadow_forest',
    fogColor: '#000000',
    waterColor: '#2a2564',
    fogDensity: 2.5,
    musicTrack: 'betterend.music.dark',
    ambientLoop: 'betterend.ambient.shadow_forest',
    particles: Object.freeze(['black_spore']),
  }),
  amber_land: Object.freeze({
    regionId: 'amber_land',
    fullId: 'betterend:amber_land',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_amber_land',
    fogUserId: 'betterend:region_fog_amber_land',
    fogColor: '#ff9500',
    waterColor: '#917777',
    fogDensity: 2.0,
    musicTrack: 'betterend.music.forest',
    ambientLoop: 'betterend.ambient.amber_land',
    particles: Object.freeze(['amber_sphere']),
  }),
  blossoming_spires: Object.freeze({
    regionId: 'blossoming_spires',
    fullId: 'betterend:blossoming_spires',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_blossoming_spires',
    fogUserId: 'betterend:region_fog_blossoming_spires',
    fogColor: '#968ea2',
    waterColor: '#3f76e4',
    fogDensity: 1.7,
    musicTrack: 'betterend.music.forest',
    ambientLoop: 'betterend.ambient.blossoming_spires',
    particles: Object.freeze(['tenanea_petal']),
  }),
  sulphur_springs: Object.freeze({
    regionId: 'sulphur_springs',
    fullId: 'betterend:sulphur_springs',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_sulphur_springs',
    fogUserId: 'betterend:region_fog_sulphur_springs',
    fogColor: '#cfbe2e',
    waterColor: '#18f491',
    fogDensity: 1.5,
    musicTrack: 'betterend.music.openpace',
    ambientLoop: 'betterend.ambient.sulphur_springs',
    particles: Object.freeze(['sulphur', 'geyser']),
  }),
  umbrella_jungle: Object.freeze({
    regionId: 'umbrella_jungle',
    fullId: 'betterend:umbrella_jungle',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_umbrella_jungle',
    fogUserId: 'betterend:region_fog_umbrella_jungle',
    fogColor: '#57dd55',
    waterColor: '#77d5b8',
    fogDensity: 2.0,
    musicTrack: 'betterend.music.forest',
    ambientLoop: 'betterend.ambient.umbrella_jungle',
    particles: Object.freeze(['jungle_spore']),
  }),
  glowing_grasslands: Object.freeze({
    regionId: 'glowing_grasslands',
    fullId: 'betterend:glowing_grasslands',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_glowing_grasslands',
    fogUserId: 'betterend:region_fog_glowing_grasslands',
    fogColor: '#63f3ee',
    waterColor: '#5cbac0',
    fogDensity: 1.3,
    musicTrack: 'betterend.music.openpace',
    ambientLoop: 'betterend.ambient.glowing_grasslands',
    particles: Object.freeze(['firefly']),
  }),
  dragon_graveyards: Object.freeze({
    regionId: 'dragon_graveyards',
    fullId: 'betterend:dragon_graveyards',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_dragon_graveyards',
    fogUserId: 'betterend:region_fog_dragon_graveyards',
    fogColor: '#f42d4b',
    waterColor: '#cb5167',
    fogDensity: 1.3,
    musicTrack: 'betterend.music.dark',
    ambientLoop: 'betterend.ambient.glowing_grasslands',
    particles: Object.freeze(['firefly', 'black_spore']),
  }),
  dry_shrubland: Object.freeze({
    regionId: 'dry_shrubland',
    fullId: 'betterend:dry_shrubland',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_dry_shrubland',
    fogUserId: 'betterend:region_fog_dry_shrubland',
    fogColor: '#d35f2b',
    waterColor: '#3f76e4',
    fogDensity: 1.0,
    musicTrack: 'betterend.music.openpace',
    ambientLoop: 'betterend.ambient.dust_wastelands',
    particles: Object.freeze(['amber_sphere']),
  }),
  lantern_woods: Object.freeze({
    regionId: 'lantern_woods',
    fullId: 'betterend:lantern_woods',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_lantern_woods',
    fogUserId: 'betterend:region_fog_lantern_woods',
    fogColor: '#bd4b76',
    waterColor: '#ab7b88',
    fogDensity: 1.1,
    musicTrack: 'betterend.music.forest',
    ambientLoop: 'betterend.ambient.lantern_woods',
    particles: Object.freeze(['firefly', 'amber_sphere']),
  }),
  neon_oasis: Object.freeze({
    regionId: 'neon_oasis',
    fullId: 'betterend:neon_oasis',
    layer: 'sub_region',
    parentRegion: 'dust_wastelands',
    fogDefinitionId: 'betterend:fog_neon_oasis',
    fogUserId: 'betterend:region_fog_neon_oasis',
    fogColor: '#e2d9a4',
    waterColor: '#6aca53',
    fogDensity: 2.0,
    musicTrack: 'betterend.music.water',
    ambientLoop: 'betterend.ambient.dust_wastelands',
    particles: Object.freeze(['firefly']),
  }),
  umbra_valley: Object.freeze({
    regionId: 'umbra_valley',
    fullId: 'betterend:umbra_valley',
    layer: 'land',
    fogDefinitionId: 'betterend:fog_umbra_valley',
    fogUserId: 'betterend:region_fog_umbra_valley',
    fogColor: '#646464',
    waterColor: '#45787e',
    fogDensity: 1.0,
    musicTrack: 'betterend.music.umbra_valley',
    ambientLoop: 'betterend.ambient.umbra_valley',
    particles: Object.freeze(['amber_sphere']),
  }),
  ice_starfield: Object.freeze({
    regionId: 'ice_starfield',
    fullId: 'betterend:ice_starfield',
    layer: 'aerial',
    fogDefinitionId: 'betterend:fog_ice_starfield',
    fogUserId: 'betterend:region_fog_ice_starfield',
    fogColor: '#e0e1fe',
    waterColor: '#3f76e4',
    fogDensity: 2.2,
    musicTrack: 'betterend.music.openpace',
    ambientLoop: 'betterend.ambient.caves',
    particles: Object.freeze(['snow_fog']),
  }),
  flower_islets: Object.freeze({
    regionId: 'flower_islets',
    fullId: 'betterend:flower_islets',
    layer: 'aerial',
    fogDefinitionId: 'betterend:fog_flower_islets',
    fogUserId: 'betterend:region_fog_flower_islets',
    fogColor: '#bd4b76',
    waterColor: '#ab7b88',
    fogDensity: 1.4,
    musicTrack: 'betterend.music.forest',
    ambientLoop: 'betterend.ambient.lantern_woods',
    particles: Object.freeze(['tenanea_petal']),
  }),
  waterfall_ponds: Object.freeze({
    regionId: 'waterfall_ponds',
    fullId: 'betterend:waterfall_ponds',
    layer: 'aerial',
    fogDefinitionId: 'betterend:fog_waterfall_ponds',
    fogUserId: 'betterend:region_fog_waterfall_ponds',
    fogColor: '#63f3ee',
    waterColor: '#60a2ff',
    fogDensity: 1.5,
    musicTrack: 'betterend.music.water',
    ambientLoop: 'betterend.ambient.megalake',
    particles: Object.freeze(['firefly', 'geyser']),
  }),
  empty_end_cave: Object.freeze({
    regionId: 'empty_end_cave',
    fullId: 'betterend:empty_end_cave',
    layer: 'cave',
    fogDefinitionId: 'betterend:fog_empty_end_cave',
    fogUserId: 'betterend:region_fog_empty_end_cave',
    fogColor: '#a080a0',
    waterColor: '#3f76e4',
    fogDensity: 2.0,
    musicTrack: 'betterend.music.caves',
    ambientLoop: 'betterend.ambient.caves',
    particles: Object.freeze(['black_spore']),
  }),
  empty_smaragdant_cave: Object.freeze({
    regionId: 'empty_smaragdant_cave',
    fullId: 'betterend:empty_smaragdant_cave',
    layer: 'cave',
    fogDefinitionId: 'betterend:fog_empty_smaragdant_cave',
    fogUserId: 'betterend:region_fog_empty_smaragdant_cave',
    fogColor: '#004f58',
    waterColor: '#1f1c84',
    fogDensity: 2.0,
    musicTrack: 'betterend.music.caves',
    ambientLoop: 'betterend.ambient.caves',
    particles: Object.freeze(['smaragdant']),
  }),
  lush_smaragdant_cave: Object.freeze({
    regionId: 'lush_smaragdant_cave',
    fullId: 'betterend:lush_smaragdant_cave',
    layer: 'cave',
    fogDefinitionId: 'betterend:fog_lush_smaragdant_cave',
    fogUserId: 'betterend:region_fog_lush_smaragdant_cave',
    fogColor: '#004f58',
    waterColor: '#1f1c84',
    fogDensity: 2.0,
    musicTrack: 'betterend.music.caves',
    ambientLoop: 'betterend.ambient.caves',
    particles: Object.freeze(['smaragdant']),
  }),
  empty_aurora_cave: Object.freeze({
    regionId: 'empty_aurora_cave',
    fullId: 'betterend:empty_aurora_cave',
    layer: 'cave',
    fogDefinitionId: 'betterend:fog_empty_aurora_cave',
    fogUserId: 'betterend:region_fog_empty_aurora_cave',
    fogColor: '#962897',
    waterColor: '#ba59ef',
    fogDensity: 2.0,
    musicTrack: 'betterend.music.caves',
    ambientLoop: 'betterend.ambient.caves',
    particles: Object.freeze(['amber_sphere']),
  }),
  lush_aurora_cave: Object.freeze({
    regionId: 'lush_aurora_cave',
    fullId: 'betterend:lush_aurora_cave',
    layer: 'cave',
    fogDefinitionId: 'betterend:fog_lush_aurora_cave',
    fogUserId: 'betterend:region_fog_lush_aurora_cave',
    fogColor: '#962897',
    waterColor: '#ba59ef',
    fogDensity: 2.0,
    musicTrack: 'betterend.music.caves',
    ambientLoop: 'betterend.ambient.caves',
    particles: Object.freeze(['amber_sphere', 'firefly']),
  }),
  jade_cave: Object.freeze({
    regionId: 'jade_cave',
    fullId: 'betterend:jade_cave',
    layer: 'cave',
    fogDefinitionId: 'betterend:fog_jade_cave',
    fogUserId: 'betterend:region_fog_jade_cave',
    fogColor: '#76c761',
    waterColor: '#5ba083',
    fogDensity: 2.0,
    musicTrack: 'betterend.music.caves',
    ambientLoop: 'betterend.ambient.caves',
    particles: Object.freeze(['smaragdant']),
  }),
});

/**
 * All 36 BetterEnd Progression / Discovery Advancements (`PROG-001`).
 */
export const BETTEREND_ADVANCEMENTS = Object.freeze([
  { id: 'betterend:root', shortId: 'root', category: 'progression', title: 'BetterEnd' },
  { id: 'betterend:enter_end', shortId: 'enter_end', category: 'exploration', title: 'Into the BetterEnd' },
  { id: 'betterend:amber_land', shortId: 'amber_land', category: 'exploration', title: 'Golden Horizon' },
  { id: 'betterend:blossoming_spires', shortId: 'blossoming_spires', category: 'exploration', title: 'Blossoming Spires' },
  { id: 'betterend:all_the_biomes', shortId: 'all_the_biomes', category: 'exploration', title: 'End Explorer' },
  { id: 'betterend:village', shortId: 'village', category: 'exploration', title: 'Ancient End Village' },
  { id: 'betterend:end_stone_smelter', shortId: 'end_stone_smelter', category: 'stations', title: 'High-Heat Alloying' },
  { id: 'betterend:thallasium', shortId: 'thallasium', category: 'materials', title: 'Blue Metal of the End' },
  { id: 'betterend:thallasium_anvil', shortId: 'thallasium_anvil', category: 'stations', title: 'Thallasium Forging' },
  { id: 'betterend:thallasium_plate', shortId: 'thallasium_plate', category: 'materials', title: 'Thallasium Plate' },
  { id: 'betterend:thallasium_tool_head', shortId: 'thallasium_tool_head', category: 'equipment', title: 'Thallasium Tool Head' },
  { id: 'betterend:thallasium_tool', shortId: 'thallasium_tool', category: 'equipment', title: 'Thallasium Toolsmith' },
  { id: 'betterend:thallasium_armor', shortId: 'thallasium_armor', category: 'equipment', title: 'Thallasium Protection' },
  { id: 'betterend:terminite', shortId: 'terminite', category: 'materials', title: 'Ender-Infused Alloy' },
  { id: 'betterend:terminite_anvil', shortId: 'terminite_anvil', category: 'stations', title: 'Terminite Forging' },
  { id: 'betterend:terminite_plate', shortId: 'terminite_plate', category: 'materials', title: 'Terminite Plate' },
  { id: 'betterend:terminite_tool_head', shortId: 'terminite_tool_head', category: 'equipment', title: 'Terminite Tool Head' },
  { id: 'betterend:terminite_tool', shortId: 'terminite_tool', category: 'equipment', title: 'Terminite Toolsmith' },
  { id: 'betterend:terminite_armor', shortId: 'terminite_armor', category: 'equipment', title: 'Terminite Protection' },
  { id: 'betterend:aeternium', shortId: 'aeternium', category: 'materials', title: 'Eternal Alloy' },
  { id: 'betterend:aeternium_anvil', shortId: 'aeternium_anvil', category: 'stations', title: 'Master Anvil' },
  { id: 'betterend:aeternium_plate', shortId: 'aeternium_plate', category: 'materials', title: 'Aeternium Plate' },
  { id: 'betterend:aeternium_tool_head', shortId: 'aeternium_tool_head', category: 'equipment', title: 'Aeternium Forged Head' },
  { id: 'betterend:aeternium_hammer_head', shortId: 'aeternium_hammer_head', category: 'equipment', title: 'Heavy Aeternium Head' },
  { id: 'betterend:aeternium_hammer', shortId: 'aeternium_hammer', category: 'equipment', title: 'World Breaker' },
  { id: 'betterend:aeternium_tool', shortId: 'aeternium_tool', category: 'equipment', title: 'Aeternium Toolsmith' },
  { id: 'betterend:aeternium_armor', shortId: 'aeternium_armor', category: 'equipment', title: 'Aeternium Bastion' },
  { id: 'betterend:hammer', shortId: 'hammer', category: 'equipment', title: 'Heavy Hitter' },
  { id: 'betterend:infusion', shortId: 'infusion', category: 'rituals', title: 'Pedestal Ritualist' },
  { id: 'betterend:infusion_finished', shortId: 'infusion_finished', category: 'rituals', title: 'Infusion Complete' },
  { id: 'betterend:enchanted_petal', shortId: 'enchanted_petal', category: 'rituals', title: 'Enchanted Hydralux Petal' },
  { id: 'betterend:crystalite_armor', shortId: 'crystalite_armor', category: 'equipment', title: 'Crystalite Ascension' },
  { id: 'betterend:elytra_armored', shortId: 'elytra_armored', category: 'equipment', title: 'Armored Wings' },
  { id: 'betterend:elytra_crystalite', shortId: 'elytra_crystalite', category: 'equipment', title: 'Crystalite Wings' },
  { id: 'betterend:respawn_obelisk', shortId: 'respawn_obelisk', category: 'transport', title: 'Anchored in the End' },
  { id: 'betterend:eternal_portal', shortId: 'eternal_portal', category: 'transport', title: 'Eternal Gateway' },
]);

function normalizeRegionKey(regionId) {
  if (!regionId) return null;
  const clean = String(regionId).replace(/^betterend_bedrock:/, '').replace(/^betterend:/, '').toLowerCase();
  return Object.hasOwn(REGION_PRESENTATION_PRESETS, clean) ? clean : null;
}

/**
 * Lightweight `SoundInstance` handle supporting `.stop()` on region transition.
 */
export class SoundInstanceHandle {
  constructor({ soundId, playerId, category = 'music', startedAtTick = 0 }) {
    this.soundId = soundId;
    this.playerId = playerId;
    this.category = category;
    this.startedAtTick = startedAtTick;
    this.isPlaying = true;
    this.stoppedAtTick = null;
  }

  stop(currentTick = 0) {
    if (this.isPlaying) {
      this.isPlaying = false;
      this.stoppedAtTick = currentTick;
    }
  }
}

/**
 * Authoritative Per-Player Presentation & Progression Service (`VIS-002`, `VIS-003`, `PROG-001`).
 */
export class PresentationService {
  constructor(options = {}) {
    this.minResidencyTicks = Number(options.minResidencyTicks ?? DEFAULT_HYSTERESIS_TICKS);
    // Optional dependency-injected `@minecraft/server-graphics` 1.0.0-beta module
    this.graphicsModule = options.graphicsModule ?? null;
    this.advancements = BETTEREND_ADVANCEMENTS;

    // Map of playerId -> player presentation state
    this._playerStates = new Map();
    // Map of playerId -> progression state
    this._playerProgression = new Map();
  }

  _getOrCreatePlayerState(playerId, initialFogStack = []) {
    const id = String(playerId);
    let state = this._playerStates.get(id);
    if (!state) {
      state = {
        playerId: id,
        dimension: 'minecraft:the_end',
        activeRegion: null,
        candidateRegion: null,
        candidateResidencyTicks: 0,
        fogStack: initialFogStack.map(entry =>
          typeof entry === 'string'
            ? { fogId: entry, userProvidedId: entry }
            : { ...entry },
        ),
        musicInstance: null,
        ambientInstance: null,
        stoppedSounds: [],
        emittedParticles: [],
        graphicsOverrides: {
          active: false,
          regionId: null,
          resetCalls: [],
        },
        epoch: 0,
      };
      this._playerStates.set(id, state);
    }
    return state;
  }

  /**
   * Reconciles a player's `/fog` stack on join, reconnect, dimension change,
   * death/respawn, or region transition:
   * - Removes ONLY owned `betterend:region_fog_*` entries
   * - Leaves all foreign add-on fog IDs (e.g. `abyssal_ascent:*`) untouched
   * - Pushes the new active region's fog entry if inside a BetterEnd region
   */
  reconcilePlayerFogStack(playerId, { targetRegion = null, existingFogStack = null } = {}) {
    const state = this._getOrCreatePlayerState(playerId, existingFogStack ?? []);
    if (Array.isArray(existingFogStack)) {
      state.fogStack = existingFogStack.map(entry =>
        typeof entry === 'string'
          ? { fogId: entry, userProvidedId: entry }
          : { ...entry },
      );
    }

    const removedOwnedFogs = [];
    const preservedForeignFogs = [];

    for (const entry of state.fogStack) {
      const userId = String(entry.userProvidedId ?? entry.fogId ?? '');
      if (userId.startsWith(OWNED_FOG_USER_ID_PREFIX)) {
        removedOwnedFogs.push(entry);
      } else {
        preservedForeignFogs.push(entry);
      }
    }

    state.fogStack = [...preservedForeignFogs];

    const regionKey = normalizeRegionKey(targetRegion);
    let pushedFog = null;
    if (regionKey) {
      const preset = REGION_PRESENTATION_PRESETS[regionKey];
      pushedFog = {
        fogId: preset.fogDefinitionId,
        userProvidedId: preset.fogUserId,
      };
      state.fogStack.push(pushedFog);
    }

    return {
      playerId: state.playerId,
      removedOwnedFogs,
      preservedForeignFogs: [...preservedForeignFogs],
      pushedFog,
      fogStack: state.fogStack.map(e => ({ ...e })),
    };
  }

  /**
   * Updates a player's regional presentation state for one tick or interval,
   * applying border hysteresis (`minResidencyTicks`) before switching fog,
   * music, ambient loops, particles, and optional VV graphics overrides.
   */
  updatePlayerPresentation({
    playerId,
    dimension = 'minecraft:the_end',
    regionId,
    ticks = 1,
    currentTick = 0,
    immediate = false,
    biomeType = 'minecraft:the_end',
    playerHandle = null,
  }) {
    const state = this._getOrCreatePlayerState(playerId);
    const normDim = String(dimension).includes(':') ? dimension : `minecraft:${dimension}`;
    const elapsedTicks = Math.max(1, Math.floor(Number(ticks) || 1));

    // If leaving the End, clean up owned fog, audio, and graphics overrides immediately
    if (normDim !== 'minecraft:the_end') {
      state.dimension = normDim;
      state.activeRegion = null;
      state.candidateRegion = null;
      state.candidateResidencyTicks = 0;
      this._stopPlayerAudio(state, currentTick);
      this._resetPlayerGraphicsOverrides(state, biomeType, playerHandle);
      const fogRec = this.reconcilePlayerFogStack(playerId, { targetRegion: null });
      return {
        playerId: state.playerId,
        dimension: normDim,
        transitioned: true,
        activeRegion: null,
        fogStack: fogRec.fogStack,
      };
    }

    state.dimension = normDim;
    const targetKey = normalizeRegionKey(regionId);
    if (!targetKey) {
      return {
        playerId: state.playerId,
        dimension: normDim,
        transitioned: false,
        activeRegion: state.activeRegion,
      };
    }

    // First entry into the End or explicit immediate reconciliation (join/respawn)
    const shouldSwitchImmediately = immediate || state.activeRegion === null;

    if (state.activeRegion === targetKey && !immediate) {
      state.candidateRegion = null;
      state.candidateResidencyTicks = 0;
      const preset = REGION_PRESENTATION_PRESETS[targetKey];
      const particles = [...preset.particles];
      state.emittedParticles = particles;
      return {
        playerId: state.playerId,
        dimension: normDim,
        transitioned: false,
        activeRegion: state.activeRegion,
        candidateRegion: null,
        candidateResidencyTicks: 0,
        fogStack: state.fogStack.map(e => ({ ...e })),
        musicSoundId: state.musicInstance?.soundId ?? null,
        ambientSoundId: state.ambientInstance?.soundId ?? null,
        particles,
      };
    }

    if (!shouldSwitchImmediately) {
      if (state.candidateRegion !== targetKey) {
        state.candidateRegion = targetKey;
        state.candidateResidencyTicks = elapsedTicks;
      } else {
        state.candidateResidencyTicks += elapsedTicks;
      }

      if (state.candidateResidencyTicks < this.minResidencyTicks) {
        const currentPreset = REGION_PRESENTATION_PRESETS[state.activeRegion];
        return {
          playerId: state.playerId,
          dimension: normDim,
          transitioned: false,
          hysteresisPending: true,
          activeRegion: state.activeRegion,
          candidateRegion: state.candidateRegion,
          candidateResidencyTicks: state.candidateResidencyTicks,
          requiredResidencyTicks: this.minResidencyTicks,
          fogStack: state.fogStack.map(e => ({ ...e })),
          musicSoundId: state.musicInstance?.soundId ?? null,
          ambientSoundId: state.ambientInstance?.soundId ?? null,
          particles: currentPreset ? [...currentPreset.particles] : [],
        };
      }
    }

    // Hysteresis threshold met (or immediate): transition to targetKey
    const previousRegion = state.activeRegion;
    state.activeRegion = targetKey;
    state.candidateRegion = null;
    state.candidateResidencyTicks = 0;
    state.epoch += 1;

    const preset = REGION_PRESENTATION_PRESETS[targetKey];
    const fogResult = this.reconcilePlayerFogStack(playerId, { targetRegion: targetKey });

    // Stop previous SoundInstances and start new regional loops
    this._stopPlayerAudio(state, currentTick);
    state.musicInstance = new SoundInstanceHandle({
      soundId: preset.musicTrack,
      playerId: state.playerId,
      category: 'music',
      startedAtTick: currentTick,
    });
    state.ambientInstance = new SoundInstanceHandle({
      soundId: preset.ambientLoop,
      playerId: state.playerId,
      category: 'ambient',
      startedAtTick: currentTick,
    });

    state.emittedParticles = [...preset.particles];

    // Apply optional `@minecraft/server-graphics` 1.0.0-beta per-player overrides if injected
    this._applyPlayerGraphicsOverrides(state, preset, biomeType, playerHandle);

    // Record biome discovery for progression (`PROG-001`)
    this.recordRegionDiscovery(playerId, preset.fullId);

    return {
      playerId: state.playerId,
      dimension: normDim,
      transitioned: true,
      previousRegion,
      activeRegion: state.activeRegion,
      fogStack: fogResult.fogStack,
      musicInstance: state.musicInstance,
      ambientInstance: state.ambientInstance,
      musicSoundId: state.musicInstance.soundId,
      ambientSoundId: state.ambientInstance.soundId,
      particles: [...state.emittedParticles],
      graphicsOverrides: { ...state.graphicsOverrides },
    };
  }

  _stopPlayerAudio(state, currentTick = 0) {
    if (state.musicInstance && state.musicInstance.isPlaying) {
      state.musicInstance.stop(currentTick);
      state.stoppedSounds.push(state.musicInstance);
    }
    if (state.ambientInstance && state.ambientInstance.isPlaying) {
      state.ambientInstance.stop(currentTick);
      state.stoppedSounds.push(state.ambientInstance);
    }
    state.musicInstance = null;
    state.ambientInstance = null;
  }

  _applyPlayerGraphicsOverrides(state, preset, biomeType = 'minecraft:the_end', playerHandle = null) {
    if (!this.graphicsModule) return;
    const targetPlayer = playerHandle ?? { id: state.playerId };

    if (typeof this.graphicsModule.getPlayerAtmospherics === 'function') {
      const atm = this.graphicsModule.getPlayerAtmospherics(biomeType, targetPlayer);
      if (atm && typeof atm.setSkyHorizonColor === 'function') {
        atm.setSkyHorizonColor(preset.fogColor);
      }
    }
    if (typeof this.graphicsModule.getPlayerColorGrading === 'function') {
      const cg = this.graphicsModule.getPlayerColorGrading(biomeType, targetPlayer);
      if (cg && typeof cg.setContrast === 'function') {
        cg.setContrast(1.05);
      }
    }
    if (typeof this.graphicsModule.getPlayerLighting === 'function') {
      const light = this.graphicsModule.getPlayerLighting(biomeType, targetPlayer);
      if (light && typeof light.setAmbientColor === 'function') {
        light.setAmbientColor(preset.fogColor);
      }
    }
    if (typeof this.graphicsModule.getPlayerWater === 'function') {
      const water = this.graphicsModule.getPlayerWater(biomeType, targetPlayer);
      if (water && typeof water.setWaterColor === 'function') {
        water.setWaterColor(preset.waterColor);
      }
    }

    state.graphicsOverrides = {
      active: true,
      regionId: preset.regionId,
      fogColor: preset.fogColor,
      waterColor: preset.waterColor,
      resetCalls: state.graphicsOverrides.resetCalls ?? [],
    };
  }

  /**
   * Resets owned per-player graphics settings using property-specific `reset*()`
   * methods on the injected `@minecraft/server-graphics` `1.0.0-beta` handles.
   */
  resetPlayerGraphicsOverrides(playerId, biomeType = 'minecraft:the_end', playerHandle = null) {
    const state = this._getOrCreatePlayerState(playerId);
    return this._resetPlayerGraphicsOverrides(state, biomeType, playerHandle);
  }

  _resetPlayerGraphicsOverrides(state, biomeType = 'minecraft:the_end', playerHandle = null) {
    const resetCalls = [];
    if (this.graphicsModule) {
      const targetPlayer = playerHandle ?? { id: state.playerId };

      if (typeof this.graphicsModule.getPlayerAtmospherics === 'function') {
        const atm = this.graphicsModule.getPlayerAtmospherics(biomeType, targetPlayer);
        if (atm && typeof atm.resetSkyHorizonColor === 'function') {
          atm.resetSkyHorizonColor();
          resetCalls.push('resetSkyHorizonColor');
        }
        if (atm && typeof atm.resetRayleighStrength === 'function') {
          atm.resetRayleighStrength();
          resetCalls.push('resetRayleighStrength');
        }
      }
      if (typeof this.graphicsModule.getPlayerColorGrading === 'function') {
        const cg = this.graphicsModule.getPlayerColorGrading(biomeType, targetPlayer);
        if (cg && typeof cg.resetContrast === 'function') {
          cg.resetContrast();
          resetCalls.push('resetContrast');
        }
        if (cg && typeof cg.resetToneMapping === 'function') {
          cg.resetToneMapping();
          resetCalls.push('resetToneMapping');
        }
      }
      if (typeof this.graphicsModule.getPlayerLighting === 'function') {
        const light = this.graphicsModule.getPlayerLighting(biomeType, targetPlayer);
        if (light && typeof light.resetAmbientColor === 'function') {
          light.resetAmbientColor();
          resetCalls.push('resetAmbientColor');
        }
        if (light && typeof light.resetFlashIlluminance === 'function') {
          light.resetFlashIlluminance();
          resetCalls.push('resetFlashIlluminance');
        }
      }
      if (typeof this.graphicsModule.getPlayerWater === 'function') {
        const water = this.graphicsModule.getPlayerWater(biomeType, targetPlayer);
        if (water && typeof water.resetCDOM === 'function') {
          water.resetCDOM();
          resetCalls.push('resetCDOM');
        }
        if (water && typeof water.resetWaterColor === 'function') {
          water.resetWaterColor();
          resetCalls.push('resetWaterColor');
        }
      }
    }

    state.graphicsOverrides = {
      active: false,
      regionId: null,
      resetCalls,
    };
    return state.graphicsOverrides;
  }

  getPlayerPresentationState(playerId) {
    const state = this._playerStates.get(String(playerId));
    if (!state) return null;
    return {
      playerId: state.playerId,
      dimension: state.dimension,
      activeRegion: state.activeRegion,
      candidateRegion: state.candidateRegion,
      candidateResidencyTicks: state.candidateResidencyTicks,
      fogStack: state.fogStack.map(e => ({ ...e })),
      musicSoundId: state.musicInstance?.soundId ?? null,
      ambientSoundId: state.ambientInstance?.soundId ?? null,
      musicPlaying: Boolean(state.musicInstance?.isPlaying),
      ambientPlaying: Boolean(state.ambientInstance?.isPlaying),
      stoppedSoundCount: state.stoppedSounds.length,
      emittedParticles: [...state.emittedParticles],
      graphicsOverrides: { ...state.graphicsOverrides },
      epoch: state.epoch,
    };
  }

  // ============================================================================
  // 2. PROGRESSION & DISCOVERY TRACKING (`PROG-001` — 36 Advancements)
  // ============================================================================

  _getOrCreateProgression(playerId) {
    const id = String(playerId);
    let prog = this._playerProgression.get(id);
    if (!prog) {
      prog = {
        playerId: id,
        unlockedAdvancements: new Set(),
        discoveredRegions: new Set(),
        notifications: [],
      };
      this._playerProgression.set(id, prog);
    }
    return prog;
  }

  awardAdvancement(playerId, advancementId) {
    const prog = this._getOrCreateProgression(playerId);
    const clean = String(advancementId).replace(/^betterend:/, '');
    const entry = this.advancements.find(a => a.shortId === clean || a.id === advancementId);
    if (!entry) {
      return { awarded: false, reason: `unknown_advancement:${advancementId}` };
    }
    if (prog.unlockedAdvancements.has(entry.id)) {
      return { awarded: false, alreadyUnlocked: true, advancementId: entry.id };
    }
    prog.unlockedAdvancements.add(entry.id);
    const toast = {
      advancementId: entry.id,
      shortId: entry.shortId,
      title: entry.title,
      category: entry.category,
    };
    prog.notifications.push(toast);
    return {
      awarded: true,
      advancementId: entry.id,
      shortId: entry.shortId,
      title: entry.title,
      totalUnlocked: prog.unlockedAdvancements.size,
    };
  }

  recordRegionDiscovery(playerId, regionId) {
    const prog = this._getOrCreateProgression(playerId);
    const key = normalizeRegionKey(regionId);
    if (!key) return null;
    const fullId = REGION_PRESENTATION_PRESETS[key].fullId;
    prog.discoveredRegions.add(fullId);

    this.awardAdvancement(playerId, 'betterend:enter_end');
    if (key === 'amber_land') {
      this.awardAdvancement(playerId, 'betterend:amber_land');
    }
    if (key === 'blossoming_spires') {
      this.awardAdvancement(playerId, 'betterend:blossoming_spires');
    }
    if (prog.discoveredRegions.size >= Object.keys(REGION_PRESENTATION_PRESETS).length) {
      this.awardAdvancement(playerId, 'betterend:all_the_biomes');
    }

    return this.getPlayerProgression(playerId);
  }

  getPlayerProgression(playerId) {
    const prog = this._getOrCreateProgression(playerId);
    return {
      playerId: prog.playerId,
      totalAdvancements: this.advancements.length,
      unlockedCount: prog.unlockedAdvancements.size,
      unlockedAdvancements: [...prog.unlockedAdvancements],
      discoveredRegionsCount: prog.discoveredRegions.size,
      discoveredRegions: [...prog.discoveredRegions],
      notifications: [...prog.notifications],
    };
  }
}

export default PresentationService;
