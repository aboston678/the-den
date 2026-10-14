import { CATAN_SEATS, legalRoads, legalSettlements, type CatanView } from "@den/shared";
import { describe, expect, it } from "vitest";
import { rng } from "../../../shared/src/world/noise.ts";
import { Catan } from "./catan.ts";
import { CatanTable, Player } from "./PartyState.ts";

/** Bears standing next to chairs `seats` (by index); returns the table, the players and a Catan. */
function table(names: string[], seed = 1) {
  const t = new CatanTable();
  const catan = new Catan(rng(seed));
  catan.setup(t);
  const players = new Map<string, Player>();
  names.forEach((name, i) => {
    const p = new Player();
    p.name = name;
    const s = CATAN_SEATS[i]!;
    Object.assign(p, { x: s.x + 0.5, y: s.y, z: s.z });
    players.set(`s${i}`, p);
  });
  return { t, catan, players };
}

const view = (t: CatanTable) => JSON.parse(t.view) as CatanView;

/** Everyone sits, s0 starts. */
function started(names: string[], house = false, seed = 1) {
  const x = table(names, seed);
  names.forEach((_, i) => expect(x.catan.sit(x.t, `s${i}`, x.players.get(`s${i}`)!, i)).toBe(true));
  expect(x.catan.start(x.t, "s0", x.players, house)).toBe(true);
  return x;
}

/** Plays setup with first legal spots; returns the session id whose turn it is after. */
function setup(x: ReturnType<typeof started>) {
  for (let guard = 0; guard < 20 && view(x.t).phase === "setup"; guard++) {
    const v = view(x.t);
    const id = v.players[v.turn]!.id;
    expect(x.catan.act(x.t, id, { type: "placeSettlement", vertex: legalSettlements(gameOf(v), v.turn, true)[0] }, 0)).toBeNull();
    const v2 = view(x.t);
    expect(x.catan.act(x.t, id, { type: "placeRoad", edge: legalRoads(gameOf(v2), v2.turn, v2.setupVertex)[0] }, 0)).toBeNull();
  }
  return view(x.t).players[view(x.t).turn]!.id;
}

/** Enough of a game for the placement helpers (they only read buildings and roads). */
function gameOf(v: CatanView) {
  return { buildings: v.buildings, roads: v.roads } as unknown as Parameters<typeof legalSettlements>[0];
}

describe("catan table: sitting", () => {
  it("you sit in a free chair you're standing next to, one chair each", () => {
    const { t, catan, players } = table(["Ann", "Bob"]);
    expect(catan.sit(t, "s0", players.get("s0")!, 2)).toBe(false); // too far from the chair across the table
    expect(catan.sit(t, "s0", players.get("s0")!, 0)).toBe(true);
    expect(catan.sit(t, "s0", players.get("s0")!, 0)).toBe(false);
    players.get("s1")!.x = CATAN_SEATS[0]!.x;
    players.get("s1")!.z = CATAN_SEATS[0]!.z;
    expect(catan.sit(t, "s1", players.get("s1")!, 0)).toBe(false); // taken
    expect([...t.seats]).toEqual(["s0", "", "", ""]);
    expect(catan.stand(t, "s0")).toBe(true);
    expect([...t.seats]).toEqual(["", "", "", ""]);
  });

  it("the seats go clockwise round the table and face it", () => {
    expect(CATAN_SEATS).toHaveLength(4);
    const n = CATAN_SEATS[0]!, e = CATAN_SEATS[1]!, s = CATAN_SEATS[2]!, w = CATAN_SEATS[3]!;
    expect(n.z).toBeLessThan(s.z);
    expect(e.x).toBeGreaterThan(w.x);
    expect(Math.cos(n.yaw)).toBeCloseTo(1); // north chair faces south (+z)
    expect(Math.sin(e.yaw)).toBeCloseTo(-1); // east chair faces west
  });
});

