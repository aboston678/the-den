import { describe, expect, it } from "vitest";
import { MAX_PLAYERS } from "../constants.ts";
import {
  APRON, BOWLING_ALLEY, DOCK, DRIVEWAY, DRIVEWAY_WIDTH, HOUSE, STREAM, TRAIL, dockStartX, houseToWorld, streamCenter,
} from "./layout.ts";
import { SPAWN_S, spawnPoint } from "./spawn.ts";
import { drivewayY, heightAt, isInBounds, isWild, lawnMask, surfaceAt } from "./terrain.ts";

// The property layout checked against GAME_SPEC §4.

describe("the property", () => {
  it("the driveway runs ~170 m from the spawn to the garage apron", () => {
    const end = DRIVEWAY.closest(APRON.minX, (APRON.minZ + APRON.maxZ) / 2)!.s;
    expect(end - SPAWN_S).toBeGreaterThan(155);
    expect(end - SPAWN_S).toBeLessThan(190);
  });

  it("the driveway climbs gently (never steeper than 1 in 8)", () => {
    for (let s = SPAWN_S; s < DRIVEWAY.length - 2; s += 2) {
      expect(Math.abs(drivewayY(s + 2) - drivewayY(s)) / 2).toBeLessThan(0.125);
    }
  });

  it("the front lawn is level with the main floor and the back lawn is at basement level", () => {
    const front = houseToWorld(17, -6); // 7.5 m north of the house
    expect(Math.abs(heightAt(front.x, front.z) - HOUSE.mainFloorY)).toBeLessThan(0.15);
    const denDoor = houseToWorld(17.5, 10.5); // just outside the basement den's french doors
    expect(heightAt(denDoor.x, denDoor.z)).toBeCloseTo(HOUSE.basementFloorY, 0);
  });

  it("the ground covers the underground bowling alley", () => {
    for (let x = BOWLING_ALLEY.minX; x <= BOWLING_ALLEY.maxX; x += 2) {
      for (let z = BOWLING_ALLEY.minZ; z <= BOWLING_ALLEY.maxZ; z += 1) {
        expect(heightAt(x, z)).toBeGreaterThan(-0.45);
      }
    }
  });

  it("the stream is ~110 m east of the house, with banks 1–2 m above the water", () => {
    const eastWall = houseToWorld(34, 5).x;
    const shoreX = streamCenter(0) - STREAM.width / 2;
    expect(shoreX - eastWall).toBeGreaterThan(85);
    expect(shoreX - eastWall).toBeLessThan(115);
    for (const z of [-120, -60, 0, 60, 120]) {
      const bank = heightAt(streamCenter(z) - 14, z) - STREAM.waterY;
      if (Math.abs(z - DOCK.z) > 10) expect(bank).toBeGreaterThan(1);
      expect(bank).toBeLessThan(2.2);
    }
  });

  it("there's a shallow wadeable strip, then the invisible wall, then deep water", () => {
    for (const z of [-100, -20, 40, 110]) {
      const c = streamCenter(z);
      const shelf = STREAM.waterY - heightAt(c + STREAM.wadeLimitD - 0.5, z);
      expect(shelf).toBeGreaterThan(0.3);
      expect(shelf).toBeLessThan(0.8);
      expect(isInBounds(c + STREAM.wadeLimitD - 0.5, z)).toBe(true);
      expect(isInBounds(c + STREAM.wadeLimitD + 0.5, z)).toBe(false);
      expect(STREAM.waterY - heightAt(c, z)).toBeGreaterThan(1.5);
    }
  });

  it("the dock starts at a landing level with its boards, due east of the house, and reaches deep water", () => {
    expect(heightAt(dockStartX() - 1, DOCK.z)).toBeCloseTo(DOCK.deckY, 1);
    expect(DOCK.deckY - STREAM.waterY).toBeGreaterThan(0.4);
    const end = dockStartX() + DOCK.length - 0.3;
    expect(isInBounds(end, DOCK.z)).toBe(true); // you can walk to the end...
    expect(isInBounds(end, DOCK.z + DOCK.width)).toBe(false); // ...but not step off into deep water
    expect(STREAM.waterY - heightAt(end, DOCK.z)).toBeGreaterThan(1);
  });

  it("the trail runs ~90 m from the back lawn to the dock", () => {
    expect(TRAIL.length).toBeGreaterThan(80);
    expect(TRAIL.length).toBeLessThan(110);
    const end = TRAIL.points.at(-1)!;
    expect(Math.hypot(end.x - dockStartX(), end.z - DOCK.z)).toBeLessThan(1);
  });

  it("the lawn clearing is ~70 × 60 m with the house inside", () => {
    expect(lawnMask(0, 0)).toBe(1);
    expect(lawnMask(-20, -18)).toBeGreaterThan(0.9); // front lawn
    expect(lawnMask(20, 30)).toBeGreaterThan(0.9); // back lawn
    expect(lawnMask(0, -50)).toBe(0); // woods
    expect(lawnMask(70, 0)).toBe(0);
  });

  it("surface weights add up to 1", () => {
    for (const [x, z] of [[0, -20], [-80, -60], [streamCenter(5), 5], [streamCenter(5) - 11, 5]] as const) {
      const w = surfaceAt(x, z);
      expect(w.lawn + w.forest + w.mud + w.bed).toBeCloseTo(1, 5);
    }
    expect(surfaceAt(streamCenter(0), 0).bed).toBe(1);
  });

  it("nothing grows on the driveway, lawn or in the water", () => {
    const p = DRIVEWAY.pointAt(80);
    expect(isWild(p.x, p.z)).toBe(false);
    expect(isWild(0, -20)).toBe(false);
    expect(isWild(streamCenter(30), 30)).toBe(false);
    expect(isWild(-90, 40)).toBe(true);
  });
});

describe("spawnPoint", () => {
  it("puts six bears on the driveway at the north-west edge, apart, facing down it", () => {
    const spots = Array.from({ length: MAX_PLAYERS }, (_, i) => spawnPoint(i));
    for (const [i, a] of spots.entries()) {
      expect(a.x).toBeLessThan(-100);
      expect(a.z).toBeLessThan(-100);
      expect(isInBounds(a.x, a.z)).toBe(true);
      expect(DRIVEWAY.closest(a.x, a.z)!.dist).toBeLessThan(DRIVEWAY_WIDTH / 2);
      expect(Math.abs(a.y - heightAt(a.x, a.z))).toBeLessThan(0.1);
      for (const b of spots.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1.2);
      // Facing toward the house (south-east).
      expect(Math.sin(a.yaw)).toBeGreaterThan(0);
      expect(Math.cos(a.yaw)).toBeGreaterThan(0);
    }
  });

  it("the test field keeps its short line", () => {
    const spots = Array.from({ length: MAX_PLAYERS }, (_, i) => spawnPoint(i, "test"));
    expect(new Set(spots.map((s) => s.x)).size).toBe(MAX_PLAYERS);
    expect(spots.every((s) => s.y === 0 && s.yaw === Math.PI)).toBe(true);
  });
});
