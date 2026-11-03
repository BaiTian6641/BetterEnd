/**
 * Minimal Molang -> JavaScript translator used only by the placement tests. It supports exactly the
 * grammar emitted by `tools/placement-molang.mjs` / `tools/content-compiler.mjs` feature rules:
 * `math.*`, `query.heightmap`, `query.noise`, `variable.*`, arithmetic, comparisons, `&&`, `||`
 * and the ternary operator. Angles are degrees, like Molang.
 */

const DEG = Math.PI / 180;

export function createMolangContext({ heightmap, noise }) {
  const counters = { sin: 0, cos: 0, noise: 0, heightmap: 0 };
  const M = {
    sin: degrees => {
      counters.sin += 1;
      return Math.sin(degrees * DEG);
    },
    cos: degrees => {
      counters.cos += 1;
      return Math.cos(degrees * DEG);
    },
    floor: Math.floor,
    abs: Math.abs,
    max: Math.max,
    min: Math.min,
    pow: Math.pow,
    mod: (a, b) => a % b,
    clamp: (value, lo, hi) => Math.max(lo, Math.min(hi, value))
  };
  const Q = {
    heightmap: (x, z) => {
      counters.heightmap += 1;
      return heightmap(Math.floor(x), Math.floor(z));
    },
    noise: (x, z) => {
      counters.noise += 1;
      return noise(x, z);
    }
  };
  const cache = new Map();
  function compile(expression) {
    let fn = cache.get(expression);
    if (!fn) {
      const js = String(expression)
        .replace(/\bvariable\.(\w+)/g, 'V.$1')
        .replace(/\bquery\.(\w+)/g, 'Q.$1')
        .replace(/\bmath\.(\w+)/g, 'M.$1');
      // eslint-disable-next-line no-new-func
      fn = new Function('V', 'Q', 'M', `return (${js});`);
      cache.set(expression, fn);
    }
    return fn;
  }
  return {
    counters,
    resetCounters() {
      for (const key of Object.keys(counters)) counters[key] = 0;
    },
    evaluate(expression, variables) {
      if (typeof expression === 'number') return expression;
      const value = compile(expression)(variables, Q, M);
      return typeof value === 'boolean' ? Number(value) : value;
    }
  };
}

/** Small deterministic PRNG (mulberry32) so simulations are reproducible. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
