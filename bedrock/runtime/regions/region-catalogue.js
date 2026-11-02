/**
 * Complete deterministic metadata catalogue for all 27 BetterEnd regions
 * and all 113 BetterEnd feature and structure definitions (`REG-001`, `GEN-001..003`).
 *
 * Pure ES module with zero Node-specific imports so it runs identically in
 * Node.js 24 and inside `@minecraft/server` 2.9.0 in BDS.
 */

const DEFAULT_SKY_COLOR = 0x000000;
const DEFAULT_WATER_COLOR = 4159204;
const DEFAULT_WATER_FOG_COLOR = 329011;
const DEFAULT_FOLIAGE_COLOR = 10526880;

const DEFAULT_LAND_ORES = Object.freeze([
  "ender_ore",
  "amber_ore",
  "thallasium_ore",
  "flavolite_layer",
  "violecite_layer"
]);

const DEFAULT_CAVE_FEATURES = Object.freeze([
  "tunel_cave",
  "cave_surface_coat"
]);

function makeRegion({
  id,
  layer,
  parent = null,
  genChance = 1.25,
  fogDensity = 1.0,
  terrainHeight = 1.0,
  hasCaves = true,
  colors = {},
  surface = {},
  music = "betterend:betterend.music.openpace",
  ambientSound = null,
  particles = [],
  features = [],
  structures = [],
  spawns = [],
  tags = []
}) {
  const upstreamId = `betterend:${id}`;
  const bedrockId = `betterend_bedrock:${id}`;
  const defaultFeatures = hasCaves
    ? ["crashed_ship", ...DEFAULT_CAVE_FEATURES, ...DEFAULT_LAND_ORES]
    : layer === "cave"
      ? ["cave_surface_coat"]
      : [];
  const mergedFeatures = Array.from(new Set([...defaultFeatures, ...features]));
  const mergedStructures = Array.from(new Set(structures));

  return Object.freeze({
    id,
    upstreamId,
    bedrockId,
    layer,
    parent,
    genChance,
    fogDensity,
    terrainHeight,
    hasCaves,
    colors: Object.freeze({
      fogColor: colors.fogColor ?? 0,
      waterColor: colors.waterColor ?? DEFAULT_WATER_COLOR,
      waterFogColor: colors.waterFogColor ?? DEFAULT_WATER_FOG_COLOR,
      foliageColor: colors.foliageColor ?? DEFAULT_FOLIAGE_COLOR,
      skyColor: colors.skyColor ?? DEFAULT_SKY_COLOR
    }),
    surface: Object.freeze({
      topBlock: surface.topBlock ?? "minecraft:end_stone",
      underBlock: surface.underBlock ?? "minecraft:end_stone",
      altTopBlock: surface.altTopBlock ?? null,
      rules: Object.freeze(surface.rules ?? [])
    }),
    music,
    ambientSound,
    particles: Object.freeze(particles.map((p) => Object.freeze({ ...p }))),
    features: Object.freeze(mergedFeatures),
    structures: Object.freeze(mergedStructures),
    spawns: Object.freeze(spawns.map((s) => Object.freeze({ ...s }))),
    tags: Object.freeze([
      "the_end",
      `betterend:${layer}`,
      `betterend:region/${id}`,
      ...tags
    ])
  });
}

/**
 * All 27 BetterEnd regions across 4 layers:
 * - 15 `surface` main land regions
 * - 3 `sub_region` surface sub-biomes (`megalake_grove`, `painted_mountains`, `neon_oasis`)
 * - 3 `aerial` void / small-island regions (`ice_starfield`, `flower_islets`, `waterfall_ponds`)
 * - 6 `cave` underground regions
 */
