// Builds the TV loop (milestone 2.2, GAME_SPEC §8.4) from Andrew's three phone clips in
// assets/video/ into assets/video/out/tv.mp4: each tall clip centred on a 16:9 frame with a
// blurred, darkened copy of itself filling the sides, levelled sound, all three joined into one
// loop. The clips are private: they stay out of git and client/public and are served from private
// storage to signed-in players only. Usage: npm run build:tv
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import ffmpeg from "ffmpeg-static";

const SRC = "assets/video";
const OUT = "assets/video/out";
const CLIPS = ["clip-1-couch.mov", "clip-2-listening.mov", "clip-3-focused.mp4"];
const W = 1280, H = 720, FPS = 30;

mkdirSync(OUT, { recursive: true });

const inputs = CLIPS.flatMap((c) => ["-i", `${SRC}/${c}`]);
const parts = CLIPS.map((_, i) => [
  `[${i}:v]fps=${FPS},setsar=1,split[a${i}][b${i}]`,
  `[a${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.12[bg${i}]`,
  `[b${i}]scale=-2:${H}[fg${i}]`,
  `[bg${i}][fg${i}]overlay=(W-w)/2:0,setsar=1,format=yuv420p[v${i}]`,
  `[${i}:a]aresample=44100,aformat=channel_layouts=mono,loudnorm=I=-20:TP=-2,aresample=44100[s${i}]`,
].join(";"));
const concat = CLIPS.map((_, i) => `[v${i}][s${i}]`).join("") + `concat=n=${CLIPS.length}:v=1:a=1[v][a]`;

execFileSync(ffmpeg, [
  "-v", "error", "-y", ...inputs,
  "-filter_complex", [...parts, concat].join(";"),
  "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-profile:v", "main", "-preset", "slow", "-crf", "26",
  "-c:a", "aac", "-b:a", "96k",
  "-movflags", "+faststart",
  `${OUT}/tv.mp4`,
], { stdio: "inherit" });

console.log(`tv.mp4: ${(statSync(`${OUT}/tv.mp4`).size / 1e6).toFixed(1)} MB`);
