// Every Catan move, checked against the full base-game rules. `apply` never changes the game it's
// given: it returns a new one, or an error saying why the move isn't allowed. The dice come from
// `ctx.roll`, so the rules never know or care how the server rolls them.

import { updateLargestArmy, updateLongestRoad } from "./awards.ts";
import { advanceSetup, log, setupOrder, startNextTurn } from "./game.ts";
import { COSTS, WIN_VP, canRoad, canSettle, has, pay, piecesLeft, robbable, totalVp, tradeRatios } from "./pieces.ts";
import { EDGES, HEXES, HEX_VERTICES, VERTEX_HEXES, VERTICES } from "./topology.ts";
import { RESOURCES, TERRAIN_RESOURCE, cloneGame, emptyHand, handSize, type CatanGame, type DevCard, type Hand, type Phase, type Resource, type TradeReply } from "./types.ts";

export type CatanAction =
  | { type: "placeSettlement"; vertex: number }
  | { type: "placeRoad"; edge: number }
  | { type: "roll" }
  | { type: "discard"; cards: Partial<Hand> }
  | { type: "moveRobber"; hex: number }
  | { type: "steal"; victim: number }
  | { type: "buildRoad"; edge: number }
  | { type: "buildSettlement"; vertex: number }
  | { type: "buildCity"; vertex: number }
  | { type: "buyDev" }
  | { type: "playKnight" }
  | { type: "playRoadBuilding" }
  | { type: "playYearOfPlenty"; take: [Resource, Resource] }
  | { type: "playMonopoly"; resource: Resource }
  | { type: "bankTrade"; give: Resource; get: Resource }
  | { type: "offer"; give: Partial<Hand>; get: Partial<Hand> }
  | { type: "reply"; offer: number; reply: TradeReply }
  | { type: "confirmTrade"; with: number }
  | { type: "cancelOffer" }
  | { type: "endTurn" };

export interface RuleContext {
  rand: () => number;
  roll: () => [number, number];
}

export type ApplyResult = { ok: true; game: CatanGame } | { ok: false; error: string };

// ---- Checking what arrives from a browser ----

const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const isResource = (x: unknown): x is Resource => typeof x === "string" && (RESOURCES as readonly string[]).includes(x);

function cards(x: unknown): Partial<Hand> | null {
  if (!x || typeof x !== "object") return null;
  const out: Partial<Hand> = {};
  for (const [k, v] of Object.entries(x)) {
    if (!isResource(k) || !isInt(v, 0, 19)) return null;
    if (v > 0) out[k] = v;
  }
  return out;
}

/** Turns an untrusted message into a move, or null if it's malformed. */
export function parseAction(raw: unknown): CatanAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  switch (a.type) {
    case "roll":
    case "buyDev":
    case "playKnight":
    case "playRoadBuilding":
    case "cancelOffer":
    case "endTurn":
      return { type: a.type };
    case "placeSettlement":
    case "buildSettlement":
    case "buildCity":
      return isInt(a.vertex, 0, VERTICES.length - 1) ? { type: a.type, vertex: a.vertex } : null;
    case "placeRoad":
    case "buildRoad":
      return isInt(a.edge, 0, EDGES.length - 1) ? { type: a.type, edge: a.edge } : null;
    case "moveRobber":
      return isInt(a.hex, 0, HEXES.length - 1) ? { type: a.type, hex: a.hex } : null;
    case "steal":
      return isInt(a.victim, 0, 3) ? { type: a.type, victim: a.victim } : null;
    case "confirmTrade":
      return isInt(a.with, 0, 3) ? { type: a.type, with: a.with } : null;
    case "discard": {
      const c = cards(a.cards);
      return c ? { type: a.type, cards: c } : null;
    }
    case "playYearOfPlenty": {
      const t = a.take;
      return Array.isArray(t) && t.length === 2 && isResource(t[0]) && isResource(t[1]) ? { type: a.type, take: [t[0], t[1]] } : null;
    }
    case "playMonopoly":
      return isResource(a.resource) ? { type: a.type, resource: a.resource } : null;
    case "bankTrade":
      return isResource(a.give) && isResource(a.get) ? { type: a.type, give: a.give, get: a.get } : null;
    case "offer": {
      const give = cards(a.give), get = cards(a.get);
      return give && get ? { type: a.type, give, get } : null;
    }
    case "reply": {
      const r = a.reply as Record<string, unknown> | undefined;
      if (!isInt(a.offer, 0, 1e9) || !r) return null;
      if (r.kind === "accept" || r.kind === "decline") return { type: a.type, offer: a.offer, reply: { kind: r.kind } };
      const give = cards(r.give), get = cards(r.get);
      return r.kind === "counter" && give && get ? { type: a.type, offer: a.offer, reply: { kind: "counter", give, get } } : null;
    }
    default:
      return null;
  }
}

