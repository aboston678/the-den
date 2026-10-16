import { describe, expect, it } from "vitest";
import { C4_COLS, C4_ROWS, type C4Game, applyC4, cellIndex, landingRow, leaveC4, newC4Game, parseC4Action } from "./rules.ts";
import { C4_SEATS, C4_TABLE, nearestC4Seat } from "./seats.ts";

const two = () => newC4Game([{ id: "a", name: "Ann", seat: 0 }, { id: "b", name: "Bob", seat: 1 }]);

/** Play columns in turn (red, yellow, red, …); fails the test on a refused move. */
function play(g: C4Game, cols: number[]) {
  for (const col of cols) {
    const r = applyC4(g, g.turn, { type: "drop", col });
    if (!r.ok) throw new Error(r.error);
    g = r.game;
  }
  return g;
}

describe("Connect Four", () => {
  it("discs stack up from the bottom of a column, red first, turns alternate", () => {
    let g = play(two(), [3, 3]);
    expect(g.cells[cellIndex(3, 0)]).toBe(0);
    expect(g.cells[cellIndex(3, 1)]).toBe(1);
    expect(g.turn).toBe(0);
    expect(g.last).toBe(cellIndex(3, 1));
    expect(landingRow(g.cells, 3)).toBe(2);
    g = play(g, [3, 3, 3, 3]);
    expect(landingRow(g.cells, 3)).toBe(-1);
    expect(applyC4(g, g.turn, { type: "drop", col: 3 })).toEqual({ ok: false, error: "That column is full" });
  });

  it("refuses moves out of turn", () => {
    expect(applyC4(two(), 1, { type: "drop", col: 0 })).toEqual({ ok: false, error: "It's not your turn" });
  });

  it("four across, up, and on both diagonals win", () => {
    const across = play(two(), [0, 0, 1, 1, 2, 2, 3]);
    expect(across.phase).toBe("over");
    expect(across.winner).toBe(0);
    expect(across.line.sort((a, b) => a - b)).toEqual([0, 1, 2, 3].map((c) => cellIndex(c, 0)));

    const up = play(two(), [6, 0, 6, 0, 6, 0, 6]);
    expect(up.winner).toBe(0);

    // Rising diagonal for red: (0,0) (1,1) (2,2) (3,3).
    const rising = play(two(), [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
    expect(rising.winner).toBe(0);
    expect(rising.line).toHaveLength(4);

    // The mirror image: red on the falling diagonal (3,3) (4,2) (5,1) (6,0).
    const falling = play(two(), [6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3]);
    expect(falling.winner).toBe(0);
    expect(falling.line).toHaveLength(4);
  });

  it("a full grid with no four is a draw", () => {
    // Columns filled in pairs in an order that never makes four.
    const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
    const g = play(two(), order);
    expect(g.moves).toBe(C4_COLS * C4_ROWS);
    expect(g.phase).toBe("over");
    expect(g.winner).toBeNull();
  });

  it("a player leaving ends the game with no winner", () => {
    const g = leaveC4(play(two(), [0, 1]), 1);
    expect(g.phase).toBe("over");
    expect(g.winner).toBeNull();
    expect(g.players[1]!.gone).toBe(true);
  });

  it("only takes sensible moves from a browser", () => {
    expect(parseC4Action({ type: "drop", col: 2 })).toEqual({ type: "drop", col: 2 });
    for (const bad of [null, {}, { type: "drop" }, { type: "drop", col: 7 }, { type: "drop", col: -1 }, { type: "drop", col: 1.5 }, { type: "roll" }]) {
      expect(parseC4Action(bad)).toBeNull();
    }
  });

  it("the table has two chairs facing each other across it, north and south", () => {
    expect(C4_SEATS).toHaveLength(2);
    expect(C4_SEATS[0]!.z).toBeLessThan(C4_TABLE.z);
    expect(C4_SEATS[1]!.z).toBeGreaterThan(C4_TABLE.z);
    expect(Math.cos(C4_SEATS[0]!.yaw)).toBeCloseTo(1); // north chair faces south
    expect(Math.cos(C4_SEATS[1]!.yaw)).toBeCloseTo(-1);
    expect(C4_TABLE.y).toBeLessThan(-3); // in the basement
    expect(nearestC4Seat(C4_SEATS[1]!.x, C4_SEATS[1]!.z + 0.6)).toBe(1);
    expect(nearestC4Seat(C4_SEATS[1]!.x, C4_SEATS[1]!.z + 0.6, [false, true])).toBe(-1);
  });
});
