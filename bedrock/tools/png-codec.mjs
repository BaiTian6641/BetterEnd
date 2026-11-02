import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(toolsDir, '../..');

export const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Precomputed IEEE 802.3 CRC32 lookup table (polynomial 0xEDB88320).
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer, initial = 0xffffffff) {
  let crc = initial >>> 0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function unfilterScanlines(inflated, width, height, bpp, rowBytes) {
  const expectedLength = height * (1 + rowBytes);
  if (inflated.length < expectedLength) {
    throw new Error(`Truncated PNG IDAT stream: expected ${expectedLength} bytes, got ${inflated.length}`);
  }
  const out = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y += 1) {
    const srcRowStart = y * (1 + rowBytes);
    const filterType = inflated[srcRowStart];
    const srcDataStart = srcRowStart + 1;
    const dstRowStart = y * rowBytes;
    const prevRowStart = (y - 1) * rowBytes;

    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[srcDataStart + x];
      const left = x >= bpp ? out[dstRowStart + x - bpp] : 0;
      const up = y > 0 ? out[prevRowStart + x] : 0;
      const upLeft = y > 0 && x >= bpp ? out[prevRowStart + x - bpp] : 0;

      let recon;
      switch (filterType) {
        case 0: // None
          recon = raw;
          break;
        case 1: // Sub
          recon = (raw + left) & 0xff;
          break;
        case 2: // Up
          recon = (raw + up) & 0xff;
          break;
        case 3: // Average
          recon = (raw + ((left + up) >> 1)) & 0xff;
          break;
        case 4: // Paeth
          recon = (raw + paethPredictor(left, up, upLeft)) & 0xff;
          break;
        default:
          throw new Error(`Unsupported PNG scanline filter type ${filterType} at row ${y}`);
      }
      out[dstRowStart + x] = recon;
    }
  }
  return out;
}

const TEXTURE_FILENAME_ALIASES = Object.freeze({
  'aurora_crystal.png': 'src/main/resources/assets/betterend/textures/block/aurora_crystal.png',
  'tenanea_flowers.png': 'src/main/resources/assets/betterend/textures/item/tenanea_flowers.png',
  'tenanea_flowers_bottom.png': 'src/main/resources/assets/betterend/textures/block/tenanea_flowers_bottom.png',
  'helix_tree_leaves.png': 'src/main/resources/assets/betterend/textures/block/helix_tree_leaves.png',
  'jellyshroom_cap_top.png': 'src/main/resources/assets/betterend/textures/block/jellyshroom_cap.png',
  'jellyshroom_cap.png': 'src/main/resources/assets/betterend/textures/block/jellyshroom_cap.png',
  'hydralux_petal_block.png': 'src/main/resources/assets/betterend/textures/block/hydralux_petal_block.png',
  'hydralux_petal_block_colored.png': 'src/main/resources/assets/betterend/textures/block/hydralux_petal_block_colored.png',
  'iron_bulb_lantern_color.png': 'src/main/resources/assets/betterend/textures/block/bulb_vine_lantern_bulb.png',
  'bulb_vine_lantern_bulb.png': 'src/main/resources/assets/betterend/textures/block/bulb_vine_lantern_bulb.png',
});