export const REGION_CATALOGUE = Object.freeze([
  // --- 15 Main Surface Land Biomes ---
  makeRegion({
    id: "foggy_mushroomland",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 3.0,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 2697542,
      waterColor: 7719913,
      waterFogColor: 7719913,
      foliageColor: 4838282
    },
    surface: {
      topBlock: "betterend:end_moss",
      underBlock: "minecraft:end_stone",
      altTopBlock: "betterend:end_mycelium",
      rules: [
        { type: "noise_threshold", noise: "foggy_mushroomland", threshold: 0.0, above: "betterend:end_moss", below: "betterend:end_mycelium" }
      ]
    },
    music: "betterend:betterend.music.forest",
    ambientSound: "betterend:betterend.ambient.foggy_mushroomland",
    particles: [{ id: "betterend:glowing_sphere", probability: 0.001 }],
    features: [
      "mossy_glowshroom",
      "blue_vine",
      "umbrella_moss",
      "creeping_moss",
      "dense_vine",
      "cyan_moss",
      "cyan_moss_wood",
      "end_lily",
      "bubble_coral",
      "charnia_cyan",
      "charnia_light_blue",
      "charnia_red_rare",
      "silk_moth_nest"
    ],
    structures: ["giant_mossy_glowshroom", "end_lake", "eternal_portal"],
    spawns: [
      { type: "betterend:dragonfly", category: "ambient", weight: 50, minCount: 1, maxCount: 3 },
      { type: "betterend:end_fish", category: "water_ambient", weight: 20, minCount: 2, maxCount: 5 },
      { type: "betterend:cubozoa", category: "water_ambient", weight: 10, minCount: 3, maxCount: 8 },
      { type: "betterend:end_slime", category: "monster", weight: 10, minCount: 1, maxCount: 2 },
      { type: "minecraft:enderman", category: "monster", weight: 10, minCount: 1, maxCount: 2 }
    ],
    tags: ["wover:is_end/land"]
  }),

  makeRegion({
    id: "chorus_forest",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 1.5,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 5713496,
      waterColor: 4860006,
      waterFogColor: 4860006,
      foliageColor: 7619708
    },
    surface: {
      topBlock: "betterend:chorus_nylium",
      underBlock: "minecraft:end_stone",
      altTopBlock: null,
      rules: [{ type: "floor", block: "betterend:chorus_nylium" }]
    },
    music: "betterend:betterend.music.dark",
    ambientSound: "betterend:betterend.ambient.chorus_forest",
    particles: [{ id: "minecraft:portal", probability: 0.01 }],
    features: [
      "pythadendron_tree",
      "pythadendron_bush",
      "purple_polypore",
      "chorus_grass",
      "chorus_mushroom",
      "tail_moss",
      "tail_moss_wood",
      "charnia_purple",
      "charnia_red_rare",
      "silk_moth_nest"
    ],
    structures: ["end_lake_rare", "eternal_portal"],
    spawns: [
      { type: "betterend:end_slime", category: "monster", weight: 5, minCount: 1, maxCount: 2 },
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 4 }
    ],
    tags: ["wover:is_end/highland"]
  }),

  makeRegion({
    id: "dust_wastelands",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 2.0,
    terrainHeight: 1.5,
    hasCaves: true,
    colors: {
      fogColor: 14866596,
      waterColor: 16771759,
      waterFogColor: 16771759,
      foliageColor: 10526880
    },
    surface: {
      topBlock: "betterend:endstone_dust",
      underBlock: "betterend:endstone_dust",
      altTopBlock: null,
      rules: [
        { type: "floor", block: "betterend:endstone_dust" },
        { type: "under_floor", depth: 4, block: "betterend:endstone_dust" }
      ]
    },
    music: "betterend:betterend.music.openpace",
    ambientSound: "betterend:betterend.ambient.dust_wastelands",
    particles: [{ id: "minecraft:white_ash", probability: 0.02 }],
    features: ["silk_moth_nest"],
    structures: ["end_village", "eternal_portal"],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 2 }
    ],
    tags: ["wover:is_end/midland"]
  }),

  makeRegion({
    id: "megalake",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 1.75,
    terrainHeight: 0.0,
    hasCaves: true,
    colors: {
      fogColor: 11657983,
      waterColor: 6333183,
      waterFogColor: 6333183,
      foliageColor: 4838282
    },
    surface: {
      topBlock: "betterend:end_moss",
      underBlock: "minecraft:end_stone",
      altTopBlock: "betterend:endstone_dust",
      rules: [
        { type: "noise_threshold", noise: "megalake", threshold: -0.1, above: "betterend:end_moss", below: "betterend:endstone_dust" }
      ]
    },
    music: "betterend:betterend.music.water",
    ambientSound: "betterend:betterend.ambient.megalake",
    particles: [],
    features: [
      "bubble_coral_rare",
      "end_lotus",
      "end_lotus_leaf",
      "end_lily_rare",
      "umbrella_moss",
      "creeping_moss",
      "cyan_moss",
      "cyan_moss_wood",
      "menger_sponge",
      "charnia_cyan",
      "charnia_light_blue",
      "charnia_red_rare",
      "silk_moth_nest"
    ],
    structures: ["megalake", "eternal_portal"],
    spawns: [
      { type: "betterend:dragonfly", category: "ambient", weight: 50, minCount: 1, maxCount: 3 },
      { type: "betterend:end_fish", category: "water_ambient", weight: 50, minCount: 2, maxCount: 5 },
      { type: "betterend:cubozoa", category: "water_ambient", weight: 50, minCount: 3, maxCount: 8 },
      { type: "betterend:end_slime", category: "monster", weight: 5, minCount: 1, maxCount: 2 },
      { type: "minecraft:enderman", category: "monster", weight: 10, minCount: 1, maxCount: 2 }
    ],
    tags: ["wover:is_end/land"]
  }),

  makeRegion({
    id: "crystal_mountains",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 1.0,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 10536426,
      waterColor: 4159204,
      waterFogColor: 329011,
      foliageColor: 16743826
    },
    surface: {
      topBlock: "betterend:crystal_moss",
      underBlock: "minecraft:end_stone",
      altTopBlock: null,
      rules: [{ type: "floor", block: "betterend:crystal_moss" }]
    },
    music: "betterend:betterend.music.openpace",
    ambientSound: null,
    particles: [],
    features: ["round_cave", "crystal_grass", "crystal_moss_cover", "silk_moth_nest"],
    structures: ["mountain", "eternal_portal"],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 2 }
    ],
    tags: ["wover:is_end/land"]
  }),

  makeRegion({
    id: "shadow_forest",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 2.5,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 0,
      waterColor: 2762052,
      waterFogColor: 2762052,
      foliageColor: 2959661
    },
    surface: {
      topBlock: "betterend:shadow_grass",
      underBlock: "minecraft:end_stone",
      altTopBlock: null,
      rules: [{ type: "floor", block: "betterend:shadow_grass" }]
    },
    music: "betterend:betterend.music.dark",
    ambientSound: "betterend:betterend.ambient.shadow_forest",
    particles: [{ id: "minecraft:mycelium", probability: 0.01 }],
    features: [
      "dragon_tree",
      "dragon_tree_bush",
      "shadow_plant",
      "murkweed",
      "needlegrass",
      "shadow_berry",
      "twisted_vine",
      "purple_polypore",
      "tail_moss",
      "tail_moss_wood",
      "charnia_purple",
      "charnia_red_rare",
      "silk_moth_nest"
    ],
    structures: ["end_lake_rare", "eternal_portal"],
    spawns: [
      { type: "betterend:shadow_walker", category: "monster", weight: 80, minCount: 2, maxCount: 4 },
      { type: "minecraft:enderman", category: "monster", weight: 40, minCount: 1, maxCount: 4 },
      { type: "minecraft:phantom", category: "monster", weight: 1, minCount: 1, maxCount: 2 }
    ],
    tags: ["wover:is_end/land"]
  }),

  makeRegion({
    id: "amber_land",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 2.0,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 16758016,
      waterColor: 9533159,
      waterFogColor: 9533159,
      foliageColor: 14384402
    },
    surface: {
      topBlock: "betterend:amber_moss",
      underBlock: "minecraft:end_stone",
      altTopBlock: null,
      rules: [{ type: "floor", block: "betterend:amber_moss" }]
    },
    music: "betterend:betterend.music.forest",
    ambientSound: "betterend:betterend.ambient.amber_land",
    particles: [{ id: "betterend:amber_sphere", probability: 0.001 }],
    features: [
      "helix_tree",
      "lanceleaf",
      "glow_pillar",
      "amber_grass",
      "amber_root",
      "bulb_moss",
      "bulb_moss_wood",
      "charnia_orange",
      "charnia_red",
      "silk_moth_nest"
    ],
    structures: ["end_lake", "eternal_portal"],
    spawns: [
      { type: "betterend:end_fish", category: "water_ambient", weight: 20, minCount: 2, maxCount: 5 },
      { type: "betterend:end_slime", category: "monster", weight: 30, minCount: 1, maxCount: 2 },
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 4 }
    ],
    tags: ["wover:is_end/land"]
  }),

  makeRegion({
    id: "blossoming_spires",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 1.7,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 9866914,
      waterColor: 4159204,
      waterFogColor: 329011,
      foliageColor: 7619708
    },
    surface: {
      topBlock: "betterend:pink_moss",
      underBlock: "minecraft:end_stone",
      altTopBlock: null,
      rules: [{ type: "floor", block: "betterend:pink_moss" }]
    },
    music: "betterend:betterend.music.forest",
    ambientSound: "betterend:betterend.ambient.blossoming_spires",
    particles: [],
    features: [
      "spire",
      "floating_spire",
      "tenanea",
      "tenanea_bush",
      "bulb_vine",
      "bushy_grass",
      "bushy_grass_wg",
      "blossom_berry",
      "twisted_moss",
      "twisted_moss_wood",
      "twisted_umbrella_moss",
      "silk_moth_nest"
    ],
    structures: ["eternal_portal"],
    spawns: [
      { type: "betterend:silk_moth", category: "ambient", weight: 5, minCount: 1, maxCount: 2 },
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 4 }
    ],
    tags: ["wover:is_end/land"]
  }),

  makeRegion({
    id: "sulphur_springs",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 1.5,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 13616430,
      waterColor: 1635473,
      waterFogColor: 1989677,
      foliageColor: 10526880
    },
    surface: {
      topBlock: "betterend:flavolite",
      underBlock: "minecraft:end_stone",
      altTopBlock: "betterend:brimstone",
      rules: [
        { type: "noise_threshold", noise: "sulphuric", seed: 5123, scale: 0.03, threshold: -0.1, above: "betterend:brimstone", below: "betterend:flavolite" }
      ]
    },
    music: "betterend:betterend.music.openpace",
    ambientSound: "betterend:betterend.ambient.sulphur_springs",
    particles: [{ id: "betterend:sulphur_particle", probability: 0.001 }],
    features: [
      "geyser",
      "sulphuric_lake",
      "sulphur_hill",
      "surface_vent",
      "sulphur_spike",
      "sulphur_spike_hanging",
      "hydralux",
      "charnia_green",
      "charnia_orange",
      "charnia_red_rare",
      "silk_moth_nest"
    ],
    structures: ["sulphuric_cave", "eternal_portal"],
    spawns: [
      { type: "betterend:end_fish", category: "water_ambient", weight: 20, minCount: 2, maxCount: 5 },
      { type: "betterend:cubozoa", category: "water_ambient", weight: 10, minCount: 3, maxCount: 8 },
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 4 }
    ],
    tags: ["wover:is_end/land"]
  }),

  makeRegion({
    id: "umbrella_jungle",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 2.0,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 5758165,
      waterColor: 7853304,
      waterFogColor: 7853304,
      foliageColor: 1816254
    },
    surface: {
      topBlock: "betterend:jungle_moss",
      underBlock: "minecraft:end_stone",
      altTopBlock: null,
      rules: [{ type: "floor", block: "betterend:jungle_moss" }]
    },
    music: "betterend:betterend.music.forest",
    ambientSound: "betterend:betterend.ambient.umbrella_jungle",
    particles: [{ id: "betterend:jungle_spore", probability: 0.001 }],
    features: [
      "umbrella_tree",
      "jellyshroom",
      "twisted_umbrella_moss",
      "jungle_grass",
      "small_jellyshroom_floor",
      "cyan_moss",
      "cyan_moss_wood",
      "jungle_fern_wood",
      "small_jellyshroom_wall",
      "small_jellyshroom_wood",
      "small_jellyshroom_ceil",
      "jungle_vine",
      "charnia_cyan",
      "charnia_green",
      "charnia_light_blue",
      "charnia_red_rare",
      "silk_moth_nest"
    ],
    structures: ["end_lake", "eternal_portal"],
    spawns: [
      { type: "betterend:dragonfly", category: "ambient", weight: 50, minCount: 1, maxCount: 3 },
      { type: "betterend:end_fish", category: "water_ambient", weight: 20, minCount: 2, maxCount: 5 },
      { type: "betterend:end_slime", category: "monster", weight: 30, minCount: 1, maxCount: 2 },
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 4 }
    ],
    tags: ["wover:is_end/land"]
  }),

  makeRegion({
    id: "glowing_grasslands",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 1.3,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 6550254,
      waterColor: 6077136,
      waterFogColor: 6077136,
      foliageColor: 4838282
    },
    surface: {
      topBlock: "betterend:end_moss",
      underBlock: "minecraft:end_stone",
      altTopBlock: null,
      rules: [{ type: "floor", block: "betterend:end_moss" }]
    },
    music: "betterend:betterend.music.openpace",
    ambientSound: "betterend:betterend.ambient.glowing_grasslands",
    particles: [{ id: "betterend:firefly", probability: 0.001 }],
    features: [
      "lumecorn",
      "blooming_cooksonia",
      "salteago",
      "vaiolush_fern",
      "fracturn",
      "umbrella_moss_rare",
      "creeping_moss_rare",
      "twisted_umbrella_moss_rare",
      "cyan_moss",
      "cyan_moss_wood",
      "charnia_cyan",
      "charnia_green",
      "charnia_light_blue",
      "charnia_red_rare",
      "silk_moth_nest"
    ],
    structures: ["end_village", "end_lake_rare", "eternal_portal"],
    spawns: [
      { type: "betterend:dragonfly", category: "ambient", weight: 50, minCount: 1, maxCount: 3 },
      { type: "betterend:silk_moth", category: "ambient", weight: 5, minCount: 1, maxCount: 2 },
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 2 }
    ],
    tags: ["wover:is_end/land"]
  }),

  makeRegion({
    id: "dragon_graveyards",
    layer: "surface",
    genChance: 0.25,
    fogDensity: 1.3,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 16002379,
      waterColor: 13324583,
      waterFogColor: 13324583,
      foliageColor: 10955059
    },
    surface: {
      topBlock: "betterend:sangnum",
      underBlock: "minecraft:end_stone",
      altTopBlock: null,
      rules: [{ type: "floor", block: "betterend:sangnum" }]
    },
    music: "betterend:betterend.music.dark",
    ambientSound: "betterend:betterend.ambient.glowing_grasslands",
    particles: [{ id: "betterend:firefly", probability: 0.0007 }],
    features: [
      "obsidian_pillar_basement",
      "fallen_pillar",
      "obsidian_boulder",
      "dragon_bone_block_ore",
      "gigantic_amaranita",
      "large_amaranita",
      "small_amaranita",
      "globulagus",
      "clawfern",
      "silk_moth_nest"
    ],
    structures: ["eternal_portal"],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 2 }
    ],
    tags: ["wover:is_end/land"]
  }),

  makeRegion({
    id: "dry_shrubland",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 1.0,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 13852459,
      waterColor: 4159204,
      waterFogColor: 329011,
      foliageColor: 14443295
    },
    surface: {
      topBlock: "betterend:rutiscus",
      underBlock: "minecraft:end_stone",
      altTopBlock: null,
      rules: [{ type: "floor", block: "betterend:rutiscus" }]
    },
    music: "betterend:betterend.music.openpace",
    ambientSound: null,
    particles: [],
    features: [
      "lucernia_bush_rare",
      "orango",
      "aeridium",
      "lutebus",
      "lamellarium",
      "ruscus",
      "silk_moth_nest"
    ],
    structures: ["eternal_portal"],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 2 }
    ],
    tags: ["wover:is_end/land"]
  }),

  makeRegion({
    id: "lantern_woods",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 1.1,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 12405622,
      waterColor: 11238280,
      waterFogColor: 11238280,
      foliageColor: 16746537
    },
    surface: {
      topBlock: "betterend:rutiscus",
      underBlock: "minecraft:end_stone",
      altTopBlock: "betterend:end_moss",
      rules: [
        { type: "noise_threshold", noise: "lantern_woods", threshold: -0.1, above: "betterend:rutiscus", below: "betterend:end_moss" }
      ]
    },
    music: "betterend:betterend.music.forest",
    ambientSound: "betterend:betterend.ambient.lantern_woods",
    particles: [{ id: "betterend:glowing_sphere", probability: 0.001 }],
    features: [
      "flamaea",
      "lucernia",
      "lucernia_bush",
      "filalux",
      "aeridium",
      "lamellarium",
      "bolux_mushroom",
      "aurant_polypore",
      "pond_anemone",
      "charnia_orange",
      "charnia_red",
      "ruscus",
      "ruscus_wood",
      "silk_moth_nest"
    ],
    structures: ["end_lake_normal", "eternal_portal"],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 2 }
    ],
    tags: ["wover:is_end/land"]
  }),

  makeRegion({
    id: "umbra_valley",
    layer: "surface",
    genChance: 1.25,
    fogDensity: 1.0,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 6579300,
      waterColor: 4552814,
      waterFogColor: 4552814,
      foliageColor: 11329240
    },
    surface: {
      topBlock: "betterend:pallidium_full",
      underBlock: "betterend:umbralith",
      altTopBlock: "betterend:pallidium_heavy",
      rules: [
        {
          type: "umbra_concentric_noise",
          seed: 1512,
          scale: 0.03,
          bands: [
            { min: 0.4, block: "betterend:pallidium_full" },
            { min: 0.15, block: "betterend:pallidium_heavy" },
            { min: -0.15, block: "betterend:pallidium_thin" },
            { min: -0.4, block: "betterend:pallidium_tiny" },
            { min: -Infinity, block: "betterend:umbralith" }
          ]
        }
      ]
    },
    music: "betterend:betterend.music.umbra_valley",
    ambientSound: "betterend:betterend.ambient.umbra_valley",
    particles: [{ id: "betterend:amber_sphere", probability: 0.0001 }],
    features: [
      "umbralith_arch",
      "thin_umbralith_arch",
      "inflexia",
      "flammalix",
      "silk_moth_nest"
    ],
    structures: ["eternal_portal"],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 2 },
      { type: "minecraft:phantom", category: "monster", weight: 1, minCount: 1, maxCount: 2 }
    ],
    tags: ["wover:is_end/land"]
  }),

  // --- 3 Surface Sub-Biomes ---
  makeRegion({
    id: "megalake_grove",
    layer: "sub_region",
    parent: "megalake",
    genChance: 1.25,
    fogDensity: 2.0,
    terrainHeight: 0.0,
    hasCaves: true,
    colors: {
      fogColor: 11657983,
      waterColor: 6333183,
      waterFogColor: 6333183,
      foliageColor: 4838282
    },
    surface: {
      topBlock: "betterend:end_moss",
      underBlock: "minecraft:end_stone",
      altTopBlock: null,
      rules: [{ type: "floor", block: "betterend:end_moss" }]
    },
    music: "betterend:betterend.music.water",
    ambientSound: "betterend:betterend.ambient.megalake_grove",
    particles: [{ id: "betterend:glowing_sphere", probability: 0.001 }],
    features: [
      "lacugrove",
      "end_lotus",
      "end_lotus_leaf",
      "bubble_coral_rare",
      "end_lily_rare",
      "umbrella_moss",
      "creeping_moss",
      "cyan_moss",
      "cyan_moss_wood",
      "menger_sponge",
      "charnia_cyan",
      "charnia_light_blue",
      "charnia_red_rare",
      "silk_moth_nest"
    ],
    structures: ["megalake_small"],
    spawns: [
      { type: "betterend:dragonfly", category: "ambient", weight: 20, minCount: 1, maxCount: 3 },
      { type: "betterend:end_fish", category: "water_ambient", weight: 20, minCount: 2, maxCount: 5 },
      { type: "betterend:cubozoa", category: "water_ambient", weight: 50, minCount: 3, maxCount: 8 },
      { type: "betterend:end_slime", category: "monster", weight: 5, minCount: 1, maxCount: 2 },
      { type: "minecraft:enderman", category: "monster", weight: 10, minCount: 1, maxCount: 2 }
    ],
    tags: ["betterend:sub_biome", "betterend:parent/megalake"]
  }),

  makeRegion({
    id: "painted_mountains",
    layer: "sub_region",
    parent: "dust_wastelands",
    genChance: 1.25,
    fogDensity: 2.0,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 14866596,
      waterColor: 16771759,
      waterFogColor: 16771759,
      foliageColor: 10526880
    },
    surface: {
      topBlock: "betterend:endstone_dust",
      underBlock: "betterend:flavolite",
      altTopBlock: "betterend:violecite",
      rules: [{ type: "floor", block: "betterend:endstone_dust" }]
    },
    music: "betterend:betterend.music.openpace",
    ambientSound: "betterend:betterend.ambient.dust_wastelands",
    particles: [{ id: "minecraft:white_ash", probability: 0.01 }],
    features: ["silk_moth_nest"],
    structures: ["painted_mountain"],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 2 }
    ],
    tags: ["betterend:sub_biome", "betterend:parent/dust_wastelands"]
  }),

  makeRegion({
    id: "neon_oasis",
    layer: "sub_region",
    parent: "dust_wastelands",
    genChance: 0.625,
    fogDensity: 2.0,
    terrainHeight: 1.0,
    hasCaves: true,
    colors: {
      fogColor: 14866596,
      waterColor: 6998483,
      waterFogColor: 6998483,
      foliageColor: 10526880
    },
    surface: {
      topBlock: "betterend:end_moss",
      underBlock: "betterend:endstone_dust",
      altTopBlock: "betterend:endstone_dust",
      rules: [
        { type: "noise_threshold", noise: "neon_oasis", threshold: 0.0, above: "betterend:end_moss", below: "betterend:endstone_dust" }
      ]
    },
    music: "betterend:betterend.music.water",
    ambientSound: "betterend:betterend.ambient.dust_wastelands",
    particles: [{ id: "minecraft:white_ash", probability: 0.01 }],
    features: [
      "desert_lake",
      "neon_cactus",
      "umbrella_moss",
      "creeping_moss",
      "charnia_green",
      "charnia_cyan",
      "charnia_red",
      "silk_moth_nest"
    ],
    structures: ["eternal_portal"],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 50, minCount: 1, maxCount: 2 }
    ],
    tags: ["betterend:sub_biome", "betterend:parent/dust_wastelands"]
  }),

  // --- 3 Aerial / Void Small-Island Biomes ---
  makeRegion({
    id: "ice_starfield",
    layer: "aerial",
    genChance: 0.5,
    fogDensity: 2.2,
    terrainHeight: 1.0,
    hasCaves: false,
    colors: {
      fogColor: 14737918,
      waterColor: 4159204,
      waterFogColor: 329011,
      foliageColor: 12699645
    },
    surface: {
      topBlock: "betterend:dense_snow",
      underBlock: "betterend:emerald_ice",
      altTopBlock: "betterend:dense_emerald_ice",
      rules: [{ type: "void_starfield", blocks: ["betterend:dense_snow", "betterend:emerald_ice", "betterend:dense_emerald_ice", "betterend:ancient_emerald_ice"] }]
    },
    music: "betterend:betterend.music.openpace",
    ambientSound: null,
    particles: [{ id: "betterend:snowflake", probability: 0.002 }],
    features: ["ice_star", "ice_star_small", "silk_moth_nest"],
    structures: ["giant_ice_star"],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 20, minCount: 1, maxCount: 4 }
    ],
    tags: ["wover:is_end/small_island"]
  }),

  makeRegion({
    id: "flower_islets",
    layer: "aerial",
    genChance: 0.5,
    fogDensity: 1.4,
    terrainHeight: 1.0,
    hasCaves: false,
    colors: {
      fogColor: 12405622,
      waterColor: 11238280,
      waterFogColor: 11238280,
      foliageColor: 16746537
    },
    surface: {
      topBlock: "betterend:sangnum",
      underBlock: "betterend:umbralith",
      altTopBlock: "betterend:pallidium_full",
      rules: [{ type: "small_island_coat", blocks: ["betterend:sangnum", "betterend:pallidium_full", "betterend:umbralith"] }]
    },
    music: "betterend:betterend.music.forest",
    ambientSound: "betterend:betterend.ambient.lantern_woods",
    particles: [{ id: "betterend:glowing_sphere", probability: 0.001 }],
    features: [
      "amaranita_patch",
      "large_amaranita",
      "small_amaranita",
      "aeridium",
      "lamellarium",
      "bolux_mushroom",
      "orango",
      "globulagus",
      "clawfern",
      "inflexia",
      "flammalix",
      "ruscus",
      "silk_moth_nest"
    ],
    structures: ["small_island", "end_bridge"],
    spawns: [
      { type: "betterend:silk_moth", category: "ambient", weight: 5, minCount: 1, maxCount: 2 },
      { type: "minecraft:enderman", category: "monster", weight: 20, minCount: 1, maxCount: 2 }
    ],
    tags: ["wover:is_end/small_island"]
  }),

  makeRegion({
    id: "waterfall_ponds",
    layer: "aerial",
    genChance: 0.5,
    fogDensity: 1.5,
    terrainHeight: 1.0,
    hasCaves: false,
    colors: {
      fogColor: 6550254,
      waterColor: 6333183,
      waterFogColor: 6333183,
      foliageColor: 4838282
    },
    surface: {
      topBlock: "betterend:end_moss",
      underBlock: "minecraft:end_stone",
      altTopBlock: null,
      rules: [{ type: "small_island_coat", blocks: ["betterend:end_moss", "minecraft:end_stone"] }]
    },
    music: "betterend:betterend.music.water",
    ambientSound: "betterend:betterend.ambient.megalake",
    particles: [{ id: "betterend:firefly", probability: 0.001 }],
    features: [
      "pond_with_waterfall",
      "dragon_helix_tree",
      "lumecorn",
      "blooming_cooksonia",
      "salteago",
      "vaiolush_fern",
      "fracturn",
      "umbrella_moss",
      "creeping_moss",
      "cyan_moss",
      "silk_moth_nest"
    ],
    structures: ["small_island", "end_bridge"],
    spawns: [
      { type: "betterend:dragonfly", category: "ambient", weight: 30, minCount: 1, maxCount: 3 },
      { type: "betterend:end_fish", category: "water_ambient", weight: 20, minCount: 2, maxCount: 5 },
      { type: "minecraft:enderman", category: "monster", weight: 20, minCount: 1, maxCount: 2 }
    ],
    tags: ["wover:is_end/small_island"]
  }),

  // --- 6 Underground Cave Biomes ---
  makeRegion({
    id: "empty_end_cave",
    layer: "cave",
    genChance: 1.25,
    fogDensity: 2.0,
    terrainHeight: 0.1,
    hasCaves: false,
    colors: {
      fogColor: 10518688,
      waterColor: 4159204,
      waterFogColor: 329011,
      foliageColor: 10526880
    },
    surface: {
      topBlock: "minecraft:end_stone",
      underBlock: "minecraft:end_stone",
      altTopBlock: null,
      rules: [{ type: "cave_coat", top: "minecraft:end_stone", wall: null, ceil: null }]
    },
    music: "betterend:betterend.music.caves",
    ambientSound: "betterend:betterend.ambient.caves",
    particles: [],
    features: [
      "cave_surface_coat",
      "end_stone_stalactite",
      "end_stone_stalagmite",
      "end_stone_stalactite_cluster"
    ],
    structures: [],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 1, minCount: 1, maxCount: 1 }
    ],
    tags: ["betterend:is_end_cave"]
  }),

  makeRegion({
    id: "empty_smaragdant_cave",
    layer: "cave",
    genChance: 1.25,
    fogDensity: 2.0,
    terrainHeight: 1.0,
    hasCaves: false,
    colors: {
      fogColor: 20312,
      waterColor: 2038932,
      waterFogColor: 2038932,
      foliageColor: 10526880
    },
    surface: {
      topBlock: "minecraft:end_stone",
      underBlock: "minecraft:end_stone",
      altTopBlock: "betterend:smaragdant_crystal",
      rules: [{ type: "cave_coat", top: "minecraft:end_stone", wall: null, ceil: null }]
    },
    music: "betterend:betterend.music.caves",
    ambientSound: "betterend:betterend.ambient.caves",
    particles: [{ id: "betterend:smaragdant", probability: 0.001 }],
    features: [
      "cave_surface_coat",
      "smaragdant_crystal",
      "smaragdant_crystal_shard"
    ],
    structures: [],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 1, minCount: 1, maxCount: 1 }
    ],
    tags: ["betterend:is_end_cave"]
  }),

  makeRegion({
    id: "lush_smaragdant_cave",
    layer: "cave",
    genChance: 1.25,
    fogDensity: 2.0,
    terrainHeight: 1.0,
    hasCaves: false,
    colors: {
      fogColor: 20312,
      waterColor: 2038932,
      waterFogColor: 2038932,
      foliageColor: 10526880
    },
    surface: {
      topBlock: "betterend:cave_moss",
      underBlock: "minecraft:end_stone",
      altTopBlock: "betterend:cave_moss",
      rules: [{ type: "cave_coat", top: "betterend:cave_moss", wall: null, ceil: "betterend:cave_moss" }]
    },
    music: "betterend:betterend.music.caves",
    ambientSound: "betterend:betterend.ambient.caves",
    particles: [{ id: "betterend:smaragdant", probability: 0.001 }],
    features: [
      "cave_surface_coat",
      "smaragdant_crystal",
      "smaragdant_crystal_shard",
      "end_stone_stalactite_cavemoss",
      "end_stone_stalagmite_cavemoss",
      "end_stone_stalactite_cavemoss_cluster",
      "cave_grass",
      "rubinea"
    ],
    structures: [],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 1, minCount: 1, maxCount: 1 }
    ],
    tags: ["betterend:is_end_cave"]
  }),

  makeRegion({
    id: "empty_aurora_cave",
    layer: "cave",
    genChance: 1.25,
    fogDensity: 2.0,
    terrainHeight: 1.0,
    hasCaves: false,
    colors: {
      fogColor: 9840791,
      waterColor: 12212655,
      waterFogColor: 12212655,
      foliageColor: 10526880
    },
    surface: {
      topBlock: "minecraft:end_stone",
      underBlock: "minecraft:end_stone",
      altTopBlock: "betterend:aurora_crystal",
      rules: [{ type: "cave_coat", top: "minecraft:end_stone", wall: null, ceil: null }]
    },
    music: "betterend:betterend.music.caves",
    ambientSound: "betterend:betterend.ambient.caves",
    particles: [{ id: "betterend:glowing_sphere", probability: 0.0005 }],
    features: [
      "cave_surface_coat",
      "big_aurora_crystal",
      "end_stone_stalactite",
      "end_stone_stalagmite",
      "end_stone_stalactite_cluster"
    ],
    structures: [],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 1, minCount: 1, maxCount: 1 }
    ],
    tags: ["betterend:is_end_cave"]
  }),

  makeRegion({
    id: "lush_aurora_cave",
    layer: "cave",
    genChance: 1.25,
    fogDensity: 2.0,
    terrainHeight: 1.0,
    hasCaves: false,
    colors: {
      fogColor: 9840791,
      waterColor: 12212655,
      waterFogColor: 12212655,
      foliageColor: 10526880
    },
    surface: {
      topBlock: "betterend:cave_moss",
      underBlock: "minecraft:end_stone",
      altTopBlock: "betterend:cave_moss",
      rules: [{ type: "cave_coat", top: "betterend:cave_moss", wall: null, ceil: "betterend:cave_moss" }]
    },
    music: "betterend:betterend.music.caves",
    ambientSound: "betterend:betterend.ambient.caves",
    particles: [{ id: "betterend:glowing_sphere", probability: 0.001 }],
    features: [
      "cave_surface_coat",
      "big_aurora_crystal",
      "cave_bush",
      "cave_grass",
      "end_stone_stalactite_cavemoss",
      "end_stone_stalagmite_cavemoss",
      "end_stone_stalactite_cavemoss_cluster",
      "rubinea",
      "magnula",
      "cave_pumpkin"
    ],
    structures: [],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 1, minCount: 1, maxCount: 1 }
    ],
    tags: ["betterend:is_end_cave"]
  }),

  makeRegion({
    id: "jade_cave",
    layer: "cave",
    genChance: 1.25,
    fogDensity: 2.0,
    terrainHeight: 0.1,
    hasCaves: false,
    colors: {
      fogColor: 7784289,
      waterColor: 6005091,
      waterFogColor: 6005091,
      foliageColor: 10526880
    },
    surface: {
      topBlock: "betterend:virid_jadestone",
      underBlock: "betterend:azure_jadestone",
      altTopBlock: "betterend:sandy_jadestone",
      rules: [
        {
          type: "jade_banded_wall",
          wallNoiseSeed: 9283,
          depthNoiseSeed: 37451,
          palette: ["betterend:virid_jadestone", "betterend:azure_jadestone", "betterend:sandy_jadestone"]
        }
      ]
    },
    music: "betterend:betterend.music.caves",
    ambientSound: "betterend:betterend.ambient.caves",
    particles: [],
    features: ["cave_surface_coat"],
    structures: [],
    spawns: [
      { type: "minecraft:enderman", category: "monster", weight: 1, minCount: 1, maxCount: 1 }
    ],
    tags: ["betterend:is_end_cave"]
  })
]);

