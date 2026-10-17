// Bear hunt (Andrew, 2026-10-17): one random bear hides, everyone else hunts it with guns from the
// basement locker. The bear's points double every full minute it stays alive; 10 minutes wins.
// Pure rules shared by the browser and the game server.

export type HuntPhase = "idle" | "countdown" | "live" | "over";
export type HuntRole = "" | "bear" | "hunter";

export const GUNS = ["sniper", "pistol", "ar", "shotgun"] as const;
export type GunId = (typeof GUNS)[number];
export const isGun = (v: unknown): v is GunId => GUNS.includes(v as GunId);

export interface Gun {
  name: string;
  /** Health taken off the bear per hit (the bear has 100): sniper 1 hit, pistol 3, AR 2, shotgun 1. */
  damage: number;
  /** Rounds in the magazine (reserve is unlimited). */
  mag: number;
  /** Fastest time between shots, seconds. */
  interval: number;
  /** Seconds to reload. */
  reload: number;
  /** Hold the trigger to keep firing. */
  auto: boolean;
  /** Furthest a hit counts, metres. */
  range: number;
  /** Rays per shot (the shotgun's pellets). */
  pellets: number;
  /** Random spread, radians: from the hip, aimed over the shoulder, and through a scope. */
  spread: { hip: number; aim: number; scope: number };
  /** Field-of-view divisor through the scope. */
  zoom: number;
}

export const GUN: Record<GunId, Gun> = {
  sniper: { name: "Sniper rifle", damage: 100, mag: 1, interval: 1.2, reload: 2.5, auto: false, range: 450, pellets: 1, spread: { hip: 0.03, aim: 0.008, scope: 0 }, zoom: 6 },
  pistol: { name: "Pistol", damage: 34, mag: 12, interval: 0.18, reload: 1.5, auto: false, range: 90, pellets: 1, spread: { hip: 0.03, aim: 0.012, scope: 0.006 }, zoom: 2 },
  ar: { name: "AR", damage: 50, mag: 30, interval: 0.1, reload: 2, auto: true, range: 220, pellets: 1, spread: { hip: 0.035, aim: 0.014, scope: 0.006 }, zoom: 3 },
  shotgun: { name: "Shotgun", damage: 100, mag: 6, interval: 0.85, reload: 3, auto: false, range: 30, pellets: 8, spread: { hip: 0.07, aim: 0.055, scope: 0.045 }, zoom: 2 },
};

export const BEAR_HEALTH = 100;
/** Seconds the bear has to survive to win. */
export const HUNT_LIMIT_S = 600;
/** Seconds from everyone being ready to the hunt starting. */
export const HUNT_COUNTDOWN_S = 5;
/** Seconds the results stay up before the circle is open again. */
export const HUNT_RESULTS_S = 12;
export const HUNT_MIN_PLAYERS = 2;

/** The bear's swipe: reach, how long the hunter stays down, and the wait between swipes. */
export const SWIPE = { reach: 2.5, downS: 3, cooldownS: 5, arc: 1.2 } as const;

/** Points for staying alive this long: 0 under a minute, then 1, 2, 4, 8 … per full minute (512 at 10). */
export function bearPoints(seconds: number): number {
  const minutes = Math.floor(Math.min(seconds, HUNT_LIMIT_S) / 60);
  return minutes < 1 ? 0 : 2 ** (minutes - 1);
}

/** What a hunter carries: which guns, which have a scope, rounds left in each. */
export interface Loadout {
  guns: GunId[];
  scoped: GunId[];
  ammo: Partial<Record<GunId, number>>;
  gun: GunId | "";
}

/** Hunters start with the scoped sniper (Andrew). */
export const startLoadout = (): Loadout => ({ guns: ["sniper"], scoped: ["sniper"], ammo: { sniper: GUN.sniper.mag }, gun: "sniper" });

/** How the hunt ended. */
export interface HuntResult {
  /** "shot": the bear was taken down; "survived": 10 minutes; "bearLeft" / "huntersLeft": a side emptied. */
  how: "shot" | "survived" | "bearLeft" | "huntersLeft";
  bearId: string;
  bearName: string;
  /** Seconds the bear lasted and the points it keeps (pointsAtEnd). */
  seconds: number;
  points: number;
  /** The hunter who landed the final hit. */
  byId?: string;
  byName?: string;
  byGun?: GunId;
}

/**
 * Points the bear keeps at the end. Shot: what it had banked by then (the full minutes it lasted);
 * survived: 512; bear left: what it had banked; hunters left: what it had banked.
 */
export const pointsAtEnd = (how: HuntResult["how"], seconds: number) => (how === "survived" ? bearPoints(HUNT_LIMIT_S) : bearPoints(seconds));
