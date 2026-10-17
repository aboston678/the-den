import { BOUNDS, SCENERY, fbm, heightAt, houseCutRects, lawnMask, surfaceAt } from "@den/shared";
import { HeightfieldCollider, RigidBody, TrimeshCollider } from "@react-three/rapier";
import { useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import { TERRAIN_LAYERS, createTerrainMaterial } from "./terrainMaterial.ts";
import { terrainLayerArrays, useLayerImages } from "./textures.ts";

/** The visible ground reaches past the walkable area so the map's edge is lost in the trees and fog. */
const VIEW = SCENERY;
/** Collision ground (a square round the origin, as Rapier's heightfield needs): the walkable area plus a margin. */
const PHYS_HALF = Math.max(-BOUNDS.minX, BOUNDS.maxX, -BOUNDS.minZ, BOUNDS.maxZ) + 6;

/** Heights on a 1 m grid over a rectangle, row by row (z outer, x inner). */
function heightGrid(r: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const nx = r.maxX - r.minX + 1, nz = r.maxZ - r.minZ + 1;
  const h = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) h[iz * nx + ix] = heightAt(r.minX + ix, r.minZ + iz);
  return { nx, nz, h };
}

type WRect = { minX: number; maxX: number; minZ: number; maxZ: number };

/** A cell minus the house's footprint, as axis-aligned pieces (all of it when it doesn't touch the house). */
function cellPieces(x0: number, z0: number, cuts: WRect[]): WRect[] {
  let pieces: WRect[] = [{ minX: x0, maxX: x0 + 1, minZ: z0, maxZ: z0 + 1 }];
  for (const c of cuts) {
    pieces = pieces.flatMap((p) => {
      const i = { minX: Math.max(p.minX, c.minX), maxX: Math.min(p.maxX, c.maxX), minZ: Math.max(p.minZ, c.minZ), maxZ: Math.min(p.maxZ, c.maxZ) };
      if (i.maxX - i.minX < 1e-6 || i.maxZ - i.minZ < 1e-6) return [p];
      const out: WRect[] = [];
      if (i.minZ > p.minZ) out.push({ ...p, maxZ: i.minZ });
      if (i.maxZ < p.maxZ) out.push({ ...p, minZ: i.maxZ });
      if (i.minX > p.minX) out.push({ minX: p.minX, maxX: i.minX, minZ: i.minZ, maxZ: i.maxZ });
      if (i.maxX < p.maxX) out.push({ minX: i.maxX, maxX: p.maxX, minZ: i.minZ, maxZ: i.maxZ });
      return out;
    });
  }
  return pieces;
}

const CUTS = houseCutRects();
/** The area round the house where the ground needs exact edges (precise collision mesh). */
const HOUSE_AREA = {
  minX: Math.floor(Math.min(...CUTS.map((c) => c.minX))) - 3, maxX: Math.ceil(Math.max(...CUTS.map((c) => c.maxX))) + 3,
  minZ: Math.floor(Math.min(...CUTS.map((c) => c.minZ))) - 3, maxZ: Math.ceil(Math.max(...CUTS.map((c) => c.maxZ))) + 3,
};
const touches = (x0: number, z0: number) => CUTS.some((c) => c.maxX > x0 && c.minX < x0 + 1 && c.maxZ > z0 && c.minZ < z0 + 1);

