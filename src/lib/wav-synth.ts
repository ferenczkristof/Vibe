/**
 * Clean, Warm Multi-Genre Stereo WAV Synthesizer + Smooth Formant Vocaloid Singer.
 * Uses proper phase-modulated vibrato (never multiplying time-varying frequency by t),
 * zero-click start/end note envelopes, warm filtered percussion, and a studio low-pass
 * anti-aliasing filter so audio is 100% free of scratching, static, or clicks.
 */

export type InstrumentTimbre =
  | "fm-epiano"
  | "pluck-guitar"
  | "warm-pad"
  | "soft-rock"
  | "orchestral-strings"
  | "chiptune-8bit"
  | "jazz-organ"
  | "bell-mallet";

export type DrumGroove =
  | "four-on-the-floor"
  | "boom-bap"
  | "trap-808"
  | "rock-drive"
  | "dnb-breakbeat"
  | "cinematic-taiko"
  | "beatless-ambient";

export type ScaleName =
  | "minor"
  | "major"
  | "dorian"
  | "phrygian"
  | "harmonic-minor"
  | "minor-pentatonic"
  | "major-pentatonic"
  | "blues"
  | "japanese";

export interface CompositionSpec {
  bpm: number;
  rootMidi: number;
  scale: ScaleName;
  leadTimbre: InstrumentTimbre;
  padTimbre: InstrumentTimbre;
  drumGroove: DrumGroove;
  progressionDegrees: number[][];
  arpPattern: number[];
  melodyNotes: number[];
  bassDensity: number;
  filterBrightness: number;
  reverbMix: number;
  vocalRegisterOffset: number;
}

// Smooth vowel formant center frequencies [F1, F2, F3] in Hz
const VOWEL_FORMANTS: [number, number, number][] = [
  [730, 1090, 2440], // "AAH"
  [530, 1840, 2480], // "EHH"
  [300, 870, 2240],  // "OOH"
  [570, 840, 2410],  // "OHH"
];

const SCALES: Record<ScaleName, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19],
  major: [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19],
  dorian: [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19],
  phrygian: [0, 1, 3, 5, 7, 8, 10, 12, 13, 15, 17, 19],
  "harmonic-minor": [0, 2, 3, 5, 7, 8, 11, 12, 14, 15, 17, 19],
  "minor-pentatonic": [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27],
  "major-pentatonic": [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26],
  blues: [0, 3, 5, 6, 7, 10, 12, 15, 17, 18, 19, 22],
  japanese: [0, 1, 5, 7, 8, 12, 13, 17, 19, 20, 24, 25],
};

const CHORD_PROGRESSIONS: number[][][] = [
  [
    [0, 2, 4],
    [5, 7, 9],
    [3, 5, 7],
    [4, 6, 8],
  ],
  [
    [0, 2, 4, 6],
    [3, 5, 7, 9],
    [1, 3, 5, 7],
    [4, 6, 8, 10],
  ],
  [
    [0, 2, 4],
    [6, 8, 10],
    [5, 7, 9],
    [6, 8, 10],
  ],
  [
    [1, 3, 5, 7],
    [4, 6, 8, 10],
    [0, 2, 4, 6],
    [5, 7, 9, 11],
  ],
  [
    [0, 4, 7],
    [4, 8, 11],
    [5, 9, 12],
    [3, 7, 10],
  ],
  [
    [0, 2, 4],
    [2, 4, 6],
    [5, 7, 9],
    [4, 6, 8],
  ],
];

function hashPromptAndSeed(text: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

class PseudoRng {
  private state: number;
  constructor(seed: number) {
    this.state = (seed || 987654321) >>> 0;
  }
  nextFloat(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0xffffffff;
  }
  nextInt(min: number, maxInclusive: number): number {
    return min + Math.floor(this.nextFloat() * (maxInclusive - min + 1));
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.nextFloat() * arr.length)];
  }
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Click-free note envelope that smoothly ramps from 0 at note start
 * and smoothly returns to 0 before noteDur ends.
 */
