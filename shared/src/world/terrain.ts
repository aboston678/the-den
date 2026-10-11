import {
  APRON, BOUNDARY_HALF, BOWLING_ALLEY, CLEARING, DOCK, DRIVEWAY, DRIVEWAY_WIDTH, HOUSE, HOUSE_FOOTPRINT, RETAINING_WALL,
  RETAINING_WALL_HEIGHT, STREAM, TRAIL, TRAIL_WIDTH, WALL_PATHS, streamCenter,
} from "./layout.ts";
import { clamp01, fbm, lerp, noise2, smoothstep } from "./noise.ts";

// The ground's height and surface everywhere on the property (GAME_SPEC §4):
// - front (north) lawn level with the main floor; the ground drops ~3.4 m to the back lawn so
//   the basement walks out on the south side,
// - rolling forest beyond the clearing, higher to the north-west where the driveway starts,
// - falling east to the stream's banks (1.5 m above the water), a 3 m wadeable shelf, deep middle,
// - flat driveway, apron, trail and a landing at the dock.

/** 0 outside the lawn clearing, 1 on the lawn (soft, uneven edge). */
export function lawnMask(x: number, z: number) {
  const q = Math.cbrt(Math.abs((x - CLEARING.cx) / CLEARING.rx) ** 3 + Math.abs((z - CLEARING.cz) / CLEARING.rz) ** 3);
  const wobble = 1 + 0.06 * noise2(x, z, 16, 7) + 0.03 * noise2(x, z, 6, 8);
  const oval = 1 - smoothstep(0.9 * wobble, 1.02 * wobble, q);
  // A little lawn spills round to the garage apron.
  const apron = 1 - smoothstep(9, 14, Math.hypot(x - (APRON.minX - 2), z - (APRON.minZ + APRON.maxZ) / 2));
  return Math.max(oval, apron);
}

/** Lawn level around the house: 0 in front, dropping to the basement floor behind. */
function houseLevel(x: number, z: number) {
  // Where the drop starts (z0) and ends (z1) along z, for three stretches west→east:
  // garage + greenhouse wing (main-floor level to past the greenhouse), the middle (hidden under
  // the house so the basement den walks straight out), and the east side yard (clear of the
  // bowling alley underground).
  const west = 1 - smoothstep(-12, -7, x), east = smoothstep(20, 25, x), mid = Math.max(0, 1 - west - east);
  const z0 = west * 9 + mid * -0.5 + east * 1.5;
  const z1 = west * 22 + mid * 5.4 + east * 13;
  const drop = smoothstep(z0, z1, z) * -HOUSE.basementFloorY;
  return HOUSE.mainFloorY - drop - 1.2 * smoothstep(12, 45, z); // the back lawn keeps falling gently south
}

/** Our side of the stream (d < 0) to the far side: bed and bank heights by distance from the centre line. */
const STREAM_PROFILE: [number, number][] = [
  [-14, STREAM.bankTopY], [-12, -7.6], [-11, -8.25], [-10, -8.75], [-9, -9.0], [-7.5, -9.05], [-6.5, -9.6], [-5, -10.4],
  [0, -10.6], [5, -10.4], [6.5, -9.6], [9, -9.0], [10, -8.75], [11, -8.25], [12, -7.6], [14, STREAM.bankTopY],
];
function streamProfile(d: number) {
  for (let i = 1; i < STREAM_PROFILE.length; i++) {
    const [d1, h1] = STREAM_PROFILE[i]!;
    if (d <= d1) {
      const [d0, h0] = STREAM_PROFILE[i - 1]!;
      return lerp(h0, h1, smoothstep(d0, d1, d) * 0.5 + ((d - d0) / (d1 - d0)) * 0.5);
    }
  }
  return STREAM.bankTopY;
}

/** Distance from (x, z) to a rectangle (0 inside). */
const rectDist = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number) =>
  Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));

/** Height before the driveway and trail are cut in. */
function natural(x: number, z: number) {
  const lawn = lawnMask(x, z);
  const woods = smoothstep(0, 1, 1 - lawn);
  const relief = fbm(x, z, 55, 1) * 2.2 + noise2(x, z, 9, 5) * 0.35;
  const tilt = Math.max(-2, -(x + z) * 0.022); // high in the north-west, lower to the south-east
  let h = houseLevel(x, z) + woods * (tilt + relief);

  const d = x - streamCenter(z);
  if (d < 14) {
    h = lerp(h, STREAM.bankTopY + relief * 0.15, smoothstep(-70, -14, d)); // fall east to the bank top
    if (d > -14) h = streamProfile(d);
  } else {
    h = STREAM.bankTopY + smoothstep(14, 35, d) * 3 + relief * smoothstep(14, 24, d); // far bank (scenery)
  }

  // Flat garage apron, and ground held up behind the retaining wall on its north side.
  h = lerp(h, APRON.y, 1 - smoothstep(0.5, 4.5, rectDist(APRON, x, z)));
  const rw = RETAINING_WALL.closest(x, z, 10);
  if (rw) {
    const p = RETAINING_WALL.pointAt(rw.s);
    const north = (x - p.x) * p.dz - (z - p.z) * p.dx > 0; // left of the wall's direction
    if (north) h = lerp(h, APRON.y + RETAINING_WALL_HEIGHT - 0.1, 1 - smoothstep(0.4, 10, rw.dist));
  }

  // Keep the bowling alley (underground, east of the house) covered.
  h = Math.max(h, lerp(h, -0.3, 1 - smoothstep(1, 8, rectDist(BOWLING_ALLEY, x, z))));

  // A small landing cut into the bank at the base of the dock.
  const dockX = streamCenter(DOCK.z) + DOCK.startD;
  const landing = { minX: dockX - 3.5, maxX: dockX, minZ: DOCK.z - 2.2, maxZ: DOCK.z + 2.2 };
  h = lerp(h, DOCK.deckY - 0.05, 1 - smoothstep(0, 3, rectDist(landing, x, z)));
  return h;
}

