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
import { clearNodeTransform, dedup, getBounds, joinPrimitives, meshopt, prune, simplifyPrimitive, textureCompress, transformMesh, weldPrimitive } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const SRC = "assets/models/phase2/motorcycle-v2.glb";
const OUT = process.env.OUT ?? "client/public/models/bike.glb";
/** Length (metres): a real sport bike is ~2.05 m; sized up for the chunky 2.1 m bear like the old one. */
const L = Number(process.env.BIKE_L ?? 2.45);
const YAW = Number(process.env.BIKE_YAW ?? -90); // the multiview model faces +x
const TRIS = { body: 90000, wheel: 9000 };
/**
 * Each wheel's cut (metres, at this length), measured on the model. Hub (inside the rim): only the
 * spokes and hub, so the brake discs, calipers, swingarm, chain and sprocket (all >= 0.1 m out from
 * the middle) stay on the body. Rim and tyre: their full width; on the chain's side of the rear
 * wheel a little narrower, so the chain running past the tyre stays put.
 */
const CUT = {
  front: { tyre: 0.098, chainSide: 0.098, hub: 0.075 },
  rear: { tyre: 0.155, chainSide: 0.125, hub: 0.1 },
};
/** Where the rim begins and where the tyre begins, as shares of the tyre's radius. */
const RIM = 0.62, TYRE = 0.72;
/**
 * The generated model fused the top of each tyre into the mudguard over it, so the upper tread is
 * patchy (Andrew saw gaps go round as it rolled). The bottom of each tyre is clean: the tyre is built
 * from this sector straight down (+-62 degrees, a little overlap), copied three times round the axle.
 */
const SECTOR = (62 * Math.PI) / 180;

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

// --- find the wheels: a first guess (the tyre sticks out furthest at its axle's height and sits on
// the ground), then a circle fitted to the clean bottom of the tread ---
const allPoints = [];
for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute("POSITION"), p = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, p);
    allPoints.push(p[0], p[1], p[2]);
  }
}
function guessWheel(sign) {
  let best = { h: 0, out: 0 };
  for (let h = 0.25; h <= 0.55; h += 0.005) {
    let out = 0;
    for (let i = 0; i < allPoints.length; i += 3) if (Math.abs(allPoints[i]) < 0.05 && Math.abs(allPoints[i + 1] - h) < 0.006) out = Math.max(out, allPoints[i + 2] * sign);
    if (out > best.out) best = { h, out };
  }
  return { y: best.h, z: sign * (best.out - best.h), r: best.h };
}
/** Least-squares circle through the outermost tread points (centre line) in the bottom sector. */
function fitWheel(ax) {
  for (let pass = 0; pass < 3; pass++) {
    const bins = new Map();
    for (let i = 0; i < allPoints.length; i += 3) {
      const x = allPoints[i], y = allPoints[i + 1], z = allPoints[i + 2];
      if (Math.abs(x) > 0.02) continue;
      const r = Math.hypot(y - ax.y, z - ax.z), th = Math.atan2(y - ax.y, z - ax.z);
      if (r < ax.r * 0.8 || r > ax.r * 1.15 || Math.abs(th + Math.PI / 2) > SECTOR) continue;
      const b = Math.round(th * 90);
      if (!bins.has(b) || bins.get(b).r < r) bins.set(b, { y, z, r });
    }
    // Kasa fit: y^2 + z^2 + D y + E z + F = 0
    let Syy = 0, Szz = 0, Syz = 0, Sy = 0, Sz = 0, n = 0, Syq = 0, Szq = 0, Sq = 0;
    for (const { y, z } of bins.values()) {
      const q = y * y + z * z;
      Syy += y * y; Szz += z * z; Syz += y * z; Sy += y; Sz += z; n++; Syq += y * q; Szq += z * q; Sq += q;
    }
    const A = [[Syy, Syz, Sy], [Syz, Szz, Sz], [Sy, Sz, n]], B = [-Syq, -Szq, -Sq];
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const d = det(A), sol = [0, 1, 2].map((c) => det(A.map((row, i) => row.map((v, j) => (j === c ? B[i] : v)))) / d);
    const [D, E, F] = sol;
    ax = { y: -D / 2, z: -E / 2, r: Math.sqrt((D * D + E * E) / 4 - F) };
  }
  return ax;
}
const axles = { front: fitWheel(guessWheel(1)), rear: fitWheel(guessWheel(-1)) };

/** The tyre's cross-section from its clean bottom: how far out it reaches in each 5 mm slice across. */
for (const ax of Object.values(axles)) {
  ax.out = new Array(40).fill(0);
  for (let i = 0; i < allPoints.length; i += 3) {
    const x = Math.abs(allPoints[i]), y = allPoints[i + 1], z = allPoints[i + 2];
    const r = Math.hypot(y - ax.y, z - ax.z), th = Math.atan2(y - ax.y, z - ax.z);
    if (x >= 0.2 || r < ax.r * TYRE || r > ax.r * 1.15 || Math.abs(th + Math.PI / 2) > SECTOR * 0.8) continue;
    const b = Math.floor(x / 0.005);
    ax.out[b] = Math.max(ax.out[b], r);
  }
}
/** The chain's side of the rear wheel (+1 or -1): more bits beside the tyre near the sprocket there. */
const chain = (() => {
  const ax = axles.rear;
  let side = 0;
  for (let i = 0; i < allPoints.length; i += 3) {
    const x = allPoints[i], r = Math.hypot(allPoints[i + 1] - ax.y, allPoints[i + 2] - ax.z);
    if (Math.abs(x) > 0.12 && Math.abs(x) < 0.2 && r > 0.1 && r < ax.r * 0.6) side += Math.sign(x);
  }
  return Math.sign(side) || 1;
})();
for (const [name, ax] of Object.entries(axles)) console.log(`${name} wheel: radius ${ax.r.toFixed(3)} m, axle y ${ax.y.toFixed(3)} z ${ax.z.toFixed(3)}`);
console.log(`chain on the ${chain > 0 ? "+x" : "-x"} side`);

