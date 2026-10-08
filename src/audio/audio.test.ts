import { describe, expect, it } from 'vitest';
import {
  FAR_DISTANCE,
  FAR_GAIN,
  MAX_VOICES,
  NEAR_DISTANCE,
  RECIPES,
  VoiceGate,
  recipeDuration,
  spatialize,
} from './sounds';
import type { SoundType } from './cues';
import { THEMES, midiToHz, notesForStep, secondsPerStep, type ThemeName } from './music';
import { DEFAULT_SETTINGS, loadSettings } from './brawlAudio';
import { KITS, getKit } from '../sim/kits';
import type { BrawlerId } from '../types/brawl';

describe('the recipes', () => {
  const entries = Object.entries(RECIPES) as Array<[SoundType, (typeof RECIPES)[SoundType]]>;

  it('are all well formed', () => {
    for (const [name, recipe] of entries) {
      expect(recipe.layers.length, name).toBeGreaterThan(0);
      for (const layer of recipe.layers) {
        expect(layer.duration, name).toBeGreaterThan(0);
        expect(layer.gain, name).toBeGreaterThan(0);
        expect(layer.gain, name + ' would clip on its own').toBeLessThanOrEqual(0.6);
        expect(layer.from, name).toBeGreaterThan(0);
        if (layer.kind === 'tone') expect(layer.to, name).toBeGreaterThan(0);
        // An exponential ramp to zero or from zero is an error in the audio API.
        if (layer.kind === 'noise' && layer.to !== undefined) expect(layer.to, name).toBeGreaterThan(0);
        expect(layer.delay ?? 0, name).toBeGreaterThanOrEqual(0);
      }
      expect(recipe.cooldownMs, name).toBeGreaterThanOrEqual(0);
    }
  });

  it('keep every sound short enough not to hog a voice', () => {
    for (const [name, recipe] of entries) {
      expect(recipeDuration(recipe), name).toBeLessThan(1.2);
    }
  });

  it('cover every sound a kit asks for', () => {
    // A cue that has no recipe is silently dropped, which is exactly how a new
    // character ends up with no sound and nobody notices.
    // Read straight off the serialised kit, so nothing nested can be missed:
    // gadgets, combos, empowered shots, what a summon does when it breaks.
    const cues = new Set<string>();
    for (const id of Object.keys(KITS) as BrawlerId[]) {
      for (const star of [0, 1]) {
        const text = JSON.stringify(getKit(id, star));
        for (const m of text.matchAll(/"type":"sound","cue":"([a-z_]+)"/g)) cues.add(m[1]);
      }
    }
    expect(cues.size).toBeGreaterThan(5);
    for (const cue of cues) expect(RECIPES[cue as SoundType], cue).toBeDefined();
  });

  it('keep the interface sounds out of the world', () => {
    for (const name of ['countdown_tick', 'countdown_go', 'kill', 'star_player', 'alarm'] as SoundType[]) {
      expect(RECIPES[name].spatial, name).toBe(false);
    }
  });
});

describe('distance and stereo', () => {
  it('is full volume and centred right beside you', () => {
    expect(spatialize(500, 500, 500, 500)).toEqual({ gain: 1, pan: 0 });
  });

  it('is full volume anywhere inside the near distance', () => {
    expect(spatialize(500 + NEAR_DISTANCE, 500, 500, 500).gain).toBe(1);
  });

  it('gets quieter with distance, steadily', () => {
    const gains = [300, 600, 900, 1200].map(d => spatialize(500 + d, 500, 500, 500).gain);
    for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeLessThan(gains[i - 1]);
  });

  it('never goes silent, so a distant fight is still a fight you can hear', () => {
    expect(spatialize(500 + FAR_DISTANCE * 3, 500, 500, 500).gain).toBeCloseTo(FAR_GAIN, 5);
  });

  it('pans toward the side the sound is on', () => {
    expect(spatialize(900, 500, 500, 500).pan).toBeGreaterThan(0.2);
    expect(spatialize(100, 500, 500, 500).pan).toBeLessThan(-0.2);
  });

  it('does not pan on the vertical axis alone', () => {
    // Something directly above you is not in either ear.
    expect(spatialize(500, 100, 500, 500).pan).toBe(0);
  });

  it('never pans hard to one side', () => {
    expect(Math.abs(spatialize(99999, 500, 500, 500).pan)).toBeLessThanOrEqual(0.8);
    expect(Math.abs(spatialize(-99999, 500, 500, 500).pan)).toBeLessThanOrEqual(0.8);
  });
});

