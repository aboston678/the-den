import { HUNT_CIRCLE } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, DoubleSide, type Mesh, type MeshBasicMaterial } from "three";
import { groundY } from "../world/ground.ts";
import { useHunt } from "./store.ts";

// The glowing blue circle by the dock where bears ready up for a bear hunt (Andrew, 2026-10-17): a
// bright ring on the ground and a soft curtain of light rising from it, pulsing faster in the
// countdown. Two draws, no lights.

function curtainTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, "rgba(255,255,255,0)"); // top
  g.addColorStop(1, "rgba(255,255,255,1)"); // ground
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  return new CanvasTexture(c);
}

export function HuntCircle() {
  const ring = useRef<Mesh>(null);
  const curtain = useRef<Mesh>(null);
  const y = useMemo(() => {
    let lo = Infinity;
    for (let a = 0; a < Math.PI * 2; a += 0.4) lo = Math.min(lo, groundY(HUNT_CIRCLE.x + Math.cos(a) * HUNT_CIRCLE.r, HUNT_CIRCLE.z + Math.sin(a) * HUNT_CIRCLE.r));
    return Math.min(lo, groundY(HUNT_CIRCLE.x, HUNT_CIRCLE.z));
  }, []);
  const tex = useMemo(curtainTexture, []);

  useFrame(({ clock }) => {
    const phase = useHunt.getState().phase;
    const t = clock.elapsedTime;
    const pulse = phase === "countdown" ? 0.5 + 0.5 * Math.sin(t * 9) : 0.5 + 0.5 * Math.sin(t * 2);
    const dim = phase === "live" ? 0.35 : 1;
    if (ring.current) (ring.current.material as MeshBasicMaterial).opacity = (0.65 + 0.35 * pulse) * dim;
    if (curtain.current) (curtain.current.material as MeshBasicMaterial).opacity = (0.22 + 0.18 * pulse) * dim;
  });

  // The ground slopes a little: the curtain starts a touch below the lowest point and the ring floats just above each point by being thick.
  return (
    <group position={[HUNT_CIRCLE.x, y, HUNT_CIRCLE.z]} name="hunt-circle">
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.06} renderOrder={2}>
        <ringGeometry args={[HUNT_CIRCLE.r - 0.18, HUNT_CIRCLE.r, 96]} />
        <meshBasicMaterial color="#3fa9ff" transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
      <mesh ref={curtain} position-y={0.7} renderOrder={2}>
        <cylinderGeometry args={[HUNT_CIRCLE.r, HUNT_CIRCLE.r, 1.6, 64, 1, true]} />
        <meshBasicMaterial color="#5bb8ff" map={tex} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}
