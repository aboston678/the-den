import { CLEARING, DRIVEWAY, DRIVEWAY_WIDTH, HOUSE_FOOTPRINT, heightAt, houseCutRects, isOnDock, lawnMask, noise2, streamCenter, surfaceAt } from "@den/shared";
import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, Matrix4 } from "three";
import { useQuality } from "../../quality.ts";
import { grassMaterial } from "./Grass.tsx";
import { InstancedLod, type LodLevel } from "./InstancedLod.tsx";
import type { Placement } from "./scatter.ts";

// Wildflowers for the cartoon art style (polish, like the driveway concept picture): little clumps
// of daisies, buttercups and purple lupines round the lawn's edges, along the driveway and on the
// stream banks, and a planted bed in front of the hedge along the house. They sway with the grass.

type Kind = "daisy" | "buttercup" | "lupine";
const STEM = new Color("#4f9a30");
const LOOK: Record<Kind, { petal: Color; centre: Color; size: number; height: number; heads: number }> = {
  daisy: { petal: new Color("#fbfaf2"), centre: new Color("#f3c22b"), size: 0.12, height: 0.4, heads: 6 },
  buttercup: { petal: new Color("#ffd632"), centre: new Color("#f0a51c"), size: 0.09, height: 0.32, heads: 7 },
  lupine: { petal: new Color("#9a6ad8"), centre: new Color("#c7a3f2"), size: 0.085, height: 0.7, heads: 4 },
};