const halfWidth = (name, x) => (name === "rear" && Math.sign(x) === chain ? CUT.rear.chainSide : CUT[name].tyre);
const outAt = (ax, x) => ax.out[Math.min(39, Math.floor(Math.abs(x) / 0.005))] || 0;

/**
 * Where a triangle (by its centre) goes: "hub"/"rim" (part of that wheel, all the way round),
 * "sector" (the clean bottom of the tyre, copied round), "drop" (the rest of the tyre: rebuilt from the
 * copies) or null (the body).
 */
function classify(cx, cy, cz) {
  for (const [name, ax] of Object.entries(axles)) {
    const r = Math.hypot(cy - ax.y, cz - ax.z);
    if (r > ax.r * 1.1) continue;
    if (r < ax.r * RIM) return Math.abs(cx) < CUT[name].hub ? { name, ring: "hub" } : null;
    if (Math.abs(cx) >= halfWidth(name, cx)) continue;
    if (r < ax.r * TYRE) return { name, ring: "rim" };
    const out = outAt(ax, cx);
    // Beyond the tyre: a mudguard, the fork, the hugger (all 8%+ out). Up to 6% out is where the generated
    // tyre bulged into its mudguard: cleared, so nothing static pokes out past the rolling tyre.
    if (!out || r > Math.max(out + 0.01, ax.r * 1.06)) continue;
    const th = Math.atan2(cy - ax.y, cz - ax.z);
    return { name, ring: Math.abs(th + Math.PI / 2) <= SECTOR ? "sector" : "drop" };
  }
  return null;
}

/** A new primitive from some of `prim`'s triangles; wheel parts are moved to their axle and turned by `turn` (radians about x). */
function subset(prim, tris, ax, turn = 0) {
  const remap = new Map();
  const newIdx = new Uint32Array(tris.length);
  tris.forEach((v, i) => {
    if (!remap.has(v)) remap.set(v, remap.size);
    newIdx[i] = remap.get(v);
  });
  const out = doc.createPrimitive().setMaterial(prim.getMaterial()).setIndices(doc.createAccessor().setType("SCALAR").setArray(newIdx));
  const c = Math.cos(turn), s = Math.sin(turn);
  for (const sem of prim.listSemantics()) {
    const src = prim.getAttribute(sem), size = src.getElementSize(), arr = src.getArray();
    const dst = new Float32Array(remap.size * size);
    for (const [from, to] of remap) for (let e = 0; e < size; e++) dst[to * size + e] = arr[from * size + e];
    if (ax && (sem === "POSITION" || sem === "NORMAL")) {
      for (let i = 0; i < remap.size; i++) {
        let y = dst[i * 3 + 1], z = dst[i * 3 + 2];
        if (sem === "POSITION") { y -= ax.y; z -= ax.z; }
        dst[i * 3 + 1] = y * c - z * s;
        dst[i * 3 + 2] = y * s + z * c;
      }
    }
    out.setAttribute(sem, doc.createAccessor().setType(src.getType()).setArray(arr.constructor === Float32Array ? dst : new arr.constructor(dst)).setNormalized(src.getNormalized()));
  }
  return out;
}

// --- split every primitive into the body and the two wheels ---
const parts = { body: [], front: [], rear: [] };
const dropped = { front: 0, rear: 0 };
for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute("POSITION");
  const idx = prim.getIndices()?.getArray() ?? Array.from({ length: pos.getCount() }, (_, i) => i);
  const P = pos.getArray();
  const groups = { body: [], front: [], rear: [], frontSector: [], rearSector: [] };
  for (let t = 0; t < idx.length; t += 3) {
    const [i0, i1, i2] = [idx[t], idx[t + 1], idx[t + 2]];
    const cx = (P[i0 * 3] + P[i1 * 3] + P[i2 * 3]) / 3, cy = (P[i0 * 3 + 1] + P[i1 * 3 + 1] + P[i2 * 3 + 1]) / 3, cz = (P[i0 * 3 + 2] + P[i1 * 3 + 2] + P[i2 * 3 + 2]) / 3;
    const k = classify(cx, cy, cz);
    if (!k) groups.body.push(i0, i1, i2);
    else if (k.ring === "drop") dropped[k.name]++;
    else groups[k.ring === "sector" ? `${k.name}Sector` : k.name].push(i0, i1, i2);
  }
  if (groups.body.length) parts.body.push(subset(prim, groups.body, null));
  for (const name of ["front", "rear"]) {
    const ax = axles[name];
    if (groups[name].length) parts[name].push(subset(prim, groups[name], ax));
    if (groups[`${name}Sector`].length) for (const turn of [0, (2 * Math.PI) / 3, (-2 * Math.PI) / 3]) parts[name].push(subset(prim, groups[`${name}Sector`], ax, turn));
  }
}
console.log(`old tyre triangles replaced by the copies: front ${dropped.front}, rear ${dropped.rear}`);
for (const name of ["front", "rear"]) parts[name] = [joinPrimitives(parts[name])];

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
  const b = getBounds(n);
  console.log(`${m.getName().padEnd(16)} ${m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0)} tris, ` +
    `${(b.max[0] - b.min[0]).toFixed(2)} w x ${(b.max[1] - b.min[1]).toFixed(2)} h x ${(b.max[2] - b.min[2]).toFixed(2)} l m`);
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
