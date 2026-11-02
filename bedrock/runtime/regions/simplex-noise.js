/**
 * Pure ES module port of BetterEnd's `org.betterx.betterend.noise.OpenSimplexNoise`
 * (by Kurt Spencer, v1.1 October 5, 2014).
 *
 * Runs identically in Node.js 24 and inside `@minecraft/server` 2.9.0 in BDS.
 * Uses 64-bit signed `BigInt` (`BigInt.asIntN(64, ...)`) for the constructor's
 * LCG permutation shuffle so permutation tables match Java `OpenSimplexNoise(long seed)` bit-for-bit.
 */

const STRETCH_CONSTANT_2D = -0.211324865405187; // (1 / Math.sqrt(2 + 1) - 1) / 2
const SQUISH_CONSTANT_2D = 0.366025403784439;   // (Math.sqrt(2 + 1) - 1) / 2
const STRETCH_CONSTANT_3D = -1.0 / 6.0;         // (1 / Math.sqrt(3 + 1) - 1) / 3
const SQUISH_CONSTANT_3D = 1.0 / 3.0;           // (Math.sqrt(3 + 1) - 1) / 3
const STRETCH_CONSTANT_4D = -0.138196601125011; // (1 / Math.sqrt(4 + 1) - 1) / 4
const SQUISH_CONSTANT_4D = 0.309016994374947;   // (Math.sqrt(4 + 1) - 1) / 4

const NORM_CONSTANT_2D = 47.0;
const NORM_CONSTANT_3D = 103.0;
const NORM_CONSTANT_4D = 30.0;

const DEFAULT_SEED = 0n;
const LCG_MULT = 6364136223846793005n;
const LCG_ADD = 1442695040888963407n;

const GRADIENTS_2D = new Int8Array([
  5, 2, 2, 5, -5, 2, -2, 5,
  5, -2, 2, -5, -5, -2, -2, -5
]);

const GRADIENTS_3D = new Int8Array([
  -11, 4, 4, -4, 11, 4, -4, 4, 11,
  11, 4, 4, 4, 11, 4, 4, 4, 11,
  -11, -4, 4, -4, -11, 4, -4, -4, 11,
  11, -4, 4, 4, -11, 4, 4, -4, 11,
  -11, 4, -4, -4, 11, -4, -4, 4, -11,
  11, 4, -4, 4, 11, -4, 4, 4, -11,
  -11, -4, -4, -4, -11, -4, -4, -4, -11,
  11, -4, -4, 4, -11, -4, 4, -4, -11
]);

const GRADIENTS_4D = new Int8Array([
  3, 1, 1, 1, 1, 3, 1, 1, 1, 1, 3, 1, 1, 1, 1, 3,
  -3, 1, 1, 1, -1, 3, 1, 1, -1, 1, 3, 1, -1, 1, 1, 3,
  3, -1, 1, 1, 1, -3, 1, 1, 1, -1, 3, 1, 1, -1, 1, 3,
  -3, -1, 1, 1, -1, -3, 1, 1, -1, -1, 3, 1, -1, -1, 1, 3,
  3, 1, -1, 1, 1, 3, -1, 1, 1, 1, -3, 1, 1, 1, -1, 3,
  -3, 1, -1, 1, -1, 3, -1, 1, -1, 1, -3, 1, -1, 1, -1, 3,
  3, -1, -1, 1, 1, -3, -1, 1, 1, -1, -3, 1, 1, -1, -1, 3,
  -3, -1, -1, 1, -1, -3, -1, 1, -1, -1, -3, 1, -1, -1, -1, 3,
  3, 1, 1, -1, 1, 3, 1, -1, 1, 1, 3, -1, 1, 1, 1, -3,
  -3, 1, 1, -1, -1, 3, 1, -1, -1, 1, 3, -1, -1, 1, 1, -3,
  3, -1, 1, -1, 1, -3, 1, -1, 1, -1, 3, -1, 1, -1, 1, -3,
  -3, -1, 1, -1, -1, -3, 1, -1, -1, -1, 3, -1, -1, -1, 1, -3,
  3, 1, -1, -1, 1, 3, -1, -1, 1, 1, -3, -1, 1, 1, -1, -3,
  -3, 1, -1, -1, -1, 3, -1, -1, -1, 1, -3, -1, -1, 1, -1, -3,
  3, -1, -1, -1, 1, -3, -1, -1, 1, -1, -3, -1, 1, -1, -1, -3,
  -3, -1, -1, -1, -1, -3, -1, -1, -1, -1, -3, -1, -1, -1, -1, -3
]);

function fastFloor(x) {
  const xi = Math.trunc(x);
  return x < xi ? xi - 1 : xi;
}

/**
 * Coerces a seed (bigint, number, string, or { high, low }) into a signed 64-bit BigInt
 * without floating-point precision loss for string/bigint inputs.
 *
 * @param {bigint | number | string | { high: number, low: number }} seed
 * @returns {bigint}
 */
