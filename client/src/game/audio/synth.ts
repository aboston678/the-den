// Sounds made in code instead of recorded (GAME_SPEC §10): wind in the pines, the quiet hum of a
// room, and a crackling fire. Each is a few seconds of audio built once and looped.

/** A deterministic random number generator, so the sounds are the same every time. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
}

/** Make the last `fade` seconds blend into the start, so the buffer loops without a click. */
function loopify(data: Float32Array, rate: number, fade = 0.5) {
  const n = Math.round(fade * rate);
  const out = data.slice(0, data.length - n);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    out[i] = out[i]! * k + data[data.length - n + i]! * (1 - k);
  }
  return out;
}

/** Into an AudioBuffer, levelled to -20 dB RMS like the recorded sounds (tools/build-audio.mjs), so volumes compare. */
function toBuffer(ctx: BaseAudioContext, data: Float32Array, rate: number) {
  let sum = 0;
  for (const v of data) sum += v * v;
  const gain = 0.1 / Math.sqrt(sum / data.length || 1);
  for (let i = 0; i < data.length; i++) data[i]! *= gain;
  const b = ctx.createBuffer(1, data.length, rate);
  b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  return b;
}

/** Wind through pine needles: soft filtered noise that swells and dies away over ~20 s. */
export function windBuffer(ctx: BaseAudioContext) {
  const rate = 22050, seconds = 24;
  const r = rng(11);
  const data = new Float32Array(rate * seconds);
  let lp = 0, lp2 = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    // Gusts: a few slow waves added together.
    const gust = 0.45 + 0.3 * Math.sin(t * 0.31) + 0.2 * Math.sin(t * 0.73 + 1) + 0.1 * Math.sin(t * 1.9 + 2);
    lp += (r() - lp) * 0.08; // a hiss that's mostly high-mid, like needles
    lp2 += (lp - lp2) * 0.5;
    data[i] = (lp - lp2 * 0.6) * gust * 1.6;
  }
  return toBuffer(ctx, loopify(data, rate, 2), rate);
}

/** The quiet hum of a house: very low, soft rumble. */
export function roomToneBuffer(ctx: BaseAudioContext) {
  const rate = 22050, seconds = 8;
  const r = rng(5);
  const data = new Float32Array(rate * seconds);
  let brown = 0;
  for (let i = 0; i < data.length; i++) {
    brown = (brown + r() * 0.02) * 0.995;
    data[i] = brown * 2;
  }
  return toBuffer(ctx, loopify(data, rate), rate);
}

/** A wood fire: a low roar of flames plus random crackles and the odd pop. */
export function fireBuffer(ctx: BaseAudioContext) {
  const rate = 22050, seconds = 10;
  const r = rng(23);
  const data = new Float32Array(rate * seconds);
  let lp = 0;
  for (let i = 0; i < data.length; i++) {
    lp += (r() - lp) * 0.03; // the flames' low rush
    data[i] = lp * 0.5;
  }
  // Crackles: short bursts of bright noise, with a few bigger pops.
  for (let k = 0; k < seconds * 14; k++) {
    const start = Math.floor(((r() + 1) / 2) * (data.length - rate * 0.05));
    const big = r() > 0.85;
    const len = Math.floor(rate * (big ? 0.02 : 0.004 + ((r() + 1) / 2) * 0.006));
    const amp = big ? 0.7 : 0.15 + ((r() + 1) / 2) * 0.3;
    for (let i = 0; i < len; i++) data[start + i]! += r() * amp * Math.exp((-6 * i) / len);
  }
  return toBuffer(ctx, loopify(data, rate, 0.3), rate);
}

// --- fishing (milestone 2.4): short one-shots ---

/** A rod whipping through the air: a fast rising-then-falling filtered noise sweep. */
export function castWhooshBuffer(ctx: BaseAudioContext) {
  const rate = 22050, data = new Float32Array(Math.round(rate * 0.45));
  const r = rng(31);
  let lp = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length;
    const env = Math.sin(Math.PI * Math.min(1, t * 1.3)) ** 2;
    lp += (r() - lp) * (0.05 + 0.5 * env); // brighter in the middle of the swing
    data[i] = lp * env;
  }
  return toBuffer(ctx, data, rate);
}

