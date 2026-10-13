import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  type BufferGeometry, Euler, Frustum, InstancedBufferAttribute, InstancedMesh, type Material, Matrix4, Quaternion, Sphere, Vector3,
} from "three";
import { addLodFade, shareGeometry } from "./lodFade.ts";
import type { Placement } from "./scatter.ts";

// Draws many copies of a model cheaply (GAME_SPEC §17): one instanced draw per part per detail
// level. As the camera moves it re-sorts the copies by distance from the camera into detail
// levels, and drops ones that are off-screen or further than the last level reaches. Near the edge
// of a level a copy dissolves into the next level (or into nothing past the last), so nothing pops
// (lodFade.ts).

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
  /**
   * A simpler model that casts this level's shadows instead (the level itself then casts none).
   * It's drawn only into shadow maps, never on screen (see shadowOnly).
   */
  shadowProxy?: LodPart[];
}

/** Make an instanced mesh draw only into shadow maps: on screen it draws zero copies. */
function shadowOnly(mesh: InstancedMesh) {
  let saved = 0;
  mesh.onBeforeRender = () => {
    saved = mesh.count;
    mesh.count = 0;
  };
  mesh.onAfterRender = () => {
    mesh.count = saved;
  };
}

/**
 * Distances are multiplied by this before picking a detail level. Indoors it goes up (house/Lights.tsx):
 * the forest is only seen through windows, 25 m+ away, so the cheap levels are plenty.
 */
export const lodBias = { value: 1 };

const KEEP_FOR_SHADOWS = 30; // copies this close stay even when off-screen, so their shadows still fall into view
const REFRESH_S = 0.25;
const REFRESH_MOVE = 0.6; // metres the camera moves before re-sorting (keeps the dissolves smooth at a sprint)

/** How deep the dissolve is at the edge of a level that ends at `edge` (and starts at `start`). */
const fadeBand = (edge: number, start: number) => Math.min(Math.max(2, edge * 0.1), (edge - start) * 0.5);

interface LodMesh {
  mesh: InstancedMesh;
  fade: InstancedBufferAttribute;
}

function lodMesh(part: LodPart, count: number, name: string): LodMesh {
  addLodFade(part.material);
  const geometry = shareGeometry(part.geometry);
  const fade = new InstancedBufferAttribute(new Float32Array(count), 1);
  geometry.setAttribute("lodFade", fade);
  const mesh = new InstancedMesh(geometry, part.material, count);
  mesh.count = 0;
  mesh.frustumCulled = false; // we cull per copy ourselves
  mesh.name = name;
  return { mesh, fade };
}

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

  const meshes = useMemo(() => levels.map((level) => [
    ...level.parts.map((part) => {
      const m = lodMesh(part, Math.max(1, items.length), name);
      m.mesh.castShadow = !!level.castShadow && !level.shadowProxy;
      m.mesh.receiveShadow = true;
      return m;
    }),
    ...(level.shadowProxy ?? []).map((part) => {
      const m = lodMesh(part, Math.max(1, items.length), `${name}:shadow`);
      m.mesh.castShadow = true;
      m.mesh.receiveShadow = false;
      shadowOnly(m.mesh);
      return m;
    }),
  ]), [levels, items, name]);
  // The shared geometries aren't disposed: that would also drop the model file's GPU buffers.
  useEffect(() => () => meshes.flat().forEach((m) => m.mesh.dispose()), [meshes]);

  const state = useMemo(() => ({ timer: REFRESH_S, lastPos: new Vector3(1e9, 0, 0), lastQuat: new Quaternion(), lastBias: 1 }), []);
  const bands = useMemo(() => levels.map((l, i) => fadeBand(l.maxDist, i > 0 ? levels[i - 1]!.maxDist : 0)), [levels]);

  useFrame((_, dt) => {
    state.timer += dt;
    const moved = camera.position.distanceToSquared(state.lastPos) > REFRESH_MOVE * REFRESH_MOVE || Math.abs(camera.quaternion.dot(state.lastQuat)) < 0.9995 || lodBias.value !== state.lastBias;
    if (!moved && state.timer < REFRESH_S) return;
    state.timer = 0;
    state.lastPos.copy(camera.position);
    state.lastQuat.copy(camera.quaternion);
    state.lastBias = lodBias.value;

    tmp.frustum.setFromProjectionMatrix(tmp.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const counts = levels.map(() => 0);
    const place = (lod: number, fade: number) => {
      const slot = counts[lod]!++;
      meshes[lod]!.forEach(({ mesh, fade: f }, p) => {
        const parts = levels[lod]!.parts, part = p < parts.length ? parts[p]! : levels[lod]!.shadowProxy![p - parts.length]!;
        tmp.pv.multiplyMatrices(tmp.m, part.matrix).toArray(mesh.instanceMatrix.array, slot * 16);
        f.array[slot] = fade;
      });
    };
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      const d = Math.hypot(it.x - cx, it.y - cy, it.z - cz) * lodBias.value;
      let lod = 0;
      while (lod < levels.length && d > levels[lod]!.maxDist) lod++;
      if (lod === levels.length) continue;
      if (d > KEEP_FOR_SHADOWS) {
        tmp.sphere.center.set(it.x, it.y + radius * it.scale * 0.5, it.z);
        tmp.sphere.radius = radius * it.scale;
        if (!tmp.frustum.intersectsSphere(tmp.sphere)) continue;
      }
      tmp.m.fromArray(base, i * 16);
      // Inside the dissolve band at the far edge of its level: t goes 0 → 1 toward the edge.
      const edge = levels[lod]!.maxDist, band = bands[lod]!;
      const t = d > edge - band ? (d - (edge - band)) / band : 0;
      place(lod, t > 0 ? -t : 0);
      if (t > 0 && lod + 1 < levels.length) place(lod + 1, t);
    }
    meshes.forEach((parts, lod) => parts.forEach(({ mesh, fade }) => {
      mesh.count = counts[lod]!;
      mesh.instanceMatrix.needsUpdate = true;
      fade.needsUpdate = true;
    }));
  });

  return (
    <>
      {meshes.flat().map(({ mesh }) => <primitive key={mesh.uuid} object={mesh} />)}
    </>
  );
}
