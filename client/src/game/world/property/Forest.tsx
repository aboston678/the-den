import { BOUNDARY_HALF, STREAM, streamCenter } from "@den/shared";
import { useGLTF } from "@react-three/drei";
import { useRapier } from "@react-three/rapier";
import { useEffect, useMemo } from "react";
import { Box3, DoubleSide, type Group, type Mesh, MeshStandardMaterial, Quaternion, Euler, Vector3 } from "three";
import { InstancedLod, type LodLevel, type LodPart } from "./InstancedLod.tsx";
import { FERNS, ROCKS, SAPLING_KINDS, SHRUBS, TREE_KINDS, type Placement, type Scatter, scatterAll } from "./scatter.ts";
import { removeBody } from "../physics.ts";

// The forest and everything on its floor (GAME_SPEC §4): EZ-Tree trees (tools/build-trees.mjs) and
// CC0 Poly Haven rocks, ferns, logs, stumps and shrubs (tools/build-outdoor-props.mjs).

const TREES_URL = "/models/trees.glb";
const PROPS_URL = "/models/outdoor-props.glb";

/** How far each kind of thing is drawn, per detail level (metres from the camera). */
const TREE_LODS = [40, 85, 175];
const SAPLING_LODS = [25, 55, 100];

/** Every mesh under the named node, with its transform inside the file. */
function partsOf(scene: Group, name: string): LodPart[] {
  const node = scene.getObjectByName(name);
  if (!node) throw new Error(`missing ${name} in model file`);
  scene.updateMatrixWorld(true);
  const parts: LodPart[] = [];
  node.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) parts.push({ geometry: mesh.geometry, material: mesh.material as MeshStandardMaterial, matrix: mesh.matrixWorld.clone() });
  });
  return parts;
}

/** Bounding box of a set of parts (in the model's own space). */
function boundsOf(parts: LodPart[]) {
  const box = new Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!.clone().applyMatrix4(p.matrix));
  }
  return box;
}

/** Radius of the trunk near the ground, for the tree's collider. */
function trunkRadius(parts: LodPart[]) {
  let r = 0.15;
  const v = new Vector3();
  for (const p of parts) {
    const pos = p.geometry.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(p.matrix);
      if (v.y < 0.6) r = Math.max(r, Math.hypot(v.x, v.z));
    }
  }
  return Math.min(r, 0.8);
}

/** Leaves and fern fronds: cut-out edges, both sides, smooth at a distance. */
function prepareFoliage(scene: Group) {
  scene.traverse((o) => {
    const m = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (m && m.alphaTest > 0) {
      m.side = DoubleSide;
      m.alphaToCoverage = true;
    }
  });
}

/** Can a bear walk here? (Only make colliders for things inside the walkable area.) */
const reachable = (x: number, z: number) =>
  Math.abs(x) < BOUNDARY_HALF + 2 && Math.abs(z) < BOUNDARY_HALF + 2 && x - streamCenter(z) < STREAM.wadeLimitD + 2;

let scatterCache: Scatter | null = null;
/** The forest layout is the same every time; work it out once (React may re-render while assets load). */
const scatter_ = () => (scatterCache ??= scatterAll());

export function Forest() {
  const trees = useGLTF(TREES_URL).scene as Group;
  const props = useGLTF(PROPS_URL).scene as Group;
  const scatter = useMemo(scatter_, []);

  const kinds = useMemo(() => {
    prepareFoliage(trees);
    prepareFoliage(props);
    const lodsOf = (kind: string, dists: number[], shadowLevels: number): LodLevel[] =>
      dists.map((maxDist, n) => ({ maxDist, castShadow: n < shadowLevels, parts: [...partsOf(trees, `${kind}_lod${n}_bark`), ...partsOf(trees, `${kind}_lod${n}_leaves`)] }));
    const single = (name: string, maxDist: number, castShadow: boolean): LodLevel[] => [{ maxDist, castShadow, parts: partsOf(props, name) }];

    const list: { name: string; items: Placement[]; levels: LodLevel[] }[] = [
      ...TREE_KINDS.map((k) => ({ name: k, items: scatter.trees[k], levels: lodsOf(k, TREE_LODS, 2) })),
      ...SAPLING_KINDS.map((k) => ({ name: k, items: scatter.saplings[k], levels: lodsOf(k, SAPLING_LODS, 1) })),
      ...FERNS.map((k) => ({ name: k, items: scatter.ferns[k]!, levels: single(k, 45, false) })),
      ...ROCKS.map((k) => ({ name: k, items: scatter.rocks[k]!, levels: single(k, 120, true) })),
      ...SHRUBS.map((k) => ({ name: k, items: scatter.shrubs[k]!, levels: single(k, 120, true) })),
      { name: "log", items: scatter.logs, levels: single("log", 90, true) },
      { name: "stump", items: scatter.stumps, levels: single("stump", 90, true) },
      { name: "boulder", items: scatter.boulder, levels: single("boulder", 200, true) },
    ];
    return list.map((k) => {
      const box = boundsOf(k.levels[0]!.parts);
      return { ...k, box, radius: box.getSize(new Vector3()).length() / 2 };
    });
  }, [trees, props, scatter]);

  useForestColliders(scatter, kinds);

  return (
    <group name="forest">
      {kinds.map((k) => k.items.length > 0 && <InstancedLod key={k.name} name={k.name} items={k.items} levels={k.levels} radius={k.radius} />)}
    </group>
  );
}

/** Trunks, rocks, logs, stumps, shrubs and the boulder are solid; ferns and saplings aren't. */
function useForestColliders(scatter: Scatter, kinds: { name: string; items: Placement[]; levels: LodLevel[]; box: Box3 }[]) {
  const { world, rapier } = useRapier();
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    const q = new Quaternion(), e = new Euler();
    const add = (desc: ReturnType<typeof rapier.ColliderDesc.cuboid>, it: Placement, yOffset: number) => {
      q.setFromEuler(e.set(it.tilt ?? 0, it.rot, 0, "YXZ"));
      world.createCollider(desc.setTranslation(it.x, it.y + yOffset, it.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }), body);
    };
    for (const k of kinds) {
      const solid = (TREE_KINDS as readonly string[]).includes(k.name) || ROCKS.includes(k.name) || (SHRUBS as readonly string[]).includes(k.name)
        || ["log", "stump", "boulder"].includes(k.name);
      if (!solid) continue;
      const size = k.box.getSize(new Vector3()), centre = k.box.getCenter(new Vector3());
      const trunk = (TREE_KINDS as readonly string[]).includes(k.name) ? trunkRadius(k.levels[0]!.parts) : 0;
      for (const it of k.items) {
        if (!reachable(it.x, it.z)) continue;
        const s = it.scale;
        if (trunk) add(rapier.ColliderDesc.cylinder(4, trunk * s * 0.85), it, 4);
        else if ((SHRUBS as readonly string[]).includes(k.name)) add(rapier.ColliderDesc.cylinder(0.8, 0.45 * s), it, 0.8);
        else add(rapier.ColliderDesc.cuboid((size.x / 2) * s * 0.85, (size.y / 2) * s, (size.z / 2) * s * 0.85), it, centre.y * s);
      }
    }
    return () => removeBody(world, body);
  }, [world, rapier, kinds, scatter]);
}

useGLTF.preload(TREES_URL);
useGLTF.preload(PROPS_URL);
