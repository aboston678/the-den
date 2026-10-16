import { PADDOCK, SCENERY, TRACK, TRACK_AREA, TRACK_ROAD, TRACK_ROAD_WIDTH, TRACK_WIDTH, TRACK_Y, WORLD_LIMITS } from "@den/shared";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { type Fog, type Group, MeshStandardMaterial, Vector2 } from "three";
import { TOON } from "../artStyle.ts";
import { invisibleColliders } from "../world/invisible.ts";
import { removeBody } from "../world/physics.ts";
import { useOutdoorMaps } from "../world/property/textures.ts";
import { ASPHALT_Y, circuitPaint, farmGeometry, fenceLine, roadGeometry, trackBuildings } from "./geometry.ts";
import { FENCE, GATE, corridorWalls } from "./walls.ts";
import { trackHaze } from "./haze.ts";

// The racetrack and the way out to it (Andrew, 2026-10-16): the farmland past the woods, the road,
// the fenced circuit with its paint and buildings, the flat ground to drive on there, and the
// invisible walls along the road and round the grounds. Only drawn when you could see it.

/** The flat collision ground out here (the property's own heightfield stops at ±146 m). */
const PHYS_EDGE = -146;

const once = <T,>(build: () => T) => {
  let value: T | undefined;
  return () => (value ??= build());
};
const shapes = once(() => ({
  farm: farmGeometry(),
  road: roadGeometry(TRACK_ROAD, TRACK_ROAD_WIDTH, ASPHALT_Y - 0.01),
  circuit: roadGeometry(TRACK, TRACK_WIDTH + 0.1, ASPHALT_Y),
  paint: circuitPaint(),
  buildings: trackBuildings(GATE),
}));

export function TrackWorld() {
  const group = useRef<Group>(null);
  const { world, rapier } = useRapier();
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const maps = useOutdoorMaps("asphalt");
  const geo = useMemo(shapes, []);
  const mats = useMemo(() => ({
    asphalt: new MeshStandardMaterial({ ...maps, color: TOON ? "#a9a49c" : "#7d7b78", normalScale: new Vector2(0.15, 0.15), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    // The road out is the driveway carried on: the same paving.
    road: new MeshStandardMaterial({ ...maps, color: TOON ? "#cfc8bc" : "#9a9894", normalScale: TOON ? new Vector2(0.15, 0.15) : new Vector2(1, 1), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    painted: new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    farm: new MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    buildings: new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
  }), [maps]);

  // Ground to drive on and the walls, out here beyond the property's own collision.
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    const handles: number[] = [];
    const cuboid = (minX: number, maxX: number, minZ: number, maxZ: number) =>
      world.createCollider(rapier.ColliderDesc.cuboid((maxX - minX) / 2, 1, (maxZ - minZ) / 2).setTranslation((minX + maxX) / 2, TRACK_Y - 1.03, (minZ + maxZ) / 2), body);
    cuboid(WORLD_LIMITS.minX, PHYS_EDGE, WORLD_LIMITS.minZ, -60);
    cuboid(PHYS_EDGE, -60, WORLD_LIMITS.minZ, PHYS_EDGE);
    const wall = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
      const c = world.createCollider(
        rapier.ColliderDesc.cuboid(0.4, 20, len / 2 + 0.05).setTranslation((x0 + x1) / 2, TRACK_Y, (z0 + z1) / 2).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
        body,
      );
      invisibleColliders.add(c.handle);
      handles.push(c.handle);
    };
    for (const w of corridorWalls()) wall(...w);
    for (const [x0, z0, x1, z1] of fenceLine()) {
      if (x0 === x1 && x0 === FENCE.maxX) {
        wall(x0, FENCE.minZ, x0, GATE.from);
        wall(x0, GATE.to, x0, FENCE.maxZ);
      } else wall(x0, z0, x1, z1);
    }
    return () => {
      for (const h of handles) invisibleColliders.delete(h);
      removeBody(world, body);
    };
  }, [world, rapier]);

  // Only drawn when it could be seen; out here the haze opens up so you can see across the track.
  useFrame(() => {
    const c = camera.position;
    const out = Math.hypot(Math.max(SCENERY.minX - c.x, 0), Math.max(SCENERY.minZ - c.z, 0));
    const toTrack = Math.hypot(Math.max(TRACK_AREA.minX - c.x, 0, c.x - TRACK_AREA.maxX), Math.max(TRACK_AREA.minZ - c.z, 0, c.z - TRACK_AREA.maxZ));
    const fog = scene.fog as Fog | null;
    if (group.current) group.current.visible = toTrack < (fog?.far ?? 200) + 60 || out > 0;
    trackHaze.open = Math.min(1, out / 50);
  });

  return (
    <group ref={group} name="racetrack">
      <mesh geometry={geo.farm} material={mats.farm} receiveShadow name="farmland" />
      <mesh geometry={geo.road} material={mats.road} receiveShadow name="track-road" />
      <mesh material={mats.asphalt} receiveShadow name="paddock" position={[(PADDOCK.minX + PADDOCK.maxX) / 2, ASPHALT_Y - 0.01, (PADDOCK.minZ + PADDOCK.maxZ) / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[PADDOCK.maxX - PADDOCK.minX, PADDOCK.maxZ - PADDOCK.minZ]} />
      </mesh>
      <mesh geometry={geo.circuit} material={mats.asphalt} receiveShadow name="circuit" />
      <mesh geometry={geo.paint} material={mats.painted} receiveShadow name="circuit-paint" />
      <mesh geometry={geo.buildings} material={mats.buildings} castShadow receiveShadow name="track-buildings" />
    </group>
  );
}
