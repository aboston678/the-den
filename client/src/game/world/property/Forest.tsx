import { STREAM, distanceToEdge, streamCenter } from "@den/shared";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useEffect, useMemo } from "react";
import { Box3, Color, DoubleSide, type Group, Matrix4, type Mesh, MeshStandardMaterial, Quaternion, Euler, Vector3 } from "three";
import { useQuality } from "../../quality.ts";
import { current } from "../../sky/look.ts";
import { bakeImpostor } from "./impostor.ts";
import { InstancedLod, type LodLevel, type LodPart } from "./InstancedLod.tsx";
import { FERNS, ROCKS, SAPLING_KINDS, SHRUBS, TREE_KINDS, type Placement, type Scatter, scatterAll } from "./scatter.ts";
import { ignoreLampsAndFlashlights, ignorePointLights } from "../lighting.ts";
import { removeBody } from "../physics.ts";

// The forest and everything on its floor (GAME_SPEC §4): EZ-Tree trees (tools/build-trees.mjs) and
// CC0 Poly Haven rocks, ferns, logs, stumps and shrubs (tools/build-outdoor-props.mjs).

const TREES_URL = "/models/trees.glb";
const PROPS_URL = "/models/outdoor-props.glb";

/** Rocks, logs, stumps and shrubs are drawn this far (they're low and few). */
const PROP_FAR = 110;

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

/** Leaves and fern fronds: cut-out edges, both sides, smooth at a distance. Nothing in the forest takes lamplight. */
function prepareFoliage(scene: Group) {
  scene.traverse((o) => {
    const m = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (m && m.alphaTest > 0) ignoreLampsAndFlashlights(m);
    else if (m) ignorePointLights(m);
    if (m && m.alphaTest > 0) {
      m.side = DoubleSide;
      m.alphaToCoverage = true;
    }
  });
}

/** Can a bear walk here? (Only make colliders for things inside the walkable area.) */
const reachable = (x: number, z: number) =>
  distanceToEdge(x, z) > -2 && x - streamCenter(z) < STREAM.wadeLimitD + 2;

let scatterCache: Scatter | null = null;
/** The forest layout is the same every time; work it out once (React may re-render while assets load). */
const scatter_ = () => (scatterCache ??= scatterAll());

export function Forest() {
  const trees = useGLTF(TREES_URL).scene as Group;
  const props = useGLTF(PROPS_URL).scene as Group;
  const scatter = useMemo(scatter_, []);
  const gl = useThree((st) => st.gl);
  const q = useQuality();

  // Far trees are drawn as impostor cards, photographed once per kind from the medium-detail tree.
  const impostors = useMemo(() => {
    prepareFoliage(trees);
    prepareFoliage(props);
    return new Map<string, ReturnType<typeof bakeImpostor>>(TREE_KINDS.map((k) => [k, bakeImpostor(gl, [...partsOf(trees, `${k}_lod1_bark`), ...partsOf(trees, `${k}_lod1_leaves`)])]));
  }, [trees, props, gl]);
  useEffect(() => () => impostors.forEach((i) => {
    i.geometry.dispose();
    (i.material.uniforms.map!.value as { dispose(): void }).dispose();
    i.material.dispose();
  }), [impostors]);

  const kinds = useMemo(() => {
    const [near, mid, far] = q.treeLods;
    const treeLevels = (kind: string): LodLevel[] => [
      { maxDist: near, castShadow: true, parts: [...partsOf(trees, `${kind}_lod0_bark`), ...partsOf(trees, `${kind}_lod0_leaves`)] },
      {
        maxDist: mid,
        castShadow: q.treeShadowLevels > 1,
        parts: [...partsOf(trees, `${kind}_lod1_bark`), ...partsOf(trees, `${kind}_lod1_leaves`)],
        // Their shadows come from the far-detail tree: a shadow doesn't show the difference, and it's a quarter of the work.
        shadowProxy: q.treeShadowLevels > 1 ? [...partsOf(trees, `${kind}_lod2_bark`), ...partsOf(trees, `${kind}_lod2_leaves`)] : undefined,
      },
      { maxDist: far, castShadow: false, parts: [{ ...impostors.get(kind)!, matrix: new Matrix4() }] },
    ];
    const saplingLevels = (kind: string): LodLevel[] => [
      { maxDist: q.smallFar * 0.55, castShadow: true, parts: [...partsOf(trees, `${kind}_lod0_bark`), ...partsOf(trees, `${kind}_lod0_leaves`)] },
      { maxDist: q.smallFar, castShadow: false, parts: [...partsOf(trees, `${kind}_lod1_bark`), ...partsOf(trees, `${kind}_lod1_leaves`)] },
    ];
    const single = (name: string, maxDist: number, castShadow: boolean): LodLevel[] => [{ maxDist, castShadow, parts: partsOf(props, name) }];

    const list: { name: string; items: Placement[]; levels: LodLevel[] }[] = [
      ...TREE_KINDS.map((k) => ({ name: k, items: scatter.trees[k], levels: treeLevels(k) })),
      ...SAPLING_KINDS.map((k) => ({ name: k, items: scatter.saplings[k], levels: saplingLevels(k) })),
      ...FERNS.map((k) => ({ name: k, items: scatter.ferns[k]!, levels: single(k, q.smallFar, false) })),
      ...ROCKS.map((k) => ({ name: k, items: scatter.rocks[k]!, levels: single(k, PROP_FAR, true) })),
      ...SHRUBS.map((k) => ({ name: k, items: scatter.shrubs[k]!, levels: single(k, PROP_FAR, true) })),
      { name: "log", items: scatter.logs, levels: single("log", 90, true) },
      { name: "stump", items: scatter.stumps, levels: single("stump", 90, true) },
      { name: "boulder", items: scatter.boulder, levels: single("boulder", 200, true) },
    ];
    return list.map((k) => {
      const box = boundsOf(k.levels[0]!.parts);
      return { ...k, box, radius: box.getSize(new Vector3()).length() / 2 };
    });
  }, [trees, props, scatter, impostors, q]);

  // Impostor cards are lit like the trees around them: sky light plus some sun.
  useFrame(() => {
    const l = current.light, h = current.hemi;
    impostorLight.copy(h.sky).multiplyScalar(h.intensity * 1.1).add(tmpColor.copy(l.color).multiplyScalar(l.intensity * 0.28 * Math.max(0.2, l.dir.y)));
    for (const i of impostors.values()) (i.material.uniforms.light!.value as Color).copy(impostorLight);
  });

  useForestColliders(scatter, kinds);

  return (
    <group name="forest">
      {kinds.map((k) => k.items.length > 0 && <InstancedLod key={`${k.name}:${q.tier}`} name={k.name} items={k.items} levels={k.levels} radius={k.radius} />)}
    </group>
  );
}

const impostorLight = new Color();
const tmpColor = new Color();

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
