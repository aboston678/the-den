import { AudioListener, Object3D, PositionalAudio } from "three";
import { settings } from "../../ui/settings.ts";
import {
  ballReturnBuffer, ballRollBuffer, castWhooshBuffer, lineSnapBuffer, plopBuffer, reelClickBuffer, splashBuffer, sweepBuffer,
} from "./synth.ts";

// Sound for the game (GAME_SPEC §10): one listener on the camera, decoded sounds cached by name,
// and short positional one-shots (roars, birds, loons). Browsers only allow sound after the
// player has clicked or pressed a key; the lobby's buttons already count, and we also resume on
// the first click/key in case the browser paused it.

let listener: AudioListener | null = null;

/** The one listener (created on first use, after the lobby click). */
export function getListener() {
  if (!listener) {
    listener = new AudioListener();
    listener.setMasterVolume(1);
    const resume = () => {
      if (listener!.context.state === "suspended") void listener!.context.resume();
    };
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    resume();
  }
  return listener;
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
    p = fetch(`/audio/${name}.mp3`)
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
export async function playAt(name: string, x: number, y: number, z: number, volume = 1, range = 6) {
  const l = getListener();
  if (l.context.state !== "running") return;
  const buffer = await loadSound(name).catch(() => null);
  if (!buffer) return;
  const sound = new PositionalAudio(l);
  sound.setBuffer(buffer);
  sound.setRefDistance(range);
  sound.setRolloffFactor(1.2);
  sound.setVolume(volume * settings().effects);
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
  if (recent.length > 20) recent.shift();
}

/** The last few one-shots played (for tests and debugging). */
export const recent: { name: string; at: number }[] = [];

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
