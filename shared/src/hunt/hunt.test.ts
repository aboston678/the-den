import { describe, expect, it } from "vitest";
import { FURNITURE, footprint, isSolid } from "../house/furniture.ts";
import { heightAt, isInBounds } from "../world/terrain.ts";
import { BEAR_HEALTH, GUN, GUNS, HUNT_LIMIT_S, bearPoints, pointsAtEnd } from "./rules.ts";
import { canSwipe, checkHit, parseShot } from "./shot.ts";
import { GUN_LOCKER, HIDE_MIN_DISTANCE, HIDE_SPOTS, HUNT_CIRCLE, inHuntCircle, pickHideSpot } from "./spots.ts";

describe("bear hunt rules", () => {
  it("takes the hits Andrew asked for: sniper 1, pistol 3, AR 2, shotgun 1", () => {
    const hits = (g: (typeof GUNS)[number]) => Math.ceil(BEAR_HEALTH / GUN[g].damage);
    expect([hits("sniper"), hits("pistol"), hits("ar"), hits("shotgun")]).toEqual([1, 3, 2, 1]);
    expect(GUN.sniper.mag).toBe(1); // one shot per reload
    expect(GUN.ar.auto).toBe(true);
    expect(GUN.pistol.auto).toBe(false);
  });

  it("doubles the bear's points every full minute, 512 at ten", () => {
    expect(bearPoints(59)).toBe(0);
    expect(bearPoints(60)).toBe(1);
    expect(bearPoints(119)).toBe(1);
    expect(bearPoints(120)).toBe(2);
    expect(bearPoints(180)).toBe(4);
    expect(bearPoints(240)).toBe(8);
    expect(bearPoints(300)).toBe(16);
    expect(bearPoints(HUNT_LIMIT_S)).toBe(512);
    expect(bearPoints(9999)).toBe(512);
    expect(pointsAtEnd("survived", 600)).toBe(512);
    expect(pointsAtEnd("shot", 372)).toBe(32);
  });
});

describe("bear hunt places", () => {
  it("puts the circle on walkable, fairly level ground by the dock", () => {
    expect(isInBounds(HUNT_CIRCLE.x, HUNT_CIRCLE.z)).toBe(true);
    const ys: number[] = [];
    for (let a = 0; a < Math.PI * 2; a += 0.5) ys.push(heightAt(HUNT_CIRCLE.x + Math.cos(a) * HUNT_CIRCLE.r, HUNT_CIRCLE.z + Math.sin(a) * HUNT_CIRCLE.r));
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1.6);
    expect(inHuntCircle(HUNT_CIRCLE.x + 1, HUNT_CIRCLE.z)).toBe(true);
    expect(inHuntCircle(HUNT_CIRCLE.x + 4, HUNT_CIRCLE.z)).toBe(false);
  });

  it("has hiding spots all over the map, inside the bounds and clear of furniture", () => {
    expect(HIDE_SPOTS.length).toBeGreaterThanOrEqual(20);
    for (const s of HIDE_SPOTS) expect(isInBounds(s.x, s.z), s.name).toBe(true);
    expect(HIDE_SPOTS.some((s) => s.x < -215)).toBe(true); // at the racetrack
    const far = HIDE_SPOTS.filter((s) => Math.hypot(s.x - HUNT_CIRCLE.x, s.z - HUNT_CIRCLE.z) >= HIDE_MIN_DISTANCE);
    expect(far.length).toBeGreaterThanOrEqual(15);
  });

  it("never drops the bear at the same spot twice in a row, or near the circle", () => {
    let last = -1;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i++) {
      const s = pickHideSpot(rand, last);
      expect(s).not.toBe(last);
      const p = HIDE_SPOTS[s]!;
      expect(Math.hypot(p.x - HUNT_CIRCLE.x, p.z - HUNT_CIRCLE.z)).toBeGreaterThanOrEqual(HIDE_MIN_DISTANCE);
      last = s;
    }
  });

  it("stands the gun locker in the basement den without blocking anything", () => {
    const locker = FURNITURE.find((p) => p.kind === "gun_locker")!;
    expect(locker.room).toBe("den");
    const a = footprint(locker);
    for (const p of FURNITURE) {
      if (p === locker || p.room !== "den" || !isSolid(p)) continue;
      const b = footprint(p);
      const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
      expect(overlap, p.kind).toBe(false);
    }
    expect(GUN_LOCKER.y).toBeLessThan(-3);
  });
});

describe("shot check", () => {
  const shooter = { x: 0, y: 0, z: 0 };
  const bear = { x: 0, y: 0, z: 50, speed: 0 };
  const shot = (over: Record<string, unknown> = {}) => parseShot({ gun: "ar", from: { x: 0, y: 1.7, z: -3 }, dir: { x: 0, y: 0, z: 1 }, hit: { x: 0, y: 1.7, z: 49.6 }, ...over })!;

  it("accepts a real hit", () => {
    expect(checkHit(shot(), shooter, bear)).toBe(true);
  });
  it("refuses a hit that isn't where the bear is, out of range, off the ray, or from far away", () => {
    expect(checkHit(shot({ hit: { x: 5, y: 1.7, z: 49.6 } }), shooter, bear)).toBe(false);
    expect(checkHit(shot({ gun: "shotgun" }), shooter, bear)).toBe(false); // 50 m, the shotgun reaches 30
    expect(checkHit(shot({ dir: { x: 1, y: 0, z: 1 } }), shooter, bear)).toBe(false);
    expect(checkHit(shot({ from: { x: 30, y: 1.7, z: 0 } }), shooter, bear)).toBe(false);
    expect(checkHit(shot({ hit: undefined }), shooter, bear)).toBe(false);
  });
  it("allows for a running bear's lag", () => {
    const running = { ...bear, speed: 6 };
    expect(checkHit(shot({ hit: { x: 2.5, y: 1.7, z: 49.6 }, dir: { x: 2.5, y: 0, z: 52.6 } }), shooter, running)).toBe(true);
    expect(checkHit(shot({ hit: { x: 2.5, y: 1.7, z: 49.6 }, dir: { x: 2.5, y: 0, z: 52.6 } }), shooter, bear)).toBe(false);
  });
  it("throws out junk", () => {
    expect(parseShot({ gun: "bazooka", from: shooter, dir: { x: 0, y: 0, z: 1 } })).toBeNull();
    expect(parseShot({ gun: "ar", from: { x: Number.NaN, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 } })).toBeNull();
    expect(parseShot({ gun: "ar", from: shooter, dir: { x: 0, y: 0, z: 0 } })).toBeNull();
  });
});

describe("swipe", () => {
  it("reaches a hunter close in front, not behind or far", () => {
    const bear = { x: 0, y: 0, z: 0, yaw: 0 }; // facing +z
    expect(canSwipe(bear, { x: 0, y: 0, z: 2 })).toBe(true);
    expect(canSwipe(bear, { x: 0, y: 0, z: -2 })).toBe(false);
    expect(canSwipe(bear, { x: 0, y: 0, z: 5 })).toBe(false);
    expect(canSwipe(bear, { x: 0.3, y: 0, z: -0.3 })).toBe(true); // touching
  });
});