describe('who gets to play', () => {
  it('refuses the same sound inside its cooldown', () => {
    // Ten bullets in a burst should be a burst, not ten stacked bangs.
    const gate = new VoiceGate();
    expect(gate.allow('rapid_shot', 0, 1, 55)).toBe(true);
    gate.begin('rapid_shot', 0, 100);
    expect(gate.allow('rapid_shot', 30, 1, 55)).toBe(false);
    expect(gate.allow('rapid_shot', 60, 1, 55)).toBe(true);
  });

  it('lets a different sound through while one is cooling down', () => {
    const gate = new VoiceGate();
    gate.begin('rapid_shot', 0, 100);
    expect(gate.allow('explosion', 10, 2, 80)).toBe(true);
  });

  it('drops texture first when the mix is getting full', () => {
    const gate = new VoiceGate(8);
    for (let i = 0; i < 6; i++) gate.begin('s' + i, 0, 1000);
    expect(gate.allow('texture', 10, 1, 0)).toBe(false);
    expect(gate.allow('ordinary', 10, 2, 0)).toBe(true);
  });

  it('lets only the essential sounds in once it is full', () => {
    const gate = new VoiceGate(4);
    for (let i = 0; i < 4; i++) gate.begin('s' + i, 0, 1000);
    expect(gate.allow('ordinary', 10, 2, 0)).toBe(false);
    expect(gate.allow('must hear', 10, 3, 0)).toBe(true);
  });

  it('frees a voice when its sound ends', () => {
    const gate = new VoiceGate(2);
    gate.begin('a', 0, 100);
    gate.begin('b', 0, 100);
    expect(gate.allow('c', 50, 2, 0)).toBe(false);
    expect(gate.allow('c', 150, 2, 0)).toBe(true);
    expect(gate.active).toBe(0);
  });

  it('is generous enough that an ordinary fight is never the thing that is cut', () => {
    expect(MAX_VOICES).toBeGreaterThanOrEqual(16);
  });
});

describe('the music', () => {
  const names = Object.keys(THEMES) as ThemeName[];

  it('has a loop of sixteen steps for every part of every theme', () => {
    for (const name of names) {
      const t = THEMES[name];
      expect(t.bass, name).toHaveLength(16);
      expect(t.lead, name).toHaveLength(16);
      expect(t.kick, name).toHaveLength(16);
      expect(t.hat, name).toHaveLength(16);
    }
  });

  it('plays notes in a range a speaker can use', () => {
    for (const name of names) {
      for (let step = 0; step < 16; step++) {
        const n = notesForStep(THEMES[name], step);
        for (const hz of [n.bass, n.lead]) {
          if (hz === null) continue;
          expect(hz, name).toBeGreaterThan(30);
          expect(hz, name).toBeLessThan(2500);
        }
      }
    }
  });

  it('repeats exactly, bar after bar', () => {
    for (const name of names) {
      for (let step = 0; step < 16; step++) {
        expect(notesForStep(THEMES[name], step + 16)).toEqual(notesForStep(THEMES[name], step));
        expect(notesForStep(THEMES[name], step + 160)).toEqual(notesForStep(THEMES[name], step));
      }
    }
  });

  it('keeps the bass below the lead', () => {
    for (const name of names) {
      const t = THEMES[name];
      expect(t.bassShift, name).toBeLessThan(t.leadShift);
    }
  });

  it('has something on most bars, so it is never dead air', () => {
    for (const name of names) {
      let sounding = 0;
      for (let step = 0; step < 16; step++) {
        const n = notesForStep(THEMES[name], step);
        if (n.bass !== null || n.lead !== null || n.kick || n.hat) sounding++;
      }
      expect(sounding, name).toBeGreaterThanOrEqual(6);
    }
  });

  it('keeps the lobby gentle and the matches driving', () => {
    expect(THEMES.lobby.drums).toBe(false);
    expect(THEMES.showdown.drums).toBe(true);
    expect(THEMES.showdown.bpm).toBeGreaterThan(THEMES.lobby.bpm);
    for (let step = 0; step < 16; step++) {
      const n = notesForStep(THEMES.lobby, step);
      expect(n.kick || n.hat).toBe(false);
    }
  });

  it('turns beats per minute into a step length', () => {
    // 120 bpm is two beats a second, four sixteenths to a beat.
    expect(secondsPerStep({ ...THEMES.lobby, bpm: 120 })).toBeCloseTo(0.125, 6);
  });

  it('uses concert pitch', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(57)).toBeCloseTo(220, 6);
  });
});

describe('settings', () => {
  it('start from the defaults when nothing is saved', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('keep the music well under the effects, so a fight is not drowned', () => {
    expect(DEFAULT_SETTINGS.music).toBeLessThan(DEFAULT_SETTINGS.sfx);
  });
});
