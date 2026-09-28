/**
 * Synth voices by sound id (SPEC.md §3.4).
 *
 * v1 is pure Web Audio synthesis through Tone.js, one generator per sound id:
 *  - `low`, `mid`, `high`: a membrane (pitched, fast-decaying) thump at three pitches;
 *  - `click`: a filtered noise burst for rim hits.
 * "B" (both hands) uses a heavier variant of the same generator: lower, longer and a little
 * louder. Cross-arm and lift never change the sound. Later a sound id can point at a sample
 * file in `public/samples/`; `SoundBank.voice()` is the one place to teach that.
 *
 * Every voice is a small round-robin pool so a flam (two strokes 40 ms apart) or two parts
 * hitting the same surface never cut each other off. Gain per stroke is passed as envelope
 * velocity (a linear factor, so accents above 0 dB simply push the envelope above 1); the drum
 * bus sits at `DRUM_BUS_DB` of headroom and a limiter guards the output.
 */
import * as Tone from 'tone';
import type { Hand } from './types';

/** Sound ids with a built-in generator. Unknown ids fall back to `FALLBACK_SOUND`. */
export const BUILT_IN_SOUNDS = ['low', 'mid', 'high', 'click'] as const;
export type BuiltInSound = (typeof BUILT_IN_SOUNDS)[number];
export const FALLBACK_SOUND: BuiltInSound = 'mid';

/** Headroom on the drum bus so +7 dB accents and overlapping strokes stay under full scale. */
export const DRUM_BUS_DB = -9;
export const METRONOME_DB = -14;
/** Both hands: extra gain on top of the heavier voice. */
export const BOTH_HANDS_DB = 2;
/** Voices per sound and hand variant. Two is enough for a flam plus one overlapping part. */
const POOL_SIZE = 3;

/** One playable sound. `gainDb` is the stroke's total gain relative to a plain hit. */
export interface Voice {
  trigger(time: number, hand: Hand, gainDb: number): void;
}

interface Playable {
  play(time: number, gainDb: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Drums: MembraneSynth
// ---------------------------------------------------------------------------

interface DrumSpec {
  note: string;
  decay: number;
  pitchDecay: number;
  octaves: number;
}

const DRUM_SPECS: Record<Exclude<BuiltInSound, 'click'>, { single: DrumSpec; both: DrumSpec }> = {
  low: {
    single: { note: 'E2', decay: 0.28, pitchDecay: 0.045, octaves: 6 },
    both: { note: 'A1', decay: 0.4, pitchDecay: 0.06, octaves: 7 },
  },
  mid: {
    single: { note: 'B2', decay: 0.2, pitchDecay: 0.03, octaves: 5 },
    both: { note: 'E2', decay: 0.3, pitchDecay: 0.04, octaves: 6 },
  },
  high: {
    single: { note: 'F#3', decay: 0.13, pitchDecay: 0.02, octaves: 4 },
    both: { note: 'B2', decay: 0.2, pitchDecay: 0.03, octaves: 5 },
  },
};

class DrumPlayable implements Playable {
  private readonly spec: DrumSpec;
  private readonly synth: Tone.MembraneSynth;

  constructor(spec: DrumSpec, output: Tone.InputNode) {
    this.spec = spec;
    this.synth = new Tone.MembraneSynth({
      pitchDecay: spec.pitchDecay,
      octaves: spec.octaves,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: spec.decay, sustain: 0, release: 0.05, attackCurve: 'exponential' },
    }).connect(output);
  }

  play(time: number, gainDb: number): void {
    this.synth.triggerAttackRelease(this.spec.note, this.spec.decay, time, Tone.dbToGain(gainDb));
  }

  dispose(): void {
    this.synth.dispose();
  }
}

// ---------------------------------------------------------------------------
// Rim click: filtered noise burst
// ---------------------------------------------------------------------------

interface ClickSpec {
  decay: number;
  frequency: number;
}

const CLICK_SPECS: { single: ClickSpec; both: ClickSpec } = {
  single: { decay: 0.045, frequency: 3200 },
  both: { decay: 0.07, frequency: 2400 },
};

class ClickPlayable implements Playable {
  private readonly spec: ClickSpec;
  private readonly synth: Tone.NoiseSynth;
  private readonly filter: Tone.Filter;

  constructor(spec: ClickSpec, output: Tone.InputNode) {
    this.spec = spec;
    this.filter = new Tone.Filter({ type: 'bandpass', frequency: spec.frequency, Q: 0.9 }).connect(output);
    this.synth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: spec.decay, sustain: 0, release: 0.02 },
    }).connect(this.filter);
  }

  play(time: number, gainDb: number): void {
    // The bandpass removes most of the noise energy; make it up here so a click sits level with a thump.
    this.synth.triggerAttackRelease(this.spec.decay, time, Tone.dbToGain(gainDb + 6));
  }

  dispose(): void {
    this.synth.dispose();
    this.filter.dispose();
  }
}

