import { CATAN_TABLE, WATCH_REACH, type CatanView } from "@den/shared";
import { useEffect, useState } from "react";
import { DICE_TUMBLE_S } from "../game/catan/Dice.tsx";
import { useCatan } from "../game/catan/store.ts";
import { closeAll, useCatanUi } from "../game/catan/ui.ts";
import { playerState } from "../game/state.ts";
import { usePartyStore } from "../net/party.ts";
import { Discard, GameOver, Lobby, Monopoly, Steal, Waiting, YearOfPlenty } from "./catan/Dialogs.tsx";
import { EndVote, GameMenu, LeaveConfirm } from "./catan/Leave.tsx";
import { Players } from "./catan/Players.tsx";
import { OfferCard, TradePanel } from "./catan/Trade.tsx";
import { Actions, DevCards, Hand, statusLine } from "./catan/Turn.tsx";

// The Catan HUD (GAME_SPEC §16). Seated at the table: the scoreboard, what the table is waiting
// for, your cards, building, trading, development cards and the pop-ups. Standing near the table
// while a game is on: a compact scoreboard so you can follow along.

const ERROR_MS = 3500;
const ROLL_SHOW_MS = 5000;
/** The private tick after a start you asked for: tiny, faint, and gone in a moment. */
const TICK_MS = 1500;

export function CatanHud() {
  const me = usePartyStore((s) => s.sessionId);
  const players = usePartyStore((s) => s.players);
  const { seats, view, mine, waitingFor, waitUntil, error, ok } = useCatan();
  const panel = useCatanUi((s) => s.panel);
  const seated = !!me && seats.includes(me);
  const near = useNear();
  const [now, setNow] = useState(performance.now());
  const [overDismissed, setOverDismissed] = useState("");
  // The rolled number, shown once the dice have landed (they can end up behind a bear).
  const [rolled, setRolled] = useState<{ id: number; at: number } | null>(null);
  const rollId = view?.rollId ?? 0;
  useEffect(() => {
    if (rollId > 0) setRolled({ id: rollId, at: performance.now() });
  }, [rollId]);
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    document.body.classList.toggle("catan-seated", seated);
    if (!seated) closeAll();
    return () => document.body.classList.remove("catan-seated");
  }, [seated]);

  const index = view ? view.players.findIndex((p) => p.id === me && !p.gone) : -1;
  const running = !!view && view.phase !== "over";
  const tick = ok > 0 && now - ok < TICK_MS;

  const finished = !!view && view.phase === "over";
  if (!seated) {
    if (!view || !near) return null;
    if (finished) {
      // The end of the game stays up for the players (the winner jumps out of their chair) and onlookers.
      const myIndex = view.players.findIndex((p) => p.id === me);
      return overDismissed === overKey(view) ? null : (
        <div className="catan-hud" data-testid="catan-hud">
          <GameOver view={view} me={myIndex} onClose={() => setOverDismissed(overKey(view))} />
        </div>
      );
    }
    if (!running) return null;
    return (
      <div className="catan-hud watching" data-testid="catan-hud">
        <div className="catan-status">{statusLine(view, -1)}</div>
        {view.endVote && <div className="catan-status">Voting on ending the game…</div>}
        <Players view={view} me={-1} compact />
      </div>
    );
  }

  const names = seats.filter((s) => s).map((id) => players.find((p) => p.id === id)?.name ?? "Bear");
  const playing = running && index >= 0 && mine;
  return (
    <div className="catan-hud" data-testid="catan-hud">
      {view && (running || view.phase === "over") && <Players view={view} me={index} />}
      {view && <div className="catan-status" data-testid="catan-status">{statusLine(view, index)}</div>}
      {view?.dice && rolled && now - rolled.at > DICE_TUMBLE_S * 1000 && now - rolled.at < ROLL_SHOW_MS && (
        <div className="catan-rolled" data-testid="catan-rolled">{view.players[view.turn]?.name} rolled <b>{view.dice[0] + view.dice[1]}</b></div>
      )}
      {view && <Waiting name={waitingFor} until={waitUntil} />}
      {view && view.log.length > 0 && (
        <div className="catan-log" data-testid="catan-log">
          {view.log.slice(-6).map((line, i) => <div key={`${view.log.length}-${i}`}>{line}</div>)}
        </div>
      )}
      {!running && <Lobby seated={names.length} names={names} />}
      {view && overDismissed !== overKey(view) && <GameOver view={view} me={view.players.findIndex((p) => p.id === me)} onClose={() => setOverDismissed(overKey(view))} />}
      {playing && (
        <>
          <div className="catan-bottom">
            <Hand mine={mine} />
            <DevCards view={view} mine={mine} me={index} />
          </div>
          <Actions view={view} mine={mine} me={index} />
          <Discard view={view} mine={mine} me={index} />
          <Steal view={view} me={index} />
          {panel === "trade" && view.phase === "main" && view.turn === index && <TradePanel view={view} mine={mine} me={index} />}
          {panel === "yearOfPlenty" && <YearOfPlenty view={view} />}
          {panel === "monopoly" && <Monopoly />}
        </>
      )}
      {view && running && <OfferCard view={view} mine={mine} me={index} />}
      {view && running && index >= 0 && <GameMenu view={view} />}
      {view && running && <EndVote view={view} me={index} />}
      {view && running && index >= 0 && panel === "leave" && <LeaveConfirm view={view} />}
      {error && now - error.at < ERROR_MS && <div className="catan-error" data-testid="catan-error">{error.text}</div>}
      {tick && <div className="catan-tick" />}
    </div>
  );
}

/** Tells one finished game from the next. */
const overKey = (v: CatanView) => `${v.players.map((p) => p.id).join()}|${v.log[0]}|${v.rollId}`;

/** True while you're within watching distance of the table (checked twice a second). */
function useNear() {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      const p = playerState.position;
      setNear(Math.hypot(p.x - CATAN_TABLE.x, p.z - CATAN_TABLE.z) < WATCH_REACH && Math.abs(p.y - CATAN_TABLE.topY) < 2.5);
    }, 500);
    return () => clearInterval(id);
  }, []);
  return near;
}
