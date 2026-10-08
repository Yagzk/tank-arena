/**
 * What every sound is, as data, and the rules for when it may play.
 *
 * The old audio module was fourteen hand-written functions, each wiring its own
 * oscillators. Nothing kept the same sound from stacking on itself — ten bullets
 * in a burst were ten overlapping bangs — nothing made a far-off explosion
 * quieter than one beside you, and a new sound meant a new function. A sound is
 * now a recipe, one player turns any recipe into audio, and the parts that are
 * decisions rather than plumbing — how loud something is from where you stand,
 * whether it is allowed to play at all — are plain functions that can be tested.
 */

import type { SoundType } from './cues';
export type { SoundType };

/** One component of a sound. Several, layered, make the sound. */
export type Layer =
  | {
      kind: 'tone';
      wave: OscillatorType;
      /** Frequency at the start and end, swept exponentially. */
      from: number;
      to: number;
      duration: number;
      gain: number;
      /** Seconds before this layer starts, so a recipe can be a sequence. */
      delay?: number;
    }
  | {
      kind: 'noise';
      duration: number;
      gain: number;
      filter: BiquadFilterType;
      from: number;
      to?: number;
      q?: number;
      delay?: number;
    };

export interface Recipe {
  layers: Layer[];
  /**
   * 1 is texture, 2 is ordinary, 3 is something the player must not miss. Under
   * load the low ones are dropped first.
   */
  priority: 1 | 2 | 3;
  /** The same sound may not restart within this many milliseconds. */
  cooldownMs: number;
  /** Quieter and panned with distance. Interface sounds are not. */
  spatial: boolean;
}