export const REGIONS_BY_ID = new Map(
  REGION_CATALOGUE.flatMap((region) => [
    [region.id, region],
    [region.upstreamId, region],
    [region.bedrockId, region]
  ])
);

export const SURFACE_REGIONS = Object.freeze(REGION_CATALOGUE.filter((r) => r.layer === "surface"));
export const SUB_REGIONS = Object.freeze(REGION_CATALOGUE.filter((r) => r.layer === "sub_region"));
export const AERIAL_REGIONS = Object.freeze(REGION_CATALOGUE.filter((r) => r.layer === "aerial"));
export const CAVE_REGIONS = Object.freeze(REGION_CATALOGUE.filter((r) => r.layer === "cave"));

function makeDescriptor(category, id, step, placement, palette, radius = 4, priority = 10) {
  return Object.freeze({
    id,
    upstreamId: `betterend:${id}`,
    bedrockId: `betterend_bedrock:${id}`,
    category,
    step,
    radius,
    priority,
    placement: Object.freeze({ ...placement }),
    palette: Object.freeze([...palette])
  });
}

/**
 * Complete catalogue of all 113 BetterEnd feature and structure definitions
 * grouped across the 7 canonical categories researched in `worldgen-and-regions.md`:
 * 1. `trees` (11)
 * 2. `plants_foliage` (43)
 * 3. `water_aquatic` (17)
 * 4. `geologic` (15)
 * 5. `ores_layers` (6)
 * 6. `caves` (7)
 * 7. `structures` (14)
 * Total: 113 descriptors (plus full alias mapping in `FEATURES_BY_ID`).
 */
