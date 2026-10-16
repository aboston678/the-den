// Per-frame game state shared between the player and the camera. Plain mutable objects
// (not React state) because they change every frame.
import { Vector3 } from "three";
import { CLIP } from "./config.ts";
import { remotes } from "../net/remotes.ts";
import { serverPosition, setDevTime, usePartyStore } from "../net/party.ts";
import { audioLevel, audioState, played, recent as recentSounds } from "./audio/audio.ts";
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
  /** Bowling (GAME_SPEC §15): keep the bear on this spot facing this way (WASD, jump, dance off). */
  hold: null as { x: number; z: number; yaw: number } | null,
  /** Catan (GAME_SPEC §16): sit in this chair (the player walks in, sits, and stands back up when it's cleared). */
  seat: null as import("@den/shared").CatanSeat | null,
  /** True while the bear is in a chair (sitting down, seated, or getting up). */
  seated: false,
  /** On the motorcycle (set by bike/BikeControls once the server agrees): W/S/A/D ride it. */
  riding: false,
  /** Bowling: play the bowl now (set by the bowling controls; the player clears it). */
  bowlRequest: false,
  /** Bowling: set by the player when the ball leaves the paw; the bowling controls clear it. */
  bowlReleased: false,
  /** Play the celebrate clip now (a strike). */
  celebrateRequest: false,
  /** Screenshot helper: hide your own bear (it fills the frame in tight rooms). */
  hidden: false,
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
  /** A fixed shot instead of following the bear (bowling): camera position and where it looks, world metres. */
  override: null as { from: Vector3; look: Vector3 } | null,
  /** While set, mouse movement goes here instead of turning the camera (bowling aim). */
  mouse: null as ((dx: number, dy: number) => void) | null,
  /** The mouse pointer is free for clicking on things (the Catan board): no capturing it, and letting it go doesn't pause. */
  freeMouse: false,
  /** Extra field of view (degrees) for a sense of speed on the motorcycle. */
  fovKick: 0,
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
      /** Sound: is it running, the last one-shots played, and how many times each has played. */
      audio: () => { state: string; recent: string[]; played: Record<string, number> };
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
      /** Bowling (Phase 3): lanes as this client sees them, plus dev/test controls (bowling/dev.ts). */
      bowl?: import("./bowling/dev.ts").BowlDev;
      /** Catan (Phase 4): the table as this client sees it, plus test controls (catan/dev.ts). */
      catan?: import("./catan/dev.ts").CatanDev;
      c4?: import("./connect4/dev.ts").C4Dev;
      bike?: { state: () => { riding: boolean; speed: number; prompt: string | null; me: import("./bike/store.ts").BikeView; others: Record<string, import("./bike/store.ts").BikeView> } };
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
  audio: () => ({ state: audioState(), recent: recentSounds.map((s) => s.name), played: { ...played } }),
  audioLevel,
  sky: () => {
    const { phase, daylight, exteriorLights } = currentLook.sky;
    return { phase, daylight, exteriorLights };
  },
  doors: () => ({ ...usePartyStore.getState().doors }),
};