// ---- Applying a move ----

class RuleError extends Error {}
function check(ok: unknown, why: string): asserts ok {
  if (!ok) throw new RuleError(why);
}

const RES_NAME: Record<Resource, string> = { lumber: "lumber", brick: "brick", wool: "wool", grain: "grain", ore: "ore" };
const describe = (h: Partial<Hand>) =>
  RESOURCES.filter((r) => (h[r] ?? 0) > 0).map((r) => `${h[r]} ${RES_NAME[r]}`).join(", ") || "nothing";

/** Plays one move by player index `p`. */
export function apply(game: CatanGame, p: number, action: CatanAction, ctx: RuleContext): ApplyResult {
  const g = cloneGame(game);
  try {
    const pl = g.players[p];
    check(pl && !pl.gone, "You're not in this game");
    check(g.phase !== "over", "The game is over");
    run(g, p, action, ctx);
    if ((g.phase as Phase) !== "over" && totalVp(g, g.turn) >= WIN_VP) {
      g.phase = "over";
      g.winner = g.turn;
      g.offer = null;
      log(g, `${g.players[g.turn]!.name} wins with ${totalVp(g, g.turn)} points!`);
    }
    return { ok: true, game: g };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    throw e;
  }
}

function run(g: CatanGame, p: number, a: CatanAction, ctx: RuleContext) {
  const pl = g.players[p]!;
  const mine = p === g.turn;
  const left = () => piecesLeft(g, p);

  switch (a.type) {
    case "placeSettlement": {
      check(g.phase === "setup" && mine && g.setupPiece === "settlement", "Not your settlement to place");
      check(canSettle(g, p, a.vertex, true), "Can't settle there");
      g.buildings[a.vertex] = { owner: p, city: false };
      g.setupVertex = a.vertex;
      g.setupPiece = "road";
      if (g.setupStep >= g.players.length) {
        // Second settlement: one of each resource it touches.
        const got = emptyHand();
        for (const h of VERTEX_HEXES[a.vertex]!) {
          const r = TERRAIN_RESOURCE[g.board.tiles[h]!.terrain];
          if (r && g.bank[r] > 0) got[r]++;
        }
        pay(g.bank, pl.hand, got);
        log(g, `${pl.name} placed a settlement and got ${describe(got)}`);
      } else log(g, `${pl.name} placed a settlement`);
      updateLongestRoad(g);
      return;
    }
    case "placeRoad": {
      check(g.phase === "setup" && mine && g.setupPiece === "road", "Not your road to place");
      check(canRoad(g, p, a.edge, g.setupVertex), "The road has to touch the settlement you just placed");
      g.roads[a.edge] = p;
      updateLongestRoad(g);
      advanceSetup(g);
      return;
    }
    case "roll": {
      check(g.phase === "roll" && mine, "You can't roll now");
      const dice = ctx.roll();
      g.dice = dice;
      g.rollId++;
      const total = dice[0] + dice[1];
      log(g, `${pl.name} rolled ${total}`);
      if (total === 7) {
        g.discards = g.players.map((q) => (q.gone || handSize(q.hand) <= 7 ? 0 : Math.floor(handSize(q.hand) / 2)));
        g.robberReturn = "main";
        g.phase = g.discards.some((d) => d > 0) ? "discard" : "robber";
      } else {
        produce(g, total);
        g.phase = "main";
      }
      return;
    }
    case "discard": {
      check(g.phase === "discard" && (g.discards[p] ?? 0) > 0, "You don't need to discard");
      check(handSize(a.cards) === g.discards[p] && has(pl.hand, a.cards), `Pick exactly ${g.discards[p]} of your cards`);
      pay(pl.hand, g.bank, a.cards);
      g.discards[p] = 0;
      log(g, `${pl.name} discarded ${handSize(a.cards)} cards`);
      if (g.discards.every((d) => d === 0)) g.phase = "robber";
      return;
    }
    case "moveRobber": {
      check(g.phase === "robber" && mine, "You can't move the robber now");
      check(a.hex !== g.robber, "The robber has to move to a different hex");
      g.robber = a.hex;
      log(g, `${pl.name} moved the robber`);
      const victims = robbable(g, p, a.hex);
      if (victims.length === 1) steal(g, p, victims[0]!, ctx.rand);
      if (victims.length > 1) {
        g.stealFrom = victims;
        g.phase = "steal";
      } else g.phase = g.robberReturn;
      return;
    }
    case "steal": {
      check(g.phase === "steal" && mine && g.stealFrom.includes(a.victim), "You can't steal from them");
      steal(g, p, a.victim, ctx.rand);
      g.stealFrom = [];
      g.phase = g.robberReturn;
      return;
    }
    case "buildRoad": {
      const free = g.freeRoads > 0;
      check(mine && (g.phase === "main" || (free && g.phase === "roll")), "You can't build now");
      check(left().road > 0, "You have no roads left");
      check(free || has(pl.hand, COSTS.road), "A road costs 1 brick + 1 lumber");
      check(canRoad(g, p, a.edge), "A road has to join your own road or building");
      if (free) g.freeRoads--;
      else pay(pl.hand, g.bank, COSTS.road);
      g.roads[a.edge] = p;
      if (left().road === 0) g.freeRoads = 0;
      log(g, `${pl.name} built a road`);
      updateLongestRoad(g);
      return;
    }
    case "buildSettlement": {
      check(mine && g.phase === "main", "You can't build now");
      check(left().settlement > 0, "You have no settlements left");
      check(has(pl.hand, COSTS.settlement), "A settlement costs brick, lumber, wool and grain");
      check(canSettle(g, p, a.vertex), "Settlements need your road and a gap of two edges from any building");
      pay(pl.hand, g.bank, COSTS.settlement);
      g.buildings[a.vertex] = { owner: p, city: false };
      log(g, `${pl.name} built a settlement`);
      updateLongestRoad(g);
      return;
    }
    case "buildCity": {
      check(mine && g.phase === "main", "You can't build now");
      check(left().city > 0, "You have no cities left");
      check(has(pl.hand, COSTS.city), "A city costs 3 ore + 2 grain");
      const b = g.buildings[a.vertex];
      check(b && b.owner === p && !b.city, "Cities go on your own settlements");
      pay(pl.hand, g.bank, COSTS.city);
      b!.city = true;
      log(g, `${pl.name} built a city`);
      return;
    }
    case "buyDev": {
      check(mine && g.phase === "main", "You can't buy now");
      check(g.deck.length > 0, "No development cards left");
      check(has(pl.hand, COSTS.dev), "A development card costs ore, wool and grain");
      pay(pl.hand, g.bank, COSTS.dev);
      pl.newDev.push(g.deck.pop()!);
      log(g, `${pl.name} bought a development card`);
      return;
    }
    case "playKnight":
    case "playRoadBuilding":
    case "playYearOfPlenty":
    case "playMonopoly": {
      const card: DevCard = a.type === "playKnight" ? "knight" : a.type === "playRoadBuilding" ? "roadBuilding" : a.type === "playYearOfPlenty" ? "yearOfPlenty" : "monopoly";
      check(mine && (g.phase === "roll" || g.phase === "main"), "You can't play a card now");
      check(!g.devPlayed, "Only one development card per turn");
      const i = pl.dev.indexOf(card);
      check(i >= 0, pl.newDev.includes(card) ? "Cards bought this turn can be played next turn" : "You don't have that card");
      playDev(g, p, a);
      pl.dev.splice(pl.dev.indexOf(card), 1);
      g.devPlayed = true;
      return;
    }
    case "bankTrade": {
      check(mine && g.phase === "main", "Trade after you roll, on your turn");
      check(a.give !== a.get, "Pick two different resources");
      const n = tradeRatios(g, p)[a.give];
      check(pl.hand[a.give] >= n, `You need ${n} ${RES_NAME[a.give]}`);
      check(g.bank[a.get] > 0, `The bank is out of ${RES_NAME[a.get]}`);
      pay(pl.hand, g.bank, { [a.give]: n });
      pay(g.bank, pl.hand, { [a.get]: 1 });
      log(g, `${pl.name} traded ${n} ${RES_NAME[a.give]} with the bank for 1 ${RES_NAME[a.get]}`);
      return;
    }
    case "offer": {
      check(mine && g.phase === "main", "Trade after you roll, on your turn");
      check(handSize(a.give) > 0 && handSize(a.get) > 0, "Offer something and ask for something");
      check(RESOURCES.every((r) => !(a.give[r] && a.get[r])), "Don't offer and ask for the same thing");
      check(has(pl.hand, a.give), "You don't have those cards");
      g.offer = { id: ++g.offerCount, give: a.give, get: a.get, replies: {} };
      log(g, `${pl.name} offers ${describe(a.give)} for ${describe(a.get)}`);
      return;
    }
    case "reply": {
      check(g.offer && g.offer.id === a.offer, "That offer is gone");
      check(!mine && g.phase === "main", "You can't answer your own offer");
      const r = a.reply;
      if (r.kind === "accept") check(has(pl.hand, g.offer!.get), "You don't have the cards they want");
      if (r.kind === "counter") {
        check(handSize(r.give) > 0 && handSize(r.get) > 0, "Offer something and ask for something");
        check(has(pl.hand, r.give), "You don't have those cards");
      }
      g.offer!.replies[p] = r;
      if (r.kind === "counter") log(g, `${pl.name} counters: ${describe(r.give)} for ${describe(r.get)}`);
      return;
    }
    case "confirmTrade": {
      check(mine && g.offer, "No offer to confirm");
      const reply = g.offer!.replies[a.with];
      const other = g.players[a.with];
      check(other && !other.gone && reply && reply.kind !== "decline", "They haven't accepted");
      // Terms from the other player's side: what they give and what they get.
      const theyGive = reply!.kind === "counter" ? reply!.give : g.offer!.get;
      const theyGet = reply!.kind === "counter" ? reply!.get : g.offer!.give;
      check(has(pl.hand, theyGet), "You no longer have those cards");
      check(has(other!.hand, theyGive), `${other!.name} no longer has those cards`);
      pay(pl.hand, other!.hand, theyGet);
      pay(other!.hand, pl.hand, theyGive);
      g.offer = null;
      log(g, `${pl.name} traded ${describe(theyGet)} with ${other!.name} for ${describe(theyGive)}`);
      return;
    }
    case "cancelOffer": {
      check(mine && g.offer, "No offer to cancel");
      g.offer = null;
      return;
    }
    case "endTurn": {
      check(mine && g.phase === "main", "You can't end your turn now");
      startNextTurn(g);
      return;
    }
  }
}

