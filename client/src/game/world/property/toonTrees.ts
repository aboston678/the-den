import {
  type Box3, BufferAttribute, type BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DoubleSide, IcosahedronGeometry, Matrix4,
  MeshStandardMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ignoreLampsAndFlashlights, ignorePointLights } from "../lighting.ts";
import type { LodPart } from "./InstancedLod.tsx";

// Cartoon-style trees and bushes (the art-style test, game/artStyle.ts), modelled on the concept
// pictures in assets/concepts/style/: maples, oaks and birches with full crowns of painted leaf
// clusters, layered pines with jagged drooping tiers, round leafy bushes. Built in code at the size
// of the real tree they stand in for, with the same detail levels (`<kind>_lod0_bark`, …), so the
// forest code draws them the same way.
//
// Each tree is two parts: "bark" (opaque: trunk, branches, pine tiers, and a dark inner core for
// each leafy crown, so you never see through it) and "leaves" (cut-out cards painted with a cluster
// of leaves, or for pines, sprays of needles hanging round each tier's rim). All of a crown's normals point out from the crown's middle, so light falls across it
// as one soft round shape, the way cartoon games light their trees.

type Shape = "pine" | "hemlock" | "maple" | "oak" | "birch";
const TREE_SHAPES: Record<string, Shape> = {
  whitepine_a: "pine", whitepine_b: "pine", hemlock: "hemlock", maple: "maple", oak: "oak", birch: "birch",
  sapling_pine: "pine", sapling_leafy: "maple",
};
const LEAF = { pine: "#2e7d3c", hemlock: "#2a6e40", maple: "#5cae34", oak: "#4c9c2e", birch: "#8cc840" };
const BUSH = "#4aa636";
const AUTUMN = "#e39a2c"; // a few warm leaf clusters on the birches, like the concepts

// --- materials ---

function leafTexture() {
  const size = 256, c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Leaves round a centre, the outer ones pointing outward: a soft rounded cluster with a leafy edge.
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * size * 0.36;
    const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d;
    const len = size * (0.1 + rand() * 0.05), wid = len * 0.55;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2 + (rand() - 0.5) * 0.9);
    const shade = Math.round(150 + rand() * 105);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.strokeStyle = `rgba(40,60,30,0.35)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.quadraticCurveTo(wid, -len * 0.2, 0, len * 0.6);
    ctx.quadraticCurveTo(-wid, -len * 0.2, 0, -len);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A spray of pine needles fanning out and down from the top middle: painted fringe for the pine tiers. */
function needleTexture() {
  const size = 256, c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.lineCap = "round";
  for (let i = 0; i < 140; i++) {
    const a = Math.PI / 2 + (rand() - 0.5) * 2.2; // mostly downward
    const x0 = size * (0.3 + rand() * 0.4), y0 = size * (0.05 + rand() * 0.35);
    const len = size * (0.25 + rand() * 0.35);
    const shade = Math.round(140 + rand() * 115);
    ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
    ctx.lineWidth = 3 + rand() * 4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + Math.cos(a) * len * 0.5, y0 + Math.sin(a) * len * 0.4, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
    ctx.stroke();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Cut-out cards lit by their crown's normals on both sides (no flipping for the back face). */
function cardMaterial(map: CanvasTexture) {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, map, alphaTest: 0.5, alphaToCoverage: true, side: DoubleSide });
  m.defines = { NO_SOFT_MAP: "" }; // keep the painted shapes crisp (artStyle.ts softens other textures)
  ignoreLampsAndFlashlights(m);
  const before = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace("float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;", "float faceDirection = 1.0;");
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${key.call(m)}|cards`;
  return m;
}

let mats: { wood: MeshStandardMaterial; leaves: MeshStandardMaterial; needles: MeshStandardMaterial } | null = null;
function materials() {
  if (mats) return mats;
  // Both sides: the pine tiers are open underneath (their inside faces away from the sun, so it's shaded).
  const wood = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: DoubleSide });
  ignorePointLights(wood);
  return (mats = { wood, leaves: cardMaterial(leafTexture()), needles: cardMaterial(needleTexture()) });
}

// --- helpers ---

/** A repeatable 0…1 number (the same bumps and colours every load). */
function hash(...n: number[]) {
  let s = 0;
  n.forEach((v, i) => (s += v * [127.1, 311.7, 74.7, 269.5, 183.3][i % 5]!));
  const x = Math.sin(s) * 43758.5453;
  return x - Math.floor(x);
}

function paint(g: BufferGeometry, colour: (p: Vector3, i: number) => Color) {
  const pos = g.attributes.position!, out = new Float32Array(pos.count * 3), p = new Vector3();
  for (let i = 0; i < pos.count; i++) colour(p.fromBufferAttribute(pos, i), i).toArray(out, i * 3);
  g.setAttribute("color", new BufferAttribute(out, 3));
  return g;
}

