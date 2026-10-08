/**
 * The game's audio: effects, music and an announcer, behind one object.
 *
 * What a sound is lives in `sounds.ts`, what the music plays in `music.ts`;
 * this file only owns the audio context and turns those into signal. The old
 * version was fourteen functions that each built their own oscillator chain —
 * no pooling, no distance, no stereo, no music, no volume controls.
 */

import {
  RECIPES,
  VoiceGate,
  recipeDuration,
  spatialize,
  type Layer,
  type SoundType,
} from './sounds';
import { MusicPlayer, type ThemeName } from './music';

export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  voice: number;
  muted: boolean;
}

export const DEFAULT_SETTINGS: AudioSettings = {
  master: 0.9,
  sfx: 1,
  music: 0.45,
  voice: 0.9,
  muted: false,
};

const STORAGE_KEY = 'brwl_audio';

/** A sound as the simulation reports it: what, and where it happened. */
export interface SoundCue {
  type: string;
  x?: number;
  y?: number;
}

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

/** Reads saved settings, tolerating anything — corrupt, missing, blocked. */
export function loadSettings(): AudioSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      master: clamp01(parsed.master, DEFAULT_SETTINGS.master),
      sfx: clamp01(parsed.sfx, DEFAULT_SETTINGS.sfx),
      music: clamp01(parsed.music, DEFAULT_SETTINGS.music),
      voice: clamp01(parsed.voice, DEFAULT_SETTINGS.voice),
      muted: parsed.muted === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

class BrawlAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicPlayer: MusicPlayer | null = null;

  private readonly gate = new VoiceGate();
  private listener: { x: number; y: number } | null = null;
  private settings: AudioSettings = loadSettings();
  /** A theme asked for before the first gesture allowed any sound at all. */
  private wantedMusic: ThemeName | null = null;

  public get isMuted(): boolean {
    return this.settings.muted;
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  /**
   * Browsers refuse to make sound until the player has done something. Called
   * from the first click or key press; anything asked for before that is kept
   * and plays now.
   */
  public unlock(): void {
    this.ensureContext();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    if (this.wantedMusic) this.music(this.wantedMusic);
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;

    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    const ctx = new Ctor();
    this.ctx = ctx;

    // A limiter on the end, because a chaotic moment is dozens of sounds at once
    // and summing them will otherwise clip into harsh distortion.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);

    this.masterGain = ctx.createGain();
    this.masterGain.connect(limiter);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.masterGain);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.masterGain);

    // One second of noise, shared by every sound that needs some.
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;

    this.musicPlayer = new MusicPlayer(ctx, this.musicBus);
    this.applyVolumes();
    return ctx;
  }

  private applyVolumes(): void {
    if (!this.masterGain || !this.sfxBus || !this.musicBus) return;
    const s = this.settings;
    this.masterGain.gain.value = s.muted ? 0 : s.master;
    this.sfxBus.gain.value = s.sfx;
    this.musicBus.gain.value = s.music;
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Private mode or blocked storage: the settings simply do not persist.
    }
  }

  public toggleMute(): boolean {
    this.settings.muted = !this.settings.muted;
    this.applyVolumes();
    if (this.settings.muted && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.save();
    return this.settings.muted;
  }

  public setVolume(channel: 'master' | 'sfx' | 'music' | 'voice', value: number): void {
    this.settings[channel] = clamp01(value, this.settings[channel]);
    this.applyVolumes();
    this.save();
  }

  /** Where the player is, so sounds can be placed relative to them. */
  public setListener(x: number, y: number): void {
    if (!this.listener) this.listener = { x, y };
    else {
      this.listener.x = x;
      this.listener.y = y;
    }
  }

  /** Forgets the listener, between rounds, so a menu sound is not placed in a map. */
  public clearListener(): void {
    this.listener = null;
  }

  public music(name: ThemeName | null): void {
    this.wantedMusic = name;
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (name === null) this.musicPlayer?.stop();
    else this.musicPlayer?.play(name);
  }

  /**
   * Plays a sound from the simulation. Unknown cues are ignored on purpose: a
   * newer server may send a cue this build has no recipe for, and that should be
   * silence rather than an error.
   */
  public play(cue: SoundCue): void {
    if (this.settings.muted) return;
    const recipe = RECIPES[cue.type as SoundType];
    if (!recipe) return;

    const ctx = this.ensureContext();
    if (!ctx || !this.sfxBus || ctx.state !== 'running') return;

    const nowMs = performance.now();
    if (!this.gate.allow(cue.type, nowMs, recipe.priority, recipe.cooldownMs)) return;
    this.gate.begin(cue.type, nowMs, recipeDuration(recipe) * 1000);

    let gain = 1;
    let pan = 0;
    if (recipe.spatial && cue.x !== undefined && cue.y !== undefined && this.listener) {
      const s = spatialize(cue.x, cue.y, this.listener.x, this.listener.y);
      gain = s.gain;
      pan = s.pan;
    }
    // Close to inaudible is not worth a voice.
    if (gain < 0.03) return;

    const out = ctx.createGain();
    out.gain.value = gain;
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      out.connect(panner);
      panner.connect(this.sfxBus);
    } else {
      out.connect(this.sfxBus);
    }

    const start = ctx.currentTime;
    for (const layer of recipe.layers) this.layer(ctx, layer, start, out);
  }

  private layer(ctx: AudioContext, layer: Layer, start: number, out: AudioNode): void {
    const at = start + (layer.delay ?? 0);
    const end = at + layer.duration;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    // A few milliseconds of attack: starting at full level clicks.
    envelope.gain.exponentialRampToValueAtTime(layer.gain, at + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    envelope.connect(out);

    if (layer.kind === 'tone') {
      const osc = ctx.createOscillator();
      osc.type = layer.wave;
      osc.frequency.setValueAtTime(layer.from, at);
      if (layer.to !== layer.from) osc.frequency.exponentialRampToValueAtTime(layer.to, end);
      osc.connect(envelope);
      osc.start(at);
      osc.stop(end + 0.02);
      return;
    }

    if (!this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    // Different bangs should not be the same slice of noise.
    const offset = Math.random() * Math.max(0, this.noise.duration - layer.duration);
    const filter = ctx.createBiquadFilter();
    filter.type = layer.filter;
    filter.frequency.setValueAtTime(layer.from, at);
    if (layer.to !== undefined) filter.frequency.exponentialRampToValueAtTime(layer.to, end);
    if (layer.q !== undefined) filter.Q.value = layer.q;
    source.connect(filter);
    filter.connect(envelope);
    source.start(at, offset, layer.duration + 0.02);
  }

  /**
   * The announcer. Uses the browser's own Turkish voice if there is one, and
   * stays silent if there is not: a Turkish line read by an English voice is
   * worse than no line.
   */
  public speak(text: string): void {
    if (this.settings.muted || this.settings.voice <= 0) return;
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;

    const voice = speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().startsWith('tr'));
    if (!voice) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = 'tr-TR';
    utterance.rate = 1.12;
    utterance.pitch = 0.8;
    utterance.volume = this.settings.voice * this.settings.master;
    // Whatever was being said is out of date the moment this is.
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }
}

export const brawlAudio = new BrawlAudio();
