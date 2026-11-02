import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { compareText, walkFiles } from './source-files.mjs';
import {
  AURORA_PALETTE,
  BULB_LANTERN_COLORS,
  HELIX_LEAVES_GRADIENT,
  HYDRALUX_PETAL_COLORS,
  JELLYSHROOM_CAP_GRADIENT,
  TENANEA_PALETTE,
  buildTextureSetJson,
} from './png-codec.mjs';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(toolsDir, '../..');

// Deflated canonical fallback definitions for all 11 bclib:block/*, 3 wover:block/*,
// and 88 minecraft:block/* & minecraft:item/* parent models from the pinned 26.3 jars.
const EXTERNAL_PARENTS_B64 =
  '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';

export const EXTERNAL_PARENT_TEMPLATES = Object.freeze({
  ...JSON.parse(inflateSync(Buffer.from(EXTERNAL_PARENTS_B64, 'base64')).toString('utf8')),
  'betterend:block/bulb_vine_lantern_ceil': {
    parent: 'bclib:block/bulb_lantern_ceil',
    textures: {
      glow: 'betterend:block/bulb_vine_lantern_bulb',
      metal: 'betterend:block/iron_bulb_vine_lantern_metal',
    },
  },
  'betterend:block/bulb_vine_lantern_floor': {
    parent: 'bclib:block/bulb_lantern_floor',
    textures: {
      glow: 'betterend:block/bulb_vine_lantern_bulb',
      metal: 'betterend:block/iron_bulb_vine_lantern_metal',
    },
  },
  'minecraft:builtin/generated': {
    elements: [],
    textures: {},
  },
  'minecraft:builtin/entity': {
    elements: [],
    textures: {},
  },
  'minecraft:item/template_spawn_egg': {
    parent: 'minecraft:item/generated',
    textures: {},
  },
});

export function normalizeModelId(rawId) {
  if (!rawId || typeof rawId !== 'string') return null;
  const trimmed = rawId.trim();
  return trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`;
}

export function normalizeTextureId(rawTex) {
  if (!rawTex || typeof rawTex !== 'string') return null;
  const trimmed = rawTex.trim();
  if (trimmed.startsWith('#') || trimmed.includes('%')) return trimmed;
  return trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`;
}

export async function loadModelIndex(repoRoot = defaultRepoRoot) {
  const models = new Map();
  const patterns = new Map();
  const blockstates = new Map();
  const itemDefinitions = new Map();

  for (const [id, template] of Object.entries(EXTERNAL_PARENT_TEMPLATES)) {
    models.set(id, structuredClone(template));
  }

  const roots = ['src/main/resources/assets/betterend', 'src/main/generated/assets/betterend'];
  for (const root of roots) {
    const absRoot = path.resolve(repoRoot, root);
    if (!existsSync(absRoot)) continue;

    const modelDir = `${root}/models`;
    if (existsSync(path.resolve(repoRoot, modelDir))) {
      for (const file of await walkFiles(repoRoot, modelDir)) {
        if (!file.endsWith('.json')) continue;
        const rel = file.slice(modelDir.length + 1, -5);
        const id = `betterend:${rel}`;
        const raw = JSON.parse(readFileSync(path.resolve(repoRoot, file), 'utf8'));
        models.set(id, { ...raw, __sourcePath: file });
      }
    }

    const patternDir = `${root}/patterns`;
    if (existsSync(path.resolve(repoRoot, patternDir))) {
      for (const file of await walkFiles(repoRoot, patternDir)) {
        if (!file.endsWith('.json')) continue;
        const rel = file.slice(patternDir.length + 1, -5);
        const id = `betterend:${rel}`;
        const raw = JSON.parse(readFileSync(path.resolve(repoRoot, file), 'utf8'));
        patterns.set(id, { ...raw, __sourcePath: file });
      }
    }

    const blockstateDir = `${root}/blockstates`;
    if (existsSync(path.resolve(repoRoot, blockstateDir))) {
      for (const file of await walkFiles(repoRoot, blockstateDir)) {
        if (!file.endsWith('.json')) continue;
        const rel = file.slice(blockstateDir.length + 1, -5);
        const id = `betterend:${rel}`;
        const raw = JSON.parse(readFileSync(path.resolve(repoRoot, file), 'utf8'));
        blockstates.set(id, { ...raw, __sourcePath: file });
      }
    }

    const itemDir = `${root}/items`;
    if (existsSync(path.resolve(repoRoot, itemDir))) {
      for (const file of await walkFiles(repoRoot, itemDir)) {
        if (!file.endsWith('.json')) continue;
        const rel = file.slice(itemDir.length + 1, -5);
        const id = `betterend:${rel}`;
        const raw = JSON.parse(readFileSync(path.resolve(repoRoot, file), 'utf8'));
        itemDefinitions.set(id, { ...raw, __sourcePath: file });
      }
    }
  }

  return { models, patterns, blockstates, itemDefinitions };
}

