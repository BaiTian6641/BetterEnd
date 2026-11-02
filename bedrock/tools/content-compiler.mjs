import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRecipeHyperedgeGraph } from './recipes.mjs';
import { loadLockedRuntime } from './runtime-reconciliation.mjs';
import { compareText } from './source-files.mjs';
import { compileAllModelsAndAssets, getGeometryIdForModel, normalizeModelId } from './model-compiler.mjs';
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

function deriveBlockCustomComponents(blockEntry) {
  const components = [];
  const shortName = blockEntry.id.split(':')[1];
  const hierarchy = blockEntry.hierarchy ?? [];
  const topClass = hierarchy.at(-1) ?? '';

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
    components.push('betterend:station_interaction');
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
    components.push('betterend:interactive_furniture');
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
    components.push('betterend:ecology_tick');
  }
  const propNames = (blockEntry.stateModel?.properties ?? []).map(p => p.name);
  if (propNames.includes('half') || propNames.includes('shape') || propNames.includes('part')) {
    components.push('betterend:multiblock_guard');
  }
  return components;
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
  if (propNames.has('up') && propNames.has('north') && propNames.has('east')) {
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
      return forwardStateMap.get(key) ?? null;
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
      components['minecraft:entity_placer'] = {
        entity: itemEntry.id,
        dispense_on: ['minecraft:water', 'minecraft:flowing_water'],
        use_on: ['minecraft:water', 'minecraft:flowing_water'],
      };
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

export function compileEntitiesAndFeatures(registrations, resources) {
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

  // Shared native C++ features for Water Lakes/Ponds, 3D Spiky Ice Stars, and Big Aurora Crystal Pillars
  const waterCheckBlocks = [...allSoilBlocks, 'minecraft:water'];
  features.set('features/water_basin_cell_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:single_block_feature': {
      description: { identifier: 'betterend:water_basin_cell_feature' },
      places_block: 'minecraft:water',
      enforce_placement_rules: false,
      enforce_survivability_rules: false,
      may_replace: allSoilBlocks,
      may_attach_to: {
        bottom: allSoilBlocks,
        north: waterCheckBlocks,
        south: waterCheckBlocks,
        east: waterCheckBlocks,
        west: waterCheckBlocks,
      },
    },
  });
  features.set('features/water_pond_patch_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:scatter_feature': {
      description: { identifier: 'betterend:water_pond_patch_feature' },
      iterations: 64,
      coordinate_eval_order: 'zyx',
      x: { distribution: 'fixed_grid', extent: [-3, 4] },
      z: { distribution: 'fixed_grid', extent: [-3, 4] },
      y: 0,
      project_input_to_floor: false,
      places_feature: 'betterend:water_basin_cell_feature',
    },
  });

  features.set('features/aurora_crystal_block_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:single_block_feature': {
      description: { identifier: 'betterend:aurora_crystal_block_feature' },
      places_block: 'betterend:aurora_crystal',
      enforce_placement_rules: false,
      enforce_survivability_rules: false,
      may_replace: ['minecraft:air', 'minecraft:chorus_plant', 'minecraft:chorus_flower', ...allSoilBlocks],
    },
  });
  features.set('features/big_aurora_crystal_col_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:scatter_feature': {
      description: { identifier: 'betterend:big_aurora_crystal_col_feature' },
      iterations: 6,
      coordinate_eval_order: 'zyx',
      x: 0,
      z: 0,
      y: { distribution: 'fixed_grid', extent: [0, 5] },
      project_input_to_floor: false,
      places_feature: 'betterend:aurora_crystal_block_feature',
    },
  });
  features.set('features/big_aurora_crystal_cluster_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:scatter_feature': {
      description: { identifier: 'betterend:big_aurora_crystal_cluster_feature' },
      iterations: 5,
      coordinate_eval_order: 'zyx',
      x: { distribution: 'uniform', extent: [-1, 1] },
      z: { distribution: 'uniform', extent: [-1, 1] },
      y: { distribution: 'uniform', extent: [-1, 2] },
      project_input_to_floor: false,
      places_feature: 'betterend:big_aurora_crystal_col_feature',
    },
  });

  features.set('features/emerald_ice_block_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:single_block_feature': {
      description: { identifier: 'betterend:emerald_ice_block_feature' },
      places_block: 'betterend:emerald_ice',
      enforce_placement_rules: false,
      enforce_survivability_rules: false,
      may_replace: ['minecraft:air', ...allSoilBlocks],
    },
  });
  features.set('features/dense_emerald_ice_block_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:single_block_feature': {
      description: { identifier: 'betterend:dense_emerald_ice_block_feature' },
      places_block: 'betterend:dense_emerald_ice',
      enforce_placement_rules: false,
      enforce_survivability_rules: false,
      may_replace: ['minecraft:air', 'betterend:emerald_ice', ...allSoilBlocks],
    },
  });
  features.set('features/ancient_emerald_ice_block_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:single_block_feature': {
      description: { identifier: 'betterend:ancient_emerald_ice_block_feature' },
      places_block: 'betterend:ancient_emerald_ice',
      enforce_placement_rules: false,
      enforce_survivability_rules: false,
      may_replace: ['minecraft:air', 'betterend:emerald_ice', 'betterend:dense_emerald_ice', ...allSoilBlocks],
    },
  });
  features.set('features/ice_star_core_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:scatter_feature': {
      description: { identifier: 'betterend:ice_star_core_feature' },
      iterations: 27,
      coordinate_eval_order: 'zyx',
      x: { distribution: 'fixed_grid', extent: [-1, 1] },
      y: { distribution: 'fixed_grid', extent: [-1, 1] },
      z: { distribution: 'fixed_grid', extent: [-1, 1] },
      project_input_to_floor: false,
      places_feature: 'betterend:ancient_emerald_ice_block_feature',
    },
  });
  features.set('features/ice_star_shell_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:scatter_feature': {
      description: { identifier: 'betterend:ice_star_shell_feature' },
      iterations: 36,
      coordinate_eval_order: 'zyx',
      x: { distribution: 'uniform', extent: [-2, 2] },
      y: { distribution: 'uniform', extent: [-2, 2] },
      z: { distribution: 'uniform', extent: [-2, 2] },
      project_input_to_floor: false,
      places_feature: 'betterend:dense_emerald_ice_block_feature',
    },
  });
  features.set('features/ice_star_spike_x_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:scatter_feature': {
      description: { identifier: 'betterend:ice_star_spike_x_feature' },
      iterations: 11,
      coordinate_eval_order: 'zyx',
      x: { distribution: 'fixed_grid', extent: [-5, 5] },
      y: 0,
      z: 0,
      project_input_to_floor: false,
      places_feature: 'betterend:emerald_ice_block_feature',
    },
  });
  features.set('features/ice_star_spike_y_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:scatter_feature': {
      description: { identifier: 'betterend:ice_star_spike_y_feature' },
      iterations: 11,
      coordinate_eval_order: 'zyx',
      x: 0,
      y: { distribution: 'fixed_grid', extent: [-5, 5] },
      z: 0,
      project_input_to_floor: false,
      places_feature: 'betterend:emerald_ice_block_feature',
    },
  });
  features.set('features/ice_star_spike_z_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:scatter_feature': {
      description: { identifier: 'betterend:ice_star_spike_z_feature' },
      iterations: 11,
      coordinate_eval_order: 'zyx',
      x: 0,
      y: 0,
      z: { distribution: 'fixed_grid', extent: [-5, 5] },
      project_input_to_floor: false,
      places_feature: 'betterend:emerald_ice_block_feature',
    },
  });
  features.set('features/ice_star_structure_feature.json', {
    format_version: BEDROCK_FEATURE_FORMAT_VERSION,
    'minecraft:aggregate_feature': {
      description: { identifier: 'betterend:ice_star_structure_feature' },
      early_out: 'none',
      features: [
        'betterend:ice_star_spike_x_feature',
        'betterend:ice_star_spike_y_feature',
        'betterend:ice_star_spike_z_feature',
        'betterend:ice_star_shell_feature',
        'betterend:ice_star_core_feature',
      ],
    },
  });

  // Emit native tree features for all 11 BetterEnd tree species
  const treeFeatureIds = new Map();
  for (const treeDesc of FEATURES_BY_CATEGORY.trees ?? []) {
    const palette = (treeDesc.palette ?? []).filter(b => knownBlockIds.has(b));
    const trunkBlock =
      palette.find(b => b.endsWith('_log') || b.endsWith('_stem') || b.endsWith('_bark')) ??
      palette[0] ??
      'betterend:mossy_glowshroom_log';
    const leafBlock =
      palette.find(
        b =>
          b.endsWith('_leaves') ||
          b.endsWith('_cap') ||
          b.endsWith('_cap_purple') ||
          b.endsWith('_membrane'),
      ) ??
      palette[1] ??
      trunkBlock;
    const featId = `betterend:tree_${treeDesc.id}_feature`;
    treeFeatureIds.set(treeDesc.id, featId);
    features.set(`features/tree_${treeDesc.id}_feature.json`, {
      format_version: BEDROCK_FEATURE_FORMAT_VERSION,
      'minecraft:tree_feature': {
        description: {
          identifier: featId,
        },
        acacia_trunk: {
          trunk_width: 1,
          trunk_height: {
            base: 9,
            intervals: [4, 3],
            min_height_for_canopy: 5,
          },
          trunk_block: trunkBlock,
          trunk_lean: {
            allow_diagonal_growth: true,
            lean_height: { range_min: 3, range_max: 6 },
            lean_steps: { range_min: 2, range_max: 4 },
            lean_length: { range_min: 1, range_max: 3 },
          },
        },
        random_spread_canopy: {
          canopy_height: 4,
          canopy_radius: 4,
          leaf_placement_attempts: 90,
          leaf_blocks: [[leafBlock, 4]],
        },
        base_block: [allSoilBlocks[1] ?? 'minecraft:end_stone'],
        may_grow_on: allSoilBlocks,
        may_replace: [
          'minecraft:air',
          'minecraft:chorus_plant',
          'minecraft:chorus_flower',
          leafBlock,
        ],
        may_grow_through: allSoilBlocks,
      },
    });
  }

  // Emit all 27 Native Biomes + Native Surface/Flora/Tree Features & Feature Rules
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

    const cellCond = `((math.abs(variable.originx + 8) > 1024 || math.abs(variable.originz + 8) > 1024) && math.mod(math.abs(math.floor((variable.originx + 8) / 256) * 73 + math.floor((variable.originz + 8) / 256) * 199), 27) == ${idx})`;

    // 2. Native Surface Replacement (16x16x3 vertical column covering top 3 layers of every column so slopes have zero end_stone rings)
    const primaryTop =
      region.surface?.topBlock && region.surface.topBlock !== 'minecraft:end_stone'
        ? region.surface.topBlock
        : region.surface?.altTopBlock ?? 'betterend:end_moss';
    const altTop =
      region.surface?.altTopBlock && region.surface.altTopBlock !== primaryTop
        ? region.surface.altTopBlock
        : null;

    const primarySurfaceFeat = ensureSurfaceBlockFeature(primaryTop);
    let surfaceTargetFeat = primarySurfaceFeat;
    if (altTop) {
      const altSurfaceFeat = ensureSurfaceBlockFeature(altTop);
      const choiceId = `betterend:biome_${region.id}_surface_choice_feature`;
      features.set(`features/biome_${region.id}_surface_choice_feature.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:weighted_random_feature': {
          description: { identifier: choiceId },
          features: [
            [primarySurfaceFeat, 70],
            [altSurfaceFeat, 30],
          ],
        },
      });
      surfaceTargetFeat = choiceId;
    }

    const colFeatId = `betterend:biome_${region.id}_surface_col_feature`;
    features.set(`features/biome_${region.id}_surface_col_feature.json`, {
      format_version: BEDROCK_FEATURE_FORMAT_VERSION,
      'minecraft:scatter_feature': {
        description: {
          identifier: colFeatId,
        },
        iterations: 3,
        coordinate_eval_order: 'zyx',
        x: 0,
        z: 0,
        y: { distribution: 'fixed_grid', extent: [-2, 0] },
        project_input_to_floor: false,
        places_feature: surfaceTargetFeat,
      },
    });

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
          iterations: `${cellCond} ? 1 : 0`,
          x: 0,
          y: 0,
          z: 0,
        },
      },
    });

    // 3. Native Curated Flora Scatter in after_surface_pass
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
          iterations: `${cellCond} ? ${floraDensity} : 0`,
          x: { distribution: 'uniform', extent: [0, 16] },
          y: 'query.heightmap(variable.worldx, variable.worldz)',
          z: { distribution: 'uniform', extent: [0, 16] },
        },
      },
    });

    // 4. Native Tree / Giant Mushroom Scatter in after_surface_pass
    if (regionTrees.length > 0) {
      featureRules.set(`feature_rules/biome_${region.id}_tree_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_tree_rule`,
            places_feature: regionTrees[0],
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${cellCond} ? 8 : 0`,
            x: { distribution: 'uniform', extent: [0, 16] },
            y: 'query.heightmap(variable.worldx, variable.worldz)',
            z: { distribution: 'uniform', extent: [0, 16] },
          },
        },
      });
    }

    // 5. Native Water Lakes/Ponds in Megalake & Lake Biomes
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
      const pondCount = region.id === 'megalake' || region.id === 'megalake_grove' ? 3 : 2;
      featureRules.set(`feature_rules/biome_${region.id}_pond_rule.json`, {
        format_version: BEDROCK_FEATURE_FORMAT_VERSION,
        'minecraft:feature_rules': {
          description: {
            identifier: `betterend:biome_${region.id}_pond_rule`,
            places_feature: 'betterend:water_pond_patch_feature',
          },
          conditions: {
            placement_pass: 'after_surface_pass',
            'minecraft:biome_filter': [
              { test: 'has_biome_tag', operator: '==', value: 'the_end' },
            ],
          },
          distribution: {
            iterations: `${cellCond} ? ${pondCount} : 0`,
            x: { distribution: 'uniform', extent: [4, 12] },
            y: 'query.heightmap(variable.worldx, variable.worldz) - 1',
            z: { distribution: 'uniform', extent: [4, 12] },
          },
        },
      });
    }

    // 6. Native 3D Spiky Ice Stars in Ice Starfield
    if (region.id === 'ice_starfield') {
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
            iterations: `${cellCond} ? 2 : 0`,
            x: { distribution: 'uniform', extent: [4, 12] },
            y: { distribution: 'uniform', extent: [58, 92] },
            z: { distribution: 'uniform', extent: [4, 12] },
          },
        },
      });
    }

    // 7. Native 3D Big Aurora Crystal Pillars in Crystal Mountains & Aurora Caves
    if (['crystal_mountains', 'empty_aurora_cave', 'lush_aurora_cave'].includes(region.id)) {
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
            iterations: `${cellCond} ? 2 : 0`,
            x: { distribution: 'uniform', extent: [4, 12] },
            y: 'query.heightmap(variable.worldx, variable.worldz)',
            z: { distribution: 'uniform', extent: [4, 12] },
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
  const entitiesAndFeatures = compileEntitiesAndFeatures(registrations, resources);

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
    },
    modelAssets,
    blocks,
    items,
    recipes,
    entitiesAndFeatures,
  };
}