/** Water: a plop (lure landing, small) or a splash (a fish breaking the surface, big). */
function waterBuffer(ctx: BaseAudioContext, big: boolean) {
  const rate = 22050, data = new Float32Array(Math.round(rate * (big ? 0.9 : 0.35)));
  const r = rng(big ? 41 : 43);
  let lp = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    // A dropping "bloop" tone under a burst of filtered noise.
    const tone = Math.sin(2 * Math.PI * (big ? 180 : 420) * t * (1 - t * 1.2)) * Math.exp(-t * (big ? 9 : 22));
    lp += (r() - lp) * (big ? 0.35 : 0.25);
    data[i] = tone * 0.6 + lp * Math.exp(-t * (big ? 4.5 : 14)) * (big ? 1.4 : 0.7);
  }
  return toBuffer(ctx, data, rate);
}
export const plopBuffer = (ctx: BaseAudioContext) => waterBuffer(ctx, false);
export const splashBuffer = (ctx: BaseAudioContext) => waterBuffer(ctx, true);

/** One turn of the reel handle: a quick ratchet of clicks. */
export function reelClickBuffer(ctx: BaseAudioContext) {
  const rate = 22050, data = new Float32Array(Math.round(rate * 0.12));
  const r = rng(47);
  for (let k = 0; k < 4; k++) {
    const start = Math.round(k * rate * 0.028);
    for (let i = 0; i < 90 && start + i < data.length; i++) data[start + i]! += r() * Math.exp(-i / 14) * (k % 2 ? 0.6 : 1);
  }
  return toBuffer(ctx, data, rate);
}

/** The line snapping: a sharp crack and a falling twang. */
export function lineSnapBuffer(ctx: BaseAudioContext) {
  const rate = 22050, data = new Float32Array(Math.round(rate * 0.6));
  const r = rng(53);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    data[i] = r() * Math.exp(-t * 90) + Math.sin(2 * Math.PI * 900 * t * (1 - t * 0.7)) * Math.exp(-t * 7) * 0.5;
  }
  return toBuffer(ctx, data, rate);
}

// --- bowling (milestone 3.2) ---

/** A ball rolling down a wooden lane: a low, slightly lumpy rumble (~2.8 s, fades in and out). */
export function ballRollBuffer(ctx: BaseAudioContext) {
  const rate = 22050, seconds = 2.8, data = new Float32Array(Math.round(rate * seconds));
  const r = rng(61);
  let lp = 0, lp2 = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    lp += (r() - lp) * 0.02;
    lp2 += (lp - lp2) * 0.08;
    const lumps = 0.75 + 0.25 * Math.sin(2 * Math.PI * 7.5 * t); // the boards going by
    const env = Math.min(1, t / 0.12) * Math.min(1, (seconds - t) / 0.4);
    data[i] = (lp2 * 6 * lumps + Math.sin(2 * Math.PI * 55 * t) * 0.05) * env;
  }
  return toBuffer(ctx, data, rate);
}

/** The pinsetter's sweep: a motor whir and a soft clatter. */
export function sweepBuffer(ctx: BaseAudioContext) {
  const rate = 22050, seconds = 1.3, data = new Float32Array(Math.round(rate * seconds));
  const r = rng(73);
  let lp = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    lp += (r() - lp) * 0.12;
    const saw = ((t * 92) % 1) * 2 - 1;
    const env = Math.min(1, t / 0.15) * Math.min(1, (seconds - t) / 0.3);
    data[i] = (saw * 0.25 + lp * 0.8) * env;
  }
  return toBuffer(ctx, data, rate);
}

