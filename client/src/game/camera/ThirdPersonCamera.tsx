import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useEffect } from "react";
import { type PerspectiveCamera, Vector3 } from "three";
import { CAMERA } from "../config.ts";
import { approach } from "../player/movement.ts";
import { cameraState, playerState } from "../state.ts";
import { invisibleColliders } from "../world/invisible.ts";
import { settings } from "../../ui/settings.ts";
import { fullscreenIfWanted } from "../../ui/fullscreen.ts";

const target = new Vector3();
const offset = new Vector3();
const side = new Vector3();
/** Eased 0…1: how far over the shoulder we are (bear hunt aiming). */
let shoulder = 0;
/** Over the shoulder: this far to the right, this close behind, this much narrower a view. */
const SHOULDER = { right: 0.55, distance: 1.7, height: 1.55, narrow: 1.35 } as const;
/** Through a scope: the eye's height above the feet. */
const EYE_HEIGHT = 1.62;
/** Where the camera is looking, eased toward a shot's look-at point. */
const looking = new Vector3();
let wasOverride = false;

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
      fullscreenIfWanted(); // Esc left full screen; a click on the game goes back (if that's the setting)
      if (document.pointerLockElement !== canvas && !cameraState.freeMouse) void Promise.resolve(canvas.requestPointerLock?.()).catch(() => {}); // may be refused; the next click tries again
    };
    const look = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      if (cameraState.mouse) return cameraState.mouse(e.movementX, e.movementY);
      const { sensitivity, invertY } = settings();
      const k = CAMERA.sensitivity * sensitivity;
      cameraState.yaw -= e.movementX * k;
      cameraState.pitch = Math.min(CAMERA.maxPitch, Math.max(CAMERA.minPitch, cameraState.pitch + e.movementY * k * (invertY ? -1 : 1)));
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
    // Speed widens the view a little on the motorcycle.
    const cam = camera as PerspectiveCamera;
    shoulder = approach(shoulder, cameraState.aim === 1 ? 1 : 0, 6 * dt);
    const scoped = cameraState.aim === 2 && !cameraState.override;
    const wantFov = scoped ? CAMERA.fov / Math.max(1, cameraState.zoom) : (CAMERA.fov + cameraState.fovKick) / (1 + (SHOULDER.narrow - 1) * shoulder);
    const fov = scoped ? wantFov : approach(cam.fov, wantFov, 40 * dt);
    if (fov !== cam.fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    // A set shot (bowling): ease there, then hold it.
    const shot = cameraState.override;
    if (shot) {
      if (!wasOverride) looking.copy(playerState.position).y += CAMERA.targetHeight; // start from where the bear camera looked
      const k = 1 - Math.exp(-5 * dt);
      camera.position.lerp(shot.from, k);
      looking.lerp(shot.look, k);
      camera.lookAt(looking);
      wasOverride = true;
      return;
    }
    wasOverride = false;
    const { yaw, pitch } = cameraState;
    offset.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    if (scoped) {
      // Through the scope: at the hunter's eye, looking where the camera looks.
      camera.position.copy(playerState.position).y += EYE_HEIGHT;
      camera.position.addScaledVector(offset, -0.15);
      camera.lookAt(target.copy(camera.position).addScaledVector(offset, -10));
      return;
    }
    target.copy(playerState.position).y += CAMERA.targetHeight + (SHOULDER.height - CAMERA.targetHeight) * shoulder;
    // Over the right shoulder while aiming.
    side.set(-Math.cos(yaw), 0, Math.sin(yaw));
    target.addScaledVector(side, -SHOULDER.right * shoulder);

    // How far back can we go before hitting something (ignoring the bear itself)?
    const ray = new rapier.Ray(target, offset);
    const hit = world.castRay(ray, cameraState.distance + CAMERA.wallPadding, true, undefined, undefined, undefined, undefined,
      (c) => c.handle !== playerState.colliderHandle && !invisibleColliders.has(c.handle));
    const back = cameraState.distance + (SHOULDER.distance - cameraState.distance) * shoulder;
    const allowed = hit ? Math.max(0.4, Math.min(back, hit.timeOfImpact - CAMERA.wallPadding)) : back;
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