function playDev(g: CatanGame, p: number, a: CatanAction) {
  const pl = g.players[p]!;
  switch (a.type) {
    case "playKnight":
      pl.knights++;
      g.robberReturn = g.phase === "roll" ? "roll" : "main";
      g.phase = "robber";
      updateLargestArmy(g);
      log(g, `${pl.name} played a knight`);
      return;
    case "playRoadBuilding":
      g.freeRoads = Math.min(2, piecesLeft(g, p).road);
      log(g, `${pl.name} played Road Building`);
      return;
    case "playYearOfPlenty": {
      const want: Partial<Hand> = {};
      for (const r of a.take) want[r] = (want[r] ?? 0) + 1;
      check(has(g.bank, want), "The bank doesn't have those");
      pay(g.bank, pl.hand, want);
      log(g, `${pl.name} played Year of Plenty: ${describe(want)}`);
      return;
    }
    case "playMonopoly": {
      let n = 0;
      g.players.forEach((q, i) => {
        if (i === p) return;
        n += q.hand[a.resource];
        pay(q.hand, pl.hand, { [a.resource]: q.hand[a.resource] });
      });
      log(g, `${pl.name} played Monopoly on ${RES_NAME[a.resource]} and took ${n}`);
      return;
    }
  }
}

/** Pays out a roll. If the bank can't cover everyone owed a resource, nobody gets it (unless only one player is owed). */
function produce(g: CatanGame, total: number) {
  const owed = g.players.map(() => emptyHand());
  g.board.tiles.forEach((t, h) => {
    const r = TERRAIN_RESOURCE[t.terrain];
    if (t.token !== total || !r || h === g.robber) return;
    for (const v of HEX_VERTICES[h]!) {
      const b = g.buildings[v];
      if (b && !g.players[b.owner]!.gone) owed[b.owner]![r] += b.city ? 2 : 1;
    }
  });
  for (const r of RESOURCES) {
    const sum = owed.reduce((n, o) => n + o[r], 0);
    if (sum <= g.bank[r]) continue;
    const who = owed.filter((o) => o[r] > 0);
    for (const o of owed) o[r] = who.length === 1 ? Math.min(o[r], g.bank[r]) : 0;
  }
  owed.forEach((o, i) => {
    if (handSize(o) === 0) return;
    pay(g.bank, g.players[i]!.hand, o);
    log(g, `${g.players[i]!.name} got ${describe(o)}`);
  });
}

/** Takes one random card from the victim. */
function steal(g: CatanGame, p: number, victim: number, rand: () => number) {
  const v = g.players[victim]!;
  const deck = RESOURCES.flatMap((r) => Array<Resource>(v.hand[r]).fill(r));
  if (deck.length === 0) return;
  const r = deck[Math.floor(rand() * deck.length)]!;
  pay(v.hand, g.players[p]!.hand, { [r]: 1 });
  log(g, `${g.players[p]!.name} stole a card from ${v.name}`);
}

/** Whose move the table is waiting for (for prompts and timeouts). */
export function waitingOn(g: CatanGame): number[] {
  if (g.phase === "over") return [];
  if (g.phase === "discard") return g.discards.flatMap((d, i) => (d > 0 ? [i] : []));
  return [g.turn];
}

/** The setup step's player and piece, for prompts. */
export function setupInfo(g: CatanGame) {
  const order = setupOrder(g.players.length);
  return { round: g.setupStep < g.players.length ? 1 : 2, player: order[g.setupStep] ?? g.turn, piece: g.setupPiece };
}
