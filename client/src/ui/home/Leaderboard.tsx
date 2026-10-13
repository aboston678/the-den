import { useEffect, useState } from "react";
import { useFishStore } from "../../net/party.ts";
import { BOARDS, type Board, type Row, leaderboard } from "../../net/social.ts";

// The leaderboard (GAME_SPEC §14): fish caught, bowling high score, Catan wins; all players or
// just you and your friends. Refreshes every 20 s while open, and right away when a fish is landed.

export function LeaderboardPanel({ onClose }: { onClose: () => void }) {
  const [board, setBoard] = useState<Board>("fish");
  const [scope, setScope] = useState<"all" | "friends">("all");
  const [rows, setRows] = useState<Row[] | null>(null);
  const catches = useFishStore((s) => s.catches.length);
  const info = BOARDS.find((b) => b.id === board)!;

  useEffect(() => {
    let live = true;
    const load = () => void leaderboard(board, scope).then((r) => live && setRows(r));
    load();
    const id = setInterval(load, 20_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [board, scope, catches]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel leaderboard" data-testid="leaderboard" onClick={(e) => e.stopPropagation()}>
        <h2>Leaderboard</h2>
        <div className="tabs">
          {BOARDS.map((b) => (
            <button key={b.id} className={b.id === board ? "tab on" : "tab"} data-testid={`board-${b.id}`} onClick={() => (setRows(null), setBoard(b.id))}>{b.label}</button>
          ))}
        </div>
        <div className="tabs small">
          {(["all", "friends"] as const).map((s) => (
            <button key={s} className={s === scope ? "tab on" : "tab"} data-testid={`scope-${s}`} onClick={() => (setRows(null), setScope(s))}>{s === "all" ? "All players" : "Friends"}</button>
          ))}
        </div>
        {rows === null ? (
          <p className="note">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="note" data-testid="board-empty">{info.soon ?? (scope === "friends" ? "No scores from you or your friends yet. Go catch a fish!" : "No scores yet. Go catch a fish!")}</p>
        ) : (
          <ol className="board-rows" data-testid="board-rows">
            {rows.map((r) => (
              <li key={r.userId} className={r.you ? "you" : ""}>
                <span className="rank">{r.rank}</span>
                <span className="who">{r.username}{r.you && <span className="tag">you</span>}</span>
                <span className="score">{r.value} <small>{info.unit}</small></span>
              </li>
            ))}
          </ol>
        )}
        <button className="primary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
