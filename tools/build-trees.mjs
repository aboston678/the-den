// Bake the forest's tree kinds with EZ-Tree (MIT, GAME_SPEC §17) into one compressed GLB.
// Each kind gets three detail levels (lod0 near, lod1 middle, lod2 far) with matching shapes.
// Node names: "<kind>_lod<n>_bark" and "<kind>_lod<n>_leaves"; every tree stands on y = 0, 1 unit = 1 m.
//
// Usage: node --import ./tools/lib/register-asset-imports.mjs tools/build-trees.mjs
//   ->   client/public/models/trees.glb

import { readFileSync, statSync } from "node:fs";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import * as THREE from "three";

// EZ-Tree loads its textures in the browser; here we only need its geometry and the file paths.
THREE.TextureLoader.prototype.load = function (url) {
  const t = new THREE.Texture();
  t.userData.url = url;
  return t;
};
const { Tree } = await import("../node_modules/@dgreenheck/ez-tree/src/lib/index.js");

const OUT = "client/public/models/trees.glb";

/** The kinds of tree in the Maine woods (GAME_SPEC §4), as EZ-Tree presets plus tweaks. */
const KINDS = {
  // Eastern white pine: tall bare trunk, layered crown in the top half. The forest's main tree.
  whitepine_a: { preset: "Pine Large", height: 27, seed: 1201, tweak: (o) => {
    o.branch.start[1] = 0.56; o.branch.children[0] = 60; o.branch.gnarliness[1] = 0.14; o.branch.angle[1] = 98; o.branch.length[1] *= 0.9;
    o.leaves.size *= 1.6; o.leaves.tint = 0xc4d6bc;
  } },
  whitepine_b: { preset: "Pine Large", height: 23, seed: 877, tweak: (o) => {
    o.branch.start[1] = 0.5; o.branch.children[0] = 55; o.branch.gnarliness[1] = 0.2; o.branch.length[1] *= 0.8; o.branch.angle[1] = 96;
    o.leaves.size *= 1.6; o.leaves.tint = 0xbcd0b4;
  } },
  // Hemlock: dense dark cone with branches nearly to the ground.
  hemlock: { preset: "Pine Medium", height: 17, seed: 431, tweak: (o) => {
    o.branch.start[1] = 0.15; o.branch.angle[1] = 112; o.branch.length[1] *= 0.55; o.leaves.size *= 1.1; o.leaves.count = 30; o.leaves.tint = 0xa0b89c;
  } },
  // Red maple: rounded crown, smooth grey bark.
  maple: { preset: "Oak Medium", height: 17, seed: 2290, tweak: (o) => {
    o.bark.tint = 0xb4b0a6; o.branch.start[1] = 0.4; o.leaves.size *= 1.3; o.leaves.tint = 0xc4d4ac;
  } },
  // Red oak: broad and big-limbed.
  oak: { preset: "Oak Large", height: 20, seed: 5150, tweak: (o) => { o.leaves.size *= 1.2; o.leaves.tint = 0xbccca4; } },
  // Paper birch: white bark, light airy crown.
  birch: { preset: "Aspen Large", height: 15, seed: 3319, tweak: (o) => { o.bark.type = "birch"; o.leaves.size *= 1.3; o.leaves.tint = 0xa4c888; } },
  // Understory saplings.
  sapling_pine: { preset: "Pine Small", height: 4.5, seed: 61, budget: 0.4, tweak: (o) => { o.leaves.size *= 1.6; o.leaves.tint = 0xbcd0b4; } },
  sapling_leafy: { preset: "Aspen Small", height: 4, seed: 92, budget: 0.4, tweak: (o) => { o.bark.type = "oak"; o.bark.tint = 0xb4b0a6; o.leaves.size *= 1.5; o.leaves.count *= 2; o.leaves.tint = 0xb0cc94; } },
};

/** Most triangles one tree may have at each detail level (lod0 near, lod1 middle, lod2 far). */
const BUDGET = [8000, 3000, 800];

/** Fewer sides on branches, fewer (bigger) leaves the further away the tree is drawn. */
function applyLod(o, lod) {
  const b = o.branch;
  const cap = (obj, max) => { for (const k of Object.keys(obj)) obj[k] = Math.max(2, Math.min(obj[k], max[k] ?? max.rest)); };
  if (lod === 0) {
    cap(b.segments, { 0: 7, 1: 4, rest: 3 });
    cap(b.sections, { 0: 10, 1: 5, rest: 3 });
  } else if (lod === 1) {
    cap(b.segments, { 0: 5, rest: 3 });
    cap(b.sections, { 0: 6, 1: 3, rest: 2 });
    o.leaves.count = Math.max(2, Math.round(o.leaves.count * 0.4));
    o.leaves.size *= 1.5;
  } else {
    cap(b.segments, { 0: 4, rest: 3 });
    cap(b.sections, { 0: 4, rest: 2 });
    if (b.levels >= 2) {
      // Drop the finest twigs and hang their leaves on the branch above instead.
      o.leaves.count = Math.round(o.leaves.count * (b.children[b.levels - 1] || 1));
      b.levels -= 1;
    }
    o.leaves.count = Math.max(2, Math.round(o.leaves.count * 0.18));
    o.leaves.size *= 2.4;
  }
}

const tris = (mesh) => mesh.geometry.index.count / 3;

