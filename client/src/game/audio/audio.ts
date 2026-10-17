import { Audio, AudioListener, Object3D, PositionalAudio } from "three";
import { settings, useSettings } from "../../ui/settings.ts";
import {
  ballReturnBuffer, ballRollBuffer, castWhooshBuffer, crashBuffer, diceRollBuffer, fanfareBuffer, garageDoorBuffer, lineSnapBuffer, plopBuffer, reelClickBuffer,
  splashBuffer, sweepBuffer,
} from "./synth.ts";
import { asset } from "../../asset.ts";

// Sound for the game (GAME_SPEC §10): one listener on the camera, decoded sounds cached by name,
// short positional one-shots (roars, birds, loons), and flat ones (menu clicks). Effects and
// ambience each go through their own volume control, so moving a slider changes what's already
// playing too. Browsers only allow sound after the
// player has clicked or pressed a key; the lobby's buttons already count, and we also resume on
// the first click/key in case the browser paused it.

let listener: AudioListener | null = null;

export type Bus = "effects" | "ambience";
let buses: Record<Bus, GainNode> | null = null;

/** The one listener (created on first use, after the lobby click). */
export function getListener() {
  if (!listener) {
    listener = new AudioListener();
    listener.setMasterVolume(1);
    const ctx = listener.context;
    buses = { effects: ctx.createGain(), ambience: ctx.createGain() };
    for (const b of Object.values(buses)) b.connect(listener.getInput());
    const follow = () => {
      const st = settings();
      buses!.effects.gain.setTargetAtTime(st.effects, ctx.currentTime, 0.05);
      buses!.ambience.gain.setTargetAtTime(st.ambience, ctx.currentTime, 0.05);
    };
    follow();
    useSettings.subscribe(follow);
    // Not just "suspended": Safari also parks the sound in "interrupted" (after another tab or app
    // plays sound), and nothing would ever wake it.
    const resume = () => void wake();
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    resume();
  }
  return listener;
}

/** Restart the sound if the browser has paused it; true once it's running. */
async function wake() {
  const ctx = listener?.context;
  if (!ctx || ctx.state === "closed") return false;
  if (ctx.state !== "running") {
    await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 400))]);
  }
  return ctx.state === "running";
}

/** Sends a sound through the Effects or Ambience volume instead of straight to the speakers. */
export function toBus(sound: Audio | PositionalAudio, bus: Bus) {
  getListener();
  sound.gain.disconnect();
  sound.gain.connect(buses![bus]);
}

const buffers = new Map<string, Promise<AudioBuffer>>();

/** Sounds made in code (synth.ts), by name; everything else comes from client/public/audio/. */
const MADE_IN_CODE: Record<string, (ctx: BaseAudioContext) => AudioBuffer> = {
  "cast-whoosh": castWhooshBuffer,
  plop: plopBuffer,
  splash: splashBuffer,
  "reel-click": reelClickBuffer,
  "line-snap": lineSnapBuffer,
  "ball-roll": ballRollBuffer,
  sweep: sweepBuffer,
  "ball-return": ballReturnBuffer,
  "dice-roll": diceRollBuffer,
  "garage-door": garageDoorBuffer,
  fanfare: fanfareBuffer,
  "bike-crash": crashBuffer,
};

/** A sound from client/public/audio/ (built by `npm run build:audio`), or one made in code. */
export function loadSound(name: string) {
  let p = buffers.get(name);
  const make = MADE_IN_CODE[name];
  if (!p && make) {
    p = Promise.resolve(make(getListener().context));
    buffers.set(name, p);
  }
  if (!p) {
    p = fetch(asset(`/audio/${name}.mp3`))
      .then((r) => {
        if (!r.ok) throw new Error(`missing sound ${name}`);
        return r.arrayBuffer();
      })
      .then((data) => getListener().context.decodeAudioData(data));
    buffers.set(name, p);
  }
  return p;
}

/** Things that make sound in the world are parented here (added to the scene by <GameAudio>). */
export const soundRoot = new Object3D();
soundRoot.name = "sounds";

/**
 * Play a sound once at a point in the world. `range`: metres at which it's at full volume
 * (it fades with distance beyond that).
 */
export async function playAt(name: string, x: number, y: number, z: number, volume = 1, range = 6, bus: Bus = "effects") {
  const l = getListener();
  if (l.context.state !== "running" && !(await wake())) return; // a key press counts as a gesture: try waking it
  const buffer = await loadSound(name).catch(() => null);
  if (!buffer) return;
  const sound = new PositionalAudio(l);
  toBus(sound, bus);
  sound.setBuffer(buffer);
  sound.setRefDistance(range);
  sound.setRolloffFactor(1.2);
  sound.setVolume(volume);
  sound.position.set(x, y, z);
  soundRoot.add(sound);
  sound.updateMatrixWorld();
  const ended = sound.onEnded.bind(sound);
  sound.onEnded = () => {
    ended();
    soundRoot.remove(sound);
    sound.disconnect();
  };
  sound.play();
  recent.push({ name, at: performance.now() });
  played[name] = (played[name] ?? 0) + 1;
  if (recent.length > 20) recent.shift();
}

/** Play a sound once, not placed in the world (menu clicks, your own Catan pieces). */
export async function play(name: string, volume = 1) {
  if (!listener) return; // nothing before the "Click to start" (browsers block sound until then)
  const l = listener;
  if (l.context.state !== "running") return;
  const buffer = await loadSound(name).catch(() => null);
  if (!buffer) return;
  const sound = new Audio(l);
  toBus(sound, "effects");
  sound.setBuffer(buffer);
  sound.setVolume(volume);
  const ended = sound.onEnded.bind(sound);
  sound.onEnded = () => {
    ended();
    sound.disconnect();
  };
  sound.play();
  recent.push({ name, at: performance.now() });
  played[name] = (played[name] ?? 0) + 1;
  if (recent.length > 20) recent.shift();
}

/** One of a sound's numbered takes (`step-grass-0` … `-4`) at random, so repeats don't sound canned. */
export const take = (name: string, n: number) => `${name}-${Math.floor(Math.random() * n)}`;

/** The last few one-shots played, and a count of every one by name (for tests and debugging). */
export const recent: { name: string; at: number }[] = [];
export const played: Record<string, number> = {};

/** For tests: is sound running. */
export const audioState = () => getListener().context.state;

let analyser: AnalyserNode | null = null;
/** For tests: loudness of everything you hear right now, in dB (RMS and peak over ~0.1 s). */
export function audioLevel() {
  const l = getListener();
  if (!analyser) {
    analyser = l.context.createAnalyser();
    analyser.fftSize = 4096;
    l.gain.connect(analyser);
  }
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let sum = 0, peak = 0;
  for (const v of data) {
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const db = (x: number) => Math.round(20 * Math.log10(x + 1e-9));
  return { rms: db(Math.sqrt(sum / data.length)), peak: db(peak) };
}
