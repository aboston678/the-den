import { CLEARING, DRIVEWAY, DRIVEWAY_WIDTH, SCENERY, TRAIL, TRAIL_WIDTH, heightAt, houseCutRects, isOnDock, lawnMask, noise2, streamCenter, surfaceAt } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Matrix4, MeshStandardMaterial, ShaderChunk } from "three";
import { useQuality } from "../../quality.ts";
import { ignoreLampsAndFlashlights } from "../lighting.ts";
import { InstancedLod, type LodLevel } from "./InstancedLod.tsx";
import type { Placement } from "./scatter.ts";

// Grass blades for the cartoon art style (game/artStyle.ts): little clumps over the lawn, along
// the driveway's and the trail's edges and on the stream banks above the mud, swaying in the wind, drawn near the camera and dissolving into the painted
// ground further out (InstancedLod). The blades' normals point straight up, so the grass is lit as
// one soft carpet rather than thousands of flickering slivers.

const BASE = new Color("#5aa835"), TIP = new Color("#b8e46c");
const time = { value: 0 };

/** One clump: a dozen short tapered blades in a little circle, leaning outward, darker at the root. */
function clumpGeometry() {
  const pos: number[] = [], col: number[] = [], nrm: number[] = [];
  const BLADES = 12;
  for (let b = 0; b < BLADES; b++) {
    const a = b * 2.39996, spread = 0.05 + 0.17 * ((b * 5) % BLADES) / BLADES;
    const lean = 0.05 + 0.06 * ((b * 3) % 4) / 3;
    const h = 0.17 + 0.15 * ((b * 7) % BLADES) / BLADES, w = 0.03;
    const ox = Math.cos(a) * spread, oz = Math.sin(a) * spread;
    const tx = ox + Math.cos(a) * lean, tz = oz + Math.sin(a) * lean;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w; // across the blade
    const mx = ox + Math.cos(a) * lean * 0.45, mz = oz + Math.sin(a) * lean * 0.45;
    // Two triangles up to the middle, one to the tip.
    const v = [
      [ox - px, 0, oz - pz], [ox + px, 0, oz + pz], [mx + px * 0.7, h * 0.55, mz + pz * 0.7],
      [ox - px, 0, oz - pz], [mx + px * 0.7, h * 0.55, mz + pz * 0.7], [mx - px * 0.7, h * 0.55, mz - pz * 0.7],
      [mx - px * 0.7, h * 0.55, mz - pz * 0.7], [mx + px * 0.7, h * 0.55, mz + pz * 0.7], [tx, h, tz],
    ];
    for (const [x, y, z] of v) {
      pos.push(x!, y!, z!);
      nrm.push(0, 1, 0);
      const c = BASE.clone().lerp(TIP, y! / 0.32);
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.computeBoundingSphere();
  return g;
}

/** The grass's look and sway, shared with the wildflowers (Flowers.tsx). */
export function grassMaterial() {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: DoubleSide });
  ignoreLampsAndFlashlights(m);
  const before = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer);
    shader.uniforms.uTime = time;
    // Sway: the tips move most, in slow gusts that roll across the lawn.
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec2 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        float gust = sin(uTime * 1.7 + root.x * 0.35 + root.y * 0.2) * 0.6 + sin(uTime * 3.1 + root.x * 1.3) * 0.25;
        transformed.xz += vec2(0.09, 0.05) * gust * position.y * 2.0;`);
    // Lit on both sides by the same upward normal.
    // (The chunk is still an #include here, so swap in its text with that one line changed.)
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      ShaderChunk.normal_fragment_begin.replace("float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;", "float faceDirection = 1.0;"),
    );
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${key.call(m)}|grass`;
  return m;
}

