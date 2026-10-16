import { onTrackRoad } from "./track.ts";
import { HOUSE_FOOTPRINT, houseToWorld, onPavement } from "./world/layout.ts";

// The motorcycle (Andrew, 2026-10-16): a red sport bike parked in the garage. Every bear can ride
// one of their own: E by the garage bike takes one (a fresh one is always waiting), E while riding
// parks it where you are, and E next to your parked bike gets back on. Riding is client-authoritative
// like walking; the server only allows the speed while the bear is on a bike.

/** Where the garage bike stands (world metres, garage floor), facing out of the south garage door (west). */
export const GARAGE_BIKE = (() => {
  const w = houseToWorld(3.0, 6.2);
  return { x: w.x, y: 0, z: w.z, yaw: -Math.PI / 2 };
})();

/** How close (metres) a bear must be to a bike to get on it. */
export const BIKE_REACH = 2.4;

export const BIKE = {
  /** Top speeds (m/s) by surface: the driveway and other paving, grass and woods, under a roof. */
  roadSpeed: 26,
  groundSpeed: 13,
  indoorSpeed: 6,
  /** The racetrack's asphalt (R2.6): ~180 km/h. */
  trackSpeed: 50,
  /** Holding Shift (tucked in): a little more top speed. */
  tuck: 1.12,
  reverseSpeed: 2.5,
  /** m/s²: throttle at low speed (it tapers toward top speed), brakes, rolling to a stop with no throttle. */
  accel: 11,
  brake: 20,
  coast: 2.5,
  /** Turn rate (rad/s) at walking pace; it falls as the bike speeds up. */
  turnRate: 2.1,
  /** Can only get off below this speed (m/s). */
  stopSpeed: 3,
} as const;

/** The fastest any bike can go: the server's speed check allows this while riding. */
export const BIKE_MAX_SPEED = BIKE.trackSpeed * BIKE.tuck;

/** Turn rate (rad/s) at a speed: tight at a crawl, wide at full tilt. */
export const bikeTurnRate = (speed: number) => BIKE.turnRate / (1 + Math.abs(speed) / 9);

const GARAGE = (() => {
  const a = houseToWorld(0, 0), b = houseToWorld(7.5, 8.5);
  return { minX: a.x, minZ: a.z, maxX: b.x, maxZ: b.z };
})();
const inRect = (r: { minX: number; minZ: number; maxX: number; maxZ: number }, x: number, z: number, m = 0) =>
  x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m;

/** True in the garage (riding slowly is fine in there). */
export const inGarage = (x: number, z: number) => inRect(GARAGE, x, z);

/** True where a bike can't go: the house, porch, deck and greenhouse (everything but the garage). */
export function bikeBlocked(x: number, z: number) {
  if (inRect(GARAGE, x, z, 0.6)) return false; // the garage, and through its doorways (its walls stop the bike anyway)
  return HOUSE_FOOTPRINT.some((r) => inRect(r, x, z, 0.3));
}

/** Top speed at (x, z). `onTrack` = on the racetrack's asphalt (R2.6). */
export function bikeTopSpeed(x: number, z: number, onTrack = false) {
  if (onTrack) return BIKE.trackSpeed;
  if (inGarage(x, z)) return BIKE.indoorSpeed;
  return onPavement(x, z, 0.5) || onTrackRoad(x, z) ? BIKE.roadSpeed : BIKE.groundSpeed;
}

/**
 * One step of the bike's speed (m/s, negative = backing up) from the throttle (W), brake (S) and
 * tuck (Shift), toward the top speed for where it is.
 */
export function bikeSpeedStep(speed: number, dt: number, input: { throttle: boolean; brake: boolean; tuck: boolean }, top: number) {
  const max = top * (input.tuck ? BIKE.tuck : 1);
  if (input.throttle && speed >= -0.1) {
    // Strong pull from a standstill, easing off toward top speed; over it (rolled off the track), slow down.
    if (speed > max) return Math.max(max, speed - BIKE.brake * 0.5 * dt);
    return Math.min(max, speed + BIKE.accel * (1 - 0.7 * (speed / max)) * dt);
  }
  if (input.brake) {
    if (speed > 0.1) return Math.max(0, speed - BIKE.brake * dt);
    return Math.max(-BIKE.reverseSpeed, speed - 3 * dt); // stopped: holding S backs up slowly
  }
  if (input.throttle && speed < -0.1) return Math.min(0, speed + BIKE.brake * dt);
  const coast = BIKE.coast + (speed > max ? BIKE.brake * 0.5 : 0);
  return speed > 0 ? Math.max(0, speed - coast * dt) : Math.min(0, speed + coast * dt);
}