/** Thin out leaves (making each bigger so the crown stays as full), then branches, until under budget. */
function fitBudget(tree, budget) {
  const o = tree.options;
  for (let i = 0; i < 40 && tris(tree.branchesMesh) + tris(tree.leavesMesh) > budget; i++) {
    if (tris(tree.leavesMesh) >= tris(tree.branchesMesh) && o.leaves.count > 1) {
      o.leaves.count = Math.max(1, Math.floor(o.leaves.count * 0.8));
      o.leaves.size *= 1.1;
    } else {
      // Fewer branches at the finest level that has more than one, with more leaves on each.
      const level = [...Array(o.branch.levels).keys()].reverse().find((l) => o.branch.children[l] > 1) ?? 0;
      o.branch.children[level] = Math.max(1, Math.floor(o.branch.children[level] * 0.8));
      o.leaves.size *= 1.08;
    }
    tree.generate();
  }
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene("trees");
doc.getRoot().setDefaultScene(scene);

const textures = new Map();
async function texture(path, makeImage) {
  if (!textures.has(path)) {
    const image = makeImage ? await makeImage() : readFileSync(path);
    const mime = !makeImage && /\.jpe?g$/i.test(path) ? "image/jpeg" : "image/png";
    textures.set(path, doc.createTexture(path.split("/").pop()).setImage(image).setMimeType(mime));
  }
  return textures.get(path);
}

const materials = new Map();
async function barkMaterial(m, tint) {
  const key = `bark:${m.map.userData.url}:${tint}`;
  if (materials.has(key)) return materials.get(key);
  // glTF wants occlusion in R and roughness in G of one image.
  const ao = m.aoMap.userData.url, rough = m.roughnessMap.userData.url;
  const arm = await texture(`${ao}+${rough}`, async () => {
    const [a, r] = await Promise.all([ao, rough].map((p) => sharp(p).greyscale().resize(512, 512).raw().toBuffer()));
    const px = Buffer.alloc(512 * 512 * 3);
    for (let i = 0; i < 512 * 512; i++) { px[i * 3] = a[i]; px[i * 3 + 1] = r[i]; px[i * 3 + 2] = 0; }
    return sharp(px, { raw: { width: 512, height: 512, channels: 3 } }).png().toBuffer();
  });
  const c = new THREE.Color(tint);
  const mat = doc.createMaterial(`bark_${materials.size}`)
    .setBaseColorFactor([c.r, c.g, c.b, 1])
    .setBaseColorTexture(await texture(m.map.userData.url))
    .setNormalTexture(await texture(m.normalMap.userData.url))
    .setMetallicFactor(0).setRoughnessFactor(1)
    .setMetallicRoughnessTexture(arm)
    .setOcclusionTexture(arm);
  materials.set(key, mat);
  return mat;
}
async function leafMaterial(m, tint) {
  const key = `leaves:${m.map.userData.url}:${tint}`;
  if (materials.has(key)) return materials.get(key);
  const c = new THREE.Color(tint);
  const mat = doc.createMaterial(`leaves_${materials.size}`)
    .setBaseColorFactor([c.r, c.g, c.b, 1])
    .setBaseColorTexture(await texture(m.map.userData.url))
    .setAlphaMode("MASK").setAlphaCutoff(0.5).setDoubleSided(true)
    .setMetallicFactor(0).setRoughnessFactor(0.85);
  materials.set(key, mat);
  return mat;
}

function addMesh(name, geometry, material, scale, leaves) {
  const g = geometry.clone().scale(scale, scale, scale);
  if (leaves) {
    // Point leaf normals away from the crown's centre so the canopy shades like one soft mass.
    g.computeBoundingBox();
    const centre = g.boundingBox.getCenter(new THREE.Vector3());
    const pos = g.attributes.position, nrm = g.attributes.normal ?? new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).sub(centre);
      v.y = v.y * 0.5 + Math.abs(v.length()) * 0.35; // lean towards the sky
      v.normalize();
      nrm.setXYZ(i, v.x, v.y, v.z);
    }
    g.setAttribute("normal", nrm);
  }
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", acc("VEC3", new Float32Array(g.attributes.position.array)))
    .setAttribute("NORMAL", acc("VEC3", new Float32Array(g.attributes.normal.array)))
    .setAttribute("TEXCOORD_0", acc("VEC2", new Float32Array(g.attributes.uv.array)))
    .setIndices(acc("SCALAR", new Uint32Array(g.index.array)))
    .setMaterial(material);
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
  return g.index.count / 3;
}

const report = [];
for (const [kind, spec] of Object.entries(KINDS)) {
  let scale;
  const row = [];
  for (const lod of [0, 1, 2]) {
    const tree = new Tree();
    tree.loadPreset(spec.preset);
    tree.options.seed = spec.seed;
    spec.tweak(tree.options);
    applyLod(tree.options, lod);
    tree.generate();
    fitBudget(tree, BUDGET[lod] * (spec.budget ?? 1));
    if (lod === 0) {
      const box = new THREE.Box3().setFromObject(tree);
      scale = spec.height / box.max.y; // trees grow up from y = 0
    }
    const bark = await barkMaterial(tree.branchesMesh.material, tree.options.bark.tint);
    const leaves = await leafMaterial(tree.leavesMesh.material, tree.options.leaves.tint);
    const tb = addMesh(`${kind}_lod${lod}_bark`, tree.branchesMesh.geometry, bark, scale, false);
    const tl = addMesh(`${kind}_lod${lod}_leaves`, tree.leavesMesh.geometry, leaves, scale, true);
    row.push(`lod${lod} ${String(tb + tl).padStart(5)} (${tree.options.leaves.count} leaves/branch)`);
  }
  report.push(`${kind.padEnd(14)} ${spec.height} m   ${row.join("   ")} tris`);
}

await doc.transform(
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: "webp", quality: 85, resize: [512, 512] }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
await io.write(OUT, doc);
console.log(report.join("\n"));
console.log(`\nwrote ${OUT}: ${(statSync(OUT).size / 1e6).toFixed(2)} MB`);