// ---------------------------------------------------------------------------
// Pools
// ---------------------------------------------------------------------------

class RoundRobin {
  private readonly items: Playable[];
  private next = 0;

  constructor(items: Playable[]) {
    this.items = items;
  }

  play(time: number, gainDb: number): void {
    const item = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    item.play(time, gainDb);
  }

  dispose(): void {
    for (const item of this.items) item.dispose();
  }
}

/** A sound id's voice: one pool for single hands, a heavier one for both hands. */
class PooledVoice implements Voice {
  private readonly single: RoundRobin;
  private readonly both: RoundRobin;

  constructor(single: RoundRobin, both: RoundRobin) {
    this.single = single;
    this.both = both;
  }

  trigger(time: number, hand: Hand, gainDb: number): void {
    if (hand === 'B') this.both.play(time, gainDb + BOTH_HANDS_DB);
    else this.single.play(time, gainDb);
  }

  dispose(): void {
    this.single.dispose();
    this.both.dispose();
  }
}

function pool(make: () => Playable): RoundRobin {
  return new RoundRobin(Array.from({ length: POOL_SIZE }, make));
}

function buildVoice(sound: BuiltInSound, output: Tone.InputNode): PooledVoice {
  if (sound === 'click') {
    return new PooledVoice(
      pool(() => new ClickPlayable(CLICK_SPECS.single, output)),
      pool(() => new ClickPlayable(CLICK_SPECS.both, output)),
    );
  }
  const spec = DRUM_SPECS[sound];
  return new PooledVoice(
    pool(() => new DrumPlayable(spec.single, output)),
    pool(() => new DrumPlayable(spec.both, output)),
  );
}

function isBuiltIn(sound: string): sound is BuiltInSound {
  return (BUILT_IN_SOUNDS as readonly string[]).includes(sound);
}

// ---------------------------------------------------------------------------
// Metronome
// ---------------------------------------------------------------------------

const METRONOME_STRONG = { note: 'A6', velocity: 1 };
const METRONOME_WEAK = { note: 'E6', velocity: 0.5 };

class Metronome {
  private readonly synth: Tone.Synth;

  constructor(output: Tone.InputNode) {
    this.synth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.02 },
    }).connect(output);
  }

  click(time: number, strong: boolean): void {
    const { note, velocity } = strong ? METRONOME_STRONG : METRONOME_WEAK;
    this.synth.triggerAttackRelease(note, 0.035, time, velocity);
  }

  dispose(): void {
    this.synth.dispose();
  }
}

// ---------------------------------------------------------------------------
// Bank
// ---------------------------------------------------------------------------

/** Every voice of the player plus the metronome, on one bus into the destination. */
export class SoundBank {
  private readonly limiter: Tone.Limiter;
  private readonly drumBus: Tone.Volume;
  private readonly metronomeBus: Tone.Volume;
  private readonly metronomeVoice: Metronome;
  private readonly voices = new Map<string, PooledVoice>();
  private readonly warned = new Set<string>();

  constructor() {
    this.limiter = new Tone.Limiter(-1).toDestination();
    this.drumBus = new Tone.Volume(DRUM_BUS_DB).connect(this.limiter);
    this.metronomeBus = new Tone.Volume(METRONOME_DB).connect(this.limiter);
    this.metronomeVoice = new Metronome(this.metronomeBus);
  }

  /** Build the voices for these sound ids now, so nothing is created inside a scheduled callback. */
  prepare(soundIds: Iterable<string>): void {
    for (const id of soundIds) this.voice(id);
  }

  /** The voice for a sound id, built on first use. An unknown id warns once and plays `FALLBACK_SOUND`. */
  voice(soundId: string): Voice {
    let sound: BuiltInSound;
    if (isBuiltIn(soundId)) {
      sound = soundId;
    } else {
      if (!this.warned.has(soundId)) {
        this.warned.add(soundId);
        console.warn(`Unknown sound "${soundId}"; playing "${FALLBACK_SOUND}" instead. Built-in sounds: ${BUILT_IN_SOUNDS.join(', ')}`);
      }
      sound = FALLBACK_SOUND;
    }
    let voice = this.voices.get(sound);
    if (voice === undefined) {
      voice = buildVoice(sound, this.drumBus);
      this.voices.set(sound, voice);
    }
    return voice;
  }

  metronome(time: number, strong: boolean): void {
    this.metronomeVoice.click(time, strong);
  }

  dispose(): void {
    for (const voice of this.voices.values()) voice.dispose();
    this.voices.clear();
    this.metronomeVoice.dispose();
    this.metronomeBus.dispose();
    this.drumBus.dispose();
    this.limiter.dispose();
  }
}

export function createSoundBank(): SoundBank {
  return new SoundBank();
}
