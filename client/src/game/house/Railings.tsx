import { useRapier } from "@react-three/rapier";
import { useEffect, useMemo } from "react";
import { BoxGeometry, InstancedMesh, type Material, Matrix4, Quaternion, Vector3 } from "three";
import { toWorld } from "./space.ts";
import { removeBody } from "../world/physics.ts";

// Oak handrail on white balusters (foyer stairs, balcony, landing photos), also used for the deck.
// Railings are given in floorplan metres as straight runs from one point to another.

export interface RailRun {
  from: [number, number, number];
  to: [number, number, number];
}

const HEIGHT = 0.92;
const BALUSTER_GAP = 0.12;
const POST_GAP = 1.6;

const post = new BoxGeometry(0.08, 1, 0.08);
const baluster = new BoxGeometry(0.03, 1, 0.03);
const rail = new BoxGeometry(1, 0.05, 0.07);

export function Railings({ runs, materials }: { runs: RailRun[]; materials: { rail: Material; post: Material } }) {
  const { world, rapier } = useRapier();

  const meshes = useMemo(() => {
    const balusters: Matrix4[] = [], posts: Matrix4[] = [], rails: Matrix4[] = [];
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3();
    for (const { from, to } of runs) {
      const a = new Vector3(...from), b = new Vector3(...to);
      const flat = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = Math.atan2(b.z - a.z, b.x - a.x);
      const at = (t: number) => a.clone().lerp(b, t);
      // Upright pieces stand on the slope line; the handrail follows it.
      const upright = (list: Matrix4[], t: number, h: number) => {
        p.copy(at(t));
        p.y += h / 2;
        list.push(m.compose(p, q.identity(), s.set(1, h, 1)).clone());
      };
      for (let d = BALUSTER_GAP / 2; d < flat; d += BALUSTER_GAP) upright(balusters, d / flat, HEIGHT);
      const nPosts = Math.max(1, Math.round(flat / POST_GAP));
      for (let i = 0; i <= nPosts; i++) upright(posts, i / nPosts, HEIGHT + 0.06);
      const mid = at(0.5);
      mid.y += HEIGHT;
      const slope = Math.atan2(b.y - a.y, flat);
      q.setFromAxisAngle(new Vector3(0, 1, 0), -yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), slope));
      rails.push(m.compose(mid, q, s.set(Math.hypot(flat, b.y - a.y) + 0.06, 1, 1)).clone());
    }
    const make = (geo: BoxGeometry, mat: Material, list: Matrix4[]) => {
      const im = new InstancedMesh(geo, mat, Math.max(1, list.length));
      list.forEach((mx, i) => im.setMatrixAt(i, mx));
      im.count = list.length;
      im.castShadow = true;
      im.receiveShadow = true;
      return im;
    };
    return [make(baluster, materials.post, balusters), make(post, materials.post, posts), make(rail, materials.rail, rails)];
  }, [runs, materials]);

  // One sloped/straight box per run so bears can't walk through railings.
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    for (const { from, to } of runs) {
      const a = toWorld(from), b = toWorld(to);
      const flat = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const len = Math.hypot(flat, b[1] - a[1]);
      const yaw = Math.atan2(b[2] - a[2], b[0] - a[0]), slope = Math.atan2(b[1] - a[1], flat);
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), slope));
      const h = HEIGHT * 1.25 + 0.3;
      world.createCollider(
        rapier.ColliderDesc.cuboid(len / 2, h / 2, 0.06)
          .setTranslation((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + h / 2, (a[2] + b[2]) / 2)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
        body,
      );
    }
    return () => removeBody(world, body);
  }, [world, rapier, runs]);

  return (
    <>
      {meshes.map((m) => <primitive key={m.uuid} object={m} />)}
    </>
  );
}
