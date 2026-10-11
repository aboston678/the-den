// Small deterministic noise and random helpers for the world layout. Same results in the
// browser and on the server, so everyone's trees and hills are in the same places.

/** Seeded random numbers in [0, 1) (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash of a grid corner to [-1, 1]. */
function corner(ix: number, iz: number, seed: number) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 2147483648 - 1;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in [-1, 1] with features about `scale` metres across. */
export function noise2(x: number, z: number, scale: number, seed = 0) {
  const fx = x / scale, fz = z / scale;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fade(fx - ix), tz = fade(fz - iz);
  const a = corner(ix, iz, seed), b = corner(ix + 1, iz, seed);
  const c = corner(ix, iz + 1, seed), d = corner(ix + 1, iz + 1, seed);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/** A few octaves of noise: big gentle shapes plus smaller bumps. */
export function fbm(x: number, z: number, scale: number, seed = 0, octaves = 3) {
  let sum = 0, amp = 1, norm = 0, s = scale;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x, z, s, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.45;
    s *= 0.5;
  }
  return sum / norm;
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 below `a`, 1 above `b`, smooth in between (works with a > b too). */
export function smoothstep(a: number, b: number, v: number) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}
