// Timing curves for the neon launch intro, ported from the Android launch intro. Licensed under GPL-3.0.

export const LOAD_MS = 2400;
export const SIGN_START_MS = LOAD_MS + 150;
export const LIT_MS = SIGN_START_MS + 900;
export const SIGN_TOP = 785 / 1024;
export const NEON_PINK = '#FF2D95';
export const PINK_CORE = '#FFE3F1';
export const NEON_CYAN = '#2DF6FF';

/** Deterministic 0..1 value per integer seed (stand-in for kotlin.random.Random(seed)). */
export function seeded(seed: number, salt = 0): number {
  let x = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + salt * 0xc2b2ae35) | 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0x27d4eb2f);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** 0..1 bar fill: quick start, a stall near 70% like a real loader, then a finish. */
export function loadProgress(t: number): number {
  const x = Math.min(1, Math.max(0, t / LOAD_MS));
  let eased: number;
  if (x < 0.55) eased = 0.7 * (1 - (1 - x / 0.55) * (1 - x / 0.55));
  else if (x < 0.7) eased = 0.7 + 0.04 * ((x - 0.55) / 0.15);
  else eased = 0.74 + 0.26 * ((x - 0.7) / 0.3);
  return Math.min(1, Math.max(0, eased));
}

/** Heavy glitch early, clean by 75% load; afterwards a rare small twitch. */
export function glitchIntensity(t: number, progress: number): number {
  if (progress < 0.75) {
    const base = 1 - progress / 0.75;
    const spike = seeded(Math.floor(t / 90)) < 0.25 ? 0.3 : 0;
    return Math.min(1, Math.max(0, base * 0.85 + spike * base));
  }
  return t > LIT_MS && (t - LIT_MS) % 4500 < 140 ? 0.15 : 0;
}

export function loadingUiAlpha(t: number): number {
  if (t < LOAD_MS) return 1;
  if (t < LOAD_MS + 300) return 1 - (t - LOAD_MS) / 300;
  return 0;
}

/** Neon tube strike: two misfires, warm-up, then lit with a faint hum. `s` is ms since strike. */
export function tubeAlpha(s: number): number {
  if (s < 0) return 0;
  if (s < 70) return 0.9;
  if (s < 210) return 0.05;
  if (s < 280) return 0.75;
  if (s < 430) return 0.1;
  if (s < 900) return 0.35 + 0.65 * ((s - 430) / 470);
  if (s % 5200 <= 60) return 0.7;
  return 0.94 + 0.06 * (Math.floor(s / 40) % 2);
}
