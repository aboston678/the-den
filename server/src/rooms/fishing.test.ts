import { HOOK_WINDOW_S, JENNA, rodBucket, streamCenter } from "@den/shared";
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

/** A repeatable random source. */
function seeded(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One cast to the end: wait for the bite, strike, then either reel carefully (presses only while the
 * tension is low) until it's landed, or `give` up ("snap" = mash R, "reel-in", "miss" the bite).
 */
function fishOnce(f: Fishing, p: Player, players: Map<string, Player>, clock: { t: number }, give?: "snap" | "reel-in" | "miss") {
  let species = "";
  f.cast("a", p, water().x, 0, clock.t);
  while (p.fishing === "cast") f.tick(players, (clock.t += 250), 0.25);
  if (give === "miss") {
    while (p.fishing === "bite") f.tick(players, (clock.t += 250), 0.25);
  } else {
    f.reel("a", p, (clock.t += 50)); // strike
    species = p.catchSpecies;
    if (give === "reel-in") f.reelIn("a", p);
    while (p.fishing === "fight" && clock.t < 10_000_000) {
      clock.t += 50;
      if (give === "snap" || (p.tension < 0.5 && clock.t % 150 === 0)) f.reel("a", p, clock.t);
      if (give === "snap") for (let i = 0; i < 3; i++) f.reel("a", p, clock.t);
      f.tick(players, clock.t, 0.05);
    }
  }
  const result = p.fishing;
  f.tick(players, (clock.t += 61_000), 0.05); // let the result go by (a landed fish goes back after a minute)
  return { species, result };
}

describe("the Jenna Catfish (round 3)", () => {
  const setup = (seed: number) => {
    const f = new Fishing(seeded(seed));
    const b = rodBucket();
    const p = bearAt(b.x, b.z);
    const players = new Map([["a", p]]);
    f.rod("a", p, true);
    return { f, p, players, clock: { t: 0 } };
  };

  it("bites on exactly one cast in every four, and gets landed by careful reeling", () => {
    for (const seed of [1, 2, 3]) {
      const { f, p, players, clock } = setup(seed);
      const runs: number[] = [];
      for (let run = 0; run < 10; run++) {
        let cats = 0;
        for (let i = 0; i < 4; i++) {
          const r = fishOnce(f, p, players, clock);
          expect(r.result).toBe("landed");
          if (r.species === JENNA) cats++;
        }
        runs.push(cats);
      }
      expect(runs).toEqual(Array(10).fill(1));
    }
  });

  it("comes straight back on the next cast if she snaps the line, the bite is missed or the line comes in", () => {
    for (const give of ["snap", "miss", "reel-in"] as const) {
      const { f, p, players, clock } = setup(7);
      let r = fishOnce(f, p, players, clock);
      while (r.species !== JENNA) r = fishOnce(f, p, players, clock);
      // Lose eight casts in a row (a whole run of four is among them, so one was hers): she's next.
      for (let i = 0; i < 8; i++) fishOnce(f, p, players, clock, give);
      expect(fishOnce(f, p, players, clock).species).toBe(JENNA);
    }
  });
});

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
    // Everyone can see what's on the line straight away (it jumps while it fights).
    expect(p.catchSpecies).toBe("perch");
    expect(p.catchWeight).toBeCloseTo(0.8);
    let t = 1200, landed = null;
    while (!landed && t < 60_000) {
      t += 50;
      if (t % 250 === 0) f.reel("a", p, t); // a steady 4 presses a second
      landed = f.tick(players, t, 0.05)[0] ?? null;
    }
    expect(landed).toMatchObject({ id: "a", species: "perch", best: true });
    expect(p.fishing).toBe("landed");
    expect(p.catchSpecies).toBe("perch");

    // Held up by the lip until R lets it go (game-night fixes); the fight's last mashes don't count.
    f.reel("a", p, t + 300);
    expect(p.fishing).toBe("landed");
    f.tick(players, t + 30_000, 0.05);
    expect(p.fishing).toBe("landed"); // still holding it
    f.reel("a", p, t + 30_100);
    expect(p.fishing).toBe("released");
    expect(p.catchSpecies).toBe("perch"); // so everyone sees which fish drops back in
    f.tick(players, t + 31_500, 0.05);
    expect(p.fishing).toBe("");
  });

  it("a landed fish nobody lets go goes back by itself after a minute", () => {
    const f = new Fishing(() => 0.5);
    const b = rodBucket();
    const p = bearAt(b.x, b.z);
    const players = new Map([["a", p]]);
    f.rod("a", p, true);
    f.force("a", 0, "sunfish", 0.3);
    f.cast("a", p, water().x, 0, 0);
    f.tick(players, 10, 0.05);
    f.reel("a", p, 20);
    let t = 0;
    while (p.fishing === "fight" && t < 60_000) {
      t += 50;
      if (t % 250 === 0) f.reel("a", p, t);
      f.tick(players, t, 0.05);
    }
    expect(p.fishing).toBe("landed");
    f.tick(players, t + 61_000, 0.05);
    expect(p.fishing).toBe("");
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