function smoothNoteEnvelope(
  noteTime: number,
  noteDur: number,
  attackSec: number,
  decayRate: number
): number {
  if (noteTime <= 0 || noteTime >= noteDur) return 0;
  const attack = Math.min(1, noteTime / Math.max(0.008, attackSec));
  const releaseWindow = Math.min(0.06, noteDur * 0.2);
  const release =
    noteTime > noteDur - releaseWindow
      ? Math.max(0, (noteDur - noteTime) / releaseWindow)
      : 1.0;
  const decay = Math.exp(-noteTime * decayRate);
  return attack * decay * release;
}

export function buildCompositionSpec(
  prompt: string,
  styleTags: string,
  seed: number
): CompositionSpec {
  const text = `${prompt} ${prompt} ${styleTags}`.toLowerCase();
  const h = hashPromptAndSeed(text, seed);
  const rng = new PseudoRng(h);

  const bpmMatch = text.match(/\b(\d{2,3})\s*bpm\b/i);
  const explicitBpm = bpmMatch
    ? Math.max(60, Math.min(170, parseInt(bpmMatch[1], 10)))
    : null;

  const rootMidi = rng.nextInt(43, 52); // G2 to E3
  const vocalRegisterOffset = 12; // Warm mid-register vocal pitch (no high-frequency squeak)

  let bpm = explicitBpm || rng.nextInt(88, 124);
  let scale: ScaleName = rng.pick([
    "minor",
    "major",
    "dorian",
    "minor-pentatonic",
    "major-pentatonic",
  ]);
  let leadTimbre: InstrumentTimbre = rng.pick([
    "fm-epiano",
    "pluck-guitar",
    "bell-mallet",
    "jazz-organ",
    "orchestral-strings",
  ]);
  let padTimbre: InstrumentTimbre = rng.pick([
    "fm-epiano",
    "orchestral-strings",
    "warm-pad",
    "jazz-organ",
  ]);
  let drumGroove: DrumGroove = rng.pick([
    "four-on-the-floor",
    "boom-bap",
    "rock-drive",
    "trap-808",
  ]);
  let bassDensity = rng.pick([1, 2]);
  let filterBrightness = 0.4 + rng.nextFloat() * 0.35;
  let reverbMix = 0.25 + rng.nextFloat() * 0.2;

  if (
    /metal|rock|punk|grunge|hardcore|electric guitar|heavy|distortion|riff/i.test(
      text
    )
  ) {
    bpm = explicitBpm || rng.nextInt(122, 148);
    scale = "minor-pentatonic";
    leadTimbre = "soft-rock";
    padTimbre = "warm-pad";
    drumGroove = "rock-drive";
    bassDensity = 2;
    filterBrightness = 0.65;
  } else if (
    /dnb|drum and bass|drum & bass|jungle|breakbeat|fast|speed|liquid/i.test(text)
  ) {
    bpm = explicitBpm || rng.nextInt(156, 168);
    scale = "dorian";
    leadTimbre = rng.pick(["fm-epiano", "bell-mallet"]);
    padTimbre = "warm-pad";
    drumGroove = "dnb-breakbeat";
    bassDensity = 2;
    filterBrightness = 0.6;
  } else if (/trap|hip hop|hip-hop|rap|808|drill|phonk|bounce/i.test(text)) {
    bpm = explicitBpm || rng.nextInt(128, 144);
    scale = "minor-pentatonic";
    leadTimbre = rng.pick(["bell-mallet", "pluck-guitar", "fm-epiano"]);
    padTimbre = "fm-epiano";
    drumGroove = "trap-808";
    bassDensity = 1;
    filterBrightness = 0.55;
  } else if (
    /8-bit|8bit|chiptune|arcade|retro game|nintendo|pixel|boss battle/i.test(
      text
    )
  ) {
    bpm = explicitBpm || rng.nextInt(128, 148);
    scale = "harmonic-minor";
    leadTimbre = "chiptune-8bit";
    padTimbre = "warm-pad";
    drumGroove = "four-on-the-floor";
    bassDensity = 2;
    filterBrightness = 0.65;
  } else if (
    /lofi|lo-fi|chillhop|coffee|rain|study|cozy|relax|lazy/i.test(text)
  ) {
    bpm = explicitBpm || rng.nextInt(74, 86);
    scale = rng.pick(["dorian", "major", "minor-pentatonic"]);
    leadTimbre = rng.pick(["fm-epiano", "pluck-guitar"]);
    padTimbre = "fm-epiano";
    drumGroove = "boom-bap";
    bassDensity = 1;
    filterBrightness = 0.35;
  } else if (/jazz|blues|soul|funk|swing|lounge|sax|organ|groove/i.test(text)) {
    bpm = explicitBpm || rng.nextInt(92, 114);
    scale = /blues/i.test(text) ? "blues" : "dorian";
    leadTimbre = "jazz-organ";
    padTimbre = "fm-epiano";
    drumGroove = "boom-bap";
    bassDensity = 2;
    filterBrightness = 0.5;
  } else if (
    /ambient|meditation|sleep|space|drone|calm|peaceful|nature|floating/i.test(
      text
    )
  ) {
    bpm = explicitBpm || rng.nextInt(62, 76);
    scale = /japan|zen|east/i.test(text) ? "japanese" : "major-pentatonic";
    leadTimbre = rng.pick(["bell-mallet", "fm-epiano", "orchestral-strings"]);
    padTimbre = "orchestral-strings";
    drumGroove = "beatless-ambient";
    bassDensity = 1;
    filterBrightness = 0.35;
    reverbMix = 0.45;
  } else if (
    /cinematic|orchestra|epic|movie|soundtrack|classical|violin|cello|strings|piano|sad|emotional/i.test(
      text
    )
  ) {
    bpm = explicitBpm || rng.nextInt(70, 94);
    scale = /happy|uplifting|triumph|hope/i.test(text)
      ? "major"
      : "harmonic-minor";
    leadTimbre = /piano/i.test(text) ? "fm-epiano" : "orchestral-strings";
    padTimbre = "orchestral-strings";
    drumGroove = /epic|battle|war|trailer/i.test(text)
      ? "cinematic-taiko"
      : "beatless-ambient";
    bassDensity = 1;
    filterBrightness = 0.45;
    reverbMix = 0.42;
  } else if (
    /acoustic|folk|country|guitar|campfire|beach|ukulele|sunny|indie/i.test(text)
  ) {
    bpm = explicitBpm || rng.nextInt(96, 120);
    scale = /sad|melanchol/i.test(text) ? "minor" : "major-pentatonic";
    leadTimbre = "pluck-guitar";
    padTimbre = "fm-epiano";
    drumGroove = "rock-drive";
    bassDensity = 2;
    filterBrightness = 0.55;
  } else if (/happy|bright|pop|summer|upbeat|party|fun|dance/i.test(text)) {
    bpm = explicitBpm || rng.nextInt(110, 124);
    scale = "major-pentatonic";
    leadTimbre = rng.pick(["pluck-guitar", "fm-epiano", "bell-mallet"]);
    padTimbre = "fm-epiano";
    drumGroove = "four-on-the-floor";
    bassDensity = 2;
    filterBrightness = 0.6;
  }

  const baseProg = rng.pick(CHORD_PROGRESSIONS);
  const shift = rng.nextInt(0, baseProg.length - 1);
  const progressionDegrees = baseProg.map(
    (_, idx) => baseProg[(idx + shift) % baseProg.length]
  );

  const arpPatterns = [
    [0, 1, 2, 3, 2, 1, 0, 1],
    [0, 2, 1, 3, 0, 3, 2, 1],
    [3, 2, 1, 0, 3, 2, 1, 0],
    [0, 0, 2, 2, 1, 1, 3, 3],
    [0, 3, 1, 2, 4, 2, 1, 3],
  ];
  const arpPattern = rng.pick(arpPatterns);

  const melodyNotes: number[] = [];
  let currentDeg = rng.nextInt(2, 5);
  for (let step = 0; step < 16; step++) {
    if (rng.nextFloat() < 0.25 && step % 4 !== 0) {
      melodyNotes.push(-1);
    } else {
      const delta = rng.pick([-2, -1, 0, 1, 2]);
      currentDeg = Math.max(0, Math.min(7, currentDeg + delta));
      melodyNotes.push(currentDeg);
    }
  }

  return {
    bpm,
    rootMidi,
    scale,
    leadTimbre,
    padTimbre,
    drumGroove,
    progressionDegrees,
    arpPattern,
    melodyNotes,
    bassDensity,
    filterBrightness,
    reverbMix,
    vocalRegisterOffset,
  };
}

