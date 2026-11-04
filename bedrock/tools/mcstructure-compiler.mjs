import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { generateBetterEndFeatureVoxels } from '../runtime/generation/betterend-sdf.js';
import { compareText } from './source-files.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, '../..');

const BEDROCK_BLOCK_PALETTE_VERSION = 18168865;

const VANILLA_JAVA_TO_BEDROCK_BLOCK_MAP = Object.freeze({
  'minecraft:end_stone_bricks': 'minecraft:end_bricks',
  'minecraft:end_stone_brick_stairs': 'minecraft:end_brick_stairs',
  'minecraft:shulker_box': 'minecraft:undyed_shulker_box',
  'minecraft:water_cauldron': 'minecraft:cauldron',
  'minecraft:potted_blue_orchid': 'minecraft:flower_pot',
  'minecraft:potted_lily_of_the_valley': 'minecraft:flower_pot',
  'minecraft:black_wall_banner': 'minecraft:wall_banner',
  'minecraft:jigsaw': 'minecraft:end_bricks',
});

/**
 * Parses a GZIP-compressed or raw Big-Endian Java NBT buffer into a JS object.
 */
export function parseJavaNbt(rawBuffer) {
  const buf =
    rawBuffer.length >= 2 && rawBuffer[0] === 0x1f && rawBuffer[1] === 0x8b
      ? zlib.gunzipSync(rawBuffer)
      : rawBuffer;
  let off = 0;

  const readU8 = () => buf.readUInt8(off++);
  const readI8 = () => buf.readInt8(off++);
  const readI16 = () => {
    const v = buf.readInt16BE(off);
    off += 2;
    return v;
  };
  const readU16 = () => {
    const v = buf.readUInt16BE(off);
    off += 2;
    return v;
  };
  const readI32 = () => {
    const v = buf.readInt32BE(off);
    off += 4;
    return v;
  };
  const readI64 = () => {
    const v = buf.readBigInt64BE(off);
    off += 8;
    return v;
  };
  const readF32 = () => {
    const v = buf.readFloatBE(off);
    off += 4;
    return v;
  };
  const readF64 = () => {
    const v = buf.readDoubleBE(off);
    off += 8;
    return v;
  };
  const readStr = () => {
    const len = readU16();
    const s = buf.toString('utf8', off, off + len);
    off += len;
    return s;
  };

  function readPayload(tagType) {
    switch (tagType) {
      case 1:
        return readI8();
      case 2:
        return readI16();
      case 3:
        return readI32();
      case 4:
        return readI64();
      case 5:
        return readF32();
      case 6:
        return readF64();
      case 7: {
        const n = readI32();
        const a = new Array(n);
        for (let i = 0; i < n; i += 1) a[i] = readI8();
        return a;
      }
      case 8:
        return readStr();
      case 9: {
        const lt = readU8();
        const n = readI32();
        const a = new Array(n);
        for (let i = 0; i < n; i += 1) a[i] = readPayload(lt);
        return a;
      }
      case 10: {
        const o = Object.create(null);
        while (true) {
          const ct = readU8();
          if (ct === 0) break;
          const k = readStr();
          o[k] = readPayload(ct);
        }
        return o;
      }
      case 11: {
        const n = readI32();
        const a = new Array(n);
        for (let i = 0; i < n; i += 1) a[i] = readI32();
        return a;
      }
      case 12: {
        const n = readI32();
        const a = new Array(n);
        for (let i = 0; i < n; i += 1) a[i] = readI64();
        return a;
      }
      default:
        throw new Error(`Unsupported Java NBT tag type: ${tagType}`);
    }
  }

  const rootType = readU8();
  readStr();
  return readPayload(rootType);
}

class LeNbtWriter {
  constructor(initialCapacity = 16384) {
    this.buf = Buffer.allocUnsafe(initialCapacity);
    this.off = 0;
  }

  ensure(bytes) {
    if (this.off + bytes <= this.buf.length) return;
    let nextLen = this.buf.length * 2;
    while (nextLen < this.off + bytes) nextLen *= 2;
    const next = Buffer.allocUnsafe(nextLen);
    this.buf.copy(next, 0, 0, this.off);
    this.buf = next;
  }

  writeU8(v) {
    this.ensure(1);
    this.buf.writeUInt8(v & 0xff, this.off);
    this.off += 1;
  }

