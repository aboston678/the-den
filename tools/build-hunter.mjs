// Build the bear hunt's hunter (Andrew's own design, 2026-10-17): his Higgsfield model plus the
// bear's clips moved across for free (tools/transfer-clips.mjs: same rig joint names, A-pose), plus
// the Knock_Down clip bought for him (rigged on his own mesh, so tools/retarget-clip.mjs applies).
//
// Usage: node tools/build-hunter.mjs   ->   client/public/models/hunter.glb

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { removeDrift } from "./lib/remove-drift.mjs";
import { removeLift } from "./lib/remove-lift.mjs";

const ORIGINAL = "assets/models/hunt/hunter-base-original.glb";
const BEAR_CLIPS = "assets/models/bear/clips";
const OUT = process.env.HUNTER_OUT ?? "client/public/models/hunter.glb";
const moved = join(tmpdir(), "den-hunter-moved.glb");
const animated = join(tmpdir(), "den-hunter-animated.glb");
const run = (...args) => execFileSync("node", args, { stdio: "inherit" });

// The bear's everyday clips (not its fishing, bowling, dance or petting ones).
const KEEP = ["Walk", "Run", "Jump", "OpenDoor", "SitDown", "SitIdle", "StandUp", "Celebrate", "CrouchWalk", "Roar"];
const { clips } = JSON.parse(readFileSync(join(BEAR_CLIPS, "manifest.json"), "utf8"));
const clipArgs = Object.entries(clips).filter(([name]) => KEEP.includes(name)).map(([name, c]) => `${name}=${join(BEAR_CLIPS, c.file)}`);
run("tools/transfer-clips.mjs", ORIGINAL, moved, ...clipArgs);
run("tools/retarget-clip.mjs", moved, animated, "KnockDown=assets/models/hunt/clips/knock-down.glb");

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(animated);
console.log(`Jump: removed up to ${removeLift(doc, "Jump").toFixed(2)} m of built-in lift`);
const d = removeDrift(doc, "Walk");
console.log(`Walk: removed ${d.metres.toFixed(2)} m of built-in travel (natural speed ${d.speed.toFixed(2)} m/s)`);
for (const anim of doc.getRoot().listAnimations()) {
  if (anim.getName() === "Armature|Idle|baselayer") anim.setName("Idle");
}
await doc.transform(
  dedup(),
  prune({ keepLeaves: true }),
  resample(),
  textureCompress({ encoder: sharp, targetFormat: "webp", quality: 88, resize: [2048, 2048] }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
await io.write(OUT, doc);
const names = doc.getRoot().listAnimations().map((a) => a.getName());
console.log(`\nwrote ${OUT}: ${(statSync(OUT).size / 1e6).toFixed(1)} MB, ${names.length} clips: ${names.join(", ")}`);
