import { describe, expect, it } from "vitest";
import { rng } from "../world/noise.ts";
import { FAIR_WEIGHTS, HOUSE_WEIGHTS, facesFor, rollDice, type DiceMode } from "./dice.ts";

const N = 360_000;
// Chi-square, 10 degrees of freedom: 29.6 is the 1-in-1,000 cut-off. Seeds are fixed, so these never flake.
const CHI_LIMIT = 29.6;

function tally(mode: DiceMode, seed: number) {
  const rand = rng(seed);
  const totals = new Array<number>(13).fill(0);
  const faces = new Array<number>(7).fill(0);
  const pairs = new Set<string>();
  for (let i = 0; i < N; i++) {
    const [a, b] = rollDice(mode, rand);
    totals[a + b]!++;
    faces[a]!++;
    faces[b]!++;
    pairs.add(`${a},${b}`);
  }
  return { totals, faces, pairs };
}

function chiSquare(totals: number[], weights: readonly number[]) {
  let chi = 0;
  for (let t = 2; t <= 12; t++) {
    const expected = (N * weights[t]!) / 36;
    chi += (totals[t]! - expected) ** 2 / expected;
  }
  return chi;
}

describe("catan dice", () => {
  it("both weight tables cover all 36 combinations and 7 is 6 in 36 in both", () => {
    expect(FAIR_WEIGHTS.reduce((a: number, b) => a + b, 0)).toBe(36);
    expect(HOUSE_WEIGHTS.reduce((a: number, b) => a + b, 0)).toBe(36);
    expect(HOUSE_WEIGHTS[7]).toBe(FAIR_WEIGHTS[7]);
  });

  it("house dice are fair dice flipped: 2↔6, 3↔5, 12↔8, 11↔9, with 4, 7 and 10 unchanged", () => {
    expect([HOUSE_WEIGHTS[2], HOUSE_WEIGHTS[6]]).toEqual([FAIR_WEIGHTS[6], FAIR_WEIGHTS[2]]);
    expect([HOUSE_WEIGHTS[12], HOUSE_WEIGHTS[8]]).toEqual([FAIR_WEIGHTS[8], FAIR_WEIGHTS[12]]);
    expect([HOUSE_WEIGHTS[3], HOUSE_WEIGHTS[11]]).toEqual([FAIR_WEIGHTS[5], FAIR_WEIGHTS[9]]);
    expect([HOUSE_WEIGHTS[4], HOUSE_WEIGHTS[7], HOUSE_WEIGHTS[10]]).toEqual([FAIR_WEIGHTS[4], FAIR_WEIGHTS[7], FAIR_WEIGHTS[10]]);
  });

  it("fair dice match the normal odds, and each die is even", () => {
    const { totals, faces } = tally("fair", 7);
    expect(chiSquare(totals, FAIR_WEIGHTS)).toBeLessThan(CHI_LIMIT);
    for (let f = 1; f <= 6; f++) expect(faces[f]! / (2 * N)).toBeCloseTo(1 / 6, 2);
  });

  it("house dice match the flipped odds", () => {
    const { totals } = tally("house", 7);
    expect(chiSquare(totals, HOUSE_WEIGHTS)).toBeLessThan(CHI_LIMIT);
    expect(chiSquare(totals, FAIR_WEIGHTS)).toBeGreaterThan(1000);
    expect(totals[7]! / N).toBeCloseTo(1 / 6, 2);
    expect(totals[2]! / N).toBeCloseTo(5 / 36, 2);
    expect(totals[8]! / N).toBeCloseTo(1 / 36, 2);
  });

  it("house dice still show real faces 1–6 that add up, in both orders", () => {
    const { pairs } = tally("house", 3);
    expect(pairs.size).toBe(36);
    for (let t = 2; t <= 12; t++) {
      for (let i = 0; i < 50; i++) {
        const [a, b] = facesFor(t, rng(t * 100 + i));
        expect(a + b).toBe(t);
        expect(a).toBeGreaterThanOrEqual(1);
        expect(b).toBeLessThanOrEqual(6);
      }
    }
  });
});