  writeI8(v) {
    this.ensure(1);
    this.buf.writeInt8(v, this.off);
    this.off += 1;
  }

  writeU16(v) {
    this.ensure(2);
    this.buf.writeUInt16LE(v & 0xffff, this.off);
    this.off += 2;
  }

  writeI32(v) {
    this.ensure(4);
    this.buf.writeInt32LE(v | 0, this.off);
    this.off += 4;
  }

  writeString(str) {
    const strBytes = Buffer.from(String(str), 'utf8');
    this.writeU16(strBytes.length);
    this.ensure(strBytes.length);
    strBytes.copy(this.buf, this.off);
    this.off += strBytes.length;
  }

  writeTagHeader(tagType, name) {
    this.writeU8(tagType);
    this.writeString(name);
  }

  toBuffer() {
    return this.buf.subarray(0, this.off);
  }
}

/**
 * Serializes a Bedrock `.mcstructure` binary buffer (Little-Endian NBT, format_version 1).
 */
export function serializeMcStructure({ size, layer0Indices, blockPalette, origin = [0, 0, 0] }) {
  const [sizeX, sizeY, sizeZ] = size;
  const totalVoxels = sizeX * sizeY * sizeZ;
  const writer = new LeNbtWriter(Math.max(4096, totalVoxels * 8 + blockPalette.length * 128));

  // Root Compound ""
  writer.writeTagHeader(10, '');

  // format_version: 1
  writer.writeTagHeader(3, 'format_version');
  writer.writeI32(1);

  // size: [sizeX, sizeY, sizeZ]
  writer.writeTagHeader(9, 'size');
  writer.writeU8(3); // TAG_Int
  writer.writeI32(3);
  writer.writeI32(sizeX);
  writer.writeI32(sizeY);
  writer.writeI32(sizeZ);

  // structure: Compound
  writer.writeTagHeader(10, 'structure');

  // block_indices: List of 2 Lists of TAG_Int
  writer.writeTagHeader(9, 'block_indices');
  writer.writeU8(9); // inner elements are TAG_List
  writer.writeI32(2);

  // Layer 0
  writer.writeU8(3); // TAG_Int
  writer.writeI32(totalVoxels);
  for (let i = 0; i < totalVoxels; i += 1) {
    writer.writeI32(layer0Indices[i]);
  }

  // Layer 1 (all -1)
  writer.writeU8(3); // TAG_Int
  writer.writeI32(totalVoxels);
  for (let i = 0; i < totalVoxels; i += 1) {
    writer.writeI32(-1);
  }

  // entities: empty List
  writer.writeTagHeader(9, 'entities');
  writer.writeU8(0); // TAG_End
  writer.writeI32(0);

  // palette: Compound -> default: Compound
  writer.writeTagHeader(10, 'palette');
  writer.writeTagHeader(10, 'default');

  // block_palette: List of Compound
  writer.writeTagHeader(9, 'block_palette');
  writer.writeU8(10); // TAG_Compound
  writer.writeI32(blockPalette.length);

  for (const entry of blockPalette) {
    // name
    writer.writeTagHeader(8, 'name');
    writer.writeString(entry.name);

    // states
    writer.writeTagHeader(10, 'states');
    const stateEntries = Object.entries(entry.states ?? {}).sort(([a], [b]) => compareText(a, b));
    for (const [k, v] of stateEntries) {
      if (typeof v === 'boolean') {
        writer.writeTagHeader(1, k);
        writer.writeI8(v ? 1 : 0);
      } else if (typeof v === 'number') {
        writer.writeTagHeader(3, k);
        writer.writeI32(v);
      } else {
        writer.writeTagHeader(8, k);
        writer.writeString(String(v));
      }
    }
    writer.writeU8(0); // End of states Compound

    // version
    writer.writeTagHeader(3, 'version');
    writer.writeI32(BEDROCK_BLOCK_PALETTE_VERSION);

    writer.writeU8(0); // End of palette entry Compound
  }

  // block_position_data: empty Compound
  writer.writeTagHeader(10, 'block_position_data');
  writer.writeU8(0);

  writer.writeU8(0); // End of default Compound
  writer.writeU8(0); // End of palette Compound
  writer.writeU8(0); // End of structure Compound

  // structure_world_origin: [originX, originY, originZ]
  writer.writeTagHeader(9, 'structure_world_origin');
  writer.writeU8(3); // TAG_Int
  writer.writeI32(3);
  writer.writeI32(origin[0] ?? 0);
  writer.writeI32(origin[1] ?? 0);
  writer.writeI32(origin[2] ?? 0);

  writer.writeU8(0); // End of Root Compound

  return writer.toBuffer();
}

