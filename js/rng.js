// Deterministic maths for the simulation. Nothing in sim.js may use Math.random,
// Date.now, or Math.sin/cos/atan2 (those can differ in the last bit between
// browsers, which would desync replays and ghosts).

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// mulberry32
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PI = 3.141592653589793;
export const TAU = 2 * PI;

export function dsin(x) {
  x -= TAU * Math.floor((x + PI) / TAU);
  if (x > PI / 2) x = PI - x;
  else if (x < -PI / 2) x = -PI - x;
  const s = x * x;
  return x * (1 - (s / 6) * (1 - (s / 20) * (1 - (s / 42) * (1 - (s / 72) * (1 - s / 110)))));
}
export const dcos = (x) => dsin(x + PI / 2);

export function datan2(y, x) {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x), ay = Math.abs(y);
  const a = Math.min(ax, ay) / Math.max(ax, ay);
  const s = a * a;
  let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  if (ay > ax) r = PI / 2 - r;
  if (x < 0) r = PI - r;
  return y < 0 ? -r : r;
}

export const dhyp = (x, y) => Math.sqrt(x * x + y * y);