export const FEATURE_STRUCTURE_CATALOGUE = Object.freeze([
  // --- Category 1: Trees (11) ---
  makeDescriptor("trees", "mossy_glowshroom", "VEGETAL_DECORATION", { type: "spline_sdf_tree", minHeight: 10, maxHeight: 25, soil: ["betterend:end_moss", "betterend:end_mycelium"], density: 0.25 }, ["betterend:mossy_glowshroom_bark", "betterend:mossy_glowshroom_log", "betterend:mossy_glowshroom_cap", "betterend:mossy_glowshroom_hymenophore", "betterend:mossy_glowshroom_fur"], 14, 80),
  makeDescriptor("trees", "pythadendron_tree", "VEGETAL_DECORATION", { type: "spline_sdf_tree", minHeight: 10, maxHeight: 20, soil: ["betterend:chorus_nylium"], density: 0.3 }, ["betterend:pythadendron_bark", "betterend:pythadendron_log", "betterend:pythadendron_leaves"], 10, 75),
  makeDescriptor("trees", "lacugrove", "VEGETAL_DECORATION", { type: "spline_sdf_tree", minHeight: 15, maxHeight: 25, soil: ["betterend:end_moss"], density: 0.35 }, ["betterend:lacugrove_bark", "betterend:lacugrove_log", "betterend:lacugrove_leaves"], 12, 80),
  makeDescriptor("trees", "dragon_tree", "VEGETAL_DECORATION", { type: "spline_sdf_tree", minHeight: 10, maxHeight: 25, soil: ["betterend:shadow_grass"], density: 0.3 }, ["betterend:dragon_tree_bark", "betterend:dragon_tree_log", "betterend:dragon_tree_leaves"], 12, 80),
  makeDescriptor("trees", "tenanea", "VEGETAL_DECORATION", { type: "spline_sdf_tree", minHeight: 7, maxHeight: 10, soil: ["betterend:pink_moss"], density: 0.35 }, ["betterend:tenanea_bark", "betterend:tenanea_log", "betterend:tenanea_leaves", "betterend:tenanea_outer_leaves", "betterend:tenanea_flowers"], 9, 75),
  makeDescriptor("trees", "helix_tree", "VEGETAL_DECORATION", { type: "double_helix_tree", minHeight: 12, maxHeight: 22, soil: ["betterend:amber_moss"], density: 0.25 }, ["betterend:helix_tree_bark", "betterend:helix_tree_log", "betterend:helix_tree_leaves"], 8, 75),
  makeDescriptor("trees", "dragon_helix_tree", "VEGETAL_DECORATION", { type: "conifer_helix_tree", minHeight: 11, maxHeight: 17, soil: ["betterend:end_moss"], density: 0.25 }, ["betterend:dragon_tree_log", "betterend:lucernia_leaves", "betterend:bulb_vine"], 6, 75),
  makeDescriptor("trees", "umbrella_tree", "VEGETAL_DECORATION", { type: "spline_membrane_tree", minHeight: 10, maxHeight: 20, soil: ["betterend:jungle_moss"], density: 0.3 }, ["betterend:umbrella_tree_bark", "betterend:umbrella_tree_log", "betterend:umbrella_tree_membrane", "betterend:umbrella_tree_cluster"], 12, 80),
  makeDescriptor("trees", "jellyshroom", "VEGETAL_DECORATION", { type: "spline_dome_mushroom", minHeight: 5, maxHeight: 8, soil: ["betterend:jungle_moss"], density: 0.3 }, ["betterend:jellyshroom_bark", "betterend:jellyshroom_log", "betterend:jellyshroom_cap_purple"], 7, 70),
  makeDescriptor("trees", "gigantic_amaranita", "VEGETAL_DECORATION", { type: "spline_tiered_mushroom", minHeight: 5, maxHeight: 10, soil: ["betterend:sangnum"], density: 0.2 }, ["betterend:amaranita_stem", "betterend:amaranita_hyphae", "betterend:amaranita_cap", "betterend:amaranita_hymenophore", "betterend:amaranita_lantern", "betterend:amaranita_fur"], 8, 75),
  makeDescriptor("trees", "lucernia", "VEGETAL_DECORATION", { type: "spline_sdf_tree", minHeight: 12, maxHeight: 20, soil: ["betterend:rutiscus", "betterend:end_moss"], density: 0.3 }, ["betterend:lucernia_bark", "betterend:lucernia_log", "betterend:lucernia_leaves", "betterend:lucernia_outer_leaves", "betterend:filalux"], 10, 75),

  // --- Category 2: Plants, Bushes, Vines & Foliage (43) ---
  makeDescriptor("plants_foliage", "tenanea_bush", "VEGETAL_DECORATION", { type: "sdf_bush", radius: 3.5, density: 0.4 }, ["betterend:tenanea_bark", "betterend:tenanea_leaves", "betterend:tenanea_outer_leaves", "betterend:tenanea_flowers"], 4, 40),
  makeDescriptor("plants_foliage", "lumecorn", "VEGETAL_DECORATION", { type: "vertical_column", minHeight: 4, maxHeight: 7, density: 0.35 }, ["betterend:lumecorn"], 2, 35),
  makeDescriptor("plants_foliage", "large_amaranita", "VEGETAL_DECORATION", { type: "vertical_column", minHeight: 2, maxHeight: 3, density: 0.35 }, ["betterend:large_amaranita_mushroom"], 2, 35),
  makeDescriptor("plants_foliage", "amaranita_patch", "VEGETAL_DECORATION", { type: "mushroom_patch", radius: 4, count: [4, 8], density: 0.3 }, ["betterend:amaranita_stem", "betterend:amaranita_hyphae", "betterend:amaranita_cap", "betterend:amaranita_hymenophore", "betterend:amaranita_lantern"], 5, 45),
  makeDescriptor("plants_foliage", "neon_cactus", "VEGETAL_DECORATION", { type: "branching_column", minHeight: 3, maxHeight: 8, density: 0.3 }, ["betterend:neon_cactus"], 3, 40),
  makeDescriptor("plants_foliage", "pythadendron_bush", "VEGETAL_DECORATION", { type: "sdf_bush", radius: 3.0, density: 0.4 }, ["betterend:pythadendron_bark", "betterend:pythadendron_leaves"], 4, 40),
  makeDescriptor("plants_foliage", "dragon_tree_bush", "VEGETAL_DECORATION", { type: "sdf_bush", radius: 3.0, density: 0.4 }, ["betterend:dragon_tree_bark", "betterend:dragon_tree_leaves"], 4, 40),
  makeDescriptor("plants_foliage", "lucernia_bush", "VEGETAL_DECORATION", { type: "sdf_bush_outer", radius: 3.0, density: 0.4 }, ["betterend:lucernia_bark", "betterend:lucernia_leaves", "betterend:lucernia_outer_leaves"], 4, 40),
  makeDescriptor("plants_foliage", "lucernia_bush_rare", "VEGETAL_DECORATION", { type: "sdf_bush_outer", radius: 2.5, density: 0.15 }, ["betterend:lucernia_bark", "betterend:lucernia_leaves", "betterend:lucernia_outer_leaves"], 4, 35),
  makeDescriptor("plants_foliage", "dense_vine", "VEGETAL_DECORATION", { type: "hanging_vine", maxLength: 12, density: 0.4 }, ["betterend:dense_vine"], 3, 20),
  makeDescriptor("plants_foliage", "twisted_vine", "VEGETAL_DECORATION", { type: "hanging_vine", maxLength: 10, density: 0.35 }, ["betterend:twisted_vine"], 3, 20),
  makeDescriptor("plants_foliage", "bulb_vine", "VEGETAL_DECORATION", { type: "hanging_vine", maxLength: 10, density: 0.35 }, ["betterend:bulb_vine", "betterend:bulb_vine_seed"], 3, 20),
  makeDescriptor("plants_foliage", "jungle_vine", "VEGETAL_DECORATION", { type: "hanging_vine", maxLength: 14, density: 0.45 }, ["betterend:jungle_vine"], 3, 20),
  makeDescriptor("plants_foliage", "blue_vine", "VEGETAL_DECORATION", { type: "lantern_vine_cluster", minHeight: 2, maxHeight: 5, density: 0.3 }, ["betterend:blue_vine", "betterend:blue_vine_lantern", "betterend:blue_vine_fur", "betterend:blue_vine_seed"], 4, 35),
  makeDescriptor("plants_foliage", "filalux", "VEGETAL_DECORATION", { type: "sky_scatter", minY: 32, maxY: 192, density: 0.2 }, ["betterend:filalux", "betterend:filalux_lantern", "betterend:filalux_wings"], 3, 25),
  makeDescriptor("plants_foliage", "lanceleaf", "VEGETAL_DECORATION", { type: "tall_column_scatter", height: 5, density: 0.25 }, ["betterend:lanceleaf", "betterend:lanceleaf_seed"], 4, 30),
  makeDescriptor("plants_foliage", "glow_pillar", "VEGETAL_DECORATION", { type: "luminophor_pillar_scatter", height: 3, density: 0.2 }, ["betterend:glowing_pillar_roots", "betterend:glowing_pillar_luminophor", "betterend:glowing_pillar_leaves", "betterend:glowing_pillar_seed"], 4, 30),
  makeDescriptor("plants_foliage", "umbrella_moss", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 6, density: 0.6 }, ["betterend:umbrella_moss", "betterend:umbrella_moss_tall"], 6, 15),
  makeDescriptor("plants_foliage", "creeping_moss", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 6, density: 0.6 }, ["betterend:creeping_moss"], 6, 15),
  makeDescriptor("plants_foliage", "chorus_grass", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 6, density: 0.55 }, ["betterend:chorus_grass"], 6, 15),
  makeDescriptor("plants_foliage", "crystal_grass", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 5, density: 0.5 }, ["betterend:crystal_grass"], 5, 15),
  makeDescriptor("plants_foliage", "shadow_plant", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 6, density: 0.55 }, ["betterend:shadow_plant"], 6, 15),
  makeDescriptor("plants_foliage", "murkweed", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 5, density: 0.35 }, ["betterend:murkweed"], 5, 15),
  makeDescriptor("plants_foliage", "needlegrass", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 5, density: 0.45 }, ["betterend:needlegrass"], 5, 15),
  makeDescriptor("plants_foliage", "shadow_berry", "VEGETAL_DECORATION", { type: "scatter_crop", radius: 4, density: 0.25 }, ["betterend:shadow_berry"], 4, 15),
  makeDescriptor("plants_foliage", "bushy_grass", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 6, density: 0.55 }, ["betterend:bushy_grass"], 6, 15),
  makeDescriptor("plants_foliage", "amber_grass", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 6, density: 0.6 }, ["betterend:amber_grass"], 6, 15),
  makeDescriptor("plants_foliage", "twisted_umbrella_moss", "VEGETAL_DECORATION", { type: "double_plant_scatter", radius: 6, density: 0.5 }, ["betterend:twisted_umbrella_moss", "betterend:twisted_umbrella_moss_tall"], 6, 15),
  makeDescriptor("plants_foliage", "jungle_grass", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 6, density: 0.55 }, ["betterend:jungle_grass"], 6, 15),
  makeDescriptor("plants_foliage", "small_jellyshroom_floor", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 5, density: 0.35 }, ["betterend:small_jellyshroom"], 5, 15),
  makeDescriptor("plants_foliage", "blossom_berry", "VEGETAL_DECORATION", { type: "scatter_crop", radius: 4, density: 0.25 }, ["betterend:blossom_berry"], 4, 15),
  makeDescriptor("plants_foliage", "blooming_cooksonia", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 6, density: 0.5 }, ["betterend:blooming_cooksonia"], 6, 15),
  makeDescriptor("plants_foliage", "salteago", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 6, density: 0.5 }, ["betterend:salteago"], 6, 15),
  makeDescriptor("plants_foliage", "vaiolush_fern", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 6, density: 0.5 }, ["betterend:vaiolush_fern"], 6, 15),
  makeDescriptor("plants_foliage", "fracturn", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 5, density: 0.45 }, ["betterend:fracturn"], 5, 15),
  makeDescriptor("plants_foliage", "orango", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 6, density: 0.45 }, ["betterend:orango"], 6, 15),
  makeDescriptor("plants_foliage", "aeridium", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 5, density: 0.45 }, ["betterend:aeridium"], 5, 15),
  makeDescriptor("plants_foliage", "lutebus", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 5, density: 0.45 }, ["betterend:lutebus"], 5, 15),
  makeDescriptor("plants_foliage", "lamellarium", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 5, density: 0.45 }, ["betterend:lamellarium"], 5, 15),
  makeDescriptor("plants_foliage", "small_amaranita", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 5, density: 0.4 }, ["betterend:small_amaranita_mushroom"], 5, 15),
  makeDescriptor("plants_foliage", "globulagus", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 5, density: 0.45 }, ["betterend:globulagus"], 5, 15),
  makeDescriptor("plants_foliage", "clawfern", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 5, density: 0.45 }, ["betterend:clawfern"], 5, 15),
  makeDescriptor("plants_foliage", "inflexia", "VEGETAL_DECORATION", { type: "scatter_plant", radius: 5, density: 0.45 }, ["betterend:inflexia"], 5, 15),

  // --- Category 3: Water / Aquatic Features (17) ---
  makeDescriptor("water_aquatic", "bubble_coral", "VEGETAL_DECORATION", { type: "underwater_scatter", radius: 6, density: 0.45 }, ["betterend:bubble_coral"], 6, 20),
  makeDescriptor("water_aquatic", "bubble_coral_rare", "VEGETAL_DECORATION", { type: "underwater_scatter", radius: 5, density: 0.2 }, ["betterend:bubble_coral"], 5, 20),
  makeDescriptor("water_aquatic", "end_lily", "VEGETAL_DECORATION", { type: "water_column_plant", radius: 6, density: 0.35 }, ["betterend:end_lily", "betterend:end_lily_leaf"], 6, 25),
  makeDescriptor("water_aquatic", "end_lily_rare", "VEGETAL_DECORATION", { type: "water_column_plant", radius: 5, density: 0.15 }, ["betterend:end_lily", "betterend:end_lily_leaf"], 5, 25),
  makeDescriptor("water_aquatic", "end_lotus", "VEGETAL_DECORATION", { type: "water_column_plant", radius: 6, density: 0.4 }, ["betterend:end_lotus_stem", "betterend:end_lotus_flower"], 6, 25),
  makeDescriptor("water_aquatic", "end_lotus_leaf", "VEGETAL_DECORATION", { type: "floating_pad_3x3", radius: 6, density: 0.35 }, ["betterend:end_lotus_leaf"], 6, 25),
  makeDescriptor("water_aquatic", "hydralux", "VEGETAL_DECORATION", { type: "water_column_plant", radius: 5, density: 0.35 }, ["betterend:hydralux", "betterend:hydralux_petal_block", "betterend:hydralux_sapling"], 5, 25),
  makeDescriptor("water_aquatic", "pond_anemone", "VEGETAL_DECORATION", { type: "underwater_scatter", radius: 5, density: 0.35 }, ["betterend:pond_anemone"], 5, 20),
  makeDescriptor("water_aquatic", "menger_sponge", "VEGETAL_DECORATION", { type: "underwater_sponge_cluster", radius: 5, density: 0.25 }, ["betterend:menger_sponge_wet", "betterend:menger_sponge"], 5, 25),
  makeDescriptor("water_aquatic", "flamaea", "VEGETAL_DECORATION", { type: "water_surface_scatter", radius: 5, density: 0.4 }, ["betterend:flamaea"], 5, 20),
  makeDescriptor("water_aquatic", "charnia_red", "VEGETAL_DECORATION", { type: "underwater_scatter", radius: 6, density: 0.5 }, ["betterend:charnia_red"], 6, 15),
  makeDescriptor("water_aquatic", "charnia_purple", "VEGETAL_DECORATION", { type: "underwater_scatter", radius: 6, density: 0.5 }, ["betterend:charnia_purple"], 6, 15),
  makeDescriptor("water_aquatic", "charnia_cyan", "VEGETAL_DECORATION", { type: "underwater_scatter", radius: 6, density: 0.5 }, ["betterend:charnia_cyan"], 6, 15),
  makeDescriptor("water_aquatic", "charnia_light_blue", "VEGETAL_DECORATION", { type: "underwater_scatter", radius: 6, density: 0.5 }, ["betterend:charnia_light_blue"], 6, 15),
  makeDescriptor("water_aquatic", "charnia_orange", "VEGETAL_DECORATION", { type: "underwater_scatter", radius: 6, density: 0.5 }, ["betterend:charnia_orange"], 6, 15),
  makeDescriptor("water_aquatic", "charnia_green", "VEGETAL_DECORATION", { type: "underwater_scatter", radius: 6, density: 0.5 }, ["betterend:charnia_green"], 6, 15),
  makeDescriptor("water_aquatic", "charnia_red_rare", "VEGETAL_DECORATION", { type: "underwater_scatter", radius: 5, density: 0.2 }, ["betterend:charnia_red"], 5, 15),

  // --- Category 4: Geologic, Crystals, Spires & Lakes (15) ---
  makeDescriptor("geologic", "spire", "RAW_GENERATION", { type: "sdf_cone_stack", segments: [3, 7], density: 0.2 }, ["minecraft:end_stone", "betterend:pink_moss"], 12, 85),
  makeDescriptor("geologic", "floating_spire", "RAW_GENERATION", { type: "sdf_mirrored_cone_spire", segments: [6, 14], density: 0.15 }, ["minecraft:end_stone", "betterend:pink_moss"], 12, 85),
  makeDescriptor("geologic", "ice_star", "RAW_GENERATION", { type: "fibonacci_cone_star", minSize: 5, maxSize: 15, spikes: [15, 25], density: 0.25 }, ["betterend:dense_snow", "betterend:emerald_ice", "betterend:dense_emerald_ice", "betterend:ancient_emerald_ice"], 16, 85),
  makeDescriptor("geologic", "ice_star_small", "RAW_GENERATION", { type: "fibonacci_cone_star", minSize: 3, maxSize: 5, spikes: [10, 15], density: 0.4 }, ["betterend:dense_snow", "betterend:emerald_ice", "betterend:dense_emerald_ice", "betterend:ancient_emerald_ice"], 6, 70),
  makeDescriptor("geologic", "umbralith_arch", "SURFACE_STRUCTURES", { type: "sdf_torus_arch", minRadius: 10, maxRadius: 20, density: 0.18 }, ["betterend:umbralith", "betterend:pallidium_full", "betterend:pallidium_heavy"], 20, 85),
  makeDescriptor("geologic", "thin_umbralith_arch", "SURFACE_STRUCTURES", { type: "spline_arch_cluster", minRadius: 8, maxRadius: 16, density: 0.22 }, ["betterend:umbralith"], 16, 80),
  makeDescriptor("geologic", "amber_root", "RAW_GENERATION", { type: "sdf_torus_arch", minRadius: 8, maxRadius: 16, density: 0.2 }, ["betterend:raw_amber", "betterend:amber_moss"], 16, 80),
  makeDescriptor("geologic", "obsidian_pillar_basement", "SURFACE_STRUCTURES", { type: "sdf_sheared_cone", minHeight: 10, maxHeight: 35, density: 0.2 }, ["minecraft:obsidian", "betterend:mossy_obsidian"], 6, 75),
  makeDescriptor("geologic", "obsidian_boulder", "SURFACE_STRUCTURES", { type: "sdf_sphere_boulder_cluster", radius: [1, 5], density: 0.25 }, ["minecraft:obsidian", "betterend:mossy_obsidian"], 7, 70),
  makeDescriptor("geologic", "fallen_pillar", "SURFACE_STRUCTURES", { type: "sdf_tilted_cylinder", length: [20, 40], radius: [2, 4], density: 0.18 }, ["minecraft:obsidian", "betterend:mossy_obsidian"], 20, 80),
  makeDescriptor("geologic", "desert_lake", "LAKES", { type: "oasis_basin", minRadius: 8, maxRadius: 16, density: 0.25 }, ["minecraft:water", "betterend:endstone_dust", "betterend:end_moss", "minecraft:end_stone"], 16, 85),
  makeDescriptor("geologic", "pond_with_waterfall", "LAKES", { type: "perched_spillway_basin", minRadius: 5, maxRadius: 8, density: 0.35 }, ["minecraft:water", "betterend:end_moss", "minecraft:end_stone"], 10, 80),
  makeDescriptor("geologic", "geyser", "LAKES", { type: "hydrothermal_geyser_cavity", radius: [4, 8], density: 0.2 }, ["betterend:brimstone", "betterend:sulphuric_rock", "betterend:hydrothermal_vent", "betterend:sulphur_crystal", "minecraft:water"], 10, 85),
  makeDescriptor("geologic", "sulphuric_lake", "LAKES", { type: "terraced_brimstone_lake", minRadius: 10, maxRadius: 20, density: 0.2 }, ["minecraft:water", "betterend:brimstone", "betterend:sulphuric_rock", "betterend:sulphur_crystal"], 20, 85),
  makeDescriptor("geologic", "sulphur_hill", "SURFACE_STRUCTURES", { type: "travertine_terraced_pools", pools: [5, 13], radius: [5, 9], density: 0.2 }, ["betterend:brimstone", "betterend:sulphuric_rock", "minecraft:water"], 12, 80),

  // --- Category 5: Ores & Subsurface Layers (6) ---
  makeDescriptor("ores_layers", "ender_ore", "UNDERGROUND_ORES", { type: "vein_ore", veinSize: 8, veinsPerChunk: 12, minY: 12, maxY: 96 }, ["betterend:ender_ore", "minecraft:end_stone"], 4, 50),
  makeDescriptor("ores_layers", "amber_ore", "UNDERGROUND_ORES", { type: "vein_ore", veinSize: 6, veinsPerChunk: 10, minY: 16, maxY: 88 }, ["betterend:amber_ore", "minecraft:end_stone"], 4, 50),
  makeDescriptor("ores_layers", "thallasium_ore", "UNDERGROUND_ORES", { type: "vein_ore", veinSize: 9, veinsPerChunk: 16, minY: 8, maxY: 112 }, ["betterend:thallasium_ore", "minecraft:end_stone"], 4, 50),
  makeDescriptor("ores_layers", "dragon_bone_block_ore", "UNDERGROUND_ORES", { type: "vein_ore", veinSize: 8, veinsPerChunk: 8, minY: 20, maxY: 80 }, ["minecraft:bone_block", "betterend:mossy_dragon_bone", "minecraft:end_stone"], 4, 50),
  makeDescriptor("ores_layers", "flavolite_layer", "UNDERGROUND_ORES", { type: "sdf_ore_layer", radius: 24, minY: 16, maxY: 80 }, ["betterend:flavolite", "minecraft:end_stone"], 16, 55),
  makeDescriptor("ores_layers", "violecite_layer", "UNDERGROUND_ORES", { type: "sdf_ore_layer", radius: 24, minY: 16, maxY: 80 }, ["betterend:violecite", "minecraft:end_stone"], 16, 55),

  // --- Category 6: Caves & Underground Decoration (7) ---
  makeDescriptor("caves", "tunel_cave", "LOCAL_MODIFICATIONS", { type: "tunnel_carver", minY: 8, maxY: 64, density: 0.35 }, ["minecraft:air", "minecraft:end_stone"], 16, 90),
  makeDescriptor("caves", "round_cave", "RAW_GENERATION", { type: "spherical_cave_carver", radius: [12, 28], minY: 12, maxY: 56, density: 0.25 }, ["minecraft:air", "minecraft:end_stone"], 20, 90),
  makeDescriptor("caves", "cave_surface_coat", "UNDERGROUND_DECORATION", { type: "chunk_cave_shell_coater", shellDepth: 5, minY: 4, maxY: 72, density: 1.0 }, ["betterend:cave_moss", "betterend:virid_jadestone", "betterend:azure_jadestone", "betterend:sandy_jadestone", "minecraft:end_stone"], 16, 65),
  makeDescriptor("caves", "end_stone_stalactite_cluster", "UNDERGROUND_DECORATION", { type: "stalactite_cluster", radius: [4, 8], maxLength: 15, density: 0.45 }, ["betterend:end_stone_stalactite", "betterend:end_stone_stalactite_cavemoss"], 8, 45),
  makeDescriptor("caves", "smaragdant_crystal", "UNDERGROUND_DECORATION", { type: "crystal_spire_cluster", count: [15, 30], radius: 5, density: 0.35 }, ["betterend:smaragdant_crystal", "betterend:budding_smaragdant_crystal", "betterend:smaragdant_crystal_shard"], 6, 60),
  makeDescriptor("caves", "big_aurora_crystal", "UNDERGROUND_DECORATION", { type: "tilted_hex_prism", minHeight: 5, maxHeight: 25, radius: [1.7, 3.0], rarityDivisor: 10 }, ["betterend:aurora_crystal"], 6, 65),
  makeDescriptor("caves", "cave_pumpkin", "UNDERGROUND_DECORATION", { type: "ceiling_hanging_gourd", minY: 10, maxY: 52, density: 0.2 }, ["betterend:cave_pumpkin_seed", "betterend:cave_pumpkin"], 3, 30),

  // --- Category 7: Giant & Surface Structures (14) ---
  makeDescriptor("structures", "mountain", "RAW_GENERATION", { type: "crystal_mountain_cone", spacing: 3, separation: 2, salt: 1192828158, minRadius: 50, maxRadius: 100 }, ["minecraft:end_stone", "betterend:crystal_moss", "betterend:aurora_crystal"], 64, 100),
  makeDescriptor("structures", "painted_mountain", "RAW_GENERATION", { type: "painted_strata_cone", spacing: 3, separation: 2, salt: 1192828158, minRadius: 50, maxRadius: 100 }, ["minecraft:end_stone", "betterend:flavolite", "betterend:violecite", "betterend:endstone_dust"], 64, 100),
  makeDescriptor("structures", "megalake", "LAKES", { type: "ellipsoid_lake_basin", spacing: 4, separation: 1, salt: 1890982538, minRadius: 32, maxRadius: 64 }, ["minecraft:water", "betterend:end_moss", "betterend:endstone_dust", "minecraft:end_stone"], 64, 95),
  makeDescriptor("structures", "megalake_small", "LAKES", { type: "ellipsoid_lake_basin", spacing: 4, separation: 1, salt: 1890982538, minRadius: 20, maxRadius: 40 }, ["minecraft:water", "betterend:end_moss", "minecraft:end_stone"], 40, 95),
  makeDescriptor("structures", "end_lake", "LAKES", { type: "carved_shore_lake", spacing: 6, separation: 1, salt: 656268008, minRadius: 10, maxRadius: 20 }, ["minecraft:water", "betterend:endstone_dust", "minecraft:end_stone"], 24, 90),
  makeDescriptor("structures", "end_lake_normal", "LAKES", { type: "carved_shore_lake", spacing: 5, separation: 2, salt: 8955736, minRadius: 10, maxRadius: 20 }, ["minecraft:water", "betterend:endstone_dust", "minecraft:end_stone"], 24, 90),
  makeDescriptor("structures", "end_lake_rare", "LAKES", { type: "carved_shore_lake", spacing: 6, separation: 2, salt: 1340454045, minRadius: 10, maxRadius: 20 }, ["minecraft:water", "betterend:endstone_dust", "minecraft:end_stone"], 24, 90),
  makeDescriptor("structures", "sulphuric_cave", "RAW_GENERATION", { type: "subsurface_brimstone_cavern", spacing: 9, separation: 4, salt: 1073037128, minRadius: 10, maxRadius: 30 }, ["betterend:sulphuric_rock", "betterend:brimstone", "betterend:sulphur_crystal", "betterend:hydrothermal_vent", "betterend:tube_worm", "minecraft:water"], 32, 95),
  makeDescriptor("structures", "giant_mossy_glowshroom", "SURFACE_STRUCTURES", { type: "giant_sdf_glowshroom", spacing: 16, separation: 8, salt: 229646284, scale: [2.0, 3.5] }, ["betterend:mossy_glowshroom_bark", "betterend:mossy_glowshroom_log", "betterend:mossy_glowshroom_cap", "betterend:mossy_glowshroom_hymenophore", "betterend:mossy_glowshroom_fur"], 32, 95),
  makeDescriptor("structures", "giant_ice_star", "SURFACE_STRUCTURES", { type: "giant_void_ice_star", spacing: 16, separation: 8, salt: 776927947, minSize: 20, maxSize: 35, spikes: [25, 40] }, ["betterend:dense_snow", "betterend:emerald_ice", "betterend:dense_emerald_ice", "betterend:ancient_emerald_ice"], 36, 95),
  makeDescriptor("structures", "small_island", "RAW_GENERATION", { type: "aerial_capped_cone_island", spacing: 5, separation: 2, salt: 448084798, minRadius: 6, maxRadius: 17, yRange: [48, 104] }, ["minecraft:end_stone", "betterend:end_moss", "betterend:sangnum", "betterend:pallidium_full", "betterend:umbralith"], 20, 95),
  makeDescriptor("structures", "end_bridge", "SURFACE_STRUCTURES", { type: "parabolic_island_bridge", spacing: 6, separation: 2, salt: 1178516510, span: [24, 96], width: 5 }, ["minecraft:end_stone_bricks", "betterend:cracked_end_stone_bricks", "betterend:weathered_end_stone_bricks", "minecraft:end_stone_brick_wall"], 48, 90),
  makeDescriptor("structures", "eternal_portal", "RAW_GENERATION", { type: "nbt_portal_shrine", spacing: 40, separation: 12, salt: 1502528157, minDistanceFromOrigin: 512 }, ["betterend:eternal_pedestal", "betterend:flavolite_runed_eternal", "betterend:flavolite_pillar", "betterend:flavolite_tiles"], 16, 100),
  makeDescriptor("structures", "end_village", "SURFACE_STRUCTURES", { type: "jigsaw_village", spacing: 34, separation: 8, salt: 147624381, maxDistanceFromCenter: 80, size: 6 }, ["minecraft:end_stone_bricks", "betterend:flavolite_bricks", "betterend:violecite_bricks", "minecraft:purpur_block"], 64, 100)
]);