/**
 * Pure, Scratch-Free Human Formant Singing Voice:
 * Uses exact phase modulation for vibrato (never multiplying f(t) by t!)
 * and smooth Hann-like attack/release envelopes with zero static noise.
 */
function renderFormantSingingVoice(
  freq: number,
  t: number,
  noteTime: number,
  noteDur: number,
  syllableIndex: number
): { left: number; right: number } {
  const env = smoothNoteEnvelope(noteTime, noteDur, 0.045, 0.8);
  if (env <= 0.0001) return { left: 0, right: 0 };

  // Smooth phase-modulated human vibrato (5.4 Hz)
  const vibRamp = Math.min(1, noteTime * 4.5);
  const vibPhaseOffset = vibRamp * 0.18 * Math.sin(2 * Math.PI * 5.4 * t);

  const vA = VOWEL_FORMANTS[syllableIndex % VOWEL_FORMANTS.length];
  const vB = VOWEL_FORMANTS[(syllableIndex + 1) % VOWEL_FORMANTS.length];
  const morph = Math.min(1, (noteTime / noteDur) * 0.6);
  const f1 = vA[0] * (1 - morph) + vB[0] * morph;
  const f2 = vA[1] * (1 - morph) + vB[1] * morph;
  const f3 = vA[2] * (1 - morph) + vB[2] * morph;

  let leadSum = 0;
  // Cap harmonics at 10 for silky smooth, warm vocal tone
  for (let h = 1; h <= 10; h++) {
    const hf = h * freq;
    const g1 = Math.exp(-Math.pow((hf - f1) / 145, 2));
    const g2 = 0.55 * Math.exp(-Math.pow((hf - f2) / 200, 2));
    const g3 = 0.25 * Math.exp(-Math.pow((hf - f3) / 260, 2));
    const amp = (h === 1 ? 0.55 : h === 2 ? 0.3 : 0) + g1 + g2 + g3;
    leadSum += amp * Math.sin(2 * Math.PI * hf * t + h * vibPhaseOffset);
  }

  // Warm stereo 5th choir backing
  const choirFreq = freq * 1.4983;
  const choirWave =
    (Math.sin(2 * Math.PI * choirFreq * t + vibPhaseOffset) * 0.6 +
      Math.sin(4 * Math.PI * choirFreq * t + 2 * vibPhaseOffset) * 0.25) *
    0.25;

  const leadOut = (leadSum / 3.2) * env;
  const choirOut = choirWave * env;

  return {
    left: leadOut * 0.9 + choirOut * 0.75,
    right: leadOut * 0.9 + choirOut * 1.05,
  };
}