export const RECIPES: Record<SoundType, Recipe> = {
  scatter_shot: {
    priority: 2,
    cooldownMs: 90,
    spatial: true,
    layers: [
      { kind: 'tone', wave: 'sawtooth', from: 240, to: 32, duration: 0.14, gain: 0.4 },
      { kind: 'noise', duration: 0.12, gain: 0.45, filter: 'lowpass', from: 1400 },
    ],
  },
  rapid_shot: {
    // A burst is six of these in under half a second; without a cooldown they
    // smear into one long buzz.
    priority: 1,
    cooldownMs: 55,
    spatial: true,
    layers: [
      { kind: 'tone', wave: 'square', from: 520, to: 180, duration: 0.05, gain: 0.16 },
      { kind: 'noise', duration: 0.04, gain: 0.2, filter: 'bandpass', from: 3000, q: 1.2 },
    ],
  },
  heavy_punch: {
    priority: 2,
    cooldownMs: 70,
    spatial: true,
    layers: [
      { kind: 'tone', wave: 'sine', from: 130, to: 45, duration: 0.12, gain: 0.5 },
      { kind: 'noise', duration: 0.08, gain: 0.4, filter: 'lowpass', from: 500 },
    ],
  },
  heavy_leap: {
    priority: 2,
    cooldownMs: 200,
    spatial: true,
    layers: [
      { kind: 'tone', wave: 'sine', from: 90, to: 300, duration: 0.25, gain: 0.25 },
      { kind: 'noise', duration: 0.2, gain: 0.15, filter: 'bandpass', from: 800, to: 1600 },
    ],
  },
  rocket_launch: {
    priority: 2,
    cooldownMs: 90,
    spatial: true,
    layers: [
      { kind: 'noise', duration: 0.35, gain: 0.35, filter: 'bandpass', from: 400, to: 1800, q: 0.8 },
      { kind: 'tone', wave: 'sawtooth', from: 90, to: 40, duration: 0.3, gain: 0.25 },
    ],
  },
  blade_throw: {
    priority: 1,
    cooldownMs: 50,
    spatial: true,
    layers: [
      { kind: 'noise', duration: 0.12, gain: 0.2, filter: 'highpass', from: 2500, to: 6000 },
      { kind: 'tone', wave: 'triangle', from: 900, to: 1500, duration: 0.1, gain: 0.1 },
    ],
  },
  turret_shot: {
    priority: 1,
    cooldownMs: 120,
    spatial: true,
    layers: [
      { kind: 'tone', wave: 'square', from: 700, to: 300, duration: 0.06, gain: 0.14 },
      { kind: 'noise', duration: 0.04, gain: 0.12, filter: 'bandpass', from: 2200 },
    ],
  },
  super_ready: {
    priority: 3,
    cooldownMs: 400,
    spatial: false,
    layers: [
      { kind: 'tone', wave: 'sine', from: 660, to: 660, duration: 0.12, gain: 0.2 },
      { kind: 'tone', wave: 'sine', from: 880, to: 880, duration: 0.12, gain: 0.2, delay: 0.08 },
      { kind: 'tone', wave: 'sine', from: 1320, to: 1320, duration: 0.22, gain: 0.22, delay: 0.16 },
    ],
  },
  super_blast: {
    priority: 3,
    cooldownMs: 120,
    spatial: true,
    layers: [
      { kind: 'tone', wave: 'sine', from: 160, to: 24, duration: 0.5, gain: 0.55 },
      { kind: 'noise', duration: 0.5, gain: 0.5, filter: 'lowpass', from: 900, to: 200 },
    ],
  },
  explosion: {
    priority: 2,
    cooldownMs: 80,
    spatial: true,
    layers: [
      { kind: 'noise', duration: 0.45, gain: 0.55, filter: 'lowpass', from: 1200, to: 150 },
      { kind: 'tone', wave: 'sine', from: 120, to: 30, duration: 0.4, gain: 0.5 },
    ],
  },
  gadget_activate: {
    priority: 2,
    cooldownMs: 150,
    spatial: true,
    layers: [
      { kind: 'tone', wave: 'square', from: 440, to: 880, duration: 0.1, gain: 0.15 },
      { kind: 'tone', wave: 'square', from: 880, to: 880, duration: 0.08, gain: 0.12, delay: 0.09 },
    ],
  },
  band_aid: {
    priority: 2,
    cooldownMs: 300,
    spatial: true,
    layers: [
      { kind: 'tone', wave: 'sine', from: 523, to: 784, duration: 0.2, gain: 0.2 },
      { kind: 'tone', wave: 'sine', from: 784, to: 1047, duration: 0.2, gain: 0.18, delay: 0.1 },
    ],
  },
  heal_pulse: {
    priority: 1,
    cooldownMs: 250,
    spatial: true,
    layers: [
      { kind: 'tone', wave: 'sine', from: 660, to: 990, duration: 0.3, gain: 0.16 },
      { kind: 'tone', wave: 'sine', from: 990, to: 990, duration: 0.2, gain: 0.1, delay: 0.12 },
    ],
  },
  shield_up: {
    priority: 2,
    cooldownMs: 200,
    spatial: true,
    layers: [
      { kind: 'tone', wave: 'triangle', from: 600, to: 1200, duration: 0.25, gain: 0.18 },
      { kind: 'noise', duration: 0.25, gain: 0.08, filter: 'highpass', from: 5000 },
    ],
  },
  rapid_reload: {
    priority: 1,
    cooldownMs: 120,
    spatial: true,
    layers: [
      { kind: 'tone', wave: 'square', from: 1200, to: 1100, duration: 0.03, gain: 0.14 },
      { kind: 'tone', wave: 'square', from: 1600, to: 1500, duration: 0.03, gain: 0.14, delay: 0.06 },
    ],
  },
  gem_pickup: {
    priority: 2,
    cooldownMs: 60,
    spatial: true,
    layers: [
      { kind: 'tone', wave: 'sine', from: 1318, to: 1318, duration: 0.08, gain: 0.18 },
      { kind: 'tone', wave: 'sine', from: 1760, to: 1760, duration: 0.12, gain: 0.18, delay: 0.07 },
    ],
  },
  cube_pickup: {
    priority: 2,
    cooldownMs: 60,
    spatial: true,
    layers: [{ kind: 'tone', wave: 'sine', from: 523, to: 1047, duration: 0.2, gain: 0.2 }],
  },
  hit: {
    // The most frequent sound in the game, so it is short, quiet and rationed.
    priority: 1,
    cooldownMs: 45,
    spatial: true,
    layers: [
      { kind: 'noise', duration: 0.05, gain: 0.22, filter: 'bandpass', from: 1800, q: 1 },
      { kind: 'tone', wave: 'sine', from: 200, to: 90, duration: 0.06, gain: 0.22 },
    ],
  },
  kill: {
    priority: 3,
    cooldownMs: 200,
    spatial: false,
    layers: [
      { kind: 'tone', wave: 'sawtooth', from: 220, to: 110, duration: 0.2, gain: 0.28 },
      { kind: 'tone', wave: 'sine', from: 880, to: 1320, duration: 0.25, gain: 0.25, delay: 0.1 },
    ],
  },
  death: {
    priority: 3,
    cooldownMs: 150,
    spatial: true,
    layers: [
      { kind: 'tone', wave: 'sine', from: 300, to: 60, duration: 0.5, gain: 0.4 },
      { kind: 'noise', duration: 0.3, gain: 0.25, filter: 'lowpass', from: 800, to: 120 },
    ],
  },
  respawn: {
    priority: 2,
    cooldownMs: 300,
    spatial: true,
    layers: [{ kind: 'tone', wave: 'sine', from: 200, to: 800, duration: 0.35, gain: 0.22 }],
  },
  star_player: {
    priority: 3,
    cooldownMs: 1000,
    spatial: false,
    layers: [
      { kind: 'tone', wave: 'triangle', from: 523, to: 523, duration: 0.15, gain: 0.25 },
      { kind: 'tone', wave: 'triangle', from: 659, to: 659, duration: 0.15, gain: 0.25, delay: 0.14 },
      { kind: 'tone', wave: 'triangle', from: 784, to: 784, duration: 0.15, gain: 0.25, delay: 0.28 },
      { kind: 'tone', wave: 'triangle', from: 1047, to: 1047, duration: 0.5, gain: 0.3, delay: 0.42 },
    ],
  },
  alarm: {
    priority: 3,
    cooldownMs: 800,
    spatial: false,
    layers: [
      { kind: 'tone', wave: 'square', from: 880, to: 880, duration: 0.12, gain: 0.14 },
      { kind: 'tone', wave: 'square', from: 880, to: 880, duration: 0.12, gain: 0.14, delay: 0.2 },
      { kind: 'tone', wave: 'square', from: 880, to: 880, duration: 0.12, gain: 0.14, delay: 0.4 },
    ],
  },
  countdown_tick: {
    priority: 3,
    cooldownMs: 300,
    spatial: false,
    layers: [{ kind: 'tone', wave: 'sine', from: 660, to: 660, duration: 0.12, gain: 0.25 }],
  },
  countdown_go: {
    priority: 3,
    cooldownMs: 500,
    spatial: false,
    layers: [
      { kind: 'tone', wave: 'sine', from: 990, to: 990, duration: 0.35, gain: 0.3 },
      { kind: 'tone', wave: 'sine', from: 1320, to: 1320, duration: 0.35, gain: 0.2 },
    ],
  },
};