/**
 * Resolves a Java block ID + properties into a Bedrock `.mcstructure` palette entry `{ name, states }`.
 */
export function resolveBedrockPaletteEntry(javaBlockId, javaProps, blocksCompiler) {
  if (!javaBlockId || javaBlockId === 'minecraft:structure_void') {
    return null;
  }
  if (
    javaBlockId === 'minecraft:air' ||
    javaBlockId === 'minecraft:cave_air' ||
    javaBlockId === 'minecraft:void_air'
  ) {
    return { name: 'minecraft:air', states: {} };
  }
  if (javaBlockId.startsWith('betterend:')) {
    const resolved = blocksCompiler.lookupBedrockState(javaBlockId, javaProps ?? {});
    if (resolved) {
      return {
        name: resolved.bedrockBlockId,
        states: resolved.bedrockStates ?? {},
      };
    }
    return {
      name: javaBlockId,
      states: {},
    };
  }
  if (javaBlockId.startsWith('minecraft:')) {
    const mapped = VANILLA_JAVA_TO_BEDROCK_BLOCK_MAP[javaBlockId] ?? javaBlockId;
    return {
      name: mapped,
      states: {},
    };
  }
  return {
    name: javaBlockId,
    states: {},
  };
}

/**
 * Converts a parsed Java `.nbt` structure object into a Bedrock `.mcstructure` binary buffer and metadata.
 */
export function convertJavaNbtToMcStructure(nbtDoc, blocksCompiler) {
  const [sizeX, sizeY, sizeZ] = nbtDoc.size ?? [1, 1, 1];
  const totalVoxels = sizeX * sizeY * sizeZ;
  const layer0Indices = new Int32Array(totalVoxels).fill(-1);

  const blockPalette = [];
  const paletteKeyToIndex = new Map();

  const getPaletteIndex = entry => {
    if (!entry) return -1;
    const stateStr = Object.entries(entry.states ?? {})
      .sort(([a], [b]) => compareText(a, b))
      .map(([k, v]) => `${k}=${typeof v}:${v}`)
      .join(',');
    const key = `${entry.name}[${stateStr}]`;
    let idx = paletteKeyToIndex.get(key);
    if (idx === undefined) {
      idx = blockPalette.length;
      blockPalette.push(entry);
      paletteKeyToIndex.set(key, idx);
    }
    return idx;
  };

  const javaPalette = (nbtDoc.palette ?? []).map(p => {
    const rawName = p.Name ?? p.id ?? 'minecraft:air';
    const rawProps = p.Properties ?? p.properties ?? {};
    return resolveBedrockPaletteEntry(rawName, rawProps, blocksCompiler);
  });

  for (const blk of nbtDoc.blocks ?? []) {
    const [x, y, z] = blk.pos ?? [0, 0, 0];
    if (x < 0 || x >= sizeX || y < 0 || y >= sizeY || z < 0 || z >= sizeZ) continue;
    let entry = javaPalette[blk.state ?? 0] ?? null;

    // Handle jigsaw final_state if present
    if (blk.nbt && typeof blk.nbt.final_state === 'string') {
      const finalStateRaw = blk.nbt.final_state.split('[')[0].trim();
      if (
        finalStateRaw === 'minecraft:air' ||
        finalStateRaw === 'minecraft:structure_void' ||
        finalStateRaw === ''
      ) {
        entry = null;
      } else {
        entry = resolveBedrockPaletteEntry(finalStateRaw, {}, blocksCompiler);
      }
    }

    if (!entry) continue;
    const flatIdx = (x * sizeY + y) * sizeZ + z;
    layer0Indices[flatIdx] = getPaletteIndex(entry);
  }

  if (blockPalette.length === 0) {
    blockPalette.push({ name: 'minecraft:air', states: {} });
  }

  const buffer = serializeMcStructure({
    size: [sizeX, sizeY, sizeZ],
    layer0Indices,
    blockPalette,
    origin: [0, 0, 0],
  });

  return {
    size: [sizeX, sizeY, sizeZ],
    originOffset: [-Math.floor(sizeX / 2), 0, -Math.floor(sizeZ / 2)],
    paletteCount: blockPalette.length,
    buffer,
  };
}

