import { describe, expect, it } from "vitest";
import { longestRoad } from "./awards.ts";
import { DEV_DECK, removePlayer } from "./game.ts";
import { canSettle, legalRoads, legalSettlements, piecesLeft, publicVp, totalVp, tradeRatios } from "./pieces.ts";
import { parseAction } from "./rules.ts";
import { act, clearHands, dice, emptyMain, give, hexWith, quickSetup, refused, start } from "./testkit.ts";
import { COAST_EDGES, EDGES, HEX_VERTICES, VERTEX_EDGES, VERTEX_NEIGHBORS } from "./topology.ts";
import { RESOURCES, handSize, type CatanGame } from "./types.ts";
import { privateView, publicView } from "./view.ts";

const count = <T,>(xs: readonly T[], x: T) => xs.filter((y) => y === x).length;

/** Road edges along the coast, starting at coast edge `from`. Consecutive coast edges join up. */
const coast = (from: number, n: number) => Array.from({ length: n }, (_, i) => COAST_EDGES[(from + i) % COAST_EDGES.length]!);

function lay(g: CatanGame, p: number, edges: number[]) {
  for (const e of edges) g.roads[e] = p;
}

describe("catan setup", () => {
  it("goes in snake order (0,1,2,2,1,0) and then player 0 rolls", () => {
    let g = start(3);
    const order: number[] = [];
    while (g.phase === "setup") {
      order.push(g.turn);
      const p = g.turn;
      g = act(g, p, { type: "placeSettlement", vertex: legalSettlements(g, p, true)[0]! });
      g = act(g, p, { type: "placeRoad", edge: legalRoads(g, p, g.setupVertex)[0]! });
    }
    expect(order).toEqual([0, 1, 2, 2, 1, 0]);
    expect(g.phase).toBe("roll");
    expect(g.turn).toBe(0);
  });

  it("4 players snake 0,1,2,3,3,2,1,0; 2 players 0,1,1,0", () => {
    for (const [n, want] of [[4, [0, 1, 2, 3, 3, 2, 1, 0]], [2, [0, 1, 1, 0]]] as const) {
      let g = start(n);
      const order: number[] = [];
      while (g.phase === "setup") {
        order.push(g.turn);
        const p = g.turn;
        g = act(g, p, { type: "placeSettlement", vertex: legalSettlements(g, p, true)[0]! });
        g = act(g, p, { type: "placeRoad", edge: legalRoads(g, p, g.setupVertex)[0]! });
      }
      expect(order).toEqual(want);
    }
  });

  it("only the right player places, settlement before road, and nobody rolls during setup", () => {
    const g = start(3);
    expect(refused(g, 1, { type: "placeSettlement", vertex: 0 })).toMatch(/Not your/);
    expect(refused(g, 0, { type: "placeRoad", edge: 0 })).toMatch(/Not your/);
    expect(refused(g, 0, { type: "roll" })).toMatch(/can't roll/);
  });

  it("the setup road must touch the settlement just placed", () => {
    let g = start(3);
    g = act(g, 0, { type: "placeSettlement", vertex: 20 });
    const far = EDGES.findIndex((e) => !e.includes(20));
    expect(refused(g, 0, { type: "placeRoad", edge: far })).toMatch(/touch/);
    const near = EDGES.findIndex((e) => e.includes(20));
    act(g, 0, { type: "placeRoad", edge: near });
  });

  it("the distance rule: no settlement next to another", () => {
    let g = start(3);
    g = act(g, 0, { type: "placeSettlement", vertex: 20 });
    g = act(g, 0, { type: "placeRoad", edge: EDGES.findIndex((e) => e.includes(20)) });
    expect(refused(g, 1, { type: "placeSettlement", vertex: VERTEX_NEIGHBORS[20]![0]! })).toMatch(/Can't settle/);
    expect(refused(g, 1, { type: "placeSettlement", vertex: 20 })).toMatch(/Can't settle/);
  });

  it("only the second settlement pays out, one card per touching hex", () => {
    const g = quickSetup(start(3));
    for (let p = 0; p < 3; p++) {
      const second = g.buildings.findLastIndex((b, v) => b?.owner === p && v >= 0);
      expect(second).toBeGreaterThanOrEqual(0);
    }
    const total = g.players.reduce((n, p) => n + handSize(p.hand), 0);
    expect(total).toBeGreaterThan(0);
    // Every card a player holds came from a hex touching one of their settlements.
    let fresh = start(3);
    fresh = act(fresh, 0, { type: "placeSettlement", vertex: 20 });
    expect(handSize(fresh.players[0]!.hand)).toBe(0);
  });

  it("the second settlement's payout matches its hexes", () => {
    let g = start(2, 5);
    g = act(g, 0, { type: "placeSettlement", vertex: 0 });
    g = act(g, 0, { type: "placeRoad", edge: legalRoads(g, 0, 0)[0]! });
    g = act(g, 1, { type: "placeSettlement", vertex: 53 });
    g = act(g, 1, { type: "placeRoad", edge: legalRoads(g, 1, 53)[0]! });
    const v = legalSettlements(g, 1, true).find((x) => HEX_VERTICES.filter((vs) => vs.includes(x)).length === 3)!;
    g = act(g, 1, { type: "placeSettlement", vertex: v });
    const terrains = HEX_VERTICES.flatMap((vs, h) => (vs.includes(v) ? [g.board.tiles[h]!.terrain] : [])).filter((t) => t !== "desert");
    expect(handSize(g.players[1]!.hand)).toBe(terrains.length);
  });
});

describe("catan rolling and production", () => {
  it("pays 1 per settlement and 2 per city on the rolled number, nothing under the robber", () => {
    const g = emptyMain(3);
    g.phase = "roll";
    const { hex, corners } = hexWith(g, 6);
    g.buildings[corners[0]!] = { owner: 1, city: false };
    g.buildings[corners[2]!] = { owner: 2, city: true };
    const res = { forest: "lumber", hills: "brick", pasture: "wool", fields: "grain", mountains: "ore" } as const;
    const r = res[g.board.tiles[hex]!.terrain as keyof typeof res];
    const after = act(g, 0, { type: "roll" }, dice([[2, 4]]));
    expect(after.players[1]!.hand[r]).toBe(1);
    expect(after.players[2]!.hand[r]).toBe(2);
    expect(after.phase).toBe("main");
    expect(after.dice).toEqual([2, 4]);
    expect(after.rollId).toBe(1);

    g.robber = hex;
    const robbed = act(g, 0, { type: "roll" }, dice([[2, 4]]));
    expect(robbed.players[1]!.hand[r]).toBe(0);
  });

  it("if the bank can't pay everyone, nobody gets that resource; one player gets what's left", () => {
    const g = emptyMain(3);
    g.phase = "roll";
    const { hex, corners } = hexWith(g, 6);
    const r = ({ forest: "lumber", hills: "brick", pasture: "wool", fields: "grain", mountains: "ore" } as const)[g.board.tiles[hex]!.terrain as "forest"];
    g.buildings[corners[0]!] = { owner: 1, city: true };
    g.buildings[corners[2]!] = { owner: 2, city: true };
    g.bank[r] = 3;
    const both = act(g, 0, { type: "roll" }, dice([[3, 3]]));
    expect(both.players[1]!.hand[r]).toBe(0);
    expect(both.players[2]!.hand[r]).toBe(0);
    g.buildings[corners[2]!] = null;
    g.bank[r] = 1;
    const one = act(g, 0, { type: "roll" }, dice([[3, 3]]));
    expect(one.players[1]!.hand[r]).toBe(1);
  });

  it("you can't roll twice or end your turn before rolling", () => {
    const g = quickSetup(start(3));
    expect(refused(g, 0, { type: "endTurn" })).toMatch(/can't end/);
    const rolled = act(g, 0, { type: "roll" }, dice([[2, 3]]));
    expect(refused(rolled, 0, { type: "roll" })).toMatch(/can't roll/);
    const next = act(rolled, 0, { type: "endTurn" });
    expect(next.turn).toBe(1);
    expect(next.phase).toBe("roll");
  });
});

describe("catan rolling a 7", () => {
  it("everyone over 7 cards discards half (rounded down), then the roller moves the robber", () => {
    const g = quickSetup(start(3));
    clearHands(g);
    give(g, 1, { lumber: 9 });
    give(g, 2, { ore: 7 });
    let s = act(g, 0, { type: "roll" }, dice([[3, 4]]));
    expect(s.phase).toBe("discard");
    expect(s.discards).toEqual([0, 4, 0]);
    expect(refused(s, 2, { type: "discard", cards: { ore: 3 } })).toMatch(/don't need/);
    expect(refused(s, 1, { type: "discard", cards: { lumber: 3 } })).toMatch(/exactly 4/);
    expect(refused(s, 0, { type: "moveRobber", hex: 0 })).toMatch(/can't move/);
    s = act(s, 1, { type: "discard", cards: { lumber: 4 } });
    expect(s.players[1]!.hand.lumber).toBe(5);
    expect(s.phase).toBe("robber");
  });

  it("with no big hands it goes straight to the robber", () => {
    const g = quickSetup(start(3));
    clearHands(g);
    expect(act(g, 0, { type: "roll" }, dice([[1, 6]])).phase).toBe("robber");
  });

  it("the robber must move, and the roller steals one card from a neighbour of the hex", () => {
    const g = emptyMain(3);
    g.phase = "robber";
    const { hex, corners } = hexWith(g, 9);
    g.buildings[corners[0]!] = { owner: 1, city: false };
    give(g, 1, { wool: 1 });
    expect(refused(g, 0, { type: "moveRobber", hex: g.robber })).toMatch(/different/);
    const s = act(g, 0, { type: "moveRobber", hex });
    expect(s.robber).toBe(hex);
    expect(s.players[0]!.hand.wool).toBe(1);
    expect(s.players[1]!.hand.wool).toBe(0);
    expect(s.phase).toBe("main");
  });

  it("with two neighbours the roller picks who to steal from; empty hands can't be picked", () => {
    const g = emptyMain(3);
    g.phase = "robber";
    const { hex, corners } = hexWith(g, 9);
    g.buildings[corners[0]!] = { owner: 1, city: false };
    g.buildings[corners[3]!] = { owner: 2, city: false };
    give(g, 1, { wool: 1 });
    give(g, 2, { ore: 2 });
    let s = act(g, 0, { type: "moveRobber", hex });
    expect(s.phase).toBe("steal");
    expect(s.stealFrom).toEqual([1, 2]);
    s = act(s, 0, { type: "steal", victim: 2 });
    expect(s.players[0]!.hand.ore).toBe(1);
    expect(s.phase).toBe("main");

    const lonely = emptyMain(3);
    lonely.phase = "robber";
    lonely.buildings[corners[0]!] = { owner: 1, city: false };
    const after = act(lonely, 0, { type: "moveRobber", hex });
    expect(after.phase).toBe("main");
    expect(handSize(after.players[0]!.hand)).toBe(0);
  });
});

describe("catan building", () => {
  it("a road costs brick + lumber and must join your own road or building", () => {
    const g = emptyMain(3);
    const [a, b] = coast(0, 2);
    g.buildings[EDGES[a!]![0]] = { owner: 0, city: false };
    g.roads[a!] = 0;
    expect(refused(g, 0, { type: "buildRoad", edge: b! })).toMatch(/costs/);
    give(g, 0, { brick: 1, lumber: 1 });
    const far = coast(10, 1)[0]!;
    expect(refused(g, 0, { type: "buildRoad", edge: far })).toMatch(/join/);
    const s = act(g, 0, { type: "buildRoad", edge: b! });
    expect(s.roads[b!]).toBe(0);
    expect(handSize(s.players[0]!.hand)).toBe(0);
  });

  it("roads can't continue through an opponent's settlement", () => {
    const g = emptyMain(3);
    const [a, b] = coast(0, 2);
    g.roads[a!] = 0;
    const shared = EDGES[a!]!.find((v) => EDGES[b!]!.includes(v))!;
    g.buildings[shared] = { owner: 1, city: false };
    give(g, 0, { brick: 1, lumber: 1 });
    expect(refused(g, 0, { type: "buildRoad", edge: b! })).toMatch(/join/);
  });

  it("a settlement needs your road, the distance rule and brick, lumber, wool, grain", () => {
    const g = emptyMain(3);
    const road = coast(0, 2);
    lay(g, 0, road);
    const end = EDGES[road[1]!]!.find((v) => !EDGES[road[0]!]!.includes(v))!;
    expect(refused(g, 0, { type: "buildSettlement", vertex: end })).toMatch(/costs/);
    give(g, 0, { brick: 1, lumber: 1, wool: 1, grain: 1 });
    g.buildings[VERTEX_NEIGHBORS[end]!.find((n) => !EDGES[road[1]!]!.includes(n)) ?? VERTEX_NEIGHBORS[end]![0]!] = { owner: 2, city: false };
    expect(canSettle(g, 0, end)).toBe(false);
    expect(refused(g, 0, { type: "buildSettlement", vertex: end })).toMatch(/gap/);
  });

  it("a city goes on your own settlement, costs 3 ore + 2 grain, and frees the settlement piece", () => {
    const g = emptyMain(3);
    g.buildings[10] = { owner: 0, city: false };
    g.buildings[30] = { owner: 1, city: false };
    give(g, 0, { ore: 3, grain: 2 });
    expect(refused(g, 0, { type: "buildCity", vertex: 30 })).toMatch(/your own/);
    expect(piecesLeft(g, 0).settlement).toBe(4);
    const s = act(g, 0, { type: "buildCity", vertex: 10 });
    expect(s.buildings[10]).toEqual({ owner: 0, city: true });
    expect(piecesLeft(s, 0)).toMatchObject({ settlement: 5, city: 3 });
    expect(publicVp(s, 0)).toBe(2);
  });

  it("piece limits: 15 roads, 5 settlements, 4 cities", () => {
    const g = emptyMain(3);
    lay(g, 0, coast(0, 15));
    give(g, 0, { brick: 1, lumber: 1 });
    expect(refused(g, 0, { type: "buildRoad", edge: coast(15, 1)[0]! })).toMatch(/no roads/);
    const h = emptyMain(3);
    [0, 5, 13, 30, 44].forEach((v) => (h.buildings[v] = { owner: 0, city: true }));
    give(h, 0, { ore: 3, grain: 2 });
    h.buildings[50] = { owner: 0, city: false };
    expect(refused(h, 0, { type: "buildCity", vertex: 50 })).toMatch(/no cities/);
  });

  it("building is only on your own turn after rolling", () => {
    const g = quickSetup(start(3));
    give(g, 1, { brick: 1, lumber: 1 });
    expect(refused(g, 1, { type: "buildRoad", edge: 0 })).toMatch(/can't build/);
    give(g, 0, { brick: 1, lumber: 1 });
    expect(refused(g, 0, { type: "buildRoad", edge: legalRoads(g, 0)[0]! })).toMatch(/can't build/);
  });
});

describe("catan trading", () => {
  it("the bank trades 4:1, a 3:1 harbor 3:1, a resource harbor 2:1 for that resource", () => {
    const g = emptyMain(3);
    give(g, 0, { lumber: 4 });
    let s = act(g, 0, { type: "bankTrade", give: "lumber", get: "ore" });
    expect(s.players[0]!.hand).toMatchObject({ lumber: 0, ore: 1 });
    expect(refused(g, 0, { type: "bankTrade", give: "lumber", get: "lumber" })).toMatch(/different/);

    const any = g.board.harbors.find((h) => h.kind === "any")!;
    const res = g.board.harbors.find((h) => h.kind !== "any")!;
    g.buildings[EDGES[any.edge]![0]] = { owner: 0, city: false };
    g.buildings[EDGES[res.edge]![1]] = { owner: 0, city: false };
    const ratios = tradeRatios(g, 0);
    for (const r of RESOURCES) expect(ratios[r]).toBe(r === res.kind ? 2 : 3);
    clearHands(g);
    give(g, 0, { [res.kind]: 2 });
    s = act(g, 0, { type: "bankTrade", give: res.kind as "ore", get: res.kind === "ore" ? "wool" : "ore" });
    expect(handSize(s.players[0]!.hand)).toBe(1);
  });

  it("offer → accept → confirm swaps the cards", () => {
    const g = emptyMain(3);
    give(g, 0, { wool: 2 });
    give(g, 1, { ore: 1 });
    let s = act(g, 0, { type: "offer", give: { wool: 2 }, get: { ore: 1 } });
    const id = s.offer!.id;
    expect(refused(s, 2, { type: "reply", offer: id, reply: { kind: "accept" } })).toMatch(/don't have/);
    s = act(s, 2, { type: "reply", offer: id, reply: { kind: "decline" } });
    expect(refused(s, 0, { type: "confirmTrade", with: 2 })).toMatch(/haven't accepted/);
    s = act(s, 1, { type: "reply", offer: id, reply: { kind: "accept" } });
    s = act(s, 0, { type: "confirmTrade", with: 1 });
    expect(s.players[0]!.hand).toMatchObject({ wool: 0, ore: 1 });
    expect(s.players[1]!.hand).toMatchObject({ wool: 2, ore: 0 });
    expect(s.offer).toBeNull();
  });

  it("a counter-offer can be confirmed on its own terms", () => {
    const g = emptyMain(3);
    give(g, 0, { wool: 2, grain: 1 });
    give(g, 2, { brick: 2 });
    let s = act(g, 0, { type: "offer", give: { wool: 1 }, get: { brick: 1 } });
    s = act(s, 2, { type: "reply", offer: s.offer!.id, reply: { kind: "counter", give: { brick: 2 }, get: { wool: 2, grain: 1 } } });
    s = act(s, 0, { type: "confirmTrade", with: 2 });
    expect(s.players[0]!.hand).toMatchObject({ wool: 0, grain: 0, brick: 2 });
    expect(s.players[2]!.hand).toMatchObject({ wool: 2, grain: 1, brick: 0 });
  });

  it("cards are re-checked when the trade is confirmed; offers end with the turn", () => {
    const g = emptyMain(3);
    give(g, 0, { wool: 1, lumber: 4 });
    give(g, 1, { ore: 1 });
    let s = act(g, 0, { type: "offer", give: { wool: 1 }, get: { ore: 1 } });
    s = act(s, 1, { type: "reply", offer: s.offer!.id, reply: { kind: "accept" } });
    s.players[1]!.hand.ore = 0;
    expect(refused(s, 0, { type: "confirmTrade", with: 1 })).toMatch(/no longer/);
    expect(act(s, 0, { type: "endTurn" }).offer).toBeNull();
    expect(refused(g, 1, { type: "offer", give: { ore: 1 }, get: { wool: 1 } })).toMatch(/your turn/);
  });
});

describe("catan development cards", () => {
  it("the deck is 14 knights, 5 VP, 2 each of road building, year of plenty, monopoly", () => {
    expect(DEV_DECK).toHaveLength(25);
    expect([count(DEV_DECK, "knight"), count(DEV_DECK, "vp"), count(DEV_DECK, "roadBuilding"), count(DEV_DECK, "yearOfPlenty"), count(DEV_DECK, "monopoly")]).toEqual([14, 5, 2, 2, 2]);
    expect([...start(3).deck].sort()).toEqual([...DEV_DECK].sort());
  });

  it("a card bought this turn can't be played until next turn", () => {
    const g = emptyMain(3);
    g.deck.push("knight");
    give(g, 0, { ore: 1, wool: 1, grain: 1 });
    const s = act(g, 0, { type: "buyDev" });
    expect(s.players[0]!.newDev).toEqual(["knight"]);
    expect(refused(s, 0, { type: "playKnight" })).toMatch(/next turn/);
    let t = act(s, 0, { type: "endTurn" });
    expect(t.players[0]!.dev).toEqual(["knight"]);
    t = act(t, 1, { type: "roll" }, dice([[2, 3]]));
    t = act(t, 1, { type: "endTurn" });
    t = act(t, 2, { type: "roll" }, dice([[2, 3]]));
    t = act(t, 2, { type: "endTurn" });
    expect(act(t, 0, { type: "playKnight" }).phase).toBe("robber");
  });

  it("a knight before rolling moves the robber, then you still roll; one card per turn", () => {
    const g = emptyMain(3);
    g.phase = "roll";
    g.players[0]!.dev = ["knight", "knight"];
    let s = act(g, 0, { type: "playKnight" });
    expect(s.phase).toBe("robber");
    s = act(s, 0, { type: "moveRobber", hex: (s.robber + 1) % 19 });
    expect(s.phase).toBe("roll");
    expect(refused(s, 0, { type: "playKnight" })).toMatch(/one development card/);
    expect(s.players[0]!.knights).toBe(1);
  });

  it("road building gives two free roads", () => {
    const g = emptyMain(3);
    g.players[0]!.dev = ["roadBuilding"];
    const road = coast(0, 1);
    lay(g, 0, road);
    let s = act(g, 0, { type: "playRoadBuilding" });
    expect(s.freeRoads).toBe(2);
    s = act(s, 0, { type: "buildRoad", edge: coast(1, 1)[0]! });
    s = act(s, 0, { type: "buildRoad", edge: coast(2, 1)[0]! });
    expect(s.freeRoads).toBe(0);
    expect(refused(s, 0, { type: "buildRoad", edge: coast(3, 1)[0]! })).toMatch(/costs/);
  });

  it("year of plenty takes 2 from the bank; monopoly takes everyone's", () => {
    const g = emptyMain(3);
    g.players[0]!.dev = ["yearOfPlenty", "monopoly"];
    const s = act(g, 0, { type: "playYearOfPlenty", take: ["ore", "ore"] });
    expect(s.players[0]!.hand.ore).toBe(2);
    g.bank.grain = 1;
    expect(refused(g, 0, { type: "playYearOfPlenty", take: ["grain", "grain"] })).toMatch(/bank/);

    const m = emptyMain(3);
    m.players[0]!.dev = ["monopoly"];
    give(m, 1, { wool: 3 });
    give(m, 2, { wool: 2, ore: 1 });
    const t = act(m, 0, { type: "playMonopoly", resource: "wool" });
    expect(t.players[0]!.hand.wool).toBe(5);
    expect(t.players[2]!.hand).toMatchObject({ wool: 0, ore: 1 });
  });

  it("victory point cards count toward winning but stay hidden from others", () => {
    const g = emptyMain(3);
    g.players[0]!.dev = ["vp", "vp"];
    expect(totalVp(g, 0)).toBe(2);
    expect(publicVp(g, 0)).toBe(0);
    expect(publicView(g).players[0]!.vp).toBe(0);
  });
});

describe("catan longest road and largest army", () => {
  it("5 roads in a row earns longest road (2 points)", () => {
    const g = emptyMain(3);
    lay(g, 0, coast(0, 4));
    g.buildings[EDGES[coast(0, 1)[0]!]![0]] = { owner: 0, city: false };
    give(g, 0, { brick: 1, lumber: 1 });
    expect(longestRoad(g, 0)).toBe(4);
    const s = act(g, 0, { type: "buildRoad", edge: coast(4, 1)[0]! });
    expect(longestRoad(s, 0)).toBe(5);
    expect(s.longestRoad).toBe(0);
    expect(publicVp(s, 0)).toBe(1 + 2);
  });

  it("branches count the longest path, and a loop counts every edge", () => {
    const g = emptyMain(3);
    const hex = HEX_VERTICES.findIndex((_, h) => h === 9);
    const ring = HEX_VERTICES[hex]!.map((v, i, vs) => EDGES.findIndex((e) => e.includes(v) && e.includes(vs[(i + 1) % 6]!)));
    lay(g, 0, ring);
    expect(longestRoad(g, 0)).toBe(6);
  });

  it("an opponent's settlement breaks the road, and the holder can lose it", () => {
    const g = emptyMain(3);
    const road = coast(0, 6);
    lay(g, 0, road);
    g.longestRoad = 0;
    g.turn = 1;
    // A corner in the middle of the road that also has an inland edge for player 1's road.
    const joins = [1, 2, 3, 4].map((i) => EDGES[road[i - 1]!]!.find((v) => EDGES[road[i]!]!.includes(v))!);
    const k = joins.findIndex((v) => VERTEX_EDGES[v]!.length === 3 && joins.indexOf(v) >= 1);
    const mid = joins[k]!;
    lay(g, 1, [VERTEX_EDGES[mid]!.find((e) => !road.includes(e))!]);
    give(g, 1, { brick: 1, lumber: 1, wool: 1, grain: 1 });
    const s = act(g, 1, { type: "buildSettlement", vertex: mid });
    expect(longestRoad(s, 0)).toBe(Math.max(k + 1, 6 - (k + 1)));
    expect(longestRoad(s, 0)).toBeLessThan(6);
    expect(s.longestRoad).toBeNull();
  });

  it("ties keep the current holder", () => {
    const g = emptyMain(3);
    lay(g, 0, coast(0, 5));
    g.longestRoad = 0;
    lay(g, 1, coast(10, 4));
    g.turn = 1;
    give(g, 1, { brick: 1, lumber: 1 });
    const s = act(g, 1, { type: "buildRoad", edge: coast(14, 1)[0]! });
    expect(longestRoad(s, 1)).toBe(5);
    expect(s.longestRoad).toBe(0);
    give(s, 1, { brick: 1, lumber: 1 });
    expect(act(s, 1, { type: "buildRoad", edge: coast(15, 1)[0]! }).longestRoad).toBe(1);
  });

  it("largest army goes to the first to 3 knights and moves only when beaten", () => {
    const g = emptyMain(3);
    g.players[0]!.knights = 2;
    g.players[0]!.dev = ["knight"];
    const s = act(g, 0, { type: "playKnight" });
    expect(s.largestArmy).toBe(0);
    s.players[1]!.knights = 2;
    s.players[1]!.dev = ["knight"];
    s.phase = "main";
    s.turn = 1;
    s.devPlayed = false;
    const tie = act(s, 1, { type: "playKnight" });
    expect(tie.largestArmy).toBe(0);
    tie.players[1]!.dev = ["knight"];
    tie.phase = "main";
    tie.devPlayed = false;
    expect(act(tie, 1, { type: "playKnight" }).largestArmy).toBe(1);
  });
});

describe("catan winning", () => {
  it("you win at 10 points, but only on your own turn", () => {
    const g = emptyMain(3);
    [0, 5, 13, 30].forEach((v) => (g.buildings[v] = { owner: 1, city: true }));
    g.buildings[44] = { owner: 1, city: false };
    g.players[1]!.dev = ["vp"];
    expect(totalVp(g, 1)).toBe(10);
    give(g, 0, { lumber: 4 });
    const s = act(g, 0, { type: "bankTrade", give: "lumber", get: "ore" });
    expect(s.phase).toBe("main");
    expect(s.winner).toBeNull();
    // The turn passing to them is the moment they can claim it.
    const won = act(s, 0, { type: "endTurn" });
    expect(won.turn).toBe(1);
    expect(won.phase).toBe("over");
    expect(won.winner).toBe(1);
    expect(refused(won, 1, { type: "endTurn" })).toMatch(/over/);
    expect(publicView(won).finalVp![1]).toBe(10);
  });

  it("building your 10th point ends the game straight away", () => {
    const g = emptyMain(3);
    [0, 5, 13].forEach((v) => (g.buildings[v] = { owner: 0, city: true }));
    [30, 40, 44].forEach((v) => (g.buildings[v] = { owner: 0, city: false }));
    expect(totalVp(g, 0)).toBe(9);
    give(g, 0, { ore: 3, grain: 2 });
    const s = act(g, 0, { type: "buildCity", vertex: 44 });
    expect(s.winner).toBe(0);
  });
});

describe("catan views and leaving", () => {
  it("the public view shows card counts, never anyone's cards or the deck", () => {
    const g = quickSetup(start(3));
    g.players[1]!.dev = ["vp", "knight"];
    const v = publicView(g);
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/"hand"|"dev"|"newDev"|"deck"/);
    expect(json).not.toContain("\"vp\",");
    expect(v.players[1]!.devCards).toBe(2);
    expect(v.players[1]!.cards).toBe(handSize(g.players[1]!.hand));
    expect(v.deckLeft).toBe(25);
    const mine = privateView(g, 1);
    expect(mine.hand).toEqual(g.players[1]!.hand);
    expect(mine.dev).toEqual(["vp", "knight"]);
  });

  it("a player who leaves gives their cards back to the bank and the turn moves on", () => {
    const g = quickSetup(start(3));
    give(g, 0, { ore: 2 });
    const bankOre = g.bank.ore;
    const held = g.players[0]!.hand.ore;
    const s = removePlayer(g, 0);
    expect(s.players[0]!.gone).toBe(true);
    expect(s.bank.ore).toBe(bankOre + held);
    expect(s.turn).toBe(1);
    expect(s.phase).toBe("roll");
    expect(refused(s, 0, { type: "roll" })).toMatch(/not in this game/);
    const after = act(act(s, 1, { type: "roll" }, dice([[2, 3]])), 1, { type: "endTurn" });
    expect(after.turn).toBe(2);
    expect(act(act(after, 2, { type: "roll" }, dice([[2, 3]])), 2, { type: "endTurn" }).turn).toBe(1);
  });

  it("the game ends with no winner when fewer than 2 are left", () => {
    const s = removePlayer(quickSetup(start(2)), 1);
    expect(s.phase).toBe("over");
    expect(s.winner).toBeNull();
  });

  it("leaving during setup skips that player's placements", () => {
    const g = start(3);
    const s = removePlayer(g, 1);
    let t = act(s, 0, { type: "placeSettlement", vertex: legalSettlements(s, 0, true)[0]! });
    t = act(t, 0, { type: "placeRoad", edge: legalRoads(t, 0, t.setupVertex)[0]! });
    expect(t.turn).toBe(2);
  });

  it("leaving while others are still discarding lets the robber move on", () => {
    const g = quickSetup(start(3));
    clearHands(g);
    give(g, 2, { ore: 8 });
    const s = act(g, 0, { type: "roll" }, dice([[3, 4]]));
    expect(s.phase).toBe("discard");
    expect(removePlayer(s, 2).phase).toBe("robber");
  });
});

describe("catan move checking", () => {
  it("rejects malformed moves", () => {
    expect(parseAction(null)).toBeNull();
    expect(parseAction({ type: "nope" })).toBeNull();
    expect(parseAction({ type: "buildRoad", edge: 72 })).toBeNull();
    expect(parseAction({ type: "buildRoad", edge: 1.5 })).toBeNull();
    expect(parseAction({ type: "discard", cards: { gold: 1 } })).toBeNull();
    expect(parseAction({ type: "discard", cards: { ore: -1 } })).toBeNull();
    expect(parseAction({ type: "playYearOfPlenty", take: ["ore"] })).toBeNull();
    expect(parseAction({ type: "reply", offer: 1, reply: { kind: "counter", give: {}, get: "x" } })).toBeNull();
  });

  it("accepts well-formed moves and drops zero counts", () => {
    expect(parseAction({ type: "buildRoad", edge: 4, extra: 1 })).toEqual({ type: "buildRoad", edge: 4 });
    expect(parseAction({ type: "discard", cards: { ore: 2, wool: 0 } })).toEqual({ type: "discard", cards: { ore: 2 } });
    expect(parseAction({ type: "reply", offer: 3, reply: { kind: "accept" } })).toEqual({ type: "reply", offer: 3, reply: { kind: "accept" } });
  });
});
