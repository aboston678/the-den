import type { BearAction, FishState } from "@den/shared";

/** A bear's fishing, as the server reports it (GAME_SPEC §13). */
export interface FishView {
  rod: boolean;
  state: FishState;
  lureX: number;
  lureZ: number;
  tension: number;
  line: number;
  surges: number;
  species: string;
  weight: number;
}

// Other bears in the party, as received from the server. Updated by net/party.ts on every
// state patch; read every frame by game/remote/RemoteBears.tsx. Plain objects (not React
// state) because they change 20 times a second.

export interface Snapshot {
  t: number; // performance.now() when it arrived
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  action: BearAction;
  flashlight: boolean;
  aimYaw: number;
  aimPitch: number;
  wheelie: number;
}

/** A player's part in the bear hunt, as the server reports it (Andrew, 2026-10-17). */
export interface HuntView {
  role: "" | "bear" | "hunter";
  gun: string;
  scoped: boolean;
  downUntil: number;
}
export const NO_HUNT: HuntView = { role: "", gun: "", scoped: false, downUntil: 0 };

export interface RemoteBear {
  id: string;
  name: string;
  connected: boolean;
  snapshots: Snapshot[];
  /** Where the bear is drawn this frame (interpolated), written by RemoteBears. */
  current: { x: number; y: number; z: number; speed: number; action: BearAction; flashlight: boolean; aimYaw: number; aimPitch: number; wheelie: number };
  tagVisible: boolean;
  fish: FishView;
  hunt: HuntView;
  /** Not drawn: they're outside the bear hunt we're in. */
  hidden?: boolean;
}

export const remotes = new Map<string, RemoteBear>();

/** Keep about a second of history; interpolation renders ~100 ms in the past. */
const KEEP_MS = 1000;

export function addSnapshot(bear: RemoteBear, s: Omit<Snapshot, "t">) {
  const t = performance.now();
  bear.snapshots.push({ t, ...s });
  while (bear.snapshots.length > 2 && bear.snapshots[0]!.t < t - KEEP_MS) bear.snapshots.shift();
}
