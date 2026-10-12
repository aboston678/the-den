import { HOUSE } from "@den/shared";
import { useRapier } from "@react-three/rapier";
import { useEffect, useMemo } from "react";
import { type BufferGeometry, Mesh } from "three";
import { useOutdoorMaps } from "../world/property/textures.ts";
import { type GeoBuckets, type SolidBox, mergeBucket } from "./geometry.ts";
import { type RailRun, Railings } from "./Railings.tsx";
import { S, toWorld } from "./space.ts";
import { buildStructure } from "./structure.ts";
import { HouseMaterials } from "./style.ts";
import { buildExterior } from "./exterior.ts";
import { type Railing, type WallPiece, wallColliders, wallGeometry, wallPieces } from "./walls.ts";

// The house (milestone 1.9), built from docs/floorplan.json: every room's walls, floors, ceilings,
// stairs and railings. Built in floorplan metres inside a group scaled 1.25× (GAME_SPEC §4).

function useHouseMaterials() {
  const tex = {
    oak: useOutdoorMaps("oak_floor"),
    terracotta: useOutdoorMaps("terracotta"),
    concrete: useOutdoorMaps("concrete"),
    pine: useOutdoorMaps("knotty_pine"),
    shingles: useOutdoorMaps("shingles"),
    brick: useOutdoorMaps("brick"),
    planks: useOutdoorMaps("planks"),
  };
  return useMemo(() => new HouseMaterials(tex), Object.values(tex)); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Build everything once: merged meshes per material, collision boxes, railing runs. */
function buildHouse(materials: HouseMaterials) {
  const buckets: GeoBuckets = new Map();
  const solids: SolidBox[] = [];
  const flatRails: Railing[] = [];
  const pieces: WallPiece[] = [];
  for (const lv of ["basement", "main", "upper"] as const) {
    const { walls, railings } = wallPieces(lv);
    for (const w of walls) {
      wallGeometry(w, buckets);
      solids.push(...wallColliders(w));
    }
    pieces.push(...walls);
    flatRails.push(...railings);
  }
  const structure = buildStructure();
  const exterior = buildExterior(pieces);
  for (const part of [structure, exterior]) {
    for (const [k, list] of part.buckets) buckets.set(k, [...(buckets.get(k) ?? []), ...list]);
    solids.push(...part.solids);
  }

  const meshes: Mesh[] = [];
  for (const [key, list] of buckets) {
    const mesh = new Mesh(mergeBucket(list as BufferGeometry[]), materials.get(key));
    mesh.name = `house:${key}`;
    mesh.castShadow = !key.includes("glass");
    if (key === "glass") mesh.renderOrder = 2; // after the opaque house, so it blends over it
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  const runs: RailRun[] = [
    ...[...flatRails, ...structure.railings].map((r) => ({
      from: (r.axis === "x" ? [r.u0, r.y, r.c] : [r.c, r.y, r.u0]) as [number, number, number],
      to: (r.axis === "x" ? [r.u1, r.y, r.c] : [r.c, r.y, r.u1]) as [number, number, number],
    })),
    ...structure.stairRails,
  ];
  return { meshes, solids, runs };
}

export function House() {
  const materials = useHouseMaterials();
  const house = useMemo(() => buildHouse(materials), [materials]);
  const { world, rapier } = useRapier();

  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    for (const b of house.solids) {
      const lo = toWorld(b.min), hi = toWorld(b.max);
      world.createCollider(
        rapier.ColliderDesc.cuboid((hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2)
          .setTranslation((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2),
        body,
      );
    }
    return () => world.removeRigidBody(body);
  }, [world, rapier, house]);
  useEffect(() => () => house.meshes.forEach((m) => m.geometry.dispose()), [house]);

  return (
    <group name="house" position={[HOUSE.originX, 0, HOUSE.originZ]} scale={S}>
      {house.meshes.map((m) => <primitive key={m.uuid} object={m} />)}
      <Railings runs={house.runs} materials={{ rail: materials.get("oak_trim"), post: materials.get("trim") }} />
    </group>
  );
}