/** Same attributes on every piece (position, normal, uv, colour) and no index, so they merge. */
function tidy(g: BufferGeometry) {
  const flat = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(flat.attributes)) if (!["position", "normal", "uv", "color"].includes(name)) flat.deleteAttribute(name);
  return flat;
}
const merge = (parts: BufferGeometry[]) => mergeGeometries(parts.map(tidy))!;

/** Point every normal out from `centre` (mixed a little with its own), for one soft round shape. */
function roundNormals(g: BufferGeometry, centre: Vector3, own = 0.25) {
  const pos = g.attributes.position!, nrm = g.attributes.normal!, v = new Vector3(), n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(centre).normalize();
    n.fromBufferAttribute(nrm, i).multiplyScalar(own).add(v.multiplyScalar(1 - own)).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
}

/** A tapered cylinder from a to b. */
function limb(a: Vector3, b: Vector3, r0: number, r1: number, sides: number) {
  const len = a.distanceTo(b);
  const g = new CylinderGeometry(r1, r0, len, sides, 1).translate(0, len / 2, 0);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return g.applyQuaternion(q).translate(a.x, a.y, a.z);
}

function bark(g: BufferGeometry, birch: boolean) {
  const base = new Color(birch ? "#f2efe6" : "#6b4a2c"), dark = new Color(birch ? "#2e2a26" : "#4f341d");
  return paint(g, (p) => {
    if (birch) {
      // Black dashes on white bark, in bands up the trunk.
      const band = Math.floor(p.y * 2.2), side = Math.floor((Math.atan2(p.z, p.x) + Math.PI) * 1.3);
      return hash(band, side, 3) > 0.78 ? dark.clone() : base.clone();
    }
    return base.clone().lerp(dark, hash(Math.round(p.x * 9), Math.round(p.y * 9), Math.round(p.z * 9)) * 0.4);
  });
}

// --- leafy crowns (broadleaf trees and bushes) ---

interface Blob { c: Vector3; r: number }

/**
 * A crown: a dark opaque core per blob (fills the gaps) plus painted leaf cards scattered over each
 * blob's surface, facing outward with a random tilt and spin.
 */
function crown(blobs: Blob[], centre: Vector3, colour: Color, cardsPerBlob: number, coreDetail: number, autumn = 0) {
  const cores: BufferGeometry[] = [], cards: BufferGeometry[] = [];
  const warm = new Color(AUTUMN);
  blobs.forEach(({ c, r }, b) => {
    const core = new IcosahedronGeometry(r * 0.82, coreDetail).translate(c.x, c.y, c.z);
    roundNormals(core, centre);
    const coreCol = colour.clone().multiplyScalar(0.55);
    cores.push(paint(core, () => coreCol.clone()));
    for (let i = 0; i < cardsPerBlob; i++) {
      // Even spread over the sphere (golden-angle spiral), nudged so blobs don't look alike.
      const t = (i + 0.5) / cardsPerBlob, y = 1 - 2 * t, rr = Math.sqrt(1 - y * y), a = i * 2.39996 + b;
      const dir = new Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
      if (dir.y < -0.6 && hash(b, i, 1) > 0.4) continue; // fewer cards underneath, where nobody looks
      const size = r * (0.95 + 0.4 * hash(b, i, 2));
      const card = new PlaneGeometry(size, size);
      const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir.clone().add(new Vector3(hash(b, i, 3) - 0.5, hash(b, i, 4) - 0.5, hash(b, i, 5) - 0.5).multiplyScalar(0.9)).normalize());
      card.rotateZ(hash(b, i, 6) * Math.PI * 2).applyQuaternion(q);
      const at = dir.multiplyScalar(r * 0.8).add(c);
      card.translate(at.x, at.y, at.z);
      roundNormals(card, centre, 0.1);
      const tint = hash(b, i, 7) < autumn ? warm : colour;
      const k = 0.8 + 0.35 * hash(b, i, 8);
      cards.push(paint(card, (p) => tint.clone().multiplyScalar(k * (0.85 + 0.35 * Math.min(1, Math.max(0, (p.y - centre.y) / (r * 2) + 0.5))))));
    }
  });
  return { core: merge(cores), cards: cards.length ? merge(cards) : null };
}

