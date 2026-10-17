// Build the realistic motorcycle (round 4, Andrew 2026-10-17) from the Higgsfield multiview model
// in assets/models/phase2/motorcycle-v2.glb (job id in assets/models/phase2-3d-jobs.json):
//   - turned so its front faces +z, scaled to BIKE_L metres long, stood on y = 0, centred on x;
//   - each wheel (tyre, rim and spokes) cut out of the body into its own node whose origin is the
//     axle, so the game can spin it (client/src/game/bike/rider.ts);
//   - a clearcoat map made from the colour map (the red paint glossy, the tyres and black parts not);
//   - slimmed to a game-friendly triangle count, 2K textures, meshopt-compressed.
//
// Usage: npm run build:bike  ->  client/public/models/bike.glb   (prints where it found the wheels)
//        BIKE_YAW=90 npm run build:bike   to turn it if it comes out facing the wrong way

import { statSync } from "node:fs";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRMaterialsClearcoat } from "@gltf-transform/extensions";
import { clearNodeTransform, dedup, getBounds, meshopt, prune, simplifyPrimitive, textureCompress, transformMesh, weldPrimitive } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const SRC = "assets/models/phase2/motorcycle-v2.glb";
const OUT = process.env.OUT ?? "client/public/models/bike.glb";
/** Length (metres): a real sport bike is ~2.05 m; sized up for the chunky 2.1 m bear like the old one. */
const L = Number(process.env.BIKE_L ?? 2.45);
const YAW = Number(process.env.BIKE_YAW ?? -90); // the multiview model faces +x
const TRIS = { body: 90000, wheel: 9000 };
/** Tyre outer radius as a share of the bike's length (17" sport wheels on a ~2.05 m bike), and each tyre's half-width (metres, at this length). */
const WHEEL_R = Number(process.env.WHEEL_R ?? 0.152);
const HALF_W = { front: Number(process.env.FRONT_HW ?? 0.075), rear: Number(process.env.REAR_HW ?? 0.105) };

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const doc = await io.read(SRC);
const root = doc.getRoot();
const scene = root.listScenes()[0];
const nodes = root.listNodes().filter((n) => n.getMesh());
for (const n of root.listNodes()) clearNodeTransform(n);
const node = nodes[0];
for (const extra of nodes.slice(1)) {
  for (const prim of extra.getMesh().listPrimitives()) node.getMesh().addPrimitive(prim);
  extra.dispose();
}
const mesh = node.getMesh();
const a = (YAW * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
transformMesh(mesh, [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
let { min, max } = getBounds(node);
const k = L / (max[2] - min[2]);
transformMesh(mesh, [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, -k * (min[0] + max[0]) / 2, -k * min[1], -k * (min[2] + max[2]) / 2, 1]);
({ min, max } = getBounds(node));
console.log(`bike ${(max[0] - min[0]).toFixed(2)} w x ${(max[1] - min[1]).toFixed(2)} h x ${(max[2] - min[2]).toFixed(2)} l m`);

// --- find the wheels: each tyre's lowest, front-most / rear-most point near the ground ---
const R = WHEEL_R * L;
let front = -Infinity, rear = Infinity;
for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute("POSITION");
  const p = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, p);
    if (p[1] > R * 0.6 || Math.abs(p[0]) > 0.12) continue;
    front = Math.max(front, p[2]);
    rear = Math.min(rear, p[2]);
  }
}
const axles = {
  front: { y: R, z: Number(process.env.FRONT_Z ?? front - R) },
  rear: { y: R, z: Number(process.env.REAR_Z ?? rear + R) },
};
console.log(`wheels: radius ${R.toFixed(3)} m, front axle z ${axles.front.z.toFixed(3)}, rear axle z ${axles.rear.z.toFixed(3)}`);

/** Which wheel a triangle belongs to (by its centre), or null for the body. */
function wheelOf(cx, cy, cz) {
  for (const [name, ax] of Object.entries(axles)) {
    if (Math.abs(cx) > HALF_W[name]) continue;
    if (Math.hypot(cy - ax.y, cz - ax.z) < R * 0.985) return name;
  }
  return null;
}