/** Where grass grows: the lawn, and a strip along each side of the driveway. Same every load. */
function grassPlacements(): Placement[] {
  const out: Placement[] = [];
  const cuts = houseCutRects();
  const inHouse = (x: number, z: number) => cuts.some((c) => x > c.minX - 0.3 && x < c.maxX + 0.3 && z > c.minZ - 0.3 && z < c.maxZ + 0.3);
  const STEP = 0.42;
  const minX = Math.max(SCENERY.minX, Math.min(CLEARING.cx - CLEARING.rx - 4, ...DRIVEWAY.points.map((p) => p.x - 8)));
  const maxX = CLEARING.cx + CLEARING.rx + 4;
  const minZ = Math.max(SCENERY.minZ, Math.min(CLEARING.cz - CLEARING.rz - 4, ...DRIVEWAY.points.map((p) => p.z - 8)));
  const maxZ = CLEARING.cz + CLEARING.rz + 4;
  let i = 0;
  for (let z = minZ; z < maxZ; z += STEP) {
    for (let x = minX; x < maxX; x += STEP) {
      i++;
      const jx = x + noise2(x, z, 0.37, 21) * 0.5 * STEP, jz = z + noise2(x, z, 0.41, 22) * 0.5 * STEP; // noise2 is −1…1
      const lawn = lawnMask(jx, jz);
      const road = DRIVEWAY.closest(jx, jz, DRIVEWAY_WIDTH / 2 + 7);
      const verge = road && road.dist > DRIVEWAY_WIDTH / 2 + 0.4 ? 1 - (road.dist - DRIVEWAY_WIDTH / 2) / 7 : 0;
      if (road && road.dist < DRIVEWAY_WIDTH / 2 + 0.4) continue;
      // Thinner where the lawn fades into the woods, and in soft patches.
      const want = Math.max(lawn > 0.35 ? 1 : 0, verge) * (0.8 + 0.4 * noise2(jx, jz, 9, 23));
      if (want < 0.5 || inHouse(jx, jz)) continue;
      out.push({ x: jx, y: heightAt(jx, jz) - 0.02, z: jz, rot: (i * 2.39996) % 6.283, scale: 0.95 + 0.3 * noise2(jx, jz, 3, 24) });
    }
  }
  // The stream banks, above the mud (both sides, along the stretch by the house and dock).
  for (let z = -75; z < 75; z += STEP) {
    for (const side of [-1, 1]) {
      for (let d = 13.5; d < 22; d += STEP) {
        i++;
        const jx = streamCenter(z) + side * (d + noise2(d, z, 0.37, 25) * 0.5 * STEP), jz = z + noise2(d, z, 0.41, 26) * 0.5 * STEP;
        const sf = surfaceAt(jx, jz);
        if (sf.mud > 0.35 || sf.bed > 0.05 || lawnMask(jx, jz) > 0.35 || isOnDock(jx, jz)) continue;
        if (TRAIL.closest(jx, jz, TRAIL_WIDTH / 2 + 0.3)) continue;
        const want = (1 - (d - 13.5) / 8.5) * (0.85 + 0.4 * noise2(jx, jz, 9, 27));
        if (want < 0.4) continue;
        out.push({ x: jx, y: heightAt(jx, jz) - 0.02, z: jz, rot: (i * 2.39996) % 6.283, scale: 0.85 + 0.3 * noise2(jx, jz, 3, 28) });
      }
    }
  }
  // Both edges of the trail down to the dock.
  for (let t = 0; t < TRAIL.length; t += STEP) {
    const p = TRAIL.pointAt(t), q = TRAIL.pointAt(Math.min(TRAIL.length, t + 0.5));
    const len = Math.hypot(q.x - p.x, q.z - p.z) || 1, nx = -(q.z - p.z) / len, nz = (q.x - p.x) / len;
    for (const side of [-1, 1]) {
      for (let k = TRAIL_WIDTH / 2 + 0.35; k < TRAIL_WIDTH / 2 + 2.2; k += STEP) {
        i++;
        const x = p.x + nx * side * k + noise2(t, k, 0.4, 29) * 0.2, z = p.z + nz * side * k + noise2(t, k, 0.4, 30) * 0.2;
        if (lawnMask(x, z) > 0.35 || surfaceAt(x, z).bed > 0.05 || isOnDock(x, z)) continue;
        out.push({ x, y: heightAt(x, z) - 0.02, z, rot: (i * 2.39996) % 6.283, scale: 0.8 + 0.3 * noise2(x, z, 3, 31) });
      }
    }
  }
  return out;
}

export function Grass() {
  const q = useQuality();
  const items = useMemo(grassPlacements, []);
  const levels = useMemo<LodLevel[]>(() => [{
    maxDist: q.tier === "low" ? 16 : q.tier === "medium" ? 26 : 38,
    castShadow: false,
    parts: [{ geometry: clumpGeometry(), material: grassMaterial(), matrix: new Matrix4() }],
  }], [q.tier]);
  useFrame((_, dt) => {
    time.value += dt;
  });
  return <InstancedLod key={q.tier} name="grass" items={items} levels={levels} radius={0.5} />;
}