function buildGeometry() {
  const { nx: n, nz, h } = heightGrid(VIEW);
  const pos: number[] = [], nrm: number[] = [], splatA: number[] = [], splatB: number[] = [], index: number[] = [];
  const at = (ix: number, iz: number) => h[Math.min(nz - 1, Math.max(0, iz)) * n + Math.min(n - 1, Math.max(0, ix))]!;
  /** Add a vertex; grid points take their slope from the grid, extra points (round the house) work it out. */
  const vertex = (x: number, z: number, y = heightAt(x, z), grid?: [number, number]) => {
    const dx = grid ? at(grid[0] + 1, grid[1]) - at(grid[0] - 1, grid[1]) : heightAt(x + 1, z) - heightAt(x - 1, z);
    const dz = grid ? at(grid[0], grid[1] + 1) - at(grid[0], grid[1] - 1) : heightAt(x, z + 1) - heightAt(x, z - 1);
    const len = Math.hypot(dx, 2, dz);
    pos.push(x, y, z);
    nrm.push(-dx / len, 2 / len, -dz / len);
    // Texture weights; the forest floor shifts to the grassier "edge" texture near the lawn and in patches.
    const s = surfaceAt(x, z, y);
    const edge = Math.min(1, Math.max(0, lawnMask(x, z) * 4 + fbm(x, z, 30, 11) * 0.9 - 0.15));
    splatA.push(s.lawn, s.forest * (1 - edge), s.forest * edge, s.mud);
    splatB.push(s.bed, 0.88 + 0.24 * fbm(x, z, 24, 3));
    return pos.length / 3 - 1;
  };
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < n; ix++) vertex(VIEW.minX + ix, VIEW.minZ + iz, h[iz * n + ix]!, [ix, iz]);
  const quadIdx = (a: number, b: number, c: number, d: number) => index.push(a, c, b, b, c, d); // a b on the near row, c d on the next
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < n - 1; ix++) {
      const x0 = VIEW.minX + ix, z0 = VIEW.minZ + iz;
      if (!touches(x0, z0)) {
        const a = iz * n + ix;
        quadIdx(a, a + 1, a + n, a + n + 1);
        continue;
      }
      // Next to the house: only the parts of the cell outside its walls.
      for (const p of cellPieces(x0, z0, CUTS)) {
        quadIdx(vertex(p.minX, p.minZ), vertex(p.maxX, p.minZ), vertex(p.minX, p.maxZ), vertex(p.maxX, p.maxZ));
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute("splatA", new BufferAttribute(new Float32Array(splatA), 4));
  g.setAttribute("splatB", new BufferAttribute(new Float32Array(splatB), 2));
  g.setIndex(new BufferAttribute(new Uint32Array(index), 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Rapier heightfield over the walkable area. Rapier wants the heights column-major: one column per
 * x step, each running along z. Round the house it's dropped out of the way, and a precise mesh
 * (with the house cut out) takes over there.
 */
function buildHeightfield() {
  const { nx: n, h } = heightGrid({ minX: -PHYS_HALF, maxX: PHYS_HALF, minZ: -PHYS_HALF, maxZ: PHYS_HALF });
  const heights = new Float32Array(n * n);
  for (let ix = 0; ix < n; ix++) {
    for (let iz = 0; iz < n; iz++) {
      const x = ix - PHYS_HALF, z = iz - PHYS_HALF;
      const inHouseArea = x > HOUSE_AREA.minX && x < HOUSE_AREA.maxX && z > HOUSE_AREA.minZ && z < HOUSE_AREA.maxZ;
      heights[ix * n + iz] = inHouseArea ? -20 : h[iz * n + ix]!;
    }
  }
  return { segments: n - 1, heights, size: PHYS_HALF * 2 };
}

/** Collision mesh for the ground round the house, with the house's footprint left open. */
function buildHousePatch() {
  const verts: number[] = [], idx: number[] = [];
  const v = (x: number, z: number) => (verts.push(x, heightAt(x, z), z), verts.length / 3 - 1);
  for (let z0 = HOUSE_AREA.minZ; z0 < HOUSE_AREA.maxZ; z0++) {
    for (let x0 = HOUSE_AREA.minX; x0 < HOUSE_AREA.maxX; x0++) {
      for (const p of cellPieces(x0, z0, CUTS)) {
        const a = v(p.minX, p.minZ), b = v(p.maxX, p.minZ), c = v(p.minX, p.maxZ), d = v(p.maxX, p.maxZ);
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  return { verts: new Float32Array(verts), idx: new Uint32Array(idx) };
}

/** Run a builder once and keep the result (React may re-render this many times while assets load). */
const once = <T,>(build: () => T) => {
  let value: T | undefined;
  return () => (value ??= build());
};
const terrainGeometry = once(buildGeometry);
const heightfield = once(buildHeightfield);
const housePatch = once(buildHousePatch);

export function Terrain() {
  const images = useLayerImages([...TERRAIN_LAYERS]);
  const geometry = useMemo(terrainGeometry, []);
  const field = useMemo(heightfield, []);
  const patch = useMemo(housePatch, []);
  const material = useMemo(() => {
    const arrays = terrainLayerArrays(images);
    return createTerrainMaterial(arrays.colour, arrays.normal);
  }, [images]);

  return (
    <>
      <mesh geometry={geometry} material={material} receiveShadow name="terrain" />
      <RigidBody type="fixed" colliders={false}>
        <HeightfieldCollider args={[field.segments, field.segments, Array.from(field.heights), { x: field.size, y: 1, z: field.size }]} />
        <TrimeshCollider args={[patch.verts, patch.idx]} />
      </RigidBody>
    </>
  );
}
