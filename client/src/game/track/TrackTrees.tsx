import { CORRIDOR_HALF, DRIVEWAY, SCENERY, TRACK_AREA, TRACK_ROAD, fbm, rng } from "@den/shared";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Box3, Color, type Group, Matrix4, Vector3 } from "three";
import { asset } from "../../asset.ts";
import { useQuality } from "../quality.ts";
import { current } from "../sky/look.ts";
import { partsOf, prepareFoliage } from "../world/property/Forest.tsx";
import { bakeImpostor } from "../world/property/impostor.ts";
import { InstancedLod, type LodLevel } from "../world/property/InstancedLod.tsx";
import type { Placement } from "../world/property/scatter.ts";
import { farmHeight } from "./geometry.ts";

// Trees round the racetrack (Andrew, round 4): a belt of the forest's own trees just outside the
// fence on every side, like the woods round a real circuit. Seeded, so every player sees the same.
// Far ones are impostor cards drawn right across the grounds (the haze is open out here).

const TREES_URL = asset("/models/trees.glb");
const KINDS = ["whitepine_a", "whitepine_b", "hemlock", "maple", "oak"] as const;
/** Impostors are drawn this far: across the whole circuit. */
const FAR = 1150;

const rectDist = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number) =>
  Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));

/** Where the trees go: 8–50 m outside the grounds, thinning out with distance, clear of the road and the property. */
export function trackTreePlacements() {
  const out = Object.fromEntries(KINDS.map((k) => [k, [] as Placement[]])) as Record<(typeof KINDS)[number], Placement[]>;
  const cell = 7;
  for (let gz = TRACK_AREA.minZ - 50; gz < TRACK_AREA.maxZ + 50; gz += cell) {
    for (let gx = TRACK_AREA.minX - 50; gx < TRACK_AREA.maxX + 50; gx += cell) {
      const rand = rng(Math.imul(Math.round(gx) + 4001, 73856093) ^ Math.imul(Math.round(gz) + 7001, 19349663));
      const x = gx + rand() * cell, z = gz + rand() * cell;
      const d = rectDist(TRACK_AREA, x, z);
      if (d < 8 || d > 50) continue;
      if (rand() > 0.85 - d * 0.009 + 0.25 * fbm(x, z, 70, 61)) continue;
      if (x > SCENERY.minX - 6 && z > SCENERY.minZ - 6) continue; // the property's own woods
      if (TRACK_ROAD.closest(x, z, CORRIDOR_HALF + 6) || DRIVEWAY.closest(x, z, CORRIDOR_HALF + 6)) continue;
      const kind = KINDS[Math.floor(rand() * KINDS.length)]!;
      out[kind].push({ x, y: farmHeight(x, z) - 0.1, z, rot: rand() * Math.PI * 2, scale: 0.8 + rand() * 0.45 });
    }
  }
  return out;
}

let placements: ReturnType<typeof trackTreePlacements> | null = null;

export function TrackTrees() {
  const trees = useGLTF(TREES_URL).scene as Group;
  const gl = useThree((s) => s.gl);
  const q = useQuality();
  const items = useMemo(() => (placements ??= trackTreePlacements()), []);
  const impostors = useMemo(() => {
    prepareFoliage(trees);
    return new Map(KINDS.map((k) => [k, bakeImpostor(gl, [...partsOf(trees, `${k}_lod1_bark`), ...partsOf(trees, `${k}_lod1_leaves`)])]));
  }, [trees, gl]);
  useEffect(() => () => impostors.forEach((i) => {
    i.geometry.dispose();
    (i.material.uniforms.map!.value as { dispose(): void }).dispose();
    i.material.dispose();
  }), [impostors]);

  const kinds = useMemo(() => {
    const [near, mid] = q.treeLods;
    return KINDS.map((k) => {
      const lod = (n: number) => [...partsOf(trees, `${k}_lod${n}_bark`), ...partsOf(trees, `${k}_lod${n}_leaves`)];
      const levels: LodLevel[] = [
        { maxDist: near, castShadow: true, parts: lod(0), shadowProxy: lod(2) },
        { maxDist: mid, castShadow: false, parts: lod(1) },
        { maxDist: FAR, castShadow: false, parts: [{ ...impostors.get(k)!, matrix: new Matrix4() }] },
      ];
      const box = new Box3();
      for (const p of levels[0]!.parts) {
        p.geometry.computeBoundingBox();
        box.union(p.geometry.boundingBox!.clone().applyMatrix4(p.matrix));
      }
      return { name: k, levels, radius: box.getSize(new Vector3()).length() / 2 };
    });
  }, [trees, impostors, q]);

  // Impostor cards lit like the forest's (Forest.tsx): sky light plus some sun.
  useFrame(() => {
    const l = current.light, h = current.hemi;
    light.copy(h.sky).multiplyScalar(h.intensity * 1.1).add(tmp.copy(l.color).multiplyScalar(l.intensity * 0.28 * Math.max(0.2, l.dir.y)));
    for (const i of impostors.values()) (i.material.uniforms.light!.value as Color).copy(light);
  });

  return (
    <group name="track-trees">
      {kinds.map((k) => <InstancedLod key={`${k.name}:${q.tier}`} name={`track-${k.name}`} items={items[k.name]} levels={k.levels} radius={k.radius} />)}
    </group>
  );
}

const light = new Color();
const tmp = new Color();
