/**
 * Procedural music: a short loop per place, played by a step sequencer.
 *
 * No audio files, for the same reason as the characters: nothing here is
 * borrowed. Each theme is a handful of arrays — a bass line, a lead, a kick and
 * a hat pattern — over a scale, and `notesForStep` turns a step number into
 * what sounds on it. That function is pure, so the music's content is testable;
 * only the scheduling around it touches the audio context.
 */

export type ThemeName = 'lobby' | 'showdown' | 'gem_grab';

export interface Theme {
  bpm: number;
  /** MIDI note the scale starts on. */
  root: number;
  /** Semitone offsets from the root. */
  scale: number[];
  /** One entry per sixteenth, in scale degrees; null is a rest. A bar is sixteen. */
  bass: Array<number | null>;
  lead: Array<number | null>;
  /** Octave shift for each part, in semitones. */
  bassShift: number;
  leadShift: number;
  kick: boolean[];
  hat: boolean[];
  /** Whether the percussion plays. The lobby is gentler than a match. */
  drums: boolean;
  leadWave: OscillatorType;
  bassWave: OscillatorType;
}

const T = true;
const F = false;

export const THEMES: Record<ThemeName, Theme> = {
  lobby: {
    bpm: 96,
    root: 57, // A
    scale: [0, 2, 3, 5, 7, 8, 10], // natural minor
    bass: [0, null, null, null, 0, null, null, null, 5, null, null, null, 3, null, null, null],
    lead: [4, null, null, 2, null, null, 3, null, 4, null, 6, null, 5, null, null, null],
    bassShift: -24,
    leadShift: 0,
    kick: [T, F, F, F, F, F, F, F, T, F, F, F, F, F, F, F],
    hat: [F, F, T, F, F, F, T, F, F, F, T, F, F, F, T, F],
    drums: false,
    leadWave: 'triangle',
    bassWave: 'sine',
  },
  showdown: {
    bpm: 132,
    root: 52, // E
    scale: [0, 1, 3, 5, 7, 8, 10], // phrygian: darker, tenser
    bass: [0, null, 0, null, 0, null, 1, null, 0, null, 0, null, 3, null, 1, null],
    lead: [null, null, 4, null, null, 3, null, null, 4, null, null, 6, null, 5, null, 3],
    bassShift: -12,
    leadShift: 12,
    kick: [T, F, F, F, T, F, F, F, T, F, F, T, T, F, F, F],
    hat: [F, F, T, F, F, F, T, F, F, F, T, F, F, T, T, F],
    drums: true,
    leadWave: 'sawtooth',
    bassWave: 'square',
  },
  gem_grab: {
    bpm: 124,
    root: 55, // G
    scale: [0, 2, 4, 5, 7, 9, 11], // major: brighter, a team game
    bass: [0, null, null, 0, null, null, 4, null, 3, null, null, 3, null, null, 4, null],
    lead: [0, null, 2, null, 4, null, 2, null, 5, null, 4, null, 2, null, 1, null],
    bassShift: -12,
    leadShift: 12,
    kick: [T, F, F, F, F, F, T, F, T, F, F, F, F, F, T, F],
    hat: [F, F, T, F, T, F, T, F, F, F, T, F, T, F, T, F],
    drums: true,
    leadWave: 'square',
    bassWave: 'triangle',
  },
};

export interface StepNotes {
  /** Frequencies in hertz, or null for silence on that voice. */
  bass: number | null;
  lead: number | null;
  kick: boolean;
  hat: boolean;
}

export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** Degree of the scale, possibly beyond its length, as a MIDI note. */
function degreeToMidi(theme: Theme, degree: number, shift: number): number {
  const len = theme.scale.length;
  const octave = Math.floor(degree / len);
  const index = ((degree % len) + len) % len;
  return theme.root + theme.scale[index] + octave * 12 + shift;
}

export function notesForStep(theme: Theme, step: number): StepNotes {
  const i = ((step % 16) + 16) % 16;
  const bass = theme.bass[i];
  const lead = theme.lead[i];
  return {
    bass: bass === null ? null : midiToHz(degreeToMidi(theme, bass, theme.bassShift)),
    lead: lead === null ? null : midiToHz(degreeToMidi(theme, lead, theme.leadShift)),
    kick: theme.drums && theme.kick[i],
    hat: theme.drums && theme.hat[i],
  };
}

export function secondsPerStep(theme: Theme): number {
  return 60 / theme.bpm / 4;
}

/**
 * Plays a theme on a bus.
 *
 * Steps are scheduled well ahead of the clock rather than on a timer tick, so a
 * page whose timers are being throttled — hidden, or busy — still plays
 * smoothly: the timer only has to wake up once in a while to top the queue up.
 */
export class MusicPlayer {
  private theme: Theme | null = null;
  private name: ThemeName | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private step = 0;
  /** Gain applied to this theme alone, so a change of theme can fade. */
  private themeGain: GainNode | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: AudioNode
  ) {}

  public get current(): ThemeName | null {
    return this.name;
  }

  public play(name: ThemeName): void {
    if (this.name === name) return;
    this.stop(0.4);

    const theme = THEMES[name];
    this.theme = theme;
    this.name = name;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.1;

    this.themeGain = this.ctx.createGain();
    this.themeGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.themeGain.gain.exponentialRampToValueAtTime(1, this.ctx.currentTime + 0.6);
    this.themeGain.connect(this.bus);

    this.schedule();
    this.timer = setInterval(() => this.schedule(), 250);
  }

  /** Fades out and releases the theme. */
  public stop(fadeSeconds = 0.4): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;

    const gain = this.themeGain;
    if (gain) {
      const now = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
      setTimeout(() => gain.disconnect(), (fadeSeconds + 0.2) * 1000);
    }
    this.themeGain = null;
    this.theme = null;
    this.name = null;
  }

  private schedule(): void {
    const theme = this.theme;
    const out = this.themeGain;
    if (!theme || !out) return;

    const horizon = this.ctx.currentTime + 1.5;
    const stepLength = secondsPerStep(theme);

    while (this.nextStepTime < horizon) {
      const notes = notesForStep(theme, this.step);
      const t = this.nextStepTime;

      if (notes.bass !== null) this.note(out, theme.bassWave, notes.bass, t, stepLength * 1.8, 0.22);
      if (notes.lead !== null) this.note(out, theme.leadWave, notes.lead, t, stepLength * 1.4, 0.1);
      if (notes.kick) this.kick(out, t);
      if (notes.hat) this.hat(out, t);

      this.nextStepTime += stepLength;
      this.step += 1;
    }
  }

  private note(
    out: AudioNode,
    wave: OscillatorType,
    hz: number,
    when: number,
    length: number,
    level: number
  ): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(hz, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(level, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
    osc.connect(gain);
    gain.connect(out);
    osc.start(when);
    osc.stop(when + length + 0.02);
  }

  private kick(out: AudioNode, when: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, when);
    osc.frequency.exponentialRampToValueAtTime(40, when + 0.12);
    gain.gain.setValueAtTime(0.5, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
    osc.connect(gain);
    gain.connect(out);
    osc.start(when);
    osc.stop(when + 0.16);
  }

  private hat(out: AudioNode, when: number): void {
    const length = 0.04;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * length), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start(when);
  }
}