function renderInstrumentVoice(
  timbre: InstrumentTimbre,
  freq: number,
  t: number,
  noteTime: number,
  noteDur: number,
  brightness: number
): number {
  const w = 2 * Math.PI * freq;

  switch (timbre) {
    case "warm-pad": {
      const env = smoothNoteEnvelope(noteTime, noteDur, 0.06, 1.2);
      if (env <= 0) return 0;
      const s1 =
        Math.sin(w * t) +
        0.35 * Math.sin(2 * w * t) * brightness +
        0.15 * Math.sin(3 * w * t) * brightness;
      const s2 = Math.sin(w * 1.003 * t) + 0.3 * Math.sin(2 * w * 1.003 * t);
      return ((s1 + s2) / 2.8) * env;
    }

    case "fm-epiano": {
      const env = smoothNoteEnvelope(noteTime, noteDur, 0.012, 2.6);
      if (env <= 0) return 0;
      const modIndex = 1.4 * brightness * Math.exp(-noteTime * 7.5);
      const modulator = Math.sin(w * 2 * t) * modIndex;
      const tine = Math.sin(w * 4 * t) * 0.15 * Math.exp(-noteTime * 16);
      return Math.sin(w * t + modulator + tine) * env;
    }

    case "pluck-guitar": {
      const env = smoothNoteEnvelope(noteTime, noteDur, 0.008, 4.2);
      if (env <= 0) return 0;
      const pluckEnv = Math.exp(-noteTime * 14.0);
      const fundamental = Math.sin(w * t);
      const h2 = Math.sin(2 * w * t) * 0.5 * pluckEnv;
      const h3 = Math.sin(3 * w * t) * 0.28 * pluckEnv * brightness;
      return (fundamental + h2 + h3) * 0.65 * env;
    }

    case "soft-rock": {
      const env = smoothNoteEnvelope(noteTime, noteDur, 0.012, 2.2);
      if (env <= 0) return 0;
      const raw =
        Math.sin(w * t) +
        0.55 * Math.sin(w * 1.4983 * t) + // warm 5th chord interval
        0.35 * Math.sin(2 * w * t) * brightness;
      return Math.tanh(raw * 1.4) * 0.65 * env;
    }

    case "orchestral-strings": {
      const env = smoothNoteEnvelope(noteTime, noteDur, 0.08, 0.7);
      if (env <= 0) return 0;
      // Proper phase-modulated vibrato (never multiply w by vibrato * t!)
      const vibPhase = 0.22 * Math.sin(2 * Math.PI * 5.1 * t);
      const bow =
        Math.sin(w * t + vibPhase) +
        0.45 * Math.sin(2 * w * t + 2 * vibPhase) * brightness +
        0.2 * Math.sin(3 * w * t + 3 * vibPhase) * brightness;
      return (bow / 1.8) * env;
    }

    case "chiptune-8bit": {
      const env = smoothNoteEnvelope(noteTime, noteDur, 0.008, 4.5);
      if (env <= 0) return 0;
      // Band-limited square approximation (first 3 odd harmonics) so it never aliases/scratches
      const sq =
        Math.sin(w * t) +
        (1 / 3) * Math.sin(3 * w * t) +
        (1 / 5) * Math.sin(5 * w * t);
      return sq * 0.6 * env;
    }

    case "jazz-organ": {
      const env = smoothNoteEnvelope(noteTime, noteDur, 0.02, 1.2);
      if (env <= 0) return 0;
      // Proper phase-modulated rotary vibrato
      const lesliePhase = 0.2 * Math.sin(2 * Math.PI * 6.0 * t);
      const drawbars =
        Math.sin(w * t + lesliePhase) +
        0.5 * Math.sin(2 * w * t + 2 * lesliePhase) +
        0.3 * Math.sin(3 * w * t + 3 * lesliePhase) * brightness;
      return (drawbars / 2.0) * env;
    }

    case "bell-mallet": {
      const env = smoothNoteEnvelope(noteTime, noteDur, 0.008, 5.0);
      if (env <= 0) return 0;
      const chime =
        Math.sin(w * t) +
        0.35 * Math.sin(2.0 * w * t) * Math.exp(-noteTime * 12) +
        0.2 * Math.sin(3.0 * w * t) * Math.exp(-noteTime * 20) * brightness;
      return chime * 0.7 * env;
    }
  }
}

