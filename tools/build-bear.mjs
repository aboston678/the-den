// Build the game's bear: original mesh -> fatter -> every clip retargeted -> compressed bear.glb.
//
//   1. tools/fatten-bear.mjs     (torso +22%, belly +15%; Andrew's request)
//   2. tools/retarget-clip.mjs   (every clip in assets/models/bear/clips/manifest.json)
//   3. remove the jump's own lift (physics does the lifting)
//   4. rename the built-in Idle, drop unused data, resample keyframes, meshopt + WebP
//
// Usage: node tools/build-bear.mjs   ->   client/public/models/bear.glb

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { removeLift } from "./lib/remove-lift.mjs";

const ORIGINAL = "assets/models/bear/bear-base-original.glb";
const CLIPS = "assets/models/bear/clips";
const OUT = "client/public/models/bear.glb";
const fat = join(tmpdir(), "den-bear-fat.glb");
const animated = join(tmpdir(), "den-bear-animated.glb");

const run = (...args) => execFileSync("node", args, { stdio: "inherit" });
run("tools/fatten-bear.mjs", "0.22", "0.15", ORIGINAL, fat);

const { clips } = JSON.parse(readFileSync(join(CLIPS, "manifest.json"), "utf8"));
run("tools/retarget-clip.mjs", fat, animated, ...Object.entries(clips).map(([name, c]) => `${name}=${join(CLIPS, c.file)}`));

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(animated);
console.log(`Jump: removed up to ${removeLift(doc, "Jump").toFixed(2)} m of built-in lift`);
for (const anim of doc.getRoot().listAnimations()) {
  if (anim.getName() === "Armature|Idle|baselayer") anim.setName("Idle"); // the base model's built-in clip
}
await doc.transform(
  dedup(),
  prune({ keepLeaves: true }),
  resample(), // drop keyframes that a straight line between neighbours already reproduces
  textureCompress({ encoder: sharp, targetFormat: "webp", quality: 90 }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
await io.write(OUT, doc);

const names = doc.getRoot().listAnimations().map((a) => a.getName());
console.log(`\nwrote ${OUT}: ${(statSync(OUT).size / 1e6).toFixed(1)} MB, ${names.length} clips: ${names.join(", ")}`);
