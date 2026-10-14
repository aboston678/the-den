import { HOUSE } from "@den/shared";
import { useRapier } from "@react-three/rapier";
import { useEffect, useMemo } from "react";
import { type BufferGeometry, Mesh, type MeshBasicMaterial, Quaternion, Vector3 } from "three";
import { useOutdoorMaps } from "../world/property/textures.ts";
import { Doors } from "./Doors.tsx";
import { Furniture } from "./furniture/Furniture.tsx";
import { buildFurniture } from "./furniture/build.ts";
import { Tvs } from "./furniture/Tvs.tsx";
import { HouseLights } from "./Lights.tsx";
import { type GeoBuckets, type SolidBox, mergeBucket } from "./geometry.ts";
import { type RailRun, Railings } from "./Railings.tsx";
import { S, toWorld } from "./space.ts";
import { buildStructure } from "./structure.ts";
import { HouseMaterials } from "./style.ts";
import { buildExterior } from "./exterior.ts";
import { type Railing, type WallPiece, wallColliders, wallGeometry, wallPieces } from "./walls.ts";
import { removeBody } from "../world/physics.ts";
import { Alley } from "../bowling/Alley.tsx";
import { buildAlley } from "../bowling/alleyGeometry.ts";

// The house (milestone 1.9), built from docs/floorplan.json: every room's walls, floors, ceilings,
// stairs, railings, furniture (2.1) and the bowling alley (3.1). Built in floorplan metres inside a group scaled 1.25× (GAME_SPEC §4).

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
  const structure = buildStructure(pieces);
  const exterior = buildExterior(pieces);
  const furnitureBuckets: GeoBuckets = new Map();
  buildFurniture(furnitureBuckets, buckets, pieces);
  const alley = buildAlley(furnitureBuckets);
  solids.push(...alley.solids);
  for (const part of [structure, exterior]) {
    for (const [k, list] of part.buckets) buckets.set(k, [...(buckets.get(k) ?? []), ...list]);
    solids.push(...part.solids);
  }

  const meshes: Mesh[] = [];
  for (const [key, list] of buckets) {
    const mesh = new Mesh(mergeBucket(list as BufferGeometry[]), materials.get(key));
    mesh.name = `house:${key}`;
    mesh.castShadow = !key.includes("glass") && key !== "window_glow";
    if (key === "glass") mesh.renderOrder = 2; // after the opaque house, so it blends over it
    mesh.receiveShadow = key !== "window_glow";
    meshes.push(mesh);
  }
  // Furniture in the rooms: its own meshes, drawn only near the house. No cast shadows: under the
  // roof they barely show, and each would cost a draw per shadow pass.
  const furniture: Mesh[] = [];
  for (const [key, list] of furnitureBuckets) {
    const mesh = new Mesh(mergeBucket(list as BufferGeometry[]), materials.get(key));
    mesh.name = `furniture:${key}`;
    mesh.receiveShadow = true;
    furniture.push(mesh);
  }
  const runs: RailRun[] = [
    ...[...flatRails, ...structure.railings].map((r) => ({
      from: (r.axis === "x" ? [r.u0, r.y, r.c] : [r.c, r.y, r.u0]) as [number, number, number],
      to: (r.axis === "x" ? [r.u1, r.y, r.c] : [r.c, r.y, r.u1]) as [number, number, number],
    })),
    ...structure.stairRails,
  ];
  return { meshes, furniture, solids, runs, ramps: structure.ramps, barriers: alley.barriers };
}

export function House() {
  const materials = useHouseMaterials();
  const house = useMemo(() => buildHouse(materials), [materials]);
  const { world, rapier } = useRapier();

  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    for (const b of house.solids) {
      if (b.tilted) {
        const c = toWorld(b.tilted.centre);
        const q = new Quaternion().setFromAxisAngle(b.tilted.axis === "x" ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1), b.tilted.angle);
        world.createCollider(
          rapier.ColliderDesc.cuboid(b.tilted.half[0] * S, b.tilted.half[1] * S, b.tilted.half[2] * S)
            .setTranslation(c[0], c[1], c[2]).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
          body,
        );
        continue;
      }
      const lo = toWorld(b.min), hi = toWorld(b.max);
      world.createCollider(
        rapier.ColliderDesc.cuboid((hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2)
          .setTranslation((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2),
        body,
      );
    }
    // Stair ramps: a thin box from the bottom edge to the top, tilted to the stair's slope.
    for (const r of house.ramps) {
      const lowP = toWorld(r.axis === "z" ? [r.w0, r.yLow, r.uLow] : [r.uLow, r.yLow, r.w0]);
      const highP = toWorld(r.axis === "z" ? [r.w1, r.yHigh, r.uHigh] : [r.uHigh, r.yHigh, r.w1]);
      const run = Math.abs(r.axis === "z" ? highP[2] - lowP[2] : highP[0] - lowP[0]);
      const rise = highP[1] - lowP[1], len = Math.hypot(run, rise), width = Math.abs(r.axis === "z" ? highP[0] - lowP[0] : highP[2] - lowP[2]);
      const dirSign = Math.sign(r.uHigh - r.uLow);
      const angle = Math.atan2(rise, run);
      const t = 0.1;
      // Tilt about the axis across the stairs; centre sits t/2 below the slope line.
      const q = r.axis === "z"
        ? new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -dirSign * angle)
        : new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), dirSign * angle);
      const mid = [(lowP[0] + highP[0]) / 2, (lowP[1] + highP[1]) / 2 - t / 2, (lowP[2] + highP[2]) / 2];
      const half = r.axis === "z" ? [width / 2, t / 2, len / 2] : [len / 2, t / 2, width / 2];
      world.createCollider(
        rapier.ColliderDesc.cuboid(half[0]!, half[1]!, half[2]!).setTranslation(mid[0]!, mid[1]!, mid[2]!).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
        body,
      );
    }
    return () => removeBody(world, body);
  }, [world, rapier, house]);
  useEffect(() => () => [...house.meshes, ...house.furniture].forEach((m) => m.geometry.dispose()), [house]);

  return (
    <>
      <group name="house" position={[HOUSE.originX, 0, HOUSE.originZ]} scale={S}>
        {house.meshes.map((m) => <primitive key={m.uuid} object={m} />)}
        <Railings runs={house.runs} materials={{ rail: materials.get("oak_trim"), post: materials.get("trim") }} />
        <Doors materials={materials} />
        <Furniture built={house.furniture} />
        <Tvs />
        <Alley barriers={house.barriers} />
      </group>
      {/* Lights live in world space: a light's range isn't scaled with the house. */}
      <HouseLights windowGlow={materials.get("window_glow") as MeshBasicMaterial} />
    </>
  );
}
