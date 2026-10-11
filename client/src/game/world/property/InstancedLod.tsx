import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  type BufferGeometry, Euler, Frustum, InstancedMesh, type Material, Matrix4, Quaternion, Sphere, Vector3,
} from "three";
import type { Placement } from "./scatter.ts";

// Draws many copies of a model cheaply (GAME_SPEC §17): one instanced draw per part per detail
// level. A few times a second it re-sorts the copies by distance from the camera into detail
// levels, and drops ones that are off-screen or further than the last level reaches.

export interface LodPart {
  geometry: BufferGeometry;
  material: Material;
  /** The part's own transform inside its model file. */
  matrix: Matrix4;
}
export interface LodLevel {
  maxDist: number;
  parts: LodPart[];
  castShadow?: boolean;
}

const KEEP_FOR_SHADOWS = 30; // copies this close stay even when off-screen, so their shadows still fall into view
const REFRESH_S = 0.25;

const tmp = { m: new Matrix4(), q: new Quaternion(), e: new Euler(), s: new Vector3(), p: new Vector3(), sphere: new Sphere(), frustum: new Frustum(), pv: new Matrix4() };

export function InstancedLod({ items, levels, radius, name }: { items: Placement[]; levels: LodLevel[]; radius: number; name: string }) {
  const camera = useThree((s) => s.camera);

  // World matrix of every copy, computed once.
  const base = useMemo(() => {
    const out = new Float32Array(items.length * 16);
    items.forEach((it, i) => {
      tmp.e.set(it.tilt ?? 0, it.rot, 0, "YXZ");
      tmp.q.setFromEuler(tmp.e);
      tmp.m.compose(tmp.p.set(it.x, it.y, it.z), tmp.q, tmp.s.setScalar(it.scale)).toArray(out, i * 16);
    });
    return out;
  }, [items]);

  const meshes = useMemo(() => levels.map((level) => level.parts.map((part) => {
    const mesh = new InstancedMesh(part.geometry, part.material, Math.max(1, items.length));
    mesh.count = 0;
    mesh.frustumCulled = false; // we cull per copy ourselves
    mesh.castShadow = !!level.castShadow;
    mesh.receiveShadow = true;
    mesh.name = name;
    return mesh;
  })), [levels, items, name]);
  useEffect(() => () => meshes.flat().forEach((m) => m.dispose()), [meshes]);

  const state = useMemo(() => ({ timer: REFRESH_S, lastPos: new Vector3(1e9, 0, 0), lastQuat: new Quaternion() }), []);

  useFrame((_, dt) => {
    state.timer += dt;
    const moved = camera.position.distanceToSquared(state.lastPos) > 1.5 * 1.5 || Math.abs(camera.quaternion.dot(state.lastQuat)) < 0.9995;
    if (!moved && state.timer < REFRESH_S) return;
    state.timer = 0;
    state.lastPos.copy(camera.position);
    state.lastQuat.copy(camera.quaternion);

    tmp.frustum.setFromProjectionMatrix(tmp.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const counts = levels.map(() => 0);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      const d = Math.hypot(it.x - cx, it.y - cy, it.z - cz);
      let lod = 0;
      while (lod < levels.length && d > levels[lod]!.maxDist) lod++;
      if (lod === levels.length) continue;
      if (d > KEEP_FOR_SHADOWS) {
        tmp.sphere.center.set(it.x, it.y + radius * it.scale * 0.5, it.z);
        tmp.sphere.radius = radius * it.scale;
        if (!tmp.frustum.intersectsSphere(tmp.sphere)) continue;
      }
      const slot = counts[lod]!++;
      tmp.m.fromArray(base, i * 16);
      levels[lod]!.parts.forEach((part, p) => {
        tmp.pv.multiplyMatrices(tmp.m, part.matrix).toArray(meshes[lod]![p]!.instanceMatrix.array, slot * 16);
      });
    }
    meshes.forEach((parts, lod) => parts.forEach((m) => {
      m.count = counts[lod]!;
      m.instanceMatrix.needsUpdate = true;
    }));
  });

  return (
    <>
      {meshes.flat().map((m) => <primitive key={m.uuid} object={m} />)}
    </>
  );
}
