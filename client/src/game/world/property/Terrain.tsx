import { BOUNDARY_HALF, fbm, heightAt, lawnMask, surfaceAt } from "@den/shared";
import { HeightfieldCollider, RigidBody } from "@react-three/rapier";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import { TERRAIN_LAYERS, createTerrainMaterial } from "./terrainMaterial.ts";
import { buildLayerArrays, useLayerImages } from "./textures.ts";

/** The visible ground reaches past the walkable area so the map's edge is lost in the trees and fog. */
const VIEW_HALF = 170;
/** Collision ground: the walkable area plus a margin, 1 m grid (same samples as the visible ground). */
const PHYS_HALF = BOUNDARY_HALF + 6;

/** Heights on a 1 m grid from −half to +half, row by row (z outer, x inner). */
function heightGrid(half: number) {
  const n = half * 2 + 1;
  const h = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) h[iz * n + ix] = heightAt(ix - half, iz - half);
  return { n, h };
}

function buildGeometry() {
  const { n, h } = heightGrid(VIEW_HALF);
  const pos = new Float32Array(n * n * 3);
  const nrm = new Float32Array(n * n * 3);
  const splatA = new Float32Array(n * n * 4);
  const splatB = new Float32Array(n * n * 2);
  const at = (ix: number, iz: number) => h[Math.min(n - 1, Math.max(0, iz)) * n + Math.min(n - 1, Math.max(0, ix))]!;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const x = ix - VIEW_HALF, z = iz - VIEW_HALF, y = h[i]!;
      pos.set([x, y, z], i * 3);
      // Normal from the neighbouring heights.
      const dx = at(ix + 1, iz) - at(ix - 1, iz), dz = at(ix, iz + 1) - at(ix, iz - 1);
      const len = Math.hypot(dx, 2, dz);
      nrm.set([-dx / len, 2 / len, -dz / len], i * 3);
      // Texture weights; the forest floor shifts to the grassier "edge" texture near the lawn and in patches.
      const s = surfaceAt(x, z, y);
      const edge = Math.min(1, Math.max(0, lawnMask(x, z) * 4 + fbm(x, z, 30, 11) * 0.9 - 0.15));
      splatA.set([s.lawn, s.forest * (1 - edge), s.forest * edge, s.mud], i * 4);
      splatB.set([s.bed, 0.88 + 0.24 * fbm(x, z, 24, 3)], i * 2);
    }
  }
  const index = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < n - 1; iz++) {
    for (let ix = 0; ix < n - 1; ix++) {
      const a = iz * n + ix, b = a + 1, c = a + n, d = c + 1;
      index.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("normal", new BufferAttribute(nrm, 3));
  g.setAttribute("splatA", new BufferAttribute(splatA, 4));
  g.setAttribute("splatB", new BufferAttribute(splatB, 2));
  g.setIndex(new BufferAttribute(index, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Rapier heightfield over the walkable area. Rapier wants the heights column-major: one column per
 * x step, each running along z.
 */
function buildHeightfield() {
  const { n, h } = heightGrid(PHYS_HALF);
  const heights = new Float32Array(n * n);
  for (let ix = 0; ix < n; ix++) for (let iz = 0; iz < n; iz++) heights[ix * n + iz] = h[iz * n + ix]!;
  return { segments: n - 1, heights, size: PHYS_HALF * 2 };
}

export function Terrain() {
  const images = useLayerImages([...TERRAIN_LAYERS]);
  const geometry = useMemo(buildGeometry, []);
  const field = useMemo(buildHeightfield, []);
  const material = useMemo(() => {
    const arrays = buildLayerArrays(images);
    return createTerrainMaterial(arrays.colour, arrays.normal);
  }, [images]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <>
      <mesh geometry={geometry} material={material} receiveShadow name="terrain" />
      <RigidBody type="fixed" colliders={false}>
        <HeightfieldCollider args={[field.segments, field.segments, Array.from(field.heights), { x: field.size, y: 1, z: field.size }]} />
      </RigidBody>
    </>
  );
}
