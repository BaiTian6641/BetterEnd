import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRecipeHyperedgeGraph } from './recipes.mjs';
import { loadLockedRuntime } from './runtime-reconciliation.mjs';
import { compareText } from './source-files.mjs';
import { compileAllModelsAndAssets, getGeometryIdForModel, normalizeModelId } from './model-compiler.mjs';
import { compileAllMcStructures } from './mcstructure-compiler.mjs';
import {
  FEATURES_BY_CATEGORY,
  FEATURES_BY_ID,
  REGION_CATALOGUE,
} from '../runtime/regions/region-catalogue.js';
import {
  AURORA_PALETTE,
  BULB_LANTERN_COLORS,
  HELIX_LEAVES_GRADIENT,
  HYDRALUX_PETAL_COLORS,
  JELLYSHROOM_CAP_GRADIENT,
  TENANEA_PALETTE,
} from './png-codec.mjs';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(toolsDir, '../..');

export const BEDROCK_BLOCK_FORMAT_VERSION = '1.26.20';
export const BEDROCK_ITEM_FORMAT_VERSION = '1.26.30';
export const BEDROCK_RECIPE_FORMAT_VERSION = '1.20.10';
export const BEDROCK_SERVER_ENTITY_FORMAT_VERSION = '1.26.40';
export const BEDROCK_CLIENT_ENTITY_FORMAT_VERSION = '1.10.0';
export const BEDROCK_FEATURE_FORMAT_VERSION = '1.13.0';
export const MAX_BLOCK_PERMUTATIONS = 64;
export const MAX_BLOCK_TRAITS = 16;

const MAP_COLOR_HEX = Object.freeze({
  NONE: '#000000',
  GRASS: '#7FB238',
  SAND: '#F7E9A3',
  WOOL: '#C7C7C7',
  FIRE: '#FF0000',
  ICE: '#A0A0FF',
  METAL: '#A7A7A7',
  PLANT: '#007C00',
  SNOW: '#FFFFFF',
  CLAY: '#A4A8B8',
  DIRT: '#976D4D',
  STONE: '#707070',
  WATER: '#4040FF',
  WOOD: '#8F7748',
  QUARTZ: '#FFFCF5',
  COLOR_ORANGE: '#D87F33',
  COLOR_MAGENTA: '#B24CD8',
  COLOR_LIGHT_BLUE: '#6699D8',
  COLOR_YELLOW: '#E5E533',
  COLOR_LIGHT_GREEN: '#7FCC19',
  COLOR_PINK: '#F27FA5',
  COLOR_GRAY: '#4C4C4C',
  COLOR_LIGHT_GRAY: '#999999',
  COLOR_CYAN: '#4C7F99',
  COLOR_PURPLE: '#7F3FB2',
  COLOR_BLUE: '#334CB2',
  COLOR_BROWN: '#664C33',
  COLOR_GREEN: '#667F33',
  COLOR_RED: '#993333',
  COLOR_BLACK: '#191919',
  GOLD: '#FAEE4D',
  DIAMOND: '#5CDBD5',
  LAPIS: '#4A80FF',
  EMERALD: '#00D93A',
  PODZOL: '#815631',
  NETHER: '#700200',
  TERRACOTTA_WHITE: '#D1B1A1',
  TERRACOTTA_ORANGE: '#9F5224',
  TERRACOTTA_MAGENTA: '#95576C',
  TERRACOTTA_LIGHT_BLUE: '#706C8A',
  TERRACOTTA_YELLOW: '#BA8524',
  TERRACOTTA_LIGHT_GREEN: '#677535',
  TERRACOTTA_PINK: '#A04D4E',
  TERRACOTTA_GRAY: '#392923',
  TERRACOTTA_LIGHT_GRAY: '#876B62',
  TERRACOTTA_CYAN: '#575C5C',
  TERRACOTTA_PURPLE: '#7A4958',
  TERRACOTTA_BLUE: '#4C3E5C',
  TERRACOTTA_BROWN: '#4C3223',
  TERRACOTTA_GREEN: '#4C522A',
  TERRACOTTA_RED: '#8E3C2E',
  TERRACOTTA_BLACK: '#251610',
  CRIMSON_NYLIUM: '#BD3031',
  CRIMSON_STEM: '#943F61',
  CRIMSON_HYPHAE: '#5C191D',
  WARPED_NYLIUM: '#167E86',
  WARPED_STEM: '#3A8E8C',
  WARPED_HYPHAE: '#562C3E',
  WARPED_WART_BLOCK: '#14B485',
  DEEPSLATE: '#646464',
  RAW_IRON: '#D8AF93',
  GLOW_LICHEN: '#7FA796',
});

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function roundBoxVal(val) {
  return Math.round(val * 1000) / 1000;
}

export function parseShapeStringBounds(shapeStr) {
  if (!shapeStr || shapeStr === 'empty' || typeof shapeStr !== 'string') {
    return null;
  }
  const regex = /\[([0-9.+-]+),([0-9.+-]+),([0-9.+-]+)\|([0-9.+-]+),([0-9.+-]+),([0-9.+-]+)\]/g;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let matched = false;
  let m;
  while ((m = regex.exec(shapeStr)) !== null) {
    matched = true;
    minX = Math.min(minX, Number(m[1]));
    minY = Math.min(minY, Number(m[2]));
    minZ = Math.min(minZ, Number(m[3]));
    maxX = Math.max(maxX, Number(m[4]));
    maxY = Math.max(maxY, Number(m[5]));
    maxZ = Math.max(maxZ, Number(m[6]));
  }
  return matched ? [minX, minY, minZ, maxX, maxY, maxZ] : null;
}

export function boundsToBedrockBox(boundsOrShapeStr, shapeKind, { isCollision = false } = {}) {
  const bounds =
    typeof boundsOrShapeStr === 'string'
      ? parseShapeStringBounds(boundsOrShapeStr)
      : boundsOrShapeStr;
  if (shapeKind === 'empty' || boundsOrShapeStr === 'empty' || !Array.isArray(bounds) || bounds.length !== 6) {
    return false;
  }
  const [minX, minY, minZ, maxX, maxY, maxZ] = bounds;
  if (maxX <= minX || maxY <= minY || maxZ <= minZ) {
    return false;
  }
  const maxAllowedY = isCollision ? 24 : 16;
  const ox = clamp(roundBoxVal(minX * 16 - 8), -8, 8);
  const oy = clamp(roundBoxVal(minY * 16), 0, 16);
  const oz = clamp(roundBoxVal(minZ * 16 - 8), -8, 8);
  const sx = clamp(roundBoxVal((maxX - minX) * 16), 0, 8 - ox);
  const sy = clamp(roundBoxVal((maxY - minY) * 16), 0, maxAllowedY - oy);
  const sz = clamp(roundBoxVal((maxZ - minZ) * 16), 0, 8 - oz);
  if (sx <= 0 || sy <= 0 || sz <= 0) {
    return false;
  }
  return {
    origin: [ox, oy, oz],
    size: [sx, sy, sz],
  };
}

function coerceTraitValue(rawValue, propDef) {
  if (
    propDef?.type === 'boolean' ||
    propDef?.javaType === 'java.lang.Boolean' ||
    rawValue === true ||
    rawValue === false ||
    rawValue === 'true' ||
    rawValue === 'false'
  ) {
    return rawValue === true || rawValue === 'true';
  }
  if (
    propDef?.type === 'int' ||
    propDef?.javaType === 'java.lang.Integer' ||
    typeof rawValue === 'number' ||
    /^-?\d+$/.test(String(rawValue))
  ) {
    return Number(rawValue);
  }
  return String(rawValue);
}

function formatMolangValue(val) {
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  return `'${String(val).replace(/'/g, "\\'")}'`;
}

export function extractBlockPropertiesAndStates(blockEntry) {
  if (blockEntry.stateModel?.properties && blockEntry.stateModel?.liveStates) {
    return {
      props: blockEntry.stateModel.properties,
      liveStates: blockEntry.stateModel.liveStates,
    };
  }
  const domains = blockEntry.runtime?.propertyDomains ?? {};
  const props = Object.entries(domains)
    .sort(([a], [b]) => compareText(a, b))
    .map(([name, info]) => ({
      name,
      javaType: info.javaType,
      domain: (info.values ?? []).map(v => coerceTraitValue(v, info)),
    }));
  const rawStates = blockEntry.runtime?.states ?? [];
  const liveStates =
    rawStates.length > 0
      ? rawStates.map((st, idx) => ({
          stateIndex: idx,
          properties: st.values ?? {},
          runtimeState: st,
        }))
      : [{ stateIndex: 0, properties: {}, runtimeState: {} }];
  return { props, liveStates };
}

/**
 * Partitions a block's state space into 1 or more Bedrock block definitions
 * such that EVERY partition has:
 * - <= 64 permutations
 * - Cartesian product of description.states <= 64
 * - <= 16 traits
 */
export function partitionBlockStates(blockEntry) {
  const { props, liveStates } = extractBlockPropertiesAndStates(blockEntry);
  const totalStates = liveStates.length;
  const orderTraitDomain = (propName, arr) =>
    propName === 'facing' && arr.includes('up')
      ? ['up', ...arr.filter(v => v !== 'up')]
      : arr;

  if (totalStates <= MAX_BLOCK_PERMUTATIONS && props.length <= MAX_BLOCK_TRAITS) {
    const traitDefs = Object.create(null);
    for (const p of props) {
      traitDefs[`betterend:${p.name}`] = orderTraitDomain(
        p.name,
        p.domain.map(v => coerceTraitValue(v, p)),
      );
    }
    return [
      {
        partitionIndex: 0,
        bedrockBlockId: blockEntry.id,
        fixedProperties: {},
        traitDefs,
        keptPropNames: props.map(p => p.name),
        states: liveStates,
      },
    ];
  }

  // Greedily select suffix properties whose domain product <= 64
  const keptProps = [];
  let product = 1;
  for (let i = props.length - 1; i >= 0; i -= 1) {
    const p = props[i];
    const len = p.domain.length;
    if (product * len <= MAX_BLOCK_PERMUTATIONS && keptProps.length + 1 <= MAX_BLOCK_TRAITS) {
      keptProps.unshift(p);
      product *= len;
    } else {
      break;
    }
  }

  const keptNames = new Set(keptProps.map(p => p.name));
  const outerProps = props.filter(p => !keptNames.has(p.name));

  // If the last outer property can be sliced to fit into remaining capacity (e.g. anvils), slice it!
  let slicedProp = null;
  let sliceSize = 1;
  if (outerProps.length > 0) {
    const candidate = outerProps[outerProps.length - 1];
    const maxSlice = Math.floor(MAX_BLOCK_PERMUTATIONS / product);
    if (maxSlice >= 2 && keptProps.length + 1 <= MAX_BLOCK_TRAITS) {
      slicedProp = outerProps.pop();
      sliceSize = maxSlice;
    }
  }

  // Group liveStates by outerProps + slice bucket
  const buckets = new Map();
  for (const st of liveStates) {
    const fixed = Object.create(null);
    const keyParts = [];
    for (const op of outerProps) {
      const val = st.properties[op.name];
      fixed[op.name] = val;
      keyParts.push(`${op.name}=${val}`);
    }
    let sliceBucket = 0;
    if (slicedProp) {
      const domainIdx = slicedProp.domain.findIndex(
        d => String(d) === String(st.properties[slicedProp.name]),
      );
      sliceBucket = Math.floor(Math.max(0, domainIdx) / sliceSize);
      keyParts.push(`${slicedProp.name}#slice${sliceBucket}`);
    }
    const key = keyParts.join(',');
    if (!buckets.has(key)) {
      buckets.set(key, {
        fixedProperties: fixed,
        sliceBucket,
        states: [],
      });
    }
    buckets.get(key).states.push(st);
  }

  const partitions = [];
  let idx = 0;
  for (const bucket of buckets.values()) {
    const traitDefs = Object.create(null);
    const activePropNames = [];
    if (slicedProp) {
      const start = bucket.sliceBucket * sliceSize;
      const subDomain = slicedProp.domain.slice(start, start + sliceSize);
      if (subDomain.length > 1) {
        traitDefs[`betterend:${slicedProp.name}`] = orderTraitDomain(
          slicedProp.name,
          subDomain.map(v => coerceTraitValue(v, slicedProp)),
        );
        activePropNames.push(slicedProp.name);
      } else if (subDomain.length === 1) {
        bucket.fixedProperties[slicedProp.name] = subDomain[0];
      }
    }
    for (const kp of keptProps) {
      traitDefs[`betterend:${kp.name}`] = orderTraitDomain(
        kp.name,
        kp.domain.map(v => coerceTraitValue(v, kp)),
      );
      activePropNames.push(kp.name);
    }

    const bedrockBlockId = idx === 0 ? blockEntry.id : `${blockEntry.id}__p${idx}`;
    partitions.push({
      partitionIndex: idx,
      bedrockBlockId,
      fixedProperties: bucket.fixedProperties,
      traitDefs,
      keptPropNames: activePropNames,
      states: bucket.states,
    });
    idx += 1;
  }

  return partitions;
}

