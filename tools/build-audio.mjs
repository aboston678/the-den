// Builds the game's sounds (milestone 1.10) from the recordings in assets/audio/src/
// (run tools/fetch-audio.mjs first) into client/public/audio/: mono MP3s, trimmed to clean
// sections, levelled, and with seamless crossfaded loops. Usage: npm run build:audio
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import ffmpeg from "ffmpeg-static";

const SRC = "assets/audio/src";
const OUT = "client/public/audio";
const RATE = 32000;

/**
 * name: [source file, start s, length s, kind, loudness dB RMS]
 * Sections were picked from spectrograms to skip handling noise, silence and the bird
 * track's few synth notes. Loops get 2 s of their tail crossfaded into their head.
 */
const SOUNDS = {
  "day-birds": ["birds-and-wind.ogg", 23, 37, "loop", -24],
  "dawn-chorus": ["dawn-chorus.mp3", 10, 44, "loop", -24],
  crickets: ["crickets.mp3", 5, 22, "loop", -24],
  treefrogs: ["treefrogs.mp3", 0.6, 8.6, "loop", -26],
  stream: ["river.mp3", 30, 44, "loop", -20],
  "loon-1": ["loon.mp3", 40, 8.5, "once", -20],
  "loon-2": ["loon.mp3", 63, 9.5, "once", -20],
  "loon-3": ["loon.mp3", 89, 9, "once", -20],
  thrush: ["hermit-thrush.mp3", 0, 7.1, "once", -20],
  flicker: ["flicker.mp3", 0, 4.2, "once", -20],
  // The roar is Andrew's "I'm shaving here" clip (2026-10-15; kept in git as assets/audio/im-shaving-here.mp3,
  // see docs/ASSETS.md). The old grizzly growl was ["grizzly-a.mp3", 0.7, 4.6, "once", -14].
  roar: ["../im-shaving-here.mp3", 0, 3.37, "once", -14],
  // The pins crashing (Andrew's pick, 2026-10-13; kept in git as assets/audio/bowling-strike.m4a, see docs/ASSETS.md).
  "pin-strike": ["../bowling-strike.m4a", 0, 2.55, "once", -14],
};

// Short effects from Kenney's CC0 packs (Phase 5 sound pass; tools/fetch-audio.mjs, docs/ASSETS.md):
// the whole file, levelled by peak (dBFS) so a quick tap is as clear as a long one.
const K = "kenney";
const IMPACT = `${K}/kenney_impact-sounds/Audio`, RPG = `${K}/kenney_rpg-audio/Audio`, UI = `${K}/kenney_interface-sounds/Audio`, CASINO = `${K}/kenney_casino-audio/Audio`;
const sfx = (file, peak) => [file, 0, null, "sfx", peak];
for (let i = 0; i < 5; i++) {
  // Footsteps (5 takes per surface, picked at random so steps don't repeat).
  SOUNDS[`step-grass-${i}`] = sfx(`${IMPACT}/footstep_grass_00${i}.ogg`, -6);
  SOUNDS[`step-wood-${i}`] = sfx(`${IMPACT}/footstep_wood_00${i}.ogg`, -6);
  SOUNDS[`step-carpet-${i}`] = sfx(`${IMPACT}/footstep_carpet_00${i}.ogg`, -8);
  SOUNDS[`step-stone-${i}`] = sfx(`${IMPACT}/footstep_concrete_00${i}.ogg`, -6);
  SOUNDS[`step-dirt-${i}`] = sfx(`${RPG}/footstep0${i}.ogg`, -6);
}
Object.assign(SOUNDS, {
  land: sfx(`${IMPACT}/impactSoft_heavy_000.ogg`, -4),
  "door-open-0": sfx(`${RPG}/doorOpen_1.ogg`, -3),
  "door-open-1": sfx(`${RPG}/doorOpen_2.ogg`, -3),
  "door-close-0": sfx(`${RPG}/doorClose_1.ogg`, -3),
  "door-close-1": sfx(`${RPG}/doorClose_2.ogg`, -3),
  "ui-click": sfx(`${UI}/click_001.ogg`, -8),
  "ui-hover": sfx(`${UI}/tick_001.ogg`, -16),
  "ui-open": sfx(`${UI}/open_001.ogg`, -10),
  "ui-close": sfx(`${UI}/close_001.ogg`, -10),
  "ui-confirm": sfx(`${UI}/confirmation_001.ogg`, -8),
  "ui-error": sfx(`${UI}/error_004.ogg`, -10),
  "turn-ding": sfx(`${UI}/bong_001.ogg`, -8),
  "piece-place-0": sfx(`${IMPACT}/impactWood_light_000.ogg`, -4),
  "piece-place-1": sfx(`${IMPACT}/impactWood_light_001.ogg`, -4),
  robber: sfx(`${IMPACT}/impactWood_heavy_000.ogg`, -3),
  "card-take": sfx(`${CASINO}/card-slide-1.ogg`, -6),
  "card-give": sfx(`${CASINO}/card-place-1.ogg`, -6),
  "card-shuffle": sfx(`${CASINO}/card-fan-1.ogg`, -6),
});
const XFADE = 2;

