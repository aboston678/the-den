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
}

export interface RemoteBear {
  id: string;
  name: string;
  connected: boolean;
  snapshots: Snapshot[];
  /** Where the bear is drawn this frame (interpolated), written by RemoteBears. */
  current: { x: number; y: number; z: number; speed: number; action: BearAction; flashlight: boolean; aimYaw: number; aimPitch: number };
  tagVisible: boolean;
  fish: FishView;
}

export const remotes = new Map<string, RemoteBear>();

/** Keep about a second of history; interpolation renders ~100 ms in the past. */
const KEEP_MS = 1000;

export function addSnapshot(bear: RemoteBear, s: Omit<Snapshot, "t">) {
  const t = performance.now();
  bear.snapshots.push({ t, ...s });
  while (bear.snapshots.length > 2 && bear.snapshots[0]!.t < t - KEEP_MS) bear.snapshots.shift();
}
