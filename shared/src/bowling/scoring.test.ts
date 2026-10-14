import { describe, expect, it } from "vitest";
import { finalScore, frames, isGameOver, nextBall, pinsStanding, score, validRoll } from "./scoring.ts";

const game = (...rolls: number[]) => rolls;
const repeat = (n: number, ...rolls: number[]) => Array.from({ length: n }, () => rolls).flat();

describe("bowling scoring", () => {
  it("a perfect game is 300", () => {
    const r = repeat(12, 10);
    expect(isGameOver(r)).toBe(true);
    expect(finalScore(r)).toBe(300);
    expect(frames(r).map((f) => f.total)).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
    expect(frames(r)[9]!.marks).toEqual(["X", "X", "X"]);
  });

  it("all spares (5/ every frame, 5 bonus) is 150", () => {
    const r = repeat(21, 5);
    expect(isGameOver(r)).toBe(true);
    expect(finalScore(r)).toBe(150);
    expect(frames(r)[0]!.marks).toEqual(["5", "/"]);
    expect(frames(r)[9]!.marks).toEqual(["5", "/", "5"]);
  });

  it("all nines and a gutter is 90; a gutter game is 0", () => {
    expect(finalScore(repeat(10, 9, 0))).toBe(90);
    expect(frames(repeat(10, 9, 0))[0]!.marks).toEqual(["9", "-"]);
    const g = repeat(20, 0);
    expect(isGameOver(g)).toBe(true);
    expect(finalScore(g)).toBe(0);
  });

  it("strike and spare bonuses wait for the balls they need", () => {
    expect(frames(game(10))[0]!.total).toBeNull();
    expect(frames(game(10, 3))[0]!.total).toBeNull();
    expect(frames(game(10, 3, 4)).slice(0, 2).map((f) => f.total)).toEqual([17, 24]);
    expect(frames(game(7, 3))[0]!.total).toBeNull();
    expect(frames(game(7, 3, 4)).slice(0, 2).map((f) => f.total)).toEqual([14, null]);
    expect(score(game(7, 3, 4))).toBe(14);
  });

  it("the 10th frame: open = 2 balls, spare or strike = 3", () => {
    const open = [...repeat(9, 0, 0), 4, 3];
    expect(isGameOver(open)).toBe(true);
    expect(finalScore(open)).toBe(7);
    const spare = [...repeat(9, 0, 0), 6, 4];
    expect(nextBall(spare)).toEqual({ frame: 9, ball: 2 });
    expect(pinsStanding(spare)).toBe(10);
    expect(finalScore([...spare, 10])).toBe(20);
    expect(frames([...spare, 10])[9]!.marks).toEqual(["6", "/", "X"]);
    const strike = [...repeat(9, 0, 0), 10, 7];
    expect(pinsStanding(strike)).toBe(3);
    expect(frames([...strike, 3])[9]!.marks).toEqual(["X", "7", "/"]);
    expect(finalScore([...strike, 3])).toBe(20);
    expect(pinsStanding([...repeat(9, 0, 0), 10, 10])).toBe(10);
  });

  it("knows the next ball and the pins left standing", () => {
    expect(nextBall([])).toEqual({ frame: 0, ball: 0 });
    expect(nextBall([10])).toEqual({ frame: 1, ball: 0 });
    expect(nextBall([7])).toEqual({ frame: 0, ball: 1 });
    expect(pinsStanding([7])).toBe(3);
    expect(pinsStanding([7, 2])).toBe(10);
  });

  it("refuses impossible balls", () => {
    expect(validRoll([], 10)).toBe(true);
    expect(validRoll([], 11)).toBe(false);
    expect(validRoll([7], 4)).toBe(false);
    expect(validRoll([7], 3)).toBe(true);
    expect(validRoll([], -1)).toBe(false);
    expect(validRoll([], 2.5)).toBe(false);
    expect(validRoll(repeat(12, 10), 0)).toBe(false);
  });

  it("a typical game adds up", () => {
    // X, 7/, 9-, X, X, X, 81, 6/, X, then X 9 / in the 10th
    const r = [10, 7, 3, 9, 0, 10, 10, 10, 8, 1, 6, 4, 10, 10, 9, 1];
    expect(isGameOver(r)).toBe(true);
    expect(frames(r).map((f) => f.total)).toEqual([20, 39, 48, 78, 106, 125, 134, 154, 183, 203]);
  });
});
