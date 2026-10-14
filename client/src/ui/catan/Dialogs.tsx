import { CATAN_MAX_PLAYERS, CATAN_MIN_PLAYERS, type CatanPrivate, type CatanView, type Hand, type Resource } from "@den/shared";
import { useEffect, useState } from "react";
import { catanSend } from "../../net/party.ts";
import { isHeld } from "../../game/input/keyboard.ts";
import { closeAll } from "../../game/catan/ui.ts";
import { Card, Chip, Picker, RESOURCES, RESOURCE_LABELS, total } from "./common.tsx";
import { endedByVote } from "./Leave.tsx";

// The Catan HUD's pop-ups (GAME_SPEC §16): discarding after a 7, picking who to rob, Year of
// Plenty and Monopoly, the table before a game starts, and the end of the game.

export function Discard({ view, mine, me }: { view: CatanView; mine: CatanPrivate; me: number }) {
  const owe = view.players[me]?.discard ?? 0;
  const [pick, setPick] = useState<Partial<Hand>>({});
  if (view.phase !== "discard" || owe === 0) return null;
  return (
    <div className="catan-panel catan-modal" data-testid="catan-discard">
      <h3>Discard {owe} cards</h3>
      <p className="note">A 7 was rolled and you have more than 7 cards. Pick {owe} to give back.</p>
      <Picker value={pick} onChange={setPick} max={mine.hand} />
      <button type="button" className="primary" disabled={total(pick) !== owe} data-testid="catan-discard-go" onClick={() => {
        catanSend.act({ type: "discard", cards: pick });
        setPick({});
      }}>
        Discard {total(pick)} / {owe}
      </button>
    </div>
  );
}

export function Steal({ view, me }: { view: CatanView; me: number }) {
  if (view.phase !== "steal" || view.turn !== me) return null;
  return (
    <div className="catan-panel catan-modal" data-testid="catan-steal">
      <h3>Steal a card from…</h3>
      <div className="row">
        {view.stealFrom.map((i) => {
          const p = view.players[i]!;
          return (
            <button key={p.id} type="button" data-testid={`steal-${i}`} onClick={() => catanSend.act({ type: "steal", victim: i })}>
              <Chip seat={p.seat} /> {p.name} ({p.cards} cards)
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function YearOfPlenty({ view }: { view: CatanView }) {
  const [take, setTake] = useState<Resource[]>([]);
  return (
    <div className="catan-panel catan-modal" data-testid="catan-yop">
      <button type="button" className="close" onClick={closeAll}>×</button>
      <h3>Year of Plenty: take 2</h3>
      <div className="catan-hand">
        {RESOURCES.map((r) => (
          <Card key={r} r={r} small n={take.filter((x) => x === r).length} onClick={take.length < 2 && view.bank[r] > take.filter((x) => x === r).length ? () => setTake([...take, r]) : undefined} />
        ))}
      </div>
      <div className="row">
        <button type="button" className="primary" disabled={take.length !== 2} data-testid="catan-yop-go" onClick={() => {
          catanSend.act({ type: "playYearOfPlenty", take: [take[0]!, take[1]!] });
          closeAll();
        }}>Take {take.map((r) => RESOURCE_LABELS[r]).join(" + ") || "…"}</button>
        <button type="button" className="quiet" onClick={() => setTake([])}>Clear</button>
      </div>
    </div>
  );
}

export function Monopoly() {
  return (
    <div className="catan-panel catan-modal" data-testid="catan-monopoly">
      <button type="button" className="close" onClick={closeAll}>×</button>
      <h3>Monopoly: everyone gives you all their…</h3>
      <div className="catan-hand">
        {RESOURCES.map((r) => (
          <Card key={r} r={r} small onClick={() => {
            catanSend.act({ type: "playMonopoly", resource: r });
            closeAll();
          }} />
        ))}
      </div>
    </div>
  );
}

/** Seated before a game: who's here, and Start. */
export function Lobby({ seated, names }: { seated: number; names: string[] }) {
  const ready = seated >= CATAN_MIN_PLAYERS && seated <= CATAN_MAX_PLAYERS;
  return (
    <div className="catan-panel catan-lobby" data-testid="catan-lobby">
      <h3>Catan table</h3>
      <p>{names.join(", ")}</p>
      <p className="note">{ready ? "Anyone seated can start." : "Waiting for at least one more bear to sit down."}</p>
      <button type="button" className="primary big" disabled={!ready} data-testid="catan-start" onClick={() => catanSend.start(isHeld("KeyH"))}>
        Start game
      </button>
      <p className="note"><b>E</b> get up</p>
    </div>
  );
}

/** The end of a game: who won, final points. */
export function GameOver({ view, me, onClose }: { view: CatanView; me: number; onClose: () => void }) {
  if (view.phase !== "over") return null;
  const w = view.winner;
  return (
    <div className="catan-panel catan-over" data-testid="catan-over">
      <button type="button" className="close" data-testid="catan-over-close" onClick={onClose}>×</button>
      <h2>{w === null ? "Game over" : w === me ? "You win!" : `${view.players[w]!.name} wins!`}</h2>
      {endedByVote(view) && <p className="note" data-testid="catan-over-vote">Game ended by vote. No winner this time.</p>}
      <div className="final">
        {view.players
          .map((p, i) => ({ p, vp: view.finalVp?.[i] ?? p.vp }))
          .sort((a, b) => b.vp - a.vp)
          .map(({ p, vp }) => <div key={p.id}><Chip seat={p.seat} /> {p.name} <b>{vp}</b></div>)}
      </div>
      <p className="note">Start another game when everyone's ready.</p>
    </div>
  );
}

/** A dropped player the game is waiting for. */
export function Waiting({ name, until }: { name: string; until: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  if (!name) return null;
  return <div className="catan-waiting" data-testid="catan-waiting">Paused: waiting for {name} to reconnect ({Math.max(0, Math.ceil((until - now) / 1000))} s)</div>;
}
