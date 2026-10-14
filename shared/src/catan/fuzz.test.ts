import { describe, expect, it } from "vitest";
import { rng } from "../world/noise.ts";
import { rollDice } from "./dice.ts";
import { removePlayer } from "./game.ts";
import { BANK_EACH, COSTS, has, legalCities, legalRoads, legalSettlements, piecesLeft } from "./pieces.ts";
import { apply, type CatanAction, type RuleContext } from "./rules.ts";
import { start } from "./testkit.ts";
import { HEXES } from "./topology.ts";
import { RESOURCES, handSize, type CatanGame, type Resource } from "./types.ts";

const pick = <T,>(xs: readonly T[], rand: () => number) => xs[Math.floor(rand() * xs.length)]!;

/** Moves a simple bot might try. Some may be refused; that's fine, refused moves change nothing. */
function candidates(g: CatanGame, rand: () => number): [number, CatanAction][] {
  const p = g.turn;
  const pl = g.players[p]!;
  switch (g.phase) {
    case "setup":
      return g.setupPiece === "settlement"
        ? [[p, { type: "placeSettlement", vertex: pick(legalSettlements(g, p, true), rand) }]]
        : [[p, { type: "placeRoad", edge: pick(legalRoads(g, p, g.setupVertex), rand) }]];
    case "roll":
      return pl.dev.includes("knight") && rand() < 0.3 ? [[p, { type: "playKnight" }]] : [[p, { type: "roll" }]];
    case "discard": {
      const who = g.discards.findIndex((d) => d > 0);
      const hand = { ...g.players[who]!.hand };
      const cards: Partial<Record<Resource, number>> = {};
      for (let n = g.discards[who]!; n > 0; n--) {
        const r = pick(RESOURCES.filter((x) => hand[x] > 0), rand);
        hand[r]--;
        cards[r] = (cards[r] ?? 0) + 1;
      }
      return [[who, { type: "discard", cards }]];
    }
    case "robber":
      return [[p, { type: "moveRobber", hex: pick(HEXES.map((_, h) => h).filter((h) => h !== g.robber), rand) }]];
    case "steal":
      return [[p, { type: "steal", victim: pick(g.stealFrom, rand) }]];
    case "main": {
      const out: [number, CatanAction][] = [];
      if (has(pl.hand, COSTS.city)) for (const v of legalCities(g, p)) out.push([p, { type: "buildCity", vertex: v }]);
      if (has(pl.hand, COSTS.settlement)) for (const v of legalSettlements(g, p)) out.push([p, { type: "buildSettlement", vertex: v }]);
      if (out.length === 0 && (has(pl.hand, COSTS.road) || g.freeRoads > 0) && rand() < 0.7) {
        const roads = legalRoads(g, p);
        if (roads.length) out.push([p, { type: "buildRoad", edge: pick(roads, rand) }]);
      }
      if (out.length === 0 && has(pl.hand, COSTS.dev) && rand() < 0.5) out.push([p, { type: "buyDev" }]);
      const card = pl.dev.find((c) => c !== "vp");
      if (card && !g.devPlayed && rand() < 0.3) {
        const r = pick(RESOURCES, rand);
        out.push([
          p,
          card === "knight"
            ? { type: "playKnight" }
            : card === "roadBuilding"
              ? { type: "playRoadBuilding" }
              : card === "yearOfPlenty"
                ? { type: "playYearOfPlenty", take: [r, pick(RESOURCES, rand)] }
                : { type: "playMonopoly", resource: r },
        ]);
      }
      const rich = RESOURCES.filter((r) => pl.hand[r] >= 4);
      if (rich.length && rand() < 0.6) out.push([p, { type: "bankTrade", give: pick(rich, rand), get: pick(RESOURCES, rand) }]);
      if (handSize(pl.hand) > 0 && !g.offer && rand() < 0.1) {
        const giveR = pick(RESOURCES.filter((r) => pl.hand[r] > 0), rand);
        const getR = pick(RESOURCES.filter((r) => r !== giveR), rand);
        out.push([p, { type: "offer", give: { [giveR]: 1 }, get: { [getR]: 1 } }]);
      }
      if (g.offer) {
        const other = pick(g.players.map((_, i) => i).filter((i) => i !== p), rand);
        if (g.offer.replies[other]) out.push([p, { type: "confirmTrade", with: other }]);
        else out.push([other, { type: "reply", offer: g.offer.id, reply: { kind: rand() < 0.5 ? "accept" : "decline" } }]);
      }
      out.push([p, { type: "endTurn" }]);
      return out;
    }
    default:
      return [];
  }
}

/** Throws if a card or piece was lost or invented. Plain checks (not expect) so 200 games stay quick. */
function checkInvariants(g: CatanGame) {
  const fail = (why: string) => {
    throw new Error(why);
  };
  for (const r of RESOURCES) {
    const held = g.players.reduce((n, pl) => n + pl.hand[r], 0);
    if (held + g.bank[r] !== BANK_EACH) fail(`${r}: ${held} held + ${g.bank[r]} in bank`);
    if (g.bank[r] < 0 || g.players.some((pl) => pl.hand[r] < 0)) fail(`${r} went negative`);
  }
  g.players.forEach((_, i) => {
    const left = piecesLeft(g, i);
    if (left.road < 0 || left.settlement < 0 || left.city < 0) fail(`player ${i} used too many pieces`);
  });
  const devs = g.players.reduce((n, pl) => n + pl.dev.length + pl.newDev.length + pl.knights, 0);
  if (devs + g.deck.length > 25) fail("development cards invented");
  if (g.players.some((pl) => pl.gone && handSize(pl.hand) > 0)) fail("a player who left still has cards");
}

function playOut(seed: number, n: number, house: boolean) {
  const rand = rng(seed);
  const ctx: RuleContext = { rand, roll: () => rollDice(house ? "house" : "fair", rand) };
  let g = start(n, seed);
  let moves = 0;
  let removed = false;
  while (g.phase !== "over" && moves < 20_000) {
    // Now and then someone drops out mid-game.
    if (!removed && n > 2 && seed % 10 === 0 && moves === 300) {
      g = removePlayer(g, 1);
      removed = true;
      checkInvariants(g);
    }
    const options = candidates(g, rand);
    const [p, a] = pick(options, rand);
    const r = apply(g, p, a, ctx);
    if (r.ok) {
      g = r.game;
      checkInvariants(g);
    }
    moves++;
  }
  return { g, moves };
}

describe("catan random games", () => {
  it("200 seeded games (2–4 players, fair and house dice) all finish without losing or inventing a card", () => {
    let won = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { g } = playOut(seed, 2 + (seed % 3), seed % 2 === 0);
      expect(g.phase).toBe("over");
      if (g.winner !== null) won++;
    }
    expect(won).toBeGreaterThan(190);
  }, 120_000);
});