// --- split every primitive into body + front wheel + rear wheel (fresh accessors for each) ---
const parts = { body: [], front: [], rear: [] };
for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute("POSITION");
  const idx = prim.getIndices()?.getArray() ?? Array.from({ length: pos.getCount() }, (_, i) => i);
  const P = pos.getArray();
  const groups = { body: [], front: [], rear: [] };
  for (let t = 0; t < idx.length; t += 3) {
    const [i0, i1, i2] = [idx[t], idx[t + 1], idx[t + 2]];
    const cx = (P[i0 * 3] + P[i1 * 3] + P[i2 * 3]) / 3, cy = (P[i0 * 3 + 1] + P[i1 * 3 + 1] + P[i2 * 3 + 1]) / 3, cz = (P[i0 * 3 + 2] + P[i1 * 3 + 2] + P[i2 * 3 + 2]) / 3;
    groups[wheelOf(cx, cy, cz) ?? "body"].push(i0, i1, i2);
  }
  for (const [name, tris] of Object.entries(groups)) {
    if (!tris.length) continue;
    const remap = new Map();
    const newIdx = new Uint32Array(tris.length);
    tris.forEach((v, i) => {
      if (!remap.has(v)) remap.set(v, remap.size);
      newIdx[i] = remap.get(v);
    });
    const out = doc.createPrimitive().setMaterial(prim.getMaterial()).setIndices(doc.createAccessor().setType("SCALAR").setArray(newIdx));
    const off = name === "body" ? null : axles[name];
    for (const sem of prim.listSemantics()) {
      const src = prim.getAttribute(sem), size = src.getElementSize(), arr = src.getArray();
      const dst = new arr.constructor(remap.size * size);
      for (const [from, to] of remap) for (let e = 0; e < size; e++) dst[to * size + e] = arr[from * size + e];
      if (sem === "POSITION" && off) for (let i = 0; i < remap.size; i++) { dst[i * 3 + 1] -= off.y; dst[i * 3 + 2] -= off.z; }
      out.setAttribute(sem, doc.createAccessor().setType(src.getType()).setArray(dst).setNormalized(src.getNormalized()));
    }
    parts[name].push(out);
  }
}

// --- the nodes: body, and each wheel at its axle ---
const group = doc.createNode("motorcycle");
for (const [name, prims] of Object.entries(parts)) {
  const m = doc.createMesh(name === "body" ? "motorcycle_body" : `wheel_${name}`);
  for (const p of prims) {
    weldPrimitive(p);
    const tris = (p.getIndices().getCount() / 3);
    const target = name === "body" ? TRIS.body : TRIS.wheel;
    if (tris > target) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: target / tris, error: 0.001 });
    m.addPrimitive(p);
  }
  const n = doc.createNode(m.getName()).setMesh(m);
  if (name !== "body") n.setTranslation([0, axles[name].y, axles[name].z]);
  group.addChild(n);
  console.log(`${m.getName().padEnd(16)} ${m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0)} tris`);
}
for (const child of scene.listChildren()) scene.removeChild(child);
scene.addChild(group);
mesh.dispose();
node.dispose();

// --- glossy paint: a clearcoat map from the colour map (red = full gloss, black/grey = a little) ---
const clearcoat = doc.createExtension(KHRMaterialsClearcoat);
for (const mat of root.listMaterials()) {
  mat.setName("motorcycle");
  const base = mat.getBaseColorTexture();
  if (!base) continue;
  const { data, info } = await sharp(Buffer.from(base.getImage())).resize(1024, 1024).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * info.channels], g = data[i * info.channels + 1], b = data[i * info.channels + 2];
    const red = Math.max(0, r - Math.max(g, b)) / 255;
    const v = Math.min(1, 0.15 + red * 2.2);
    out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = Math.round(v * 255);
  }
  const png = await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
  const tex = doc.createTexture("motorcycle_clearcoat").setImage(png).setMimeType("image/png");
  mat.setExtension("KHR_materials_clearcoat", clearcoat.createClearcoat().setClearcoatFactor(1).setClearcoatTexture(tex).setClearcoatRoughnessFactor(0.06));
}
for (const t of root.listTextures()) if (!t.getName()) t.setName("motorcycle_tex");

await doc.transform(prune(), dedup());
await doc.transform(textureCompress({ encoder: sharp, targetFormat: "webp", quality: 85, resize: [2048, 2048] }));
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(OUT, doc);
console.log(`wrote ${OUT}: ${(statSync(OUT).size / 1e6).toFixed(2)} MB`);
