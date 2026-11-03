import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRecipeHyperedgeGraph } from './recipes.mjs';
import { loadLockedRuntime } from './runtime-reconciliation.mjs';
import { compareText } from './source-files.mjs';
import { compileAllModelsAndAssets, getGeometryIdForModel, normalizeModelId } from './model-compiler.mjs';
import { compileAllMcStructures } from './mcstructure-compiler.mjs';
import { NATIVE_CELL_SIZE, NATIVE_SUBCELL_SIZE, NATIVE_SUB_BIOME_PARENTS } from '../runtime/regions/native-cell-map.js';
import {
  CHUNK_CENTER_X,
  CHUNK_CENTER_Z,
  CHUNK_X,
  CHUNK_Z,
  SITE_LAYERS,
  chunkOffsetExpr,
  molangAerialMatch,
  molangChunkAnyMatch,
  molangChunkHasLand,
  molangChunkHash,
  molangChunkNearCellEdge,
  molangFootprintGuard,
  molangNearActiveSite,
  molangOuterGuard,
  molangRegionMatch,
  molangSiteActive,
  molangSiteHere,
  molangSiteWithin,
  molangSurfaceRegionMatch,
  molangTreeCount,
  molangVoidAround,
  siteCoords,
} from './placement-molang.mjs';
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

export function inverseRotateJavaBounds(bounds, rotX = 0, rotY = 0) {
  if (!Array.isArray(bounds) || bounds.length !== 6) return bounds;
  let [minX, minY, minZ, maxX, maxY, maxZ] = bounds;
  const ny = ((rotY % 360) + 360) % 360;
  if (ny === 90) {
    [minX, maxX, minZ, maxZ] = [minZ, maxZ, 1 - maxX, 1 - minX];
  } else if (ny === 180) {
    [minX, maxX, minZ, maxZ] = [1 - maxX, 1 - minX, 1 - maxZ, 1 - minZ];
  } else if (ny === 270) {
    [minX, maxX, minZ, maxZ] = [1 - maxZ, 1 - minZ, minX, maxX];
  }
  const nx = ((rotX % 360) + 360) % 360;
  if (nx === 90) {
    [minY, maxY, minZ, maxZ] = [1 - maxZ, 1 - minZ, minY, maxY];
  } else if (nx === 180) {
    [minY, maxY, minZ, maxZ] = [1 - maxY, 1 - minY, 1 - maxZ, 1 - minZ];
  } else if (nx === 270) {
    [minY, maxY, minZ, maxZ] = [minZ, maxZ, 1 - maxY, 1 - minY];
  }
  return [minX, minY, minZ, maxX, maxY, maxZ];
}

export function boundsToBedrockBox(
  boundsOrShapeStr,
  shapeKind,
  { isCollision = false, centerXZ = false, invRotX = 0, invRotY = 0 } = {},
) {
  let bounds =
    typeof boundsOrShapeStr === 'string'
      ? parseShapeStringBounds(boundsOrShapeStr)
      : boundsOrShapeStr;
  if (shapeKind === 'empty' || boundsOrShapeStr === 'empty' || !Array.isArray(bounds) || bounds.length !== 6) {
    return false;
  }
  if (invRotX !== 0 || invRotY !== 0) {
    bounds = inverseRotateJavaBounds(bounds, invRotX, invRotY);
  }
  const [minX, minY, minZ, maxX, maxY, maxZ] = bounds;
  if (maxX <= minX || maxY <= minY || maxZ <= minZ) {
    return false;
  }
  const maxAllowedY = isCollision ? 24 : 16;
  const rawSx = clamp(roundBoxVal((maxX - minX) * 16), 0, 16);
  const rawSy = clamp(roundBoxVal((maxY - minY) * 16), 0, maxAllowedY);
  const rawSz = clamp(roundBoxVal((maxZ - minZ) * 16), 0, 16);
  const ox = centerXZ
    ? clamp(roundBoxVal(-rawSx / 2), -8, 8)
    : clamp(roundBoxVal(8 - maxX * 16), -8, 8);
  const oy = clamp(roundBoxVal(minY * 16), 0, 16);
  const oz = centerXZ
    ? clamp(roundBoxVal(-rawSz / 2), -8, 8)
    : clamp(roundBoxVal(minZ * 16 - 8), -8, 8);
  const sx = clamp(rawSx, 0, 8 - ox);
  const sy = clamp(rawSy, 0, maxAllowedY - oy);
  const sz = clamp(rawSz, 0, 8 - oz);
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
  const orderTraitDomain = (propName, arr) => {
    const moveFirst = val => (arr.includes(val) ? [val, ...arr.filter(v => v !== val)] : arr);
    if (propName === 'facing') {
      if (arr.includes('up')) return moveFirst('up');
      if (arr.includes('north')) return moveFirst('north');
    }
    if (propName === 'half' || propName === 'type') {
      if (arr.includes('bottom')) return moveFirst('bottom');
      if (arr.includes('lower')) return moveFirst('lower');
    }
    if (propName === 'axis') {
      if (arr.includes('y')) return moveFirst('y');
    }
    if (propName === 'shape') {
      if (arr.includes('straight')) return moveFirst('straight');
      if (arr.includes('bottom')) return moveFirst('bottom');
    }
    if (
      propName === 'waterlogged' ||
      propName === 'open' ||
      propName === 'powered' ||
      propName === 'in_wall' ||
      propName === 'attached' ||
      propName === 'active' ||
      propName === 'lit' ||
      propName === 'has_item' ||
      propName === 'has_light' ||
      propName === 'top'
    ) {
      if (arr.includes(false)) return moveFirst(false);
    }
    if (propName === 'is_floor') {
      if (arr.includes(true)) return moveFirst(true);
    }
    return arr;
  };

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

  // If splitting by waterlogged (false vs true) fits all non-waterlogged states into a single <=64 partition
  // (e.g. stairs: facing(4) * half(2) * shape(5) = 40), partition by waterlogged first so partition 0 has all orientations.
  const orderedProps =
    totalStates / 2 <= MAX_BLOCK_PERMUTATIONS && props.some(p => p.name === 'waterlogged' && p.domain.length === 2)
      ? [
          ...props.filter(p => p.name === 'waterlogged'),
          ...props.filter(p => p.name !== 'waterlogged'),
        ]
      : props;

  // Greedily select suffix properties whose domain product <= 64
  const keptProps = [];
  let product = 1;
  for (let i = orderedProps.length - 1; i >= 0; i -= 1) {
    const p = orderedProps[i];
    const len = p.domain.length;
    if (product * len <= MAX_BLOCK_PERMUTATIONS && keptProps.length + 1 <= MAX_BLOCK_TRAITS) {
      keptProps.unshift(p);
      product *= len;
    } else {
      break;
    }
  }

  const keptNames = new Set(keptProps.map(p => p.name));
  const outerProps = orderedProps.filter(p => !keptNames.has(p.name));

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

  const orderedBuckets = [...buckets.values()].sort((a, b) => {
    const wa = a.fixedProperties?.waterlogged;
    const wb = b.fixedProperties?.waterlogged;
    if (wa !== undefined && wb !== undefined && String(wa) !== String(wb)) {
      return String(wa) === 'false' ? -1 : 1;
    }
    return 0;
  });

  const partitions = [];
  let idx = 0;
  for (const bucket of orderedBuckets) {
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
    topClass.includes('Seed') ||
    topClass.includes('Moss') ||
    topClass.includes('Nylium') ||
    topClass.includes('Path') ||
    topClass.includes('Vine') ||
    topClass.includes('Plant') ||
    topClass.includes('Leaves') ||
    shortName.endsWith('_sapling') ||
    shortName.endsWith('_seed') ||
    shortName === 'shadow_berry' ||
    shortName === 'neon_cactus' ||
    shortName === 'lumecorn' ||
    shortName === 'lanceleaf' ||
    shortName === 'hydralux' ||
    shortName === 'end_lily' ||
    shortName.startsWith('end_lotus') ||
    shortName.includes('amaranita') ||
    shortName === 'filalux' ||
    shortName === 'rubinea' ||
    shortName === 'magnula' ||
    shortName.includes('geyser') ||
    shortName.includes('brimstone') ||
    shortName.includes('budding_')
  ) {
    components.add('betterend:ecology_tick');
  }
  const propNames = Object.keys(blockEntry.runtime?.propertyDomains ?? {});
  if (
    propNames.includes('half') ||
    propNames.includes('shape') ||
    propNames.includes('part') ||
    propNames.includes('top') ||
    shortName === 'glowing_pillar_roots' ||
    shortName === 'glowing_pillar_luminophor'
  ) {
    components.add('betterend:multiblock_guard');
  }
  if (
    propNames.includes('facing') ||
    propNames.includes('axis') ||
    propNames.includes('half') ||
    propNames.includes('type') ||
    propNames.includes('open') ||
    propNames.includes('rotation')
  ) {
    components.add('betterend:interactive_furniture');
  }
  return [...components];
}

function findStateSnapshotRecord(blockEntry, stateProps) {
  const records = blockEntry.stateSnapshot?.records;
  if (!Array.isArray(records) || records.length === 0) return null;
  if (records.length === 1) return records[0];
  for (const rec of records) {
    if (!rec?.states) continue;
    let match = true;
    for (const [k, v] of Object.entries(rec.states)) {
      if (stateProps[k] !== undefined && String(stateProps[k]) !== String(v)) {
        match = false;
        break;
      }
    }
    if (match) return rec;
  }
  return records[0];
}