export function toSignedLong(seed = DEFAULT_SEED) {
  if (typeof seed === "bigint") {
    return BigInt.asIntN(64, seed);
  }
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) return 0n;
    return BigInt.asIntN(64, BigInt(Math.trunc(seed)));
  }
  if (typeof seed === "string") {
    const trimmed = seed.trim();
    if (trimmed.length === 0) return 0n;
    if (/^[+-]?\d+$/.test(trimmed)) {
      return BigInt.asIntN(64, BigInt(trimmed));
    }
    if (/^[+-]?0x[0-9a-fA-F]+$/.test(trimmed)) {
      const neg = trimmed.startsWith("-");
      const clean = trimmed.replace(/^[+-]/, "");
      const val = BigInt(clean);
      return BigInt.asIntN(64, neg ? -val : val);
    }
    // Java String.hashCode() fallback for non-numeric text seeds
    let h = 0;
    for (let i = 0; i < trimmed.length; i++) {
      h = (Math.imul(31, h) + trimmed.charCodeAt(i)) | 0;
    }
    return BigInt.asIntN(64, BigInt(h));
  }
  if (seed && typeof seed === "object" && "high" in seed && "low" in seed) {
    const high = BigInt.asIntN(32, BigInt(seed.high | 0));
    const low = BigInt.asUintN(32, BigInt(seed.low >>> 0));
    return BigInt.asIntN(64, (high << 32n) | low);
  }
  return 0n;
}

export class OpenSimplexNoise {
  /**
   * @param {bigint | number | string | Int16Array | Array<number>} [seed=0n]
   */
  constructor(seed = DEFAULT_SEED) {
    this.perm = new Int16Array(256);
    this.permGradIndex3D = new Int16Array(256);
    const numGrad3D = GRADIENTS_3D.length / 3; // 24

    if (ArrayBuffer.isView(seed) || Array.isArray(seed)) {
      for (let i = 0; i < 256; i++) {
        this.perm[i] = seed[i] | 0;
        this.permGradIndex3D[i] = ((this.perm[i] % numGrad3D) * 3) | 0;
      }
      return;
    }

    let s = toSignedLong(seed);
    const source = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
      source[i] = i;
    }

    s = BigInt.asIntN(64, s * LCG_MULT + LCG_ADD);
    s = BigInt.asIntN(64, s * LCG_MULT + LCG_ADD);
    s = BigInt.asIntN(64, s * LCG_MULT + LCG_ADD);

