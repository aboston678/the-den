import { COSTS, legalCities, legalRoads, legalSettlements, piecesLeft, tradeRatios, type CatanPrivate, type CatanView, type DevCard } from "@den/shared";
import { catanSend } from "../../net/party.ts";
import { asGame, canAfford, openPanel, setTool, useCatanUi } from "../../game/catan/ui.ts";
import { Card, DEV_HELP, DEV_NAMES, RESOURCES } from "./common.tsx";

// Your turn (GAME_SPEC §16): your cards, what you can build (with costs), development cards,
// trading, rolling and ending the turn, and a line saying what the table is waiting for.

const COST_TEXT = { road: "Brick + Lumber", settlement: "Brick + Lumber + Wool + Grain", city: "3 Ore + 2 Grain", dev: "Ore + Wool + Grain" } as const;

/** What the table is waiting for, in plain words. */
export function statusLine(view: CatanView, me: number): string {
  const p = view.players[view.turn];
  const name = p?.name ?? "";
  const mine = view.turn === me;
  switch (view.phase) {
    case "setup": {
      const round = view.setupStep < view.players.length ? "first" : "second";
      if (!mine) return `${name} is placing their ${round} ${view.setupPiece}`;
      return view.setupPiece === "settlement" ? `Place your ${round} settlement: click a glowing corner` : "Now a road next to it: click a glowing edge";
    }
    case "roll":
      return mine ? (view.freeRoads > 0 ? "Place your free roads, then roll" : "Your turn: roll the dice") : `${name} is about to roll`;
    case "discard": {
      const owe = view.players[me]?.discard ?? 0;
      if (owe > 0) return `A 7! You have too many cards: discard ${owe}`;
      return "A 7! Waiting for players to discard";
    }
    case "robber":
      return mine ? "Move the robber: click a glowing hex" : `${name} is moving the robber`;
    case "steal":
      return mine ? "Pick who to steal from" : `${name} is stealing a card`;
    case "main":
      if (!mine) return `${name}'s turn`;
      return view.freeRoads > 0 ? `Road Building: place ${view.freeRoads} free road${view.freeRoads > 1 ? "s" : ""}` : "Build, trade, or end your turn";
    case "over":
      return view.winner === null ? "Game over" : `${view.players[view.winner]!.name} wins!`;
  }
}

export function Hand({ mine }: { mine: CatanPrivate }) {
  return (
    <div className="catan-hand" data-testid="catan-hand">
      {RESOURCES.map((r) => <Card key={r} r={r} n={mine.hand[r]} />)}
    </div>
  );
}

export function Actions({ view, mine, me }: { view: CatanView; mine: CatanPrivate; me: number }) {
  const tool = useCatanUi((s) => s.tool);
  const panel = useCatanUi((s) => s.panel);
  const myTurn = view.turn === me && view.phase !== "over";
  const main = myTurn && view.phase === "main";
  const g = asGame(view);
  const left = piecesLeft(g, me);
  const can = {
    road: main && canAfford(mine.hand, COSTS.road) && left.road > 0 && legalRoads(g, me).length > 0,
    settlement: main && canAfford(mine.hand, COSTS.settlement) && left.settlement > 0 && legalSettlements(g, me).length > 0,
    city: main && canAfford(mine.hand, COSTS.city) && left.city > 0 && legalCities(g, me).length > 0,
    dev: main && canAfford(mine.hand, COSTS.dev) && view.deckLeft > 0,
  };
  const ratios = tradeRatios(g, me);
  const canBank = main && RESOURCES.some((r) => mine.hand[r] >= ratios[r]);
  const canOffer = main && RESOURCES.some((r) => mine.hand[r] > 0);

  return (
    <div className="catan-actions" data-testid="catan-actions">
      {myTurn && view.phase === "roll" && (
        <button type="button" className="primary big" data-testid="catan-roll" onClick={() => catanSend.act({ type: "roll" })}>Roll the dice</button>
      )}
      <div className="row">
        {(["road", "settlement", "city"] as const).map((k) => (
          <button key={k} type="button" className={tool === k ? "on" : ""} disabled={!can[k]} title={COST_TEXT[k]} data-testid={`catan-build-${k}`} onClick={() => setTool(k)}>
            {k === "road" ? "Road" : k === "settlement" ? "Settlement" : "City"}
            <small>{COST_TEXT[k]}</small>
          </button>
        ))}
        <button type="button" disabled={!can.dev} title={COST_TEXT.dev} data-testid="catan-buy-dev" onClick={() => catanSend.act({ type: "buyDev" })}>
          Dev card<small>{COST_TEXT.dev}</small>
        </button>
      </div>
      <div className="row">
        <button type="button" className={panel === "trade" ? "on" : ""} disabled={!canBank && !canOffer} data-testid="catan-trade" onClick={() => openPanel("trade")}>Trade</button>
        <button type="button" className="primary" disabled={!main} data-testid="catan-end-turn" onClick={() => catanSend.act({ type: "endTurn" })}>End turn</button>
      </div>
    </div>
  );
}

/** Your development cards: play one per turn (not one bought this turn). */
export function DevCards({ view, mine, me }: { view: CatanView; mine: CatanPrivate; me: number }) {
  const myTurn = view.turn === me && (view.phase === "roll" || view.phase === "main");
  const counts = new Map<DevCard, { ready: number; fresh: number }>();
  for (const c of mine.dev) counts.set(c, { ready: (counts.get(c)?.ready ?? 0) + 1, fresh: counts.get(c)?.fresh ?? 0 });
  for (const c of mine.newDev) counts.set(c, { ready: counts.get(c)?.ready ?? 0, fresh: (counts.get(c)?.fresh ?? 0) + 1 });
  if (counts.size === 0) return null;
  const play = (c: DevCard) => {
    if (c === "knight") catanSend.act({ type: "playKnight" });
    if (c === "roadBuilding") catanSend.act({ type: "playRoadBuilding" });
    if (c === "yearOfPlenty") openPanel("yearOfPlenty");
    if (c === "monopoly") openPanel("monopoly");
  };
  return (
    <div className="catan-devs" data-testid="catan-devs">
      {[...counts.entries()].map(([c, n]) => {
        const playable = c !== "vp" && myTurn && !view.devPlayed && n.ready > 0;
        return (
          <button key={c} type="button" className="catan-dev" disabled={!playable} title={DEV_HELP[c]} data-testid={`dev-${c}`} onClick={() => play(c)}>
            <b>{DEV_NAMES[c]}</b>
            <span>{n.ready + n.fresh > 1 ? `×${n.ready + n.fresh}` : ""}{n.fresh > 0 && c !== "vp" ? " (new: next turn)" : ""}</span>
          </button>
        );
      })}
    </div>
  );
}
