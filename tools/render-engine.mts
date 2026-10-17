// Renders a demo ride of the motorcycle's engine (client/src/game/bike/engineSynth.ts) to listen to
// without opening the game: idle, full throttle up through the gears, roll off, brake down through
// the gears, idle again. Uses the game's own bike physics and automatic gearbox.
//   npx tsx tools/render-engine.mts [out.mp3]   (default review/engine-demo.mp3; also a spectrogram .png)
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import ffmpeg from "ffmpeg-static";
import { BIKE, autoGear, bikeRevs, bikeSpeedStep } from "../shared/src/bike.ts";
import { EngineSynth, revsToRpm } from "../client/src/game/bike/engineSynth.ts";

const out = process.argv[2] ?? "review/engine-demo.mp3";
const SR = 44100, BLOCK = 128, FRAME = 1 / 60;

const decode = (file: string, rate: number) => {
  const raw = execFileSync(ffmpeg!, ["-v", "error", "-i", file, "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
};

const engine = new EngineSynth(SR, 7);
engine.setIdle(decode("client/public/audio/bike-idle.mp3", SR), SR);

/** The ride: [seconds, throttle, brake]. */
const SCRIPT: [number, boolean, boolean][] = [
  [2.5, false, false], // idle
  [11, true, false], // full throttle up through the gears (track top speed)
  [2, false, false], // roll off: overrun pops
  [5.5, false, true], // brake down through the gears
  [2.5, false, false], // idle
];

const samples: number[] = [];
let speed = 0, gear = 1;
const block = new Float32Array(BLOCK);
let carry = 0;
for (const [seconds, throttle, brake] of SCRIPT) {
  for (let t = 0; t < seconds; t += FRAME) {
    speed = Math.max(0, bikeSpeedStep(speed, FRAME, { throttle, brake: brake && speed > 0.5, tuck: false }, BIKE.trackSpeed, gear));
    const g = autoGear(speed, gear);
    if (g !== gear) engine.shift(g - gear);
    gear = g;
    const rpm = revsToRpm(bikeRevs(speed, gear));
    // The game updates the engine once a frame; the audio runs in 128-sample blocks.
    carry += FRAME * SR;
    while (carry >= BLOCK) {
      engine.render(block, rpm, throttle ? 1 : 0);
      for (const v of block) samples.push(v);
      carry -= BLOCK;
    }
  }
}

// Level to about -14 dB RMS like the other loud sounds, peaks kept under -1 dB.
let sum = 0, peak = 0;
for (const v of samples) { sum += v * v; peak = Math.max(peak, Math.abs(v)); }
const gain = Math.min(0.2 / Math.sqrt(sum / samples.length), 0.89 / peak);
const pcm = Float32Array.from(samples, (v) => v * gain);
mkdirSync(dirname(out), { recursive: true });
execFileSync(ffmpeg!, ["-v", "error", "-y", "-f", "f32le", "-ar", String(SR), "-ac", "1", "-i", "-", "-c:a", "libmp3lame", "-b:a", "128k", out], { input: Buffer.from(pcm.buffer) });
execFileSync(ffmpeg!, ["-v", "error", "-y", "-i", out, "-lavfi", "showspectrumpic=s=1200x400:legend=0:scale=log:fscale=lin:stop=4000", out.replace(/\.mp3$/, ".png")]);
console.log(`${out}: ${(pcm.length / SR).toFixed(1)} s, before levelling: rms ${Math.sqrt(sum / samples.length).toFixed(3)}, peak ${peak.toFixed(2)}`);
