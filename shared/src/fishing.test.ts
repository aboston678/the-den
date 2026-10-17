import { describe, expect, it } from "vitest";
import {
  BITE_MAX_S, BITE_MIN_S, type Fight, SPECIES, formatWeight, isStreamWater, rollBiteDelay, rollSpecies, rollWeight, speciesById, startFight, stepFight,
} from "./fishing.ts";
import { STREAM, streamCenter } from "./world/layout.ts";

/** A small seeded random generator, so fights are repeatable. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

/**
 * Play a fight at 20 ticks a second. `pressRate(f)` = presses per second the player makes given
 * the fight so far. Returns the result and how long it took.
 */
function play(fight: Fight, pressRate: (f: Fight) => number, seed = 1) {
  const rand = rng(seed);
  let owed = 0;
  for (let t = 0; t < 120; t += 0.05) {
    owed += pressRate(fight) * 0.05;
    const presses = Math.floor(owed);
    owed -= presses;
    const r = stepFight(fight, 0.05, presses, rand);
    if (r) return { result: r, time: fight.time };
  }
  return { result: "timeout", time: fight.time };
}
/** A sensible player: reels steadily, eases off when the tension gets high. */
const careful = (f: Fight) => (f.tension > 0.7 ? 0 : f.tension > 0.5 ? 2.5 : 4.5);

describe("fishing", () => {
  it("species chances add up to 100% and follow the table", () => {
    expect(SPECIES.reduce((n, s) => n + s.chance, 0)).toBe(100);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 10000; i++) {
      const s = rollSpecies((i + 0.5) / 10000);
      counts[s.id] = (counts[s.id] ?? 0) + 1;
    }
    for (const s of SPECIES) expect((counts[s.id] ?? 0) / 100).toBeCloseTo(s.chance, 0);
  });

  it("weights stay in range and big ones are rare", () => {
    const bass = speciesById("largemouth")!;
    expect(rollWeight(bass, 0)).toBe(0.5);
    expect(rollWeight(bass, 1)).toBe(8);
    expect(rollWeight(bass, 0.5)).toBeLessThan(2.2); // median well under the middle of the range
  });

  it("the Jenna Catfish never comes by chance (the server gives her 1 cast in 4) and always weighs 200 to 400 lb", () => {
    const cat = speciesById("jenna_catfish")!;
    expect(cat.chance).toBe(0);
    for (let i = 0; i < 1000; i++) expect(rollSpecies(i / 1000).id).not.toBe("jenna_catfish");
    for (let i = 0; i <= 100; i++) {
      const w = rollWeight(cat, i / 100);
      expect(w).toBeGreaterThanOrEqual(200);
      expect(w).toBeLessThanOrEqual(400);
    }
    expect(rollWeight(cat, 0.5)).toBeCloseTo(300); // an even spread, not mostly small ones
  });

  it("every species jumps while you reel it in", () => {
    for (const s of SPECIES) expect(s.jumps).toBe(true);
  });

  it("bites come 10 to 45 seconds after the cast", () => {
    expect(rollBiteDelay(0)).toBe(BITE_MIN_S);
    expect(rollBiteDelay(1)).toBe(BITE_MAX_S);
  });

  it("formats weights in pounds and ounces", () => {
    expect(formatWeight(2.3125)).toBe("2 lb 5 oz");
    expect(formatWeight(0.7)).toBe("11 oz");
    expect(formatWeight(3)).toBe("3 lb");
  });

  it("knows the stream's water from its banks", () => {
    expect(isStreamWater(streamCenter(0), 0)).toBe(true);
    expect(isStreamWater(streamCenter(0) - STREAM.width / 2 - 2, 0)).toBe(false);
  });

  it("a careful player lands a big bass in about 10–15 seconds", () => {
    const times: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const r = play(startFight(speciesById("largemouth")!, 7, 20, 0.5), careful, seed);
      expect(r.result).toBe("landed");
      times.push(r.time);
    }
    const avg = times.reduce((a, b) => a + b) / times.length;
    expect(avg).toBeGreaterThan(9);
    expect(avg).toBeLessThan(17);
  });

  it("mashing R flat out snaps a big bass's line", () => {
    for (let seed = 1; seed <= 5; seed++) expect(play(startFight(speciesById("smallmouth")!, 7, 20, 0.5), () => 12, seed).result).toBe("snapped");
  });

  it("a careful player lands any Jenna Catfish, a long fight that grows with her weight", () => {
    const cat = speciesById("jenna_catfish")!;
    const avg = (w: number) => {
      let total = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const r = play(startFight(cat, w, 20, 0.5), careful, seed);
        expect(r.result).toBe("landed");
        total += r.time;
      }
      return total / 10;
    };
    const small = avg(200), big = avg(400);
    expect(small).toBeGreaterThan(11);
    expect(big).toBeGreaterThan(small + 8);
    expect(big).toBeLessThan(40);
  });

  it("mashing R snaps a Jenna Catfish's line", () => {
    for (let seed = 1; seed <= 5; seed++) expect(play(startFight(speciesById("jenna_catfish")!, 250, 20, 0.5), () => 12, seed).result).toBe("snapped");
  });

  it("a small sunfish comes in quickly", () => {
    const r = play(startFight(speciesById("sunfish")!, 0.5, 20, 0.5), careful);
    expect(r.result).toBe("landed");
    expect(r.time).toBeLessThan(10);
  });

  it("doing nothing never lands a fish", () => {
    expect(play(startFight(speciesById("perch")!, 1, 15, 0.5), () => 0).result).toBe("timeout");
  });
});