function resolveStateBedrockBoxes(blockEntry, stateProps, resolved, isCenterXZ) {
  const shortName = blockEntry.id.split(':')[1] ?? '';
  const stateRec = findStateSnapshotRecord(blockEntry, stateProps);
  const invRotX = Number(resolved?.x ?? 0);
  const invRotY = Number(resolved?.y ?? 0);

  // Ceiling-hanging seeds: outline box hugs the top of the block (y = 4..16) where the bulb hangs
  if (shortName === 'bulb_vine_seed' || shortName === 'cave_pumpkin_seed') {
    return {
      collisionBox: false,
      selectionBox: { origin: [-4, 4, -4], size: [8, 12, 8] },
    };
  }

  // Ladders: thin 1px climbable wall collision + 3px selection box so players can step into & climb ladders
  if (shortName.endsWith('_ladder')) {
    const selBox = boundsToBedrockBox(
      stateRec?.selection ?? '[0,0,0.8125|1,1,1]',
      'box',
      { isCollision: false, centerXZ: false, invRotX, invRotY },
    );
    const colBox = boundsToBedrockBox(
      '[0,0,0.9375|1,1,1]',
      'box',
      { isCollision: true, centerXZ: false, invRotX: 0, invRotY: 0 },
    );
    return { collisionBox: colBox, selectionBox: selBox };
  }

  let rawCollision = stateRec?.collision ?? blockEntry.stateSnapshot?.collisionBounds;
  let rawSelection = stateRec?.selection ?? blockEntry.stateSnapshot?.outlineBounds;

  // Neon cactus middle & bottom segments fill full 0..16 height along their growth axis
  if (
    blockEntry.id === 'betterend:neon_cactus' &&
    (stateProps.shape === 'bottom' || stateProps.shape === 'middle')
  ) {
    const inset = stateProps.shape === 'bottom' ? 0.125 : 0.1875;
    const unrotFull = [inset, 0, inset, 1 - inset, 1, 1 - inset];
    return {
      collisionBox: boundsToBedrockBox(unrotFull, 'box', { isCollision: true, centerXZ: true }),
      selectionBox: boundsToBedrockBox(unrotFull, 'box', { isCollision: false, centerXZ: true }),
    };
  }

  const collisionBox = boundsToBedrockBox(
    rawCollision,
    stateRec?.collision === 'empty'
      ? 'empty'
      : blockEntry.stateSnapshot?.collisionShape ?? 'box',
    { isCollision: true, centerXZ: isCenterXZ, invRotX, invRotY },
  );
  const selectionBox = boundsToBedrockBox(
    rawSelection,
    stateRec?.selection === 'empty'
      ? 'empty'
      : blockEntry.stateSnapshot?.outlineShape ?? 'box',
    { isCollision: false, centerXZ: isCenterXZ, invRotX, invRotY },
  );
  return { collisionBox, selectionBox };
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
            s.properties.type !== 'top' &&
            s.properties.type !== 'double' &&
            s.properties.open !== 'true' &&
            s.properties.waterlogged !== 'true',
        ) ??
        partition.states.find(
          s =>
            s.properties.top !== 'true' &&
            s.properties.half !== 'upper' &&
            s.properties.half !== 'top' &&
            s.properties.type !== 'top' &&
            s.properties.type !== 'double' &&
            s.properties.open !== 'true' &&
            s.properties.waterlogged !== 'true',
        ) ??
        partition.states[0];
      const defaultResolved = resolveStateModelAndRotation(
        blockstateDef,
        defaultState.properties,
        modelAssets.flattenedModels,
      );

      const allPropNames = Object.keys(blockEntry.runtime?.propertyDomains ?? {});
      const isCenterXZ =
        blockEntry.stateSnapshot?.coverageMode === 'uniform-all-states' ||
        (!allPropNames.includes('facing') &&
          !allPropNames.includes('axis') &&
          !allPropNames.includes('north') &&
          !allPropNames.includes('east'));

      const { collisionBox, selectionBox } = resolveStateBedrockBoxes(
        blockEntry,
        defaultState.properties,
        defaultResolved,
        isCenterXZ,
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
          const permBoxes = resolveStateBedrockBoxes(
            blockEntry,
            st.properties,
            resolved,
            isCenterXZ,
          );
          const permComponents = {
            'minecraft:collision_box': permBoxes.collisionBox,
            'minecraft:selection_box': permBoxes.selectionBox,
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
    'textures/entity/betterend/end_slime/end_slime',
    'textures/entity/betterend/end_slime/end_slime_mossy',
    'textures/entity/betterend/end_slime/end_slime_lake',
    'textures/entity/betterend/end_slime/end_slime_amber',
  ],
  'betterend:end_fish': [
    'textures/entity/betterend/end_fish/end_fish_0',
    'textures/entity/betterend/end_fish/end_fish_1',
    'textures/entity/betterend/end_fish/end_fish_2',
    'textures/entity/betterend/end_fish/end_fish_3',
    'textures/entity/betterend/end_fish/end_fish_4',
    'textures/entity/betterend/end_fish/end_fish_5',
    'textures/entity/betterend/end_fish/end_fish_6',
    'textures/entity/betterend/end_fish/end_fish_7',
  ],
  'betterend:shadow_walker': ['textures/entity/betterend/shadow_walker'],
  'betterend:cubozoa': [
    'textures/entity/betterend/cubozoa/cubozoa',
    'textures/entity/betterend/cubozoa/cubozoa_sulphur',
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

/**
 * Ported 1:1 from upstream Java entity models:
 * - CubozoaEntityModel.java (48x48)
 * - DragonflyEntityModel.java (64x64)
 * - EndFishEntityModel.java (32x32)
 * - EndSlimeEntityModel.java (64x32)
 * - SilkMothEntityModel.java (64x64)
 * - RendererEntityShadowWalker.java (64x64 humanoid)
 * - Vanilla Boat / ChestBoat Model (128x64)
 */
function buildEntityGeometry(shortName, width, height, { isBoat, isChestBoat, isChair }) {
  const geoId = `geometry.betterend.${shortName}`;
  if (isChair) {
    return {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: {
            identifier: geoId,
            texture_width: 16,
            texture_height: 16,
            visible_bounds_width: 1,
            visible_bounds_height: 1,
            visible_bounds_offset: [0, 0.5, 0],
          },
          bones: [{ name: 'root', pivot: [0, 0, 0], cubes: [] }],
        },
      ],
    };
  }

  if (shortName === 'cubozoa') {
    return {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: {
            identifier: geoId,
            texture_width: 48,
            texture_height: 48,
            visible_bounds_width: 2,
            visible_bounds_height: 2.5,
            visible_bounds_offset: [0, 0.75, 0],
          },
          bones: [
            {
              name: 'model',
              pivot: [0, 14, 0],
              cubes: [{ origin: [-2, 7, -2], size: [4, 4, 4], uv: [0, 17] }],
            },
            {
              name: 'main_cube_r1',
              parent: 'model',
              pivot: [0, 10, 0],
              cubes: [
                { origin: [-5, 2, -5], size: [10, 14, 10], uv: [0, 0] },
                { origin: [-3, 3, -3], size: [6, 12, 6], uv: [0, 25] },
              ],
            },
            {
              name: 'tentacle_center_1',
              parent: 'model',
              pivot: [0, 2, 0],
              rotation: [0, 0, 0],
              cubes: [{ origin: [-4, -6, 0], size: [8, 8, 0], uv: [16, 25] }],
            },
            {
              name: 'tentacle_1',
              parent: 'tentacle_center_1',
              pivot: [0, 2, 4],
              cubes: [{ origin: [-4, -6, 4], size: [8, 8, 0], uv: [16, 33] }],
            },
            {
              name: 'tentacle_center_2',
              parent: 'model',
              pivot: [0, 2, 0],
              rotation: [0, 90, 0],
              cubes: [{ origin: [-4, -6, 0], size: [8, 8, 0], uv: [16, 25] }],
            },
            {
              name: 'tentacle_2',
              parent: 'tentacle_center_2',
              pivot: [0, 2, 4],
              cubes: [{ origin: [-4, -6, 4], size: [8, 8, 0], uv: [16, 33] }],
            },
            {
              name: 'tentacle_center_3',
              parent: 'model',
              pivot: [0, 2, 0],
              rotation: [0, 180, 0],
              cubes: [{ origin: [-4, -6, 0], size: [8, 8, 0], uv: [16, 25] }],
            },
            {
              name: 'tentacle_3',
              parent: 'tentacle_center_3',
              pivot: [0, 2, 4],
              cubes: [{ origin: [-4, -6, 4], size: [8, 8, 0], uv: [16, 33] }],
            },
            {
              name: 'tentacle_center_4',
              parent: 'model',
              pivot: [0, 2, 0],
              rotation: [0, -90, 0],
              cubes: [{ origin: [-4, -6, 0], size: [8, 8, 0], uv: [16, 25] }],
            },
            {
              name: 'tentacle_4',
              parent: 'tentacle_center_4',
              pivot: [0, 2, 4],
              cubes: [{ origin: [-4, -6, 4], size: [8, 8, 0], uv: [16, 33] }],
            },
          ],
        },
      ],
    };
  }

  if (shortName === 'dragonfly') {
    return {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: {
            identifier: geoId,
            texture_width: 64,
            texture_height: 64,
            visible_bounds_width: 2.5,
            visible_bounds_height: 1.5,
            visible_bounds_offset: [0, 0.5, 0],
          },
          bones: [
            {
              name: 'model',
              pivot: [0, 4, 0],
              cubes: [{ origin: [-2, 2, -5], size: [4, 4, 9], uv: [0, 0] }],
            },
            {
              name: 'head',
              parent: 'model',
              pivot: [0, 4, -5],
              rotation: [15, 0, 0],
              cubes: [{ origin: [-1.5, 2.5, -7.5], size: [3, 3, 3], uv: [17, 0] }],
            },
            {
              name: 'tail',
              parent: 'model',
              pivot: [0, 4.5, 4],
              cubes: [{ origin: [-1.5, 3, 4], size: [3, 3, 7], uv: [26, 0] }],
            },
            {
              name: 'tail_2',
              parent: 'tail',
              pivot: [0, 4.5, 11],
              cubes: [{ origin: [-1, 3.5, 11], size: [2, 2, 10], uv: [36, 0] }],
            },
            {
              name: 'wing_1',
              parent: 'model',
              pivot: [-2, 6, -2],
              cubes: [{ origin: [-17, 5.95, -4.5], size: [15, 0.1, 4], uv: [0, 13] }],
            },
            {
              name: 'wing_2',
              parent: 'model',
              pivot: [2, 6, -2],
              mirror: true,
              cubes: [{ origin: [2, 5.95, -4.5], size: [15, 0.1, 4], uv: [0, 13] }],
            },
            {
              name: 'wing_3',
              parent: 'model',
              pivot: [-2, 5.5, 0.5],
              cubes: [{ origin: [-14, 5.45, -1], size: [12, 0.1, 3], uv: [4, 17] }],
            },
            {
              name: 'wing_4',
              parent: 'model',
              pivot: [2, 5.5, 0.5],
              mirror: true,
              cubes: [{ origin: [2, 5.45, -1], size: [12, 0.1, 3], uv: [4, 17] }],
            },
            {
              name: 'legs_1',
              parent: 'model',
              pivot: [-1, 2, -1],
              rotation: [0, 0, -25],
              cubes: [{ origin: [-1, -1, -4], size: [0.1, 3, 6], uv: [50, 1] }],
            },
            {
              name: 'legs_2',
              parent: 'model',
              pivot: [1, 2, -1],
              rotation: [0, 0, 25],
              cubes: [{ origin: [0.9, -1, -4], size: [0.1, 3, 6], uv: [50, 1] }],
            },
          ],
        },
      ],
    };
  }

  if (shortName === 'end_fish') {
    return {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: {
            identifier: geoId,
            texture_width: 32,
            texture_height: 32,
            visible_bounds_width: 1.5,
            visible_bounds_height: 1.5,
            visible_bounds_offset: [0, 0.5, 0],
          },
          bones: [
            {
              name: 'model',
              pivot: [0, 4, 0],
              cubes: [{ origin: [-1, 2, -4], size: [2, 4, 8], uv: [0, 0] }],
            },
            {
              name: 'fin_top',
              parent: 'model',
              pivot: [0, 6, -2.5],
              rotation: [-35, 0, 0],
              cubes: [{ origin: [-0.05, 6, -2.5], size: [0.1, 8, 6], uv: [0, 6] }],
            },
            {
              name: 'fin_bottom',
              parent: 'model',
              pivot: [0, 2, -2.5],
              rotation: [35, 0, 0],
              cubes: [{ origin: [-0.05, -6, -2.5], size: [0.1, 8, 6], uv: [0, 12] }],
            },
            {
              name: 'flipper',
              parent: 'model',
              pivot: [0, 5, 2],
              rotation: [-45, 0, 0],
              cubes: [{ origin: [-0.05, 5, 2], size: [0.1, 5, 5], uv: [0, 15] }],
            },
            {
              name: 'fin_right',
              parent: 'model',
              pivot: [-1, 3, -1],
              rotation: [10, 25, 0],
              cubes: [{ origin: [-4, 2, -1], size: [3, 2, 0.1], uv: [0, 25] }],
            },
            {
              name: 'fin_left',
              parent: 'model',
              pivot: [1, 3, -1],
              rotation: [10, -25, 0],
              mirror: true,
              cubes: [{ origin: [1, 2, -1], size: [3, 2, 0.1], uv: [0, 25] }],
            },
          ],
        },
      ],
    };
  }

  if (shortName === 'end_slime') {
    return {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: {
            identifier: geoId,
            texture_width: 64,
            texture_height: 32,
            visible_bounds_width: 2,
            visible_bounds_height: 2,
            visible_bounds_offset: [0, 0.5, 0],
          },
          bones: [
            {
              name: 'body',
              pivot: [0, 4, 0],
              cubes: [
                { origin: [-3, 1, -3], size: [6, 6, 6], uv: [0, 16] },
                { origin: [-3.25, 4, -3.5], size: [2, 2, 2], uv: [32, 0] },
                { origin: [1.25, 4, -3.5], size: [2, 2, 2], uv: [32, 4] },
                { origin: [0, 2, -3.5], size: [1, 1, 1], uv: [32, 8] },
                { origin: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] },
              ],
            },
            {
              name: 'flower_1',
              parent: 'body',
              pivot: [0, 8, 0],
              rotation: [0, 45, 0],
              cubes: [
                { origin: [-4, 8, 0], size: [8, 8, 0.1], uv: [40, 0] },
                { origin: [-4, 6, 0.1], size: [8, 8, 0.1], uv: [40, 8] },
              ],
            },
            {
              name: 'flower_2',
              parent: 'body',
              pivot: [0, 8, 0],
              rotation: [0, -45, 0],
              cubes: [
                { origin: [-4, 8, 0], size: [8, 8, 0.1], uv: [40, 0] },
                { origin: [-4, 6, 0.1], size: [8, 8, 0.1], uv: [40, 8] },
              ],
            },
          ],
        },
      ],
    };
  }

  if (shortName === 'silk_moth') {
    return {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: {
            identifier: geoId,
            texture_width: 64,
            texture_height: 64,
            visible_bounds_width: 2,
            visible_bounds_height: 1.5,
            visible_bounds_offset: [0, 0.5, 0],
          },
          bones: [
            {
              name: 'body',
              pivot: [0, 5, 0],
              cubes: [{ origin: [-2, 3, -3], size: [4, 4, 6], uv: [36, 15] }],
            },
            {
              name: 'abdomen',
              parent: 'body',
              pivot: [0, 5, 3],
              rotation: [-15, 0, 0],
              cubes: [{ origin: [-3, 2, 2], size: [6, 6, 10], uv: [0, 38] }],
            },
            {
              name: 'head_pivot',
              parent: 'body',
              pivot: [0, 5, -3],
              cubes: [
                { origin: [-3, 2, -6], size: [6, 6, 5], uv: [14, 15] },
                { origin: [-5.5, 7.5, -10], size: [3, 0.1, 6], uv: [0, 54] },
                { origin: [2.5, 7.5, -10], size: [3, 0.1, 6], uv: [0, 54], mirror: true },
              ],
            },
            {
              name: 'wingL_pivot',
              parent: 'body',
              pivot: [2, 6, -1],
              cubes: [{ origin: [2, 5.95, -7], size: [9, 0.1, 15], uv: [0, 0] }],
            },
            {
              name: 'wingR_pivot',
              parent: 'body',
              pivot: [-2, 6, -1],
              mirror: true,
              cubes: [{ origin: [-11, 5.95, -7], size: [9, 0.1, 15], uv: [0, 0] }],
            },
            {
              name: 'legsL',
              parent: 'body',
              pivot: [1.5, 3, -1],
              rotation: [0, 0, -35],
              cubes: [{ origin: [1.5, 0, -5], size: [0.1, 3, 8], uv: [0, 15] }],
            },
            {
              name: 'legsR',
              parent: 'body',
              pivot: [-1.5, 3, -1],
              rotation: [0, 0, 35],
              cubes: [{ origin: [-1.6, 0, -5], size: [0.1, 3, 8], uv: [0, 15] }],
            },
          ],
        },
      ],
    };
  }

  if (shortName === 'shadow_walker') {
    return {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: {
            identifier: geoId,
            texture_width: 64,
            texture_height: 64,
            visible_bounds_width: 1.5,
            visible_bounds_height: 2.5,
            visible_bounds_offset: [0, 1.0, 0],
          },
          bones: [
            {
              name: 'body',
              pivot: [0, 24, 0],
              cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }],
            },
            {
              name: 'head',
              parent: 'body',
              pivot: [0, 24, 0],
              cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }],
            },
            {
              name: 'rightArm',
              parent: 'body',
              pivot: [-5, 22, 0],
              cubes: [{ origin: [-8, 12, -2], size: [4, 12, 4], uv: [40, 16] }],
            },
            {
              name: 'leftArm',
              parent: 'body',
              pivot: [5, 22, 0],
              mirror: true,
              cubes: [{ origin: [4, 12, -2], size: [4, 12, 4], uv: [32, 48] }],
            },
            {
              name: 'rightLeg',
              parent: 'body',
              pivot: [-1.9, 12, 0],
              cubes: [{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16] }],
            },
            {
              name: 'leftLeg',
              parent: 'body',
              pivot: [1.9, 12, 0],
              mirror: true,
              cubes: [{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [16, 48] }],
            },
          ],
        },
      ],
    };
  }

  if (isBoat) {
    const bones = [
      {
        name: 'body',
        pivot: [0, 3, 0],
        cubes: [
          { origin: [-9, 0, -14], size: [18, 3, 28], uv: [0, 0] },
          { origin: [-9, 3, -15], size: [18, 6, 2], uv: [0, 19] },
          { origin: [-9, 3, 13], size: [18, 6, 2], uv: [0, 27] },
          { origin: [-11, 3, -14], size: [2, 6, 28], uv: [0, 35] },
          { origin: [9, 3, -14], size: [2, 6, 28], uv: [0, 43] },
        ],
      },
      {
        name: 'paddle_left',
        parent: 'body',
        pivot: [9, 9, -2],
        rotation: [15, 0, -25],
        cubes: [
          { origin: [8, 7, -5], size: [2, 2, 18], uv: [62, 0] },
          { origin: [8.5, 6, 8], size: [1, 6, 7], uv: [62, 0] },
        ],
      },
      {
        name: 'paddle_right',
        parent: 'body',
        pivot: [-9, 9, -2],
        rotation: [15, 0, 25],
        cubes: [
          { origin: [-10, 7, -5], size: [2, 2, 18], uv: [62, 20] },
          { origin: [-9.5, 6, 8], size: [1, 6, 7], uv: [62, 20] },
        ],
      },
    ];
    if (isChestBoat) {
      bones.push({
        name: 'chest',
        parent: 'body',
        pivot: [0, 8, 4],
        cubes: [
          { origin: [-6, 3, -2], size: [12, 8, 12], uv: [0, 76] },
          { origin: [-6, 11, -2], size: [12, 4, 12], uv: [0, 59] },
          { origin: [-1, 9, -3], size: [2, 4, 1], uv: [0, 59] },
        ],
      });
    }
    return {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: {
            identifier: geoId,
            texture_width: 128,
            texture_height: isChestBoat ? 128 : 64,
            visible_bounds_width: 3,
            visible_bounds_height: 2,
            visible_bounds_offset: [0, 0.5, 0],
          },
          bones,
        },
      ],
    };
  }

  return {
    format_version: '1.12.0',
    'minecraft:geometry': [
      {
        description: {
          identifier: geoId,
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
            cubes: [
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
  };
}

function buildEntityAnimation(shortName, { isBoat, isChair }) {
  const animId = `animation.betterend.${shortName}.idle`;
  if (isChair) {
    return {
      format_version: '1.8.0',
      animations: {
        [animId]: {
          loop: true,
          bones: {
            root: {
              scale: 0.0,
            },
          },
        },
      },
    };
  }
  if (shortName === 'cubozoa') {
    return {
      format_version: '1.8.0',
      animations: {
        [animId]: {
          loop: true,
          bones: {
            model: {
              scale: [
                '1.0 + math.sin(q.life_time * 180) * 0.07',
                '1.0 - math.sin(q.life_time * 180) * 0.08',
                '1.0 + math.sin(q.life_time * 180) * 0.07',
              ],
            },
            tentacle_1: { rotation: ['math.sin(q.life_time * 180) * 18 + 12', 0, 0] },
            tentacle_2: { rotation: ['math.sin(q.life_time * 180 + 90) * 18 + 12', 0, 0] },
            tentacle_3: { rotation: ['math.sin(q.life_time * 180 + 180) * 18 + 12', 0, 0] },
            tentacle_4: { rotation: ['math.sin(q.life_time * 180 + 270) * 18 + 12', 0, 0] },
          },
        },
      },
    };
  }
  if (shortName === 'dragonfly') {
    return {
      format_version: '1.8.0',
      animations: {
        [animId]: {
          loop: true,
          bones: {
            model: { position: [0, 'math.sin(q.life_time * 360) * 0.6', 0] },
            wing_1: { rotation: [0, 0, 'math.sin(q.life_time * 1800) * 26'] },
            wing_2: { rotation: [0, 0, '-math.sin(q.life_time * 1800) * 26'] },
            wing_3: { rotation: [0, 0, 'math.cos(q.life_time * 1800) * 22'] },
            wing_4: { rotation: [0, 0, '-math.cos(q.life_time * 1800) * 22'] },
            tail: { rotation: ['math.sin(q.life_time * 240) * 4 - 4', 0, 0] },
            tail_2: { rotation: ['math.sin(q.life_time * 240 - 45) * 5 - 3', 0, 0] },
          },
        },
      },
    };
  }
  if (shortName === 'end_fish') {
    return {
      format_version: '1.8.0',
      animations: {
        [animId]: {
          loop: true,
          bones: {
            model: {
              rotation: [
                0,
                'q.is_in_water ? math.sin(q.life_time * 320) * 8 : math.sin(q.life_time * 720) * 22',
                'q.is_in_water ? 0 : 90',
              ],
            },
            flipper: { rotation: [-45, 'math.sin(q.life_time * 480) * 24', 0] },
            fin_right: { rotation: [10, '25 + math.sin(q.life_time * 320) * 18', 0] },
            fin_left: { rotation: [10, '-25 - math.sin(q.life_time * 320) * 18', 0] },
          },
        },
      },
    };
  }
  if (shortName === 'end_slime') {
    return {
      format_version: '1.8.0',
      animations: {
        [animId]: {
          loop: true,
          bones: {
            body: {
              scale: [
                'q.is_on_ground ? (1.0 + math.sin(q.life_time * 260) * 0.06) : 0.85',
                'q.is_on_ground ? (1.0 - math.sin(q.life_time * 260) * 0.06) : 1.25',
                'q.is_on_ground ? (1.0 + math.sin(q.life_time * 260) * 0.06) : 0.85',
              ],
            },
            flower_1: { rotation: [0, '45 + math.sin(q.life_time * 120) * 5', 0] },
            flower_2: { rotation: [0, '-45 + math.sin(q.life_time * 120) * 5', 0] },
          },
        },
      },
    };
  }
  if (shortName === 'silk_moth') {
    return {
      format_version: '1.8.0',
      animations: {
        [animId]: {
          loop: true,
          bones: {
            body: { position: [0, 'math.sin(q.life_time * 300) * 0.7', 0] },
            wingL_pivot: { rotation: [0, 0, 'math.sin(q.life_time * 960) * 34 - 8'] },
            wingR_pivot: { rotation: [0, 0, '-math.sin(q.life_time * 960) * 34 + 8'] },
            abdomen: { rotation: ['-15 + math.sin(q.life_time * 240) * 5', 0, 0] },
          },
        },
      },
    };
  }
  if (shortName === 'shadow_walker') {
    return {
      format_version: '1.8.0',
      animations: {
        [animId]: {
          loop: true,
          bones: {
            head: {
              rotation: [
                'math.sin(q.life_time * 90) * 4',
                'math.cos(q.life_time * 70) * 8',
                0,
              ],
            },
            rightArm: {
              rotation: [
                'math.cos(q.modified_distance_moved * 38.17) * 40 * q.modified_move_speed + math.sin(q.life_time * 90) * 4',
                0,
                4,
              ],
            },
            leftArm: {
              rotation: [
                '-math.cos(q.modified_distance_moved * 38.17) * 40 * q.modified_move_speed - math.sin(q.life_time * 90) * 4',
                0,
                -4,
              ],
            },
            rightLeg: {
              rotation: ['math.cos(q.modified_distance_moved * 38.17) * 45 * q.modified_move_speed', 0, 0],
            },
            leftLeg: {
              rotation: ['-math.cos(q.modified_distance_moved * 38.17) * 45 * q.modified_move_speed', 0, 0],
            },
          },
        },
      },
    };
  }
  if (isBoat) {
    return {
      format_version: '1.8.0',
      animations: {
        [animId]: {
          loop: true,
          bones: {
            paddle_left: {
              rotation: ['15 + math.sin(q.modified_distance_moved * 30) * 25 * q.modified_move_speed', 0, -25],
            },
            paddle_right: {
              rotation: ['15 + math.sin(q.modified_distance_moved * 30) * 25 * q.modified_move_speed', 0, 25],
            },
          },
        },
      },
    };
  }
  return {
    format_version: '1.8.0',
    animations: {
      [animId]: {
        loop: true,
        bones: {
          root: { rotation: ['math.sin(q.life_time * 120) * 2', 0, 0] },
        },
      },
    },
  };
}

export function compileEntitiesAndFeatures(registrations, resources, mcStructures = null) {
  const serverEntities = new Map();
  const clientEntities = new Map();
  const entityGeometries = new Map();
  const renderControllers = new Map();
  const animations = new Map();
  const entityLootTables = new Map();
  const spawnRules = new Map();
  const attachables = new Map();

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
    const isFlying = ent.id === 'betterend:dragonfly' || ent.id === 'betterend:silk_moth';
    const isAquatic = ent.id === 'betterend:end_fish' || ent.id === 'betterend:cubozoa';
    const isSlime = ent.id === 'betterend:end_slime';
    const isHostile = ent.id === 'betterend:shadow_walker';

    const variantTextures = WILDLIFE_VARIANT_TEXTURES[ent.id] ?? [
      isChestBoat
        ? `textures/entity/betterend/chest_boat/${shortName}`
        : isBoat
          ? `textures/entity/betterend/boat/${shortName}`
          : isChair
            ? 'textures/entity/betterend/eternal_crystal'
            : `textures/entity/betterend/${shortName}`,
    ];

    const components = {
      'minecraft:collision_box': {
        width,
        height,
      },
      'minecraft:physics': {
        has_gravity: !isChair && !isFlying,
        has_collision: !isChair,
      },
    };

    const componentGroups = Object.create(null);
    const entityEvents = Object.create(null);

    if (isWildlife) {
      const attrs = ent.attributes ?? {};
      const maxHealth = Math.round(Number(attrs['minecraft:max_health'] ?? 10));
      const speed = Number(attrs['minecraft:movement_speed'] ?? 0.25);
      components['minecraft:health'] = { value: maxHealth, max: maxHealth };
      components['minecraft:movement'] = { value: speed };
      components['minecraft:type_family'] = {
        family: [shortName, ent.category?.toLowerCase() ?? 'creature', 'mob', 'betterend'],
      };
      components['minecraft:loot'] = {
        table: `loot_tables/entities/${shortName}.json`,
      };
      components['minecraft:nameable'] = {};
      components['minecraft:despawn'] = {
        despawn_from_distance: { min_distance: 32, max_distance: 128 },
      };
      components['minecraft:hurt_on_condition'] = {
        damage_conditions: [
          {
            filters: { test: 'in_lava', subject: 'self', operator: '==', value: true },
            cause: 'lava',
            damage_per_tick: 4,
          },
        ],
      };

      // Variant component groups & events (supports both natural spawn randomization and script biome-variant assignment)
      const allVariantGroupNames = variantTextures.map((_, vIdx) => `variant_${vIdx}`);
      variantTextures.forEach((_, vIdx) => {
        componentGroups[`variant_${vIdx}`] = {
          'minecraft:mark_variant': { value: vIdx },
        };
        entityEvents[`betterend:variant_${vIdx}`] = {
          remove: {
            component_groups: allVariantGroupNames.filter(g => g !== `variant_${vIdx}`),
          },
          add: { component_groups: [`variant_${vIdx}`] },
        };
      });

      const spawnSequence = [
        {
          randomize: variantTextures.map((_, vIdx) => ({
            weight: 10,
            add: { component_groups: [`variant_${vIdx}`] },
          })),
        },
      ];

      if (isSlime) {
        // Authentic EndSlimeEntity.java / Slime sizes (1 = small 0.52m, 2 = medium 1.04m, 4 = large 2.04m)
        const slimeSizes = [
          { size: 1, scale: 1.0, box: 0.52, hp: 1, dmg: 1, weight: 40 },
          { size: 2, scale: 2.0, box: 1.04, hp: 4, dmg: 2, weight: 40 },
          { size: 4, scale: 4.0, box: 2.04, hp: 16, dmg: 4, weight: 20 },
        ];
        const allSizeGroups = slimeSizes.map(s => `size_${s.size}`);
        for (const s of slimeSizes) {
          const gName = `size_${s.size}`;
          componentGroups[gName] = {
            'minecraft:scale': { value: s.scale },
            'minecraft:collision_box': { width: s.box, height: s.box },
            'minecraft:health': { value: s.hp, max: s.hp },
            'minecraft:attack': { damage: s.dmg },
            'minecraft:variant': { value: s.size },
          };
          entityEvents[`betterend:size_${s.size}`] = {
            remove: {
              component_groups: allSizeGroups.filter(g => g !== gName),
            },
            add: { component_groups: [gName] },
          };
        }
        spawnSequence.push({
          randomize: slimeSizes.map(s => ({
            weight: s.weight,
            add: { component_groups: [`size_${s.size}`] },
          })),
        });
      } else if (isAquatic) {
        // Authentic EndFishEntity.java & CubozoaEntity.java scale variation (SCALE / 32F + 0.75F -> 0.75..1.22)
        const scales = [0.75, 0.9, 1.05, 1.22];
        scales.forEach((sc, sIdx) => {
          componentGroups[`scale_${sIdx}`] = {
            'minecraft:scale': { value: sc },
          };
        });
        spawnSequence.push({
          randomize: scales.map((_, sIdx) => ({
            weight: 25,
            add: { component_groups: [`scale_${sIdx}`] },
          })),
        });
      } else if (isFlying) {
        const scales = [0.85, 1.0, 1.15];
        scales.forEach((sc, sIdx) => {
          componentGroups[`scale_${sIdx}`] = {
            'minecraft:scale': { value: sc },
          };
        });
        spawnSequence.push({
          randomize: scales.map((_, sIdx) => ({
            weight: 33,
            add: { component_groups: [`scale_${sIdx}`] },
          })),
        });
      }

      entityEvents['minecraft:entity_spawned'] =
        spawnSequence.length === 1 ? spawnSequence[0] : { sequence: spawnSequence };

      if (isFlying) {
        const flySpeed = Number(attrs['minecraft:flying_speed'] ?? 0.35);
        components['minecraft:flying_speed'] = { value: flySpeed };
        components['minecraft:movement.hover'] = {};
        components['minecraft:navigation.hover'] = {
          can_path_over_water: true,
          can_sink: false,
          can_pass_doors: false,
          can_path_from_air: true,
          avoid_water: true,
          avoid_damage_blocks: true,
          avoid_sun: false,
        };
        components['minecraft:jump.static'] = {};
        components['minecraft:can_fly'] = {};
        components['minecraft:behavior.float'] = { priority: 0 };
        components['minecraft:behavior.panic'] = { priority: 1, speed_multiplier: 1.35 };
        if (ent.id === 'betterend:silk_moth') {
          components['minecraft:leashable'] = {};
          components['minecraft:behavior.tempt'] = {
            priority: 2,
            speed_multiplier: 1.25,
            items: ['betterend:blossom_berry'],
          };
        }
        components['minecraft:behavior.random_hover'] = {
          priority: 3,
          xz_dist: 8,
          y_dist: 3,
          y_offset: -1,
          interval: 1,
        };
        components['minecraft:behavior.random_look_around'] = { priority: 4 };
      } else if (isAquatic) {
        components['minecraft:breathable'] = {
          total_supply: 15,
          suffocate_time: 0,
          breathes_water: true,
          breathes_air: true,
        };
        components['minecraft:underwater_movement'] = { value: Math.max(0.22, speed) };
        components['minecraft:movement.sway'] = { sway_amplitude: 0.0 };
        components['minecraft:navigation.generic'] = {
          is_amphibious: false,
          can_pass_doors: false,
          can_swim: true,
          can_walk: false,
          can_breach: false,
          can_sink: false,
          can_path_over_water: false,
          avoid_damage_blocks: true,
        };
        // Authentic AbstractSchoolingFish schooling/swarming behavior (EndFishEntity & CubozoaEntity)
        components['minecraft:flocking'] = {
          in_water: true,
          match_variants: false,
          use_center_of_mass: true,
          low_flock_limit: 4,
          high_flock_limit: 8,
          goal_weight: 2.0,
          loner_chance: 0.1,
          influence_radius: 6.0,
          breach_influence: 7.0,
          separation_weight: 1.75,
          separation_threshold: 1.5,
          cohesion_weight: 1.85,
          cohesion_threshold: 4.5,
          innner_cohesion_threshold: 2.25,
          min_height: 1.5,
          max_height: 4.0,
          block_distance: 2.0,
          block_weight: 0.85,
        };
        components['minecraft:jump.static'] = {};
        components['minecraft:behavior.panic'] = { priority: 1, speed_multiplier: 1.4 };
        components['minecraft:behavior.random_swim'] = {
          priority: 2,
          speed_multiplier: 1.0,
          xz_dist: 12,
          y_dist: 3,
          interval: 0,
          avoid_surface: true,
        };
        components['minecraft:behavior.swim_wander'] = {
          priority: 3,
          interval: 0.1,
          look_ahead: 2.0,
          speed_multiplier: 1.0,
        };
        components['minecraft:behavior.swim_idle'] = {
          priority: 4,
          idle_time: 4.0,
          success_rate: 0.15,
        };
      } else if (isSlime) {
        components['minecraft:movement.basic'] = {};
        components['minecraft:jump.static'] = { jump_power: 0.42 };
        components['minecraft:navigation.walk'] = {
          can_path_over_water: true,
          avoid_water: false,
          avoid_damage_blocks: true,
        };
        components['minecraft:attack'] = { damage: 2 };
        components['minecraft:behavior.float'] = { priority: 0 };
        components['minecraft:behavior.melee_attack'] = {
          priority: 2,
          speed_multiplier: 1.1,
          track_target: true,
        };
        components['minecraft:behavior.random_stroll'] = {
          priority: 3,
          speed_multiplier: 0.9,
        };
        components['minecraft:behavior.look_at_player'] = {
          priority: 4,
          look_distance: 10.0,
        };
        components['minecraft:behavior.random_look_around'] = { priority: 5 };
        components['minecraft:behavior.nearest_attackable_target'] = {
          priority: 2,
          must_see: true,
          entity_types: [
            {
              filters: { test: 'is_family', subject: 'other', value: 'player' },
              max_dist: 12,
            },
          ],
        };
      } else if (isHostile) {
        components['minecraft:movement.basic'] = {};
        components['minecraft:jump.static'] = {};
        components['minecraft:navigation.walk'] = {
          can_path_over_water: true,
          avoid_water: true,
          avoid_damage_blocks: true,
        };
        components['minecraft:attack'] = {
          damage: Number(attrs['minecraft:attack_damage'] ?? 4),
        };
        components['minecraft:behavior.float'] = { priority: 0 };
        components['minecraft:behavior.melee_attack'] = {
          priority: 2,
          speed_multiplier: 1.15,
          track_target: true,
        };
        components['minecraft:behavior.random_stroll'] = {
          priority: 5,
          speed_multiplier: 0.9,
        };
        components['minecraft:behavior.look_at_player'] = {
          priority: 6,
          look_distance: 12.0,
        };
        components['minecraft:behavior.random_look_around'] = { priority: 7 };
        components['minecraft:behavior.nearest_attackable_target'] = {
          priority: 1,
          must_see: true,
          entity_types: [
            {
              filters: { test: 'is_family', subject: 'other', value: 'player' },
              max_dist: 20,
            },
          ],
        };
      }

      // Emit native spawn rule for outer-End wildlife (underwater-only schools of 4-8 for End Fish & Cubozoa)
      spawnRules.set(`spawn_rules/${shortName}.json`, {
        format_version: '1.8.0',
        'minecraft:spawn_rules': {
          description: {
            identifier: ent.id,
            population_control: isHostile ? 'monster' : isAquatic ? 'water_animal' : 'animal',
          },
          conditions: [
            {
              ...(isAquatic
                ? { 'minecraft:spawns_underwater': {} }
                : { 'minecraft:spawns_on_surface': {} }),
              'minecraft:weight': { default: isHostile ? 18 : isAquatic ? 32 : 24 },
              'minecraft:herd': {
                min_size: isAquatic ? 4 : 1,
                max_size: isAquatic ? 8 : isHostile ? 2 : 4,
              },
              'minecraft:biome_filter': {
                test: 'has_biome_tag',
                operator: '==',
                value: 'the_end',
              },
            },
          ],
        },
      });
    } else if (isBoat) {
      components['minecraft:health'] = { value: 40, max: 40 };
      components['minecraft:rideable'] = {
        seat_count: isChestBoat ? 1 : 2,
        family_types: ['player', 'mob'],
        interact_text: 'action.interact.ride.boat',
        seats: isChestBoat
          ? [{ position: [0.0, -0.2, 0.2] }]
          : [
              { position: [0.0, -0.2, 0.2] },
              { position: [0.0, -0.2, -0.6] },
            ],
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
        ...(Object.keys(componentGroups).length > 0 ? { component_groups: componentGroups } : {}),
        components,
        ...(Object.keys(entityEvents).length > 0 ? { events: entityEvents } : {}),
      },
    });

    const texMap = Object.create(null);
    variantTextures.forEach((t, idx) => {
      texMap[idx === 0 ? 'default' : `variant_${idx}`] = t;
    });

    const clientDesc = {
      identifier: ent.id,
      materials: {
        default:
          ent.id === 'betterend:cubozoa' || ent.id === 'betterend:end_slime'
            ? 'slime_outer'
            : 'entity_alphatest',
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

    entityGeometries.set(
      `models/entity/${shortName}.geo.json`,
      buildEntityGeometry(shortName, width, height, { isBoat, isChestBoat, isChair }),
    );

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
          ...(isSlime
            ? {
                part_visibility: [
                  { 'flower*': 'q.mark_variant == 2' },
                  { 'crop*': 'q.mark_variant == 0 || q.mark_variant == 3' },
                ],
              }
            : {}),
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

    animations.set(
      `animations/${shortName}.animation.json`,
      buildEntityAnimation(shortName, { isBoat, isChair }),
    );
  }

  // Emit custom 3D Elytra Wings Geometry + Animation (binds to player `root -> waist -> body` hierarchy, works on both classic & persona skins with zero missing animation errors)
  entityGeometries.set('models/entity/elytra_wings.geo.json', {
    format_version: '1.12.0',
    'minecraft:geometry': [
      {
        description: {
          identifier: 'geometry.betterend.elytra_wings',
          texture_width: 64,
          texture_height: 32,
          visible_bounds_width: 3,
          visible_bounds_height: 3,
          visible_bounds_offset: [0, 1.2, 0],
        },
        bones: [
          {
            name: 'root',
            pivot: [0, 0, 0],
          },
          {
            name: 'waist',
            parent: 'root',
            pivot: [0, 12, 0],
          },
          {
            name: 'body',
            parent: 'waist',
            pivot: [0, 24, 0],
          },
          {
            name: 'left_wing',
            parent: 'body',
            pivot: [5, 24, 2],
            rotation: [15, 0, -15],
            cubes: [
              {
                origin: [-5, 4, 2],
                size: [10, 20, 2],
                uv: [22, 0],
                inflate: 1.0,
              },
            ],
          },
          {
            name: 'right_wing',
            parent: 'body',
            pivot: [-5, 24, 2],
            rotation: [15, 0, 15],
            cubes: [
              {
                origin: [-5, 4, 2],
                size: [10, 20, 2],
                uv: [22, 0],
                mirror: true,
                inflate: 1.0,
              },
            ],
          },
        ],
      },
    ],
  });

  animations.set('animations/elytra_wings.animation.json', {
    format_version: '1.8.0',
    animations: {
      'animation.betterend.elytra.default': {
        loop: true,
        bones: {
          left_wing: {
            rotation: [
              'q.is_on_ground ? (q.is_sneaking ? 25 : 14) : 18',
              'q.is_on_ground ? 0 : -8',
              'q.is_on_ground ? (q.is_sneaking ? -35 : (-15 - math.sin(q.life_time * 90) * 1.5)) : (-68 - math.sin(q.life_time * 240) * 3)',
            ],
          },
          right_wing: {
            rotation: [
              'q.is_on_ground ? (q.is_sneaking ? 25 : 14) : 18',
              'q.is_on_ground ? 0 : 8',
              'q.is_on_ground ? (q.is_sneaking ? 35 : (15 + math.sin(q.life_time * 90) * 1.5)) : (68 + math.sin(q.life_time * 240) * 3)',
            ],
          },
        },
      },
      'animation.betterend.player.glide': {
        loop: true,
        bones: {
          root: {
            position: [0.0, -10.0, 9.0],
            rotation: ['90.0 + q.target_x_rotation', 0.0, 0.0],
          },
          head: {
            rotation: ['q.target_x_rotation - 45.0', 'q.target_y_rotation', 0.0],
          },
          leftArm: {
            rotation: [0.0, 0.0, -5.0],
          },
          rightArm: {
            rotation: [0.0, 0.0, 5.0],
          },
          leftLeg: {
            rotation: [0.0, 0.0, -2.0],
          },
          rightLeg: {
            rotation: [0.0, 0.0, 2.0],
          },
        },
      },
      'animation.betterend.player.glide_stop': {
        loop: false,
        bones: {
          root: {
            position: [0.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0],
          },
        },
      },
    },
  });

  // Emit 64x48 Crystalite Armor Geometries matching Crystalite*Model.java
  entityGeometries.set('models/entity/crystalite_armor.geo.json', {
    format_version: '1.12.0',
    'minecraft:geometry': [
      {
        description: {
          identifier: 'geometry.betterend.crystalite_helmet',
          texture_width: 64,
          texture_height: 48,
          visible_bounds_width: 2,
          visible_bounds_height: 3,
          visible_bounds_offset: [0, 1.5, 0],
        },
        bones: [
          {
            name: 'head',
            pivot: [0, 24, 0],
            cubes: [
              {
                origin: [-4, 24, -4],
                size: [8, 8, 8],
                uv: [0, 0],
                inflate: 1.0,
              },
              {
                origin: [-4, 24, -4],
                size: [8, 8, 8],
                uv: [32, 0],
                inflate: 1.4,
              },
            ],
          },
        ],
      },
      {
        description: {
          identifier: 'geometry.betterend.crystalite_chestplate',
          texture_width: 64,
          texture_height: 48,
          visible_bounds_width: 2,
          visible_bounds_height: 3,
          visible_bounds_offset: [0, 1.5, 0],
        },
        bones: [
          {
            name: 'body',
            pivot: [0, 24, 0],
            cubes: [
              {
                origin: [-4, 12, -2],
                size: [8, 12, 4],
                uv: [16, 16],
                inflate: 1.05,
              },
            ],
          },
          {
            name: 'rightArm',
            pivot: [-5, 22, 0],
            cubes: [
              {
                origin: [-8, 12, -2],
                size: [4, 12, 4],
                uv: [40, 16],
                inflate: 1.15,
              },
            ],
          },
          {
            name: 'leftArm',
            pivot: [5, 22, 0],
            cubes: [
              {
                origin: [4, 12, -2],
                size: [4, 12, 4],
                uv: [40, 32],
                mirror: true,
                inflate: 1.15,
              },
            ],
          },
        ],
      },
      {
        description: {
          identifier: 'geometry.betterend.crystalite_leggings',
          texture_width: 64,
          texture_height: 48,
          visible_bounds_width: 2,
          visible_bounds_height: 3,
          visible_bounds_offset: [0, 1.5, 0],
        },
        bones: [
          {
            name: 'body',
            pivot: [0, 24, 0],
            cubes: [
              {
                origin: [-4, 12, -2],
                size: [8, 12, 4],
                uv: [16, 16],
                inflate: 0.55,
              },
            ],
          },
          {
            name: 'rightLeg',
            pivot: [-1.9, 12, 0],
            cubes: [
              {
                origin: [-3.9, 0, -2],
                size: [4, 12, 4],
                uv: [0, 16],
                inflate: 0.55,
              },
            ],
          },
          {
            name: 'leftLeg',
            pivot: [1.9, 12, 0],
            cubes: [
              {
                origin: [-0.1, 0, -2],
                size: [4, 12, 4],
                uv: [0, 32],
                inflate: 0.55,
              },
            ],
          },
        ],
      },
      {
        description: {
          identifier: 'geometry.betterend.crystalite_boots',
          texture_width: 64,
          texture_height: 48,
          visible_bounds_width: 2,
          visible_bounds_height: 3,
          visible_bounds_offset: [0, 1.5, 0],
        },
        bones: [
          {
            name: 'rightLeg',
            pivot: [-1.9, 12, 0],
            cubes: [
              {
                origin: [-3.9, 0, -2],
                size: [4, 12, 4],
                uv: [0, 16],
                inflate: 1.0,
              },
            ],
          },
          {
            name: 'leftLeg',
            pivot: [1.9, 12, 0],
            cubes: [
              {
                origin: [-0.1, 0, -2],
                size: [4, 12, 4],
                uv: [0, 32],
                inflate: 1.0,
              },
            ],
          },
        ],
      },
    ],
  });

  // Emit 3D Wearable Attachables for BetterEnd Elytras (Armored & Crystalite) and all 4 BetterEnd Armor Sets
  for (const elytraShort of ['elytra_armored', 'elytra_crystalite']) {
    attachables.set(`attachables/${elytraShort}.json`, {
      format_version: '1.10.0',
      'minecraft:attachable': {
        description: {
          identifier: `betterend:${elytraShort}`,
          materials: {
            default: 'armor',
            enchanted: 'armor_enchanted',
          },
          textures: {
            default: `textures/entity/betterend/${elytraShort}`,
            enchanted: 'textures/misc/enchanted_item_glint',
          },
          geometry: {
            default: 'geometry.betterend.elytra_wings',
          },
          animations: {
            default: 'animation.betterend.elytra.default',
          },
          scripts: {
            animate: ['default'],
            parent_setup: 'variable.coat_layer_visible = 0.0;',
          },
          render_controllers: ['controller.render.armor'],
        },
      },
    });
  }

  const armorPieces = [
    { suffix: 'helmet', geo: 'geometry.humanoid.armor.helmet', crystaliteGeo: 'geometry.betterend.crystalite_helmet', setup: 'variable.helmet_layer_visible = 0.0;', texSubdir: 'humanoid' },
    { suffix: 'chestplate', geo: 'geometry.humanoid.armor.chestplate', crystaliteGeo: 'geometry.betterend.crystalite_chestplate', setup: 'variable.chest_layer_visible = 0.0;', texSubdir: 'humanoid' },
    { suffix: 'leggings', geo: 'geometry.humanoid.armor.leggings', crystaliteGeo: 'geometry.betterend.crystalite_leggings', setup: 'variable.leg_layer_visible = 0.0;', texSubdir: 'humanoid_leggings' },
    { suffix: 'boots', geo: 'geometry.humanoid.armor.boots', crystaliteGeo: 'geometry.betterend.crystalite_boots', setup: 'variable.boot_layer_visible = 0.0;', texSubdir: 'humanoid' },
  ];
  for (const tier of ['thallasium', 'terminite', 'aeternium', 'crystalite']) {
    for (const piece of armorPieces) {
      const itemShort = `${tier}_${piece.suffix}`;
      attachables.set(`attachables/${itemShort}.json`, {
        format_version: '1.10.0',
        'minecraft:attachable': {
          description: {
            identifier: `betterend:${itemShort}`,
            materials: {
              default: 'armor',
              enchanted: 'armor_enchanted',
            },
            textures: {
              default: `textures/entity/betterend/equipment/${piece.texSubdir}/${tier}`,
              enchanted: 'textures/misc/enchanted_item_glint',
            },
            geometry: {
              default: tier === 'crystalite' ? piece.crystaliteGeo : piece.geo,
            },
            scripts: {
              parent_setup: piece.setup,
            },
            render_controllers: ['controller.render.armor'],
          },
        },
      });
    }
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

  const dragonGraveyardsIdx = REGION_CATALOGUE.findIndex(r => r.id === 'dragon_graveyards');
  const nativeOres = [
    { id: 'ender_ore', block: 'betterend:ender_ore', count: 4, minY: 16, maxY: 64 },
    { id: 'amber_ore', block: 'betterend:amber_ore', count: 5, minY: 20, maxY: 72 },
    { id: 'thallasium_ore', block: 'betterend:thallasium_ore', count: 8, minY: 12, maxY: 80 },
    { id: 'flavolite_layer', block: 'betterend:flavolite', count: 12, minY: 20, maxY: 72 },
    { id: 'violecite_layer', block: 'betterend:violecite', count: 12, minY: 20, maxY: 72 },
    {
      id: 'dragon_bone_block_ore',
      block: 'betterend:mossy_dragon_bone',
      count: 6,
      minY: 24,
      maxY: 72,
      regionIdx: dragonGraveyardsIdx,
    },
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

    const oreGate =
      ore.regionIdx !== undefined && ore.regionIdx >= 0
        ? molangSurfaceRegionMatch(ore.regionIdx, CHUNK_CENTER_X, CHUNK_CENTER_Z)
        : `(math.abs(variable.originx + 8) > 1024 || math.abs(variable.originz + 8) > 1024)`;
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
          iterations: `${oreGate} ? ${ore.count} : 0`,
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

  const FLORA_DEFAULT_STATES = {
    'betterend:small_jellyshroom': { 'betterend:facing': 'up' },
    'betterend:smaragdant_crystal_shard': {
      'betterend:facing': 'up',
      'betterend:waterlogged': false,
    },
    'betterend:sulphur_crystal': {
      'betterend:age': 2,
      'betterend:facing': 'up',
      'betterend:waterlogged': false,
    },
    'betterend:crystal_moss_cover': {
      'betterend:down': true,
      'betterend:east': false,
      'betterend:north': false,
      'betterend:south': false,
      'betterend:up': false,
      'betterend:west': false,
    },
    'betterend:neon_cactus': {
      'betterend:bottom': 'sand',
      'betterend:facing': 'up',
      'betterend:shape': 'top',
    },
  };

  const ensureFloraBlockFeature = blockId => {
    const validBlock = knownBlockIds.has(blockId) ? blockId : 'betterend:creeping_moss';
    const shortBlock = validBlock.split(':')[1];
    const featId = `betterend:flora_${shortBlock}_feature`;
    const fileKey = `features/flora_${shortBlock}_feature.json`;
    if (!features.has(fileKey)) {
      const defaultStates = FLORA_DEFAULT_STATES[validBlock];
      features.set(fileKey, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:single_block_feature': {
          description: {
            identifier: featId,
          },
          places_block: defaultStates
            ? { name: validBlock, states: defaultStates }
            : validBlock,
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

  // Curated per-biome surface ground-cover flora (strictly upright floor plants/mushrooms/seeds/crystal-shards; never ceiling-only seeds, underwater-only plants, wall-only mosses/furs, or solid cubes)
  const BIOME_SURFACE_FLORA = {
    foggy_mushroomland: ['betterend:umbrella_moss', 'betterend:creeping_moss', 'betterend:blue_vine_seed', 'betterend:glowing_pillar_seed'],
    chorus_forest: ['betterend:chorus_grass', 'betterend:chorus_mushroom_seed'],
    dust_wastelands: ['betterend:amber_grass'],
    megalake: ['betterend:umbrella_moss', 'betterend:creeping_moss', 'betterend:end_lotus_flower', 'betterend:jungle_grass'],
    crystal_mountains: ['betterend:crystal_grass', 'betterend:crystal_moss_cover'],
    shadow_forest: ['betterend:shadow_plant', 'betterend:murkweed', 'betterend:needlegrass', 'betterend:shadow_berry'],
    amber_land: ['betterend:amber_grass', 'betterend:lanceleaf_seed', 'betterend:glowing_pillar_seed', 'betterend:amber_root_seed'],
    blossoming_spires: ['betterend:bushy_grass', 'betterend:blossom_berry_seed', 'betterend:twisted_umbrella_moss'],
    sulphur_springs: ['betterend:amber_grass', 'betterend:orango', 'betterend:sulphur_crystal'],
    umbrella_jungle: ['betterend:jungle_grass', 'betterend:twisted_umbrella_moss', 'betterend:small_jellyshroom', 'betterend:umbrella_moss'],
    glowing_grasslands: ['betterend:blooming_cooksonia', 'betterend:salteago', 'betterend:vaiolush_fern', 'betterend:fracturn', 'betterend:lumecorn_seed', 'betterend:umbrella_moss', 'betterend:twisted_umbrella_moss', 'betterend:creeping_moss'],
    dragon_graveyards: ['betterend:globulagus', 'betterend:clawfern', 'betterend:small_amaranita_mushroom'],
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

  for (const floraList of Object.values(BIOME_SURFACE_FLORA)) {
    for (const blk of floraList) {
      if (knownBlockIds.has(blk)) ensureFloraBlockFeature(blk);
    }
  }

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

  // Which terrain pre-check a procedural feature needs before it may be placed:
  //  - 'structure': wide solid builds (arches, spires, boulders, grottos...) - full-footprint flatness grid
  //  - 'pond': carved water basins - tight flatness grid
  //  - 'tree' (default): trunk-based plants, trees, mushrooms and bushes - base-ring flatness only
  const STRUCTURE_GUARD_PROC_IDS = new Set([
    'spire',
    'umbralith_arch',
    'thin_umbralith_arch',
    'obsidian_boulder',
    'obsidian_pillar_basement',
    'fallen_pillar',
    'geyser',
    'surface_vent',
    'sulphur_hill',
    'stalactite_cluster',
    'stalactite_cluster_cavemoss',
    'aurora_cave_grotto',
    'smaragdant_cave_grotto',
    'jade_cave_grotto',
    'smaragdant_crystal',
    'big_aurora_crystal',
  ]);
  const POND_GUARD_PROC_IDS = new Set([
    'end_lake',
    'desert_lake',
    'sulphuric_lake',
    'pond_with_waterfall',
  ]);
  const guardModeForProcedural = procId =>
    POND_GUARD_PROC_IDS.has(procId)
      ? 'pond'
      : STRUCTURE_GUARD_PROC_IDS.has(procId)
        ? 'structure'
        : 'tree';

  const ensureStructureTemplateFeature = (meta, { guard = 'structure' } = {}) => {
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

    const modeSuffix = guard === 'none' ? 'aerial' : guard === 'structure' ? 'grounded' : `${guard}`;
    const placeFeatId = `betterend:struct_place_${rawShort}_${modeSuffix}_feature`;
    const placeRel = `features/struct_place_${rawShort}_${modeSuffix}_feature.json`;
    if (!features.has(placeRel)) {
      const [ox, oy, oz] = meta.originOffset ?? [0, 0, 0];
      // Comprehensive pre-check: the anchor must be on land inside the build window and every
      // sampled footprint column must stay within the mode's height tolerance of the anchor.
      const groundIterations =
        guard === 'none'
          ? 1
          : molangFootprintGuard({
              size: meta.size ?? [1, 1, 1],
              originOffset: meta.originOffset ?? [0, 0, 0],
              mode: guard,
            });
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

  const ensureTileTemplateFeature = meta => {
    const rawShort = meta.structureName.split(':')[1];
    const featId = `betterend:struct_tpl_${rawShort}_feature`;
    const rel = `features/struct_tpl_${rawShort}_feature.json`;
    if (!features.has(rel)) {
      features.set(rel, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:structure_template_feature': {
          description: { identifier: featId },
          structure_name: meta.structureName,
          adjustment_radius: 0,
          facing_direction: 'south',
          constraints: {},
        },
      });
    }
    return featId;
  };

  const ensureProceduralStructureFeature = (
    procId,
    { groundCheck = true, guard = null, featureIdOverride = null, filePathOverride = null } = {},
  ) => {
    const variants = resolvedStructures.proceduralVariants.get(procId) ?? [];
    const featId = featureIdOverride ?? `betterend:proc_${procId}_feature`;
    const relPath = filePathOverride ?? `features/proc_${procId}_feature.json`;
    if (features.has(relPath)) return featId;

    const resolvedGuard = !groundCheck ? 'none' : (guard ?? guardModeForProcedural(procId));
    const weightedChoices = variants.map(meta => [
      ensureStructureTemplateFeature(meta, { guard: resolvedGuard }),
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
  features.set('features/ice_star_structure_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:weighted_random_feature': {
      description: { identifier: 'betterend:ice_star_structure_feature' },
      features: [
        [iceStarSmallFeat, 60],
        [iceStarMedFeat, 30],
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

  // Biome-specific terrestrial multi-block plants, bushes, and terrain formations (aquatic end_lotus/end_lily/hydralux/menger_sponge generate inside water lakes)
  const BIOME_PROCEDURAL_SUBFEATURES = {
    foggy_mushroomland: ['blue_vine', 'umbrella_moss_double'],
    chorus_forest: ['pythadendron_bush'],
    megalake: ['umbrella_moss_double'],
    megalake_grove: ['umbrella_moss_double', 'twisted_umbrella_moss_double'],
    shadow_forest: ['dragon_tree_bush'],
    amber_land: ['lanceleaf', 'glow_pillar'],
    blossoming_spires: ['tenanea_bush', 'twisted_umbrella_moss_double'],
    sulphur_springs: ['geyser', 'surface_vent', 'sulphur_hill'],
    umbrella_jungle: ['umbrella_moss_double', 'twisted_umbrella_moss_double'],
    glowing_grasslands: ['lumecorn', 'umbrella_moss_double', 'twisted_umbrella_moss_double'],
    dragon_graveyards: ['large_amaranita', 'small_amaranita'],
    dry_shrubland: ['lucernia_bush'],
    lantern_woods: ['lucernia_bush'],
    neon_oasis: ['neon_cactus'],
    flower_islets: ['large_amaranita', 'small_amaranita'],
    waterfall_ponds: ['lumecorn', 'umbrella_moss_double'],
    lush_smaragdant_cave: ['cave_bush', 'smaragdant_crystal', 'stalactite_cluster_cavemoss'],
    empty_smaragdant_cave: ['smaragdant_crystal', 'stalactite_cluster'],
    lush_aurora_cave: ['cave_bush', 'stalactite_cluster_cavemoss'],
    empty_aurora_cave: ['stalactite_cluster', 'stalactite_cluster_cavemoss'],
    jade_cave: ['stalactite_cluster', 'smaragdant_crystal'],
    empty_end_cave: ['stalactite_cluster'],
  };

  const BIOME_LANDMARK_PROCEDURAL = {
    foggy_mushroomland: ['giant_mossy_glowshroom'],
    blossoming_spires: ['spire', 'floating_spire'],
    umbra_valley: ['umbralith_arch', 'thin_umbralith_arch'],
    dragon_graveyards: ['obsidian_pillar_basement', 'fallen_pillar', 'obsidian_boulder'],
    flower_islets: ['small_island_flower'],
    waterfall_ponds: ['small_island'],
    empty_aurora_cave: ['aurora_cave_grotto'],
    lush_aurora_cave: ['aurora_cave_grotto'],
    empty_smaragdant_cave: ['smaragdant_cave_grotto'],
    lush_smaragdant_cave: ['smaragdant_cave_grotto'],
    jade_cave: ['jade_cave_grotto'],
  };

  const CAVE_BIOME_SURFACE_PALETTE = {
    empty_aurora_cave: { primary: 'betterend:violecite', alt: 'betterend:crystal_moss' },
    lush_aurora_cave: { primary: 'betterend:cave_moss', alt: 'betterend:crystal_moss' },
    empty_smaragdant_cave: { primary: 'betterend:virid_jadestone', alt: 'betterend:cave_moss' },
    lush_smaragdant_cave: { primary: 'betterend:cave_moss', alt: 'betterend:virid_jadestone' },
    jade_cave: { primary: 'betterend:virid_jadestone', alt: 'betterend:azure_jadestone' },
    empty_end_cave: { primary: 'betterend:flavolite', alt: 'betterend:violecite' },
  };

  // Native Chorus-plant clearing feature for all non-chorus_forest outer-End biomes
  const chorusForestIdx = REGION_CATALOGUE.findIndex(r => r.id === 'chorus_forest');
  features.set('features/clear_vanilla_chorus_block_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:single_block_feature': {
      description: { identifier: 'betterend:clear_vanilla_chorus_block_feature' },
      places_block: 'minecraft:air',
      enforce_placement_rules: false,
      enforce_survivability_rules: false,
      may_replace: ['minecraft:chorus_plant', 'minecraft:chorus_flower'],
    },
  });
  features.set('features/clear_vanilla_chorus_col_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:scatter_feature': {
      description: { identifier: 'betterend:clear_vanilla_chorus_col_feature' },
      iterations: 22,
      coordinate_eval_order: 'zyx',
      x: 0,
      z: 0,
      y: { distribution: 'fixed_grid', extent: [0, 21] },
      project_input_to_floor: false,
      places_feature: 'betterend:clear_vanilla_chorus_block_feature',
    },
  });
  features.set('features/clear_vanilla_chorus_grid_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:scatter_feature': {
      description: { identifier: 'betterend:clear_vanilla_chorus_grid_feature' },
      iterations: 256,
      coordinate_eval_order: 'zyx',
      x: { distribution: 'fixed_grid', extent: [0, 15] },
      z: { distribution: 'fixed_grid', extent: [0, 15] },
      y: 'query.heightmap(variable.worldx, variable.worldz) - 18',
      project_input_to_floor: false,
      places_feature: 'betterend:clear_vanilla_chorus_col_feature',
    },
  });
  const globalChorusMatch = molangSurfaceRegionMatch(chorusForestIdx, CHUNK_CENTER_X, CHUNK_CENTER_Z);
  featureRules.set('feature_rules/clear_vanilla_chorus_rule.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:feature_rules': {
      description: {
        identifier: 'betterend:clear_vanilla_chorus_rule',
        places_feature: 'betterend:clear_vanilla_chorus_grid_feature',
      },
      conditions: {
        placement_pass: 'sky_pass',
        'minecraft:biome_filter': [
          { test: 'has_biome_tag', operator: '==', value: 'the_end' },
        ],
      },
      distribution: {
        iterations: `(${molangOuterGuard(CHUNK_CENTER_X, CHUNK_CENTER_Z)} && query.heightmap(variable.originx + 8, variable.originz + 8) >= 48 && ${globalChorusMatch} == 0) ? 1 : 0`,
        x: 0,
        y: 0,
        z: 0,
      },
    },
  });

  // ---------------------------------------------------------------------------
  // Placement plan: classify every structure/landmark as "major" (>= 16x16 footprint, claims a
  // spaced site and an exclusion window) or "minor" (ruins, stumps, spires, boulders...), and fix the
  // Java BetterEnd vegetation densities that drive the tree rules.
  // ---------------------------------------------------------------------------
  const MAJOR_FOOTPRINT_AREA = 256;
  const metaFootprintArea = meta => (meta.size?.[0] ?? 1) * (meta.size?.[2] ?? 1);
  const procMaxFootprintArea = procId =>
    Math.max(
      0,
      ...(resolvedStructures.proceduralVariants.get(procId) ?? []).map(metaFootprintArea),
    );
  const AERIAL_PROC_IDS = new Set(['floating_spire', 'small_island', 'small_island_flower']);
  /** Biomes whose signature landmark gets its own dense, widely-spaced site layer. */
  const GIANT_LAYER_BIOMES = { foggy_mushroomland: 'giant_mossy_glowshroom' };
  /** BetterEnd `VegetationFeaturesProvider.registerVegetation(..., onEveryLayerMax(n))` densities. */
  const JAVA_TREE_DENSITY = {
    mossy_glowshroom: 2,
    pythadendron_tree: 1,
    lacugrove: 4,
    dragon_tree: 2,
    tenanea: 3,
    helix_tree: 1,
    dragon_helix_tree: 1,
    umbrella_tree: 2,
    jellyshroom: 2,
    gigantic_amaranita: 1,
    lucernia: 3,
  };
  /** Foggy Mushroomland is the BetterEnd mushroom forest: denser than Java (which loses many attempts to overlap/obstruction). Others stay sparser. */
  const TREE_DENSITY_SCALE = { foggy_mushroomland: 1.6 };
  const DEFAULT_TREE_DENSITY_SCALE = 0.5;

  const LAKE_BIOME_IDS = new Set([
    'megalake',
    'megalake_grove',
    'foggy_mushroomland',
    'sulphur_springs',
    'neon_oasis',
    'waterfall_ponds',
  ]);
  /**
   * Deterministic pseudo-random height for rules over empty space. It must be a Molang expression that
   * references `variable.worldx`: Bedrock only defines the world position variables for later
   * features when the rule's own coordinate expression uses them.
   */
  const aerialHeightExpr = (minY, span) =>
    `${minY} + math.mod(math.floor(math.abs(math.sin(variable.worldx * 12.9898 + variable.worldz * 78.233) * 43758.5453)), ${span})`;

  /** Java `SkyScatterFeature` plants: floating in open air, scattered per chunk (see 5b below). */
  const SKY_SCATTER_BY_BIOME = {
    lantern_woods: { proc: 'filalux', density: 16, max: 20 },
  };

  const placementPlan = new Map();
  for (const planRegion of REGION_CATALOGUE) {
    const caveLayer = planRegion.layer === 'cave';
    const nbtList = resolvedStructures.biomeNbtStructures.get(planRegion.id) ?? [];
    const giantId = GIANT_LAYER_BIOMES[planRegion.id] ?? null;
    const landmarkList = (BIOME_LANDMARK_PROCEDURAL[planRegion.id] ?? []).filter(
      procId => procId !== giantId,
    );
    placementPlan.set(planRegion.id, {
      nbtMajor: caveLayer ? [] : nbtList.filter(meta => metaFootprintArea(meta) >= MAJOR_FOOTPRINT_AREA),
      nbtMinor: caveLayer ? nbtList : nbtList.filter(meta => metaFootprintArea(meta) < MAJOR_FOOTPRINT_AREA),
      landmarkMajor: caveLayer
        ? []
        : landmarkList.filter(procId => procMaxFootprintArea(procId) >= MAJOR_FOOTPRINT_AREA),
      landmarkMinor: caveLayer
        ? landmarkList
        : landmarkList.filter(procId => procMaxFootprintArea(procId) < MAJOR_FOOTPRINT_AREA),
      giant: giantId,
    });
  }
  const majorRegionIndices = [];
  const giantRegionIndices = [];
  for (const [planIdx, planRegion] of REGION_CATALOGUE.entries()) {
    const entry = placementPlan.get(planRegion.id);
    if (planRegion.layer !== 'aerial' && (entry.nbtMajor.length > 0 || entry.landmarkMajor.length > 0)) {
      majorRegionIndices.push(planIdx);
    }
    if (entry.giant) giantRegionIndices.push(planIdx);
  }
  // Layers whose active sites reserve a 3x3-chunk window that trees, plants, ponds and minor
  // structures must stay out of.
  const nearMajorSite = molangNearActiveSite(SITE_LAYERS.major, majorRegionIndices, 1);
  const nearGiantSite = molangNearActiveSite(SITE_LAYERS.giant, giantRegionIndices, 1);
  const nearAnySite = `(${nearMajorSite} || ${nearGiantSite})`;

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

    // Biome membership uses the shared Java-picker model (runtime/regions/native-cell-map.js): surface
    // biomes pick by genChance weight with sub-biome promotion, aerial biomes live over void and cave
    // biomes on their own lattice - so the HUD / spawn logic in the scripting runtime always agrees
    // with what this rule paints and grows.
    const matchAt = (xE, zE) => molangRegionMatch(region, idx, xE, zE);
    const cellCond = matchAt(CHUNK_CENTER_X, CHUNK_CENTER_Z);
    const colCellCond = matchAt('variable.worldx', 'variable.worldz');
    const chunkHashExpr = (saltA, saltB, saltC) =>
      molangChunkHash(CHUNK_X, CHUNK_Z, [saltA, saltB, saltC]);
    const chunkHasLand = molangChunkHasLand();
    const isCaveRegion = region.layer === 'cave';
    const isAerialRegion = region.layer === 'aerial';
    /** Surface-painted biomes: the 15 land biomes plus their promoted sub-biomes. */
    const isPaintedRegion = !isCaveRegion && !isAerialRegion;
    const plan = placementPlan.get(region.id);

    // Wraps a feature so it is only placed when its own anchor column still belongs to this biome.
    const ensureBiomeGate = (placedFeatId, tag) => {
      const gateId = `betterend:biome_${region.id}_${tag}_gate_feature`;
      const gateRel = `features/biome_${region.id}_${tag}_gate_feature.json`;
      if (!features.has(gateRel)) {
        features.set(gateRel, {
          format_version: BEDROCK_FEATURE_FORMAT_VERSION,
          'minecraft:scatter_feature': {
            description: { identifier: gateId },
            iterations: `${colCellCond} ? 1 : 0`,
            coordinate_eval_order: 'zyx',
            x: 0,
            y: 0,
            z: 0,
            project_input_to_floor: false,
            places_feature: placedFeatId,
          },
        });
      }
      return gateId;
    };

    if (isPaintedRegion) {
    // 2. Native noise-coherent surface painting (16x16x3 vertical column covering the top 3 layers of every column).
    //    Chunks that lie wholly inside one biome cell ("interior" chunks, ~55%) paint with NO per-column
    //    biome test; only chunks straddling a cell edge pay for the exact per-column test. Chunks with no
    //    land at all (most of the outer End) bail out after nine cheap heightmap probes.
    const cavePalette = CAVE_BIOME_SURFACE_PALETTE[region.id] ?? null;
    const primaryTop =
      cavePalette?.primary ??
      (region.surface?.topBlock && region.surface.topBlock !== 'minecraft:end_stone'
        ? region.surface.topBlock
        : region.surface?.altTopBlock ?? 'betterend:end_moss');
    const altTop =
      cavePalette?.alt ??
      (region.surface?.altTopBlock && region.surface.altTopBlock !== primaryTop
        ? region.surface.altTopBlock
        : null);

    const primarySurfaceFeat = ensureSurfaceBlockFeature(primaryTop);
    const altSurfaceFeat = altTop ? ensureSurfaceBlockFeature(altTop) : null;
    const surfaceNoiseExpr = `(query.noise(variable.worldx * 0.075, variable.worldz * 0.075) + query.noise(variable.worldx * 0.21 + 37, variable.worldz * 0.21 + 71) * 0.35)`;

    const buildSurfaceGrid = (suffix, exactCellTest) => {
      const colGate = exactCellTest ? `${colCellCond} && ` : '';
      const colFeatId = `betterend:biome_${region.id}_surface_col${suffix}_feature`;
      if (altSurfaceFeat) {
        const colPrimaryId = `betterend:biome_${region.id}_surface_col_primary${suffix}_feature`;
        const colAltId = `betterend:biome_${region.id}_surface_col_alt${suffix}_feature`;
        features.set(`features/biome_${region.id}_surface_col_primary${suffix}_feature.json`, {
          format_version: BEDROCK_FEATURE_FORMAT_VERSION,
          'minecraft:scatter_feature': {
            description: { identifier: colPrimaryId },
            iterations: `${colGate}query.heightmap(variable.worldx, variable.worldz) >= 16 && ${surfaceNoiseExpr} <= 0.16 ? 3 : 0`,
            coordinate_eval_order: 'zyx',
            x: 0,
            z: 0,
            y: { distribution: 'fixed_grid', extent: [-2, 0] },
            project_input_to_floor: false,
            places_feature: primarySurfaceFeat,
          },
        });
        features.set(`features/biome_${region.id}_surface_col_alt${suffix}_feature.json`, {
          format_version: BEDROCK_FEATURE_FORMAT_VERSION,
          'minecraft:scatter_feature': {
            description: { identifier: colAltId },
            iterations: `${colGate}query.heightmap(variable.worldx, variable.worldz) >= 16 && ${surfaceNoiseExpr} > 0.16 ? 3 : 0`,
            coordinate_eval_order: 'zyx',
            x: 0,
            z: 0,
            y: { distribution: 'fixed_grid', extent: [-2, 0] },
            project_input_to_floor: false,
            places_feature: altSurfaceFeat,
          },
        });
        features.set(`features/biome_${region.id}_surface_col${suffix}_feature.json`, {
          format_version: BEDROCK_FEATURE_FORMAT_VERSION,
          'minecraft:aggregate_feature': {
            description: { identifier: colFeatId },
            early_out: 'none',
            features: [colPrimaryId, colAltId],
          },
        });
      } else {
        features.set(`features/biome_${region.id}_surface_col${suffix}_feature.json`, {
          format_version: BEDROCK_FEATURE_FORMAT_VERSION,
          'minecraft:scatter_feature': {
            description: { identifier: colFeatId },
            iterations: `${colGate}query.heightmap(variable.worldx, variable.worldz) >= 16 ? 3 : 0`,
            coordinate_eval_order: 'zyx',
            x: 0,
            z: 0,
            y: { distribution: 'fixed_grid', extent: [-2, 0] },
            project_input_to_floor: false,
            places_feature: primarySurfaceFeat,
          },
        });
      }
      const gridFeatId = `betterend:biome_${region.id}_surface_grid${suffix}_feature`;
      features.set(`features/biome_${region.id}_surface_grid${suffix}_feature.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:scatter_feature': {
          description: { identifier: gridFeatId },
          iterations: 256,
          coordinate_eval_order: 'zyx',
          x: { distribution: 'fixed_grid', extent: [0, 15] },
          z: { distribution: 'fixed_grid', extent: [0, 15] },
          y: 'query.heightmap(variable.worldx, variable.worldz) - 1',
          project_input_to_floor: false,
          places_feature: colFeatId,
        },
      });
      return gridFeatId;
    };

    const hasSubLattice =
      Object.prototype.hasOwnProperty.call(NATIVE_SUB_BIOME_PARENTS, idx) ||
      Object.values(NATIVE_SUB_BIOME_PARENTS).some(subs => subs.includes(idx));
    const nearCellEdge = molangChunkNearCellEdge(
      hasSubLattice ? [NATIVE_CELL_SIZE, NATIVE_SUBCELL_SIZE] : [NATIVE_CELL_SIZE],
    );
    const interiorGridId = buildSurfaceGrid('_interior', false);
    const borderGridId = buildSurfaceGrid('', true);
    const surfaceConditions = {
      placement_pass: 'surface_pass',
      'minecraft:biome_filter': [{ test: 'has_biome_tag', operator: '==', value: 'the_end' }],
    };
    featureRules.set(`feature_rules/biome_${region.id}_surface_interior_rule.json`, {
      format_version: BEDROCK_FEATURE_FORMAT_VERSION,
      'minecraft:feature_rules': {
        description: {
          identifier: `betterend:biome_${region.id}_surface_interior_rule`,
          places_feature: interiorGridId,
        },
        conditions: surfaceConditions,
        distribution: {
          iterations: `${chunkHasLand} ? (${nearCellEdge} ? 0 : (${cellCond} ? 1 : 0)) : 0`,
          x: 0,
          y: 0,
          z: 0,
        },
      },
    });
    featureRules.set(`feature_rules/biome_${region.id}_surface_rule.json`, {
      format_version: BEDROCK_FEATURE_FORMAT_VERSION,
      'minecraft:feature_rules': {
        description: {
          identifier: `betterend:biome_${region.id}_surface_rule`,
          places_feature: borderGridId,
        },
        conditions: surfaceConditions,
        distribution: {
          iterations: `${chunkHasLand} ? (${nearCellEdge} ? (${molangChunkAnyMatch(matchAt)} ? 1 : 0) : 0) : 0`,
          x: 0,
          y: 0,
          z: 0,
        },
      },
    });

    }

    // Chunk-level guards shared by the placement rules below.
    const hasPond = isPaintedRegion && LAKE_BIOME_IDS.has(region.id);
    const lakeStride = region.id === 'megalake' || region.id === 'megalake_grove' ? 5 : 8;
    const lakeHash = chunkHashExpr(419.2, 371.9, 59.3 + idx);
    const pondHere = hasPond ? `(math.mod(${lakeHash}, ${lakeStride}) == 0)` : null;
    const minorStructStride = 16;
    const minorStructHash = chunkHashExpr(521.7, 241.3, 101.5 + idx);
    const minorStructHere =
      plan.nbtMinor.length > 0 && !isCaveRegion
        ? `(math.mod(${minorStructHash}, ${minorStructStride}) == 0)`
        : null;
    const landGate = `query.heightmap(variable.originx + 8, variable.originz + 8) >= 50`;
    const joinGuards = parts => parts.filter(Boolean).join(' && ');

    if (isPaintedRegion) {
    // 3. Native curated flora scatter in after_surface_pass (modulated by Perlin noise density)
    const curatedFlora = (BIOME_SURFACE_FLORA[region.id] ?? ['betterend:creeping_moss', 'betterend:amber_grass']).filter(
      blk => knownBlockIds.has(blk),
    );
    const floraBlocks = curatedFlora.length > 0 ? curatedFlora : ['betterend:creeping_moss'];

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
          places_feature: ensureBiomeGate(biomeFloraFeatId, 'flora'),
        },
        conditions: {
          placement_pass: 'after_surface_pass',
          'minecraft:biome_filter': [
            { test: 'has_biome_tag', operator: '==', value: 'the_end' },
          ],
        },
        distribution: {
          iterations: `query.heightmap(variable.originx + 8, variable.originz + 8) >= 48 && ${cellCond} ? math.max(4, math.floor(${floraDensity} * (0.65 + 0.65 * query.noise(variable.originx * 0.04, variable.originz * 0.04)))) : 0`,
          x: { distribution: 'uniform', extent: [0, 16] },
          y: 'query.heightmap(variable.worldx, variable.worldz)',
          z: { distribution: 'uniform', extent: [0, 16] },
        },
      },
    });

    }

    // 4. Native 1:1 BetterEnd SDF/Spline trees & mushrooms at the Java `onEveryLayerMax(n)` density,
    //    modulated by a Perlin grove field. Every attempt is pre-checked: land + flat trunk ring (template
    //    guard), biome of its own anchor column, no reserved major-structure window, no pond chunk, and no
    //    minor-ruin chunk.
    const regionTreeEntries = [];
    for (const fId of region.features ?? []) {
      if (treeFeatureIds.has(fId)) {
        regionTreeEntries.push({
          feat: treeFeatureIds.get(fId),
          weight: JAVA_TREE_DENSITY[fId] ?? 1,
        });
      }
    }
    if (region.id === 'flower_islets' && treeFeatureIds.has('large_amaranita')) {
      regionTreeEntries.push({ feat: treeFeatureIds.get('large_amaranita'), weight: 1 });
    }

    if (isPaintedRegion && regionTreeEntries.length > 0) {
      let targetTreeFeat = regionTreeEntries[0].feat;
      if (regionTreeEntries.length > 1) {
        const mixId = `betterend:biome_${region.id}_tree_mix_feature`;
        features.set(`features/biome_${region.id}_tree_mix_feature.json`, {
          format_version: BEDROCK_FEATURE_FORMAT_VERSION,
          'minecraft:weighted_random_feature': {
            description: { identifier: mixId },
            features: regionTreeEntries.map(entry => [entry.feat, entry.weight * 10]),
          },
        });
        targetTreeFeat = mixId;
      }

      const treeDensity =
        regionTreeEntries.reduce((sum, entry) => sum + entry.weight, 0) *
        (TREE_DENSITY_SCALE[region.id] ?? DEFAULT_TREE_DENSITY_SCALE);
      const treeHash = chunkHashExpr(127.1, 311.7, 13.7 + idx);
      const treeCount = molangTreeCount({
        density: Number(treeDensity.toFixed(3)),
        noiseSalt: idx * 17,
        hashExpr: treeHash,
        max: 4,
      });
      const treeGuards = joinGuards([
        landGate,
        cellCond,
        `${nearAnySite} == 0`,
        pondHere ? `${pondHere} == 0` : null,
        minorStructHere ? `${minorStructHere} == 0` : null,
      ]);
      featureRules.set(`feature_rules/biome_${region.id}_tree_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_tree_rule`,
            places_feature: ensureBiomeGate(targetTreeFeat, 'tree'),
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${treeGuards} ? ${treeCount} : 0`,
            x: { distribution: 'uniform', extent: [1, 15] },
            y: 'query.heightmap(variable.worldx, variable.worldz)',
            z: { distribution: 'uniform', extent: [1, 15] },
          },
        },
      });
    }

    // 5. Native 1:1 multi-block plants & bushes per biome (Perlin noise + non-linear hash)
    const subFeatureList = BIOME_PROCEDURAL_SUBFEATURES[region.id] ?? [];
    if (!isAerialRegion && subFeatureList.length > 0) {
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
      const subGuards = joinGuards([
        landGate,
        cellCond,
        `${nearAnySite} == 0`,
        pondHere ? `${pondHere} == 0` : null,
        `query.noise(variable.originx * 0.035 + 41, variable.originz * 0.035 + 41) > -0.15`,
        `math.mod(${subHash}, 3) == 0`,
      ]);
      featureRules.set(`feature_rules/biome_${region.id}_subfeatures_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_subfeatures_rule`,
            places_feature: ensureBiomeGate(subMixId, 'sub'),
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${subGuards} ? 1 : 0`,
            x: { distribution: 'uniform', extent: [2, 14] },
            y: 'query.heightmap(variable.worldx, variable.worldz)',
            z: { distribution: 'uniform', extent: [2, 14] },
          },
        },
      });
    }

    // 5b. Floating "sky scatter" plants. Java `FilaluxFeature extends SkyScatterFeature`: every chunk of
    //     Lantern Woods scatters ~r^2 * 2.25 / 10 (r = 5..10, about 13) free-floating Filalux lanterns
    //     (lantern + 5 wings + 1-3 hanging vine blocks) around a random height; positions are valid in
    //     open air only. Here the per-chunk band floats from just above the local terrain up to y = 192
    //     (Java's 32..192 minus the part that would be underground), with a +-5 block vertical scatter.
    const skyScatter = SKY_SCATTER_BY_BIOME[region.id];
    if (skyScatter && isPaintedRegion) {
      const skyHash = chunkHashExpr(331.7, 197.3, 47.9 + idx);
      // highest of five heightmap probes, so a lantern band never dips into a ridge the centre probe missed
      const probe = (dx, dz) => `query.heightmap(variable.originx + ${dx}, variable.originz + ${dz})`;
      const terrainTop = `math.max(math.max(math.max(${probe(8, 8)}, ${probe(2, 2)}), math.max(${probe(13, 2)}, ${probe(2, 13)})), ${probe(13, 13)})`;
      const bandBase = `${terrainTop} + 14 + math.mod(${skyHash}, math.max(1, 178 - ${terrainTop}))`;
      const jitter = 'math.mod(math.floor(math.abs(math.sin(variable.worldx * 12.9898 + variable.worldz * 78.233) * 43758.5453)), 11)';
      const skyCount = molangTreeCount({
        density: skyScatter.density,
        noiseSalt: idx * 23 + 7,
        hashExpr: chunkHashExpr(419.9, 233.1, 29.9 + idx),
        max: skyScatter.max,
      });
      const skyGuards = joinGuards([chunkHasLand, cellCond, `${nearAnySite} == 0`]);
      const skyFeature = ensureProceduralStructureFeature(skyScatter.proc, { groundCheck: false });
      featureRules.set(`feature_rules/biome_${region.id}_sky_scatter_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_sky_scatter_rule`,
            places_feature: ensureBiomeGate(skyFeature, 'sky'),
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [{ test: 'has_biome_tag', operator: '==', value: 'the_end' }],
          },
          distribution: {
            iterations: `${skyGuards} ? ${skyCount} : 0`,
            x: { distribution: 'uniform', extent: [1, 15] },
            y: `${bandBase} + ${jitter}`,
            z: { distribution: 'uniform', extent: [1, 15] },
          },
        },
      });
    }

    // 6. Native 1:1 water lakes/ponds in megalake & lake biomes (flat-basin footprint guard, never inside a
    //    reserved major-structure window)
    if (hasPond) {
      const lakeFeatId =
        region.id === 'neon_oasis'
          ? 'betterend:desert_lake_feature'
          : region.id === 'sulphur_springs'
            ? 'betterend:sulphuric_lake_feature'
            : region.id === 'waterfall_ponds'
              ? 'betterend:pond_with_waterfall_feature'
              : 'betterend:water_pond_patch_feature';
      const pondGuards = joinGuards([
        landGate,
        `math.mod(${lakeHash}, ${lakeStride}) == 0`,
        cellCond,
        `${nearAnySite} == 0`,
      ]);
      featureRules.set(`feature_rules/biome_${region.id}_pond_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_pond_rule`,
            places_feature: ensureBiomeGate(lakeFeatId, 'pond'),
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${pondGuards} ? 1 : 0`,
            x: { distribution: 'uniform', extent: [3, 13] },
            y: 'query.heightmap(variable.worldx, variable.worldz) - 1',
            z: { distribution: 'uniform', extent: [3, 13] },
          },
        },
      });
    }

    // 7. Native 3D spiky ice stars in Ice Starfield, using BetterEnd's own frequencies over void:
    //    ICE_STAR_SMALL (size 3-5)  = chance 1/8 per chunk   (IceStarFeatureConfig(3, 5, 7, 12), chanced 8)
    //    ICE_STAR       (size 5-15) = chance 1/15 per chunk  (IceStarFeatureConfig(5, 15, 10, 25), chanced 15)
    //    GIANT_ICE_STAR (size 20-35, 40-70 blocks across) = one per 16x16 chunks (randomPlacement(16, 8))
    //    All float at random heights 32..128 inside the void.
    if (region.id === 'ice_starfield') {
      const chunkIsVoid = `(${chunkHasLand}) == 0`;
      const starHeight = aerialHeightExpr(32, 97);
      const emitStarRule = (tag, featureId, guards, extentLo, extentHi) =>
        featureRules.set(`feature_rules/biome_ice_starfield_${tag}_rule.json`, {
          format_version: BEDROCK_FEATURE_FORMAT_VERSION,
          'minecraft:feature_rules': {
            description: {
              identifier: `betterend:biome_ice_starfield_${tag}_rule`,
              places_feature: ensureBiomeGate(featureId, tag),
            },
            conditions: {
              placement_pass: 'after_surface_pass',
              'minecraft:biome_filter': [{ test: 'has_biome_tag', operator: '==', value: 'the_end' }],
            },
            distribution: {
              iterations: `${guards} ? 1 : 0`,
              x: { distribution: 'uniform', extent: [extentLo, extentHi] },
              y: starHeight,
              z: { distribution: 'uniform', extent: [extentLo, extentHi] },
            },
          },
        });
      emitStarRule(
        'star_small',
        iceStarSmallFeat,
        joinGuards([chunkIsVoid, `math.mod(${chunkHashExpr(173.9, 293.1, 71.7)}, 8) == 0`, cellCond]),
        1,
        15,
      );
      emitStarRule(
        'star_medium',
        iceStarMedFeat,
        joinGuards([chunkIsVoid, `math.mod(${chunkHashExpr(251.3, 107.9, 19.3)}, 15) == 0`, cellCond]),
        1,
        15,
      );
      // Giant stars (40-70 blocks across) cannot be placed as one structure - Bedrock only writes a 3x3
      // chunk window per rule - so every chunk within 2 chunks of the star's site chunk places its own
      // 16x16 column tile. The site, void check, biome and variant are re-derived from the offset site
      // chunk, so all tiles of a star agree; the height comes from the site's hash (Java: 32..128).
      const giantLayer = SITE_LAYERS.giantStar;
      const tiled = resolvedStructures.tiledProcedural.get('giant_ice_star');
      for (const { variant, tiles } of tiled?.variants ?? []) {
        for (const { dx, dz, meta } of tiles) {
          const tileFeatId = ensureTileTemplateFeature(meta);
          const siteHere = molangSiteHere(giantLayer, dx, dz);
          const offsetCoords = siteCoords(
            giantLayer,
            chunkOffsetExpr(CHUNK_X, -dx),
            chunkOffsetExpr(CHUNK_Z, -dz),
          );
          // Once `siteHere` holds, the site chunk is `(-dx, -dz)` chunks from this tile, so its centre
          // column is `variable.originx + (8 - dx * 16)`. Using that direct offset avoids re-inlining
          // `offsetCoords.px/pz` 22 times inside `molangAerialMatch` (shrinking each rule from ~8.1k to ~2.1k chars).
          const cxOff = 8 - dx * 16;
          const czOff = 8 - dz * 16;
          const siteCentreX = cxOff >= 0 ? `variable.originx + ${cxOff}` : `variable.originx - ${-cxOff}`;
          const siteCentreZ = czOff >= 0 ? `variable.originz + ${czOff}` : `variable.originz - ${-czOff}`;
          const guards = joinGuards([
            `math.mod(${offsetCoords.pickHash}, ${tiled.variants.length}) == ${variant}`,
            siteHere,
            `${offsetCoords.gateRoll} < ${giantLayer.gatePercent}`,
            // Verified in BDS: a tile only writes when its own chunk is void (9 in-chunk heightmap probes);
            // the site's aerial-map membership is re-derived identically by every tile of the star.
            `(${chunkHasLand} == 0)`,
            molangAerialMatch(idx, siteCentreX, siteCentreZ),
          ]);
          const tag = `star_giant_v${variant}_t${dx + tiled.half}_${dz + tiled.half}`;
          featureRules.set(`feature_rules/biome_ice_starfield_${tag}_rule.json`, {
            format_version: BEDROCK_FEATURE_FORMAT_VERSION,
            'minecraft:feature_rules': {
              description: {
                identifier: `betterend:biome_ice_starfield_${tag}_rule`,
                places_feature: tileFeatId,
              },
              conditions: {
                placement_pass: 'after_surface_pass',
                'minecraft:biome_filter': [{ test: 'has_biome_tag', operator: '==', value: 'the_end' }],
              },
              distribution: {
                iterations: `${guards} ? 1 : 0`,
                x: meta.originOffset[0],
                // star height 32..127 from the site's kind roll, plus the tile's own vertical offset
                y: `32 + math.floor(${offsetCoords.kindRoll} * 0.96) + ${meta.originOffset[1]}`,
                z: meta.originOffset[2],
              },
            },
          });
        }
      }
    }

    // 8. Native 3D big aurora crystal hexagonal prisms in Crystal Mountains & Aurora Caves (strictly void-gated!)
    if (['crystal_mountains', 'empty_aurora_cave', 'lush_aurora_cave'].includes(region.id)) {
      const auroraHash = chunkHashExpr(347.3, 197.7, 83.9 + idx);
      featureRules.set(`feature_rules/biome_${region.id}_aurora_pillar_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_aurora_pillar_rule`,
            places_feature: ensureBiomeGate('betterend:big_aurora_crystal_cluster_feature', 'aurora'),
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${landGate} && !(${nearAnySite}) && math.mod(${auroraHash}, 6) == 0 && ${cellCond} ? 1 : 0`,
            x: { distribution: 'uniform', extent: [2, 14] },
            y: 'query.heightmap(variable.worldx, variable.worldz)',
            z: { distribution: 'uniform', extent: [2, 14] },
          },
        },
      });
    }

    // 9. Original BetterEnd .nbt biome buildings & ruins (structures.json).
    //    Minor ruins (< 16x16): per-chunk stride, footprint-checked, kept out of major windows.
    if (plan.nbtMinor.length > 0) {
      const nbtChoices = plan.nbtMinor.map(meta => [
        ensureStructureTemplateFeature(meta, { guard: 'structure' }),
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
      const nbtGuards = joinGuards([
        landGate,
        `math.mod(${minorStructHash}, ${minorStructStride}) == 0`,
        cellCond,
        `${nearAnySite} == 0`,
      ]);
      featureRules.set(`feature_rules/biome_${region.id}_nbt_structures_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_nbt_structures_rule`,
            places_feature: ensureBiomeGate(nbtMixId, 'nbt'),
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${nbtGuards} ? 1 : 0`,
            x: { distribution: 'uniform', extent: [3, 13] },
            y: 'query.heightmap(variable.worldx, variable.worldz)',
            z: { distribution: 'uniform', extent: [3, 13] },
          },
        },
      });
    }

    // 10. Major sites: houses, libraries, tree houses, mansions, arches and floating islands claim a spaced
    //     site (one per 6x6-chunk block) and reserve a 3x3-chunk exclusion window, so nothing else is ever
    //     generated on top of them. Foggy Mushroomland's giant glowshrooms get their own dense site layer.
    if (plan.nbtMajor.length + plan.landmarkMajor.length > 0) {
      const majorLayer = isAerialRegion ? SITE_LAYERS.island : SITE_LAYERS.major;
      const majorCoords = siteCoords(majorLayer);
      const landmarkShare = 50;
      const hasLandmarks = plan.landmarkMajor.length > 0;
      const hasStructures = plan.nbtMajor.length > 0;
      const emitMajorRule = (kind, featureId, kindCond) => {
        const guards = joinGuards([
          molangSiteHere(majorLayer),
          `${majorCoords.gateRoll} < ${majorLayer.gatePercent}`,
          kindCond,
          isAerialRegion ? molangVoidAround() : landGate,
          cellCond,
          plan.giant ? `${nearGiantSite} == 0` : null,
        ]);
        featureRules.set(`feature_rules/biome_${region.id}_major_${kind}_rule.json`, {
          format_version: BEDROCK_FEATURE_FORMAT_VERSION,
          'minecraft:feature_rules': {
            description: {
              identifier: `betterend:biome_${region.id}_major_${kind}_rule`,
              places_feature: ensureBiomeGate(featureId, `major_${kind}`),
            },
            conditions: {
              placement_pass: 'after_surface_pass',
              'minecraft:biome_filter': [
                { test: 'has_biome_tag', operator: '==', value: 'the_end' },
              ],
            },
            distribution: {
              iterations: `${guards} ? 1 : 0`,
              x: { distribution: 'uniform', extent: [5, 11] },
              y: isAerialRegion
                ? aerialHeightExpr(58, 29)
                : 'query.heightmap(variable.worldx, variable.worldz)',
              z: { distribution: 'uniform', extent: [5, 11] },
            },
          },
        });
      };

      if (hasStructures) {
        const majorMixId = `betterend:biome_${region.id}_major_structures_feature`;
        features.set(`features/biome_${region.id}_major_structures_feature.json`, {
          format_version: BEDROCK_FEATURE_FORMAT_VERSION,
          'minecraft:weighted_random_feature': {
            description: { identifier: majorMixId },
            features: plan.nbtMajor.map(meta => [
              ensureStructureTemplateFeature(meta, { guard: isAerialRegion ? 'none' : 'structure' }),
              10,
            ]),
          },
        });
        emitMajorRule(
          'structure',
          majorMixId,
          hasLandmarks ? `${majorCoords.kindRoll} >= ${landmarkShare}` : null,
        );
      }
      if (hasLandmarks) {
        const majorLmMixId = `betterend:biome_${region.id}_major_landmarks_feature`;
        features.set(`features/biome_${region.id}_major_landmarks_feature.json`, {
          format_version: BEDROCK_FEATURE_FORMAT_VERSION,
          'minecraft:weighted_random_feature': {
            description: { identifier: majorLmMixId },
            features: plan.landmarkMajor.map(procId => [
              ensureProceduralStructureFeature(procId, { groundCheck: !AERIAL_PROC_IDS.has(procId) }),
              10,
            ]),
          },
        });
        emitMajorRule(
          'landmark',
          majorLmMixId,
          hasStructures ? `${majorCoords.kindRoll} < ${landmarkShare}` : null,
        );
      }
    }

    if (plan.giant) {
      const giantLayer = SITE_LAYERS.giant;
      const giantCoords = siteCoords(giantLayer);
      const giantGuards = joinGuards([
        molangSiteHere(giantLayer),
        `${giantCoords.gateRoll} < ${giantLayer.gatePercent}`,
        landGate,
        cellCond,
        `${nearMajorSite} == 0`,
      ]);
      featureRules.set(`feature_rules/biome_${region.id}_giant_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_giant_rule`,
            places_feature: ensureBiomeGate(
              ensureProceduralStructureFeature(plan.giant, { groundCheck: true }),
              'giant',
            ),
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${giantGuards} ? 1 : 0`,
            x: { distribution: 'uniform', extent: [6, 10] },
            y: 'query.heightmap(variable.worldx, variable.worldz)',
            z: { distribution: 'uniform', extent: [6, 10] },
          },
        },
      });
    }

    // Minor landmarks (spires, boulders, pillars, grottos, floating spires): per-chunk stride, guarded.
    const groundLandmarks = plan.landmarkMinor.filter(procId => !AERIAL_PROC_IDS.has(procId));
    const hoveringLandmarks = plan.landmarkMinor.filter(procId => AERIAL_PROC_IDS.has(procId));
    const emitMinorLandmarkRule = (tag, procIds, { hover }) => {
      if (procIds.length === 0) return;
      const choices = procIds.map(procId => [
        ensureProceduralStructureFeature(procId, { groundCheck: !hover }),
        10,
      ]);
      const mixId = `betterend:biome_${region.id}_${tag}_feature`;
      features.set(`features/biome_${region.id}_${tag}_feature.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:weighted_random_feature': {
          description: { identifier: mixId },
          features: choices,
        },
      });
      const lmStride = isCaveRegion ? 4 : 14;
      const lmHash = chunkHashExpr(389.3, 463.7, 137.9 + idx + (hover ? 31 : 0));
      const lmGuards = joinGuards([
        landGate,
        `math.mod(${lmHash}, ${lmStride}) == 0`,
        `query.noise(variable.originx * 0.02 + 91, variable.originz * 0.02 + 91) > -0.15`,
        cellCond,
        `${nearAnySite} == 0`,
      ]);
      featureRules.set(`feature_rules/biome_${region.id}_${tag}_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_${tag}_rule`,
            places_feature: ensureBiomeGate(mixId, tag),
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${lmGuards} ? 1 : 0`,
            x: { distribution: 'uniform', extent: [2, 14] },
            y: hover
              ? 'query.heightmap(variable.worldx, variable.worldz) + 22'
              : 'query.heightmap(variable.worldx, variable.worldz)',
            z: { distribution: 'uniform', extent: [2, 14] },
          },
        },
      });
    };
    emitMinorLandmarkRule('landmarks', groundLandmarks, { hover: false });
    emitMinorLandmarkRule('hover_landmarks', hoveringLandmarks, { hover: true });
  }

  return {
    biomes,
    serverEntities,
    clientEntities,
    entityGeometries,
    renderControllers,
    animations,
    entityLootTables,
    spawnRules,
    attachables,
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
