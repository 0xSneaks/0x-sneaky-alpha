import { describe, expect, it } from 'vitest';
import { cleanName, greetingFor } from '../src/core/greeting';
import { LIT_MS, LOAD_MS, glitchIntensity, loadProgress, loadingUiAlpha, tubeAlpha } from '../src/core/intro';

describe('greeting (matches Android Greeting.kt)', () => {
  it('uses the welcome line without a name', () => {
    expect(greetingFor(9, '  ')).toBe('Welcome to 0x Sneaky Alpha.');
  });
  it.each([
    [5, 'Good morning, Neo'], [11, 'Good morning, Neo'], [12, 'Good afternoon, Neo'], [16, 'Good afternoon, Neo'],
    [17, 'Good evening, Neo'], [21, 'Good evening, Neo'], [22, 'Hey, Neo'], [0, 'Hey, Neo'], [4, 'Hey, Neo'],
  ])('hour %i → %s', (h, text) => expect(greetingFor(h, 'Neo')).toBe(text));
  it('trims and caps names at 40 chars', () => {
    expect(cleanName('  ' + 'x'.repeat(50))).toHaveLength(40);
  });
});

describe('neon intro curves (ported from the Android launch intro)', () => {
  it('fills the bar monotonically to 100%', () => {
    let prev = -1;
    for (let t = 0; t <= LOAD_MS; t += 50) {
      const p = loadProgress(t);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(loadProgress(LOAD_MS)).toBe(1);
  });
  it('is glitch-free once loading passes 75% (until the late twitch)', () => {
    expect(glitchIntensity(2000, 0.8)).toBe(0);
    expect(glitchIntensity(0, 0)).toBeGreaterThan(0.8);
  });
  it('fades the loading UI and lights the tube', () => {
    expect(loadingUiAlpha(0)).toBe(1);
    expect(loadingUiAlpha(LOAD_MS + 400)).toBe(0);
    expect(tubeAlpha(-1)).toBe(0);
    expect(tubeAlpha(100)).toBeLessThan(0.1);
    expect(tubeAlpha(LIT_MS)).toBeGreaterThan(0.9);
  });
});
