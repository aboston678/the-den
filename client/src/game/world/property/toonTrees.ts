import {
  type Box3, BufferAttribute, type BufferGeometry, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, Matrix4, MeshStandardMaterial, Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ignoreLampsAndFlashlights, ignorePointLights } from "../lighting.ts";
import type { LodPart } from "./InstancedLod.tsx";

// Cartoon-style trees and bushes for the art-style test (game/artStyle.ts): stacked chunky cones for
// pines and hemlocks, clumps of round blobs for maples, oaks and birches, and round bushes. Built in
// code at the size of the real tree they stand in for, with the same detail levels
// (`<kind>_lod0_bark`, `<kind>_lod1_leaves`, …), so the forest code draws them the same way.

const TREE_SHAPES: Record<string, "pine" | "hemlock" | "maple" | "oak" | "birch"> = {
  whitepine_a: "pine", whitepine_b: "pine", hemlock: "hemlock", maple: "maple", oak: "oak", birch: "birch",
  sapling_pine: "pine", sapling_leafy: "maple",
};
const LEAF_COLOURS = { pine: "#2f7a3a", hemlock: "#28663f", maple: "#5fae38", oak: "#4b9a32", birch: "#8fc44a" };
const BUSH_COLOUR = "#4f9e3a";

let mats: { wood: MeshStandardMaterial; leaves: MeshStandardMaterial } | null = null;
function materials() {
  if (mats) return mats;
  const wood = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const leaves = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  ignorePointLights(wood);
  ignoreLampsAndFlashlights(leaves);
  return (mats = { wood, leaves });
}

/** A repeatable 0…1 number from a position (bumps and colour changes that are the same every load). */
function hash(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function paint(g: BufferGeometry, colour: (p: Vector3) => Color) {
  const pos = g.attributes.position!, out = new Float32Array(pos.count * 3), p = new Vector3();
  for (let i = 0; i < pos.count; i++) colour(p.fromBufferAttribute(pos, i)).toArray(out, i * 3);
  g.setAttribute("color", new BufferAttribute(out, 3));
  return g;
}

/** Keep only what every piece has, so they merge into one mesh. */
function tidy(g: BufferGeometry) {
  const flat = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(flat.attributes)) if (!["position", "normal", "color"].includes(name)) flat.deleteAttribute(name);
  return flat;
}

function trunk(height: number, radius: number, sides: number, birch: boolean) {
  const g = new CylinderGeometry(radius * 0.6, radius, height, sides, 4).translate(0, height / 2, 0);
  const base = new Color(birch ? "#efece4" : "#6e4b2e"), dark = new Color(birch ? "#3a3530" : "#563820");
  return paint(g, (p) => {
    if (birch) return hash(Math.round(p.y * 3), Math.atan2(p.z, p.x) > 0 ? 1 : 0, 2) > 0.72 ? dark.clone() : base.clone();
    return base.clone().lerp(dark, hash(p.x, p.y, p.z) * 0.35);
  });
}

/** Pines and hemlocks: a short trunk under a stack of bumpy, slightly drooping cones. */
function conifer(h: number, w: number, lod: number, kind: "pine" | "hemlock"): { bark: BufferGeometry; leaves: BufferGeometry } {
  const tiers = [5, 3, 1][lod]!, sides = [10, 7, 6][lod]!;
  const leaf = new Color(LEAF_COLOURS[kind]);
  const parts: BufferGeometry[] = [];
  // Slimmer than the real tree's spread (a cartoon pine is a tall cone), branches start above head height.
  w = Math.min(w, h * 0.4);
  const start = h > 8 ? h * 0.26 : h * 0.12;
  for (let i = 0; i < tiers; i++) {
    const t = tiers === 1 ? 0 : i / (tiers - 1);
    const r = (w / 2) * (1 - 0.7 * t) * (tiers === 1 ? 0.85 : 1);
    const ch = tiers === 1 ? h - start : (h - start) * (0.42 - 0.12 * t);
    const y = tiers === 1 ? start : start + (h - start - ch) * t;
    const g = new ConeGeometry(r, ch, sides, 2).translate(0, y + ch / 2, 0);
    const pos = g.attributes.position!, v = new Vector3();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const rim = v.y < y + ch * 0.02; // bottom edge: bumpy, a little droopy
      const bump = 1 + (hash(v.x, i, v.z) - 0.5) * (rim ? 0.3 : 0.14);
      pos.setXYZ(k, v.x * bump, rim ? v.y - ch * 0.08 * hash(v.z, i, v.x) : v.y, v.z * bump);
    }
    g.computeVertexNormals();
    const shade = leaf.clone().multiplyScalar(0.82 + 0.3 * t);
    parts.push(tidy(paint(g, (p) => shade.clone().multiplyScalar(0.9 + 0.2 * ((p.y - y) / ch)))));
  }
  return { bark: tidy(trunk(start + h * 0.1, 0.12 + 0.014 * h, [7, 6, 5][lod]!, false)), leaves: mergeGeometries(parts)! };
}