function resolveTextureSlotValue(slotKey, texturesMap) {
  let current = texturesMap[slotKey];
  const visited = new Set([slotKey]);
  while (typeof current === 'string') {
    if (current.startsWith('#')) {
      const targetKey = current.slice(1);
      if (visited.has(targetKey)) break;
      visited.add(targetKey);
      if (texturesMap[targetKey] !== undefined) {
        current = texturesMap[targetKey];
        continue;
      }
      break;
    }
    if (current.includes('%')) {
      current = current.replace(/%([a-z0-9_]+)%/giu, (match, paramName) => {
        const replacement = texturesMap[paramName];
        if (typeof replacement === 'string' && !replacement.includes('%')) {
          return replacement.includes(':') ? replacement.split(':')[1].replace(/^block\//u, '') : replacement;
        }
        return paramName;
      });
    }
    break;
  }
  return normalizeTextureId(current);
}

const CROSS_MODEL_PARENTS = new Set([
  'minecraft:block/cross',
  'minecraft:block/cross_emissive',
  'minecraft:block/tinted_cross',
  'bclib:block/cross_shaded',
  'betterend:block/cross_inverted',
  'betterend:block/cross_no_distortion',
  'betterend:block/cross_no_distortion_inverted',
  'betterend:block/cross_no_distortion_tinted',
  'betterend:block/cross_no_distortion_inverted_tinted',
]);

export function flattenModel(modelId, index) {
  const normId = normalizeModelId(modelId);
  const { models, patterns } = index;
  const chain = [];
  const seen = new Set();
  let curId = normId;

  while (curId) {
    if (seen.has(curId)) {
      throw new Error(`Circular model parent hierarchy detected at ${curId}`);
    }
    seen.add(curId);
    const modelObj = models.get(curId) ?? patterns.get(curId) ?? EXTERNAL_PARENT_TEMPLATES[curId];
    if (!modelObj) {
      throw new Error(`Unresolved model parent: ${curId} (while flattening ${normId})`);
    }
    chain.push({ id: curId, model: modelObj });
    curId = modelObj.parent ? normalizeModelId(modelObj.parent) : null;
  }

  // Merge from root ancestor down to leaf child
  const rawTextures = Object.create(null);
  let elements = null;
  let ambientocclusion = true;
  const display = Object.create(null);
  const parentChain = chain.map(entry => entry.id);

  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const { model } = chain[i];
    if (typeof model.ambientocclusion === 'boolean') {
      ambientocclusion = model.ambientocclusion;
    }
    if (model.textures && typeof model.textures === 'object') {
      for (const [k, v] of Object.entries(model.textures)) {
        rawTextures[k] = v;
      }
    }
    if (Array.isArray(model.elements)) {
      elements = structuredClone(model.elements);
    }
    if (model.display && typeof model.display === 'object') {
      for (const [k, v] of Object.entries(model.display)) {
        display[k] = structuredClone(v);
      }
    }
  }

  const resolvedTextures = Object.create(null);
  for (const key of Object.keys(rawTextures)) {
    resolvedTextures[key] = resolveTextureSlotValue(key, rawTextures);
  }

  const resolvedElements = (elements ?? []).map(el => {
    const faces = Object.create(null);
    for (const [faceDir, faceDef] of Object.entries(el.faces ?? {})) {
      const texRef = faceDef.texture ?? '';
      const slotName = texRef.startsWith('#') ? texRef.slice(1) : texRef;
      const resolvedTexture = texRef.startsWith('#')
        ? (resolvedTextures[slotName] ?? resolveTextureSlotValue(slotName, rawTextures))
        : normalizeTextureId(texRef);
      faces[faceDir] = {
        ...faceDef,
        slot: slotName,
        resolvedTexture,
      };
    }
    return {
      ...el,
      faces,
    };
  });

  const hasTint = resolvedElements.some(el =>
    Object.values(el.faces).some(face => typeof face.tintindex === 'number' && face.tintindex >= 0),
  );

  const isCross = parentChain.some(pid => CROSS_MODEL_PARENTS.has(pid));
  const isFullCube = !isCross
    && resolvedElements.length === 1
    && resolvedElements[0].from[0] === 0
    && resolvedElements[0].from[1] === 0
    && resolvedElements[0].from[2] === 0
    && resolvedElements[0].to[0] === 16
    && resolvedElements[0].to[1] === 16
    && resolvedElements[0].to[2] === 16
    && !resolvedElements[0].rotation
    && ['down', 'up', 'north', 'south', 'west', 'east'].every(f => f in resolvedElements[0].faces);

  const is2dItem = parentChain.includes('minecraft:item/generated')
    || parentChain.includes('minecraft:item/handheld')
    || parentChain.includes('minecraft:builtin/generated');

  return {
    id: normId,
    parentChain,
    ambientocclusion,
    rawTextures,
    textures: resolvedTextures,
    elements: resolvedElements,
    display,
    hasTint,
    geometryKind: isFullCube ? 'full_block' : isCross ? 'cross' : is2dItem ? 'item_2d' : 'custom',
  };
}

function defaultFaceUv(faceDir, from, to) {
  const [x1, y1, z1] = from;
  const [x2, y2, z2] = to;
  switch (faceDir) {
    case 'down': return [x1, 16 - z2, x2, 16 - z1];
    case 'up': return [x1, z1, x2, z2];
    case 'north': return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
    case 'south': return [x1, 16 - y2, x2, 16 - y1];
    case 'west': return [z1, 16 - y2, z2, 16 - y1];
    case 'east': return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
    default: return [0, 0, 16, 16];
  }
}

