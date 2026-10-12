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