function decode(file, start, length) {
  const span = length === null ? [] : ["-t", String(length)];
  const raw = execFileSync(ffmpeg, ["-v", "error", "-ss", String(start), ...span, "-i", `${SRC}/${file}`, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}

/** Last XFADE seconds faded into the first XFADE seconds (equal-power), so the end runs into the start. */
function makeLoop(s) {
  const x = Math.round(XFADE * RATE);
  const out = s.slice(0, s.length - x);
  for (let i = 0; i < x; i++) {
    const k = i / x;
    out[i] = s[i] * Math.sin((k * Math.PI) / 2) + s[s.length - x + i] * Math.cos((k * Math.PI) / 2);
  }
  return out;
}

/** Short fades at both ends so one-shots don't click. */
function fadeEnds(s, inS = 0.02, outS = 0.4) {
  const a = Math.round(inS * RATE), b = Math.min(s.length, Math.round(outS * RATE));
  for (let i = 0; i < a; i++) s[i] *= i / a;
  for (let i = 0; i < b; i++) s[s.length - 1 - i] *= i / b;
  return s;
}

/** Scale so the loudest moment hits `db` dBFS. */
function levelPeak(s, db) {
  let peak = 0;
  for (const v of s) peak = Math.max(peak, Math.abs(v));
  const gain = 10 ** (db / 20) / Math.max(peak, 1e-6);
  for (let i = 0; i < s.length; i++) s[i] *= gain;
  return s;
}

/** Scale to the target RMS level, but never past -1 dBFS peak. */
function level(s, db) {
  let sum = 0, peak = 0;
  for (const v of s) {
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const rms = Math.sqrt(sum / s.length);
  const gain = Math.min(10 ** (db / 20) / rms, 0.89 / peak);
  for (let i = 0; i < s.length; i++) s[i] *= gain;
  return s;
}

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [name, [file, start, length, kind, db]] of Object.entries(SOUNDS)) {
  let s = decode(file, start, kind === "loop" ? length + XFADE : length);
  s = kind === "loop" ? makeLoop(s) : kind === "sfx" ? fadeEnds(s, 0.002, 0.03) : fadeEnds(s);
  if (kind === "sfx") levelPeak(s, db);
  else level(s, db);
  const path = `${OUT}/${name}.mp3`;
  execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "f32le", "-ar", String(RATE), "-ac", "1", "-i", "-", "-c:a", "libmp3lame", "-b:a", kind === "loop" ? "56k" : "64k", path], { input: Buffer.from(s.buffer) });
  const kb = statSync(path).size / 1024;
  total += kb;
  console.log(`${name.padEnd(12)} ${(s.length / RATE).toFixed(1).padStart(5)} s  ${kb.toFixed(0).padStart(4)} KB`);
}
console.log(`total ${(total / 1024).toFixed(2)} MB`);