export function getGeometryIdForModel(flattenedModel, { variantRotationX = 0, variantRotationY = 0 } = {}) {
  const cleanSuffix = flattenedModel.id
    .replace(/^[a-z0-9_.-]+:/iu, '')
    .replace(/^block\//iu, '')
    .replace(/[^a-z0-9_]/giu, '_');
  const rotSuffix = (variantRotationX || variantRotationY)
    ? `_rx${((variantRotationX % 360) + 360) % 360}_ry${((variantRotationY % 360) + 360) % 360}`
    : '';
  return `geometry.betterend.${cleanSuffix}${rotSuffix}`;
}

export function convertModelToBedrockGeometry(flattenedModel, {
  geometryIdentifier = null,
  variantRotationX = 0,
  variantRotationY = 0,
  boneName = 'block',
} = {}) {
  const cleanSuffix = flattenedModel.id
    .replace(/^[a-z0-9_.-]+:/iu, '')
    .replace(/^block\//iu, '')
    .replace(/[^a-z0-9_]/giu, '_');
  const identifier = geometryIdentifier ?? getGeometryIdForModel(flattenedModel, { variantRotationX, variantRotationY });

  if (flattenedModel.geometryKind === 'cross' && flattenedModel.elements.length === 0) {
    return {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: {
            identifier,
            texture_width: 16,
            texture_height: 16,
            visible_bounds_width: 2,
            visible_bounds_height: 2,
            visible_bounds_offset: [0, 0.5, 0],
          },
          bones: [
            {
              name: 'cross_a',
              pivot: [0, 8, 0],
              rotation: [0, 45, 0],
              cubes: [
                {
                  origin: [-8, 0, 0],
                  size: [16, 16, 0],
                  uv: {
                    north: { uv: [0, 0], uv_size: [16, 16], material_instance: 'cross' },
                    south: { uv: [0, 0], uv_size: [16, 16], material_instance: 'cross' },
                  },
                },
              ],
            },
            {
              name: 'cross_b',
              pivot: [0, 8, 0],
              rotation: [0, -45, 0],
              cubes: [
                {
                  origin: [-8, 0, 0],
                  size: [16, 16, 0],
                  uv: {
                    north: { uv: [0, 0], uv_size: [16, 16], material_instance: 'cross' },
                    south: { uv: [0, 0], uv_size: [16, 16], material_instance: 'cross' },
                  },
                },
              ],
            },
          ],
        },
      ],
    };
  }

  if (flattenedModel.elements.length === 0) {
    const matInst = Object.keys(flattenedModel.textures ?? {})[0] || 'particle';
    const makeBoxUv = (w, h, d) => ({
      down: { uv: [0, 0], uv_size: [w, d], material_instance: matInst },
      up: { uv: [0, 0], uv_size: [w, d], material_instance: matInst },
      north: { uv: [0, 0], uv_size: [w, h], material_instance: matInst },
      south: { uv: [0, 0], uv_size: [w, h], material_instance: matInst },
      west: { uv: [0, 0], uv_size: [d, h], material_instance: matInst },
      east: { uv: [0, 0], uv_size: [d, h], material_instance: matInst },
    });
    const fallbackCubes = cleanSuffix.endsWith('_chest')
      ? [
          { origin: [-7, 0, -7], size: [14, 14, 14], uv: makeBoxUv(14, 14, 14) },
          { origin: [-1, 7, -8], size: [2, 4, 1], uv: makeBoxUv(2, 4, 1) },
        ]
      : [{ origin: [-8, 0, -8], size: [16, 16, 16], uv: makeBoxUv(16, 16, 16) }];
    return {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: {
            identifier,
            texture_width: 16,
            texture_height: 16,
            visible_bounds_width: 2,
            visible_bounds_height: 2,
            visible_bounds_offset: [0, 0.5, 0],
          },
          bones: [
            {
              name: boneName,
              pivot: [0, 8, 0],
              rotation: [variantRotationX, variantRotationY, 0],
              cubes: fallbackCubes,
            },
          ],
        },
      ],
    };
  }

  let minX = -8;
  let maxX = 8;
  let minY = 0;
  let maxY = 16;
  let minZ = -8;
  let maxZ = 8;

  const effectiveBoneName = cleanSuffix.endsWith('_wall_post') ? 'post' : boneName;
  const rootBone = {
    name: effectiveBoneName,
    pivot: [0, 8, 0],
    rotation: [variantRotationX, variantRotationY, 0],
    cubes: [],
  };
  const childBones = [];

  for (const [idx, el] of flattenedModel.elements.entries()) {
    const [x1, y1, z1] = el.from;
    const [x2, y2, z2] = el.to;
    const origin = [8 - x2, y1, z1 - 8];
    const size = [
      Math.max(0.05, x2 - x1),
      Math.max(0.05, y2 - y1),
      Math.max(0.05, z2 - z1),
    ];

    minX = Math.min(minX, origin[0]);
    maxX = Math.max(maxX, origin[0] + size[0]);
    minY = Math.min(minY, origin[1]);
    maxY = Math.max(maxY, origin[1] + size[1]);
    minZ = Math.min(minZ, origin[2]);
    maxZ = Math.max(maxZ, origin[2] + size[2]);

    const uvFaces = Object.create(null);
    for (const [faceDir, faceDef] of Object.entries(el.faces ?? {})) {
      const [u1, v1, u2, v2] = faceDef.uv ?? defaultFaceUv(faceDir, el.from, el.to);
      uvFaces[faceDir] = {
        uv: [u1, v1],
        uv_size: [u2 - u1, v2 - v1],
        material_instance: faceDef.slot || faceDir,
      };
      if (faceDef.rotation) {
        uvFaces[faceDir].uv_rotation = faceDef.rotation;
      }
    }

    const cube = {
      origin,
      size,
      uv: uvFaces,
    };

    if (el.rotation && typeof el.rotation.angle === 'number' && el.rotation.angle !== 0) {
      const [ox, oy, oz] = el.rotation.origin ?? [8, 8, 8];
      const pivot = [8 - ox, oy, oz - 8];
      const angle = el.rotation.angle;
      const rot = [
        el.rotation.axis === 'x' ? -angle : 0,
        el.rotation.axis === 'y' ? -angle : 0,
        el.rotation.axis === 'z' ? -angle : 0,
      ];
      childBones.push({
        name: `${effectiveBoneName}_el_${idx}`,
        parent: effectiveBoneName,
        pivot,
        rotation: rot,
        cubes: [cube],
      });
    } else {
      rootBone.cubes.push(cube);
    }
  }

  // Synthesize directional arm bones for multipart walls, fences, and bars
  if (cleanSuffix.endsWith('_wall_post')) {
    const matInst = 'wall';
    const makeArmUv = () => ({
      down: { uv: [5, 0], uv_size: [6, 4], material_instance: matInst },
      up: { uv: [5, 0], uv_size: [6, 4], material_instance: matInst },
      north: { uv: [5, 2], uv_size: [6, 14], material_instance: matInst },
      south: { uv: [5, 2], uv_size: [6, 14], material_instance: matInst },
      west: { uv: [0, 2], uv_size: [4, 14], material_instance: matInst },
      east: { uv: [0, 2], uv_size: [4, 14], material_instance: matInst },
    });
    childBones.push(
      { name: 'north', pivot: [0, 8, 0], cubes: [{ origin: [-3, 0, -8], size: [6, 14, 4], uv: makeArmUv() }] },
      { name: 'south', pivot: [0, 8, 0], cubes: [{ origin: [-3, 0, 4], size: [6, 14, 4], uv: makeArmUv() }] },
      { name: 'east', pivot: [0, 8, 0], cubes: [{ origin: [4, 0, -3], size: [4, 14, 6], uv: makeArmUv() }] },
      { name: 'west', pivot: [0, 8, 0], cubes: [{ origin: [-8, 0, -3], size: [4, 14, 6], uv: makeArmUv() }] },
    );
  } else if (cleanSuffix.endsWith('_fence_post') || cleanSuffix.endsWith('_bars_post')) {
    const matInst = cleanSuffix.endsWith('_bars_post') ? 'bars' : 'texture';
    const makeRailUv = () => ({
      down: { uv: [7, 0], uv_size: [2, 6], material_instance: matInst },
      up: { uv: [7, 0], uv_size: [2, 6], material_instance: matInst },
      north: { uv: [7, 6], uv_size: [2, 9], material_instance: matInst },
      south: { uv: [7, 6], uv_size: [2, 9], material_instance: matInst },
      west: { uv: [0, 6], uv_size: [6, 9], material_instance: matInst },
      east: { uv: [0, 6], uv_size: [6, 9], material_instance: matInst },
    });
    childBones.push(
      { name: 'north', pivot: [0, 8, 0], cubes: [{ origin: [-1, 6, -8], size: [2, 9, 6], uv: makeRailUv() }] },
      { name: 'south', pivot: [0, 8, 0], cubes: [{ origin: [-1, 6, 2], size: [2, 9, 6], uv: makeRailUv() }] },
      { name: 'east', pivot: [0, 8, 0], cubes: [{ origin: [2, 6, -1], size: [6, 9, 2], uv: makeRailUv() }] },
      { name: 'west', pivot: [0, 8, 0], cubes: [{ origin: [-8, 6, -1], size: [6, 9, 2], uv: makeRailUv() }] },
    );
  }

  const bones = [rootBone, ...childBones];

  // Enforce Bedrock 1.26.40 schematic bounds:
  // 1) Must overlap interior of unit cube X in [-7.5, 7.5], Y in [0.5, 15.5], Z in [-7.5, 7.5]
  // 2) Total span on all axes (including rotated bones and any 90-deg block transformation) <= 27px (< 30px = 1 + 14/16ths)
  const computeWorstCaseBounds = () => {
    let bMinX = Infinity;
    let bMaxX = -Infinity;
    let bMinY = Infinity;
    let bMaxY = -Infinity;
    let bMinZ = Infinity;
    let bMaxZ = -Infinity;
    for (const b of bones) {
      const rot = b.rotation ?? [0, 0, 0];
      const piv = b.pivot ?? [0, 8, 0];
      const rad = rot.map(a => (a * Math.PI) / 180);
      for (const c of b.cubes ?? []) {
        const [ox, oy, oz] = c.origin;
        const [sx, sy, sz] = c.size;
        for (const sign of [1, -1]) {
          for (const dx of [0, sx]) {
            for (const dy of [0, sy]) {
              for (const dz of [0, sz]) {
                let x = ox + dx - piv[0];
                let y = oy + dy - piv[1];
                let z = oz + dz - piv[2];
                if (rad[0]) {
                  const s = sign * Math.sin(rad[0]);
                  const co = Math.cos(rad[0]);
                  const ny = y * co - z * s;
                  const nz = y * s + z * co;
                  y = ny;
                  z = nz;
                }
                if (rad[1]) {
                  const s = sign * Math.sin(rad[1]);
                  const co = Math.cos(rad[1]);
                  const nx = x * co + z * s;
                  const nz = -x * s + z * co;
                  x = nx;
                  z = nz;
                }
                if (rad[2]) {
                  const s = sign * Math.sin(rad[2]);
                  const co = Math.cos(rad[2]);
                  const nx = x * co - y * s;
                  const ny = x * s + y * co;
                  x = nx;
                  y = ny;
                }
                x += piv[0];
                y += piv[1];
                z += piv[2];
                bMinX = Math.min(bMinX, x);
                bMaxX = Math.max(bMaxX, x);
                bMinY = Math.min(bMinY, y);
                bMaxY = Math.max(bMaxY, y);
                bMinZ = Math.min(bMinZ, z);
                bMaxZ = Math.max(bMaxZ, z);
              }
            }
          }
        }
      }
    }
    return { bMinX, bMaxX, bMinY, bMaxY, bMinZ, bMaxZ };
  };

  let bounds = computeWorstCaseBounds();
  const shiftX = bounds.bMaxX < -7.5 ? -7.5 - bounds.bMaxX : bounds.bMinX > 7.5 ? 7.5 - bounds.bMinX : 0;
  const shiftY = bounds.bMaxY < 0.5 ? 0.5 - bounds.bMaxY : bounds.bMinY > 15.5 ? 15.5 - bounds.bMinY : 0;
  const shiftZ = bounds.bMaxZ < -7.5 ? -7.5 - bounds.bMaxZ : bounds.bMinZ > 7.5 ? 7.5 - bounds.bMinZ : 0;
  if (shiftX !== 0 || shiftY !== 0 || shiftZ !== 0) {
    for (const b of bones) {
      if (b.pivot) {
        b.pivot = [
          Number((b.pivot[0] + shiftX).toFixed(4)),
          Number((b.pivot[1] + shiftY).toFixed(4)),
          Number((b.pivot[2] + shiftZ).toFixed(4)),
        ];
      }
      for (const c of b.cubes ?? []) {
        c.origin = [
          Number((c.origin[0] + shiftX).toFixed(4)),
          Number((c.origin[1] + shiftY).toFixed(4)),
          Number((c.origin[2] + shiftZ).toFixed(4)),
        ];
      }
    }
    bounds = computeWorstCaseBounds();
  }

  const maxDistFromCenter = Math.max(
    Math.abs(bounds.bMinX),
    Math.abs(bounds.bMaxX),
    Math.abs(bounds.bMinY - 8),
    Math.abs(bounds.bMaxY - 8),
    Math.abs(bounds.bMinZ),
    Math.abs(bounds.bMaxZ),
  );
  if (maxDistFromCenter > 13.5 && Number.isFinite(maxDistFromCenter)) {
    const scale = 13.5 / maxDistFromCenter;
    for (const b of bones) {
      if (b.pivot) {
        b.pivot = [
          Number((b.pivot[0] * scale).toFixed(4)),
          Number((8 + (b.pivot[1] - 8) * scale).toFixed(4)),
          Number((b.pivot[2] * scale).toFixed(4)),
        ];
      }
      for (const c of b.cubes ?? []) {
        c.origin = [
          Number((c.origin[0] * scale).toFixed(4)),
          Number((8 + (c.origin[1] - 8) * scale).toFixed(4)),
          Number((c.origin[2] * scale).toFixed(4)),
        ];
        c.size = [
          Number(Math.max(0.05, c.size[0] * scale).toFixed(4)),
          Number(Math.max(0.05, c.size[1] * scale).toFixed(4)),
          Number(Math.max(0.05, c.size[2] * scale).toFixed(4)),
        ];
      }
    }
    bounds = computeWorstCaseBounds();
  }

  minX = Math.min(-8, bounds.bMinX);
  maxX = Math.max(8, bounds.bMaxX);
  minY = Math.min(0, bounds.bMinY);
  maxY = Math.max(16, bounds.bMaxY);
  minZ = Math.min(-8, bounds.bMinZ);
  maxZ = Math.max(8, bounds.bMaxZ);

  const boundsWidth = Math.max(2, Math.ceil(Math.max(maxX - minX, maxZ - minZ) / 16) + 1);
  const boundsHeight = Math.max(2, Math.ceil((maxY - minY) / 16) + 1);

  return {
    format_version: '1.12.0',
    'minecraft:geometry': [
      {
        description: {
          identifier,
          texture_width: 16,
          texture_height: 16,
          visible_bounds_width: boundsWidth,
          visible_bounds_height: boundsHeight,
          visible_bounds_offset: [0, Number(((minY + maxY) / 32).toFixed(3)), 0],
        },
        bones,
      },
    ],
  };
}