export function resolveTexturePath(inputPath, repoRoot = defaultRepoRoot) {
  if (typeof inputPath !== 'string' || inputPath.length === 0) {
    throw new Error('Texture path must be a non-empty string');
  }
  if (existsSync(inputPath)) return inputPath;
  const candidateDirect = path.resolve(repoRoot, inputPath);
  if (existsSync(candidateDirect)) return candidateDirect;

  const baseName = path.basename(inputPath);
  if (TEXTURE_FILENAME_ALIASES[baseName]) {
    const aliased = path.resolve(repoRoot, TEXTURE_FILENAME_ALIASES[baseName]);
    if (existsSync(aliased)) return aliased;
  }

  const searchDirs = [
    'src/main/resources/assets/betterend/textures/block',
    'src/main/resources/assets/betterend/textures/item',
    'src/main/resources/assets/betterend/textures/entity',
    'src/main/generated/assets/betterend/textures/block',
    'src/main/generated/assets/betterend/textures/item',
  ];
  for (const dir of searchDirs) {
    const candidate = path.resolve(repoRoot, dir, baseName);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Unable to locate BetterEnd texture: ${inputPath}`);
}

function channelsForColorType(colorType) {
  switch (colorType) {
    case 0: return 1; // Grayscale
    case 2: return 3; // RGB
    case 3: return 1; // Indexed-color (PLTE)
    case 4: return 2; // Grayscale + Alpha
    case 6: return 4; // RGBA
    default:
      throw new Error(`Unsupported PNG colorType: ${colorType}`);
  }
}

export function decodePng(input, { repoRoot = defaultRepoRoot, verifyCrc = true } = {}) {
  const bytes = typeof input === 'string'
    ? readFileSync(resolveTexturePath(input, repoRoot))
    : Buffer.isBuffer(input)
      ? input
      : input instanceof Uint8Array
        ? Buffer.from(input.buffer, input.byteOffset, input.byteLength)
        : null;

  if (!bytes || bytes.length < 33) {
    throw new Error('Invalid PNG input: buffer too short');
  }
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Invalid PNG signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let compressionMethod = 0;
  let filterMethod = 0;
  let interlaceMethod = 0;
  let seenIHDR = false;
  let seenIEND = false;
  let plte = null;
  let trns = null;
  const idatParts = [];

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) {
      throw new Error('Truncated PNG chunk header');
    }
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > bytes.length) {
      throw new Error(`Truncated PNG chunk ${type}`);
    }
    const chunkData = bytes.subarray(dataStart, dataEnd);
    const expectedCrc = bytes.readUInt32BE(dataEnd);
    if (verifyCrc) {
      const actualCrc = crc32(bytes.subarray(offset + 4, dataEnd));
      if (actualCrc !== expectedCrc) {
        throw new Error(`PNG chunk ${type} CRC mismatch: expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)}`);
      }
    }

    if (type === 'IHDR') {
      if (seenIHDR || length !== 13) {
        throw new Error('Invalid IHDR chunk');
      }
      seenIHDR = true;
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
      compressionMethod = chunkData[10];
      filterMethod = chunkData[11];
      interlaceMethod = chunkData[12];
      if (width <= 0 || height <= 0) {
        throw new Error(`Invalid PNG dimensions: ${width}x${height}`);
      }
      if (![1, 2, 4, 8, 16].includes(bitDepth)) {
        throw new Error(`Unsupported PNG bitDepth: ${bitDepth}`);
      }
      if (![0, 2, 3, 4, 6].includes(colorType)) {
        throw new Error(`Unsupported PNG colorType: ${colorType}`);
      }
      if (compressionMethod !== 0 || filterMethod !== 0 || interlaceMethod !== 0) {
        throw new Error(`Unsupported PNG compression/filter/interlace methods: ${compressionMethod}/${filterMethod}/${interlaceMethod}`);
      }
    } else if (type === 'PLTE') {
      if (length === 0 || length % 3 !== 0 || length > 768) {
        throw new Error(`Invalid PLTE chunk length: ${length}`);
      }
      plte = chunkData;
    } else if (type === 'tRNS') {
      trns = chunkData;
    } else if (type === 'IDAT') {
      idatParts.push(chunkData);
    } else if (type === 'IEND') {
      seenIEND = true;
      offset = crcEnd;
      break;
    }

    offset = crcEnd;
  }

  if (!seenIHDR) throw new Error('Missing PNG IHDR chunk');
  if (!seenIEND) throw new Error('Missing PNG IEND chunk');
  if (idatParts.length === 0) throw new Error('Missing PNG IDAT chunks');
  if (colorType === 3 && !plte) throw new Error('Indexed PNG (colorType=3) missing PLTE chunk');

  const channels = channelsForColorType(colorType);
  const bitsPerPixel = channels * bitDepth;
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);

  const compressed = Buffer.concat(idatParts);
  const inflated = inflateSync(compressed);
  const unfiltered = unfilterScanlines(inflated, width, height, bpp, rowBytes);

  const rgba = Buffer.alloc(width * height * 4);
  const maxSampleValue = (1 << bitDepth) - 1;

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowBytes;
    for (let x = 0; x < width; x += 1) {
      const dstIdx = (y * width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 255;

      if (bitDepth < 8) {
        const samplesPerByte = 8 / bitDepth;
        const byteOffset = rowStart + Math.floor(x / samplesPerByte);
        const shift = (samplesPerByte - 1 - (x % samplesPerByte)) * bitDepth;
        const sample = (unfiltered[byteOffset] >> shift) & maxSampleValue;

        if (colorType === 3) {
          const pIdx = sample * 3;
          if (pIdx + 2 >= plte.length) {
            throw new Error(`PNG palette index ${sample} out of range (${plte.length / 3} entries)`);
          }
          r = plte[pIdx];
          g = plte[pIdx + 1];
          b = plte[pIdx + 2];
          a = trns && sample < trns.length ? trns[sample] : 255;
        } else if (colorType === 0) {
          const gray = Math.round((sample * 255) / maxSampleValue);
          r = gray;
          g = gray;
          b = gray;
          if (trns && trns.length >= 2) {
            const transparentSample = trns.readUInt16BE(0) & maxSampleValue;
            if (sample === transparentSample) a = 0;
          }
        }
      } else if (bitDepth === 8) {
        if (colorType === 0) {
          const gray = unfiltered[rowStart + x];
          r = gray;
          g = gray;
          b = gray;
          if (trns && trns.length >= 2 && gray === (trns.readUInt16BE(0) & 0xff)) {
            a = 0;
          }
        } else if (colorType === 2) {
          const p = rowStart + x * 3;
          r = unfiltered[p];
          g = unfiltered[p + 1];
          b = unfiltered[p + 2];
          if (trns && trns.length >= 6) {
            const tr = trns.readUInt16BE(0) & 0xff;
            const tg = trns.readUInt16BE(2) & 0xff;
            const tb = trns.readUInt16BE(4) & 0xff;
            if (r === tr && g === tg && b === tb) a = 0;
          }
        } else if (colorType === 3) {
          const sample = unfiltered[rowStart + x];
          const pIdx = sample * 3;
          if (pIdx + 2 >= plte.length) {
            throw new Error(`PNG palette index ${sample} out of range (${plte.length / 3} entries)`);
          }
          r = plte[pIdx];
          g = plte[pIdx + 1];
          b = plte[pIdx + 2];
          a = trns && sample < trns.length ? trns[sample] : 255;
        } else if (colorType === 4) {
          const p = rowStart + x * 2;
          const gray = unfiltered[p];
          r = gray;
          g = gray;
          b = gray;
          a = unfiltered[p + 1];
        } else if (colorType === 6) {
          const p = rowStart + x * 4;
          r = unfiltered[p];
          g = unfiltered[p + 1];
          b = unfiltered[p + 2];
          a = unfiltered[p + 3];
        }
      } else if (bitDepth === 16) {
        if (colorType === 0) {
          const gray = unfiltered[rowStart + x * 2];
          r = gray;
          g = gray;
          b = gray;
        } else if (colorType === 2) {
          const p = rowStart + x * 6;
          r = unfiltered[p];
          g = unfiltered[p + 2];
          b = unfiltered[p + 4];
        } else if (colorType === 4) {
          const p = rowStart + x * 4;
          const gray = unfiltered[p];
          r = gray;
          g = gray;
          b = gray;
          a = unfiltered[p + 2];
        } else if (colorType === 6) {
          const p = rowStart + x * 8;
          r = unfiltered[p];
          g = unfiltered[p + 2];
          b = unfiltered[p + 4];
          a = unfiltered[p + 6];
        }
      }

      rgba[dstIdx] = r;
      rgba[dstIdx + 1] = g;
      rgba[dstIdx + 2] = b;
      rgba[dstIdx + 3] = a;
    }
  }

  let hasAlpha = false;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 255) {
      hasAlpha = true;
      break;
    }
  }

  return {
    width,
    height,
    bitDepth,
    colorType,
    channels: 4,
    hasAlpha,
    paletteSize: plte ? plte.length / 3 : 0,
    data: rgba,
    rgba,
  };
}

function makePngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, crcInput, crcBuf]);
}

export function encodePng(first, second, third) {
  let width;
  let height;
  let rgba;

  if (first && typeof first === 'object' && !Buffer.isBuffer(first) && !(first instanceof Uint8Array)) {
    width = first.width;
    height = first.height;
    rgba = first.data ?? first.rgba;
  } else if (typeof first === 'number' && typeof second === 'number') {
    width = first;
    height = second;
    rgba = third;
  } else {
    rgba = first;
    width = second;
    height = third;
  }

  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`Invalid PNG encode dimensions: ${width}x${height}`);
  }
  if (!rgba || rgba.length !== width * height * 4) {
    throw new Error(`Invalid RGBA buffer length: expected ${width * height * 4}, got ${rgba?.length}`);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bitDepth = 8
  ihdr[9] = 6; // colorType = 6 (RGBA)
  ihdr[10] = 0; // compression = deflate
  ihdr[11] = 0; // filter = adaptive
  ihdr[12] = 0; // interlace = none

  const rowBytes = width * 4;
  const rawScanlines = Buffer.alloc(height * (1 + rowBytes));
  for (let y = 0; y < height; y += 1) {
    const dstStart = y * (1 + rowBytes);
    rawScanlines[dstStart] = 0; // Filter type 0 (None)
    const srcStart = y * rowBytes;
    Buffer.from(rgba.buffer, rgba.byteOffset + srcStart, rowBytes).copy(rawScanlines, dstStart + 1);
  }

  const idatData = deflateSync(rawScanlines, { level: 9 });
  return Buffer.concat([
    PNG_SIGNATURE,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idatData),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function formatHexColor(r, g, b) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function toSignedArgbInt(r, g, b, a = 255) {
  return (((a & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >> 0;
}

export function parseRgbColor(rgbHexOrInt) {
  if (typeof rgbHexOrInt === 'number' && Number.isFinite(rgbHexOrInt)) {
    const intVal = rgbHexOrInt | 0;
    const r = (intVal >>> 16) & 0xff;
    const g = (intVal >>> 8) & 0xff;
    const b = intVal & 0xff;
    return { r, g, b, hex: formatHexColor(r, g, b), argbInt: toSignedArgbInt(r, g, b) };
  }
  if (typeof rgbHexOrInt === 'string') {
    const cleaned = rgbHexOrInt.trim().replace(/^(?:#|0x)/iu, '');
    if (!/^[0-9a-f]{6,8}$/iu.test(cleaned)) {
      throw new Error(`Invalid hex color string: ${rgbHexOrInt}`);
    }
    const rgbHex = cleaned.length === 8 ? cleaned.slice(2) : cleaned;
    const num = Number.parseInt(rgbHex, 16);
    const r = (num >>> 16) & 0xff;
    const g = (num >>> 8) & 0xff;
    const b = num & 0xff;
    return { r, g, b, hex: formatHexColor(r, g, b), argbInt: toSignedArgbInt(r, g, b) };
  }
  if (Array.isArray(rgbHexOrInt) && rgbHexOrInt.length >= 3) {
    const [r, g, b] = rgbHexOrInt.map(v => Math.max(0, Math.min(255, Math.round(Number(v)))));
    return { r, g, b, hex: formatHexColor(r, g, b), argbInt: toSignedArgbInt(r, g, b) };
  }
  if (rgbHexOrInt && typeof rgbHexOrInt === 'object' && 'r' in rgbHexOrInt && 'g' in rgbHexOrInt && 'b' in rgbHexOrInt) {
    const r = Math.max(0, Math.min(255, Math.round(Number(rgbHexOrInt.r))));
    const g = Math.max(0, Math.min(255, Math.round(Number(rgbHexOrInt.g))));
    const b = Math.max(0, Math.min(255, Math.round(Number(rgbHexOrInt.b))));
    return { r, g, b, hex: formatHexColor(r, g, b), argbInt: toSignedArgbInt(r, g, b) };
  }
  throw new Error(`Unsupported color representation: ${JSON.stringify(rgbHexOrInt)}`);
}

export function applyMultiplicativeTint(rgbaInput, rgbHexOrInt) {
  const { r: tr, g: tg, b: tb } = parseRgbColor(rgbHexOrInt);
  const isImageObject = rgbaInput && typeof rgbaInput === 'object' && !Buffer.isBuffer(rgbaInput) && !(rgbaInput instanceof Uint8Array);
  const src = isImageObject ? (rgbaInput.data ?? rgbaInput.rgba) : rgbaInput;

  if (!src || src.length % 4 !== 0) {
    throw new Error('applyMultiplicativeTint requires an RGBA buffer whose length is a multiple of 4');
  }

  const out = Buffer.alloc(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = Math.round((src[i] * tr) / 255);
    out[i + 1] = Math.round((src[i + 1] * tg) / 255);
    out[i + 2] = Math.round((src[i + 2] * tb) / 255);
    out[i + 3] = src[i + 3]; // Preserve alpha channel exactly
  }

  if (isImageObject) {
    return {
      ...rgbaInput,
      data: out,
      rgba: out,
    };
  }
  return out;
}

export function tintPng(input, rgbHexOrInt, options = {}) {
  const decoded = decodePng(input, options);
  const tintedData = applyMultiplicativeTint(decoded.data, rgbHexOrInt);
  const pngBuffer = encodePng(decoded.width, decoded.height, tintedData);
  return {
    width: decoded.width,
    height: decoded.height,
    tint: parseRgbColor(rgbHexOrInt),
    original: decoded,
    data: tintedData,
    rgba: tintedData,
    png: pngBuffer,
  };
}

// 1.1 Position-Based 3D Palette-Cycle Tinting (TinterKeys.PALETTE_CYCLE)
export const AURORA_ITEM_TINT = '#F74DA1';
export const AURORA_ITEM_TINT_INT = -569951;
export const AURORA_PALETTE = Object.freeze(
  Object.assign(['#F74DA1', '#78B8FF', '#78FFA8', '#F33AFF'], {
    item: AURORA_ITEM_TINT,
    itemInt: AURORA_ITEM_TINT_INT,
    indexMode: 'SUM_XYZ',
    minSaturation: 0.0,
  }),
);

export const TENANEA_PALETTE = Object.freeze(
  Object.assign(['#FA6FDE', '#A759FF', '#78CFEF', '#FF57B6'], {
    indexMode: 'HASH_XZ_PLUS_Y',
    minSaturation: 0.5,
  }),
);

// 1.2 Blockstate Property Gradient Tinting (TinterKeys.GRADIENT, color=0..7, item stop color=4)
export const HELIX_LEAVES_ITEM_TINT = '#ED7C14';
export const HELIX_LEAVES_ITEM_TINT_INT = -1213420;
export const HELIX_LEAVES_GRADIENT = Object.freeze(
  Object.assign(
    ['#ED5014', '#ED5B14', '#ED6614', '#ED7114', '#ED7C14', '#ED8714', '#ED9214', '#ED9E14'],
    {
      item: HELIX_LEAVES_ITEM_TINT,
      itemInt: HELIX_LEAVES_ITEM_TINT_INT,
      itemStop: 4,
    },
  ),
);

export const JELLYSHROOM_CAP_ITEM_TINT = '#BA3DFF';
export const JELLYSHROOM_CAP_ITEM_TINT_INT = -4571905;
export const JELLYSHROOM_CAP_GRADIENT = Object.freeze(
  Object.assign(
    ['#D98EFF', '#D17AFF', '#CA65FF', '#C251FF', '#BA3DFF', '#B328FF', '#AB14FF', '#A400FF'],
    {
      item: JELLYSHROOM_CAP_ITEM_TINT,
      itemInt: JELLYSHROOM_CAP_ITEM_TINT_INT,
      itemStop: 4,
    },
  ),
);

// 1.3 Constant Dye-Color Tinting (DyeColor.getMapColor().col)
export const HYDRALUX_PETAL_COLORS = Object.freeze({
  black: '#191919',
  blue: '#334CB2',
  brown: '#664C33',
  cyan: '#4C7F99',
  gray: '#4C4C4C',
  green: '#667F33',
  light_blue: '#6699D8',
  light_gray: '#999999',
  lime: '#7FCC19',
  magenta: '#B24CD8',
  orange: '#D87F33',
  pink: '#F27FA5',
  purple: '#7F3FB2',
  red: '#993333',
  white: '#FFFFFF',
  yellow: '#E5E533',
});

export const HYDRALUX_PETAL_COLOR_INTS = Object.freeze({
  black: -15132391,
  blue: -13415246,
  brown: -10073037,
  cyan: -11763815,
  gray: -11776948,
  green: -10059981,
  light_blue: -10053160,
  light_gray: -6710887,
  lime: -8401895,
  magenta: -5092136,
  orange: -2588877,
  pink: -884827,
  purple: -8437838,
  red: -6737101,
  white: -1,
  yellow: -1710797,
});

// BulbVineLanternColoredBlock::boostLanternColor HSB-boosted values (V = S > 0.2 ? 1.0 : V)
export const BULB_LANTERN_COLORS = Object.freeze({
  black: '#191919',
  blue: '#496EFF',
  brown: '#FFBE80',
  cyan: '#7FD5FF',
  gray: '#4C4C4C',
  green: '#CDFF66',
  light_blue: '#78B5FF',
  light_gray: '#999999',
  lime: '#9FFF1F',
  magenta: '#D25AFF',
  orange: '#FF963C',
  pink: '#FF86AE',
  purple: '#B65AFF',
  red: '#FF5555',
  white: '#FFFFFF',
  yellow: '#FFFF39',
});

export const BULB_LANTERN_COLOR_INTS = Object.freeze({
  black: -15132391,
  blue: -11964929,
  brown: -16768,
  cyan: -8399617,
  gray: -11776948,
  green: -3276954,
  light_blue: -8866305,
  light_gray: -6710887,
  lime: -6291681,
  magenta: -2991361,
  orange: -27076,
  pink: -31058,
  purple: -4826369,
  red: -43691,
  white: -1,
  yellow: -199,
});

export function boostLanternColor(rgbHexOrInt) {
  const { r, g, b } = parseRgbColor(rgbHexOrInt);
  const cmax = Math.max(r, g, b);
  const cmin = Math.min(r, g, b);
  let v = cmax / 255;
  const s = cmax !== 0 ? (cmax - cmin) / cmax : 0;
  let h = 0;
  if (s !== 0) {
    const redc = (cmax - r) / (cmax - cmin);
    const greenc = (cmax - g) / (cmax - cmin);
    const bluec = (cmax - b) / (cmax - cmin);
    if (r === cmax) h = bluec - greenc;
    else if (g === cmax) h = 2.0 + redc - bluec;
    else h = 4.0 + greenc - redc;
    h /= 6.0;
    if (h < 0) h += 1.0;
  }
  v = s > 0.2 ? 1.0 : v;
  if (s === 0) {
    const gray = Math.floor(v * 255 + 0.5);
    return parseRgbColor([gray, gray, gray]);
  }
  const h6 = (h - Math.floor(h)) * 6.0;
  const f = h6 - Math.floor(h6);
  const p = v * (1.0 - s);
  const q = v * (1.0 - s * f);
  const t = v * (1.0 - s * (1.0 - f));
  let ro = 0;
  let go = 0;
  let bo = 0;
  switch (Math.floor(h6)) {
    case 0: ro = v; go = t; bo = p; break;
    case 1: ro = q; go = v; bo = p; break;
    case 2: ro = p; go = v; bo = t; break;
    case 3: ro = p; go = q; bo = v; break;
    case 4: ro = t; go = p; bo = v; break;
    default: ro = v; go = p; bo = q; break;
  }
  return parseRgbColor([
    Math.floor(ro * 255 + 0.5),
    Math.floor(go * 255 + 0.5),
    Math.floor(bo * 255 + 0.5),
  ]);
}

// PBR MER & .texture_set.json generation (§10.2 of BetterEnd_Bedrock_26.40_Implementation_Plan.md)
export const MATERIAL_PBR_PRESETS = Object.freeze({
  rough_stone: { category: 'rough_stone', mer: [0, 0, 238] },
  bark_wood: { category: 'bark_wood', mer: [0, 0, 224] },
  leaves_membrane: { category: 'leaves_membrane', mer: [0, 0, 200], mers: [0, 0, 200, 56] },
  metal: { category: 'metal', mer: [240, 0, 72] },
  emissive_plant: { category: 'emissive_plant', mer: [0, 210, 176] },
  emissive_crystal: { category: 'emissive_crystal', mer: [0, 28, 16] },
  transparent_crystal: { category: 'transparent_crystal', mer: [0, 12, 16] },
});

export function classifyMaterialPbr(textureIdOrName, { hasEmissiveMask = false, useSubsurface = false } = {}) {
  const name = String(textureIdOrName).toLowerCase();
  if (
    /(?:thallasium|terminite|aeternium|iron_bulb|anvil|chain|bars|_metal|ingot|forged_plate|hammer|sword|pickaxe|axe|shovel|hoe|spear)/u.test(name)
    && !/(?:ore|bulb_vine_lantern_bulb)/u.test(name)
  ) {
    return { ...MATERIAL_PBR_PRESETS.metal };
  }
  if (/(?:aurora_crystal|smaragdant_crystal|eternal_crystal|glowing_bulb|bulb_vine_lantern_bulb|respawn_obelisk_amber)/u.test(name)) {
    return { ...MATERIAL_PBR_PRESETS.emissive_crystal };
  }
  if (/(?:emerald_ice|dense_emerald_ice|ancient_emerald_ice|amber_block|crystal_glass)/u.test(name)) {
    return { ...MATERIAL_PBR_PRESETS.transparent_crystal };
  }
  if (
    hasEmissiveMask
    || /(?:_glow|glowshroom_cap|luminophor|lucernia_outer|tenanea_outer|umbrella_tree_cluster|neon_cactus|hydralux_flower|Hydralux_petal|lume|bulbs|auranode|flamaea|bolux)/u.test(name)
  ) {
    return { ...MATERIAL_PBR_PRESETS.emissive_plant };
  }
  if (/(?:leaves|membrane|moss|vine|grass|fern|petal|flower|sapling|bush|cap|jellyshroom)/u.test(name)) {
    const preset = MATERIAL_PBR_PRESETS.leaves_membrane;
    return useSubsurface
      ? { category: preset.category, mers: [...preset.mers] }
      : { category: preset.category, mer: [...preset.mer] };
  }
  if (/(?:log|bark|planks|wood|stripped|bookshelf|chest|barrel|door|trapdoor|ladder|sign|shelf|composter|chair|stool|taburet|boat|raft)/u.test(name)) {
    return { ...MATERIAL_PBR_PRESETS.bark_wood };
  }
  return { ...MATERIAL_PBR_PRESETS.rough_stone };
}

export function generateMerMap(albedoInput, { emissiveInput = null, specularInput = null, baseMer = [0, 0, 235], repoRoot = defaultRepoRoot } = {}) {
  const albedo = typeof albedoInput === 'object' && albedoInput.data ? albedoInput : decodePng(albedoInput, { repoRoot });
  const emissive = emissiveInput
    ? (typeof emissiveInput === 'object' && emissiveInput.data ? emissiveInput : decodePng(emissiveInput, { repoRoot }))
    : null;
  const specular = specularInput
    ? (typeof specularInput === 'object' && specularInput.data ? specularInput : decodePng(specularInput, { repoRoot }))
    : null;

  const { width, height } = albedo;
  const merRgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    let m = baseMer[0] ?? 0;
    let e = baseMer[1] ?? 0;
    let r = baseMer[2] ?? 235;

    if (emissive && p + 3 < emissive.data.length) {
      const er = emissive.data[p];
      const eg = emissive.data[p + 1];
      const eb = emissive.data[p + 2];
      const ea = emissive.data[p + 3];
      const lum = Math.round(((er * 77 + eg * 150 + eb * 29) >> 8) * (ea / 255));
      e = lum;
    }

    if (specular && p + 3 < specular.data.length) {
      const specVal = specular.data[p];
      r = Math.max(16, Math.min(255, 255 - Math.round(specVal * 0.75)));
    }

    merRgba[p] = m;
    merRgba[p + 1] = e;
    merRgba[p + 2] = r;
    merRgba[p + 3] = 255;
  }

  return {
    width,
    height,
    data: merRgba,
    rgba: merRgba,
    png: encodePng(width, height, merRgba),
  };
}

export function validateTextureSet(textureSetJson, { isItem = false } = {}) {
  if (!textureSetJson || typeof textureSetJson !== 'object') {
    throw new Error('Texture set must be a JSON object');
  }
  if (textureSetJson.format_version !== '1.16.100') {
    throw new Error(`Invalid texture_set format_version: expected "1.16.100", got ${JSON.stringify(textureSetJson.format_version)}`);
  }
  const ts = textureSetJson['minecraft:texture_set'];
  if (!ts || typeof ts !== 'object' || typeof ts.color !== 'string' || ts.color.length === 0) {
    throw new Error('minecraft:texture_set requires a non-empty color string');
  }

  const hasMer = ts.metalness_emissive_roughness !== undefined;
  const hasMers = ts.metalness_emissive_roughness_subsurface !== undefined;
  if (hasMer && hasMers) {
    throw new Error('Texture set invariant violation: cannot specify both metalness_emissive_roughness and metalness_emissive_roughness_subsurface');
  }
  if (!hasMer && !hasMers) {
    throw new Error('Texture set requires either metalness_emissive_roughness or metalness_emissive_roughness_subsurface');
  }

  const hasNormal = ts.normal !== undefined;
  const hasHeightmap = ts.heightmap !== undefined;
  if (hasNormal && hasHeightmap) {
    throw new Error('Texture set invariant violation: cannot specify both normal and heightmap');
  }
  if (isItem && hasHeightmap) {
    throw new Error('Texture set invariant violation: texture-based items must not use heightmap');
  }

  if (Array.isArray(ts.metalness_emissive_roughness)) {
    if (
      ts.metalness_emissive_roughness.length !== 3
      || ts.metalness_emissive_roughness.some(v => !Number.isInteger(v) || v < 0 || v > 255)
    ) {
      throw new Error('metalness_emissive_roughness array must contain 3 integers in 0..255');
    }
  }
  if (Array.isArray(ts.metalness_emissive_roughness_subsurface)) {
    const [m, e, r, s] = ts.metalness_emissive_roughness_subsurface;
    if (
      ts.metalness_emissive_roughness_subsurface.length !== 4
      || [m, e, r, s].some(v => !Number.isInteger(v) || v < 0 || v > 255)
    ) {
      throw new Error('metalness_emissive_roughness_subsurface array must contain 4 integers in 0..255');
    }
    if (m > 0 && s > 0) {
      throw new Error('Texture set invariant violation: material cannot be simultaneously metallic (M > 0) and subsurface (S > 0)');
    }
  }
  return true;
}

export function buildTextureSetJson(colorTextureName, {
  mer = null,
  mers = null,
  normal = null,
  heightmap = null,
  isItem = false,
  hasEmissiveMask = false,
  useSubsurface = false,
} = {}) {
  if (typeof colorTextureName !== 'string' || colorTextureName.length === 0) {
    throw new Error('colorTextureName must be a non-empty string');
  }
  if (mer !== null && mers !== null) {
    throw new Error('Cannot specify both mer and mers in buildTextureSetJson');
  }
  if (normal !== null && heightmap !== null) {
    throw new Error('Cannot specify both normal and heightmap in buildTextureSetJson');
  }
  if (isItem && heightmap !== null) {
    throw new Error('Texture-based items cannot use heightmap');
  }

  const ts = { color: colorTextureName };
  if (mers !== null) {
    ts.metalness_emissive_roughness_subsurface = mers;
  } else if (mer !== null) {
    ts.metalness_emissive_roughness = mer;
  } else {
    const classified = classifyMaterialPbr(colorTextureName, { hasEmissiveMask, useSubsurface });
    if (classified.mers) {
      ts.metalness_emissive_roughness_subsurface = classified.mers;
    } else {
      ts.metalness_emissive_roughness = classified.mer;
    }
  }

  if (normal !== null) {
    ts.normal = normal;
  } else if (heightmap !== null) {
    ts.heightmap = heightmap;
  }

  const doc = {
    format_version: '1.16.100',
    'minecraft:texture_set': ts,
  };
  validateTextureSet(doc, { isItem });
  return doc;
}

export const createTextureSetJson = buildTextureSetJson;
