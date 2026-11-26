// A small seeded random number generator (mulberry32): the same seed gives the
// same islands and the same ring layout, which is what makes routes and the
// screenshot scenes repeatable.
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 2D hash noise in [-1, 1] for terrain bumps. */
export function hashNoise(x, z, seed) {
  const s = Math.sin(x * 12.9898 + z * 78.233 + seed * 0.731) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