export function flattenBlockstateDefinition(blockId, blockstateJson, index) {
  const normBlockId = normalizeModelId(blockId);
  const variants = [];
  const multipartRules = [];
  const referencedModels = new Set();

  if (blockstateJson.variants && typeof blockstateJson.variants === 'object') {
    for (const [stateKeyStr, rawEntry] of Object.entries(blockstateJson.variants)) {
      const entries = Array.isArray(rawEntry) ? rawEntry : [rawEntry];
      const primary = entries[0];
      const modelId = normalizeModelId(primary.model);
      referencedModels.add(modelId);
      const flattened = flattenModel(modelId, index);
      variants.push({
        statePredicate: stateKeyStr,
        modelId,
        x: primary.x ?? 0,
        y: primary.y ?? 0,
        uvlock: Boolean(primary.uvlock),
        weightCount: entries.length,
        flattened,
      });
    }
  }

  if (Array.isArray(blockstateJson.multipart)) {
    for (const [partIdx, rule] of blockstateJson.multipart.entries()) {
      const applyEntries = Array.isArray(rule.apply) ? rule.apply : [rule.apply];
      const primary = applyEntries[0];
      const modelId = normalizeModelId(primary.model);
      referencedModels.add(modelId);
      const flattened = flattenModel(modelId, index);
      multipartRules.push({
        partIndex: partIdx,
        when: rule.when ?? null,
        modelId,
        x: primary.x ?? 0,
        y: primary.y ?? 0,
        uvlock: Boolean(primary.uvlock),
        flattened,
      });
    }
  }

  return {
    id: normBlockId,
    isMultipart: multipartRules.length > 0,
    variants,
    multipartRules,
    referencedModels: [...referencedModels].sort(compareText),
  };
}