/** The ball coming back up the return: a hollow thunk. */
export function ballReturnBuffer(ctx: BaseAudioContext) {
  const rate = 22050, data = new Float32Array(Math.round(rate * 0.5));
  const r = rng(79);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    data[i] = Math.sin(2 * Math.PI * 85 * t * (1 - t * 0.6)) * Math.exp(-t * 11) + r() * Math.exp(-t * 60) * 0.4;
  }
  return toBuffer(ctx, data, rate);
}

/** Seconds into the dice tumble when each die hits the table (the sound and the animation share them). */
export const DICE_HITS = [0.42, 0.62, 0.76, 0.86, 0.93] as const;

/** Two wooden dice clattering on the table: short bright knocks that get softer. */
export function diceRollBuffer(ctx: BaseAudioContext) {
  const rate = 22050, seconds = 1.2, data = new Float32Array(Math.round(rate * seconds));
  const r = rng(97);
  DICE_HITS.forEach((at, k) => {
    for (const die of [0, 1]) {
      const start = Math.round((at + die * 0.025 + r() * 0.01) * rate);
      const pitch = 1700 + r() * 900 + die * 300;
      const loud = 0.75 * Math.pow(0.62, k);
      for (let i = 0; i < 0.06 * rate && start + i < data.length; i++) {
        const t = i / rate;
        data[start + i]! += (Math.sin(2 * Math.PI * pitch * t) * 0.6 + (r() * 2 - 1) * 0.5) * Math.exp(-t * 90) * loud;
      }
    }
  });
  return toBuffer(ctx, data, rate);
}

/** A tilt-up garage door going over: a low motor hum and rattling rollers, ending in a thud. */
export function garageDoorBuffer(ctx: BaseAudioContext) {
  const rate = 22050, seconds = 1.4, data = new Float32Array(Math.round(rate * seconds));
  const r = rng(97);
  let lp = 0, hp = 0, prev = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    const run = Math.min(1, t / 0.12) * Math.min(1, Math.max(0, (1.05 - t) / 0.15));
    const hum = (((t * 58) % 1) * 2 - 1) * 0.35;
    lp += (r() - lp) * 0.05;
    // Rollers: a quick rattle a dozen times a second.
    const n = r();
    hp = 0.6 * (hp + n - prev);
    prev = n;
    const rattle = hp * (0.5 + 0.5 * Math.sin(2 * Math.PI * 13 * t)) ** 6 * 0.6;
    const thud = t > 1.05 ? Math.sin(2 * Math.PI * 70 * (t - 1.05)) * Math.exp(-(t - 1.05) * 18) * 1.4 : 0;
    data[i] = (hum * 0.6 + lp * 0.9 + rattle) * run + thud;
  }
  return toBuffer(ctx, data, rate);
}

/** A short happy fanfare for a Catan win: four rising bell notes, the last one held. */
export function fanfareBuffer(ctx: BaseAudioContext) {
  const rate = 22050, seconds = 1.8, data = new Float32Array(Math.round(rate * seconds));
  const notes: [number, number][] = [[523.25, 0], [659.25, 0.14], [783.99, 0.28], [1046.5, 0.44]];
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    let v = 0;
    for (const [f, at] of notes) {
      if (t < at) continue;
      const u = t - at, decay = at === 0.44 ? 2.2 : 7;
      v += (Math.sin(2 * Math.PI * f * u) + 0.35 * Math.sin(2 * Math.PI * f * 2 * u) + 0.12 * Math.sin(2 * Math.PI * f * 3 * u)) * Math.exp(-u * decay) * Math.min(1, u / 0.005);
    }
    data[i] = v * 0.5;
  }
  return toBuffer(ctx, data, rate);
}

/** A bike hitting something hard: a crunch and a thud. */
export function crashBuffer(ctx: BaseAudioContext) {
  const rate = 22050, data = new Float32Array(Math.round(rate * 0.7));
  const r = rng(77);
  let lp = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    lp += (r() - lp) * 0.3;
    data[i] = lp * Math.exp(-t * 9) * 1.4 + Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 12) * 1.2;
  }
  return toBuffer(ctx, data, rate);
}