/** Smoothed ground height along a path, so the road surface rolls gently instead of following every bump. */
function profileAlong(points: { x: number; z: number }[], window: number) {
  const raw = points.map((p) => natural(p.x, p.z));
  return raw.map((_, i) => {
    let sum = 0, n = 0;
    for (let k = Math.max(0, i - window); k <= Math.min(raw.length - 1, i + window); k++) (sum += raw[k]!, n++);
    return sum / n;
  });
}
const driveProfile = profileAlong(DRIVEWAY.points, 14);
// Meet the apron level exactly over the last 25 m.
for (let i = 0; i < driveProfile.length; i++) {
  const toEnd = DRIVEWAY.length - DRIVEWAY.at[i]!;
  driveProfile[i] = lerp(driveProfile[i]!, APRON.y, 1 - smoothstep(4, 25, toEnd));
}
const trailProfile = profileAlong(TRAIL.points, 4);

function sample(profile: number[], path: typeof DRIVEWAY, s: number) {
  let i = 0;
  while (i < path.at.length - 2 && path.at[i + 1]! < s) i++;
  const t = clamp01((s - path.at[i]!) / (path.at[i + 1]! - path.at[i]! || 1));
  return lerp(profile[i]!, profile[i + 1]!, t);
}

/** Height of the driveway's surface at `s` metres along it. */
export const drivewayY = (s: number) => sample(driveProfile, DRIVEWAY, s);
/** Height of the trail's surface at `s` metres along it. */
export const trailY = (s: number) => sample(trailProfile, TRAIL, s);

/** Ground height at (x, z). */
export function heightAt(x: number, z: number) {
  let h = natural(x, z);
  const road = DRIVEWAY.closest(x, z, DRIVEWAY_WIDTH / 2 + 5);
  if (road) h = lerp(h, drivewayY(road.s) - 0.02, 1 - smoothstep(DRIVEWAY_WIDTH / 2 + 0.3, DRIVEWAY_WIDTH / 2 + 4.5, road.dist));
  const trail = TRAIL.closest(x, z, 3);
  if (trail) h = lerp(h, trailY(trail.s), 0.85 * (1 - smoothstep(TRAIL_WIDTH / 2 - 0.2, 3, trail.dist)));
  return h;
}

/** How much of each ground texture to show at (x, z); the four weights add up to 1. */
export function surfaceAt(x: number, z: number, h = heightAt(x, z)) {
  let lawn = lawnMask(x, z);
  const d = x - streamCenter(z);
  // Muddy banks, and dirt along the driveway's shoulders and the trail.
  let mud = Math.max(0, 1 - Math.abs(Math.abs(d) - 11.5) / 3.5) * (Math.abs(d) < 15 ? 1 : 0);
  const road = DRIVEWAY.closest(x, z, DRIVEWAY_WIDTH / 2 + 2.5);
  if (road) mud = Math.max(mud, 0.75 * (1 - smoothstep(DRIVEWAY_WIDTH / 2 + 0.5, DRIVEWAY_WIDTH / 2 + 2.5, road.dist)));
  const trail = TRAIL.closest(x, z, 2.6);
  if (trail) mud = Math.max(mud, 1 - smoothstep(TRAIL_WIDTH / 2, 2.6, trail.dist));
  const bed = smoothstep(STREAM.waterY + 0.2, STREAM.waterY - 0.3, h);
  mud *= 1 - bed;
  lawn *= (1 - mud) * (1 - bed);
  const forest = Math.max(0, 1 - lawn - mud - bed);
  return { lawn, forest, mud, bed };
}

/** True if (x, z) is somewhere a tree, rock or fern may go (not lawn, road, water, walls or house). */
export function isWild(x: number, z: number, clearance = 0) {
  if (Math.abs(x) > 172 || Math.abs(z) > 172) return false; // trees continue past the boundary, into the fog
  if (lawnMask(x, z) > 0.12) return false;
  const d = x - streamCenter(z);
  if (d > -15 - clearance && d < 14 + clearance) return false;
  if (DRIVEWAY.closest(x, z, DRIVEWAY_WIDTH / 2 + 2 + clearance)) return false;
  if (TRAIL.closest(x, z, TRAIL_WIDTH / 2 + 1.2 + clearance)) return false;
  if (RETAINING_WALL.closest(x, z, 1.5 + clearance)) return false;
  for (const w of WALL_PATHS) if (w.closest(x, z, 1.2 + clearance)) return false;
  for (const r of HOUSE_FOOTPRINT) if (rectDist(r, x, z) < 4 + clearance) return false;
  return true;
}

/** True on the dock's boards (it reaches past the wading limit into deep water). */
export function isOnDock(x: number, z: number) {
  const d = x - streamCenter(DOCK.z);
  return Math.abs(z - DOCK.z) <= DOCK.width / 2 && d >= DOCK.startD && d <= DOCK.startD + DOCK.length;
}

/** True inside the walkable area (the invisible boundary and the stream's wading limit, plus the dock). */
export function isInBounds(x: number, z: number) {
  if (Math.abs(x) > BOUNDARY_HALF || Math.abs(z) > BOUNDARY_HALF) return false;
  return x - streamCenter(z) <= STREAM.wadeLimitD || isOnDock(x, z);
}