describe("catan table: starting", () => {
  it("needs 2–4 seated bears and a seated starter", () => {
    const { t, catan, players } = table(["Ann", "Bob"]);
    catan.sit(t, "s0", players.get("s0")!, 0);
    expect(catan.start(t, "s0", players, false)).toBe(false);
    catan.sit(t, "s1", players.get("s1")!, 1);
    expect(catan.start(t, "s9", players, false)).toBe(false);
    expect(catan.start(t, "s0", players, false)).toBe(true);
    expect(view(t).phase).toBe("setup");
    expect(view(t).players.map((p) => p.name).sort()).toEqual(["Ann", "Bob"]);
    expect(catan.start(t, "s1", players, false)).toBe(false); // already running
  });

  it("getting up mid-game leaves the game: cards back to the bank, the others play on", () => {
    const x = started(["Ann", "Bob", "Cat"]);
    setup(x);
    const before = view(x.t);
    const cards = before.players.find((p) => p.id === "s0")!.cards;
    const bankTotal = (b: CatanView["bank"]) => Object.values(b).reduce((a, n) => a + n, 0);
    expect(x.catan.stand(x.t, "s0", 0)).toBe(true);
    const v = view(x.t);
    const ann = v.players.find((p) => p.id === "s0")!;
    expect([...x.t.seats]).toEqual(["", "s1", "s2", ""]);
    expect(ann.gone).toBe(true);
    expect(ann.cards).toBe(0);
    expect(bankTotal(v.bank)).toBe(bankTotal(before.bank) + cards);
    expect(v.phase).not.toBe("over");
    expect(x.catan.privateFor("s0")).toBeNull();
  });

  it("with 2 players, getting up ends the game with no winner", () => {
    const x = started(["Ann", "Bob"]);
    expect(x.catan.stand(x.t, "s1", 0)).toBe(true);
    expect(view(x.t).phase).toBe("over");
    expect(x.catan.tick(x.t, 0)!.winnerId).toBeNull();
    expect(x.catan.stand(x.t, "s0", 0)).toBe(true);
  });

  it("only the player whose turn it is can move, and bad moves say why", () => {
    const x = started(["Ann", "Bob", "Cat"]);
    const v = view(x.t);
    const other = v.players[(v.turn + 1) % 3]!.id;
    expect(x.catan.act(x.t, other, { type: "placeSettlement", vertex: 10 }, 0)).toMatch(/Not your/);
    expect(x.catan.act(x.t, "s9", { type: "roll" }, 0)).toMatch(/not in this game/);
    expect(x.catan.act(x.t, v.players[v.turn]!.id, { type: "hack" }, 0)).toMatch(/doesn't make sense/);
  });
});

describe("catan table: what gets sent", () => {
  it("the synced view never holds anyone's cards; each player's own come privately", () => {
    const x = started(["Ann", "Bob"]);
    setup(x);
    expect(x.t.view).not.toMatch(/"hand"|"dev"|"deck"/);
    const mine = x.catan.privateFor("s0")!;
    expect(mine.hand).toBeDefined();
    expect(x.catan.privateFor("s9")).toBeNull();
  });

  it("house dice: off by default, on only when asked, and off again after the game", () => {
    expect(started(["Ann", "Bob"]).catan.houseDice).toBe(false);
    const x = started(["Ann", "Bob"], true);
    expect(x.catan.houseDice).toBe(true);
    x.catan.quit(x.t, "s1", 0);
    expect(x.catan.tick(x.t, 0)).not.toBeNull();
    expect(x.catan.houseDice).toBe(false);
  });

  it("with house dice on, the table everyone sees looks exactly the same (only the dice differ)", () => {
    const fair = started(["Ann", "Bob", "Cat"], false, 5);
    const house = started(["Ann", "Bob", "Cat"], true, 5);
    expect(house.t.view).toBe(fair.t.view);
    expect([...house.t.seats]).toEqual([...fair.t.seats]);
    expect(house.t.waitingFor).toBe(fair.t.waitingFor);
    expect(house.t.toJSON()).toEqual(fair.t.toJSON());
    setup(fair);
    setup(house);
    expect(house.t.view).toBe(fair.t.view);
    expect(house.t.view).not.toMatch(/house|rig|weight/i);
  });

  it("house dice roll the flipped way through the server's own roll", () => {
    const totals = { fair: new Array<number>(13).fill(0), house: new Array<number>(13).fill(0) };
    for (const mode of ["fair", "house"] as const) {
      const x = started(["Ann", "Bob"], mode === "house", 11);
      let turnId = setup(x);
      for (let i = 0; i < 1500; i++) {
        const err = x.catan.act(x.t, turnId, { type: "roll" }, 0);
        expect(err).toBeNull();
        let v = view(x.t);
        totals[mode][v.dice![0] + v.dice![1]]!++;
        // Clear a 7 quickly: discard, move the robber, steal; then end the turn.
        for (const [i, p] of v.players.entries()) {
          if (p.discard > 0) {
            const hand = x.catan.privateFor(p.id)!.hand;
            const cards: Record<string, number> = {};
            let n = p.discard;
            for (const r of Object.keys(hand) as (keyof typeof hand)[]) {
              const k = Math.min(n, hand[r]);
              if (k) cards[r] = k;
              n -= k;
            }
            expect(x.catan.act(x.t, v.players[i]!.id, { type: "discard", cards }, 0)).toBeNull();
          }
        }
        v = view(x.t);
        if (v.phase === "robber") expect(x.catan.act(x.t, turnId, { type: "moveRobber", hex: (v.robber + 1) % 19 }, 0)).toBeNull();
        v = view(x.t);
        if (v.phase === "steal") expect(x.catan.act(x.t, turnId, { type: "steal", victim: v.stealFrom[0] }, 0)).toBeNull();
        expect(x.catan.act(x.t, turnId, { type: "endTurn" }, 0)).toBeNull();
        v = view(x.t);
        if (v.phase === "over") break;
        turnId = v.players[v.turn]!.id;
      }
    }
    const rare = (t: number[]) => t[2]! + t[12]!;
    const red = (t: number[]) => t[6]! + t[8]!;
    expect(rare(totals.house)).toBeGreaterThan(red(totals.house) * 3);
    expect(red(totals.fair)).toBeGreaterThan(rare(totals.fair) * 3);
  });
});

describe("catan table: voting to end", () => {
  it("a majority ends the game with no winner, reported once (so nothing is saved)", () => {
    const x = started(["Ann", "Bob", "Cat"]);
    expect(x.catan.act(x.t, "s2", { type: "proposeEnd" }, 1000)).toBeNull();
    expect(view(x.t).endVote?.votes).toEqual(view(x.t).players.map((p) => (p.id === "s2" ? true : null)));
    expect(x.catan.act(x.t, "s0", { type: "voteEnd", yes: true }, 2000)).toBeNull();
    expect(view(x.t).phase).toBe("over");
    const r = x.catan.tick(x.t, 2000)!;
    expect(r.winnerId).toBeNull();
    expect(x.catan.tick(x.t, 2000)).toBeNull();
  });

  it("a vote lapses after 30 s on the server's clock", () => {
    const x = started(["Ann", "Bob", "Cat"]);
    x.catan.act(x.t, "s1", { type: "proposeEnd" }, 1000);
    x.catan.tick(x.t, 30_999);
    expect(view(x.t).endVote).not.toBeNull();
    x.catan.tick(x.t, 31_000);
    expect(view(x.t).endVote).toBeNull();
    expect(view(x.t).phase).toBe("setup");
  });

  it("you can vote while the table waits for someone to reconnect", () => {
    const x = started(["Ann", "Bob", "Cat"]);
    x.catan.drop(x.t, "s2", 0);
    expect(x.catan.act(x.t, "s0", { type: "proposeEnd" }, 100)).toBeNull();
    expect(x.catan.act(x.t, "s1", { type: "voteEnd", yes: true }, 200)).toBeNull();
    expect(view(x.t).phase).toBe("over");
  });
});

describe("catan table: dropping out", () => {
  it("the game waits up to 60 s for a dropped player, then carries on without them", () => {
    const x = started(["Ann", "Bob", "Cat"]);
    const v = view(x.t);
    const dropped = v.players[(v.turn + 1) % 3]!;
    x.catan.drop(x.t, dropped.id, 1000);
    expect(x.t.waitingFor).toBe(dropped.name);
    expect(x.t.waitUntil).toBe(61_000);
    expect(x.catan.act(x.t, v.players[v.turn]!.id, { type: "placeSettlement", vertex: 10 }, 2000)).toMatch(/reconnect/);
    x.catan.back(x.t, dropped.id);
    expect(x.t.waitingFor).toBe("");
    x.catan.drop(x.t, dropped.id, 5000);
    expect(x.catan.tick(x.t, 64_000)).toBeNull();
    expect(view(x.t).players.find((p) => p.id === dropped.id)!.gone).toBe(false);
    x.catan.tick(x.t, 65_000);
    expect(view(x.t).players.find((p) => p.id === dropped.id)!.gone).toBe(true);
    expect(x.t.waitingFor).toBe("");
    expect(view(x.t).phase).toBe("setup");
  });

  it("the game ends with no winner when fewer than 2 are left, and is reported once", () => {
    const x = started(["Ann", "Bob"]);
    x.catan.leave(x.t, "s1", 0);
    expect([...x.t.seats]).toEqual(["s0", "", "", ""]);
    const r = x.catan.tick(x.t, 0)!;
    expect(r.winnerId).toBeNull();
    expect(x.catan.tick(x.t, 0)).toBeNull();
  });
});
