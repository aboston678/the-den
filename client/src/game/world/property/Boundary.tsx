import { BOUNDS, DOCK, STREAM, streamCenter } from "@den/shared";
import { useRapier } from "@react-three/rapier";
import { useEffect } from "react";
import { invisibleColliders } from "../invisible.ts";
import { removeBody } from "../physics.ts";

// Invisible walls (GAME_SPEC §4): around the map ~10 m inside its edge (hidden by thick woods and
// fog), and in the stream 3 m out from our shore so only the shallow strip is wadeable. The
// wading wall has a gap where the dock crosses it (the dock has its own rails).

const HEIGHT = 40;

export function Boundary() {
  const { world, rapier } = useRapier();
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    const handles: number[] = [];
    const box = (hx: number, hy: number, hz: number, x: number, y: number, z: number, yaw = 0) => {
      const c = world.createCollider(
        rapier.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
        body,
      );
      invisibleColliders.add(c.handle);
      handles.push(c.handle);
    };
    const { minX, maxX, minZ, maxZ } = BOUNDS;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, hx = (maxX - minX) / 2, hz = (maxZ - minZ) / 2;
    box(hx, HEIGHT, 0.5, cx, 0, minZ - 0.5);
    box(hx, HEIGHT, 0.5, cx, 0, maxZ + 0.5);
    box(0.5, HEIGHT, hz, minX - 0.5, 0, cz);
    box(0.5, HEIGHT, hz, maxX + 0.5, 0, cz);

    // Along the stream, following its curve in 2 m pieces.
    const gap = DOCK.width / 2 + 0.1;
    for (let z = minZ; z < maxZ; z += 2) {
      const z1 = z + 2;
      if (z1 > DOCK.z - gap && z < DOCK.z + gap) continue;
      const x0 = streamCenter(z) + STREAM.wadeLimitD, x1 = streamCenter(z1) + STREAM.wadeLimitD;
      const len = Math.hypot(x1 - x0, 2);
      box(0.25, 6, len / 2 + 0.05, (x0 + x1) / 2 + 0.25, STREAM.waterY, (z + z1) / 2, Math.atan2(x1 - x0, 2));
    }
    // Close the dock gap from the sides of the dock down to the stream bed.
    const xd = streamCenter(DOCK.z) + STREAM.wadeLimitD + 0.25;
    for (const side of [-1, 1]) {
      const zEdge = DOCK.z + side * gap, zFar = DOCK.z + side * 1.1 * 2;
      box(0.25, 6, Math.abs(zFar - zEdge) / 2 + 0.1, xd, STREAM.waterY, (zEdge + zFar) / 2);
    }
    return () => {
      for (const h of handles) invisibleColliders.delete(h);
      removeBody(world, body);
    };
  }, [world, rapier]);
  return null;
}
