// The game server's sanity check on a hit a hunter's browser reports (bear hunt, 2026-10-17). The
// shooter's browser casts the ray (walls, trees and the ground stop it) and says where it hit the bear;
// the server checks that story against where it knows the shooter and the bear are.

import { GUN, type GunId, SWIPE } from "./rules.ts";

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface ShotClaim {
  gun: GunId;
  /** Where the ray started (the camera, up to ~6 m behind the hunter) and its direction. */
  from: V3;
  dir: V3;
  /** Where it hit the bear (only when the browser says it hit). */
  hit?: V3;
}

/** Furthest the ray's start may be from the hunter (the camera zooms out to 6 m, plus lag). */
export const SHOT_ORIGIN_SLACK = 8;
/** The bear's capsule (2.1 m tall, ~0.45 m radius) plus slack for lag at its speed. */
const BEAR_RADIUS = 0.6, BEAR_TOP = 2.4, BEAR_BOTTOM = -0.3, LAG_S = 0.35;

const finite = (v: V3 | undefined): v is V3 => !!v && [v.x, v.y, v.z].every((n) => typeof n === "number" && Number.isFinite(n));

/** Parse and normalise a shot message; null if it isn't one. */
export function parseShot(raw: unknown): ShotClaim | null {
  const m = (raw ?? {}) as Record<string, unknown>;
  const gun = m.gun as GunId;
  if (!(gun in GUN)) return null;
  const from = m.from as V3, dir = m.dir as V3, hit = m.hit as V3 | undefined;
  if (!finite(from) || !finite(dir)) return null;
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (len < 1e-6) return null;
  return { gun, from: { ...from }, dir: { x: dir.x / len, y: dir.y / len, z: dir.z / len }, hit: finite(hit) ? { ...hit } : undefined };
}

/**
 * Does a claimed hit hold up? The shot must start near the hunter, the hit must be inside the bear
 * (allowing for its movement since), within the gun's range, and on the ray.
 */
export function checkHit(shot: ShotClaim, shooter: V3, bear: V3 & { speed: number }): boolean {
  const h = shot.hit;
  if (!h) return false;
  if (Math.hypot(shot.from.x - shooter.x, shot.from.y - shooter.y, shot.from.z - shooter.z) > SHOT_ORIGIN_SLACK) return false;
  const slack = BEAR_RADIUS + 0.5 + Math.min(bear.speed, 30) * LAG_S;
  if (Math.hypot(h.x - bear.x, h.z - bear.z) > slack) return false;
  if (h.y < bear.y + BEAR_BOTTOM - 0.5 || h.y > bear.y + BEAR_TOP + 0.5) return false;
  if (Math.hypot(h.x - shooter.x, h.y - shooter.y, h.z - shooter.z) > GUN[shot.gun].range + 5) return false;
  // The hit point must lie on the ray (within half a metre of it, and in front).
  const vx = h.x - shot.from.x, vy = h.y - shot.from.y, vz = h.z - shot.from.z;
  const t = vx * shot.dir.x + vy * shot.dir.y + vz * shot.dir.z;
  if (t <= 0) return false;
  const off = Math.hypot(vx - shot.dir.x * t, vy - shot.dir.y * t, vz - shot.dir.z * t);
  return off <= 0.5;
}

/** Can the bear at `bear` (facing yaw) swipe the hunter at `hunter`? Within reach (+ lag) and in front. */
export function canSwipe(bear: V3 & { yaw: number }, hunter: V3): boolean {
  const dx = hunter.x - bear.x, dz = hunter.z - bear.z;
  const d = Math.hypot(dx, dz);
  if (d > SWIPE.reach + 1 || Math.abs(hunter.y - bear.y) > 1.8) return false;
  if (d < 0.8) return true;
  const ang = Math.atan2(dx, dz) - bear.yaw;
  const wrapped = Math.atan2(Math.sin(ang), Math.cos(ang));
  return Math.abs(wrapped) <= SWIPE.arc;
}
