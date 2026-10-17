// Build the hero furniture (milestones 2.1–2.2) and Andrew's boat from the Higgsfield image→3D
// models in assets/models/phase2/ (job ids in assets/models/phase2-3d-jobs.json): each piece is
// turned to face +z, scaled to its real-world size, stood on y = 0 and centred on x/z, slimmed
// to a game-friendly triangle count, and packed into one compressed GLB.
//
// Usage: npm run build:furniture  ->  client/public/models/furniture.glb
//        npm run build:fish       ->  client/public/models/fish.glb (the 6 species, each 1 m long; the game scales by weight)
//        npm run build:guns      ->  client/public/models/guns.glb (the bear hunt's guns + scope, muzzle toward +z, real lengths)
//        node tools/build-furniture.mjs --bike  ->  round 2's motorcycle (replaced in round 4 by tools/build-bike.mjs, `npm run build:bike`)

import { statSync } from "node:fs";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  clearNodeTransform, dedup, getBounds, mergeDocuments, meshopt, prune, simplifyPrimitive, textureCompress,
  transformMesh, weldPrimitive,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const FISH = process.argv.includes("--fish");
const BIKE = process.argv.includes("--bike");
const GUNS = process.argv.includes("--guns");
const SRC = GUNS ? "assets/models/hunt" : "assets/models/phase2";
const OUT = process.env.OUT ?? (FISH ? "client/public/models/fish.glb" : BIKE ? "client/public/models/bike.glb" : GUNS ? "client/public/models/guns.glb" : "client/public/models/furniture.glb");

/**
 * name -> real-world size (metres, before the house's 1.25× scale) along one measure:
 * "h" height, "l" longest horizontal side. yaw (degrees) turns the piece so its front faces +z.
 */
const PIECES = {
  "grand-piano": { l: 1.75, yaw: 0, tris: 20000, texture: 1024 },
  harp: { h: 1.85, yaw: 0, tris: 14000, texture: 512 },
  "wingback-chair": { h: 1.12, yaw: -90, tris: 12000, texture: 1024 },
  "camelback-sofa": { l: 1.95, yaw: 90, tris: 12000, texture: 1024 },
  "china-cabinet": { h: 2.0, yaw: -90, tris: 12000, texture: 1024 },
  "chippendale-chair": { h: 0.98, yaw: -90, tris: 10000, texture: 512 },
  "leather-armchair-ottoman": { h: 0.9, yaw: -90, tris: 12000, texture: 1024 },
  "pot-rack": { l: 0.9, yaw: 0, tris: 12000, texture: 512 },
  "tiffany-lamp": { h: 1.6, yaw: 0, tris: 8000, texture: 512 },
  "spindle-bench": { l: 1.5, yaw: 90, tris: 10000, texture: 512 },
  "four-poster-bed": { h: 2.0, yaw: -90, tris: 12000, texture: 1024 },
  chesterfield: { l: 2.2, yaw: 90, tris: 12000, texture: 1024 },
  recliner: { h: 1.05, yaw: -90, tris: 10000, texture: 512 },
  canoe: { l: 5.0, yaw: 90, tris: 10000, texture: 1024 },
  boat: { l: 6.9, yaw: 0, tris: 25000, texture: 1024 },
};

/** The fish (milestone 2.4): 1 m long, nose toward +z, small textures. */
const FISH_PIECES = {
  ...Object.fromEntries(["sunfish", "yellow-perch", "crappie", "smallmouth-bass", "largemouth-bass"].map((n) => [`fish-${n}`, { l: 1, yaw: 0, tris: 3000, texture: 512 }])),
  // Andrew's Jenna Catfish (2026-10-16): her picture faces the other way, and the face gets a sharper texture.
  "fish-jenna-catfish": { l: 1, yaw: 180, tris: 6000, texture: 1024 },
};

/** The motorcycle (round 2): a sport bike sized for the chunky 2.1 m bear (a real one is ~2.05 m long), front toward +z. */
const BIKE_PIECES = { motorcycle: { l: 2.45, yaw: Number(process.env.BIKE_YAW ?? 0), tris: 16000, texture: 1024 } };

/** The bear hunt's guns (2026-10-17): real lengths, muzzle toward +z (the models came muzzle toward −z), scope objective toward +z. */
const GUN_PIECES = {
  sniper: { l: 1.15, yaw: 180, tris: 9000, texture: 1024 },
  pistol: { l: 0.21, yaw: 180, tris: 4000, texture: 512 },
  ar: { l: 0.88, yaw: 180, tris: 9000, texture: 1024 },
  shotgun: { l: 1.1, yaw: 180, tris: 8000, texture: 1024 },
  scope: { l: 0.36, yaw: 0, tris: 3000, texture: 512 },
};

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const triangles = (mesh) => mesh.listPrimitives().reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3, 0);
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const out = new Document();
const report = [];
for (const [name, spec] of Object.entries(FISH ? FISH_PIECES : BIKE ? BIKE_PIECES : GUNS ? GUN_PIECES : PIECES)) {
  if (only.length && !only.includes(name)) continue;
  const doc = await io.read(`${SRC}/${name}.glb`);
  const scene = doc.getRoot().listScenes()[0];
  const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh());
  for (const node of nodes) clearNodeTransform(node);
  // One mesh per piece (Tripo exports a single node; keep the first, fold any others into it).
  const node = nodes[0];
  for (const extra of nodes.slice(1)) {
    for (const prim of extra.getMesh().listPrimitives()) node.getMesh().addPrimitive(prim);
    extra.dispose();
  }
  const mesh = node.getMesh();
  const a = (spec.yaw * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  transformMesh(mesh, [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  let { min, max } = getBounds(node);
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const k = spec.h ? spec.h / size[1] : spec.l / Math.max(size[0], size[2]);
  transformMesh(mesh, [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, -k * (min[0] + max[0]) / 2, -k * min[1], -k * (min[2] + max[2]) / 2, 1]);
  const before = triangles(mesh);
  if (before > spec.tris) {
    for (const prim of mesh.listPrimitives()) {
      weldPrimitive(prim);
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: spec.tris / before, error: 0.002 });
    }
  }
  node.setName(name);
  mesh.setName(name);
  for (const m of doc.getRoot().listMaterials()) m.setName(name);
  for (const t of doc.getRoot().listTextures()) t.setName(`${name}_${t.getName() || "tex"}`);
  ({ min, max } = getBounds(node));
  report.push(`${name.padEnd(26)} ${String(Math.round(before)).padStart(6)} -> ${String(Math.round(triangles(mesh))).padStart(5)} tris, ` +
    `${(max[0] - min[0]).toFixed(2)} w x ${(max[1] - min[1]).toFixed(2)} h x ${(max[2] - min[2]).toFixed(2)} d m`);
  if (!scene.listChildren().includes(node)) scene.addChild(node);
  await doc.transform(prune());
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: "webp", quality: 82, resize: [spec.texture, spec.texture] }));
  mergeDocuments(out, doc);
}

// One scene holding every piece.
const scenes = out.getRoot().listScenes();
for (const s of scenes.slice(1)) {
  for (const child of s.listChildren()) scenes[0].addChild(child);
  s.dispose();
}
out.getRoot().setDefaultScene(scenes[0]);
for (const b of out.getRoot().listBuffers().slice(1)) b.dispose();
const buffer = out.getRoot().listBuffers()[0];
for (const acc of out.getRoot().listAccessors()) acc.setBuffer(buffer);

await out.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(OUT, out);
console.log(report.join("\n"));
console.log(`\nwrote ${OUT}: ${(statSync(OUT).size / 1e6).toFixed(2)} MB`);