/** A clump: a few stems, each topped by a flat little flower (a lupine is a stack of small ones). */
function clumpGeometry(kind: Kind) {
  const { petal, centre, size, height, heads } = LOOK[kind];
  const pos: number[] = [], col: number[] = [];
  const tri = (a: number[], b: number[], c: number[], ca: Color, cb: Color, cc: Color) => {
    pos.push(...a, ...b, ...c);
    col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  };
  for (let h = 0; h < heads; h++) {
    const a = h * 2.39996, r = 0.04 + 0.13 * ((h * 3) % heads) / heads;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, top = height * (0.75 + 0.35 * ((h * 7) % heads) / heads);
    // Stem: a thin upright blade.
    const w = 0.008, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    tri([x - px, 0, z - pz], [x + px, 0, z + pz], [x, top, z], STEM, STEM, STEM);
    const flower = (fy: number, s: number) => {
      // Six petals round a centre, facing up and a little outward.
      const tilt = 0.35;
      for (let k = 0; k < 6; k++) {
        const b0 = (k / 6) * Math.PI * 2, b1 = ((k + 1) / 6) * Math.PI * 2;
        const p0 = [x + Math.cos(b0) * s, fy + Math.cos(b0 - a) * s * tilt, z + Math.sin(b0) * s];
        const p1 = [x + Math.cos(b1) * s, fy + Math.cos(b1 - a) * s * tilt, z + Math.sin(b1) * s];
        tri([x, fy + 0.005, z], p0, p1, centre, petal, petal);
      }
    };
    if (kind === "lupine") for (let k = 0; k < 5; k++) flower(top - k * 0.07, size * (1 - k * 0.12));
    else flower(top, size);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.computeBoundingSphere();
  return g;
}

/** Where each kind grows. Same every load. */
function placements(): Record<Kind, Placement[]> {
  const out: Record<Kind, Placement[]> = { daisy: [], buttercup: [], lupine: [] };
  const cuts = houseCutRects();
  const inHouse = (x: number, z: number) => cuts.some((c) => x > c.minX - 0.5 && x < c.maxX + 0.5 && z > c.minZ - 0.5 && z < c.maxZ + 0.5);
  let i = 0;
  const add = (x: number, z: number, kind?: Kind, big = 1) => {
    i++;
    const k: Kind = kind ?? (noise2(x, z, 0.08, 51) > 0.25 ? "lupine" : noise2(x, z, 0.11, 52) > 0 ? "daisy" : "buttercup");
    out[k].push({ x, y: heightAt(x, z) - 0.02, z, rot: (i * 2.39996) % 6.283, scale: (0.85 + 0.35 * Math.abs(noise2(x, z, 3, 53))) * big });
  };
  const STEP = 0.9;
  const jit = (x: number, z: number, seed: number) => noise2(x, z, 0.5, seed) * 0.45 * STEP;
  // Round the lawn where it meets the woods, and along the driveway's verges.
  for (let z = CLEARING.cz - CLEARING.rz - 6; z < CLEARING.cz + CLEARING.rz + 6; z += STEP) {
    for (let x = CLEARING.cx - CLEARING.rx - 6; x < CLEARING.cx + CLEARING.rx + 6; x += STEP) {
      const jx = x + jit(x, z, 54), jz = z + jit(x, z, 55);
      const lawn = lawnMask(jx, jz);
      if (lawn < 0.3 || lawn > 0.8 || inHouse(jx, jz)) continue;
      if (noise2(jx, jz, 0.15, 56) < 0.15 || noise2(jx, jz, 2.3, 57) < 0.2) continue;
      add(jx, jz);
    }
  }
  for (let t = 0; t < DRIVEWAY.length; t += STEP) {
    const p = DRIVEWAY.pointAt(t), q = DRIVEWAY.pointAt(Math.min(DRIVEWAY.length, t + 0.5));
    const len = Math.hypot(q.x - p.x, q.z - p.z) || 1, nx = -(q.z - p.z) / len, nz = (q.x - p.x) / len;
    for (const side of [-1, 1]) {
      const k = DRIVEWAY_WIDTH / 2 + 1.2 + 2.5 * Math.abs(noise2(t, side, 0.7, 58));
      if (noise2(t, side * 3, 0.12, 59) < 0.05) continue;
      const x = p.x + nx * side * k, z = p.z + nz * side * k;
      if (!inHouse(x, z) && Math.abs(x) < 150 && Math.abs(z) < 150) add(x, z);
    }
  }
  // Stream banks, above the mud.
  for (let z = -75; z < 75; z += STEP) {
    for (const side of [-1, 1]) {
      const d = 14 + 5 * Math.abs(noise2(z, side, 0.6, 60));
      if (noise2(z, side * 5, 0.1, 61) < 0.1) continue;
      const x = streamCenter(z) + side * d;
      const sf = surfaceAt(x, z);
      if (sf.mud < 0.35 && sf.bed < 0.05 && !isOnDock(x, z)) add(x, z);
    }
  }
  // The bed in front of the hedge along the house and porch: a planted mix, thick.
  const house = HOUSE_FOOTPRINT.find((r) => r.name === "house")!, porch = HOUSE_FOOTPRINT.find((r) => r.name === "porch")!;
  const steps = (porch.minX + porch.maxX) / 2;
  for (const [x0, x1, zFront] of [[house.minX + 0.8, porch.minX - 0.6, house.minZ], [porch.minX + 0.4, porch.maxX - 0.4, porch.minZ]] as const) {
    for (let x = x0; x < x1; x += 0.45) {
      if (zFront === porch.minZ && Math.abs(x - steps) < 1.9) continue; // keep the front steps clear
      for (const row of [1.9, 2.35, 2.8]) {
        const jx = x + jit(x, row, 62) * 0.5, jz = zFront - row + jit(row, x, 63) * 0.3;
        const k: Kind = (["lupine", "daisy", "buttercup", "daisy"] as const)[Math.floor(((x - x0) / 1.6 + (row > 2.2 ? 1 : 0) + (row > 2.6 ? 1 : 0)) % 4)]!;
        add(jx, jz, k, 1.35);
      }
    }
  }
  return out;
}

export function Flowers() {
  const q = useQuality();
  const items = useMemo(placements, []);
  const kinds = useMemo(() => {
    const material = grassMaterial();
    const far = q.tier === "low" ? 18 : q.tier === "medium" ? 30 : 42;
    return (Object.keys(items) as Kind[]).map((k) => ({
      k,
      levels: [{ maxDist: far, castShadow: false, parts: [{ geometry: clumpGeometry(k), material, matrix: new Matrix4() }] }] as LodLevel[],
    }));
  }, [items, q.tier]);
  return (
    <>
      {kinds.map(({ k, levels }) => <InstancedLod key={`${k}-${q.tier}`} name={`flowers-${k}`} items={items[k]} levels={levels} radius={0.4} />)}
    </>
  );
}
