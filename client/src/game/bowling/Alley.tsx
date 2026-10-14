import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useEffect, useRef } from "react";
import type { Group } from "three";
import type { SolidBox } from "../house/geometry.ts";
import { indoor } from "../house/lights.ts";
import { toWorld } from "../house/space.ts";
import { invisibleColliders } from "../world/invisible.ts";
import { removeBody } from "../world/physics.ts";
import { LanePins } from "./LanePins.tsx";
import { Monitors } from "./Monitors.tsx";
import { installBowlDev } from "./dev.ts";

// The bowling alley's moving and glowing parts (GAME_SPEC §15): pins, balls, sweep bars, screens.
// The fixed parts (lanes, ball return…) are merged into the house's furniture meshes
// (alleyGeometry.ts). Only drawn while you're in the basement (and for the first frames, so its
// shaders are ready). Lives inside the house group: floorplan metres.

const WARM_FRAMES = 3;

export function Alley({ barriers }: { barriers: SolidBox[] }) {
  const group = useRef<Group>(null);
  const warm = useRef(WARM_FRAMES);
  const { world, rapier } = useRapier();
  useEffect(installBowlDev, []);

  // The foul-line barrier: stops bears, the camera sees through it.
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    for (const b of barriers) {
      const lo = toWorld(b.min), hi = toWorld(b.max);
      const c = world.createCollider(
        rapier.ColliderDesc.cuboid((hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2)
          .setTranslation((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2),
        body,
      );
      invisibleColliders.add(c.handle);
    }
    return () => removeBody(world, body);
  }, [world, rapier, barriers]);

  useFrame(() => {
    if (group.current) group.current.visible = warm.current-- > 0 || indoor.level === "basement";
  });

  return (
    <group ref={group} name="bowling">
      <Monitors />
      <LanePins />
    </group>
  );
}
