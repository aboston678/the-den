import { DRIVEWAY, DRIVEWAY_WIDTH, SPAWN_S, heightAt } from "@den/shared";
import { useGLTF } from "@react-three/drei";
import { type Box3, Color, type Group, Matrix4, type Mesh, type MeshStandardMaterial, Vector3 } from "three";
import { TOON } from "../../artStyle.ts";
import { ignoreLampsAndFlashlights, ignorePointLights } from "../lighting.ts";
import type { LodPart } from "./InstancedLod.tsx";
import type { Placement } from "./scatter.ts";
import { asset } from "../../../asset.ts";

// The cartoon scenery (art-style remake, 2026-10-13): Higgsfield image→3D models of a pine, birch,
// maple, leafy bush, fern and two mossy rocks (tools/build-toon-scenery.mjs, starting pictures in
// assets/concepts/scenery/), each 1 m tall in three detail levels. They stand in for the realistic
// forest's models, each copy stretched to the size of the tree, bush or rock it replaces, so the
// forest layout, detail levels, colliders and far-tree pictures all work as before.

export const TOON_SCENERY_URL = asset("/models/toon-scenery.glb");
if (TOON) useGLTF.preload(TOON_SCENERY_URL);

/** The cartoon scenery file in cartoon mode, else null. (TOON never changes while the page is open, so the hook order is stable.) */
export function useToonScenery(): Group | null {
  return TOON ? (useGLTF(TOON_SCENERY_URL).scene as Group) : null;
}

/** Which model stands in for each realistic tree kind; some get a colour tint so the forest isn't all one green. */
const TREES: Record<string, { piece: string; tint?: string }> = {
  whitepine_a: { piece: "pine" },
  whitepine_b: { piece: "pine", tint: "#e4f0d8" },
  hemlock: { piece: "pine", tint: "#b9cdb9" },
  sapling_pine: { piece: "pine" },
  maple: { piece: "maple" },
  oak: { piece: "maple", tint: "#cfdcb8" },
  sapling_leafy: { piece: "maple" },
  birch: { piece: "birch" },
};
const ROCKY = new Set(["boulder", "rock"]);

const prepared = new Map<string, MeshStandardMaterial>();
/** A piece's material, made ready once: painted texture kept crisp, no lamplight (and no flashlight on plants), optional tint. */
function material(src: MeshStandardMaterial, piece: string, tint?: string) {
  const key = `${src.uuid}|${tint ?? ""}`; // the far levels of every piece share one plain corner-colour material
  let m = prepared.get(key);
  if (m) return m;
  m = tint ? src.clone() : src;
  if (tint) m.color.multiply(new Color(tint));
  m.defines = { ...m.defines, NO_SOFT_MAP: "" };
  if (ROCKY.has(piece)) ignorePointLights(m);
  else ignoreLampsAndFlashlights(m);
  if (!ROCKY.has(piece)) glow(m);
  prepared.set(key, m);
  return m;
}

/**
 * Leaves give off a little of their own colour, so the woods' shade reads as soft colour (the way
 * cartoon films light foliage) instead of near-black under the canopy. Follows each copy's painted
 * texture or corner colours, so near and far detail levels match.
 */
