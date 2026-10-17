import { inTrackArea } from "./track.ts";
import { HOUSE_FOOTPRINT, houseToWorld } from "./world/layout.ts";

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
  /** Top speeds (m/s): out on the property (road or grass alike, Andrew round 3), under a roof. */
  roadSpeed: 26,
  indoorSpeed: 6,
  /** At the racetrack (R2.6), asphalt, grass and run-off alike: ~112 mph. */
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

/** Top speed at (x, z): grass is as fast as the nearby pavement (Andrew, round 3), so the property's
 * lawns and woods match the driveway, and everything inside the circuit's fence matches the track. */
export function bikeTopSpeed(x: number, z: number, onTrack = false) {
  if (onTrack || inTrackArea(x, z)) return BIKE.trackSpeed; // anywhere inside the circuit's fence
  if (inGarage(x, z)) return BIKE.indoorSpeed;
  return BIKE.roadSpeed;
}

// --- the gearbox (Andrew, round 3): six gears, automatic or manual (Q up, Z down) ---

/** Each gear's top speed (m/s) at the rev limiter: ~20 / 36 / 54 / 72 / 94 / 127 mph. */
export const GEAR_TOP = [9, 16, 24, 32, 42, 57] as const;
export const GEARS = GEAR_TOP.length;
/** How hard each gear pulls (× BIKE.accel): strong in first, gentle in top. */
const GEAR_PULL = [1.25, 1.0, 0.8, 0.62, 0.48, 0.38] as const;
/** Revs at a standstill (idle), as a share of the redline. */
export const IDLE_REVS = 0.15;
export const MPH = 2.23694;

const gearTop = (gear: number) => GEAR_TOP[Math.max(1, Math.min(GEARS, gear)) - 1]!;

/** Engine revs, 0…1 (1 = the redline), at a speed (m/s) in a gear. */
export const bikeRevs = (speed: number, gear: number) => Math.min(1, IDLE_REVS + (1 - IDLE_REVS) * (Math.abs(speed) / gearTop(gear)));

/** The automatic box: up a gear near the redline, down when the revs fall low. */
export function autoGear(speed: number, gear: number) {
  const v = Math.abs(speed);
  if (gear < GEARS && v > gearTop(gear) * 0.94) return gear + 1;
  if (gear > 1 && v < gearTop(gear - 1) * 0.55) return gear - 1;
  return gear;
}

/** A downshift is only allowed if it won't send the engine past the redline. */
export const canShiftDown = (speed: number, gear: number) => gear > 1 && Math.abs(speed) <= gearTop(gear - 1);

/** Pull from the engine at these revs: best in the middle, weak when lugging or at the limiter. */
const torque = (revs: number) => 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, revs));

/**
 * One step of the bike's speed (m/s, negative = backing up) from the throttle (W), brake (S) and
 * tuck (Shift), in a gear, toward the top speed for where it is. Each gear tops out at its limiter.
 */
export function bikeSpeedStep(speed: number, dt: number, input: { throttle: boolean; brake: boolean; tuck: boolean }, top: number, gear: number) {
  const max = top * (input.tuck ? BIKE.tuck : 1);
  if (input.throttle && speed >= -0.1) {
    // Over the top speed here (rolled off the track, or tuck let go): slow down.
    if (speed > max) return Math.max(max, speed - BIKE.brake * 0.5 * dt);
    const g = Math.max(1, Math.min(GEARS, gear));
    const limit = Math.min(max, gearTop(g));
    if (speed >= limit) return Math.max(limit, speed - BIKE.coast * dt); // on the limiter
    return Math.min(limit, speed + BIKE.accel * GEAR_PULL[g - 1]! * torque(bikeRevs(speed, g)) * dt);
  }
  if (input.brake) {
    if (speed > 0.1) return Math.max(0, speed - BIKE.brake * dt);
    return Math.max(-BIKE.reverseSpeed, speed - 3 * dt); // stopped: holding S backs up slowly
  }
  if (input.throttle && speed < -0.1) return Math.min(0, speed + BIKE.brake * dt);
  const coast = BIKE.coast + (speed > max ? BIKE.brake * 0.5 : 0);
  return speed > 0 ? Math.max(0, speed - coast * dt) : Math.min(0, speed + coast * dt);
}
