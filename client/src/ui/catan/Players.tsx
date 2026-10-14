import type { CatanView } from "@den/shared";
import { Chip } from "./common.tsx";

// The scoreboard (GAME_SPEC §16): every player's points, cards, knights and road, whose turn it
// is, and who holds Longest Road / Largest Army. Shown to players and to bears watching nearby.

export function Players({ view, me, compact }: { view: CatanView; me: number; compact?: boolean }) {
  return (
    <div className={`catan-players${compact ? " compact" : ""}`} data-testid="catan-players">
      {view.players.map((p, i) => {
        const active = view.phase !== "over" && view.turn === i;
        const vp = view.finalVp ? view.finalVp[i]! : p.vp;
        return (
          <div key={p.id} className={`catan-player${active ? " active" : ""}${p.gone ? " gone" : ""}${view.winner === i ? " winner" : ""}`} data-testid="catan-player">
            <div className="who">
              <Chip seat={p.seat} />
              <span className="name">{p.name}{i === me ? " (you)" : ""}</span>
              <span className="vp" data-testid="catan-vp">{vp}</span>
            </div>
            {!compact && (
              <div className="stats">
                <span>Cards {p.cards}</span>
                <span>Dev {p.devCards}</span>
                <span>Knights {p.knights}</span>
                <span>Road {p.roadLength}</span>
              </div>
            )}
            <div className="badges">
              {view.longestRoad === i && <span className="badge-award">Longest Road</span>}
              {view.largestArmy === i && <span className="badge-award">Largest Army</span>}
              {p.discard > 0 && <span className="badge-wait">Discarding {p.discard}</span>}
              {p.gone && <span className="badge-wait">Left</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
