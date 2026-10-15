import { HOOK_WINDOW_S, rodBucket, streamCenter } from "@den/shared";
import { describe, expect, it } from "vitest";
import { Player } from "./PartyState.ts";
import { Fishing } from "./fishing.ts";

function bearAt(x: number, z: number) {
  const p = new Player();
  p.name = "Tester";
  p.x = x;
  p.z = z;
  return p;
}
const water = () => ({ x: streamCenter(0) - 4, z: 0 });

describe("fishing on the server", () => {
  it("only hands out a rod at the bucket", () => {
    const f = new Fishing(() => 0.5);
    const far = bearAt(0, 0);
    f.rod("a", far, true);
    expect(far.rod).toBe(false);
    const b = rodBucket();
    const near = bearAt(b.x + 1, b.z);
    f.rod("b", near, true);
    expect(near.rod).toBe(true);
  });

  it("casts only onto the water, within reach, holding a rod", () => {
    const f = new Fishing(() => 0.5);
    const b = rodBucket();
    const p = bearAt(b.x, b.z);
    f.cast("a", p, water().x, 0, 0);
    expect(p.fishing).toBe(""); // no rod yet
    f.rod("a", p, true);
    f.cast("a", p, b.x - 3, b.z, 0); // the bank
    expect(p.fishing).toBe("");
    f.cast("a", p, water().x, 0, 0);
    expect(p.fishing).toBe("cast");
  });

  it("bite, strike, fight, landed: announced with a personal best", () => {
    const f = new Fishing(() => 0.5);
    const b = rodBucket();
    const p = bearAt(b.x, b.z);
    const players = new Map([["a", p]]);
    f.rod("a", p, true);
    f.force("a", 1, "perch", 0.8);
    f.cast("a", p, water().x, 0, 0);
    f.tick(players, 500, 0.05);
    expect(p.fishing).toBe("cast");
    f.tick(players, 1100, 0.05);
    expect(p.fishing).toBe("bite");
    f.reel("a", p, 1200); // strike
    expect(p.fishing).toBe("fight");
    let t = 1200, landed = null;
    while (!landed && t < 60_000) {
      t += 50;
      if (t % 250 === 0) f.reel("a", p, t); // a steady 4 presses a second
      landed = f.tick(players, t, 0.05)[0] ?? null;
    }
    expect(landed).toMatchObject({ id: "a", species: "perch", best: true });
    expect(p.fishing).toBe("landed");
    expect(p.catchSpecies).toBe("perch");
  });

  it("a bite nobody strikes gets away", () => {
    const f = new Fishing(() => 0.5);
    const b = rodBucket();
    const p = bearAt(b.x, b.z);
    const players = new Map([["a", p]]);
    f.rod("a", p, true);
    f.force("a", 0);
    f.cast("a", p, water().x, 0, 0);
    f.tick(players, 10, 0.05);
    expect(p.fishing).toBe("bite");
    f.tick(players, 10 + HOOK_WINDOW_S * 1000 + 10, 0.05);
    expect(p.fishing).toBe("missed");
  });

  it("walking off with the line out (or putting the rod away) winds it in", () => {
    const f = new Fishing(() => 0.5);
    const b = rodBucket();
    const p = bearAt(b.x, b.z);
    const players = new Map([["a", p]]);
    f.rod("a", p, true);
    f.cast("a", p, water().x, 0, 0);
    p.x -= 60;
    f.tick(players, 100, 0.05);
    expect(p.fishing).toBe("");
    p.x += 60;
    f.cast("a", p, water().x, 0, 0);
    f.rod("a", p, false);
    expect(p.fishing).toBe("");
  });

  it("a dropped connection mid-fight lets the fish go and winds the line in (the rod stays)", () => {
    const f = new Fishing(() => 0.5);
    const b = rodBucket();
    const p = bearAt(b.x, b.z);
    const players = new Map([["a", p]]);
    f.rod("a", p, true);
    f.force("a", 0);
    f.cast("a", p, water().x, 0, 0);
    f.tick(players, 10, 0.05);
    f.reel("a", p, 20);
    expect(p.fishing).toBe("fight");
    f.drop("a", p);
    expect(p.fishing).toBe("");
    expect(p.tension).toBe(0);
    expect(p.rod).toBe(true);
    f.cast("a", p, water().x, 0, 100);
    expect(p.fishing).toBe("cast");
  });
});