export function intColorToHex(colorValue, fallback = '#000000') {
  if (typeof colorValue === 'string' && colorValue.startsWith('#')) {
    return colorValue.toLowerCase();
  }
  if (typeof colorValue === 'number' && Number.isFinite(colorValue)) {
    return `#${(colorValue & 0xffffff).toString(16).padStart(6, '0').toLowerCase()}`;
  }
  return fallback;
}

export function buildRegionVisualPresets(registrations) {
  const biomesClient = { biomes: Object.create(null) };
  const fogs = new Map();
  const lighting = new Map();
  const atmospherics = new Map();
  const colorGrading = new Map();
  const water = new Map();

  for (const biome of registrations.biomes ?? []) {
    const shortName = biome.id.split(':')[1];
    const runtime = biome.runtime ?? {};
    const attrs = runtime.attributes ?? {};
    const effects = runtime.effects ?? {};
    const biomeDataRes = (biome.resources ?? []).find(r => r.category === 'wover/worldgen/biome_data')?.value ?? {};
    const fogDensity = Number(biomeDataRes.fogDensity ?? 1.0);

    const fogColor = intColorToHex(attrs['minecraft:visual/fog_color'] ?? effects.fog_color, '#0a0812');
    const waterColor = intColorToHex(effects.water_color, '#3f76e4');
    const waterFogColor = intColorToHex(attrs['minecraft:visual/water_fog_color'] ?? effects.water_fog_color, '#050533');
    const skyColor = intColorToHex(attrs['minecraft:visual/sky_color'] ?? effects.sky_color, '#000000');

    const fogId = `betterend:fog_${shortName}`;
    const waterId = `betterend:water_${shortName}`;
    const lightingId = `betterend:lighting_${shortName}`;
    const atmoId = `betterend:atmo_${shortName}`;
    const gradingId = `betterend:grading_${shortName}`;

    const clientBiomeEntry = {
      water_surface_color: waterColor,
      water_surface_transparency: 0.65,
      water_fog_color: waterFogColor,
      water_fog_distance: 24,
      fog_identifier: fogId,
    };
    biomesClient.biomes[shortName] = clientBiomeEntry;
    biomesClient.biomes[`betterend:${shortName}`] = clientBiomeEntry;

    const fogEnd = Math.max(24, Math.round(160 / Math.max(0.5, fogDensity)));
    const fogStart = Math.max(4, Math.round(fogEnd * 0.25));

    fogs.set(`fogs/${shortName}.json`, {
      format_version: '1.16.100',
      'minecraft:fog_settings': {
        description: { identifier: fogId },
        distance: {
          air: {
            fog_start: fogStart,
            fog_end: fogEnd,
            fog_color: fogColor,
            render_distance_type: 'fixed',
          },
          water: {
            fog_start: 2,
            fog_end: 24,
            fog_color: waterFogColor,
            render_distance_type: 'fixed',
          },
        },
      },
    });

    lighting.set(`lighting/${shortName}.json`, {
      format_version: '1.26.20',
      'minecraft:lighting_settings': {
        description: { identifier: lightingId },
        ambient: {
          color: fogColor,
          illuminance: 0.18,
        },
        end_flash: {
          color: fogColor,
          illuminance: 1.25,
        },
      },
    });

    atmospherics.set(`atmospherics/${shortName}.json`, {
      format_version: '1.26.20',
      'minecraft:atmosphere_settings': {
        description: { identifier: atmoId },
        sky_zenith_color: skyColor,
        sky_horizon_color: fogColor,
        horizon_blend_min: 0.05,
        horizon_blend_max: 0.45,
        rayleigh_strength: 0.25,
      },
    });

    colorGrading.set(`color_grading/${shortName}.json`, {
      format_version: '1.26.20',
      'minecraft:color_grading_settings': {
        description: { identifier: gradingId },
        tone_mapping: {
          operator: 'aces',
        },
        midtones: {
          saturation: [1.04, 1.04, 1.04],
          contrast: [1.02, 1.02, 1.02],
          gain: [1.0, 1.0, 1.0],
          gamma: [1.0, 1.0, 1.0],
          offset: [0.0, 0.0, 0.0],
        },
      },
    });

    // 26.40-safe 1.26.20 water schema: explicitly omits removed sampleWidth property (§10.3 [R38])
    water.set(`water/${shortName}.json`, {
      format_version: '1.26.20',
      'minecraft:water_settings': {
        description: { identifier: waterId },
        surface_color: waterColor,
        deep_color: waterFogColor,
        waves: {
          enabled: true,
          choppiness: 0.35,
          speed: 1.0,
        },
        caustics: {
          enabled: true,
          power: 1.0,
        },
      },
    });
  }

  return { biomesClient, fogs, lighting, atmospherics, colorGrading, water };
}

export function buildLocalLightingJson(repoRoot = defaultRepoRoot) {
  const lightColorsPath = path.resolve(repoRoot, 'src/main/resources/assets/colored_lights/light_colors.json');
  const blockLightColors = Object.create(null);

  if (existsSync(lightColorsPath)) {
    const rawText = readFileSync(lightColorsPath, 'utf8');
    // Parse key-value pairs while deterministically deduplicating the two identical duplicate keys
    // documented in asset-reference-investigation.md (smaragdant_crystal_shard & umbrella_tree_cluster).
    for (const match of rawText.matchAll(/"([^"]+)"\s*:\s*"(#[0-9a-fA-F]{6})"/gu)) {
      const [, blockId, hexColor] = match;
      if (blockLightColors[blockId] && blockLightColors[blockId] !== hexColor.toLowerCase()) {
        throw new Error(`Conflicting duplicate colored_lights entry for ${blockId}`);
      }
      blockLightColors[blockId] = hexColor.toLowerCase();
    }
  }

  blockLightColors['betterend:end_stone_smelter'] ??= '#ff9436';
  blockLightColors['betterend:hydrothermal_vent'] ??= '#65c8ff';

  const mappedLights = Object.fromEntries(
    Object.entries(blockLightColors)
      .sort(([a], [b]) => compareText(a, b))
      .map(([blockId, color]) => [blockId, { light_color: color }]),
  );

  return {
    format_version: '1.26.20',
    'minecraft:local_lighting': {
      static_block_lights: mappedLights,
    },
    'minecraft:local_lighting_settings': {
      block_light_colors: mappedLights,
    },
  };
}