function classifyRenderMethod(blockEntry, flatModel) {
  const shortName = blockEntry.id.split(':')[1];
  const className = blockEntry.hierarchy?.at(-1) ?? '';
  if (
    shortName.includes('ice') ||
    shortName.includes('jellyshroom_cap') ||
    shortName.includes('slime') ||
    shortName.includes('membrane') ||
    shortName.includes('aurora_crystal') ||
    (shortName.includes('smaragdant_crystal') && !shortName.includes('shard')) ||
    shortName.includes('amber_block')
  ) {
    return 'blend';
  }
  if (
    (flatModel?.geometryKind && flatModel.geometryKind !== 'full_block') ||
    blockEntry.stateSnapshot?.collisionShape === 'empty' ||
    blockEntry.stateSnapshot?.occludes === false ||
    shortName.includes('leaves') ||
    shortName.includes('vine') ||
    shortName.includes('fern') ||
    shortName.includes('grass') ||
    shortName.includes('sapling') ||
    shortName.includes('flower') ||
    shortName.includes('bush') ||
    shortName.includes('sponge') ||
    shortName.includes('hymenophore') ||
    shortName.includes('fur') ||
    shortName.includes('cluster') ||
    shortName.includes('root') ||
    shortName.includes('weed') ||
    shortName.includes('lotus') ||
    shortName.includes('lantern') ||
    shortName.includes('chandelier') ||
    shortName.includes('door') ||
    shortName.includes('trapdoor') ||
    shortName.includes('ladder') ||
    shortName.includes('bars') ||
    shortName.includes('chain') ||
    shortName.includes('gate') ||
    shortName.includes('fence') ||
    className.includes('Plant') ||
    className.includes('Vine') ||
    className.includes('Leaves') ||
    className.includes('Sapling')
  ) {
    return 'alpha_test';
  }
  return 'opaque';
}

function resolveTintTextureOverride(shortName, stateProps = {}) {
  if (shortName === 'aurora_crystal') {
    return 'betterend_aurora_crystal_tint_0';
  }
  if (shortName === 'tenanea_flowers') {
    return 'betterend_tenanea_flowers_tint_0';
  }
  if (shortName === 'helix_tree_leaves') {
    const colorIdx = clamp(Number(stateProps.color ?? 0), 0, HELIX_LEAVES_GRADIENT.length - 1);
    return `betterend_helix_tree_leaves_color_${colorIdx}`;
  }
  if (shortName === 'jellyshroom_cap_purple') {
    const colorIdx = clamp(Number(stateProps.color ?? 0), 0, JELLYSHROOM_CAP_GRADIENT.length - 1);
    return `betterend_jellyshroom_cap_color_${colorIdx}`;
  }
  if (shortName === 'hydralux_petal_block') {
    return 'betterend_hydralux_petal_block_white';
  }
  for (const colorName of Object.keys(HYDRALUX_PETAL_COLORS)) {
    if (shortName === `hydralux_petal_block_${colorName}`) {
      return `betterend_hydralux_petal_block_${colorName}`;
    }
  }
  for (const colorName of Object.keys(BULB_LANTERN_COLORS)) {
    if (shortName.endsWith(`_bulb_lantern_${colorName}`)) {
      return `betterend_bulb_vine_lantern_bulb_${colorName}`;
    }
  }
  return null;
}

function extractTextureShortName(rawTex, fallbackShortName) {
  if (!rawTex || typeof rawTex !== 'string' || rawTex.startsWith('#')) {
    return `betterend_${fallbackShortName}`;
  }
  if (rawTex.startsWith('betterend:block/')) {
    return `betterend_${rawTex.slice('betterend:block/'.length)}`;
  }
  if (rawTex.startsWith('betterend:item/')) {
    return `betterend_${rawTex.slice('betterend:item/'.length)}`;
  }
  if (rawTex.startsWith('minecraft:block/')) {
    return `betterend_mc_${rawTex.slice('minecraft:block/'.length)}`;
  }
  return `betterend_${fallbackShortName}`;
}

function buildMaterialInstances(blockEntry, flatModel, stateProps = {}, geoDoc = null, terrainTextureData = null) {
  const shortName = blockEntry.id.split(':')[1];
  const renderMethod = classifyRenderMethod(blockEntry, flatModel);
  const tintOverride = resolveTintTextureOverride(shortName, stateProps);
  const isBulbLantern = tintOverride && shortName.includes('_bulb_lantern_');

  const textures = flatModel?.textures ?? {};
  const fallbackPrimary = extractTextureShortName(
    textures.all ??
      textures.cross ??
      textures.side ??
      textures.front ??
      textures.top ??
      textures.texture ??
      textures.wall ??
      textures.bars ??
      textures.particle ??
      Object.values(textures)[0],
    shortName,
  );
  const primaryTex = tintOverride ?? fallbackPrimary;

  const instances = {
    '*': {
      texture: primaryTex,
      render_method: renderMethod,
    },
  };

  for (const [slotName, rawTex] of Object.entries(textures)) {
    if (typeof rawTex === 'string' && !rawTex.startsWith('#')) {
      const useTint = tintOverride && (!isBulbLantern || slotName === 'glow' || slotName === 'cross');
      instances[slotName] = {
        texture: useTint ? tintOverride : extractTextureShortName(rawTex, shortName),
        render_method: renderMethod,
      };
    }
  }

  if (!tintOverride && flatModel?.geometryKind === 'full_block') {
    const elFaces = flatModel.elements?.[0]?.faces ?? {};
    for (const dir of ['up', 'down', 'north', 'south', 'east', 'west']) {
      const faceTex = elFaces[dir]?.resolvedTexture;
      if (faceTex && !String(faceTex).startsWith('#')) {
        instances[dir] = {
          texture: extractTextureShortName(faceTex, shortName),
          render_method: renderMethod,
        };
      }
    }

    const topTex = textures.top ?? textures.end ?? textures.up;
    const bottomTex = textures.bottom ?? textures.end ?? textures.down;
    const sideTex = textures.side;
    const frontTex = textures.front ?? textures.north;
    if (topTex && !instances.up) {
      instances.up = {
        texture: extractTextureShortName(topTex, shortName),
        render_method: renderMethod,
      };
    }
    if (bottomTex && !instances.down) {
      instances.down = {
        texture: extractTextureShortName(bottomTex, shortName),
        render_method: renderMethod,
      };
    }
    if (sideTex) {
      const sideInstance = {
        texture: extractTextureShortName(sideTex, shortName),
        render_method: renderMethod,
      };
      if (!instances.north) instances.north = sideInstance;
      if (!instances.south) instances.south = sideInstance;
      if (!instances.east) instances.east = sideInstance;
      if (!instances.west) instances.west = sideInstance;
    }
    if (frontTex) {
      instances.north = {
        texture: extractTextureShortName(frontTex, shortName),
        render_method: renderMethod,
      };
    }
  }

  if (shortName === 'aurora_crystal') {
    const auroraFaces = {
      '*': 'betterend_aurora_crystal_tint_0',
      up: 'betterend_aurora_crystal_tint_1',
      down: 'betterend_aurora_crystal_tint_2',
      north: 'betterend_aurora_crystal_tint_0',
      south: 'betterend_aurora_crystal_tint_1',
      east: 'betterend_aurora_crystal_tint_2',
      west: 'betterend_aurora_crystal_tint_3',
      particle: 'betterend_aurora_crystal_tint_0',
      all: 'betterend_aurora_crystal_tint_0',
    };
    const auroraInst = Object.create(null);
    for (const [k, tex] of Object.entries(auroraFaces)) {
      auroraInst[k] = {
        texture: tex,
        render_method: 'blend',
        ambient_occlusion: 0.0,
        face_dimming: false,
      };
    }
    return auroraInst;
  }

  // Ensure every material_instance name referenced inside the custom .geo.json exists in instances
  if (geoDoc) {
    const bones = geoDoc['minecraft:geometry']?.[0]?.bones ?? [];
    for (const bone of bones) {
      for (const cube of bone.cubes ?? []) {
        for (const faceUv of Object.values(cube.uv ?? {})) {
          const matName = faceUv?.material_instance;
          if (matName && !instances[matName]) {
            const rawSlot = textures[matName];
            instances[matName] = {
              texture:
                rawSlot && typeof rawSlot === 'string' && !rawSlot.startsWith('#')
                  ? extractTextureShortName(rawSlot, shortName)
                  : primaryTex,
              render_method: renderMethod,
            };
          }
        }
      }
    }
  }

  // Disable full-block ambient occlusion and face dimming on non-opaque (blend / alpha_test) blocks
  if (renderMethod !== 'opaque') {
    for (const inst of Object.values(instances)) {
      inst.ambient_occlusion = 0.0;
      inst.face_dimming = false;
    }
  }

  // Validate against terrainTextureData if available so no missing texture key is ever emitted
  if (terrainTextureData) {
    const validPrimary = terrainTextureData[primaryTex]
      ? primaryTex
      : terrainTextureData[fallbackPrimary]
        ? fallbackPrimary
        : 'betterend_mc_end_stone';
    for (const inst of Object.values(instances)) {
      if (!terrainTextureData[inst.texture]) {
        inst.texture = validPrimary;
      }
    }
  }

  return instances;
}

const TICKING_BLOCK_CUSTOM_COMPONENTS = new Set([
  'betterend:silk_moth_nest',
  'betterend:bouncy',
  'betterend:hazard',
  'betterend:sponge',
  'betterend:hydrothermal_vent',
  'betterend:brimstone',
  'betterend:emerald_ice',
  'betterend:umbrella_cluster',
  'betterend:ecology_tick',
]);

function deriveBlockCustomComponents(blockEntry, partitions = [], partition = null) {
  const components = new Set();
  const shortName = blockEntry.id.split(':')[1];
  const hierarchy = blockEntry.hierarchy ?? [];
  const topClass = hierarchy.at(-1) ?? '';

  if (shortName === 'end_stone_smelter') {
    components.add('betterend:smelter');
  }
  if (shortName.endsWith('_anvil')) {
    components.add('betterend:anvil');
  }
  if (shortName === 'infusion_pedestal') {
    components.add('betterend:infusion_pedestal');
  } else if (shortName === 'eternal_pedestal') {
    components.add('betterend:eternal_pedestal');
  } else if (shortName.endsWith('_pedestal')) {
    components.add('betterend:pedestal');
  }
  if (shortName === 'respawn_obelisk') {
    components.add('betterend:respawn_obelisk');
  }
  if (shortName === 'silk_moth_nest' || shortName === 'silk_moth_hive') {
    components.add('betterend:silk_moth_nest');
  }
  if (
    shortName.endsWith('_chair') ||
    shortName.endsWith('_bar_stool') ||
    shortName.endsWith('_taburet')
  ) {
    components.add('betterend:chair');
  }
  if (shortName === 'jellyshroom_cap_purple' || shortName === 'umbrella_tree_membrane') {
    components.add('betterend:bouncy');
  }
  if (
    shortName === 'needlegrass' ||
    shortName === 'hydralux_sapling' ||
    shortName === 'lanceleaf_seed' ||
    shortName === 'glowing_pillar_seed' ||
    shortName === 'lumecorn_seed' ||
    shortName === 'chorus_mushroom_raw'
  ) {
    components.add('betterend:hazard');
  }
  if (shortName === 'menger_sponge' || shortName === 'menger_sponge_wet') {
    components.add('betterend:sponge');
  }
  if (shortName === 'hydrothermal_vent') {
    components.add('betterend:hydrothermal_vent');
  }
  if (shortName === 'brimstone') {
    components.add('betterend:brimstone');
  }
  if (shortName === 'emerald_ice' || shortName === 'dense_emerald_ice') {
    components.add('betterend:emerald_ice');
  }
  if (shortName === 'umbrella_tree_cluster') {
    components.add('betterend:umbrella_cluster');
  }
  if (shortName.endsWith('_flower_pot')) {
    components.add('betterend:flower_pot');
  }
  if (partitions.length > 1 || (partition && partition.partitionIndex > 0)) {
    components.add('betterend:partitioned_state');
  }

  if (
    shortName === 'end_stone_smelter' ||
    shortName === 'infusion_pedestal' ||
    shortName === 'eternal_pedestal' ||
    shortName.endsWith('_pedestal') ||
    shortName.endsWith('_anvil') ||
    shortName.endsWith('_furnace') ||
    shortName.endsWith('_crafting_table') ||
    shortName.endsWith('_composter') ||
    shortName.endsWith('_barrel') ||
    shortName.endsWith('_chest') ||
    shortName.endsWith('_bookshelf')
  ) {
    components.add('betterend:station_interaction');
  }
  if (
    shortName.endsWith('_door') ||
    shortName.endsWith('_trapdoor') ||
    shortName.endsWith('_gate') ||
    shortName.endsWith('_button') ||
    shortName.endsWith('_plate') ||
    shortName.endsWith('_lever') ||
    shortName.endsWith('_chair') ||
    shortName.endsWith('_bar_stool') ||
    shortName.endsWith('_taburet') ||
    shortName.endsWith('_ladder') ||
    shortName.endsWith('_sign') ||
    shortName.endsWith('_flower_pot')
  ) {
    components.add('betterend:interactive_furniture');
  }
  if (
    topClass.includes('Sapling') ||
    topClass.includes('Moss') ||
    topClass.includes('Nylium') ||
    topClass.includes('Path') ||
    topClass.includes('Vine') ||
    topClass.includes('Plant') ||
    topClass.includes('Leaves') ||
    shortName.includes('geyser') ||
    shortName.includes('brimstone') ||
    shortName.includes('budding_')
  ) {
    components.add('betterend:ecology_tick');
  }
  const propNames = Object.keys(blockEntry.runtime?.propertyDomains ?? {});
  if (propNames.includes('half') || propNames.includes('shape') || propNames.includes('part')) {
    components.add('betterend:multiblock_guard');
  }
  return [...components];
}

function evaluateVariantMatch(clause, stateProps) {
  if (!clause || clause === '') return true;
  const parts = clause.split(',');
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (!k) continue;
    if (String(stateProps[k.trim()]) !== String(v?.trim())) {
      return false;
    }
  }
  return true;
}

function evaluateMultipartWhen(whenClause, stateProps) {
  if (!whenClause || typeof whenClause !== 'object') return true;
  if (Array.isArray(whenClause.OR)) {
    return whenClause.OR.some(sub => evaluateMultipartWhen(sub, stateProps));
  }
  if (Array.isArray(whenClause.AND)) {
    return whenClause.AND.every(sub => evaluateMultipartWhen(sub, stateProps));
  }
  for (const [k, v] of Object.entries(whenClause)) {
    const actual = String(stateProps[k]);
    const allowed = String(v)
      .split('|')
      .map(s => s.trim());
    if (!allowed.includes(actual)) {
      return false;
    }
  }
  return true;
}