function glow(m: MeshStandardMaterial) {
  const before = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.22 * daylightGlow;",
    );
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float daylightGlow;");
    shader.uniforms.daylightGlow = foliageGlow;
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${key.call(m)}|glow`;
}
/** 1 by day, fading to 0 at night (glowing trees in the dark would look odd); set each frame by the forest. */
export const foliageGlow = { value: 1 };

/** One detail level of a piece, scaled to (sx, sy, sz) and stood at `y`. */
function piecePart(scene: Group, piece: string, lod: number, s: Vector3, y: number, tint?: string): LodPart[] {
  const node = scene.getObjectByName(`${piece}_lod${lod}`);
  if (!node) throw new Error(`missing ${piece}_lod${lod} in ${TOON_SCENERY_URL}`);
  scene.updateMatrixWorld(true);
  const place = new Matrix4().makeTranslation(0, y, 0).multiply(new Matrix4().makeScale(s.x, s.y, s.z));
  const parts: LodPart[] = [];
  node.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) parts.push({ geometry: mesh.geometry, material: material(mesh.material as MeshStandardMaterial, piece, tint), matrix: place.clone().multiply(mesh.matrixWorld) });
  });
  return parts;
}

/** Width of a piece (its widest side; it's 1 m tall), measured in the file's own space. */
function widthOf(scene: Group, piece: string) {
  const node = scene.getObjectByName(`${piece}_lod0`)!;
  scene.updateMatrixWorld(true);
  let min = Infinity, max = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const v = new Vector3();
  node.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position!;
    for (let i = 0; i < pos.count; i += 7) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      min = Math.min(min, v.x);
      max = Math.max(max, v.x);
      minZ = Math.min(minZ, v.z);
      maxZ = Math.max(maxZ, v.z);
    }
  });
  return Math.max(max - min, maxZ - minZ);
}

/**
 * The cartoon stand-in for a node of the realistic forest's model files (`<kind>_lod<n>_bark` /
 * `_leaves`, `shrub_*`, `fern_*`, `rock_*`, `boulder`), sized to the real one's bounding box, or
 * null when there's none (logs and stumps keep their models with flat bark paint, Forest.tsx).
 */
export function toonParts(scene: Group, name: string, box: Box3): LodPart[] | null {
  const size = box.getSize(new Vector3());
  const h = size.y, w = Math.max(size.x, size.z), y = box.min.y;

  const tree = /^(.+)_lod(\d)_(bark|leaves)$/.exec(name);
  if (tree && TREES[tree[1]!]) {
    if (tree[3] === "leaves") return []; // one model holds trunk and leaves: it's all in "bark"
    const { piece, tint } = TREES[tree[1]!]!;
    // Cartoon trees are a bit shorter than the real forest's (more sky, slimmer trunks), pines most.
    const th = Math.min(h * (piece === "pine" ? 0.78 : 0.88), 20);
    // Keep the model's own shape: scale to that height, stretching sideways only a little toward the real spread.
    const across = th * Math.min(1.35, Math.max(0.75, w / th / widthOf(scene, piece)));
    return piecePart(scene, piece, Number(tree[2]), new Vector3(across, th, across), y, tint);
  }
  // Bushes, ferns and rocks: match the real one's footprint and height.
  const fit = (piece: string, lod: number) => {
    const across = w / widthOf(scene, piece);
    return piecePart(scene, piece, lod, new Vector3(across, h, across), y);
  };
  if (name.startsWith("shrub_")) return fit("bush", 0);
  if (name.startsWith("fern_")) return fit("fern", 1); // hundreds of ferns: the light level
  if (name === "boulder") return fit("boulder", 0);
  const rock = /^rock_(\d+)$/.exec(name);
  if (rock) return fit(Number(rock[1]) % 2 ? "boulder" : "rock", 0);
  return null;
}

/**
 * Leafy bushes along both edges of the driveway (cartoon style only, like the concept pictures):
 * every 5–9 m on each side, a little back from the road. Decoration only: you can walk through them.
 */
export function roadsideBushes(): Placement[] {
  const out: Placement[] = [];
  let seed = 4242;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const side of [-1, 1]) {
    for (let s = SPAWN_S + 6; s < DRIVEWAY.length - 8; s += 5 + r() * 4) {
      if (r() < 0.25) continue; // gaps
      const p = DRIVEWAY.pointAt(s), off = DRIVEWAY_WIDTH / 2 + 2.2 + r() * 2.5;
      const x = p.x + p.dz * off * side, z = p.z - p.dx * off * side;
      out.push({ x, y: heightAt(x, z) - 0.05, z, rot: r() * 6.28, scale: 0.8 + r() * 0.6 });
    }
  }
  return out;
}