/**
 * Converts a list of procedural voxels `[{ x, y, z, blockId, props }]` (anchored around `(0, 0, 0)`)
 * into a Bedrock `.mcstructure` binary buffer and records `originOffset = [minX, minY, minZ]`
 * so placing the structure at `(worldX + minX, worldY + minY, worldZ + minZ)` puts `(0, 0, 0)` at `(worldX, worldY, worldZ)`.
 */
export function convertVoxelsToMcStructure(voxels, blocksCompiler, { maxExtent = 48 } = {}) {
  const filtered = [];
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const halfMax = Math.floor(maxExtent / 2);
  for (const v of voxels) {
    if (!v || !v.blockId) continue;
    const x = Math.round(v.x);
    const y = Math.round(v.y);
    const z = Math.round(v.z);
    if (Math.abs(x) > halfMax || Math.abs(z) > halfMax || Math.abs(y) > maxExtent) continue;
    filtered.push({ x, y, z, blockId: v.blockId, props: v.states ?? v.props ?? {} });
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (filtered.length === 0) {
    const buffer = serializeMcStructure({
      size: [1, 1, 1],
      layer0Indices: new Int32Array([-1]),
      blockPalette: [{ name: 'minecraft:air', states: {} }],
      origin: [0, 0, 0],
    });
    return {
      size: [1, 1, 1],
      originOffset: [0, 0, 0],
      paletteCount: 1,
      buffer,
    };
  }

  const sizeX = maxX - minX + 1;
  const sizeY = maxY - minY + 1;
  const sizeZ = maxZ - minZ + 1;
  const totalVoxels = sizeX * sizeY * sizeZ;
  const layer0Indices = new Int32Array(totalVoxels).fill(-1);

  const blockPalette = [];
  const paletteKeyToIndex = new Map();

  const getPaletteIndex = entry => {
    if (!entry) return -1;
    const stateStr = Object.entries(entry.states ?? {})
      .sort(([a], [b]) => compareText(a, b))
      .map(([k, v]) => `${k}=${typeof v}:${v}`)
      .join(',');
    const key = `${entry.name}[${stateStr}]`;
    let idx = paletteKeyToIndex.get(key);
    if (idx === undefined) {
      idx = blockPalette.length;
      blockPalette.push(entry);
      paletteKeyToIndex.set(key, idx);
    }
    return idx;
  };

  for (const v of filtered) {
    const entry = resolveBedrockPaletteEntry(v.blockId, v.props, blocksCompiler);
    if (!entry) continue;
    const sx = v.x - minX;
    const sy = v.y - minY;
    const sz = v.z - minZ;
    const flatIdx = (sx * sizeY + sy) * sizeZ + sz;
    layer0Indices[flatIdx] = getPaletteIndex(entry);
  }

  if (blockPalette.length === 0) {
    blockPalette.push({ name: 'minecraft:air', states: {} });
  }

  const buffer = serializeMcStructure({
    size: [sizeX, sizeY, sizeZ],
    layer0Indices,
    blockPalette,
    origin: [0, 0, 0],
  });

  return {
    size: [sizeX, sizeY, sizeZ],
    originOffset: [minX, minY, minZ],
    paletteCount: blockPalette.length,
    buffer,
  };
}

export const PROCEDURAL_FEATURE_SPECS = Object.freeze([
  // 11 BetterEnd Trees + Giant Mossy Glowshroom
  { id: 'mossy_glowshroom', variants: 8, maxExtent: 32 },
  { id: 'giant_mossy_glowshroom', variants: 4, maxExtent: 42 },
  { id: 'pythadendron_tree', variants: 3, maxExtent: 32 },
  { id: 'lacugrove', variants: 3, maxExtent: 32 },
  { id: 'dragon_tree', variants: 3, maxExtent: 32 },
  { id: 'dragon_helix_tree', variants: 2, maxExtent: 32 },
  { id: 'tenanea', variants: 5, maxExtent: 32 },
  { id: 'helix_tree', variants: 3, maxExtent: 32 },
  { id: 'umbrella_tree', variants: 3, maxExtent: 34 },
  { id: 'jellyshroom', variants: 3, maxExtent: 28 },
  { id: 'gigantic_amaranita', variants: 3, maxExtent: 28 },
  { id: 'lucernia', variants: 3, maxExtent: 32 },

  // Bushes & Medium Mushrooms
  { id: 'pythadendron_bush', variants: 2, maxExtent: 16 },
  { id: 'dragon_tree_bush', variants: 2, maxExtent: 16 },
  { id: 'cave_bush', variants: 2, maxExtent: 16 },
  { id: 'lucernia_bush', variants: 2, maxExtent: 16 },
  { id: 'tenanea_bush', variants: 2, maxExtent: 16 },
  { id: 'lumecorn', variants: 2, maxExtent: 16 },
  { id: 'large_amaranita', variants: 2, maxExtent: 16 },
  { id: 'small_amaranita', variants: 1, maxExtent: 8 },

  // Multi-block Plants & Sponges
  { id: 'lanceleaf', variants: 2, maxExtent: 12 },
  { id: 'blue_vine', variants: 2, maxExtent: 12 },
  { id: 'glow_pillar', variants: 2, maxExtent: 12 },
  { id: 'neon_cactus', variants: 2, maxExtent: 16 },
  { id: 'filalux', variants: 2, maxExtent: 12 },
  // One Java FilaluxFeature scatter invocation (r = 5..10 disc, ~13 lanterns on average, ~30 at most).
  { id: 'filalux_cluster', variants: 10, maxExtent: 26 },
  { id: 'hydralux', variants: 2, maxExtent: 12 },
  { id: 'end_lotus', variants: 2, maxExtent: 12 },
  { id: 'end_lotus_leaf', variants: 2, maxExtent: 12 },
  { id: 'end_lily', variants: 2, maxExtent: 12 },
  { id: 'menger_sponge', variants: 1, maxExtent: 12 },
  { id: 'silk_moth_nest', variants: 2, maxExtent: 12 },
  { id: 'umbrella_moss_double', variants: 2, maxExtent: 8 },
  { id: 'twisted_umbrella_moss_double', variants: 2, maxExtent: 8 },

  // 3D Crystals, Ice Stars, Spires, Arches, Geysers, Lakes, Boulders, Pillars, Floating Islands
  { id: 'big_aurora_crystal', variants: 3, maxExtent: 28 },
  { id: 'smaragdant_crystal', variants: 2, maxExtent: 20 },
  { id: 'ice_star_small', variants: 3, maxExtent: 16 },
  { id: 'ice_star', variants: 4, maxExtent: 36 },
  // Too wide for a single feature placement (Bedrock only writes a 3x3-chunk window around the rule's chunk),
  // so it is compiled as chunk-aligned 16x16 column tiles that each chunk places for itself.
  { id: 'giant_ice_star', variants: 2, maxExtent: 90, tiled: { half: 2 } },
  { id: 'spire', variants: 2, maxExtent: 36 },
  { id: 'floating_spire', variants: 2, maxExtent: 36 },
  { id: 'umbralith_arch', variants: 2, maxExtent: 32 },
  { id: 'thin_umbralith_arch', variants: 2, maxExtent: 32 },
  { id: 'geyser', variants: 2, maxExtent: 24 },
  { id: 'surface_vent', variants: 2, maxExtent: 16 },
  { id: 'sulphur_hill', variants: 2, maxExtent: 24 },
  { id: 'sulphuric_lake', variants: 2, maxExtent: 24 },
  { id: 'end_lake', variants: 2, maxExtent: 28 },
  { id: 'desert_lake', variants: 2, maxExtent: 28 },
  { id: 'pond_with_waterfall', variants: 2, maxExtent: 24 },
  { id: 'obsidian_boulder', variants: 2, maxExtent: 18 },
  { id: 'obsidian_pillar_basement', variants: 2, maxExtent: 22 },
  { id: 'fallen_pillar', variants: 2, maxExtent: 24 },
  { id: 'small_island', variants: 2, maxExtent: 28 },
  // Java MOUNTAIN / PAINTED_MOUNTAIN, scaled to one 3x3-chunk template window (radius 11..22).
  { id: 'mountain', variants: 4, maxExtent: 64 },
  { id: 'painted_mountain', variants: 4, maxExtent: 64 },
  { id: 'small_island_flower', variants: 2, maxExtent: 28 },
  { id: 'stalactite_cluster', variants: 2, maxExtent: 12 },
  { id: 'stalactite_cluster_cavemoss', variants: 2, maxExtent: 12 },
  { id: 'aurora_cave_grotto', variants: 2, maxExtent: 22 },
  { id: 'smaragdant_cave_grotto', variants: 2, maxExtent: 22 },
  { id: 'jade_cave_grotto', variants: 2, maxExtent: 22 },
]);

/**
 * Compiles a procedural feature that is wider than the single-chunk placement window into chunk-aligned
 * tiles. The feature is generated once around the origin; world chunk `(siteChunk + dx, siteChunk + dz)`
 * places tile `(dx, dz)` for `dx, dz in [-half, half]`. The anchor is fixed at the middle of the site
 * chunk (local x/z = 8), so tile `(dx, dz)` owns the voxels with
 * `x in [16 * dx - 8, 16 * dx + 8)` (same for z) and never leaves its own chunk.
 *
 * Each tile's `originOffset` is `[localX, y, localZ]`: the structure's corner relative to the chunk origin
 * (x/z) and to the anchor height (y).
 */
function compileTiledProceduralFeature(spec, blocks, structureFiles, structureMeta) {
  const half = spec.tiled.half;
  const variants = [];
  for (let vIdx = 0; vIdx < spec.variants; vIdx += 1) {
    const seed = (vIdx + 1) * 0x9e3779b9;
    const voxels = generateBetterEndFeatureVoxels(spec.id, seed);
    const buckets = new Map();
    for (const v of voxels) {
      if (!v || !v.blockId) continue;
      const x = Math.round(v.x);
      const z = Math.round(v.z);
      const dx = Math.floor((x + 8) / 16);
      const dz = Math.floor((z + 8) / 16);
      if (Math.abs(dx) > half || Math.abs(dz) > half) continue;
      const key = `${dx},${dz}`;
      if (!buckets.has(key)) buckets.set(key, { dx, dz, voxels: [] });
      buckets.get(key).voxels.push(v);
    }
    const tiles = [];
    for (const { dx, dz, voxels: tileVoxels } of [...buckets.values()].sort(
      (a, b) => a.dx - b.dx || a.dz - b.dz,
    )) {
      const converted = convertVoxelsToMcStructure(tileVoxels, blocks, { maxExtent: 400 });
      if (converted.paletteCount <= 1 && converted.size[0] === 1 && converted.size[1] === 1) continue;
      const structId = `proc_${spec.id}_v${vIdx}_tile_${dx + half}_${dz + half}`;
      const relPath = `structures/betterend/${structId}.mcstructure`;
      structureFiles.set(relPath, converted.buffer);
      const localX = converted.originOffset[0] - (16 * dx - 8);
      const localZ = converted.originOffset[2] - (16 * dz - 8);
      const meta = {
        structureName: `betterend:${structId}`,
        relPath,
        size: converted.size,
        originOffset: [localX, converted.originOffset[1], localZ],
      };
      structureMeta.set(structId, meta);
      tiles.push({ dx, dz, meta });
    }
    variants.push({ variant: vIdx, tiles });
  }
  return { half, variants };
}

/**
 * Compiles all Java `.nbt` structures and procedural BetterEnd SDF/Spline structures into
 * Bedrock `.mcstructure` buffers (`structures/betterend/<name>.mcstructure`) and metadata.
 */
export function compileAllMcStructures({ repoRoot = defaultRepoRoot, blocks }) {
  const structureFiles = new Map();
  const structureMeta = new Map();
  const biomeNbtStructures = new Map();

  // 1. Compile all Java .nbt structures in src/main/resources/data/betterend/structure/biome/
  const structRoot = path.resolve(repoRoot, 'src/main/resources/data/betterend/structure');
  const biomeStructRoot = path.join(structRoot, 'biome');

  if (existsSync(biomeStructRoot)) {
    for (const biomeDir of readdirSync(biomeStructRoot, { withFileTypes: true })) {
      if (!biomeDir.isDirectory()) continue;
      const biomeId = biomeDir.name;
      const dirPath = path.join(biomeStructRoot, biomeId);
      const structsJsonPath = path.join(dirPath, 'structures.json');
      const offsetMap = new Map();
      if (existsSync(structsJsonPath)) {
        const parsed = JSON.parse(readFileSync(structsJsonPath, 'utf8'));
        for (const entry of parsed.structures ?? []) {
          offsetMap.set(entry.nbt, {
            offsetY: Number(entry.offsetY ?? 0),
            terrainMerge: entry.terrainMerge ?? 'surface',
          });
        }
      }

      const biomeEntries = [];
      for (const fileEnt of readdirSync(dirPath, { withFileTypes: true })) {
        if (!fileEnt.isFile() || !fileEnt.name.endsWith('.nbt')) continue;
        const baseName = fileEnt.name.slice(0, -4);
        const structId = `nbt_${biomeId}_${baseName}`;
        const relPath = `structures/betterend/${structId}.mcstructure`;
        const nbtDoc = parseJavaNbt(readFileSync(path.join(dirPath, fileEnt.name)));
        const converted = convertJavaNbtToMcStructure(nbtDoc, blocks);
        const cfg = offsetMap.get(baseName) ?? { offsetY: 0, terrainMerge: 'surface' };
        const originOffset = [
          converted.originOffset[0],
          cfg.offsetY,
          converted.originOffset[2],
        ];
        structureFiles.set(relPath, converted.buffer);
        const meta = {
          structureName: `betterend:${structId}`,
          relPath,
          size: converted.size,
          originOffset,
          terrainMerge: cfg.terrainMerge,
        };
        structureMeta.set(structId, meta);
        biomeEntries.push(meta);
      }
      biomeEntries.sort((a, b) => compareText(a.structureName, b.structureName));
      biomeNbtStructures.set(biomeId, biomeEntries);
    }
  }

  // 2. Compile Eternal Portal and Obsidian Pillar Base/Top .nbt files
  const extraNbtFiles = [
    { rel: 'portal/eternal_portal.nbt', id: 'nbt_eternal_portal', offsetY: -1 },
    { rel: 'pillars/pillar_base_1.nbt', id: 'nbt_pillar_base_1', offsetY: -2 },
    { rel: 'pillars/pillar_base_2.nbt', id: 'nbt_pillar_base_2', offsetY: -2 },
    { rel: 'pillars/pillar_base_3.nbt', id: 'nbt_pillar_base_3', offsetY: -2 },
    { rel: 'pillars/pillar_base_4.nbt', id: 'nbt_pillar_base_4', offsetY: -2 },
  ];
  for (const item of extraNbtFiles) {
    const fullPath = path.join(structRoot, item.rel);
    if (!existsSync(fullPath)) continue;
    const nbtDoc = parseJavaNbt(readFileSync(fullPath));
    const converted = convertJavaNbtToMcStructure(nbtDoc, blocks);
    const relPath = `structures/betterend/${item.id}.mcstructure`;
    const originOffset = [converted.originOffset[0], item.offsetY, converted.originOffset[2]];
    structureFiles.set(relPath, converted.buffer);
    structureMeta.set(item.id, {
      structureName: `betterend:${item.id}`,
      relPath,
      size: converted.size,
      originOffset,
    });
  }

  // 3. Compile all Procedural BetterEnd SDF/Spline Features into .mcstructure variants
  const proceduralVariants = new Map();
  const tiledProcedural = new Map();
  for (const spec of PROCEDURAL_FEATURE_SPECS) {
    if (spec.tiled) {
      tiledProcedural.set(spec.id, compileTiledProceduralFeature(spec, blocks, structureFiles, structureMeta));
      continue;
    }
    const variants = [];
    for (let vIdx = 0; vIdx < spec.variants; vIdx += 1) {
      const seed = (vIdx + 1) * 0x9e3779b9;
      const voxels = generateBetterEndFeatureVoxels(spec.id, seed);
      const converted = convertVoxelsToMcStructure(voxels, blocks, {
        maxExtent: spec.maxExtent ?? 36,
      });
      const structId = `proc_${spec.id}_v${vIdx}`;
      const relPath = `structures/betterend/${structId}.mcstructure`;
      structureFiles.set(relPath, converted.buffer);
      const meta = {
        structureName: `betterend:${structId}`,
        relPath,
        size: converted.size,
        originOffset: converted.originOffset,
      };
      structureMeta.set(structId, meta);
      variants.push(meta);
    }
    proceduralVariants.set(spec.id, variants);
  }

  return {
    structureFiles,
    structureMeta,
    biomeNbtStructures,
    proceduralVariants,
    tiledProcedural,
  };
}
