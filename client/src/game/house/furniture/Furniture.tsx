import { FURNITURE, footprint, isSolid, kindOf, roomFloorY } from "@den/shared";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { type Group, InstancedMesh, type Material, Matrix4, type Mesh } from "three";
import { quality } from "../../quality.ts";
import { playerState } from "../../state.ts";
import { invisibleColliders } from "../../world/invisible.ts";
import { removeBody } from "../../world/physics.ts";
import { indoor } from "../lights.ts";
import { toWorld } from "../space.ts";
import { asset } from "../../../asset.ts";

// The furniture in the rooms: hero pieces (Higgsfield models in furniture.glb, one instanced mesh
// per model, so the four Catan chairs are a single draw) and the code-built meshes, all hidden when
// you're outdoors away from the house (further than the graphics preset's furnitureFar: far enough
// that the rooms are already furnished before you can make them out through the windows). Plus a solid box for every piece you can bump into. The
// camera ignores furniture (it would keep snapping in). Positions are floorplan metres.

export const FURNITURE_URL = asset("/models/furniture.glb");
/** Drawn for the first few frames wherever you are, so its shaders and textures are ready before you walk up (no stutter). */
const WARM_FRAMES = 3;
const HOUSE_MIN = toWorld([0, 0, 0]), HOUSE_MAX = toWorld([34, 0, 11.5]);

function heroMeshes(scene: Group) {
  const byModel = new Map<string, Matrix4[]>();
  for (const p of FURNITURE) {
    const k = kindOf(p);
    if (!k.model) continue;
    const y = roomFloorY(p.room) + (p.y ?? 0) - (k.mount === "ceiling" ? k.h : 0);
    const m = new Matrix4().makeTranslation(p.x, y, p.z).multiply(new Matrix4().makeRotationY(((p.rot ?? 0) * Math.PI) / 180));
    byModel.set(k.model, [...(byModel.get(k.model) ?? []), m]);
  }
  const out: InstancedMesh[] = [];
  for (const [model, mats] of byModel) {
    const src = scene.getObjectByName(model) as Mesh | undefined;
    if (!src?.isMesh) continue;
    // The GLB stores compressed (quantized) positions with a scale + offset on the node: keep it.
    src.updateWorldMatrix(true, false);
    const mesh = new InstancedMesh(src.geometry, src.material as Material, mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m.clone().multiply(src.matrixWorld)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true; // no cast shadows: indoors under the roof they barely show, and each costs a draw per shadow pass
    mesh.name = `furniture:${model}`;
    out.push(mesh);
  }
  return out;
}

/** Hero models plus the code-built furniture meshes (built with the house, House.tsx). */
export function Furniture({ built }: { built: Mesh[] }) {
  const { scene } = useGLTF(FURNITURE_URL);
  const meshes = useMemo(() => heroMeshes(scene as Group), [scene]);
  const group = useRef<Group>(null);
  const warm = useRef(WARM_FRAMES);
  const { world, rapier } = useRapier();

  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    for (const p of FURNITURE) {
      if (!isSolid(p)) continue;
      const f = footprint(p, true), y = roomFloorY(p.room), h = Math.min(kindOf(p).h, 2.0);
      const lo = toWorld([f.x0, y, f.z0]), hi = toWorld([f.x1, y + h, f.z1]);
      const c = world.createCollider(
        rapier.ColliderDesc.cuboid((hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2)
          .setTranslation((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2),
        body,
      );
      invisibleColliders.add(c.handle);
    }
    return () => removeBody(world, body);
  }, [world, rapier]);
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);

  useFrame(() => {
    if (!group.current) return;
    const p = playerState.position;
    const dx = Math.max(HOUSE_MIN[0] - p.x, 0, p.x - HOUSE_MAX[0]), dz = Math.max(HOUSE_MIN[2] - p.z, 0, p.z - HOUSE_MAX[2]);
    group.current.visible = warm.current-- > 0 || indoor.level !== null || Math.hypot(dx, dz) < quality().furnitureFar;
  });

  return (
    <group ref={group} name="furniture">
      {meshes.map((m) => <primitive key={m.uuid} object={m} />)}
      {built.map((m) => <primitive key={m.uuid} object={m} />)}
    </group>
  );
}

useGLTF.preload(FURNITURE_URL);
