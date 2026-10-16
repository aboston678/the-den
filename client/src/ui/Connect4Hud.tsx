import { C4_TABLE, type C4Game, WATCH_REACH } from "@den/shared";
import { useEffect, useState } from "react";
import { DISC_COLOURS, useC4 } from "../game/connect4/store.ts";
import { playerState } from "../game/state.ts";
import { c4Send, usePartyStore } from "../net/party.ts";

// The Connect Four HUD (Andrew, 2026-10-16), in the Catan table's style. Seated: whose turn it is,
// Start / Rematch, the game-over card, and "leave the game?" after E mid-game. Standing near the
// table during a game: a one-line status so you can follow along.

const ERROR_MS = 3000;

export function Connect4Hud() {
  const me = usePartyStore((s) => s.sessionId);
  const players = usePartyStore((s) => s.players);
  const { seats, game, waitingFor, error, confirmLeave } = useC4();
  const seated = !!me && seats.includes(me);
  const near = useNear();
  const [now, setNow] = useState(performance.now());
  const [dismissed, setDismissed] = useState("");
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    document.body.classList.toggle("catan-seated", seated); // same free-mouse HUD rules as Catan
    return () => document.body.classList.remove("catan-seated");
  }, [seated]);

  const over = !!game && game.phase === "over";
  const gameKey = game ? `${game.players.map((p) => p.id).join()}|${game.moves}` : "";
  const overCard = over && dismissed !== gameKey && <GameOver game={game} me={me} onClose={() => setDismissed(gameKey)} />;

  if (!seated) {
    if (!game || !near) return null;
    if (over) return overCard ? <div className="catan-hud" data-testid="c4-hud">{overCard}</div> : null;
    return (
      <div className="catan-hud watching" data-testid="c4-hud">
        <div className="catan-status">Connect Four: {status(game, "")}</div>
      </div>
    );
  }

  const running = !!game && !over;
  const both = seats.every((s) => s);
  const names = seats.map((id) => players.find((p) => p.id === id)?.name ?? "");
  return (
    <div className="catan-hud" data-testid="c4-hud">
      {running && <div className="catan-status" data-testid="c4-status">{waitingFor ? `Paused: waiting for ${waitingFor}` : status(game, me)}</div>}
      {error && now - error.at < ERROR_MS && <div className="catan-error">{error.text}</div>}
      {!running && (
        <div className="catan-panel catan-lobby c4-side" data-testid="c4-lobby">
          <h3>Connect Four</h3>
          <p>{names.filter((n) => n).join(" vs ") || " "}</p>
          <p className="note">{both ? "Four in a row wins. A random bear goes first (red)." : "Waiting for another bear to sit down."}</p>
          <button type="button" className="primary big" disabled={!both} data-testid="c4-start" onClick={() => c4Send.start()}>
            {game ? "Rematch" : "Start game"}
          </button>
          <p className="note"><b>E</b> get up</p>
        </div>
      )}
      {overCard}
      {confirmLeave && running && (
        <div className="catan-panel catan-over c4-side c4-top" data-testid="c4-leave">
          <h3>Leave the game?</h3>
          <p className="note">The game ends with no winner.</p>
          <button type="button" className="primary" data-testid="c4-leave-yes" onClick={() => { useC4.setState({ confirmLeave: false }); c4Send.stand(); }}>Leave</button>{" "}
          <button type="button" onClick={() => useC4.setState({ confirmLeave: false })}>Keep playing</button>
        </div>
      )}
    </div>
  );
}

/** "Your turn: click a column" / "Bob's turn". */
function status(game: C4Game, me: string) {
  const p = game.players[game.turn]!;
  return (
    <>
      <span className="c4-disc" style={{ background: DISC_COLOURS[game.turn] }} />
      {p.id === me ? "Your turn: click a column" : `${p.name}'s turn`}
    </>
  );
}

function GameOver({ game, me, onClose }: { game: C4Game; me: string; onClose: () => void }) {
  const w = game.winner;
  const left = game.players.some((p) => p.gone);
  return (
    <div className="catan-panel catan-over c4-side c4-top" data-testid="c4-over">
      <button type="button" className="close" onClick={onClose}>×</button>
      <h2>{w === null ? (left ? "Game over" : "It's a draw!") : game.players[w]!.id === me ? "You win!" : `${game.players[w]!.name} wins!`}</h2>
      {w === null && left && <p className="note">A player left. No winner this time.</p>}
      <div className="final">
        {game.players.map((p, i) => <div key={p.id}><span className="c4-disc" style={{ background: DISC_COLOURS[i] }} />{p.name}</div>)}
      </div>
    </div>
  );
}

function useNear() {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      const p = playerState.position;
      setNear(Math.hypot(p.x - C4_TABLE.x, p.z - C4_TABLE.z) < WATCH_REACH && Math.abs(p.y - C4_TABLE.y) < 2);
    }, 500);
    return () => clearInterval(id);
  }, []);
  return near;
}
