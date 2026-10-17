import type { PathPoint } from "@den/shared";

// Dev and tests only: rides the bike along a route by itself (throttle, brake and steering), so a
// browser test can ride out to the racetrack and round a whole lap.

export interface Route {
  points: PathPoint[];
  loop: boolean;
  /** Top speed it allows itself (m/s). */
  maxSpeed: number;
}

export function autopilot(route: Route, x: number, z: number, yaw: number, speed: number) {
  const pts = route.points, n = pts.length;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const d = (pts[i]!.x - x) ** 2 + (pts[i]!.z - z) ** 2;
    if (d < bestD) (best = i, bestD = d);
  }
  const ahead = (k: number) => pts[route.loop ? (best + k) % n : Math.min(n - 1, best + k)]!;
  const look = ahead(Math.round(8 + speed * 0.5));
  const fx = Math.sin(yaw), fz = Math.cos(yaw), tx = look.x - x, tz = look.z - z;
  const angle = Math.atan2(fx * tz - fz * tx, fx * tx + fz * tz); // + = target to the left
  // Slow for the bends coming up: how much the route turns over the next ~60 m.
  const a = ahead(10), b = ahead(40), c = ahead(70);
  const bend = Math.abs(Math.atan2((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z)));
  // …and for being pointed away from the route (grass no longer slows a bike that runs wide, round 3).
  const target = Math.min(route.maxSpeed, 8 + 40 / (1 + bend * 6), 8 + 40 / (1 + Math.max(0, Math.abs(angle) - 0.1) * 8));
  const end = !route.loop && best >= n - 3;
  return { throttle: !end && speed < target, brake: end || speed > target + 3, steer: Math.max(-1, Math.min(1, -angle * 2.5)) };
}