    for (let i = 255; i >= 0; i--) {
      s = BigInt.asIntN(64, s * LCG_MULT + LCG_ADD);
      const mod = BigInt(i + 1);
      let r = Number(BigInt.asIntN(64, s + 31n) % mod);
      if (r < 0) r += i + 1;
      this.perm[i] = source[r];
      this.permGradIndex3D[i] = ((this.perm[i] % numGrad3D) * 3) | 0;
      source[r] = source[i];
    }
  }

  /**
   * Evaluates 2D, 3D, or 4D OpenSimplexNoise depending on argument count.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} [z]
   * @param {number} [w]
   * @returns {number}
   */
  eval(x, y, z, w) {
    if (z === undefined) {
      return this.eval2D(x, y);
    }
    if (w === undefined) {
      return this.eval3D(x, y, z);
    }
    return this.eval4D(x, y, z, w);
  }

  /**
   * 2D OpenSimplex Noise.
   *
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  eval2D(x, y) {
    const stretchOffset = (x + y) * STRETCH_CONSTANT_2D;
    const xs = x + stretchOffset;
    const ys = y + stretchOffset;

    let xsb = fastFloor(xs);
    let ysb = fastFloor(ys);

    const squishOffset = (xsb + ysb) * SQUISH_CONSTANT_2D;
    const xb = xsb + squishOffset;
    const yb = ysb + squishOffset;

    const xins = xs - xsb;
    const yins = ys - ysb;

    const inSum = xins + yins;

    let dx0 = x - xb;
    let dy0 = y - yb;

    let dx_ext;
    let dy_ext;
    let xsv_ext;
    let ysv_ext;

    let value = 0.0;

    // Contribution (1,0)
    const dx1 = dx0 - 1 - SQUISH_CONSTANT_2D;
    const dy1 = dy0 - 0 - SQUISH_CONSTANT_2D;
    let attn1 = 2 - dx1 * dx1 - dy1 * dy1;
    if (attn1 > 0) {
      attn1 *= attn1;
      value += attn1 * attn1 * this._extrapolate2D(xsb + 1, ysb + 0, dx1, dy1);
    }

    // Contribution (0,1)
    const dx2 = dx0 - 0 - SQUISH_CONSTANT_2D;
    const dy2 = dy0 - 1 - SQUISH_CONSTANT_2D;
    let attn2 = 2 - dx2 * dx2 - dy2 * dy2;
    if (attn2 > 0) {
      attn2 *= attn2;
      value += attn2 * attn2 * this._extrapolate2D(xsb + 0, ysb + 1, dx2, dy2);
    }

    if (inSum <= 1) {
      // Inside the triangle (2-Simplex) at (0,0)
      const zins = 1 - inSum;
      if (zins > xins || zins > yins) {
        if (xins > yins) {
          xsv_ext = xsb + 1;
          ysv_ext = ysb - 1;
          dx_ext = dx0 - 1;
          dy_ext = dy0 + 1;
        } else {
          xsv_ext = xsb - 1;
          ysv_ext = ysb + 1;
          dx_ext = dx0 + 1;
          dy_ext = dy0 - 1;
        }
      } else {
        xsv_ext = xsb + 1;
        ysv_ext = ysb + 1;
        dx_ext = dx0 - 1 - 2 * SQUISH_CONSTANT_2D;
        dy_ext = dy0 - 1 - 2 * SQUISH_CONSTANT_2D;
      }
    } else {
      // Inside the triangle (2-Simplex) at (1,1)
      const zins = 2 - inSum;
      if (zins < xins || zins < yins) {
        if (xins > yins) {
          xsv_ext = xsb + 2;
          ysv_ext = ysb + 0;
          dx_ext = dx0 - 2 - 2 * SQUISH_CONSTANT_2D;
          dy_ext = dy0 + 0 - 2 * SQUISH_CONSTANT_2D;
        } else {
          xsv_ext = xsb + 0;
          ysv_ext = ysb + 2;
          dx_ext = dx0 + 0 - 2 * SQUISH_CONSTANT_2D;
          dy_ext = dy0 - 2 - 2 * SQUISH_CONSTANT_2D;
        }
      } else {
        dx_ext = dx0;
        dy_ext = dy0;
        xsv_ext = xsb;
        ysv_ext = ysb;
      }
      xsb += 1;
      ysb += 1;
      dx0 = dx0 - 1 - 2 * SQUISH_CONSTANT_2D;
      dy0 = dy0 - 1 - 2 * SQUISH_CONSTANT_2D;
    }

    // Contribution (0,0) or (1,1)
    let attn0 = 2 - dx0 * dx0 - dy0 * dy0;
    if (attn0 > 0) {
      attn0 *= attn0;
      value += attn0 * attn0 * this._extrapolate2D(xsb, ysb, dx0, dy0);
    }

    // Extra Vertex
    let attn_ext = 2 - dx_ext * dx_ext - dy_ext * dy_ext;
    if (attn_ext > 0) {
      attn_ext *= attn_ext;
      value += attn_ext * attn_ext * this._extrapolate2D(xsv_ext, ysv_ext, dx_ext, dy_ext);
    }

    return value / NORM_CONSTANT_2D;
  }

  /**
   * 3D OpenSimplex Noise.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  eval3D(x, y, z) {
    const stretchOffset = (x + y + z) * STRETCH_CONSTANT_3D;
    const xs = x + stretchOffset;
    const ys = y + stretchOffset;
    const zs = z + stretchOffset;

    const xsb = fastFloor(xs);
    const ysb = fastFloor(ys);
    const zsb = fastFloor(zs);

    const squishOffset = (xsb + ysb + zsb) * SQUISH_CONSTANT_3D;
    const xb = xsb + squishOffset;
    const yb = ysb + squishOffset;
    const zb = zsb + squishOffset;

    const xins = xs - xsb;
    const yins = ys - ysb;
    const zins = zs - zsb;

    const inSum = xins + yins + zins;

    let dx0 = x - xb;
    let dy0 = y - yb;
    let dz0 = z - zb;

    let dx_ext0, dy_ext0, dz_ext0;
    let dx_ext1, dy_ext1, dz_ext1;
    let xsv_ext0, ysv_ext0, zsv_ext0;
    let xsv_ext1, ysv_ext1, zsv_ext1;

    let value = 0.0;
    if (inSum <= 1) {
      // Inside the tetrahedron (3-Simplex) at (0,0,0)
      let aPoint = 0x01;
      let aScore = xins;
      let bPoint = 0x02;
      let bScore = yins;
      if (aScore >= bScore && zins > bScore) {
        bScore = zins;
        bPoint = 0x04;
      } else if (aScore < bScore && zins > aScore) {
        aScore = zins;
        aPoint = 0x04;
      }

      const wins = 1 - inSum;
      if (wins > aScore || wins > bScore) {
        const c = bScore > aScore ? bPoint : aPoint;

        if ((c & 0x01) === 0) {
          xsv_ext0 = xsb - 1;
          xsv_ext1 = xsb;
          dx_ext0 = dx0 + 1;
          dx_ext1 = dx0;
        } else {
          xsv_ext0 = xsv_ext1 = xsb + 1;
          dx_ext0 = dx_ext1 = dx0 - 1;
        }

        if ((c & 0x02) === 0) {
          ysv_ext0 = ysv_ext1 = ysb;
          dy_ext0 = dy_ext1 = dy0;
          if ((c & 0x01) === 0) {
            ysv_ext1 -= 1;
            dy_ext1 += 1;
          } else {
            ysv_ext0 -= 1;
            dy_ext0 += 1;
          }
        } else {
          ysv_ext0 = ysv_ext1 = ysb + 1;
          dy_ext0 = dy_ext1 = dy0 - 1;
        }

        if ((c & 0x04) === 0) {
          zsv_ext0 = zsb;
          zsv_ext1 = zsb - 1;
          dz_ext0 = dz0;
          dz_ext1 = dz0 + 1;
        } else {
          zsv_ext0 = zsv_ext1 = zsb + 1;
          dz_ext0 = dz_ext1 = dz0 - 1;
        }
      } else {
        const c = aPoint | bPoint;

        if ((c & 0x01) === 0) {
          xsv_ext0 = xsb;
          xsv_ext1 = xsb - 1;
          dx_ext0 = dx0 - 2 * SQUISH_CONSTANT_3D;
          dx_ext1 = dx0 + 1 - SQUISH_CONSTANT_3D;
        } else {
          xsv_ext0 = xsv_ext1 = xsb + 1;
          dx_ext0 = dx0 - 1 - 2 * SQUISH_CONSTANT_3D;
          dx_ext1 = dx0 - 1 - SQUISH_CONSTANT_3D;
        }

        if ((c & 0x02) === 0) {
          ysv_ext0 = ysb;
          ysv_ext1 = ysb - 1;
          dy_ext0 = dy0 - 2 * SQUISH_CONSTANT_3D;
          dy_ext1 = dy0 + 1 - SQUISH_CONSTANT_3D;
        } else {
          ysv_ext0 = ysv_ext1 = ysb + 1;
          dy_ext0 = dy0 - 1 - 2 * SQUISH_CONSTANT_3D;
          dy_ext1 = dy0 - 1 - SQUISH_CONSTANT_3D;
        }

        if ((c & 0x04) === 0) {
          zsv_ext0 = zsb;
          zsv_ext1 = zsb - 1;
          dz_ext0 = dz0 - 2 * SQUISH_CONSTANT_3D;
          dz_ext1 = dz0 + 1 - SQUISH_CONSTANT_3D;
        } else {
          zsv_ext0 = zsv_ext1 = zsb + 1;
          dz_ext0 = dz0 - 1 - 2 * SQUISH_CONSTANT_3D;
          dz_ext1 = dz0 - 1 - SQUISH_CONSTANT_3D;
        }
      }

      // Contribution (0,0,0)
      let attn0 = 2 - dx0 * dx0 - dy0 * dy0 - dz0 * dz0;
      if (attn0 > 0) {
        attn0 *= attn0;
        value += attn0 * attn0 * this._extrapolate3D(xsb + 0, ysb + 0, zsb + 0, dx0, dy0, dz0);
      }

      // Contribution (1,0,0)
      const dx1 = dx0 - 1 - SQUISH_CONSTANT_3D;
      const dy1 = dy0 - 0 - SQUISH_CONSTANT_3D;
      const dz1 = dz0 - 0 - SQUISH_CONSTANT_3D;
      let attn1 = 2 - dx1 * dx1 - dy1 * dy1 - dz1 * dz1;
      if (attn1 > 0) {
        attn1 *= attn1;
        value += attn1 * attn1 * this._extrapolate3D(xsb + 1, ysb + 0, zsb + 0, dx1, dy1, dz1);
      }

      // Contribution (0,1,0)
      const dx2 = dx0 - 0 - SQUISH_CONSTANT_3D;
      const dy2 = dy0 - 1 - SQUISH_CONSTANT_3D;
      const dz2 = dz1;
      let attn2 = 2 - dx2 * dx2 - dy2 * dy2 - dz2 * dz2;
      if (attn2 > 0) {
        attn2 *= attn2;
        value += attn2 * attn2 * this._extrapolate3D(xsb + 0, ysb + 1, zsb + 0, dx2, dy2, dz2);
      }

      // Contribution (0,0,1)
      const dx3 = dx2;
      const dy3 = dy1;
      const dz3 = dz0 - 1 - SQUISH_CONSTANT_3D;
      let attn3 = 2 - dx3 * dx3 - dy3 * dy3 - dz3 * dz3;
      if (attn3 > 0) {
        attn3 *= attn3;
        value += attn3 * attn3 * this._extrapolate3D(xsb + 0, ysb + 0, zsb + 1, dx3, dy3, dz3);
      }
    } else if (inSum >= 2) {
      // Inside the tetrahedron (3-Simplex) at (1,1,1)
      let aPoint = 0x06;
      let aScore = xins;
      let bPoint = 0x05;
      let bScore = yins;
      if (aScore <= bScore && zins < bScore) {
        bScore = zins;
        bPoint = 0x03;
      } else if (aScore > bScore && zins < aScore) {
        aScore = zins;
        aPoint = 0x03;
      }

      const wins = 3 - inSum;
      if (wins < aScore || wins < bScore) {
        const c = bScore < aScore ? bPoint : aPoint;

        if ((c & 0x01) !== 0) {
          xsv_ext0 = xsb + 2;
          xsv_ext1 = xsb + 1;
          dx_ext0 = dx0 - 2 - 3 * SQUISH_CONSTANT_3D;
          dx_ext1 = dx0 - 1 - 3 * SQUISH_CONSTANT_3D;
        } else {
          xsv_ext0 = xsv_ext1 = xsb;
          dx_ext0 = dx_ext1 = dx0 - 3 * SQUISH_CONSTANT_3D;
        }

        if ((c & 0x02) !== 0) {
          ysv_ext0 = ysv_ext1 = ysb + 1;
          dy_ext0 = dy_ext1 = dy0 - 1 - 3 * SQUISH_CONSTANT_3D;
          if ((c & 0x01) !== 0) {
            ysv_ext1 += 1;
            dy_ext1 -= 1;
          } else {
            ysv_ext0 += 1;
            dy_ext0 -= 1;
          }
        } else {
          ysv_ext0 = ysv_ext1 = ysb;
          dy_ext0 = dy_ext1 = dy0 - 3 * SQUISH_CONSTANT_3D;
        }

        if ((c & 0x04) !== 0) {
          zsv_ext0 = zsb + 1;
          zsv_ext1 = zsb + 2;
          dz_ext0 = dz0 - 1 - 3 * SQUISH_CONSTANT_3D;
          dz_ext1 = dz0 - 2 - 3 * SQUISH_CONSTANT_3D;
        } else {
          zsv_ext0 = zsv_ext1 = zsb;
          dz_ext0 = dz_ext1 = dz0 - 3 * SQUISH_CONSTANT_3D;
        }
      } else {
        const c = aPoint & bPoint;

        if ((c & 0x01) !== 0) {
          xsv_ext0 = xsb + 1;
          xsv_ext1 = xsb + 2;
          dx_ext0 = dx0 - 1 - SQUISH_CONSTANT_3D;
          dx_ext1 = dx0 - 2 - 2 * SQUISH_CONSTANT_3D;
        } else {
          xsv_ext0 = xsv_ext1 = xsb;
          dx_ext0 = dx0 - SQUISH_CONSTANT_3D;
          dx_ext1 = dx0 - 2 * SQUISH_CONSTANT_3D;
        }

        if ((c & 0x02) !== 0) {
          ysv_ext0 = ysb + 1;
          ysv_ext1 = ysb + 2;
          dy_ext0 = dy0 - 1 - SQUISH_CONSTANT_3D;
          dy_ext1 = dy0 - 2 - 2 * SQUISH_CONSTANT_3D;
        } else {
          ysv_ext0 = ysv_ext1 = ysb;
          dy_ext0 = dy0 - SQUISH_CONSTANT_3D;
          dy_ext1 = dy0 - 2 * SQUISH_CONSTANT_3D;
        }

        if ((c & 0x04) !== 0) {
          zsv_ext0 = zsb + 1;
          zsv_ext1 = zsb + 2;
          dz_ext0 = dz0 - 1 - SQUISH_CONSTANT_3D;
          dz_ext1 = dz0 - 2 - 2 * SQUISH_CONSTANT_3D;
        } else {
          zsv_ext0 = zsv_ext1 = zsb;
          dz_ext0 = dz0 - SQUISH_CONSTANT_3D;
          dz_ext1 = dz0 - 2 * SQUISH_CONSTANT_3D;
        }
      }

      // Contribution (1,1,0)
      const dx3 = dx0 - 1 - 2 * SQUISH_CONSTANT_3D;
      const dy3 = dy0 - 1 - 2 * SQUISH_CONSTANT_3D;
      const dz3 = dz0 - 0 - 2 * SQUISH_CONSTANT_3D;
      let attn3 = 2 - dx3 * dx3 - dy3 * dy3 - dz3 * dz3;
      if (attn3 > 0) {
        attn3 *= attn3;
        value += attn3 * attn3 * this._extrapolate3D(xsb + 1, ysb + 1, zsb + 0, dx3, dy3, dz3);
      }

      // Contribution (1,0,1)
      const dx2 = dx3;
      const dy2 = dy0 - 0 - 2 * SQUISH_CONSTANT_3D;
      const dz2 = dz0 - 1 - 2 * SQUISH_CONSTANT_3D;
      let attn2 = 2 - dx2 * dx2 - dy2 * dy2 - dz2 * dz2;
      if (attn2 > 0) {
        attn2 *= attn2;
        value += attn2 * attn2 * this._extrapolate3D(xsb + 1, ysb + 0, zsb + 1, dx2, dy2, dz2);
      }

      // Contribution (0,1,1)
      const dx1 = dx0 - 0 - 2 * SQUISH_CONSTANT_3D;
      const dy1 = dy3;
      const dz1 = dz2;
      let attn1 = 2 - dx1 * dx1 - dy1 * dy1 - dz1 * dz1;
      if (attn1 > 0) {
        attn1 *= attn1;
        value += attn1 * attn1 * this._extrapolate3D(xsb + 0, ysb + 1, zsb + 1, dx1, dy1, dz1);
      }

      // Contribution (1,1,1)
      dx0 = dx0 - 1 - 3 * SQUISH_CONSTANT_3D;
      dy0 = dy0 - 1 - 3 * SQUISH_CONSTANT_3D;
      dz0 = dz0 - 1 - 3 * SQUISH_CONSTANT_3D;
      let attn0 = 2 - dx0 * dx0 - dy0 * dy0 - dz0 * dz0;
      if (attn0 > 0) {
        attn0 *= attn0;
        value += attn0 * attn0 * this._extrapolate3D(xsb + 1, ysb + 1, zsb + 1, dx0, dy0, dz0);
      }
    } else {
      // Inside the octahedron (Rectified 3-Simplex) in between
      let aScore;
      let aPoint;
      let aIsFurtherSide;
      let bScore;
      let bPoint;
      let bIsFurtherSide;

      const p1 = xins + yins;
      if (p1 > 1) {
        aScore = p1 - 1;
        aPoint = 0x03;
        aIsFurtherSide = true;
      } else {
        aScore = 1 - p1;
        aPoint = 0x04;
        aIsFurtherSide = false;
      }

      const p2 = xins + zins;
      if (p2 > 1) {
        bScore = p2 - 1;
        bPoint = 0x05;
        bIsFurtherSide = true;
      } else {
        bScore = 1 - p2;
        bPoint = 0x02;
        bIsFurtherSide = false;
      }

      const p3 = yins + zins;
      if (p3 > 1) {
        const score = p3 - 1;
        if (aScore <= bScore && aScore < score) {
          aScore = score;
          aPoint = 0x06;
          aIsFurtherSide = true;
        } else if (aScore > bScore && bScore < score) {
          bScore = score;
          bPoint = 0x06;
          bIsFurtherSide = true;
        }
      } else {
        const score = 1 - p3;
        if (aScore <= bScore && aScore < score) {
          aScore = score;
          aPoint = 0x01;
          aIsFurtherSide = false;
        } else if (aScore > bScore && bScore < score) {
          bScore = score;
          bPoint = 0x01;
          bIsFurtherSide = false;
        }
      }

      if (aIsFurtherSide === bIsFurtherSide) {
        if (aIsFurtherSide) {
          dx_ext0 = dx0 - 1 - 3 * SQUISH_CONSTANT_3D;
          dy_ext0 = dy0 - 1 - 3 * SQUISH_CONSTANT_3D;
          dz_ext0 = dz0 - 1 - 3 * SQUISH_CONSTANT_3D;
          xsv_ext0 = xsb + 1;
          ysv_ext0 = ysb + 1;
          zsv_ext0 = zsb + 1;

          const c = aPoint & bPoint;
          if ((c & 0x01) !== 0) {
            dx_ext1 = dx0 - 2 - 2 * SQUISH_CONSTANT_3D;
            dy_ext1 = dy0 - 2 * SQUISH_CONSTANT_3D;
            dz_ext1 = dz0 - 2 * SQUISH_CONSTANT_3D;
            xsv_ext1 = xsb + 2;
            ysv_ext1 = ysb;
            zsv_ext1 = zsb;
          } else if ((c & 0x02) !== 0) {
            dx_ext1 = dx0 - 2 * SQUISH_CONSTANT_3D;
            dy_ext1 = dy0 - 2 - 2 * SQUISH_CONSTANT_3D;
            dz_ext1 = dz0 - 2 * SQUISH_CONSTANT_3D;
            xsv_ext1 = xsb;
            ysv_ext1 = ysb + 2;
            zsv_ext1 = zsb;
          } else {
            dx_ext1 = dx0 - 2 * SQUISH_CONSTANT_3D;
            dy_ext1 = dy0 - 2 * SQUISH_CONSTANT_3D;
            dz_ext1 = dz0 - 2 - 2 * SQUISH_CONSTANT_3D;
            xsv_ext1 = xsb;
            ysv_ext1 = ysb;
            zsv_ext1 = zsb + 2;
          }
        } else {
          dx_ext0 = dx0;
          dy_ext0 = dy0;
          dz_ext0 = dz0;
          xsv_ext0 = xsb;
          ysv_ext0 = ysb;
          zsv_ext0 = zsb;

          const c = aPoint | bPoint;
          if ((c & 0x01) === 0) {
            dx_ext1 = dx0 + 1 - SQUISH_CONSTANT_3D;
            dy_ext1 = dy0 - 1 - SQUISH_CONSTANT_3D;
            dz_ext1 = dz0 - 1 - SQUISH_CONSTANT_3D;
            xsv_ext1 = xsb - 1;
            ysv_ext1 = ysb + 1;
            zsv_ext1 = zsb + 1;
          } else if ((c & 0x02) === 0) {
            dx_ext1 = dx0 - 1 - SQUISH_CONSTANT_3D;
            dy_ext1 = dy0 + 1 - SQUISH_CONSTANT_3D;
            dz_ext1 = dz0 - 1 - SQUISH_CONSTANT_3D;
            xsv_ext1 = xsb + 1;
            ysv_ext1 = ysb - 1;
            zsv_ext1 = zsb + 1;
          } else {
            dx_ext1 = dx0 - 1 - SQUISH_CONSTANT_3D;
            dy_ext1 = dy0 - 1 - SQUISH_CONSTANT_3D;
            dz_ext1 = dz0 + 1 - SQUISH_CONSTANT_3D;
            xsv_ext1 = xsb + 1;
            ysv_ext1 = ysb + 1;
            zsv_ext1 = zsb - 1;
          }
        }
      } else {
        let c1, c2;
        if (aIsFurtherSide) {
          c1 = aPoint;
          c2 = bPoint;
        } else {
          c1 = bPoint;
          c2 = aPoint;
        }

        if ((c1 & 0x01) === 0) {
          dx_ext0 = dx0 + 1 - SQUISH_CONSTANT_3D;
          dy_ext0 = dy0 - 1 - SQUISH_CONSTANT_3D;
          dz_ext0 = dz0 - 1 - SQUISH_CONSTANT_3D;
          xsv_ext0 = xsb - 1;
          ysv_ext0 = ysb + 1;
          zsv_ext0 = zsb + 1;
        } else if ((c1 & 0x02) === 0) {
          dx_ext0 = dx0 - 1 - SQUISH_CONSTANT_3D;
          dy_ext0 = dy0 + 1 - SQUISH_CONSTANT_3D;
          dz_ext0 = dz0 - 1 - SQUISH_CONSTANT_3D;
          xsv_ext0 = xsb + 1;
          ysv_ext0 = ysb - 1;
          zsv_ext0 = zsb + 1;
        } else {
          dx_ext0 = dx0 - 1 - SQUISH_CONSTANT_3D;
          dy_ext0 = dy0 - 1 - SQUISH_CONSTANT_3D;
          dz_ext0 = dz0 + 1 - SQUISH_CONSTANT_3D;
          xsv_ext0 = xsb + 1;
          ysv_ext0 = ysb + 1;
          zsv_ext0 = zsb - 1;
        }

        dx_ext1 = dx0 - 2 * SQUISH_CONSTANT_3D;
        dy_ext1 = dy0 - 2 * SQUISH_CONSTANT_3D;
        dz_ext1 = dz0 - 2 * SQUISH_CONSTANT_3D;
        xsv_ext1 = xsb;
        ysv_ext1 = ysb;
        zsv_ext1 = zsb;
        if ((c2 & 0x01) !== 0) {
          dx_ext1 -= 2;
          xsv_ext1 += 2;
        } else if ((c2 & 0x02) !== 0) {
          dy_ext1 -= 2;
          ysv_ext1 += 2;
        } else {
          dz_ext1 -= 2;
          zsv_ext1 += 2;
        }
      }

      // Contribution (1,0,0)
      const dx1 = dx0 - 1 - SQUISH_CONSTANT_3D;
      const dy1 = dy0 - 0 - SQUISH_CONSTANT_3D;
      const dz1 = dz0 - 0 - SQUISH_CONSTANT_3D;
      let attn1 = 2 - dx1 * dx1 - dy1 * dy1 - dz1 * dz1;
      if (attn1 > 0) {
        attn1 *= attn1;
        value += attn1 * attn1 * this._extrapolate3D(xsb + 1, ysb + 0, zsb + 0, dx1, dy1, dz1);
      }

      // Contribution (0,1,0)
      const dx2 = dx0 - 0 - SQUISH_CONSTANT_3D;
      const dy2 = dy0 - 1 - SQUISH_CONSTANT_3D;
      const dz2 = dz1;
      let attn2 = 2 - dx2 * dx2 - dy2 * dy2 - dz2 * dz2;
      if (attn2 > 0) {
        attn2 *= attn2;
        value += attn2 * attn2 * this._extrapolate3D(xsb + 0, ysb + 1, zsb + 0, dx2, dy2, dz2);
      }

      // Contribution (0,0,1)
      const dx3 = dx2;
      const dy3 = dy1;
      const dz3 = dz0 - 1 - SQUISH_CONSTANT_3D;
      let attn3 = 2 - dx3 * dx3 - dy3 * dy3 - dz3 * dz3;
      if (attn3 > 0) {
        attn3 *= attn3;
        value += attn3 * attn3 * this._extrapolate3D(xsb + 0, ysb + 0, zsb + 1, dx3, dy3, dz3);
      }

      // Contribution (1,1,0)
      const dx4 = dx0 - 1 - 2 * SQUISH_CONSTANT_3D;
      const dy4 = dy0 - 1 - 2 * SQUISH_CONSTANT_3D;
      const dz4 = dz0 - 0 - 2 * SQUISH_CONSTANT_3D;
      let attn4 = 2 - dx4 * dx4 - dy4 * dy4 - dz4 * dz4;
      if (attn4 > 0) {
        attn4 *= attn4;
        value += attn4 * attn4 * this._extrapolate3D(xsb + 1, ysb + 1, zsb + 0, dx4, dy4, dz4);
      }

      // Contribution (1,0,1)
      const dx5 = dx4;
      const dy5 = dy0 - 0 - 2 * SQUISH_CONSTANT_3D;
      const dz5 = dz0 - 1 - 2 * SQUISH_CONSTANT_3D;
      let attn5 = 2 - dx5 * dx5 - dy5 * dy5 - dz5 * dz5;
      if (attn5 > 0) {
        attn5 *= attn5;
        value += attn5 * attn5 * this._extrapolate3D(xsb + 1, ysb + 0, zsb + 1, dx5, dy5, dz5);
      }

      // Contribution (0,1,1)
      const dx6 = dx0 - 0 - 2 * SQUISH_CONSTANT_3D;
      const dy6 = dy4;
      const dz6 = dz5;
      let attn6 = 2 - dx6 * dx6 - dy6 * dy6 - dz6 * dz6;
      if (attn6 > 0) {
        attn6 *= attn6;
        value += attn6 * attn6 * this._extrapolate3D(xsb + 0, ysb + 1, zsb + 1, dx6, dy6, dz6);
      }
    }

    // First extra vertex
    let attn_ext0 = 2 - dx_ext0 * dx_ext0 - dy_ext0 * dy_ext0 - dz_ext0 * dz_ext0;
    if (attn_ext0 > 0) {
      attn_ext0 *= attn_ext0;
      value += attn_ext0 * attn_ext0 * this._extrapolate3D(xsv_ext0, ysv_ext0, zsv_ext0, dx_ext0, dy_ext0, dz_ext0);
    }

    // Second extra vertex
    let attn_ext1 = 2 - dx_ext1 * dx_ext1 - dy_ext1 * dy_ext1 - dz_ext1 * dz_ext1;
    if (attn_ext1 > 0) {
      attn_ext1 *= attn_ext1;
      value += attn_ext1 * attn_ext1 * this._extrapolate3D(xsv_ext1, ysv_ext1, zsv_ext1, dx_ext1, dy_ext1, dz_ext1);
    }

    return value / NORM_CONSTANT_3D;
  }

  /**
   * 4D OpenSimplex Noise.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} w
   * @returns {number}
   */
  eval4D(x, y, z, w) {
    const stretchOffset = (x + y + z + w) * STRETCH_CONSTANT_4D;
    const xs = x + stretchOffset;
    const ys = y + stretchOffset;
    const zs = z + stretchOffset;
    const ws = w + stretchOffset;

    const xsb = fastFloor(xs);
    const ysb = fastFloor(ys);
    const zsb = fastFloor(zs);
    const wsb = fastFloor(ws);

    const squishOffset = (xsb + ysb + zsb + wsb) * SQUISH_CONSTANT_4D;
    const xb = xsb + squishOffset;
    const yb = ysb + squishOffset;
    const zb = zsb + squishOffset;
    const wb = wsb + squishOffset;

    const xins = xs - xsb;
    const yins = ys - ysb;
    const zins = zs - zsb;
    const wins = ws - wsb;

    const inSum = xins + yins + zins + wins;

    const dx0 = x - xb;
    const dy0 = y - yb;
    const dz0 = z - zb;
    const dw0 = w - wb;

    let value = 0.0;
    const corners = [
      [0, 0, 0, 0],
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [1, 1, 1, 1]
    ];
    for (let i = 0; i < corners.length; i++) {
      const [ox, oy, oz, ow] = corners[i];
      const s = (ox + oy + oz + ow) * SQUISH_CONSTANT_4D;
      const dx = dx0 - ox - s;
      const dy = dy0 - oy - s;
      const dz = dz0 - oz - s;
      const dw = dw0 - ow - s;
      let attn = 2 - dx * dx - dy * dy - dz * dz - dw * dw;
      if (attn > 0 && Math.abs(inSum - (ox + oy + oz + ow)) <= 2) {
        attn *= attn;
        value += attn * attn * this._extrapolate4D(xsb + ox, ysb + oy, zsb + oz, wsb + ow, dx, dy, dz, dw);
      }
    }
    return value / NORM_CONSTANT_4D;
  }

  _extrapolate2D(xsb, ysb, dx, dy) {
    const index = this.perm[(this.perm[xsb & 0xff] + ysb) & 0xff] & 0x0e;
    return GRADIENTS_2D[index] * dx + GRADIENTS_2D[index + 1] * dy;
  }

  _extrapolate3D(xsb, ysb, zsb, dx, dy, dz) {
    const index = this.permGradIndex3D[(this.perm[(this.perm[xsb & 0xff] + ysb) & 0xff] + zsb) & 0xff];
    return GRADIENTS_3D[index] * dx + GRADIENTS_3D[index + 1] * dy + GRADIENTS_3D[index + 2] * dz;
  }

  _extrapolate4D(xsb, ysb, zsb, wsb, dx, dy, dz, dw) {
    const index = this.perm[(this.perm[(this.perm[(this.perm[xsb & 0xff] + ysb) & 0xff] + zsb) & 0xff] + wsb) & 0xff] & 0xfc;
    return (
      GRADIENTS_4D[index] * dx +
      GRADIENTS_4D[index + 1] * dy +
      GRADIENTS_4D[index + 2] * dz +
      GRADIENTS_4D[index + 3] * dw
    );
  }
}

export default OpenSimplexNoise;
