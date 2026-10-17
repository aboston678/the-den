import { type GunId, type HuntPhase, type HuntResult, type HuntRole, isGun } from "@den/shared";
import { create } from "zustand";

// What the browser knows about the bear hunt (Andrew, 2026-10-17), filled from the party room by
// net/party.ts: the circle, the hunt, who is what, and our own guns. The bear's hiding spot only
// ever reaches the bear (huntWarp).

export interface MyGuns {
  gun: GunId | "";
  guns: GunId[];
  scoped: GunId[];
  ammo: number;
  /** Reloading / knocked down until then (server ms). */
  reloadUntil: number;
  downUntil: number;
}

export interface ShotNews {
  id: string;
  gun: GunId;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  hit: boolean;
  at: number;
  mine: boolean;
}

export interface HuntStore {
  phase: HuntPhase;
  /** Session ids ready in the circle. */
  ready: string[];
  countdownEnd: number;
  startedAt: number;
  endsAt: number;
  bearId: string;
  bearHealth: number;
  result: HuntResult | null;
  /** Server clock minus ours (ms), from the hunt's `now`. */
  offset: number;
  /** Everyone's role ("" = not in a hunt). */
  roles: Record<string, HuntRole>;
  me: MyGuns;
  /** Where the server sent us to hide (the bear only), for the "You're hiding in …" note. */
  spot: string;
  /** Recent shots (newest last), for tracers and hit markers. */
  shots: ShotNews[];
  /** When our own shot last hit the bear (performance.now), for the hit marker. */
  hitAt: number;
  /** The locker panel is open. */
  lockerOpen: boolean;
}

const NO_GUNS: MyGuns = { gun: "", guns: [], scoped: [], ammo: 0, reloadUntil: 0, downUntil: 0 };

const initial = (): HuntStore => ({
  phase: "idle", ready: [], countdownEnd: 0, startedAt: 0, endsAt: 0, bearId: "", bearHealth: 100, result: null, offset: 0,
  roles: {}, me: NO_GUNS, spot: "", shots: [], hitAt: 0, lockerOpen: false,
});

export const useHunt = create<HuntStore>(initial);
export const resetHunt = () => useHunt.setState(initial());

/** The server's clock now (ms since 1970). */
export const serverNow = () => Date.now() + useHunt.getState().offset;

export const gunList = (s: string): GunId[] => (s ? s.split(",").filter(isGun) : []);

/** Is a hunt running with this player in it? */
export const roleOf = (id: string): HuntRole => (useHunt.getState().phase === "live" ? (useHunt.getState().roles[id] ?? "") : "");

/** Our own role in the running hunt ("" outside one). */
export function myRole(me: string): HuntRole {
  return roleOf(me);
}

/** Seconds the bear has lasted so far. */
export function huntSeconds() {
  const h = useHunt.getState();
  if (h.phase !== "live") return h.result?.seconds ?? 0;
  return Math.max(0, (serverNow() - h.startedAt) / 1000);
}
