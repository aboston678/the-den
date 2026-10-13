// Per-frame game state shared between the player and the camera. Plain mutable objects
// (not React state) because they change every frame.
import { Vector3 } from "three";
import { CLIP } from "./config.ts";
import { remotes } from "../net/remotes.ts";
import { serverPosition, setDevTime, usePartyStore } from "../net/party.ts";
import { audioLevel, audioState, recent as recentSounds } from "./audio/audio.ts";
import { gameClock } from "./sky/clock.ts";
import { current as currentLook } from "./sky/look.ts";
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
  /** Flashlight on (F). */
  flashlight: false,
  /** Rapier handle of the player's capsule, so the camera's wall check can ignore it. */
  colliderHandle: -1,
  /**
   * Set to move the bear instantly (spawning, dev/test helper); the player clears it. Yaw also turns
   * the bear and camera. A NaN height means "land on the highest surface there".
   */
  teleportTo: null as { x: number; y: number; z: number; yaw?: number } | null,
  /** Fishing: cast to this point on the water (set by the fishing controls; the player plays the cast and sends it). */
  castRequest: null as { x: number; z: number } | null,
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

export type { BearAction } from "@den/shared";
import type { BearAction } from "@den/shared";

declare global {
  interface Window {
    /** Debug/test handle (read-only snapshot of game state). */
    __den?: {
      player: typeof playerState;
      camera: typeof cameraState;
      teleport: (x: number, z: number, y?: number) => void;
      /** Ground height at (x, z) on the current map. */
      ground: (x: number, z: number) => number;
      /** Where the server has our bear. */
      serverPosition: () => { x: number; y: number; z: number } | null;
      /** Seconds into the day/night cycle, as this client sees it. */
      time: () => number;
      /** Jump the party's clock to a time or a preset name ("dusk", "night", …). Dev only. */
      setTime: (time: number | string) => void;
      /** Sound: is it running, and the last one-shots played. */
      audio: () => { state: string; recent: string[] };
      /** Loudness of the mix right now (dB). */
      audioLevel: () => { rms: number; peak: number };
      /** The sky as this client last drew it. */
      sky: () => { phase: string; daylight: number; exteriorLights: number };
      /** Door id -> open, as this client sees it. */
      doors: () => Record<string, boolean>;
      /** Clip timing constants, writable for live tuning in dev tools. */
      clip: typeof CLIP;
      /** Frame rate, draw calls, triangles, texture memory (set by PerfProbe). */
      perf?: () => { fps: number; p95ms: number; calls: number; triangles: number; textureMB: number; programs: number; pixelRatio: number; size: string };
      perfBreakdown?: () => string[];
      programNames?: () => string[];
      /** Other bears as this client sees them. */
      remotes: () => { id: string; name: string; x: number; z: number; action: string; flashlight: boolean; tagVisible: boolean; connected: boolean; fish: { rod: boolean; state: string; species: string } }[];
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
      flashlight: r.current.flashlight,
      tagVisible: r.tagVisible,
      connected: r.connected,
      fish: { rod: r.fish.rod, state: r.fish.state, species: r.fish.species },
    })),
  teleport: (x, z, y = Number.NaN) => {
    playerState.teleportTo = { x, y, z }; // NaN height: the player drops onto whatever is there
  },
  ground: groundY,
  serverPosition,
  time: gameClock,
  setTime: setDevTime,
  audio: () => ({ state: audioState(), recent: recentSounds.map((s) => s.name) }),
  audioLevel,
  sky: () => {
    const { phase, daylight, exteriorLights } = currentLook.sky;
    return { phase, daylight, exteriorLights };
  },
  doors: () => ({ ...usePartyStore.getState().doors }),
};