/**
 * Round clumps of leaves. Every blob's normals lean out from the middle of the whole crown, so the
 * light falls across the crown as one soft shape (the classic stylized-tree look) instead of
 * every lump catching the light on its own.
 */
function blobs(centres: { c: Vector3; r: number }[], detail: number, colour: Color, crown: Vector3) {
  const parts = centres.map(({ c, r }, i) => {
    const g = new IcosahedronGeometry(r, detail);
    const pos = g.attributes.position!, nrm = g.attributes.normal!, v = new Vector3(), n = new Vector3();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const bump = 1 + (hash(Math.round(v.x * 50), Math.round(v.y * 50) + i, Math.round(v.z * 50)) - 0.5) * 0.16;
      v.multiplyScalar(bump).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
      n.fromBufferAttribute(nrm, k).multiplyScalar(0.35).add(v.clone().sub(crown).normalize().multiplyScalar(0.65)).normalize();
      nrm.setXYZ(k, n.x, n.y, n.z);
    }
    const shade = colour.clone().multiplyScalar(0.88 + 0.24 * hash(i, 3, 7));
    return tidy(paint(g, (p) => shade.clone().multiplyScalar(0.85 + 0.3 * Math.min(1, Math.max(0, (p.y - crown.y) / (r * 2) + 0.5)))));
  });
  return mergeGeometries(parts)!;
}

/** Maples, oaks and birches: a trunk with a crown of round blobs. */
function broadleaf(h: number, w: number, lod: number, kind: "maple" | "oak" | "birch") {
  const birch = kind === "birch";
  const crownR = Math.min(w / 2, h * (birch ? 0.22 : 0.3));
  const crownH = birch ? h * 0.48 : h * 0.5;
  const crown = new Vector3(0, h - crownH / 2, 0);
  const ring = [6, 4, 0][lod]!;
  const centres: { c: Vector3; r: number }[] = [{ c: crown.clone(), r: Math.min(crownR, crownH) * (lod === 2 ? 0.95 : 0.62) }];
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + hash(i, h, 1) * 0.6;
    const out = crownR * (0.5 + 0.1 * hash(i, 2, h));
    centres.push({
      c: new Vector3(Math.cos(a) * out, crown.y + (hash(i, 5, h) - 0.55) * crownH * 0.45, Math.sin(a) * out),
      r: Math.min(crownR, crownH) * (0.42 + 0.1 * hash(i, 9, h)),
    });
  }
  if (lod === 0) centres.push({ c: crown.clone().add(new Vector3(0, crownH * 0.32, 0)), r: Math.min(crownR, crownH) * 0.45 });
  if (birch) centres.forEach((b) => b.c.set(b.c.x * 0.85, crown.y + (b.c.y - crown.y) * 1.3, b.c.z * 0.85));
  const trunkTop = crown.y;
  return {
    bark: tidy(trunk(trunkTop, birch ? 0.1 + 0.008 * h : 0.14 + 0.016 * h, [7, 6, 5][lod]!, birch)),
    leaves: blobs(centres, lod === 0 ? 1 : 0, new Color(LEAF_COLOURS[kind]), crown),
  };
}

/** A round bush of three or four blobs sitting on the ground. */
function bush(h: number, w: number) {
  const r = Math.min(h, w / 2) * 0.62, crown = new Vector3(0, r * 0.8, 0);
  const centres = [{ c: crown.clone(), r }];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + hash(i, w, 4);
    centres.push({ c: new Vector3(Math.cos(a) * w * 0.25, r * 0.62, Math.sin(a) * w * 0.25), r: r * 0.72 });
  }
  return blobs(centres, 1, new Color(BUSH_COLOUR), crown);
}

const cache = new Map<string, LodPart[]>();
const IDENTITY = new Matrix4();

/**
 * The cartoon stand-in for a part of the forest model files, sized to the real one's bounding box
 * (`box`), or null when there's no stand-in (ferns, rocks, logs keep their models, restyled by the shaders).
 */
export function toonParts(name: string, box: Box3): LodPart[] | null {
  const hit = cache.get(name);
  if (hit) return hit;
  const size = box.getSize(new Vector3());
  const h = size.y, w = Math.max(size.x, size.z);
  const { wood, leaves } = materials();
  let out: LodPart[] | null = null;

  const m = /^(.+)_lod(\d)_(bark|leaves)$/.exec(name);
  const shape = m ? TREE_SHAPES[m[1]!] : undefined;
  if (m && shape) {
    const lod = Number(m[2]);
    const g = shape === "pine" || shape === "hemlock" ? conifer(h, w, lod, shape) : broadleaf(h, w, lod, shape);
    out = m[3] === "bark" ? [{ geometry: g.bark, material: wood, matrix: IDENTITY }] : [{ geometry: g.leaves, material: leaves, matrix: IDENTITY }];
  } else if (name.startsWith("shrub_")) {
    out = [{ geometry: bush(h, w), material: leaves, matrix: IDENTITY }];
  }
  if (out) {
    for (const p of out) p.geometry.translate(0, box.min.y, 0);
    cache.set(name, out);
  }
  return out;
}