function resolveStateModelAndRotation(blockstateDef, stateProps, flattenedModels) {
  if (!blockstateDef) {
    return { flatModel: null, x: 0, y: 0 };
  }
  const isNonEmptyModel = m => m && (m.geometryKind === 'cross' || (m.elements?.length ?? 0) > 0);
  if (Array.isArray(blockstateDef.variants) && blockstateDef.variants.length > 0) {
    for (const v of blockstateDef.variants) {
      if (evaluateVariantMatch(v.statePredicate, stateProps)) {
        const flatModel = v.flattened ?? flattenedModels.get(v.modelId) ?? null;
        if (isNonEmptyModel(flatModel)) {
          return {
            flatModel,
            x: Number(v.x ?? 0),
            y: Number(v.y ?? 0),
          };
        }
        const fallbackProps = { ...stateProps, top: 'false', half: 'bottom' };
        for (const fv of blockstateDef.variants) {
          if (evaluateVariantMatch(fv.statePredicate, fallbackProps)) {
            const fModel = fv.flattened ?? flattenedModels.get(fv.modelId) ?? null;
            if (isNonEmptyModel(fModel)) {
              return {
                flatModel: fModel,
                x: Number(fv.x ?? 0),
                y: Number(fv.y ?? 0),
              };
            }
          }
        }
        return {
          flatModel,
          x: Number(v.x ?? 0),
          y: Number(v.y ?? 0),
        };
      }
    }
    const first =
      blockstateDef.variants.find(v =>
        isNonEmptyModel(v.flattened ?? flattenedModels.get(v.modelId)),
      ) ?? blockstateDef.variants[0];
    return {
      flatModel: first.flattened ?? flattenedModels.get(first.modelId) ?? null,
      x: Number(first.x ?? 0),
      y: Number(first.y ?? 0),
    };
  }
  if (Array.isArray(blockstateDef.multipartRules) && blockstateDef.multipartRules.length > 0) {
    for (const r of blockstateDef.multipartRules) {
      if (r.when && Object.keys(r.when).length > 0 && evaluateMultipartWhen(r.when, stateProps)) {
        const flatModel = r.flattened ?? flattenedModels.get(r.modelId) ?? null;
        if (isNonEmptyModel(flatModel)) {
          return {
            flatModel,
            x: Number(r.x ?? 0),
            y: Number(r.y ?? 0),
          };
        }
      }
    }
    const first =
      blockstateDef.multipartRules.find(r =>
        isNonEmptyModel(r.flattened ?? flattenedModels.get(r.modelId)),
      ) ?? blockstateDef.multipartRules[0];
    return {
      flatModel: first.flattened ?? flattenedModels.get(first.modelId) ?? null,
      x: Number(first.x ?? 0),
      y: Number(first.y ?? 0),
    };
  }
  return { flatModel: null, x: 0, y: 0 };
}

function buildBoneVisibilityForMultipart(blockEntry, partition) {
  const { props } = extractBlockPropertiesAndStates(blockEntry);
  const kept = new Set(partition.keptPropNames);
  const fixed = partition.fixedProperties ?? {};
  const exprFor = (propName, expectedVal) => {
    if (kept.has(propName)) {
      const propDef = props.find(p => p.name === propName);
      const coerced = coerceTraitValue(expectedVal, propDef);
      return `q.block_state('betterend:${propName}') == ${formatMolangValue(coerced)}`;
    }
    if (propName in fixed) {
      const firstKept = partition.keptPropNames[0];
      if (firstKept) {
        const propDef = props.find(p => p.name === firstKept);
        const firstVal = formatMolangValue(coerceTraitValue(propDef?.values?.[0] ?? 'true', propDef));
        return String(fixed[propName]) === String(expectedVal)
          ? `q.block_state('betterend:${firstKept}') == ${firstVal} || q.block_state('betterend:${firstKept}') != ${firstVal}`
          : `q.block_state('betterend:${firstKept}') == ${firstVal} && q.block_state('betterend:${firstKept}') != ${firstVal}`;
      }
      return String(fixed[propName]) === String(expectedVal);
    }
    return true;
  };
  const orExpr = (a, b) => {
    if (a === true || b === true) return true;
    if (a === false && b === false) return false;
    if (a === false) return b;
    if (b === false) return a;
    return `${a} || ${b}`;
  };

  const propNames = new Set(props.map(p => p.name));
  // Chiseled bookshelf 6 slots
  if (propNames.has('slot_0_occupied')) {
    const vis = Object.create(null);
    for (let i = 0; i < 6; i += 1) {
      vis[`slot_${i}`] = exprFor(`slot_${i}_occupied`, 'true');
    }
    return vis;
  }
  // Walls (up, north, south, east, west)
  if (blockEntry.id.endsWith('_wall') && propNames.has('up') && propNames.has('north') && propNames.has('east')) {
    const wallSideExpr = side => {
      if (kept.has(side)) {
        return `q.block_state('betterend:${side}') != 'none'`;
      }
      const val = String(fixed[side] ?? 'none');
      return val !== 'none'
        ? "q.block_state('betterend:up') == true || q.block_state('betterend:up') == false"
        : "q.block_state('betterend:up') == true && q.block_state('betterend:up') == false";
    };
    return {
      post: exprFor('up', 'true'),
      north: wallSideExpr('north'),
      south: wallSideExpr('south'),
      east: wallSideExpr('east'),
      west: wallSideExpr('west'),
    };
  }
  // Fences / bars / panes / chorus plant (north, south, east, west)
  if (propNames.has('north') && propNames.has('south') && propNames.has('east') && propNames.has('west')) {
    const vis = {
      north: exprFor('north', 'true'),
      south: exprFor('south', 'true'),
      east: exprFor('east', 'true'),
      west: exprFor('west', 'true'),
    };
    if (propNames.has('up')) vis.up = exprFor('up', 'true');
    if (propNames.has('down')) vis.down = exprFor('down', 'true');
    return vis;
  }
  return null;
}

function buildGeometryComponent(blockEntry, flatModel, partition, geometries) {
  let identifier = 'minecraft:geometry.full_block';

  if (blockEntry.id === 'betterend:aurora_crystal' && (!geometries || geometries.has('geometry.betterend.aurora_crystal'))) {
    return { identifier: 'geometry.betterend.aurora_crystal' };
  }

  if (flatModel && (flatModel.geometryKind === 'custom' || flatModel.geometryKind === 'cross')) {
    const candidate = getGeometryIdForModel(flatModel);
    if (!geometries || geometries.has(candidate)) {
      identifier = candidate;
    }
  }

  if (identifier !== 'minecraft:geometry.full_block') {
    const rawVis = buildBoneVisibilityForMultipart(blockEntry, partition);
    const geoDoc = geometries?.get(identifier);
    if (rawVis && geoDoc) {
      const existingBones = new Set(
        (geoDoc['minecraft:geometry']?.[0]?.bones ?? []).map(b => b.name),
      );
      const filteredVis = Object.create(null);
      for (const [boneKey, expr] of Object.entries(rawVis)) {
        if (existingBones.has(boneKey)) {
          filteredVis[boneKey] = expr;
        }
      }
      if (Object.keys(filteredVis).length > 0) {
        return {
          identifier,
          bone_visibility: filteredVis,
        };
      }
    }
  }
  return { identifier };
}

function computeStateLuminance(blockEntry, stateProps, runtimeState) {
  if (runtimeState?.lightEmission !== undefined) {
    return clamp(Number(runtimeState.lightEmission), 0, 15);
  }
  const baseLum = clamp(
    Number(blockEntry.stateSnapshot?.luminance ?? blockEntry.properties?.lightEmission ?? 0),
    0,
    15,
  );
  if ('lit' in stateProps) {
    return String(stateProps.lit) === 'true' ? Math.max(baseLum, 13) : 0;
  }
  if ('charges' in stateProps) {
    const charges = Number(stateProps.charges ?? 0);
    return charges > 0 ? clamp(charges * 4 - 1, 0, 15) : 0;
  }
  if ('active' in stateProps && String(stateProps.active) === 'true') {
    return Math.max(baseLum, 12);
  }
  return baseLum;
}

export function compileBlocks(registrations, modelAssets) {
  const blockJsonMap = new Map();
  const forwardStateMap = new Map();
  const reverseStateMap = new Map();
  const blockPartitions = new Map();
  const terrainTextureData = modelAssets.terrainTextureJson?.texture_data ?? null;

  for (const blockEntry of registrations.blocks ?? []) {
    const { props } = extractBlockPropertiesAndStates(blockEntry);
    const partitions = partitionBlockStates(blockEntry);
    blockPartitions.set(blockEntry.id, partitions);
    const blockstateDef = modelAssets.flattenedBlockstates.get(blockEntry.id);
    const propDefs = new Map(props.map(p => [p.name, p]));
    const firstRecord = blockEntry.stateSnapshot?.records?.[0];

    for (const partition of partitions) {
      if (partition.partitionIndex > 0 && modelAssets.blocksJson) {
        modelAssets.blocksJson[partition.bedrockBlockId] =
          modelAssets.blocksJson[blockEntry.id] ?? { sound: 'stone' };
      }

      const defaultState =
        partition.states.find(
          s =>
            s.properties.facing === 'up' &&
            s.properties.top !== 'true' &&
            s.properties.half !== 'upper' &&
            s.properties.half !== 'top' &&
            s.properties.waterlogged !== 'true',
        ) ??
        partition.states.find(
          s =>
            s.properties.top !== 'true' &&
            s.properties.half !== 'upper' &&
            s.properties.half !== 'top' &&
            s.properties.waterlogged !== 'true',
        ) ??
        partition.states[0];
      const defaultResolved = resolveStateModelAndRotation(
        blockstateDef,
        defaultState.properties,
        modelAssets.flattenedModels,
      );

      const collisionBox = boundsToBedrockBox(
        blockEntry.stateSnapshot?.collisionBounds ?? firstRecord?.collision,
        blockEntry.stateSnapshot?.collisionShape ?? (firstRecord?.collision === 'empty' ? 'empty' : 'box'),
        { isCollision: true },
      );
      const selectionBox = boundsToBedrockBox(
        blockEntry.stateSnapshot?.outlineBounds ?? firstRecord?.selection,
        blockEntry.stateSnapshot?.outlineShape ?? (firstRecord?.selection === 'empty' ? 'empty' : 'box'),
        { isCollision: false },
      );

      const renderMethod = classifyRenderMethod(blockEntry, defaultResolved.flatModel);
      const baseLuminance = computeStateLuminance(
        blockEntry,
        defaultState.properties,
        defaultState.runtimeState,
      );
      const lightDampening =
        defaultState.runtimeState?.lightDampening !== undefined
          ? clamp(Number(defaultState.runtimeState.lightDampening), 0, 15)
          : renderMethod === 'opaque' && blockEntry.stateSnapshot?.occludes !== false
            ? 15
            : 0;

      const hardness = Number(
        blockEntry.runtime?.defaultDestroyTime ?? blockEntry.properties?.destroyTime ?? 1.0,
      );
      const explosionResistance = Number(
        blockEntry.runtime?.explosionResistance ?? blockEntry.properties?.resistance ?? 1.0,
      );
      const mapColorKey = blockEntry.properties?.mapColor ?? 'STONE';
      const mapColorHex = MAP_COLOR_HEX[mapColorKey] ?? '#707070';

      const baseGeo = buildGeometryComponent(
        blockEntry,
        defaultResolved.flatModel,
        partition,
        modelAssets.geometries,
      );
      const baseGeoDoc = modelAssets.geometries?.get(baseGeo.identifier) ?? null;

      const baseComponents = {
        'minecraft:collision_box': collisionBox,
        'minecraft:selection_box': selectionBox,
        'minecraft:light_emission': baseLuminance,
        'minecraft:light_dampening': lightDampening,
        'minecraft:destructible_by_mining':
          hardness < 0 ? false : { seconds_to_destroy: Math.max(0, hardness) },
        'minecraft:destructible_by_explosion':
          explosionResistance >= 3600000
            ? false
            : { explosion_resistance: Math.max(0, explosionResistance) },
        'minecraft:map_color': mapColorHex,
        'minecraft:geometry': baseGeo,
        'minecraft:material_instances': buildMaterialInstances(
          blockEntry,
          defaultResolved.flatModel,
          defaultState.properties,
          baseGeoDoc,
          terrainTextureData,
        ),
      };

      const burnOdds = Number(
        blockEntry.runtime?.flammability?.burnOdds ?? blockEntry.stateSnapshot?.burnOdds ?? 0,
      );
      const igniteOdds = Number(
        blockEntry.runtime?.flammability?.igniteOdds ?? blockEntry.stateSnapshot?.igniteOdds ?? 0,
      );
      if (burnOdds > 0 || igniteOdds > 0) {
        baseComponents['minecraft:flammable'] = {
          catch_chance_modifier: igniteOdds,
          destroy_chance_modifier: burnOdds,
        };
      }

      const friction = Number(blockEntry.runtime?.friction ?? blockEntry.properties?.friction ?? 0.6);
      if (Math.abs(friction - 0.6) > 0.001) {
        baseComponents['minecraft:friction'] = clamp(1.0 - friction + 0.4, 0.0, 0.9);
      }

      const customComponents = deriveBlockCustomComponents(blockEntry, partitions, partition);
      let requiresTick = false;
      for (const compId of customComponents) {
        baseComponents[compId] = {};
        if (TICKING_BLOCK_CUSTOM_COMPONENTS.has(compId)) {
          requiresTick = true;
        }
      }
      if (requiresTick) {
        baseComponents['minecraft:tick'] = {
          interval_range: [40, 80],
          looping: true,
        };
      }

      const permutations = [];
      for (const st of partition.states) {
        const bedrockStates = Object.create(null);
        const condParts = [];
        for (const propName of partition.keptPropNames) {
          const propDef = propDefs.get(propName);
          const coerced = coerceTraitValue(st.properties[propName], propDef);
          bedrockStates[`betterend:${propName}`] = coerced;
          condParts.push(`q.block_state('betterend:${propName}') == ${formatMolangValue(coerced)}`);
        }

        // Record bijective state mapping
        const canonicalJavaStateKey = `${blockEntry.id}[${Object.entries(st.properties)
          .sort(([a], [b]) => compareText(a, b))
          .map(([k, v]) => `${k}=${v}`)
          .join(',')}]`;
        const canonicalBedrockStateKey = `${partition.bedrockBlockId}[${Object.entries(bedrockStates)
          .sort(([a], [b]) => compareText(a, b))
          .map(([k, v]) => `${k}=${v}`)
          .join(',')}]`;

        const mappingRecord = {
          javaBlockId: blockEntry.id,
          javaStateIndex: st.stateIndex,
          javaProperties: st.properties,
          bedrockBlockId: partition.bedrockBlockId,
          partitionIndex: partition.partitionIndex,
          bedrockStates,
          canonicalJavaStateKey,
          canonicalBedrockStateKey,
        };
        forwardStateMap.set(canonicalJavaStateKey, mappingRecord);
        reverseStateMap.set(canonicalBedrockStateKey, mappingRecord);

        if (condParts.length > 0) {
          const resolved = resolveStateModelAndRotation(
            blockstateDef,
            st.properties,
            modelAssets.flattenedModels,
          );
          const permGeo = buildGeometryComponent(
            blockEntry,
            resolved.flatModel,
            partition,
            modelAssets.geometries,
          );
          const permGeoDoc = modelAssets.geometries?.get(permGeo.identifier) ?? null;
          const permComponents = {
            'minecraft:geometry': permGeo,
            'minecraft:material_instances': buildMaterialInstances(
              blockEntry,
              resolved.flatModel,
              st.properties,
              permGeoDoc,
              terrainTextureData,
            ),
            'minecraft:light_emission': computeStateLuminance(
              blockEntry,
              st.properties,
              st.runtimeState,
            ),
          };
          const rx = (360 - (resolved.x % 360)) % 360;
          const ry = (360 - (resolved.y % 360)) % 360;
          if (rx !== 0 || ry !== 0) {
            permComponents['minecraft:transformation'] = {
              rotation: [rx, ry, 0],
            };
          }
          permutations.push({
            condition: condParts.join(' && '),
            components: permComponents,
          });
        }
      }

      const description = {
        identifier: partition.bedrockBlockId,
        menu_category:
          partition.partitionIndex === 0
            ? { category: 'construction' }
            : { category: 'none', is_hidden_in_commands: true },
      };
      if (Object.keys(partition.traitDefs).length > 0) {
        description.states = partition.traitDefs;
      }

      const blockJson = {
        format_version: BEDROCK_BLOCK_FORMAT_VERSION,
        'minecraft:block': {
          description,
          components: baseComponents,
          ...(permutations.length > 0 ? { permutations } : {}),
        },
      };

      const fileName = `${partition.bedrockBlockId.split(':')[1]}.block.json`;
      blockJsonMap.set(`blocks/${fileName}`, blockJson);
    }
  }

  return {
    blockJsonMap,
    forwardStateMap,
    reverseStateMap,
    blockPartitions,
    lookupBedrockState(javaBlockId, javaProps = {}) {
      const key = `${javaBlockId}[${Object.entries(javaProps)
        .sort(([a], [b]) => compareText(a, b))
        .map(([k, v]) => `${k}=${v}`)
        .join(',')}]`;
      const exact = forwardStateMap.get(key);
      if (exact) return exact;

      // Support partial or empty javaProps by matching against the block's live states
      const partitions = blockPartitions.get(javaBlockId);
      if (!partitions || partitions.length === 0) return null;
      const requestedEntries = Object.entries(javaProps ?? {});
      let fallbackRecord = null;
      for (const part of partitions) {
        for (const st of part.states) {
          const stKey = `${javaBlockId}[${Object.entries(st.properties)
            .sort(([a], [b]) => compareText(a, b))
            .map(([k, v]) => `${k}=${v}`)
            .join(',')}]`;
          const rec = forwardStateMap.get(stKey);
          if (!rec) continue;
          if (!fallbackRecord) fallbackRecord = rec;
          const matchesAll = requestedEntries.every(
            ([k, v]) => !(k in st.properties) || String(st.properties[k]) === String(v),
          );
          if (matchesAll) {
            return rec;
          }
        }
      }
      return fallbackRecord;
    },
    lookupJavaState(bedrockBlockId, bedrockStates = {}) {
      const key = `${bedrockBlockId}[${Object.entries(bedrockStates)
        .sort(([a], [b]) => compareText(a, b))
        .map(([k, v]) => `${k}=${v}`)
        .join(',')}]`;
      return reverseStateMap.get(key) ?? null;
    },
  };
}

