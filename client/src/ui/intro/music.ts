import { getListener } from "../../game/audio/audio.ts";
import { settings, useSettings } from "../settings.ts";
import song from "./song.json" with { type: "json" };

// The menu music (GAME_SPEC §10, §11): Andrew's 19 s intro clip, then the full song carrying on
// from exactly where the clip ends (tools/build-music.mjs works out where), looping in the lobby,
// fading out when the game starts.

const ctx = () => getListener().context;
let bus: GainNode | null = null;
let musicVolume = settings().music;
useSettings.subscribe((s) => setMusicVolume(s.music));

function musicBus() {
  if (!bus) {
    bus = ctx().createGain();
    bus.gain.value = musicVolume;
    bus.connect(ctx().destination);
  }
  return bus;
}

/** Music volume, 0…1 (settings). */
export function setMusicVolume(v: number) {
  musicVolume = v;
  if (bus) bus.gain.setTargetAtTime(v, ctx().currentTime, 0.05);
}

const buffers = new Map<string, Promise<AudioBuffer>>();
function load(name: string) {
  let p = buffers.get(name);
  if (!p) {
    p = fetch(`/audio/${name}.mp3`).then((r) => r.arrayBuffer()).then((d) => ctx().decodeAudioData(d));
    buffers.set(name, p);
  }
  return p;
}

interface Playing {
  src: AudioBufferSourceNode;
  gain: GainNode;
}
let intro: (Playing & { startAt: number }) | null = null;
let full: Playing | null = null;

function play(buffer: AudioBuffer, offset: number, when: number, fadeIn: number, loop = false): Playing {
  const src = ctx().createBufferSource();
  src.buffer = buffer;
  src.loop = loop;
  const gain = ctx().createGain();
  gain.gain.setValueAtTime(fadeIn > 0 ? 0 : 1, when);
  if (fadeIn > 0) gain.gain.linearRampToValueAtTime(1, when + fadeIn);
  src.connect(gain).connect(musicBus());
  src.start(when, offset);
  return { src, gain };
}

function fadeOut(p: Playing, seconds: number, at = ctx().currentTime) {
  p.gain.gain.cancelScheduledValues(at);
  p.gain.gain.setValueAtTime(p.gain.gain.value, at);
  p.gain.gain.linearRampToValueAtTime(0, at + seconds);
  p.src.stop(at + seconds + 0.05);
}

export const INTRO_LENGTH = song.introLength;

/** Load both songs (call early so the intro can start the moment you click). */
export function preloadMusic() {
  void load("intro");
  void load("menu-song");
}

/** Start the intro clip; resolves when it's playing. */
export async function startIntro() {
  if (ctx().state !== "running") await ctx().resume();
  const buffer = await load("intro");
  const startAt = ctx().currentTime + 0.05;
  intro = { ...play(buffer, 0, startAt, 0), startAt };
  // Carry on into the full song: it fades in over the last second of the clip, in step with it.
  const songBuffer = await load("menu-song");
  if (!intro || full) return;
  const overlap = 1;
  const handoverAt = startAt + song.introLength - overlap;
  full = play(songBuffer, song.songResumeAt - overlap, Math.max(ctx().currentTime, handoverAt), overlap, true);
}

/** Seconds into the intro clip (the clock the lyrics follow). */
export const introTime = () => (intro ? Math.max(0, ctx().currentTime - intro.startAt) : 0);

/** Skip: fade the clip out and the song in from the same point in the music. */
export async function skipIntro() {
  if (!intro) return;
  const t = introTime();
  const now = ctx().currentTime;
  const handedOver = t >= song.introLength - 1;
  fadeOut(intro, 0.4, now);
  intro = null;
  if (handedOver && full) return; // the song is already taking over
  if (full) fadeOut(full, 0.05, now);
  const songBuffer = await load("menu-song");
  full = play(songBuffer, Math.min(t + (song.songResumeAt - song.introLength), songBuffer.duration - 1), ctx().currentTime, 0.4, true);
}

/** Fade the menu music out (the game is starting). */
export function stopMenuMusic(seconds = 3) {
  if (intro) fadeOut(intro, seconds);
  if (full) fadeOut(full, seconds);
  intro = null;
  full = null;
}

/** Bring the song back (back to the home screen from a game). */
export async function resumeMenuMusic() {
  if (full || intro) return;
  full = play(await load("menu-song"), 0, ctx().currentTime, 2, true);
}