/** Maples, oaks and birches: trunk, a few branches, and a crown of leafy blobs. */
function broadleaf(h: number, w: number, lod: number, shape: "maple" | "oak" | "birch") {
  const birch = shape === "birch";
  const crownR = Math.min(w / 2, h * (birch ? 0.24 : shape === "oak" ? 0.36 : 0.32));
  const crownH = h * (birch ? 0.5 : 0.48);
  const centre = new Vector3(0, h - crownH * 0.52, 0);
  const ring = [6, 4, 0][lod]!;
  const blobs: Blob[] = [{ c: centre.clone(), r: Math.min(crownR, crownH * 0.55) * (lod === 2 ? 1.1 : 0.7) }];
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + hash(i, h, 1) * 0.7;
    const out = crownR * (0.52 + 0.12 * hash(i, 2, h));
    blobs.push({
      c: new Vector3(Math.cos(a) * out, centre.y + (hash(i, 5, h) - 0.45) * crownH * 0.5, Math.sin(a) * out),
      r: Math.min(crownR, crownH * 0.6) * (0.46 + 0.12 * hash(i, 9, h)),
    });
  }
  if (lod < 2) blobs.push({ c: centre.clone().add(new Vector3(0, crownH * 0.3, 0)), r: Math.min(crownR, crownH) * 0.48 });
  if (birch) blobs.forEach((b) => b.c.set(b.c.x * 0.8, centre.y + (b.c.y - centre.y) * 1.25, b.c.z * 0.8));

  const trunkR = birch ? 0.1 + 0.008 * h : 0.14 + 0.016 * h;
  const wood: BufferGeometry[] = [limb(new Vector3(0, 0, 0), centre.clone(), trunkR, trunkR * 0.55, [9, 6, 5][lod]!)];
  if (lod === 0) {
    // Branches from the upper trunk out toward the outer blobs (seen through gaps in the leaves).
    blobs.slice(1, 5).forEach((b, i) => {
      const from = new Vector3(0, centre.y - crownH * (0.15 + 0.1 * (i % 2)), 0);
      wood.push(limb(from, b.c.clone().lerp(from, 0.25), trunkR * 0.45, trunkR * 0.2, 5));
    });
  }
  const leaf = new Color(LEAF[shape]);
  const { core, cards } = crown(blobs, centre, leaf, [16, 9, 0][lod]!, lod === 0 ? 1 : 0, birch ? 0.12 : 0);
  return { bark: merge([...wood.map((g) => bark(g, birch)), core]), leaves: cards };
}

// --- pines and hemlocks ---

/** A trunk under a stack of jagged, drooping tiers: darker underneath and inside, lighter at the tips. */
function conifer(h: number, w: number, lod: number, shape: "pine" | "hemlock") {
  const tiers = [8, 5, 1][lod]!, sides = [22, 12, 7][lod]!;
  const leaf = new Color(LEAF[shape]), under = leaf.clone().multiplyScalar(0.45);
  w = Math.min(w, h * 0.34);
  const start = h > 8 ? h * 0.2 : h * 0.1;
  const parts: BufferGeometry[] = [], fringe: BufferGeometry[] = [];
  for (let i = 0; i < tiers; i++) {
    const t = tiers === 1 ? 0 : i / (tiers - 1);
    const r = (w / 2) * (1 - 0.78 * t) * (tiers === 1 ? 0.8 : 1);
    const ch = tiers === 1 ? h - start : (h - start) * (0.3 - 0.12 * t);
    const y = tiers === 1 ? start : start + (h - start - ch) * Math.pow(t, 0.92);
    // Open underneath: from below you see the dark inside of each tier, not a flat green lid.
    const g = new ConeGeometry(r, ch, sides, 3, true).translate(0, y + ch / 2, 0);
    const pos = g.attributes.position!, v = new Vector3();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const rel = (v.y - y) / ch; // 0 at the rim … 1 at the tip
      const ang = Math.atan2(v.z, v.x), seg = Math.round(((ang + Math.PI) / (Math.PI * 2)) * sides);
      // A softly scalloped, drooping rim (the painted needle fringe hides the edge).
      const jag = rel < 0.02 ? 0.94 + 0.08 * Math.cos(ang * 7 + i) + 0.04 * hash(seg, i, 1) : 1 + (hash(seg, i, 2) - 0.5) * 0.05;
      const droop = rel < 0.02 ? ch * (0.1 + 0.08 * hash(seg, i, 3)) : 0;
      pos.setXYZ(k, v.x * jag, v.y - droop, v.z * jag);
    }
    g.computeVertexNormals();
    // Soften the shading round each tier: normals lean out from the tree's axis a little.
    roundNormals(g, new Vector3(0, y + ch * 0.2, 0), 0.55);
    const tip = leaf.clone().multiplyScalar(0.9 + 0.35 * t);
    parts.push(paint(g, (p) => {
      const rel = Math.min(1, Math.max(0, (p.y - y) / ch));
      const edge = Math.min(1, Math.hypot(p.x, p.z) / Math.max(r, 0.01));
      return under.clone().lerp(tip, 0.35 + 0.65 * Math.max(edge, rel * 0.6));
    }));
    // Needle sprays hanging round the rim, facing out and a little down.
    const n = lod === 0 ? Math.max(6, Math.round(sides * 0.8)) : lod === 1 ? 6 : 0;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + i * 0.7 + hash(k, i, 4) * 0.3;
      const out = new Vector3(Math.cos(a), -0.45, Math.sin(a)).normalize();
      const size = Math.max(r * 0.75, ch * 0.7);
      const card = new PlaneGeometry(size, size).translate(0, -size * 0.3, 0);
      card.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), out));
      const at = new Vector3(Math.cos(a) * r * 0.88, y + ch * 0.12, Math.sin(a) * r * 0.88);
      card.translate(at.x, at.y, at.z);
      roundNormals(card, new Vector3(0, y + ch * 0.2, 0), 0.1);
      const shade = tip.clone().multiplyScalar(0.8 + 0.3 * hash(k, i, 5));
      fringe.push(paint(card, (p) => shade.clone().multiplyScalar(0.8 + 0.25 * Math.min(1, Math.max(0, (p.y - y) / ch + 0.4)))));
    }
  }
  const trunkR = 0.12 + 0.014 * h;
  const trunk = bark(limb(new Vector3(0, 0, 0), new Vector3(0, start + h * 0.12, 0), trunkR, trunkR * 0.7, [8, 6, 5][lod]!), false);
  return { bark: merge([trunk, ...parts]), leaves: fringe.length ? merge(fringe) : null };
}

