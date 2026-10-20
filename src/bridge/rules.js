// Pure gameplay rules: seeded randomness, difficulty, route generation and
// landing checks. No DOM access, so these run under `node --test`.
import {MODES, MODE_NAMES, LANDING_MARGIN} from './constants.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = t => 1 - (1 - clamp(t, 0, 1)) ** 3;
export const easeInOut = t => { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
export const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1, u = clamp(t, 0, 1) - 1; return 1 + c3 * u * u * u + c1 * u * u; };

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// FNV-1a string hash, used for the daily seed.
export function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Linear congruential generator. Calling it consumes the shared stream, so
// the order of calls decides the daily route.
export function createRng(seed) {
  const rng = () => { rng.seed = (Math.imul(rng.seed, 1664525) + 1013904223) >>> 0; return rng.seed / 4294967296; };
  rng.seed = seed >>> 0;
  return rng;
}

export function runSeed(mode, day = dateKey()) {
  return mode === 'daily' ? hashSeed('fruit-bridge:' + day) : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

export const isMode = m => MODES.includes(m);
export const modeName = m => MODE_NAMES[m] || MODE_NAMES.endless;

export function hellMultiplier(points) { return 20 + Math.min(80, Math.floor(Math.max(0, points) / 3)); }
export function mythMultiplier(points) { return 200 + Math.min(800, Math.floor(Math.max(0, points) / 2)); }

// 0–1. Endless and daily stay flat for the first 300 points, then ramp up.
export function difficultyLevel(points, mode) {
  if (mode === 'hell') return clamp((hellMultiplier(points) - 20) / 80, 0, 1);
  if (mode === 'myth') return clamp((mythMultiplier(points) - 200) / 800, 0, 1);
  return points <= 300 ? 0 : Math.pow(clamp((points - 300) / 520, 0, 1), .62);
}

// Width of the pit before the next platform. Hell and myth replace the base
// roll but still consume it, which keeps every mode on the same rng cadence.
export function nextGap(rng, mode, d) {
  const roll = rng();
  let gap = roll < .24 ? 5 + rng() * 24 : roll < .72 ? 38 + rng() * 125 : 115 + rng() * 290;
  if (mode === 'hell') gap = 90 + rng() * 260 + d * (130 + rng() * 300);
  if (mode === 'myth') gap = 220 + rng() * 520 + d * (260 + rng() * 520);
  return gap + d * (65 + rng() * 220);
}

export function platformWidth(rng, mode, d) {
  if (mode === 'myth') return Math.max(12, 38 + rng() * 128 - d * (22 + rng() * 30));
  if (mode === 'hell') return Math.max(28, 70 + rng() * 145 - d * (35 + rng() * 46));
  return Math.max(38, 42 + rng() * 190 - d * (42 + rng() * 65));
}

// Longest board the player can grow for this gap.
export function boardMax(mode, gap, targetWidth) {
  const cap = mode === 'myth' ? 2200 : mode === 'hell' ? 980 : 760;
  return Math.max(170, Math.min(cap, gap + targetWidth * .98));
}

// Where the dropped board's end lands relative to the target platform.
export function judgeLanding(end, target) {
  const ok = !!target && end >= target.left + LANDING_MARGIN && end <= target.left + target.width - LANDING_MARGIN;
  const perfect = ok && Math.abs(end - (target.left + target.width / 2)) <= Math.max(13, target.width * .14);
  return {ok, perfect};
}

export const bridgePoints = perfect => 1 + (perfect ? 1 : 0);

// Mode name expected by the gzjump-submit Edge Function. Hell runs are
// submitted as endless, matching the server's accepted modes.
export function uploadMode(mode) {
  return mode === 'daily' ? 'bridge_daily' : mode === 'myth' ? 'bridge_myth' : 'bridge_endless';
}
