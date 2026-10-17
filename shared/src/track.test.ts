import { describe, expect, it } from "vitest";
import {
  LapTimer, MIN_LAP_S, PADDOCK, RUNOFF_WIDTH, SECTORS, START_S, TRACK, TRACK_AREA, TRACK_ROAD, TRACK_WIDTH, TRACK_Y, formatLap, inTrackArea, inTrackCorridor,
  lapDistance, onTrackAsphalt, onTrackRoad, startLine,
} from "./track.ts";
import { DRIVEWAY } from "./world/layout.ts";
import { drivewayY, isInBounds } from "./world/terrain.ts";

describe("the racetrack", () => {
  it("is a proper circuit: about 3.5 km, and it never runs into itself", () => {
    expect(TRACK.length).toBeGreaterThan(3000);
    expect(TRACK.length).toBeLessThan(4200);
    // Any two stretches more than 150 m apart along the track are at least 45 m apart on the ground.
    const pts = TRACK.points.filter((_, i) => i % 4 === 0), at = TRACK.at.filter((_, i) => i % 4 === 0);
    let closest = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const along = Math.min(at[j]! - at[i]!, TRACK.length - (at[j]! - at[i]!));
        if (along < 150) continue;
        closest = Math.min(closest, Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.z - pts[j]!.z));
      }
    }
    expect(closest).toBeGreaterThan(TRACK_WIDTH + 2 * RUNOFF_WIDTH + 8);
  });

  it("fits inside its fence with room for the run-off", () => {
    for (const p of TRACK.points) {
      expect(p.x - TRACK_AREA.minX).toBeGreaterThan(TRACK_WIDTH / 2 + RUNOFF_WIDTH);
      expect(TRACK_AREA.maxX - p.x).toBeGreaterThan(TRACK_WIDTH / 2 + RUNOFF_WIDTH);
      expect(p.z - TRACK_AREA.minZ).toBeGreaterThan(TRACK_WIDTH / 2 + RUNOFF_WIDTH);
      expect(TRACK_AREA.maxZ - p.z).toBeGreaterThan(TRACK_WIDTH / 2 + RUNOFF_WIDTH);
    }
  });

  it("starts on the long straight, heading west past the paddock", () => {
    const s = startLine();
    expect(s.dx).toBeLessThan(-0.99);
    expect(s.x).toBeLessThan(PADDOCK.maxX);
    expect(onTrackAsphalt(s.x, s.z)).toBe(true);
    // The paddock touches the straight's run-off, so you can ride straight on.
    expect(TRACK.closest(-300, PADDOCK.minZ, TRACK_WIDTH / 2 + RUNOFF_WIDTH)).not.toBeNull();
  });

  it("is reached from the driveway: the road carries on from its far end, level, to the paddock", () => {
    expect(TRACK_ROAD.points[0]).toEqual(DRIVEWAY.points[0]);
    expect(Math.abs(drivewayY(0) - TRACK_Y)).toBeLessThan(0.1);
    const end = TRACK_ROAD.points[TRACK_ROAD.points.length - 1]!;
    expect(onTrackRoad(end.x, end.z)).toBe(true);
    expect(inTrackArea(end.x, end.z)).toBe(true);
    // Walkable all the way: driveway → road → track.
    for (let s = 0; s <= DRIVEWAY.length; s += 5) expect(isInBounds(DRIVEWAY.pointAt(s).x, DRIVEWAY.pointAt(s).z)).toBe(true);
    for (let s = 0; s <= TRACK_ROAD.length; s += 5) expect(isInBounds(TRACK_ROAD.pointAt(s).x, TRACK_ROAD.pointAt(s).z)).toBe(true);
    for (const p of TRACK.points) expect(isInBounds(p.x, p.z)).toBe(true);
    // …but not off into the farmland beside the road.
    const mid = TRACK_ROAD.pointAt(TRACK_ROAD.length / 2);
    expect(inTrackCorridor(mid.x + mid.dz * 20, mid.z - mid.dx * 20)).toBe(false);
    expect(isInBounds(mid.x + mid.dz * 20, mid.z - mid.dx * 20)).toBe(false);
    expect(isInBounds(-400, -100)).toBe(false); // farmland south of the track
  });

  it("times a lap that goes all the way round, not one that cuts across", () => {
    const t = new LapTimer();
    const at = (d: number) => TRACK.pointAt((d + START_S) % TRACK.length);
    const ride = (from: number, to: number, t0: number, seconds: number) => {
      const steps = 400;
      let done: number | null = null;
      for (let i = 0; i <= steps; i++) {
        const d = from + ((to - from) * i) / steps;
        const p = at(((d % TRACK.length) + TRACK.length) % TRACK.length);
        done = t.update(p.x, p.z, t0 + (seconds * i) / steps) ?? done;
      }
      return done;
    };
    expect(ride(-30, 10, 0, 2)).toBeNull(); // over the line: the lap starts
    expect(t.startedAt).not.toBeNull();
    const lap = ride(10, TRACK.length + 10, 2, 70);
    expect(lap).not.toBeNull();
    expect(lap!).toBeGreaterThan(65);
    // Across the infield from a third of the way round straight back to the line: no lap.
    ride(10, SECTORS[0] - 20, 80, 20);
    const p = at(TRACK.length - 30);
    t.update(p.x, p.z, 101);
    const q = at(5);
    expect(t.update(q.x, q.z, 102)).toBeNull();
    expect(MIN_LAP_S).toBeGreaterThan(20);
    expect(lapDistance(-400, -100)).toBeNull();
    expect(formatLap(83.456)).toBe("1:23.46");
    expect(formatLap(7.1)).toBe("0:07.10");
  });
});