const EQUIP_SLOT_MAP = Object.freeze({
  head: 'slot.armor.head',
  chest: 'slot.armor.chest',
  legs: 'slot.armor.legs',
  feet: 'slot.armor.feet',
  body: 'slot.armor.body',
});

function inferEnchantSlot(itemEntry) {
  const shortName = itemEntry.id.split(':')[1];
  const equipSlot = itemEntry.runtimeComponents?.['minecraft:equippable']?.slot;
  if (equipSlot === 'head') return 'armor_head';
  if (equipSlot === 'chest') return 'armor_torso';
  if (equipSlot === 'legs') return 'armor_legs';
  if (equipSlot === 'feet') return 'armor_feet';
  if (shortName.endsWith('_sword')) return 'sword';
  if (shortName.endsWith('_axe')) return 'axe';
  if (shortName.endsWith('_pickaxe') || shortName.endsWith('_hammer')) return 'pickaxe';
  if (shortName.endsWith('_shovel')) return 'shovel';
  if (shortName.endsWith('_hoe')) return 'hoe';
  if (shortName.endsWith('_spear')) return 'spear';
  if (shortName.includes('elytra')) return 'elytra';
  return 'all';
}

export function compileItems(registrations) {
  const itemJsonMap = new Map();
  const standaloneItemJsonMap = new Map();
  const blockIds = new Set((registrations.blocks ?? []).map(b => b.id));

  for (const itemEntry of registrations.items ?? []) {
    const shortName = itemEntry.id.split(':')[1];
    const rc = itemEntry.runtimeComponents ?? {};
    const maxStackSize = Number(rc['minecraft:max_stack_size'] ?? itemEntry.runtimeMaxStackSize ?? 64);
    const maxDamage = rc['minecraft:max_damage'] !== undefined ? Number(rc['minecraft:max_damage']) : null;
    const isBlockItem =
      itemEntry.kind === 'block_item' ||
      blockIds.has(itemEntry.id) ||
      Boolean(rc['minecraft:item_name']?.translate?.startsWith('block.'));

    const components = {
      'minecraft:max_stack_size': clamp(maxStackSize, 1, 64),
      'minecraft:icon': {
        textures: {
          default: `betterend_${shortName}`,
        },
      },
      'minecraft:display_name': {
        value:
          rc['minecraft:item_name']?.translate ??
          (isBlockItem ? `block.betterend.${shortName}` : `item.betterend.${shortName}`),
      },
    };

    if (shortName === 'enchanted_membrane' || shortName === 'enchanted_petal') {
      components['minecraft:glint'] = true;
    }

    if (maxDamage && maxDamage > 0) {
      components['minecraft:durability'] = {
        max_durability: maxDamage,
      };
    }

    // Attribute modifiers (armor & attack damage)
    const modifiers = Array.isArray(rc['minecraft:attribute_modifiers'])
      ? rc['minecraft:attribute_modifiers']
      : [];
    const attackDamageMod = modifiers.find(m => m.type === 'minecraft:attack_damage');
    const armorMod = modifiers.find(m => m.type === 'minecraft:armor');

    if (attackDamageMod && Number(attackDamageMod.amount) > 0) {
      components['minecraft:damage'] = {
        value: Math.max(1, Math.round(Number(attackDamageMod.amount) + 1)),
      };
      components['minecraft:hand_equipped'] = true;
    }

    const itemTags = new Set();

    // Wearable / Armor / Elytra
    const equip = rc['minecraft:equippable'];
    if (equip && EQUIP_SLOT_MAP[equip.slot]) {
      components['minecraft:wearable'] = {
        slot: EQUIP_SLOT_MAP[equip.slot],
        protection: armorMod ? Math.max(0, Math.round(Number(armorMod.amount))) : 0,
      };
      itemTags.add('minecraft:is_armor');
      itemTags.add('minecraft:trimmable_armors');
    }

    // Digger / Tool
    const tool = rc['minecraft:tool'];
    if (tool && Array.isArray(tool.rules)) {
      components['minecraft:hand_equipped'] = true;
      itemTags.add('minecraft:is_tool');
      const destroySpeeds = [];
      for (const rule of tool.rules) {
        if (!rule.speed) continue;
        const speed = Math.round(Number(rule.speed));
        const blocksList = Array.isArray(rule.blocks)
          ? rule.blocks
          : typeof rule.blocks === 'string'
            ? [rule.blocks]
            : [];
        for (const tagOrBlock of blocksList) {
          if (tagOrBlock.startsWith('#minecraft:mineable/')) {
            const mineableKind = tagOrBlock.slice('#minecraft:mineable/'.length);
            destroySpeeds.push({
              block: {
                tags: `q.any_tag('minecraft:is_${mineableKind}_item_destructible', '${mineableKind}_diggable')`,
              },
              speed,
            });
          } else if (!tagOrBlock.startsWith('#')) {
            destroySpeeds.push({
              block: tagOrBlock,
              speed,
            });
          }
        }
      }
      components['minecraft:digger'] = {
        use_efficiency: true,
        destroy_speeds: destroySpeeds,
      };
    }

    if (
      shortName.endsWith('_sword') ||
      shortName.endsWith('_axe') ||
      shortName.endsWith('_pickaxe') ||
      shortName.endsWith('_shovel') ||
      shortName.endsWith('_hoe') ||
      shortName.endsWith('_hammer') ||
      shortName.endsWith('_spear')
    ) {
      itemTags.add('minecraft:is_tool');
    }
    if (shortName.endsWith('_ingot') || shortName.endsWith('_forged_plate')) {
      itemTags.add('minecraft:transform_materials');
    }
    if (shortName.includes('upgrade_smithing_template') || shortName.endsWith('_handle')) {
      itemTags.add('minecraft:transform_templates');
    }
    if (itemTags.size > 0) {
      components['minecraft:tags'] = {
        tags: [...itemTags],
      };
    }

    // Food & Consumable
    const food = rc['minecraft:food'];
    const consumable = rc['minecraft:consumable'];
    if (food) {
      const nutrition = Number(food.nutrition ?? 1);
      const saturation = Number(food.saturation ?? 0.6);
      const satModifier = nutrition > 0 ? clamp(saturation / (nutrition * 2), 0.1, 2.0) : 0.6;
      components['minecraft:food'] = {
        nutrition,
        saturation_modifier: Math.round(satModifier * 100) / 100,
        can_always_eat: Boolean(food.can_always_eat ?? food.canAlwaysEat),
      };
      components['minecraft:use_modifiers'] = {
        use_duration: Number(consumable?.consume_seconds ?? consumable?.consumeSeconds ?? 1.6),
        movement_modifier: 0.35,
      };
      components['minecraft:use_animation'] = consumable?.animation === 'drink' ? 'drink' : 'eat';
    }

    // Enchantable
    const enchantable = rc['minecraft:enchantable'];
    if (enchantable && Number(enchantable.value) > 0) {
      components['minecraft:enchantable'] = {
        slot: inferEnchantSlot(itemEntry),
        value: Number(enchantable.value),
      };
    }

    // Repairable
    const repairable = rc['minecraft:repairable'];
    if (repairable && repairable.items) {
      const rawItems = Array.isArray(repairable.items) ? repairable.items : [repairable.items];
      const repairItems = rawItems.map(entry => {
        if (entry === '#betterend:aeternium/repair') return 'betterend:aeternium_ingot';
        if (entry === '#betterend:terminite/repair') return 'betterend:terminite_ingot';
        if (entry === '#betterend:thallasium/repair') return 'betterend:thallasium_ingot';
        return entry.startsWith('#') ? entry.slice(1) : entry;
      });
      components['minecraft:repairable'] = {
        repair_items: [
          {
            items: repairItems,
            repair_amount: 'q.max_durability * 0.25',
          },
        ],
      };
    }

    // Fire Resistant
    const dmgRes = rc['minecraft:damage_resistant'];
    if (dmgRes && String(dmgRes.types).includes('fire')) {
      components['minecraft:fire_resistant'] = {
        value: true,
      };
    }

    // Block / Entity Placers
    if (isBlockItem) {
      components['minecraft:block_placer'] = {
        block: itemEntry.blockId ?? itemEntry.id,
      };
    } else if (shortName.startsWith('spawn_egg_')) {
      const entityName = shortName.slice('spawn_egg_'.length);
      components['minecraft:entity_placer'] = {
        entity: `betterend:${entityName}`,
      };
    } else if (shortName.endsWith('_boat') || shortName.endsWith('_raft')) {
      components['minecraft:liquid_clipped'] = true;
      components['betterend:boat_spawner'] = {};
    }

    // Custom Components V2 for standalone BetterEnd items
    if (shortName.endsWith('_hammer')) {
      components['betterend:hammer'] = {};
      components['betterend:hammer_mine'] = {};
    }
    if (shortName.endsWith('_spear')) {
      components['betterend:spear_combat'] = {};
    }
    if (shortName.includes('elytra')) {
      components['betterend:elytra_carrier'] = {};
    }
    if (shortName.startsWith('bucket_')) {
      components['betterend:bucket_spawner'] = {};
    }
    if (food) {
      components['betterend:food_effects'] = {};
    }
    if (shortName === 'guidebook') {
      components['betterend:guidebook'] = {};
    }

    const itemJson = {
      format_version: BEDROCK_ITEM_FORMAT_VERSION,
      'minecraft:item': {
        description: {
          identifier: itemEntry.id,
          menu_category: {
            category: isBlockItem ? 'construction' : 'items',
          },
        },
        components,
      },
    };

    itemJsonMap.set(`items/${shortName}.item.json`, itemJson);
    if (!blockIds.has(itemEntry.id)) {
      standaloneItemJsonMap.set(`items/${shortName}.item.json`, itemJson);
    }
  }

  return {
    itemJsonMap,
    standaloneItemJsonMap,
  };
}