/* ---------------------------------------------------------------- *
 * Where a sound is, relative to the listener.
 * ---------------------------------------------------------------- */

/** Inside this, a sound is at full volume. */
export const NEAR_DISTANCE = 250;
/** Beyond this, it has stopped getting quieter. */
export const FAR_DISTANCE = 1400;
/** What is left at `FAR_DISTANCE`: faint, never silent, so a distant fight is still heard. */
export const FAR_GAIN = 0.12;
/** Horizontal distance at which a sound is fully to one side. */
const PAN_DISTANCE = 700;
/** Never pan hard: a sound entirely in one ear is tiring and unnatural. */
const PAN_LIMIT = 0.8;

export interface Spatial {
  gain: number;
  pan: number;
}

export function spatialize(
  sourceX: number,
  sourceY: number,
  listenerX: number,
  listenerY: number
): Spatial {
  const dx = sourceX - listenerX;
  const dy = sourceY - listenerY;
  const distance = Math.hypot(dx, dy);

  let gain = 1;
  if (distance > NEAR_DISTANCE) {
    const t = Math.min(1, (distance - NEAR_DISTANCE) / (FAR_DISTANCE - NEAR_DISTANCE));
    gain = 1 - (1 - FAR_GAIN) * t;
  }

  const pan = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, (dx / PAN_DISTANCE) * PAN_LIMIT));
  return { gain, pan };
}

/* ---------------------------------------------------------------- *
 * Whether a sound may play.
 * ---------------------------------------------------------------- */

/** Voices playing at once before the quiet ones start being dropped. */
export const MAX_VOICES = 24;

/**
 * Decides which sounds are allowed to start.
 *
 * Two rules. The same sound cannot restart inside its cooldown — that is what
 * stops a burst turning into a buzz. And when there are already too many voices,
 * only the important ones get through, so a chaotic moment gets quieter in its
 * texture rather than louder and muddier.
 */
export class VoiceGate {
  private lastStart = new Map<string, number>();
  private endTimes: number[] = [];

  constructor(private readonly maxVoices = MAX_VOICES) {}

  public get active(): number {
    return this.endTimes.length;
  }

  public allow(type: string, nowMs: number, priority: 1 | 2 | 3, cooldownMs: number): boolean {
    this.endTimes = this.endTimes.filter(end => end > nowMs);

    const last = this.lastStart.get(type);
    if (last !== undefined && nowMs - last < cooldownMs) return false;

    if (this.endTimes.length >= this.maxVoices) {
      // Full. Only the sounds that must be heard may push in.
      if (priority < 3) return false;
    } else if (this.endTimes.length >= this.maxVoices * 0.75 && priority === 1) {
      // Nearly full: texture goes first.
      return false;
    }
    return true;
  }

  /** Records that a sound did start, and for how long it will keep a voice. */
  public begin(type: string, nowMs: number, durationMs: number): void {
    this.lastStart.set(type, nowMs);
    this.endTimes.push(nowMs + durationMs);
  }
}

/** How long a recipe keeps its voice busy: its longest layer, delay included. */
export function recipeDuration(recipe: Recipe): number {
  return Math.max(...recipe.layers.map(l => (l.delay ?? 0) + l.duration));
}