export function buildSoundDefinitions(repoRoot = defaultRepoRoot) {
  const soundsJsonPath = path.resolve(repoRoot, 'src/main/resources/assets/betterend/sounds.json');
  const musicDistPath = path.resolve(repoRoot, 'bedrock/upstream/music-distribution.json');
  const rawSounds = JSON.parse(readFileSync(soundsJsonPath, 'utf8'));
  const musicDist = JSON.parse(readFileSync(musicDistPath, 'utf8'));
  const recoveredTracks = new Map((musicDist.tracks ?? []).map(t => [t.id, t]));

  const soundDefinitions = Object.create(null);
  for (const [eventKey, def] of Object.entries(rawSounds).sort(([a], [b]) => compareText(a, b))) {
    const bedrockEventKey = eventKey.startsWith('betterend.') ? eventKey : `betterend.${eventKey}`;
    const isMusic = eventKey.includes('music') || eventKey.includes('record');
    const isAmbient = eventKey.includes('ambient');
    const category = isMusic ? 'music' : isAmbient ? 'ambient' : 'neutral';

    const sounds = (def.sounds ?? []).map(entry => {
      const rawName = typeof entry === 'string' ? entry : entry.name;
      const stream = typeof entry === 'object' ? Boolean(entry.stream) : isMusic || isAmbient;
      const [ns, rel] = rawName.includes(':') ? rawName.split(':') : ['minecraft', rawName];
      const soundPath = `sounds/${ns}/${rel}`;
      const trackInfo = recoveredTracks.get(`${ns}:${rel.replace(/^music\//u, '')}`);
      return {
        name: soundPath,
        stream,
        volume: 1.0,
        pitch: 1.0,
        ...(trackInfo ? { __provenance: { sha256: trackInfo.sha256, artistCredit: trackInfo.artistCredit, distributionAudit: trackInfo.distributionAudit } } : {}),
      };
    });

    soundDefinitions[bedrockEventKey] = {
      category,
      sounds,
    };
  }

  return {
    format_version: '1.20.20',
    sound_definitions: soundDefinitions,
  };
}

export function buildLocalizationFiles(repoRoot = defaultRepoRoot, provenance = null) {
  const enUsPath = path.resolve(repoRoot, 'src/main/resources/assets/betterend/lang/en_us.json');
  const enUsJson = JSON.parse(readFileSync(enUsPath, 'utf8'));

  const restrictedAssets = [];
  if (provenance?.assets) {
    for (const asset of provenance.assets) {
      if (asset.declaredLicense?.spdx === 'CC-BY-NC-SA-4.0') {
        restrictedAssets.push({
          sourcePath: asset.source.path,
          spdx: asset.declaredLicense.spdx,
          attribution: asset.declaredLicense.attribution,
          obligations: asset.declaredLicense.obligations,
        });
      }
    }
  }

  const lines = [
    '## BetterEnd Bedrock 26.40 Localization (en_US)',
    '## Source license: MIT (Copyright (c) 2020 paulevsGitch); CC-BY-NC-SA-4.0 assets isolated per LICENSE.ASSETS',
  ];

  for (const [key, value] of Object.entries(enUsJson).sort(([a], [b]) => compareText(a, b))) {
    const cleanVal = String(value).replace(/\r?\n/gu, ' ');
    lines.push(`${key}=${cleanVal}`);
    if (key.startsWith('block.betterend.')) {
      const shortId = key.slice('block.betterend.'.length);
      lines.push(`tile.betterend:${shortId}.name=${cleanVal}`);
    } else if (key.startsWith('item.betterend.')) {
      const shortId = key.slice('item.betterend.'.length);
      lines.push(`item.betterend:${shortId}.name=${cleanVal}`);
    } else if (key.startsWith('entity.betterend.')) {
      const shortId = key.slice('entity.betterend.'.length);
      lines.push(`entity.betterend:${shortId}.name=${cleanVal}`);
    }
  }

  return {
    enUsLang: `${lines.join('\n')}\n`,
    languagesJson: ['en_US'],
    restrictedAssets,
  };
}

