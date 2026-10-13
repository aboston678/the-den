// Build the cartoon scenery (art-style remake, 2026-10-13) from the Higgsfield image→3D models in
// assets/models/toon-scenery/ (job ids in assets/models/toon-scenery-jobs.json): each piece is
// stood on y = 0, centred on x/z and scaled to 1 m tall (the game scales every copy to the size of
// the tree, bush or rock it stands in for), then made in three detail levels (<piece>_lod0/1/2,
// fewer triangles each) that share one texture, and packed into one compressed GLB.
//
// Usage: npm run build:toon  ->  client/public/models/toon-scenery.glb

import { statSync } from "node:fs";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  clearNodeTransform, compactPrimitive, dedup, getBounds, mergeDocuments, meshopt, prune, simplifyPrimitive, textureCompress, transformMesh, weldPrimitive,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const SRC = "assets/models/toon-scenery";
const OUT = process.env.OUT ?? "client/public/models/toon-scenery.glb";

/** Triangles per detail level (lod0 close up, lod1 middle distance, lod2 far / shadows only), and texture size. */
const PIECES = {
  pine: { tris: [6000, 1500, 300], texture: 1024 },
  birch: { tris: [6000, 1500, 300], texture: 1024 },
  maple: { tris: [6000, 1500, 300], texture: 1024 },
  bush: { tris: [3000, 800, 200], texture: 512 },
  fern: { tris: [2500, 700, 200], texture: 512 },
  boulder: { tris: [1500, 400, 120], texture: 512 },
  rock: { tris: [1500, 400, 120], texture: 512 },
};

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const triangles = (mesh) => mesh.listPrimitives().reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3, 0);
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

/** sRGB 0…255 → linear 0…1 (glTF vertex colours are linear). */
const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/**
 * Give every corner of a primitive the colour of its spot on the base-colour texture (COLOR_0),
 * then drop the texture and UVs: the primitive is drawn with plain corner colours.
 */
async function paintFromTexture(doc, prim) {
  const material = prim.getMaterial();
  const tex = material?.getBaseColorTexture();
  const uv = prim.getAttribute("TEXCOORD_0");
  if (!tex || !uv) return;
  const { data, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, n = uv.getCount();
  const colours = new Float32Array(n * 3), t = [0, 0];
  for (let i = 0; i < n; i++) {
    uv.getElement(i, t);
    const x = Math.min(W - 1, Math.max(0, Math.floor((t[0] - Math.floor(t[0])) * W)));
    const y = Math.min(H - 1, Math.max(0, Math.floor((t[1] - Math.floor(t[1])) * H)));
    const p = (y * W + x) * 3;
    colours[i * 3] = toLinear(data[p]);
    colours[i * 3 + 1] = toLinear(data[p + 1]);
    colours[i * 3 + 2] = toLinear(data[p + 2]);
  }
  prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(colours).setBuffer(uv.getBuffer()));
  for (const name of prim.listSemantics()) if (name.startsWith("TEXCOORD_") || name === "TANGENT") prim.setAttribute(name, null);
  material.setBaseColorTexture(null).setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
}

/** One detail level of a piece, as its own document (read fresh, so simplifying never touches another level). */
async function level(name, spec, lod) {
  const doc = await io.read(`${SRC}/${name}.glb`);
  const scene = doc.getRoot().listScenes()[0];
  const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh());
  for (const node of nodes) clearNodeTransform(node);
  const node = nodes[0];
  for (const extra of nodes.slice(1)) {
    for (const prim of extra.getMesh().listPrimitives()) node.getMesh().addPrimitive(prim);
    extra.dispose();
  }
  const mesh = node.getMesh();
  const { min, max } = getBounds(node);
  const k = 1 / (max[1] - min[1]);
  transformMesh(mesh, [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, -k * (min[0] + max[0]) / 2, -k * min[1], -k * (min[2] + max[2]) / 2, 1]);
  const before = triangles(mesh), target = spec.tris[lod];
  if (lod === 0) {
    // Close up: the painted texture, simplified carefully (texture seams kept).
    if (before > target) {
      for (const prim of mesh.listPrimitives()) {
        weldPrimitive(prim);
        simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: target / before, error: 0.01, lockBorder: false });
      }
    }
  } else {
    // Further out: Tripo's texture is cut into many small islands, so careful simplifying stalls
    // far above target, and the "sloppy" simplifier (which ignores seams) smears the texture into
    // stripes. Instead each corner takes its colour from the texture first, then the sloppy
    // simplifier keeps whichever corners it likes, and the level is drawn with those colours.
    for (const prim of mesh.listPrimitives()) {
      await paintFromTexture(doc, prim);
      const share = (prim.getIndices().getCount() / 3) / before;
      const positions = new Float32Array(prim.getAttribute("POSITION").getArray());
      const [indices] = MeshoptSimplifier.simplifySloppy(new Uint32Array(prim.getIndices().getArray()), positions, 3, null, Math.max(3, Math.round(target * share) * 3), 1);
      prim.getIndices().setArray(indices);
      compactPrimitive(prim);
    }
  }
  const id = `${name}_lod${lod}`;
  node.setName(id);
  mesh.setName(id);
  for (const m of doc.getRoot().listMaterials()) {
    m.setName(lod === 0 ? name : `${name}_painted`);
    m.setMetallicFactor(0); // painted look: nothing shiny
    m.setMetallicRoughnessTexture(null);
    m.setRoughnessFactor(1);
  }
  for (const t of doc.getRoot().listTextures()) t.setName(`${name}_${t.getName() || "tex"}`);
  if (!scene.listChildren().includes(node)) scene.addChild(node);
  await doc.transform(prune());
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: "webp", quality: 85, resize: [spec.texture, spec.texture] }));
  const b = getBounds(node);
  return { doc, line: `${id.padEnd(14)} ${String(Math.round(before)).padStart(6)} -> ${String(Math.round(triangles(mesh))).padStart(5)} tris, ` +
    `${(b.max[0] - b.min[0]).toFixed(2)} w x ${(b.max[2] - b.min[2]).toFixed(2)} d (1 m tall)` };
}

const out = new Document();
const report = [];
for (const [name, spec] of Object.entries(PIECES)) {
  if (only.length && !only.includes(name)) continue;
  for (const lod of [0, 1, 2]) {
    const { doc, line } = await level(name, spec, lod);
    report.push(line);
    mergeDocuments(out, doc);
  }
}

// One scene, one buffer; identical textures and materials (shared by a piece's three levels) merged.
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
console.log(`\nmaterials: ${out.getRoot().listMaterials().length}, textures: ${out.getRoot().listTextures().length}`);
console.log(`wrote ${OUT}: ${(statSync(OUT).size / 1e6).toFixed(2)} MB`);