/**
 * Additional placed-feature variants and sub-variants mapped for 100% biome feature resolution.
 */
const SUPPLEMENTAL_FEATURE_ALIASES = Object.freeze([
  makeDescriptor("structures", "crashed_ship", "SURFACE_STRUCTURES", { type: "nbt_shipwreck", rarityChunks: 580, minY: 58 }, ["minecraft:purpur_block", "minecraft:end_stone_bricks", "minecraft:obsidian"], 16, 85),
  makeDescriptor("plants_foliage", "silk_moth_nest", "VEGETAL_DECORATION", { type: "canopy_hanging_nest", density: 0.1 }, ["betterend:silk_moth_nest"], 2, 25),
  makeDescriptor("plants_foliage", "purple_polypore", "VEGETAL_DECORATION", { type: "wall_plant", density: 0.35 }, ["betterend:purple_polypore"], 3, 15),
  makeDescriptor("plants_foliage", "aurant_polypore", "VEGETAL_DECORATION", { type: "wall_plant", density: 0.35 }, ["betterend:aurant_polypore"], 3, 15),
  makeDescriptor("plants_foliage", "tail_moss", "VEGETAL_DECORATION", { type: "wall_plant", density: 0.4 }, ["betterend:tail_moss"], 4, 15),
  makeDescriptor("plants_foliage", "tail_moss_wood", "VEGETAL_DECORATION", { type: "wall_plant_on_log", density: 0.4 }, ["betterend:tail_moss"], 4, 15),
  makeDescriptor("plants_foliage", "cyan_moss", "VEGETAL_DECORATION", { type: "wall_plant", density: 0.4 }, ["betterend:cyan_moss"], 4, 15),
  makeDescriptor("plants_foliage", "cyan_moss_wood", "VEGETAL_DECORATION", { type: "wall_plant_on_log", density: 0.4 }, ["betterend:cyan_moss"], 4, 15),
  makeDescriptor("plants_foliage", "twisted_moss", "VEGETAL_DECORATION", { type: "wall_plant", density: 0.4 }, ["betterend:twisted_moss"], 4, 15),
  makeDescriptor("plants_foliage", "twisted_moss_wood", "VEGETAL_DECORATION", { type: "wall_plant_on_log", density: 0.4 }, ["betterend:twisted_moss"], 4, 15),
  makeDescriptor("plants_foliage", "bulb_moss", "VEGETAL_DECORATION", { type: "wall_plant", density: 0.4 }, ["betterend:bulb_moss"], 4, 15),
  makeDescriptor("plants_foliage", "bulb_moss_wood", "VEGETAL_DECORATION", { type: "wall_plant_on_log", density: 0.4 }, ["betterend:bulb_moss"], 4, 15),
  makeDescriptor("plants_foliage", "small_jellyshroom_wall", "VEGETAL_DECORATION", { type: "wall_plant", density: 0.35 }, ["betterend:small_jellyshroom"], 4, 15),
  makeDescriptor("plants_foliage", "small_jellyshroom_wood", "VEGETAL_DECORATION", { type: "wall_plant_on_log", density: 0.35 }, ["betterend:small_jellyshroom"], 4, 15),
  makeDescriptor("plants_foliage", "small_jellyshroom_ceil", "VEGETAL_DECORATION", { type: "inverted_ceiling_scatter", density: 0.35 }, ["betterend:small_jellyshroom"], 4, 15),
  makeDescriptor("plants_foliage", "jungle_fern_wood", "VEGETAL_DECORATION", { type: "wall_plant_on_log", density: 0.35 }, ["betterend:jungle_fern"], 4, 15),
  makeDescriptor("plants_foliage", "ruscus", "VEGETAL_DECORATION", { type: "wall_plant", density: 0.4 }, ["betterend:ruscus"], 4, 15),
  makeDescriptor("plants_foliage", "ruscus_wood", "VEGETAL_DECORATION", { type: "wall_plant_on_log", density: 0.4 }, ["betterend:ruscus"], 4, 15),
  makeDescriptor("plants_foliage", "bushy_grass_wg", "VEGETAL_DECORATION", { type: "wall_plant_on_log", density: 0.35 }, ["betterend:bushy_grass"], 4, 15),
  makeDescriptor("plants_foliage", "crystal_moss_cover", "VEGETAL_DECORATION", { type: "scatter_plant", density: 0.4 }, ["betterend:crystal_moss_cover"], 5, 15),
  makeDescriptor("plants_foliage", "umbrella_moss_rare", "VEGETAL_DECORATION", { type: "scatter_plant", density: 0.2 }, ["betterend:umbrella_moss"], 5, 15),
  makeDescriptor("plants_foliage", "creeping_moss_rare", "VEGETAL_DECORATION", { type: "scatter_plant", density: 0.2 }, ["betterend:creeping_moss"], 5, 15),
  makeDescriptor("plants_foliage", "twisted_umbrella_moss_rare", "VEGETAL_DECORATION", { type: "double_plant_scatter", density: 0.2 }, ["betterend:twisted_umbrella_moss"], 5, 15),
  makeDescriptor("plants_foliage", "bolux_mushroom", "VEGETAL_DECORATION", { type: "scatter_plant", density: 0.35 }, ["betterend:bolux_mushroom"], 4, 15),
  makeDescriptor("plants_foliage", "chorus_mushroom", "VEGETAL_DECORATION", { type: "scatter_plant", density: 0.35 }, ["betterend:chorus_mushroom"], 4, 15),
  makeDescriptor("plants_foliage", "flammalix", "VEGETAL_DECORATION", { type: "scatter_plant", density: 0.35 }, ["betterend:flammalix"], 4, 15),
  makeDescriptor("geologic", "surface_vent", "SURFACE_STRUCTURES", { type: "chimney_vent_cluster", count: [15, 30], density: 0.25 }, ["betterend:sulphuric_rock", "betterend:hydrothermal_vent"], 6, 65),
  makeDescriptor("geologic", "sulphur_spike", "UNDERGROUND_DECORATION", { type: "crystal_spike", density: 0.3 }, ["betterend:sulphur_crystal"], 4, 35),
  makeDescriptor("geologic", "sulphur_spike_hanging", "UNDERGROUND_DECORATION", { type: "hanging_crystal_spike", density: 0.3 }, ["betterend:sulphur_crystal"], 4, 35),
  makeDescriptor("caves", "end_stone_stalactite", "UNDERGROUND_DECORATION", { type: "stalactite_scatter", density: 0.4 }, ["betterend:end_stone_stalactite"], 5, 40),
  makeDescriptor("caves", "end_stone_stalagmite", "UNDERGROUND_DECORATION", { type: "stalagmite_scatter", density: 0.4 }, ["betterend:end_stone_stalactite"], 5, 40),
  makeDescriptor("caves", "end_stone_stalactite_cavemoss", "UNDERGROUND_DECORATION", { type: "stalactite_scatter", density: 0.4 }, ["betterend:end_stone_stalactite_cavemoss"], 5, 40),
  makeDescriptor("caves", "end_stone_stalagmite_cavemoss", "UNDERGROUND_DECORATION", { type: "stalagmite_scatter", density: 0.4 }, ["betterend:end_stone_stalactite_cavemoss"], 5, 40),
  makeDescriptor("caves", "end_stone_stalactite_cavemoss_cluster", "UNDERGROUND_DECORATION", { type: "stalactite_cluster", density: 0.45 }, ["betterend:end_stone_stalactite_cavemoss"], 8, 45),
  makeDescriptor("caves", "smaragdant_crystal_shard", "UNDERGROUND_DECORATION", { type: "crystal_shard_scatter", density: 0.4 }, ["betterend:smaragdant_crystal_shard"], 5, 35),
  makeDescriptor("caves", "cave_bush", "UNDERGROUND_DECORATION", { type: "sdf_bush_outer", density: 0.35 }, ["betterend:cave_bush"], 4, 35),
  makeDescriptor("caves", "cave_grass", "UNDERGROUND_DECORATION", { type: "scatter_plant", density: 0.45 }, ["betterend:cave_grass"], 5, 20),
  makeDescriptor("caves", "rubinea", "UNDERGROUND_DECORATION", { type: "hanging_vine", maxLength: 8, density: 0.35 }, ["betterend:rubinea"], 4, 20),
  makeDescriptor("caves", "magnula", "UNDERGROUND_DECORATION", { type: "hanging_vine", maxLength: 8, density: 0.35 }, ["betterend:magnula"], 4, 20)
]);