export async function compileAllModelsAndAssets({ repoRoot = defaultRepoRoot } = {}) {
  const index = await loadModelIndex(repoRoot);
  const provenance = JSON.parse(readFileSync(path.resolve(repoRoot, 'bedrock/upstream/asset-provenance.json'), 'utf8'));
  const registrations = JSON.parse(readFileSync(path.resolve(repoRoot, 'bedrock/catalogue/generated/registrations.json'), 'utf8'));

  const flattenedModels = new Map();
  for (const modelId of [...index.models.keys()].sort(compareText)) {
    flattenedModels.set(modelId, flattenModel(modelId, index));
  }

  const flattenedPatterns = new Map();
  for (const patternId of [...index.patterns.keys()].sort(compareText)) {
    flattenedPatterns.set(patternId, flattenModel(patternId, index));
  }

  const flattenedBlockstates = new Map();
  for (const [blockId, bsJson] of [...index.blockstates.entries()].sort(([a], [b]) => compareText(a, b))) {
    flattenedBlockstates.set(blockId, flattenBlockstateDefinition(blockId, bsJson, index));
  }

  const geometries = new Map();
  for (const [modelId, flat] of flattenedModels) {
    if (!modelId.startsWith('betterend:block/')) continue;
    if (flat.geometryKind === 'custom' || flat.geometryKind === 'cross') {
      const geo = convertModelToBedrockGeometry(flat);
      const geoId = geo['minecraft:geometry'][0].description.identifier;
      geometries.set(geoId, geo);
    }
  }
  for (const [, bsDef] of flattenedBlockstates) {
    for (const choice of [...(bsDef.variants ?? []), ...(bsDef.multipartRules ?? [])]) {
      const flat = choice.flattened;
      if (flat && (flat.geometryKind === 'custom' || flat.geometryKind === 'cross')) {
        const geo = convertModelToBedrockGeometry(flat);
        const geoId = geo['minecraft:geometry'][0].description.identifier;
        if (!geometries.has(geoId)) {
          geometries.set(geoId, geo);
        }
      }
    }
  }

  // Synthesize multi-face + inner-core translucent crystal geometry for betterend:aurora_crystal
  const makeCrystalFaceUv = () => ({
    down: { uv: [0, 0], uv_size: [16, 16], material_instance: 'down' },
    up: { uv: [0, 0], uv_size: [16, 16], material_instance: 'up' },
    north: { uv: [0, 0], uv_size: [16, 16], material_instance: 'north' },
    south: { uv: [0, 0], uv_size: [16, 16], material_instance: 'south' },
    west: { uv: [0, 0], uv_size: [16, 16], material_instance: 'west' },
    east: { uv: [0, 0], uv_size: [16, 16], material_instance: 'east' },
  });
  const makeCoreFaceUv = () => ({
    down: { uv: [2, 2], uv_size: [12, 12], material_instance: 'up' },
    up: { uv: [2, 2], uv_size: [12, 12], material_instance: 'down' },
    north: { uv: [2, 2], uv_size: [12, 12], material_instance: 'east' },
    south: { uv: [2, 2], uv_size: [12, 12], material_instance: 'west' },
    west: { uv: [2, 2], uv_size: [12, 12], material_instance: 'north' },
    east: { uv: [2, 2], uv_size: [12, 12], material_instance: 'south' },
  });
  geometries.set('geometry.betterend.aurora_crystal', {
    format_version: '1.12.0',
    'minecraft:geometry': [
      {
        description: {
          identifier: 'geometry.betterend.aurora_crystal',
          texture_width: 16,
          texture_height: 16,
          visible_bounds_width: 2,
          visible_bounds_height: 2,
          visible_bounds_offset: [0, 0.5, 0],
        },
        bones: [
          {
            name: 'block',
            pivot: [0, 8, 0],
            rotation: [0, 0, 0],
            cubes: [
              {
                origin: [-8, 0, -8],
                size: [16, 16, 16],
                uv: makeCrystalFaceUv(),
              },
            ],
          },
          {
            name: 'core',
            parent: 'block',
            pivot: [0, 8, 0],
            rotation: [22.5, 45, 0],
            cubes: [
              {
                origin: [-4.5, 3.5, -4.5],
                size: [9, 9, 9],
                uv: makeCoreFaceUv(),
              },
            ],
          },
        ],
      },
    ],
  });

  // Build terrain_texture.json and item_texture.json
  const terrainTextureData = Object.create(null);
  const itemTextureData = Object.create(null);
  const textureSets = new Map();

  for (const asset of provenance.assets) {
    if (asset.kind !== 'texture' || asset.namespace !== 'betterend') continue;
    const rel = asset.resourcePath.slice('betterend/textures/'.length, -4);
    if (rel.endsWith('_e') || rel.endsWith('_s') || rel.endsWith('_n')) continue;

    if (rel.startsWith('block/')) {
      const shortName = rel.slice('block/'.length);
      const key = `betterend_${shortName}`;
      const texPath = `textures/blocks/betterend/${shortName}`;
      terrainTextureData[key] = { textures: texPath };
      textureSets.set(
        `${texPath}.texture_set.json`,
        buildTextureSetJson(shortName, { isItem: false }),
      );
    } else if (rel.startsWith('item/')) {
      const shortName = rel.slice('item/'.length);
      const key = `betterend_${shortName}`;
      const texPath = `textures/items/betterend/${shortName}`;
      itemTextureData[key] = { textures: texPath };
      textureSets.set(
        `${texPath}.texture_set.json`,
        buildTextureSetJson(shortName, { isItem: true }),
      );
    }
  }

  // Ensure every registered item has a resolved icon entry in item_texture.json
  for (const item of registrations.items ?? []) {
    const shortName = item.id.split(':')[1];
    const key = `betterend_${shortName}`;
    if (itemTextureData[key]) continue;

    const itemDef = index.itemDefinitions.get(item.id);
    const modelNode = itemDef?.model;
    const rawModelId =
      modelNode?.model ??
      modelNode?.on_false?.model ??
      modelNode?.cases?.[0]?.model?.model ??
      modelNode?.fallback?.model ??
      `betterend:item/${shortName}`;
    const flatModel =
      flattenedModels.get(normalizeModelId(rawModelId)) ??
      flattenedModels.get(`betterend:block/${shortName}`);

    let resolvedTexPath = `textures/items/betterend/${shortName}`;
    if (flatModel && flatModel.textures) {
      const texVals = [
        flatModel.textures.layer0,
        flatModel.textures.all,
        flatModel.textures.top,
        flatModel.textures.side,
        flatModel.textures.front,
        flatModel.textures.texture,
        flatModel.textures.particle,
        ...Object.values(flatModel.textures),
      ].filter(v => typeof v === 'string' && !v.startsWith('#'));
      if (texVals.length > 0) {
        const firstTex = texVals[0];
        if (firstTex.startsWith('betterend:item/')) {
          resolvedTexPath = `textures/items/betterend/${firstTex.slice('betterend:item/'.length)}`;
        } else if (firstTex.startsWith('betterend:block/')) {
          resolvedTexPath = `textures/blocks/betterend/${firstTex.slice('betterend:block/'.length)}`;
        } else if (firstTex.startsWith('minecraft:item/')) {
          resolvedTexPath = `textures/items/${firstTex.slice('minecraft:item/'.length)}`;
        } else if (firstTex.startsWith('minecraft:block/')) {
          const vanillaBlockTex = firstTex.slice('minecraft:block/'.length);
          const aliasMap = {
            polished_andesite: 'textures/blocks/stone_andesite_smooth',
            polished_diorite: 'textures/blocks/stone_diorite_smooth',
            polished_granite: 'textures/blocks/stone_granite_smooth',
            purpur_pillar_top: 'textures/blocks/purpur_pillar_top',
            purpur_block: 'textures/blocks/purpur_block',
            purpur_pillar_side: 'textures/blocks/purpur_pillar',
            quartz_pillar_top: 'textures/blocks/quartz_block_lines_top',
            quartz_block_bottom: 'textures/blocks/quartz_block_bottom',
            quartz_block_side: 'textures/blocks/quartz_block_side',
            quartz_pillar_side: 'textures/blocks/quartz_block_lines',
            end_stone: 'textures/blocks/end_stone',
            obsidian: 'textures/blocks/obsidian',
            water_still: 'textures/blocks/water_still_grey',
            composter_compost: 'textures/blocks/composter_compost',
            composter_ready: 'textures/blocks/composter_ready',
            ladder: 'textures/blocks/ladder',
            black_wool: 'textures/blocks/wool_colored_black',
            brown_wool: 'textures/blocks/wool_colored_brown',
            cyan_wool: 'textures/blocks/wool_colored_cyan',
            gray_wool: 'textures/blocks/wool_colored_gray',
            light_blue_wool: 'textures/blocks/wool_colored_light_blue',
            magenta_wool: 'textures/blocks/wool_colored_magenta',
            pink_wool: 'textures/blocks/wool_colored_pink',
            purple_wool: 'textures/blocks/wool_colored_purple',
            white_wool: 'textures/blocks/wool_colored_white',
          };
          resolvedTexPath = aliasMap[vanillaBlockTex] ?? `textures/blocks/${vanillaBlockTex}`;
        }
      }
    }
    itemTextureData[key] = { textures: resolvedTexPath };
  }

  // Register namespaced vanilla terrain texture aliases referenced by BetterEnd block models
  // (using betterend_mc_* keys so vanilla terrain_texture.json keys like purpur_block are never overwritten)
  const vanillaTerrainAliases = {
    polished_andesite: 'textures/blocks/stone_andesite_smooth',
    polished_diorite: 'textures/blocks/stone_diorite_smooth',
    polished_granite: 'textures/blocks/stone_granite_smooth',
    purpur_pillar_top: 'textures/blocks/purpur_pillar_top',
    purpur_block: 'textures/blocks/purpur_block',
    purpur_pillar_side: 'textures/blocks/purpur_pillar',
    quartz_pillar_top: 'textures/blocks/quartz_block_lines_top',
    quartz_block_bottom: 'textures/blocks/quartz_block_bottom',
    quartz_block_side: 'textures/blocks/quartz_block_side',
    quartz_pillar_side: 'textures/blocks/quartz_block_lines',
    end_stone: 'textures/blocks/end_stone',
    obsidian: 'textures/blocks/obsidian',
    water_still: 'textures/blocks/water_still_grey',
    composter_compost: 'textures/blocks/composter_compost',
    composter_ready: 'textures/blocks/composter_ready',
    ladder: 'textures/blocks/ladder',
    black_wool: 'textures/blocks/wool_colored_black',
    brown_wool: 'textures/blocks/wool_colored_brown',
    cyan_wool: 'textures/blocks/wool_colored_cyan',
    gray_wool: 'textures/blocks/wool_colored_gray',
    light_blue_wool: 'textures/blocks/wool_colored_light_blue',
    magenta_wool: 'textures/blocks/wool_colored_magenta',
    pink_wool: 'textures/blocks/wool_colored_pink',
    purple_wool: 'textures/blocks/wool_colored_purple',
    white_wool: 'textures/blocks/wool_colored_white',
  };
  for (const [aliasKey, aliasPath] of Object.entries(vanillaTerrainAliases)) {
    terrainTextureData[`betterend_mc_${aliasKey}`] = { textures: aliasPath };
  }

  // Register pre-baked tint variations in terrain_texture.json
  for (let i = 0; i < AURORA_PALETTE.length; i += 1) {
    terrainTextureData[`betterend_aurora_crystal_tint_${i}`] = {
      textures: `textures/blocks/betterend/tinted/aurora_crystal_${i}`,
    };
  }
  for (let i = 0; i < TENANEA_PALETTE.length; i += 1) {
    terrainTextureData[`betterend_tenanea_flowers_tint_${i}`] = {
      textures: `textures/blocks/betterend/tinted/tenanea_flowers_${i}`,
    };
  }
  for (let i = 0; i < HELIX_LEAVES_GRADIENT.length; i += 1) {
    terrainTextureData[`betterend_helix_tree_leaves_color_${i}`] = {
      textures: `textures/blocks/betterend/tinted/helix_tree_leaves_${i}`,
    };
    terrainTextureData[`betterend_jellyshroom_cap_color_${i}`] = {
      textures: `textures/blocks/betterend/tinted/jellyshroom_cap_${i}`,
    };
  }
  for (const colorName of Object.keys(HYDRALUX_PETAL_COLORS)) {
    terrainTextureData[`betterend_hydralux_petal_block_${colorName}`] = {
      textures: `textures/blocks/betterend/tinted/hydralux_petal_block_${colorName}`,
    };
  }
  for (const colorName of Object.keys(BULB_LANTERN_COLORS)) {
    terrainTextureData[`betterend_bulb_vine_lantern_bulb_${colorName}`] = {
      textures: `textures/blocks/betterend/tinted/bulb_vine_lantern_bulb_${colorName}`,
    };
  }

  const terrainTextureJson = {
    resource_pack_name: 'betterend',
    texture_name: 'atlas.terrain',
    padding: 8,
    num_mip_levels: 4,
    texture_data: terrainTextureData,
  };

  const itemTextureJson = {
    resource_pack_name: 'betterend',
    texture_name: 'atlas.items',
    texture_data: itemTextureData,
  };

  const VALID_BEDROCK_BLOCK_SOUNDS = new Set([
    'stone', 'wood', 'gravel', 'grass', 'metal', 'glass', 'cloth', 'sand',
    'snow', 'ladder', 'anvil', 'slime', 'fungus', 'stem', 'nylium', 'roots',
    'shroomlight', 'amethyst_block', 'lantern', 'chain', 'copper', 'sculk',
    'netherrack', 'bone_block', 'wart_block', 'netherite', 'coral',
  ]);
  const SOUND_REMAP = {
    netherite_block: 'netherite',
    shelf_mushroom: 'wood',
    'path:block.stone.break': 'grass',
    lily_pad: 'grass',
    vine: 'grass',
    wet_grass: 'grass',
    crop: 'grass',
    bamboo: 'wood',
    bamboo_sapling: 'wood',
    wool: 'cloth',
    honey_block: 'slime',
    scaffolding: 'ladder',
    sweet_berry_bush: 'grass',
    weeping_vines: 'roots',
    twisting_vines: 'roots',
    NETHER_WART: 'wart_block',
    nether_wart: 'wart_block',
  };

  const blocksJson = {
    format_version: [1, 1, 0],
  };
  for (const block of registrations.blocks ?? []) {
    const rawSound = (block.properties?.sound ?? 'stone').toLowerCase();
    const mapped = SOUND_REMAP[rawSound] ?? rawSound;
    const sound = VALID_BEDROCK_BLOCK_SOUNDS.has(mapped) ? mapped : 'stone';
    blocksJson[block.id] = {
      sound,
    };
  }

  const visualPresets = buildRegionVisualPresets(registrations);
  const localLightingJson = buildLocalLightingJson(repoRoot);
  const soundDefinitionsJson = buildSoundDefinitions(repoRoot);
  const localization = buildLocalizationFiles(repoRoot, provenance);

  return {
    counts: {
      blockstates: flattenedBlockstates.size,
      betterendModels: [...flattenedModels.keys()].filter(k => k.startsWith('betterend:')).length,
      patterns: flattenedPatterns.size,
      externalParents: Object.keys(EXTERNAL_PARENT_TEMPLATES).length,
      geometries: geometries.size,
      terrainTextures: Object.keys(terrainTextureData).length,
      itemTextures: Object.keys(itemTextureData).length,
      textureSets: textureSets.size,
      regions: visualPresets.fogs.size,
    },
    index,
    flattenedModels,
    flattenedPatterns,
    flattenedBlockstates,
    geometries,
    terrainTextureJson,
    itemTextureJson,
    blocksJson,
    textureSets,
    visualPresets,
    localLightingJson,
    soundDefinitionsJson,
    localization,
  };
}
