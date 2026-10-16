import { C4_SEATS, type C4Game } from "@den/shared";
import { describe, expect, it } from "vitest";
import { Connect4 } from "./connect4.ts";
import { C4Table, Player } from "./PartyState.ts";

/** Two bears next to the two chairs. `first` = the random number that picks who goes first. */
function table(first = 0.9) {
  const t = new C4Table();
  const c4 = new Connect4(() => first);
  c4.setup(t);
  const players = new Map<string, Player>();
  ["Ann", "Bob"].forEach((name, i) => {
    const p = new Player();
    p.name = name;
    const s = C4_SEATS[i]!;
    Object.assign(p, { x: s.x, y: s.y, z: s.z + (i === 0 ? -0.55 : 0.55) }); // behind the chair, away from the table
    players.set(`s${i}`, p);
  });
  return { t, c4, players };
}
const view = (t: C4Table) => JSON.parse(t.view) as C4Game;

function started(first = 0.9) {
  const x = table(first);
  expect(x.c4.sit(x.t, "s0", x.players.get("s0")!, 0)).toBe(true);
  expect(x.c4.start(x.t, "s0", x.players)).toBe(false); // needs both chairs
  expect(x.c4.sit(x.t, "s1", x.players.get("s1")!, 1)).toBe(true);
  expect(x.c4.start(x.t, "s1", x.players)).toBe(true);
  return x;
}

describe("connect four table", () => {
  it("you sit in a free chair you're next to", () => {
    const { t, c4, players } = table();
    expect(c4.sit(t, "s0", players.get("s0")!, 1)).toBe(false); // the chair across the table
    expect(c4.sit(t, "s0", players.get("s0")!, 0)).toBe(true);
    expect(c4.sit(t, "s0", players.get("s0")!, 0)).toBe(false);
    expect([...t.seats]).toEqual(["s0", ""]);
    expect(c4.stand(t, "s0")).toBe(true);
    expect([...t.seats]).toEqual(["", ""]);
  });

  it("a random bear goes first; moves go in turn and a win is reported once", () => {
    const { t, c4 } = started(0.9);
    expect(view(t).players.map((p) => p.id)).toEqual(["s0", "s1"]);
    expect(c4.act(t, "s1", { type: "drop", col: 0 })).toBe("It's not your turn");
    expect(c4.act(t, "s0", { type: "drop", col: 9 })).toBe("That move doesn't make sense");
    for (const [id, col] of [["s0", 0], ["s1", 6], ["s0", 1], ["s1", 6], ["s0", 2], ["s1", 6], ["s0", 3]] as const) expect(c4.act(t, id, { type: "drop", col })).toBeNull();
    expect(view(t).winner).toBe(0);
    expect(c4.tick(t, 0)).toEqual({ winnerId: "s0", winnerName: "Ann", playerIds: ["s0", "s1"] });
    expect(c4.tick(t, 0)).toBeNull();
    // Rematch.
    expect(c4.start(t, "s0", new Map([["s0", Object.assign(new Player(), { name: "Ann" })], ["s1", Object.assign(new Player(), { name: "Bob" })]]))).toBe(true);
    expect(view(t).phase).toBe("play");

    const other = started(0.1);
    expect(view(other.t).players.map((p) => p.id)).toEqual(["s1", "s0"]);
  });

  it("getting up mid-game ends it with no winner", () => {
    const { t, c4 } = started();
    c4.act(t, "s0", { type: "drop", col: 3 });
    expect(c4.stand(t, "s1")).toBe(true);
    expect(view(t).phase).toBe("over");
    expect(view(t).winner).toBeNull();
    expect(c4.tick(t, 0)).toMatchObject({ winnerId: null });
  });

  it("a dropped player pauses the game for a minute, then it ends", () => {
    const { t, c4 } = started();
    c4.drop(t, "s1", 1000);
    expect(t.waitingFor).toBe("Bob");
    expect(c4.act(t, "s0", { type: "drop", col: 3 })).toBe("Waiting for a player to reconnect");
    c4.back(t, "s1");
    expect(t.waitingFor).toBe("");
    expect(c4.act(t, "s0", { type: "drop", col: 3 })).toBeNull();
    c4.drop(t, "s0", 1000);
    expect(c4.tick(t, 30_000)).toBeNull();
    expect(c4.tick(t, 61_001)).toMatchObject({ winnerId: null });
  });
});