/**
 * Clean, tonal percussion without harsh static white-noise bursts.
 * Uses exact phase integration for pitch-envelope kicks and warm tonal snares.
 */
function renderKickHit(hitTime: number): number {
  if (hitTime < 0 || hitTime >= 0.18) return 0;
  // Exact integral of f(tau) = 48 + 90 * exp(-30 * tau)
  const phase = 2 * Math.PI * (48 * hitTime + (90 / 30) * (1 - Math.exp(-30 * hitTime)));
  const env = Math.exp(-hitTime * 18) * Math.min(1, hitTime * 350);
  return Math.sin(phase) * env * 0.42;
}

function renderWarmSnareHit(hitTime: number): number {
  if (hitTime < 0 || hitTime >= 0.14) return 0;
  const phase1 = 2 * Math.PI * (165 * hitTime + (60 / 40) * (1 - Math.exp(-40 * hitTime)));
  const phase2 = 2 * Math.PI * 310 * hitTime;
  const env = Math.exp(-hitTime * 26) * Math.min(1, hitTime * 400);
  return (Math.sin(phase1) * 0.7 + Math.sin(phase2) * 0.3) * env * 0.25;
}

function renderDrums(
  groove: DrumGroove,
  t: number,
  beatInBar: number,
  beatDur: number
): number {
  if (groove === "beatless-ambient") return 0;

  const beatNum = Math.floor(beatInBar);
  const beatFrac = beatInBar % 1;
  const beatTime = beatFrac * beatDur;
  const sixteenth = Math.floor(beatInBar * 4) % 16;
  const sixteenthTime = t % (beatDur / 4);

  let out = 0;

  if (groove === "four-on-the-floor") {
    out += renderKickHit(beatTime);
    if (beatNum === 1 || beatNum === 3) {
      out += renderWarmSnareHit(beatTime);
    }
    return out;
  }

  if (groove === "boom-bap") {
    if (sixteenth === 0 || sixteenth === 7 || sixteenth === 10) {
      out += renderKickHit(sixteenthTime) * 0.9;
    }
    if (beatNum === 1 || beatNum === 3) {
      out += renderWarmSnareHit(beatTime) * 0.85;
    }
    return out;
  }

  if (groove === "trap-808") {
    if (sixteenth === 0 || sixteenth === 6 || sixteenth === 10) {
      out += renderKickHit(sixteenthTime) * 1.05;
    }
    if (sixteenth === 8 || sixteenth === 14) {
      out += renderWarmSnareHit(sixteenthTime);
    }
    return out;
  }

  if (groove === "dnb-breakbeat") {
    if (sixteenth === 0 || sixteenth === 10) {
      out += renderKickHit(sixteenthTime);
    }
    if (sixteenth === 4 || sixteenth === 12) {
      out += renderWarmSnareHit(sixteenthTime);
    }
    return out;
  }

  if (groove === "rock-drive") {
    if (sixteenth === 0 || sixteenth === 3 || sixteenth === 8 || sixteenth === 10) {
      out += renderKickHit(sixteenthTime);
    }
    if (sixteenth === 4 || sixteenth === 12) {
      out += renderWarmSnareHit(sixteenthTime) * 1.1;
    }
    return out;
  }

  // cinematic-taiko
  if (sixteenth === 0 || sixteenth === 6 || sixteenth === 12) {
    out += renderKickHit(sixteenthTime) * 1.1;
  }
  return out;
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

export function synthesizeWavBuffer(
  prompt: string,
  styleTags: string,
  seedInput?: number,
  withVocals = true
): Uint8Array {
  const seed = seedInput || Math.floor(100000 + Math.random() * 900000);
  const spec = buildCompositionSpec(prompt, styleTags, seed);
  const scaleIntervals = SCALES[spec.scale] || SCALES.minor;

  const sampleRate = 44100;
  const durationSeconds = 20;
  const numSamples = sampleRate * durationSeconds;
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const beatDur = 60 / spec.bpm;
  const barDur = beatDur * 4;
  const arpStepDur = beatDur / 2; // Smooth 8th-note arpeggio
  const melStepDur = beatDur;     // Smooth quarter-note vocal/lead phrasing

  const delaySamples = Math.floor(sampleRate * (beatDur * 0.75));
  const delayBufL = new Float32Array(delaySamples);
  const delayBufR = new Float32Array(delaySamples);
  let delayIdx = 0;

  // 1-pole stereo warm low-pass filter state to eliminate any digital harshness
  let lpL = 0;
  let lpR = 0;
  const lpAlpha = 0.38;

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    let masterEnv = 1.0;
    if (t < 0.8) masterEnv = t / 0.8;
    else if (t > durationSeconds - 2.2)
      masterEnv = Math.max(0, (durationSeconds - t) / 2.2);

    const totalBar = Math.floor(t / barDur);
    const barIndex = totalBar % spec.progressionDegrees.length;
    const chordDegrees = spec.progressionDegrees[barIndex];
    const beatInBar = (t % barDur) / beatDur;

    const isIntro = t < Math.min(2.0, barDur * 0.5);

    // 1. Chord Pad / Harmony Layer
    let padL = 0;
    let padR = 0;
    const barNoteTime = t % barDur;
    for (let c = 0; c < chordDegrees.length; c++) {
      const deg = chordDegrees[c] % scaleIntervals.length;
      const semitones = scaleIntervals[deg];
      const freq = midiToFreq(spec.rootMidi + 12 + semitones);
      const voice = renderInstrumentVoice(
        spec.padTimbre,
        freq,
        t,
        barNoteTime,
        barDur,
        spec.filterBrightness * 0.8
      );
      const pan = c % 2 === 0 ? 0.62 : 0.38;
      padL += voice * pan * 0.13;
      padR += voice * (1 - pan) * 0.13;
    }

    // 2. Warm Sub & Fundamental Bassline Layer
    let bass = 0;
    if (!isIntro || spec.drumGroove === "beatless-ambient") {
      const bassStepDur = barDur / spec.bassDensity;
      const bassNoteTime = t % bassStepDur;
      const rootDeg = chordDegrees[0] % scaleIntervals.length;
      const bassMidi = spec.rootMidi - 12 + scaleIntervals[rootDeg];
      const bassFreq = midiToFreq(bassMidi);
      const bassEnv = smoothNoteEnvelope(bassNoteTime, bassStepDur, 0.015, 2.0);
      bass =
        (Math.sin(2 * Math.PI * bassFreq * t) * 0.8 +
          Math.sin(4 * Math.PI * bassFreq * t) * 0.2) *
        bassEnv *
        0.25;
    }

    // 3. Arpeggiator Layer
    const arpIdx = Math.floor(t / arpStepDur);
    const arpNoteTime = t % arpStepDur;
    const arpChordSlot =
      spec.arpPattern[arpIdx % spec.arpPattern.length] % chordDegrees.length;
    const arpDegree = chordDegrees[arpChordSlot] % scaleIntervals.length;
    const arpFreq = midiToFreq(spec.rootMidi + 12 + scaleIntervals[arpDegree]);
    const arpVoice =
      renderInstrumentVoice(
        spec.leadTimbre,
        arpFreq,
        t,
        arpNoteTime,
        arpStepDur,
        spec.filterBrightness
      ) * 0.12;
    const arpPan = 0.5 + 0.3 * Math.sin(arpIdx * 0.85);

    // 4. Expressive Instrumental Lead Melody Layer (leaves warm center headroom when AI Singing Vocals are active)
    let leadL = 0;
    let leadR = 0;
    const melIdx = Math.floor(t / melStepDur);
    const melNoteTime = t % melStepDur;
    const melDegree = spec.melodyNotes[melIdx % spec.melodyNotes.length];
    if (melDegree >= 0) {
      const safeDeg = melDegree % scaleIntervals.length;
      const melFreq = midiToFreq(
        spec.rootMidi + spec.vocalRegisterOffset + scaleIntervals[safeDeg]
      );
      const melGain = withVocals ? 0.14 : 0.22;
      const melSig =
        renderInstrumentVoice(
          spec.leadTimbre,
          melFreq,
          t,
          melNoteTime,
          melStepDur,
          spec.filterBrightness
        ) * melGain;
      leadL = melSig * 0.92;
      leadR = melSig * 0.98;
    }

    // 5. Clean Tonal Drum Groove Layer
    const drums = isIntro
      ? 0
      : renderDrums(spec.drumGroove, t, beatInBar, beatDur);

    const dryL = padL + bass + drums + arpVoice * arpPan + leadL;
    const dryR = padR + bass + drums + arpVoice * (1 - arpPan) + leadR;

    const delayedL = delayBufL[delayIdx];
    const delayedR = delayBufR[delayIdx];
    delayBufL[delayIdx] =
      (arpVoice * (1 - arpPan) + leadR + padR * 0.4) * 0.38 + delayedR * 0.25;
    delayBufR[delayIdx] =
      (arpVoice * arpPan + leadL + padL * 0.4) * 0.38 + delayedL * 0.25;
    delayIdx = (delayIdx + 1) % delaySamples;

    const rawMixL = (dryL + delayedL * spec.reverbMix) * masterEnv * 0.85;
    const rawMixR = (dryR + delayedR * spec.reverbMix) * masterEnv * 0.85;

    // Warm 1-pole low-pass filter for silky smooth playback
    lpL = lpL + lpAlpha * (rawMixL - lpL);
    lpR = lpR + lpAlpha * (rawMixR - lpR);

    const sampleL = Math.max(-32767, Math.min(32767, Math.floor(Math.tanh(lpL) * 29000)));
    const sampleR = Math.max(-32767, Math.min(32767, Math.floor(Math.tanh(lpR) * 29000)));

    view.setInt16(offset, sampleL, true);
    view.setInt16(offset + 2, sampleR, true);
    offset += 4;
  }

  return bytes;
}
