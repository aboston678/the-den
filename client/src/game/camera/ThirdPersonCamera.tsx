import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useEffect } from "react";
import { type PerspectiveCamera, Vector3 } from "three";
import { CAMERA } from "../config.ts";
import { approach } from "../player/movement.ts";
import { cameraState, playerState } from "../state.ts";

const target = new Vector3();
const offset = new Vector3();

/**
 * Third-person camera behind and above the bear (GAME_SPEC §5.3): click to capture the mouse
 * (pointer lock) and look around, scroll to zoom 2–6 m. Pulls in instantly when a wall would
 * block the view and eases back out afterwards.
 */
export function ThirdPersonCamera() {
  const { camera, gl } = useThree();
  const { world, rapier } = useRapier();

  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    cam.fov = CAMERA.fov;
    cam.near = 0.1;
    cam.updateProjectionMatrix();
    cameraState.distance = CAMERA.distance;
    cameraState.current = CAMERA.distance;

    const canvas = gl.domElement;
    const lock = () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    };
    const look = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      cameraState.yaw -= e.movementX * CAMERA.sensitivity;
      cameraState.pitch = Math.min(CAMERA.maxPitch, Math.max(CAMERA.minPitch, cameraState.pitch + e.movementY * CAMERA.sensitivity));
    };
    const zoom = (e: WheelEvent) => {
      e.preventDefault();
      cameraState.distance = Math.min(CAMERA.maxDistance, Math.max(CAMERA.minDistance, cameraState.distance + e.deltaY * 0.004));
    };
    canvas.addEventListener("click", lock);
    window.addEventListener("mousemove", look);
    canvas.addEventListener("wheel", zoom, { passive: false });
    return () => {
      canvas.removeEventListener("click", lock);
      window.removeEventListener("mousemove", look);
      canvas.removeEventListener("wheel", zoom);
    };
  }, [camera, gl]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const { yaw, pitch } = cameraState;
    target.copy(playerState.position).y += CAMERA.targetHeight;
    offset.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

    // How far back can we go before hitting something (ignoring the bear itself)?
    const ray = new rapier.Ray(target, offset);
    const hit = world.castRay(ray, cameraState.distance + CAMERA.wallPadding, true, undefined, undefined, undefined, undefined,
      (c) => c.handle !== playerState.colliderHandle);
    const allowed = hit ? Math.max(0.4, hit.timeOfImpact - CAMERA.wallPadding) : cameraState.distance;
    cameraState.current = allowed < cameraState.current ? allowed : approach(cameraState.current, allowed, 3 * dt);

    camera.position.copy(target).addScaledVector(offset, cameraState.current);
    camera.lookAt(target);
    if (cameraState.shake > 0) {
      const a = 0.12 * Math.min(1, cameraState.shake / 0.5);
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
      cameraState.shake = Math.max(0, cameraState.shake - dt);
    }
  });

  return null;
}
