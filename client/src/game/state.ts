// Per-frame game state shared between the player and the camera. Plain mutable objects
// (not React state) because they change every frame.
import { Vector3 } from "three";
import { CLIP } from "./config.ts";
import { remotes } from "../net/remotes.ts";
import { groundY } from "./world/ground.ts";

export const playerState = {
  position: new Vector3(), // feet position
  /** Facing angle: the bear faces (sin yaw, cos yaw) on x/z. */
  yaw: Math.PI,
  speed: 0,
  /** Seconds of game time simulated so far (slower than wall time below 10 fps). */
  gameTime: 0,
  grounded: true,
  action: "locomotion" as BearAction,
  /** Rapier handle of the player's capsule, so the camera's wall check can ignore it. */
  colliderHandle: -1,
  /**
   * Set to move the bear instantly (spawning, dev/test helper); the player clears it. Yaw also turns
   * the bear and camera. A NaN height means "land on the highest surface there".
   */
  teleportTo: null as { x: number; y: number; z: number; yaw?: number } | null,
  /** Test helper: when true, the player records its toe positions each frame (foot-slide check). */
  trackFeet: false,
  feet: [new Vector3(), new Vector3()] as [Vector3, Vector3],
};

export const cameraState = {
  yaw: 0,
  pitch: 0.25,
  distance: 3.5,
  /** Actual distance after pulling in for walls. */
  current: 3.5,
  /** Seconds of camera shake left (roars nearby, getting shoved). */
  shake: 0,
};

export type BearAction = "locomotion" | "jump" | "fall" | "roar" | "dance";

declare global {
  interface Window {
    /** Debug/test handle (read-only snapshot of game state). */
    __den?: {
      player: typeof playerState;
      camera: typeof cameraState;
      teleport: (x: number, z: number, y?: number) => void;
      /** Ground height at (x, z) on the current map. */
      ground: (x: number, z: number) => number;
      /** Clip timing constants, writable for live tuning in dev tools. */
      clip: typeof CLIP;
      /** Other bears as this client sees them. */
      remotes: () => { id: string; name: string; x: number; z: number; action: string; tagVisible: boolean; connected: boolean }[];
    };
  }
}
window.__den = {
  player: playerState,
  camera: cameraState,
  clip: CLIP,
  remotes: () =>
    [...remotes.values()].map((r) => ({
      id: r.id,
      name: r.name,
      x: r.current.x,
      z: r.current.z,
      action: r.current.action,
      tagVisible: r.tagVisible,
      connected: r.connected,
    })),
  teleport: (x, z, y = Number.NaN) => {
    playerState.teleportTo = { x, y, z }; // NaN height: the player drops onto whatever is there
  },
  ground: groundY,
};