/** A round leafy bush sitting on the ground. */
function bush(h: number, w: number) {
  const r = Math.min(h, w / 2) * 0.6, centre = new Vector3(0, r * 0.75, 0);
  const blobs: Blob[] = [{ c: centre.clone(), r }];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + hash(i, w, 4);
    blobs.push({ c: new Vector3(Math.cos(a) * w * 0.24, r * 0.6, Math.sin(a) * w * 0.24), r: r * 0.7 });
  }
  return crown(blobs, centre, new Color(BUSH), 12, 1);
}

// --- the lookup the forest uses ---

const cache = new Map<string, LodPart[]>();
const IDENTITY = new Matrix4();

/**
 * The cartoon stand-in for a node of the forest model files, sized to the real one's bounding box
 * (`box`), or null when there's no stand-in (ferns, rocks, logs keep their models, restyled by the shaders).
 */
export function toonParts(name: string, box: Box3): LodPart[] | null {
  const hit = cache.get(name);
  if (hit) return hit;
  const size = box.getSize(new Vector3());
  const h = size.y, w = Math.max(size.x, size.z);
  const { wood, leaves, needles } = materials();
  let out: LodPart[] | null = null;

  const m = /^(.+)_lod(\d)_(bark|leaves)$/.exec(name);
  const shape = m ? TREE_SHAPES[m[1]!] : undefined;
  if (m && shape) {
    const lod = Number(m[2]);
    const g = shape === "pine" || shape === "hemlock" ? conifer(h, w, lod, shape) : broadleaf(h, w, lod, shape);
    const geometry = m[3] === "bark" ? g.bark : g.leaves;
    const cards = shape === "pine" || shape === "hemlock" ? needles : leaves;
    out = geometry ? [{ geometry, material: m[3] === "bark" ? wood : cards, matrix: IDENTITY }] : [];
  } else if (name.startsWith("shrub_")) {
    const g = bush(h, w);
    out = [{ geometry: g.core, material: wood, matrix: IDENTITY }, { geometry: g.cards!, material: leaves, matrix: IDENTITY }];
  }
  if (out) {
    for (const p of out) p.geometry.translate(0, box.min.y, 0);
    cache.set(name, out);
  }
  return out;
}

/**
 * Rocks and boulders in the cartoon style: smooth soft grey (a hint of the photo texture's light and
 * dark kept), with moss on the parts that face up. Changes the material in place (once).
 */
export function toonRock(m: MeshStandardMaterial) {
  if (m.userData.toonRock) return;
  m.userData.toonRock = true;
  m.normalScale.setScalar(0.3);
  const before = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      {
        float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 stone = vec3(0.30, 0.31, 0.33) * (0.8 + 0.6 * clamp(lum / 0.18, 0.0, 1.5));
        float up = inverseTransformDirection(normal, viewMatrix).y;
        float moss = smoothstep(0.6, 0.85, up);
        diffuseColor.rgb = mix(stone, vec3(0.16, 0.33, 0.07), moss);
      }`);
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${key.call(m)}|toonrock`;
}
