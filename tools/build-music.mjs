// Builds the menu music (milestone 1.11): Andrew's 19 s intro clip and the full song, levelled to
// match, into client/public/audio/. Also finds where the clip ends inside the full song, so the
// lobby can carry the song on seamlessly, and writes it to client/src/ui/intro/song.json.
// Usage: node tools/build-music.mjs (part of npm run build:audio)
import { execFileSync } from "node:child_process";
import { statSync, writeFileSync } from "node:fs";
import ffmpeg from "ffmpeg-static";

const CLIP = "assets/audio/intro-19s.mp3";
const SONG = "assets/audio/allen-weiss.mp3";
const RATE = 4000; // for lining the two up

function decode(file, rate, seconds) {
  const args = ["-v", "error", "-i", file, "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"];
  if (seconds) args.splice(2, 0, "-t", String(seconds));
  const raw = execFileSync(ffmpeg, args, { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}
const rms = (s, a = 0, b = s.length) => {
  let sum = 0;
  for (let i = a; i < b; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / (b - a));
};

const clip = decode(CLIP, RATE);
const song = decode(SONG, RATE, 25);
const clipSeconds = clip.length / RATE;

// The lag (in samples, 0…1.5 s) where the song best matches the clip: normalised cross-correlation.
let best = { lag: 0, score: -Infinity };
for (let lag = 0; lag < 1.5 * RATE; lag++) {
  let dot = 0, ea = 0, eb = 0;
  for (let i = 0; i < clip.length - 1; i += 2) {
    const a = clip[i], b = song[i + lag] ?? 0;
    dot += a * b;
    ea += a * a;
    eb += b * b;
  }
  const score = dot / Math.sqrt(ea * eb);
  if (score > best.score) best = { lag, score };
}
const lagSeconds = best.lag / RATE;
const resumeAt = clipSeconds + lagSeconds;
// How much louder the clip is than the same stretch of the song.
const gainDb = 20 * Math.log10(rms(clip) / rms(song, best.lag, best.lag + clip.length));
console.log(`clip ${clipSeconds.toFixed(3)} s, song lags by ${lagSeconds.toFixed(3)} s (match ${best.score.toFixed(3)}), clip is ${gainDb.toFixed(1)} dB louder`);

const OUT = "client/public/audio";
// The clip as-is (stereo); the song raised to match it, with a limiter so the louder parts can't clip.
execFileSync(ffmpeg, ["-v", "error", "-y", "-i", CLIP, "-c:a", "libmp3lame", "-b:a", "160k", `${OUT}/intro.mp3`]);
execFileSync(ffmpeg, ["-v", "error", "-y", "-i", SONG, "-af", `volume=${gainDb.toFixed(2)}dB,alimiter=limit=0.95:level=false`, "-c:a", "libmp3lame", "-b:a", "128k", `${OUT}/menu-song.mp3`]);
for (const f of ["intro", "menu-song"]) console.log(`${f}.mp3 ${(statSync(`${OUT}/${f}.mp3`).size / 1024).toFixed(0)} KB`);

writeFileSync("client/src/ui/intro/song.json", `${JSON.stringify({ introLength: +clipSeconds.toFixed(3), songResumeAt: +resumeAt.toFixed(3) }, null, 2)}\n`);
console.log(`song resumes at ${resumeAt.toFixed(3)} s`);
