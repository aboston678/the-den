// Build the outdoor props (milestone 1.8) from the CC0 Poly Haven downloads:
// every rock / fern / shrub / log becomes its own mesh, standing on y = 0 and centred on x/z,
// slimmed to a game-friendly triangle count, then packed into one compressed GLB.
//
// Usage: node tools/fetch-polyhaven.mjs && node tools/build-outdoor-props.mjs
//   ->   client/public/models/outdoor-props.glb

import { statSync } from "node:fs";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  clearNodeTransform, dedup, getBounds, mergeDocuments, meshopt, prune, simplifyPrimitive, textureCompress,
  transformMesh, weldPrimitive,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const SRC = "assets/polyhaven/models";
const OUT = "client/public/models/outdoor-props.glb";

/**
 * source model -> { source node name: output name } and the triangle budget per piece.
 * Foliage cards (ferns, shrubs) aren't simplified: it tears the leaves apart.
 */
const PIECES = {
  boulder_01: { tris: 6000, error: 0.05, texture: 1024, names: { boulder_01: "boulder" } },
  rock_moss_set_01: {
    tris: 1500, texture: 1024,
    names: Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`rock_moss_set_01_rock0${i}`, `rock_${i}`])),
  },
  rock_moss_set_02: {
    tris: 1500, texture: 1024,
    names: Object.fromEntries([7, 8, 9, 10, 11, 12, 13].map((i) => [`rock_moss_set_02_rock${String(i).padStart(2, "0")}`, `rock_${i}`])),
  },
  dead_tree_trunk: { tris: 3000, texture: 1024, names: { dead_tree_trunk: "log" } },
  tree_stump_01: { tris: 2000, texture: 512, names: { tree_stump_01: "stump" } },
  fern_02: { texture: 512, names: { fern_02_a: "fern_a", fern_02_b: "fern_b", fern_02_c: "fern_c", fern_02_d: "fern_d" } },
  shrub_02: { tris: 5000, texture: 512, names: { shrub_02_a: "shrub_a", shrub_02_b: "shrub_b", shrub_02_c: "shrub_c", shrub_02_d: "shrub_d" } },
  shrub_04: { tris: 5000, texture: 512, names: { shrub_04: "shrub_e" } },
};

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const triangles = (mesh) => mesh.listPrimitives().reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3, 0);

const out = new Document();
const report = [];
for (const [model, spec] of Object.entries(PIECES)) {
  const doc = await io.read(`${SRC}/${model}/${model}.gltf`);
  const scene = doc.getRoot().listScenes()[0];
  for (const node of doc.getRoot().listNodes()) {
    const name = spec.names[node.getName()];
    const mesh = node.getMesh();
    if (!name || !mesh) {
      node.dispose();
      continue;
    }
    clearNodeTransform(node); // bake the node's offset/rotation into the mesh
    const { min, max } = getBounds(node);
    transformMesh(mesh, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2, 1]);
    const before = triangles(mesh);
    if (spec.tris && before > spec.tris) {
      for (const prim of mesh.listPrimitives()) {
        weldPrimitive(prim);
        simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: spec.tris / before, error: spec.error ?? 0.01 });
      }
    }
    node.setName(name);
    mesh.setName(name);
    for (const t of doc.getRoot().listTextures()) t.setName(`${model}_${t.getName() || t.getURI()}`.replace(/\.[a-z]+$/i, ""));
    const size = getBounds(node);
    report.push(`${name.padEnd(9)} ${String(Math.round(before)).padStart(6)} -> ${String(Math.round(triangles(mesh))).padStart(5)} tris, ` +
      `${(size.max[0] - size.min[0]).toFixed(2)} x ${(size.max[1] - size.min[1]).toFixed(2)} x ${(size.max[2] - size.min[2]).toFixed(2)} m`);
    if (!scene.listChildren().includes(node)) scene.addChild(node);
  }
  await doc.transform(prune());
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: "webp", quality: 85, resize: [spec.texture, spec.texture] }));
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
for (const a of out.getRoot().listAccessors()) a.setBuffer(buffer);

await out.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(OUT, out);
console.log(report.join("\n"));
console.log(`\nwrote ${OUT}: ${(statSync(OUT).size / 1e6).toFixed(2)} MB`);