const BEDROCK_ITEM_ALIASES = Object.freeze({
  'minecraft:end_stone_bricks': 'minecraft:end_bricks',
});

function mapBedrockItemId(rawItemId) {
  if (!rawItemId || typeof rawItemId !== 'string') return 'minecraft:air';
  return BEDROCK_ITEM_ALIASES[rawItemId] ?? rawItemId;
}

function portToBedrockIngredient(port) {
  const pred = port?.predicate;
  if (!pred || !pred.resolvedItems || pred.resolvedItems.length === 0) {
    return { item: 'minecraft:air' };
  }
  const primaryItem = mapBedrockItemId(pred.resolvedItems[0]);
  if (pred.tagId) {
    return {
      tag: pred.tagId,
      item: primaryItem,
    };
  }
  return {
    item: primaryItem,
    ...(port.count > 1 ? { count: port.count } : {}),
  };
}

export function compileRecipes(resources, runtime) {
  const resourceArray = Array.isArray(resources) ? resources : resources.resources ?? [];
  const graph = buildRecipeHyperedgeGraph(resourceArray, runtime);
  const nativeRecipeFiles = new Map();
  const stationRecipes = {
    alloying: [],
    blastingSmelterFallback: [],
    smithingStation: [],
    infusion: [],
    remaindersAndHooks: [],
  };

  for (const edge of graph.edges) {
    const shortId = `${edge.scope === 'main' ? '' : `${edge.scope.replace(/\//g, '_')}_`}${edge.id
      .replace(':', '_')
      .replace(/\//g, '_')}`;
    const resultItemId = mapBedrockItemId(edge.result.itemId);

    if (
      edge.result.inheritancePolicy !== 'none' ||
      Object.keys(edge.result.declaredComponents ?? {}).length > 0 ||
      edge.sideEffects?.inputRemainderPolicy !== 'none'
    ) {
      stationRecipes.remaindersAndHooks.push({
        id: edge.id,
        scope: edge.scope,
        serializer: edge.serializer,
        inputs: edge.inputs,
        result: edge.result,
        sideEffects: edge.sideEffects,
      });
    }

    if (edge.serializer === 'minecraft:crafting_shaped') {
      const pattern = edge.placement?.pattern ?? ['A'];
      const keyMap = Object.create(null);
      for (const port of edge.inputs) {
        if (port.symbol && port.symbol !== ' ' && !keyMap[port.symbol]) {
          keyMap[port.symbol] = portToBedrockIngredient(port);
        }
      }
      nativeRecipeFiles.set(`recipes/${shortId}.recipe.json`, {
        format_version: BEDROCK_RECIPE_FORMAT_VERSION,
        'minecraft:recipe_shaped': {
          description: { identifier: edge.id },
          tags: ['crafting_table'],
          pattern,
          key: keyMap,
          unlock: Object.values(keyMap).map(k => ({ item: k.item })),
          result: {
            item: resultItemId,
            count: edge.result.count,
          },
        },
      });
    } else if (edge.serializer === 'minecraft:crafting_shapeless') {
      const ingredients = edge.inputs.map(port => portToBedrockIngredient(port));
      nativeRecipeFiles.set(`recipes/${shortId}.recipe.json`, {
        format_version: BEDROCK_RECIPE_FORMAT_VERSION,
        'minecraft:recipe_shapeless': {
          description: { identifier: edge.id },
          tags: ['crafting_table'],
          ingredients,
          unlock: ingredients.map(i => ({ item: i.item })),
          result: {
            item: resultItemId,
            count: edge.result.count,
          },
        },
      });
    } else if (
      edge.serializer === 'minecraft:smelting' ||
      edge.serializer === 'minecraft:blasting' ||
      edge.serializer === 'minecraft:smoking' ||
      edge.serializer === 'minecraft:campfire_cooking'
    ) {
      const tags =
        edge.serializer === 'minecraft:smelting'
          ? ['furnace']
          : edge.serializer === 'minecraft:blasting'
            ? ['blast_furnace']
            : edge.serializer === 'minecraft:smoking'
              ? ['smoker']
              : ['campfire', 'soul_campfire'];
      const inputIngredient = portToBedrockIngredient(edge.inputs[0]);
      nativeRecipeFiles.set(`recipes/${shortId}.recipe.json`, {
        format_version: BEDROCK_RECIPE_FORMAT_VERSION,
        'minecraft:recipe_furnace': {
          description: { identifier: edge.id },
          tags,
          input: inputIngredient.item,
          output: resultItemId,
        },
      });
      if (edge.serializer === 'minecraft:blasting') {
        stationRecipes.blastingSmelterFallback.push({
          id: edge.id,
          input: edge.inputs[0],
          result: edge.result,
          experience: edge.sideEffects?.xp ?? 0.1,
          cookingTime: edge.execution?.declaredTime ?? 100,
        });
      }
    } else if (edge.serializer === 'minecraft:stonecutting') {
      const inputIngredient = portToBedrockIngredient(edge.inputs[0]);
      nativeRecipeFiles.set(`recipes/${shortId}.recipe.json`, {
        format_version: BEDROCK_RECIPE_FORMAT_VERSION,
        'minecraft:recipe_shapeless': {
          description: { identifier: edge.id },
          tags: ['stonecutter'],
          ingredients: [inputIngredient],
          unlock: [{ item: inputIngredient.item }],
          priority: 0,
          result: {
            item: resultItemId,
            count: edge.result.count,
          },
        },
      });
    } else if (edge.serializer === 'minecraft:smithing_transform') {
      const templatePort = edge.inputs.find(s => s.portId === 'template');
      const basePort = edge.inputs.find(s => s.portId === 'base');
      const additionPort = edge.inputs.find(s => s.portId === 'addition');
      const templateItem = portToBedrockIngredient(templatePort).item;
      const baseItem = portToBedrockIngredient(basePort).item;
      const additionItem = portToBedrockIngredient(additionPort).item;

      // In Bedrock, recipe_smithing_transform requires base to be armor/tool equipment,
      // while non-equipment smithing (e.g. anvil upgrades, sword handles, or tool-head assembly) uses crafting_table.
      if (
        edge.id.endsWith('_anvil_updrade') ||
        edge.id.endsWith('_sword_handle') ||
        baseItem.endsWith('_head') ||
        baseItem.endsWith('_blade') ||
        baseItem.endsWith('_tip')
      ) {
        nativeRecipeFiles.set(`recipes/${shortId}.recipe.json`, {
          format_version: BEDROCK_RECIPE_FORMAT_VERSION,
          'minecraft:recipe_shapeless': {
            description: { identifier: edge.id },
            tags: ['crafting_table'],
            ingredients: [{ item: templateItem }, { item: baseItem }, { item: additionItem }],
            unlock: [{ item: baseItem }],
            result: {
              item: resultItemId,
              count: edge.result.count,
            },
          },
        });
      } else {
        nativeRecipeFiles.set(`recipes/${shortId}.recipe.json`, {
          format_version: BEDROCK_RECIPE_FORMAT_VERSION,
          'minecraft:recipe_smithing_transform': {
            description: { identifier: edge.id },
            tags: ['smithing_table'],
            template: templateItem,
            base: baseItem,
            addition: additionItem,
            result: resultItemId,
          },
        });
      }
    } else if (edge.serializer === 'bclib:alloying') {
      stationRecipes.alloying.push({
        id: edge.id,
        inputs: edge.inputs,
        result: edge.result,
        experience: edge.sideEffects?.xp ?? 0,
        smeltTime: edge.execution?.declaredTime ?? 350,
      });
    } else if (edge.serializer === 'bclib:smithing') {
      stationRecipes.smithingStation.push({
        id: edge.id,
        inputs: edge.inputs,
        result: edge.result,
        anvilLevel: edge.station?.requiredAnvilLevel ?? 1,
        damage: edge.sideEffects?.toolDamage ?? 0,
        inputCount: edge.inputs[0]?.count ?? 1,
      });
    } else if (edge.serializer === 'betterend:infusion') {
      stationRecipes.infusion.push({
        id: edge.id,
        inputs: edge.inputs,
        result: edge.result,
        time: edge.execution?.declaredTime ?? 100,
      });
    }
  }

  return {
    graph,
    nativeRecipeFiles,
    stationRecipes,
  };
}

const WILDLIFE_VARIANT_TEXTURES = Object.freeze({
  'betterend:dragonfly': ['textures/entity/betterend/dragonfly'],
  'betterend:end_slime': [
    'textures/entity/betterend/end_slime',
    'textures/entity/betterend/end_slime_mossy',
    'textures/entity/betterend/end_slime_lake',
    'textures/entity/betterend/end_slime_amber',
  ],
  'betterend:end_fish': [
    'textures/entity/betterend/end_fish_0',
    'textures/entity/betterend/end_fish_1',
    'textures/entity/betterend/end_fish_2',
    'textures/entity/betterend/end_fish_3',
    'textures/entity/betterend/end_fish_4',
  ],
  'betterend:shadow_walker': ['textures/entity/betterend/shadow_walker'],
  'betterend:cubozoa': [
    'textures/entity/betterend/cubozoa',
    'textures/entity/betterend/cubozoa_sulphur',
  ],
  'betterend:silk_moth': ['textures/entity/betterend/silk_moth'],
});

const STATION_CARRIERS = Object.freeze([
  { id: 'betterend:end_stone_smelter_carrier', slots: 4 },
  { id: 'betterend:infusion_pedestal_carrier', slots: 1 },
  { id: 'betterend:eternal_pedestal_carrier', slots: 1 },
  { id: 'betterend:pedestal_carrier', slots: 1 },
  { id: 'betterend:chest_carrier', slots: 27 },
]);

export function compileEntitiesAndFeatures(registrations, resources, mcStructures = null) {
  const serverEntities = new Map();
  const clientEntities = new Map();
  const entityGeometries = new Map();
  const renderControllers = new Map();
  const animations = new Map();
  const entityLootTables = new Map();

  for (const ent of registrations.entities ?? []) {
    const shortName = ent.id.split(':', 2)[1];
    const [width, height] = ent.dimensions ?? [
      Number(ent.runtime?.width ?? 0.6),
      Number(ent.runtime?.height ?? 0.6),
    ];
    const isWildlife = ent.id in WILDLIFE_VARIANT_TEXTURES;
    const isBoat = shortName.includes('boat') || shortName.includes('raft');
    const isChestBoat = shortName.includes('chest_');
    const isChair = ent.id === 'bclib:chair';

    const components = {
      'minecraft:collision_box': {
        width,
        height,
      },
      'minecraft:physics': {
        has_gravity: !isChair && ent.id !== 'betterend:dragonfly' && ent.id !== 'betterend:silk_moth',
        has_collision: !isChair,
      },
    };

    if (isWildlife) {
      const attrs = ent.attributes ?? {};
      const maxHealth = Math.round(Number(attrs['minecraft:max_health'] ?? 10));
      const speed = Number(attrs['minecraft:movement_speed'] ?? 0.25);
      components['minecraft:health'] = { value: maxHealth, max: maxHealth };
      components['minecraft:movement'] = { value: speed };
      components['minecraft:type_family'] = {
        family: [shortName, ent.category?.toLowerCase() ?? 'creature', 'betterend'],
      };
      components['minecraft:loot'] = {
        table: `loot_tables/entities/${shortName}.json`,
      };
      if (ent.id === 'betterend:shadow_walker') {
        components['minecraft:attack'] = {
          damage: Number(attrs['minecraft:attack_damage'] ?? 4),
        };
      }
    } else if (isBoat) {
      components['minecraft:rideable'] = {
        seat_count: isChestBoat ? 1 : 2,
        family_types: ['player'],
        seats: [{ position: [0.0, -0.2, 0.0] }],
      };
      components['minecraft:buoyant'] = {
        base_buoyancy: 1.0,
        apply_gravity: true,
        liquid_blocks: ['minecraft:water', 'minecraft:flowing_water'],
      };
      if (isChestBoat) {
        components['minecraft:inventory'] = {
          container_type: 'chest_boat',
          inventory_size: 27,
        };
      }
    } else if (isChair) {
      components['minecraft:rideable'] = {
        seat_count: 1,
        family_types: ['player'],
        seats: [{ position: [0.0, 0.0, 0.0] }],
      };
    }

    serverEntities.set(`entities/${shortName}.entity.json`, {
      format_version: BEDROCK_SERVER_ENTITY_FORMAT_VERSION,
      'minecraft:entity': {
        description: {
          identifier: ent.id,
          is_spawnable: Boolean(ent.spawnEgg),
          is_summonable: true,
          is_experimental: false,
        },
        components,
      },
    });

    const variantTextures = WILDLIFE_VARIANT_TEXTURES[ent.id] ?? [
      `textures/entity/betterend/${shortName}`,
    ];
    const texMap = Object.create(null);
    variantTextures.forEach((t, idx) => {
      texMap[idx === 0 ? 'default' : `variant_${idx}`] = t;
    });

    const clientDesc = {
      identifier: ent.id,
      materials: {
        default: ent.id === 'betterend:cubozoa' || ent.id === 'betterend:end_slime' ? 'slime_outer' : 'entity_alphatest',
      },
      textures: texMap,
      geometry: {
        default: `geometry.betterend.${shortName}`,
      },
      animations: {
        idle: `animation.betterend.${shortName}.idle`,
      },
      scripts: {
        animate: ['idle'],
      },
      render_controllers: [`controller.render.betterend.${shortName}`],
    };

    if (ent.spawnEgg) {
      clientDesc.spawn_egg = {
        base_color: `#${Number(ent.spawnEgg.backgroundColor ?? 0).toString(16).padStart(6, '0')}`,
        overlay_color: `#${Number(ent.spawnEgg.highlightColor ?? 0).toString(16).padStart(6, '0')}`,
      };
    }

    clientEntities.set(`entity/${shortName}.entity.json`, {
      format_version: BEDROCK_CLIENT_ENTITY_FORMAT_VERSION,
      'minecraft:client_entity': {
        description: clientDesc,
      },
    });

    entityGeometries.set(`models/entity/${shortName}.geo.json`, {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: {
            identifier: `geometry.betterend.${shortName}`,
            texture_width: 64,
            texture_height: 64,
            visible_bounds_width: Math.max(1, width * 2),
            visible_bounds_height: Math.max(1, height * 2),
            visible_bounds_offset: [0, height / 2, 0],
          },
          bones: [
            {
              name: 'root',
              pivot: [0, 0, 0],
              cubes: isChair
                ? []
                : [
                    {
                      origin: [-width * 8, 0, -width * 8],
                      size: [width * 16, Math.max(2, height * 16), width * 16],
                      uv: [0, 0],
                    },
                  ],
            },
          ],
        },
      ],
    });

    renderControllers.set(`render_controllers/${shortName}.render_controllers.json`, {
      format_version: '1.8.0',
      render_controllers: {
        [`controller.render.betterend.${shortName}`]: {
          geometry: 'Geometry.default',
          materials: [{ '*': 'Material.default' }],
          textures:
            variantTextures.length > 1
              ? ['Array.skins[q.mark_variant]']
              : ['Texture.default'],
          ...(variantTextures.length > 1
            ? {
                arrays: {
                  textures: {
                    'Array.skins': Object.keys(texMap).map(k => `Texture.${k}`),
                  },
                },
              }
            : {}),
        },
      },
    });

    animations.set(`animations/${shortName}.animation.json`, {
      format_version: '1.8.0',
      animations: {
        [`animation.betterend.${shortName}.idle`]: {
          loop: true,
          bones: {
            root: {
              rotation: ['math.sin(q.life_time * 120) * 2', 0, 0],
            },
          },
        },
      },
    });
  }

  // Add Station Inventory Carrier Entities
  for (const carrier of STATION_CARRIERS) {
    const shortName = carrier.id.split(':')[1];
    serverEntities.set(`entities/${shortName}.entity.json`, {
      format_version: BEDROCK_SERVER_ENTITY_FORMAT_VERSION,
      'minecraft:entity': {
        description: {
          identifier: carrier.id,
          is_spawnable: false,
          is_summonable: true,
          is_experimental: false,
        },
        components: {
          'minecraft:collision_box': { width: 0.1, height: 0.1 },
          'minecraft:physics': { has_gravity: false, has_collision: false },
          'minecraft:inventory': {
            container_type: 'Horse',
            inventory_size: carrier.slots,
          },
          'minecraft:persistent': {},
        },
      },
    });
  }

  // Extract entity loot tables from resources.json (and ensure all wildlife entities have one)
  const resList = Array.isArray(resources)
    ? resources
    : resources.resources ?? resources.lootTables ?? [];
  for (const lt of resList) {
    if (
      (lt.category === 'loot_table' || !lt.category) &&
      (lt.id?.startsWith('betterend:entities/') || lt.id?.startsWith('betterend:entity/'))
    ) {
      const shortName = lt.id.split('/').pop();
      entityLootTables.set(
        `loot_tables/entities/${shortName}.json`,
        lt.value ?? lt.raw ?? { pools: [] },
      );
    }
  }
  for (const wildlifeId of Object.keys(WILDLIFE_VARIANT_TEXTURES)) {
    const shortName = wildlifeId.split(':')[1];
    const ltKey = `loot_tables/entities/${shortName}.json`;
    if (!entityLootTables.has(ltKey)) {
      entityLootTables.set(ltKey, { pools: [] });
    }
  }

  // Native End Biomes (1.26.30), Features & Feature Rules (1.13.0) with outer-End protection
  const biomes = new Map();
  const features = new Map();
  const featureRules = new Map();
  const knownBlockIds = new Set((registrations.blocks ?? []).map(b => b.id));
  knownBlockIds.add('minecraft:end_stone');

  const nativeOres = [
    { id: 'ender_ore', block: 'betterend:ender_ore', count: 4, minY: 16, maxY: 64 },
    { id: 'amber_ore', block: 'betterend:amber_ore', count: 5, minY: 20, maxY: 72 },
    { id: 'thallasium_ore', block: 'betterend:thallasium_ore', count: 8, minY: 12, maxY: 80 },
    { id: 'flavolite_layer', block: 'betterend:flavolite', count: 12, minY: 20, maxY: 72 },
    { id: 'violecite_layer', block: 'betterend:violecite', count: 12, minY: 20, maxY: 72 },
  ];

  for (const ore of nativeOres) {
    features.set(`features/${ore.id}_feature.json`, {
      format_version: BEDROCK_FEATURE_FORMAT_VERSION,
      'minecraft:ore_feature': {
        description: {
          identifier: `betterend:${ore.id}_feature`,
        },
        count: ore.count,
        replace_rules: [
          {
            places_block: ore.block,
            may_replace: ['minecraft:end_stone'],
          },
        ],
      },
    });

    featureRules.set(`feature_rules/${ore.id}_feature_rule.json`, {
      format_version: BEDROCK_FEATURE_FORMAT_VERSION,
      'minecraft:feature_rules': {
        description: {
          identifier: `betterend:${ore.id}_feature_rule`,
          places_feature: `betterend:${ore.id}_feature`,
        },
        conditions: {
          placement_pass: 'underground_pass',
          'minecraft:biome_filter': [
            {
              test: 'has_biome_tag',
              operator: '==',
              value: 'the_end',
            },
          ],
        },
        distribution: {
          iterations: `(math.abs(variable.originx + 8) > 1024 || math.abs(variable.originz + 8) > 1024) ? ${ore.count} : 0`,
          x: { distribution: 'uniform', extent: [0, 16] },
          y: { distribution: 'uniform', extent: [ore.minY, ore.maxY] },
          z: { distribution: 'uniform', extent: [0, 16] },
        },
      },
    });
  }

  // All valid BetterEnd soil / ground blocks
  const allSoilBlocks = [
    'minecraft:end_stone',
    'betterend:end_moss',
    'betterend:end_mycelium',
    'betterend:amber_moss',
    'betterend:pink_moss',
    'betterend:chorus_nylium',
    'betterend:cave_moss',
    'betterend:crystal_moss',
    'betterend:shadow_grass',
    'betterend:jungle_moss',
    'betterend:sangnum',
    'betterend:rutiscus',
    'betterend:endstone_dust',
    'betterend:sulphuric_rock',
    'betterend:brimstone',
    'betterend:flavolite',
    'betterend:violecite',
    'betterend:umbralith',
    'betterend:pallidium_full',
    'betterend:virid_jadestone',
    'betterend:azure_jadestone',
    'betterend:sandy_jadestone',
    'betterend:dense_snow',
  ].filter(b => knownBlockIds.has(b));

  const ensureSurfaceBlockFeature = blockId => {
    const validBlock = knownBlockIds.has(blockId) ? blockId : 'betterend:end_moss';
    const shortBlock = validBlock.replace(':', '_');
    const featId = `betterend:surface_block_${shortBlock}_feature`;
    const fileKey = `features/surface_block_${shortBlock}_feature.json`;
    if (!features.has(fileKey)) {
      features.set(fileKey, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:single_block_feature': {
          description: {
            identifier: featId,
          },
          places_block: validBlock,
          enforce_placement_rules: false,
          enforce_survivability_rules: false,
          may_replace: ['minecraft:end_stone'],
        },
      });
    }
    return featId;
  };

  const ensureFloraBlockFeature = blockId => {
    const validBlock = knownBlockIds.has(blockId) ? blockId : 'betterend:creeping_moss';
    const shortBlock = validBlock.split(':')[1];
    const featId = `betterend:flora_${shortBlock}_feature`;
    const fileKey = `features/flora_${shortBlock}_feature.json`;
    if (!features.has(fileKey)) {
      features.set(fileKey, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:single_block_feature': {
          description: {
            identifier: featId,
          },
          places_block: validBlock,
          enforce_placement_rules: false,
          enforce_survivability_rules: false,
          may_replace: ['minecraft:air', 'minecraft:chorus_plant', 'minecraft:chorus_flower'],
          may_attach_to: {
            bottom: allSoilBlocks,
          },
        },
      });
    }
    return featId;
  };

  // Curated per-biome surface ground-cover flora (only upright ground plants/mushrooms/seeds/crystal-shards; never wall-only mosses or solid cubes)
  const BIOME_SURFACE_FLORA = {
    foggy_mushroomland: ['betterend:umbrella_moss', 'betterend:creeping_moss', 'betterend:blue_vine_seed', 'betterend:glowing_pillar_seed'],
    chorus_forest: ['betterend:chorus_grass', 'betterend:chorus_mushroom_seed'],
    dust_wastelands: ['betterend:amber_grass'],
    megalake: ['betterend:umbrella_moss', 'betterend:creeping_moss', 'betterend:end_lotus_flower', 'betterend:end_lily_seed', 'betterend:jungle_grass'],
    crystal_mountains: ['betterend:crystal_grass'],
    shadow_forest: ['betterend:shadow_plant', 'betterend:murkweed', 'betterend:needlegrass', 'betterend:shadow_berry'],
    amber_land: ['betterend:amber_grass', 'betterend:lanceleaf_seed', 'betterend:glowing_pillar_seed', 'betterend:amber_root_seed'],
    blossoming_spires: ['betterend:bushy_grass', 'betterend:blossom_berry_seed', 'betterend:twisted_umbrella_moss', 'betterend:bulb_vine_seed'],
    sulphur_springs: ['betterend:sulphur_crystal', 'betterend:charnia_orange', 'betterend:charnia_green'],
    umbrella_jungle: ['betterend:jungle_grass', 'betterend:twisted_umbrella_moss', 'betterend:small_jellyshroom', 'betterend:umbrella_moss'],
    glowing_grasslands: ['betterend:blooming_cooksonia', 'betterend:salteago', 'betterend:vaiolush_fern', 'betterend:fracturn', 'betterend:lumecorn_seed', 'betterend:umbrella_moss', 'betterend:creeping_moss'],
    dragon_graveyards: ['betterend:globulagus', 'betterend:clawfern', 'betterend:small_amaranita_mushroom', 'betterend:amaranita_fur'],
    dry_shrubland: ['betterend:orango', 'betterend:aeridium', 'betterend:lutebus', 'betterend:lamellarium'],
    lantern_woods: ['betterend:aeridium', 'betterend:lamellarium', 'betterend:bolux_mushroom', 'betterend:orango', 'betterend:flamaea'],
    umbra_valley: ['betterend:inflexia', 'betterend:flammalix'],
    megalake_grove: ['betterend:umbrella_moss', 'betterend:creeping_moss', 'betterend:end_lotus_flower', 'betterend:jungle_grass'],
    painted_mountains: ['betterend:amber_grass', 'betterend:orango'],
    neon_oasis: ['betterend:neon_cactus', 'betterend:umbrella_moss', 'betterend:creeping_moss'],
    ice_starfield: ['betterend:crystal_grass'],
    flower_islets: ['betterend:aeridium', 'betterend:lamellarium', 'betterend:bolux_mushroom', 'betterend:orango', 'betterend:globulagus', 'betterend:clawfern', 'betterend:inflexia', 'betterend:flammalix', 'betterend:small_amaranita_mushroom'],
    waterfall_ponds: ['betterend:blooming_cooksonia', 'betterend:salteago', 'betterend:vaiolush_fern', 'betterend:fracturn', 'betterend:umbrella_moss', 'betterend:creeping_moss'],
    empty_end_cave: ['betterend:cave_grass', 'betterend:smaragdant_crystal_shard'],
    empty_smaragdant_cave: ['betterend:smaragdant_crystal_shard', 'betterend:cave_grass'],
    lush_smaragdant_cave: ['betterend:smaragdant_crystal_shard', 'betterend:cave_grass', 'betterend:cave_bush'],
    empty_aurora_cave: ['betterend:crystal_grass'],
    lush_aurora_cave: ['betterend:cave_bush', 'betterend:cave_grass', 'betterend:crystal_grass'],
    jade_cave: ['betterend:cave_grass', 'betterend:smaragdant_crystal_shard'],
  };

  const BIOME_FLORA_DENSITY = {
    dust_wastelands: 2,
    painted_mountains: 3,
    ice_starfield: 2,
    empty_end_cave: 4,
    jade_cave: 4,
    umbra_valley: 12,
    sulphur_springs: 10,
    dry_shrubland: 16,
  };

  // Native .mcstructure template & placement helpers (zero placeholders, 100% original BetterEnd Java SDF/NBT structures)
  const resolvedStructures =
    mcStructures ??
    compileAllMcStructures({
      repoRoot: defaultRepoRoot,
      blocks: compileBlocks(registrations, {
        flattenedBlockstates: new Map(),
        flattenedModels: new Map(),
        geometries: new Map(),
        terrainTextureJson: null,
        blocksJson: null,
      }),
    });

  const ensureStructureTemplateFeature = (meta, { groundCheck = true } = {}) => {
    const rawShort = meta.structureName.split(':')[1];
    const tplFeatId = `betterend:struct_tpl_${rawShort}_feature`;
    const tplRel = `features/struct_tpl_${rawShort}_feature.json`;
    if (!features.has(tplRel)) {
      features.set(tplRel, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:structure_template_feature': {
          description: { identifier: tplFeatId },
          structure_name: meta.structureName,
          adjustment_radius: 0,
          facing_direction: 'south',
          constraints: {},
        },
      });
    }

    const modeSuffix = groundCheck ? 'grounded' : 'aerial';
    const placeFeatId = `betterend:struct_place_${rawShort}_${modeSuffix}_feature`;
    const placeRel = `features/struct_place_${rawShort}_${modeSuffix}_feature.json`;
    if (!features.has(placeRel)) {
      const [ox, oy, oz] = meta.originOffset ?? [0, 0, 0];
      const groundIterations = groundCheck
        ? 'query.heightmap(variable.worldx, variable.worldz) >= 50 && query.heightmap(variable.worldx, variable.worldz) <= 76 && query.heightmap(variable.worldx + 3, variable.worldz) >= 50 && query.heightmap(variable.worldx - 3, variable.worldz) >= 50 && query.heightmap(variable.worldx, variable.worldz + 3) >= 50 && query.heightmap(variable.worldx, variable.worldz - 3) >= 50 && math.abs(query.heightmap(variable.worldx + 3, variable.worldz) - query.heightmap(variable.worldx - 3, variable.worldz)) <= 4 && math.abs(query.heightmap(variable.worldx, variable.worldz + 3) - query.heightmap(variable.worldx, variable.worldz - 3)) <= 4 ? 1 : 0'
        : 1;
      features.set(placeRel, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:scatter_feature': {
          description: { identifier: placeFeatId },
          iterations: groundIterations,
          coordinate_eval_order: 'zyx',
          x: ox,
          y: oy,
          z: oz,
          project_input_to_floor: false,
          places_feature: tplFeatId,
        },
      });
    }
    return placeFeatId;
  };

  const ensureProceduralStructureFeature = (
    procId,
    { groundCheck = true, featureIdOverride = null, filePathOverride = null } = {},
  ) => {
    const variants = resolvedStructures.proceduralVariants.get(procId) ?? [];
    const featId = featureIdOverride ?? `betterend:proc_${procId}_feature`;
    const relPath = filePathOverride ?? `features/proc_${procId}_feature.json`;
    if (features.has(relPath)) return featId;

    const weightedChoices = variants.map(meta => [
      ensureStructureTemplateFeature(meta, { groundCheck }),
      10,
    ]);
    features.set(relPath, {
      format_version: BEDROCK_FEATURE_FORMAT_VERSION,
      'minecraft:weighted_random_feature': {
        description: { identifier: featId },
        features: weightedChoices,
      },
    });
    return featId;
  };

  // Shared 1:1 BetterEnd .mcstructure features for Water Lakes, Big Aurora Crystals, and 3D Ice Stars
  ensureProceduralStructureFeature('end_lake', {
    groundCheck: true,
    featureIdOverride: 'betterend:water_pond_patch_feature',
    filePathOverride: 'features/water_pond_patch_feature.json',
  });
  ensureProceduralStructureFeature('desert_lake', {
    groundCheck: true,
    featureIdOverride: 'betterend:desert_lake_feature',
    filePathOverride: 'features/desert_lake_feature.json',
  });
  ensureProceduralStructureFeature('sulphuric_lake', {
    groundCheck: true,
    featureIdOverride: 'betterend:sulphuric_lake_feature',
    filePathOverride: 'features/sulphuric_lake_feature.json',
  });
  ensureProceduralStructureFeature('pond_with_waterfall', {
    groundCheck: true,
    featureIdOverride: 'betterend:pond_with_waterfall_feature',
    filePathOverride: 'features/pond_with_waterfall_feature.json',
  });
  ensureProceduralStructureFeature('big_aurora_crystal', {
    groundCheck: true,
    featureIdOverride: 'betterend:big_aurora_crystal_cluster_feature',
    filePathOverride: 'features/big_aurora_crystal_cluster_feature.json',
  });

  const iceStarSmallFeat = ensureProceduralStructureFeature('ice_star_small', { groundCheck: false });
  const iceStarMedFeat = ensureProceduralStructureFeature('ice_star', { groundCheck: false });
  const iceStarGiantFeat = ensureProceduralStructureFeature('giant_ice_star', { groundCheck: false });
  features.set('features/ice_star_structure_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:weighted_random_feature': {
      description: { identifier: 'betterend:ice_star_structure_feature' },
      features: [
        [iceStarSmallFeat, 60],
        [iceStarMedFeat, 30],
        [iceStarGiantFeat, 10],
      ],
    },
  });

  // Emit 1:1 BetterEnd SDF/Spline .mcstructure tree features for all 11 BetterEnd tree species + giant_mossy_glowshroom
  const treeFeatureIds = new Map();
  for (const treeDesc of FEATURES_BY_CATEGORY.trees ?? []) {
    const featId = ensureProceduralStructureFeature(treeDesc.id, {
      groundCheck: true,
      featureIdOverride: `betterend:tree_${treeDesc.id}_feature`,
      filePathOverride: `features/tree_${treeDesc.id}_feature.json`,
    });
    treeFeatureIds.set(treeDesc.id, featId);
  }
  const giantGlowshroomFeat = ensureProceduralStructureFeature('giant_mossy_glowshroom', {
    groundCheck: true,
  });
  const largeAmaranitaFeat = ensureProceduralStructureFeature('large_amaranita', {
    groundCheck: true,
  });
  treeFeatureIds.set('large_amaranita', largeAmaranitaFeat);

  // Biome-specific multi-block plants, bushes, and terrain landmarks from original BetterEnd Java biome definitions
  const BIOME_PROCEDURAL_SUBFEATURES = {
    foggy_mushroomland: ['blue_vine', 'end_lily', 'end_lotus', 'end_lotus_leaf'],
    chorus_forest: ['pythadendron_bush'],
    megalake: ['end_lotus', 'end_lotus_leaf', 'end_lily', 'menger_sponge'],
    megalake_grove: ['end_lotus', 'end_lotus_leaf', 'end_lily', 'hydralux', 'menger_sponge'],
    shadow_forest: ['dragon_tree_bush'],
    amber_land: ['lanceleaf', 'glow_pillar'],
    blossoming_spires: ['tenanea_bush', 'silk_moth_nest', 'twisted_umbrella_moss_double'],
    sulphur_springs: ['geyser', 'surface_vent', 'sulphur_hill', 'hydralux'],
    umbrella_jungle: ['umbrella_moss_double', 'twisted_umbrella_moss_double', 'menger_sponge'],
    glowing_grasslands: ['lumecorn', 'umbrella_moss_double'],
    dragon_graveyards: ['large_amaranita', 'small_amaranita'],
    lantern_woods: ['lucernia_bush'],
    neon_oasis: ['neon_cactus'],
    flower_islets: ['large_amaranita', 'small_amaranita'],
    waterfall_ponds: ['lumecorn', 'umbrella_moss_double'],
    lush_smaragdant_cave: ['cave_bush', 'smaragdant_crystal'],
    empty_smaragdant_cave: ['smaragdant_crystal'],
    lush_aurora_cave: ['cave_bush'],
  };

  const BIOME_LANDMARK_PROCEDURAL = {
    foggy_mushroomland: ['giant_mossy_glowshroom'],
    blossoming_spires: ['spire', 'floating_spire'],
    umbra_valley: ['umbralith_arch', 'thin_umbralith_arch'],
    dragon_graveyards: ['obsidian_pillar_basement', 'fallen_pillar', 'obsidian_boulder'],
    flower_islets: ['small_island'],
    waterfall_ponds: ['small_island'],
  };

  // Emit all 27 Native Biomes + Native Surface/Flora/Tree/Structure Features & Feature Rules
  for (const [idx, region] of REGION_CATALOGUE.entries()) {
    // 1. Native Biome definition (format_version 1.26.30)
    biomes.set(`biomes/${region.id}.biome.json`, {
      format_version: '1.26.30',
      'minecraft:biome': {
        description: {
          identifier: `betterend:${region.id}`,
        },
        components: {
          'minecraft:climate': {
            downfall: 0.5,
            snow_accumulation: [0.0, 0.125],
            temperature: 0.5,
          },
          'minecraft:surface_builder': {
            builder: {
              type: 'minecraft:the_end',
            },
          },
          'minecraft:tags': {
            tags: ['the_end', 'betterend', region.id, `betterend_${region.layer}`],
          },
        },
      },
    });

    const warpXExpr = (xE, zE) =>
      `(${xE} + math.sin(${zE} * 0.45) * 70 + math.cos((${xE} + ${zE}) * 0.28) * 40 + query.noise(${xE} * 0.012, ${zE} * 0.012) * 28 + query.noise(${xE} * 0.04 + 53, ${zE} * 0.04 + 53) * 8)`;
    const warpZExpr = (xE, zE) =>
      `(${zE} + math.cos(${xE} * 0.45) * 70 + math.sin((${zE} - ${xE}) * 0.28) * 40 + query.noise(${xE} * 0.012 + 97, ${zE} * 0.012 + 97) * 28 + query.noise(${xE} * 0.04 + 149, ${zE} * 0.04 + 149) * 8)`;
    const cellMatchAt = (xE, zE) => {
      const cxE = `math.floor(${warpXExpr(xE, zE)} / 320)`;
      const czE = `math.floor(${warpZExpr(xE, zE)} / 320)`;
      return `((math.abs(${xE}) > 1024 || math.abs(${zE}) > 1024) && math.mod(math.floor(math.abs(math.sin(${cxE} * 127.1 + ${czE} * 311.7) * 43758.5453)), 27) == ${idx})`;
    };
    const cellCond = cellMatchAt('variable.originx + 8', 'variable.originz + 8');
    const colCellCond = cellMatchAt('variable.worldx', 'variable.worldz');
    const chunkSurfaceCond = `(${cellCond} || ${cellMatchAt('variable.originx', 'variable.originz')} || ${cellMatchAt('variable.originx + 15', 'variable.originz + 15')} || ${cellMatchAt('variable.originx + 15', 'variable.originz')} || ${cellMatchAt('variable.originx', 'variable.originz + 15')})`;
    const chunkHashExpr = (saltA, saltB, saltC) =>
      `math.floor(math.abs(math.sin(math.floor(variable.originx / 16) * ${saltA} + math.floor(variable.originz / 16) * ${saltB} + ${saltC}) * 43758.5453))`;

    // 2. Native Perlin-Noise Coherent Surface Replacement (16x16x3 vertical column covering top 3 layers of every column)
    const primaryTop =
      region.surface?.topBlock && region.surface.topBlock !== 'minecraft:end_stone'
        ? region.surface.topBlock
        : region.surface?.altTopBlock ?? 'betterend:end_moss';
    const altTop =
      region.surface?.altTopBlock && region.surface.altTopBlock !== primaryTop
        ? region.surface.altTopBlock
        : null;

    const primarySurfaceFeat = ensureSurfaceBlockFeature(primaryTop);
    const colFeatId = `betterend:biome_${region.id}_surface_col_feature`;
    if (altTop) {
      const altSurfaceFeat = ensureSurfaceBlockFeature(altTop);
      const surfaceNoiseExpr = `(query.noise(variable.worldx * 0.075, variable.worldz * 0.075) + query.noise(variable.worldx * 0.21 + 37, variable.worldz * 0.21 + 71) * 0.35)`;
      const colPrimaryId = `betterend:biome_${region.id}_surface_col_primary_feature`;
      const colAltId = `betterend:biome_${region.id}_surface_col_alt_feature`;
      features.set(`features/biome_${region.id}_surface_col_primary_feature.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:scatter_feature': {
          description: { identifier: colPrimaryId },
          iterations: `${colCellCond} && query.heightmap(variable.worldx, variable.worldz) >= 16 && ${surfaceNoiseExpr} <= 0.16 ? 3 : 0`,
          coordinate_eval_order: 'zyx',
          x: 0,
          z: 0,
          y: { distribution: 'fixed_grid', extent: [-2, 0] },
          project_input_to_floor: false,
          places_feature: primarySurfaceFeat,
        },
      });
      features.set(`features/biome_${region.id}_surface_col_alt_feature.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:scatter_feature': {
          description: { identifier: colAltId },
          iterations: `${colCellCond} && query.heightmap(variable.worldx, variable.worldz) >= 16 && ${surfaceNoiseExpr} > 0.16 ? 3 : 0`,
          coordinate_eval_order: 'zyx',
          x: 0,
          z: 0,
          y: { distribution: 'fixed_grid', extent: [-2, 0] },
          project_input_to_floor: false,
          places_feature: altSurfaceFeat,
        },
      });
      features.set(`features/biome_${region.id}_surface_col_feature.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:aggregate_feature': {
          description: { identifier: colFeatId },
          early_out: 'none',
          features: [colPrimaryId, colAltId],
        },
      });
    } else {
      features.set(`features/biome_${region.id}_surface_col_feature.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:scatter_feature': {
          description: {
            identifier: colFeatId,
          },
          iterations: `${colCellCond} && query.heightmap(variable.worldx, variable.worldz) >= 16 ? 3 : 0`,
          coordinate_eval_order: 'zyx',
          x: 0,
          z: 0,
          y: { distribution: 'fixed_grid', extent: [-2, 0] },
          project_input_to_floor: false,
          places_feature: primarySurfaceFeat,
        },
      });
    }

    const gridFeatId = `betterend:biome_${region.id}_surface_grid_feature`;
    features.set(`features/biome_${region.id}_surface_grid_feature.json`, {
      format_version: BEDROCK_FEATURE_FORMAT_VERSION,
      'minecraft:scatter_feature': {
        description: {
          identifier: gridFeatId,
        },
        iterations: 256,
        coordinate_eval_order: 'zyx',
        x: { distribution: 'fixed_grid', extent: [0, 15] },
        z: { distribution: 'fixed_grid', extent: [0, 15] },
        y: 'query.heightmap(variable.worldx, variable.worldz) - 1',
        project_input_to_floor: false,
        places_feature: colFeatId,
      },
    });

    featureRules.set(`feature_rules/biome_${region.id}_surface_rule.json`, {
      format_version: BEDROCK_FEATURE_FORMAT_VERSION,
      'minecraft:feature_rules': {
        description: {
          identifier: `betterend:biome_${region.id}_surface_rule`,
          places_feature: gridFeatId,
        },
        conditions: {
          placement_pass: 'surface_pass',
          'minecraft:biome_filter': [
            { test: 'has_biome_tag', operator: '==', value: 'the_end' },
          ],
        },
        distribution: {
          iterations: `${chunkSurfaceCond} ? 1 : 0`,
          x: 0,
          y: 0,
          z: 0,
        },
      },
    });

    // 3. Native Curated Flora Scatter in after_surface_pass (modulated by Perlin noise density)
    const curatedFlora = (BIOME_SURFACE_FLORA[region.id] ?? ['betterend:creeping_moss', 'betterend:amber_grass']).filter(
      blk => knownBlockIds.has(blk),
    );
    const floraBlocks = curatedFlora.length > 0 ? curatedFlora : ['betterend:creeping_moss'];

    const regionTrees = [];
    for (const fId of region.features ?? []) {
      if (treeFeatureIds.has(fId)) {
        regionTrees.push(treeFeatureIds.get(fId));
      }
    }
    if (region.id === 'flower_islets' && treeFeatureIds.has('large_amaranita')) {
      regionTrees.push(treeFeatureIds.get('large_amaranita'));
    }

    const weightedFlora = floraBlocks.slice(0, 8).map(blk => [ensureFloraBlockFeature(blk), 10]);
    const biomeFloraFeatId = `betterend:biome_${region.id}_flora_feature`;
    features.set(`features/biome_${region.id}_flora_feature.json`, {
      format_version: BEDROCK_FEATURE_FORMAT_VERSION,
      'minecraft:weighted_random_feature': {
        description: {
          identifier: biomeFloraFeatId,
        },
        features: weightedFlora,
      },
    });

    const floraDensity = BIOME_FLORA_DENSITY[region.id] ?? 24;
    featureRules.set(`feature_rules/biome_${region.id}_flora_rule.json`, {
      format_version: BEDROCK_FEATURE_FORMAT_VERSION,
      'minecraft:feature_rules': {
        description: {
          identifier: `betterend:biome_${region.id}_flora_rule`,
          places_feature: biomeFloraFeatId,
        },
        conditions: {
          placement_pass: 'after_surface_pass',
          'minecraft:biome_filter': [
            { test: 'has_biome_tag', operator: '==', value: 'the_end' },
          ],
        },
        distribution: {
          iterations: `${cellCond} && query.heightmap(variable.originx + 8, variable.originz + 8) >= 48 ? math.max(4, math.floor(${floraDensity} * (0.65 + 0.65 * query.noise(variable.originx * 0.04, variable.originz * 0.04)))) : 0`,
          x: { distribution: 'uniform', extent: [0, 16] },
          y: 'query.heightmap(variable.worldx, variable.worldz)',
          z: { distribution: 'uniform', extent: [0, 16] },
        },
      },
    });

    // 4. Native 1:1 BetterEnd SDF/Spline Tree / Giant Mushroom Scatter in after_surface_pass (Perlin noise groves + non-linear hash)
    if (regionTrees.length > 0) {
      let targetTreeFeat = regionTrees[0];
      if (regionTrees.length > 1) {
        const mixId = `betterend:biome_${region.id}_tree_mix_feature`;
        features.set(`features/biome_${region.id}_tree_mix_feature.json`, {
          format_version: BEDROCK_FEATURE_FORMAT_VERSION,
          'minecraft:weighted_random_feature': {
            description: { identifier: mixId },
            features: regionTrees.map(t => [t, 10]),
          },
        });
        targetTreeFeat = mixId;
      }

      const treeHash = chunkHashExpr(127.1, 311.7, 13.7 + idx);
      const treeNoise = `query.noise(variable.originx * 0.025 + ${idx * 17}, variable.originz * 0.025 + ${idx * 17})`;
      featureRules.set(`feature_rules/biome_${region.id}_tree_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_tree_rule`,
            places_feature: targetTreeFeat,
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${cellCond} && query.heightmap(variable.originx + 8, variable.originz + 8) >= 50 && ((${treeNoise} > 0.25 && math.mod(${treeHash}, 2) == 0) || (${treeNoise} > -0.2 && math.mod(${treeHash}, 4) == 0)) ? 1 : 0`,
            x: { distribution: 'uniform', extent: [1, 15] },
            y: 'query.heightmap(variable.worldx, variable.worldz)',
            z: { distribution: 'uniform', extent: [1, 15] },
          },
        },
      });
    }

    // 5. Native 1:1 Multi-Block Plants & Bushes per Biome (Perlin noise + non-linear hash)
    const subFeatureList = BIOME_PROCEDURAL_SUBFEATURES[region.id] ?? [];
    if (subFeatureList.length > 0) {
      const subChoices = subFeatureList.map(procId => [
        ensureProceduralStructureFeature(procId, { groundCheck: true }),
        10,
      ]);
      const subMixId = `betterend:biome_${region.id}_subfeatures_feature`;
      features.set(`features/biome_${region.id}_subfeatures_feature.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:weighted_random_feature': {
          description: { identifier: subMixId },
          features: subChoices,
        },
      });

      const subHash = chunkHashExpr(269.5, 183.3, 31.1 + idx);
      featureRules.set(`feature_rules/biome_${region.id}_subfeatures_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_subfeatures_rule`,
            places_feature: subMixId,
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${cellCond} && query.heightmap(variable.originx + 8, variable.originz + 8) >= 50 && query.noise(variable.originx * 0.035 + 41, variable.originz * 0.035 + 41) > -0.15 && math.mod(${subHash}, 3) == 0 ? 1 : 0`,
            x: { distribution: 'uniform', extent: [2, 14] },
            y: 'query.heightmap(variable.worldx, variable.worldz)',
            z: { distribution: 'uniform', extent: [2, 14] },
          },
        },
      });
    }

    // 6. Native 1:1 Water Lakes/Ponds in Megalake & Lake Biomes
    if (
      [
        'megalake',
        'megalake_grove',
        'foggy_mushroomland',
        'sulphur_springs',
        'neon_oasis',
        'waterfall_ponds',
      ].includes(region.id)
    ) {
      const lakeFeatId =
        region.id === 'neon_oasis'
          ? 'betterend:desert_lake_feature'
          : region.id === 'sulphur_springs'
            ? 'betterend:sulphuric_lake_feature'
            : region.id === 'waterfall_ponds'
              ? 'betterend:pond_with_waterfall_feature'
              : 'betterend:water_pond_patch_feature';
      const lakeStride = region.id === 'megalake' || region.id === 'megalake_grove' ? 5 : 8;
      const lakeHash = chunkHashExpr(419.2, 371.9, 59.3 + idx);
      featureRules.set(`feature_rules/biome_${region.id}_pond_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_pond_rule`,
            places_feature: lakeFeatId,
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${cellCond} && query.heightmap(variable.originx + 8, variable.originz + 8) >= 50 && math.mod(${lakeHash}, ${lakeStride}) == 0 ? 1 : 0`,
            x: { distribution: 'uniform', extent: [3, 13] },
            y: 'query.heightmap(variable.worldx, variable.worldz) - 1',
            z: { distribution: 'uniform', extent: [3, 13] },
          },
        },
      });
    }

    // 7. Native 3D Spiky Ice Stars in Ice Starfield
    if (region.id === 'ice_starfield') {
      const starHash = chunkHashExpr(173.9, 293.1, 71.7);
      featureRules.set(`feature_rules/biome_ice_starfield_star_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: 'betterend:biome_ice_starfield_star_rule',
            places_feature: 'betterend:ice_star_structure_feature',
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${cellCond} && query.noise(variable.originx * 0.02, variable.originz * 0.02) > -0.2 && math.mod(${starHash}, 7) == 0 ? 1 : 0`,
            x: { distribution: 'uniform', extent: [2, 14] },
            y: { distribution: 'uniform', extent: [58, 94] },
            z: { distribution: 'uniform', extent: [2, 14] },
          },
        },
      });
    }

    // 8. Native 3D Big Aurora Crystal Hexagonal Prisms in Crystal Mountains & Aurora Caves (strictly void-gated!)
    if (['crystal_mountains', 'empty_aurora_cave', 'lush_aurora_cave'].includes(region.id)) {
      const auroraHash = chunkHashExpr(347.3, 197.7, 83.9 + idx);
      featureRules.set(`feature_rules/biome_${region.id}_aurora_pillar_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_aurora_pillar_rule`,
            places_feature: 'betterend:big_aurora_crystal_cluster_feature',
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${cellCond} && query.heightmap(variable.originx + 8, variable.originz + 8) >= 50 && math.mod(${auroraHash}, 6) == 0 ? 1 : 0`,
            x: { distribution: 'uniform', extent: [2, 14] },
            y: 'query.heightmap(variable.worldx, variable.worldz)',
            z: { distribution: 'uniform', extent: [2, 14] },
          },
        },
      });
    }

    // 9. Original BetterEnd .nbt Biome Buildings & Ruins (structures.json)
    const nbtStructs = resolvedStructures.biomeNbtStructures.get(region.id) ?? [];
    if (nbtStructs.length > 0) {
      const nbtChoices = nbtStructs.map(meta => [
        ensureStructureTemplateFeature(meta, { groundCheck: true }),
        10,
      ]);
      const nbtMixId = `betterend:biome_${region.id}_nbt_structures_feature`;
      features.set(`features/biome_${region.id}_nbt_structures_feature.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:weighted_random_feature': {
          description: { identifier: nbtMixId },
          features: nbtChoices,
        },
      });
      const nbtHash = chunkHashExpr(521.7, 241.3, 101.5 + idx);
      featureRules.set(`feature_rules/biome_${region.id}_nbt_structures_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_nbt_structures_rule`,
            places_feature: nbtMixId,
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${cellCond} && query.heightmap(variable.originx + 8, variable.originz + 8) >= 50 && math.mod(${nbtHash}, 18) == 0 ? 1 : 0`,
            x: { distribution: 'uniform', extent: [3, 13] },
            y: 'query.heightmap(variable.worldx, variable.worldz)',
            z: { distribution: 'uniform', extent: [3, 13] },
          },
        },
      });
    }

    // 10. Massive Terrain Landmarks (Giant Glowshroom, Spires, Floating Spires, Arches, Obsidian Pillars, Floating Islands)
    const landmarks = BIOME_LANDMARK_PROCEDURAL[region.id] ?? [];
    if (landmarks.length > 0) {
      const landmarkChoices = landmarks.map(procId => {
        const isAerial = procId === 'floating_spire' || procId === 'small_island';
        return [ensureProceduralStructureFeature(procId, { groundCheck: !isAerial }), 10];
      });
      const lmMixId = `betterend:biome_${region.id}_landmarks_feature`;
      features.set(`features/biome_${region.id}_landmarks_feature.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:weighted_random_feature': {
          description: { identifier: lmMixId },
          features: landmarkChoices,
        },
      });
      const isAerialBiome = region.id === 'flower_islets' || region.id === 'waterfall_ponds';
      const lmHash = chunkHashExpr(389.3, 463.7, 137.9 + idx);
      featureRules.set(`feature_rules/biome_${region.id}_landmarks_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_landmarks_rule`,
            places_feature: lmMixId,
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${cellCond} && query.noise(variable.originx * 0.02 + 91, variable.originz * 0.02 + 91) > -0.15 && math.mod(${lmHash}, 14) == 0 ? 1 : 0`,
            x: { distribution: 'uniform', extent: [2, 14] },
            y: isAerialBiome
              ? { distribution: 'uniform', extent: [58, 86] }
              : 'query.heightmap(variable.worldx, variable.worldz)',
            z: { distribution: 'uniform', extent: [2, 14] },
          },
        },
      });
    }
  }

  return {
    biomes,
    serverEntities,
    clientEntities,
    entityGeometries,
    renderControllers,
    animations,
    entityLootTables,
    features,
    featureRules,
    structures: resolvedStructures.structureFiles,
  };
}

export async function compileAllContent({ repoRoot = defaultRepoRoot } = {}) {
  const registrations = JSON.parse(
    readFileSync(path.resolve(repoRoot, 'bedrock/catalogue/generated/registrations.json'), 'utf8'),
  );
  const resources = JSON.parse(
    readFileSync(path.resolve(repoRoot, 'bedrock/catalogue/generated/resources.json'), 'utf8'),
  );
  const { runtime } = await loadLockedRuntime(path.resolve(repoRoot, 'bedrock'));

  const modelAssets = await compileAllModelsAndAssets({ repoRoot });
  const blocks = compileBlocks(registrations, modelAssets);
  const items = compileItems(registrations);
  const recipes = compileRecipes(resources, runtime);
  const mcStructures = compileAllMcStructures({ repoRoot, blocks });
  const entitiesAndFeatures = compileEntitiesAndFeatures(registrations, resources, mcStructures);

  return {
    counts: {
      catalogueBlocks: (registrations.blocks ?? []).length,
      bedrockBlockDefinitions: blocks.blockJsonMap.size,
      totalBlockStates: blocks.forwardStateMap.size,
      items: items.itemJsonMap.size,
      totalRecipes: recipes.graph.edges.length,
      nativeRecipeFiles: recipes.nativeRecipeFiles.size,
      stationAlloyingRecipes: recipes.stationRecipes.alloying.length,
      stationSmithingRecipes: recipes.stationRecipes.smithingStation.length,
      stationInfusionRecipes: recipes.stationRecipes.infusion.length,
      catalogueEntities: (registrations.entities ?? []).length,
      serverEntities: entitiesAndFeatures.serverEntities.size,
      clientEntities: entitiesAndFeatures.clientEntities.size,
      features: entitiesAndFeatures.features.size,
      featureRules: entitiesAndFeatures.featureRules.size,
      structures: entitiesAndFeatures.structures.size,
    },
    modelAssets,
    blocks,
    items,
    recipes,
    entitiesAndFeatures,
    mcStructures,
  };
}