export const FEATURES_BY_CATEGORY = Object.freeze({
  trees: Object.freeze(FEATURE_STRUCTURE_CATALOGUE.filter((f) => f.category === "trees")),
  plants_foliage: Object.freeze(FEATURE_STRUCTURE_CATALOGUE.filter((f) => f.category === "plants_foliage")),
  water_aquatic: Object.freeze(FEATURE_STRUCTURE_CATALOGUE.filter((f) => f.category === "water_aquatic")),
  geologic: Object.freeze(FEATURE_STRUCTURE_CATALOGUE.filter((f) => f.category === "geologic")),
  ores_layers: Object.freeze(FEATURE_STRUCTURE_CATALOGUE.filter((f) => f.category === "ores_layers")),
  caves: Object.freeze(FEATURE_STRUCTURE_CATALOGUE.filter((f) => f.category === "caves")),
  structures: Object.freeze(FEATURE_STRUCTURE_CATALOGUE.filter((f) => f.category === "structures"))
});

export const FEATURES_BY_ID = new Map(
  [...FEATURE_STRUCTURE_CATALOGUE, ...SUPPLEMENTAL_FEATURE_ALIASES].flatMap((entry) => [
    [entry.id, entry],
    [entry.upstreamId, entry],
    [entry.bedrockId, entry]
  ])
);
