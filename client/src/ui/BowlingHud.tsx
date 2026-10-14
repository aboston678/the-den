import { frames } from "@den/shared";
import { useEffect, useMemo, useState } from "react";
import { drawScoreboard } from "../game/bowling/scoreboard.ts";
import { useBowling } from "../game/bowling/session.ts";
import { useLanes } from "../game/bowling/store.ts";
import { useBowlNews, usePartyStore } from "../net/party.ts";

// The bowling HUD (GAME_SPEC §11.5, §15): the POWER and CURVE meters, the big STRIKE! / SPARE!
// banner, a small copy of your lane's scorecard (the overhead screens aren't always in view),
// which keys do what, your final score, and notes when other bears strike, spare or finish a game.

const BANNER_MS = 2200;
const NOTE_MS = 4500;

export function BowlingHud() {
  return (
    <>
      <MyLane />
      <BowlNotes />
    </>
  );
}

function MyLane() {
  const { lane, mode, power, curve, banner } = useBowling();
  const view = useLanes((s) => (lane ? s.lanes[lane] : null));
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    if (!banner) return;
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, [banner]);
  // The scorecard is drawn offscreen and shown as a picture (the page's only <canvas> stays the game's).
  const canvas = useMemo(() => Object.assign(document.createElement("canvas"), { width: 512, height: 288 }), []);
  const card = useMemo(() => {
    if (!view) return "";
    drawScoreboard(canvas.getContext("2d")!, canvas.width, canvas.height, view);
    return canvas.toDataURL();
  }, [view, canvas]);

  if (!lane) return null;
  const meters = mode === "power" || mode === "curve" || mode === "throw";
  const showBanner = banner && now - banner.at < BANNER_MS;
  return (
    <div className="bowling-hud" data-testid="bowling-hud" data-mode={mode}>
      {card && <img className="bowl-card" src={card} alt="Scorecard" data-testid="bowl-card" />}
      {meters && (
        <div className="bowl-meters">
          <div className="bowl-meter power" data-testid="power-meter">
            <span>Power</span>
            <div className="track"><div className="fill" style={{ height: `${Math.round(power * 100)}%` }} /></div>
          </div>
          {(mode === "curve" || mode === "throw") && (
            <div className="bowl-meter curve" data-testid="curve-meter">
              <span>Curve</span>
              <div className="track">
                <div className="mid" />
                <div className="needle" style={{ left: `${50 + curve * 50}%` }} />
              </div>
              <div className="ends"><span>◀ left</span><span>straight</span><span>right ▶</span></div>
            </div>
          )}
        </div>
      )}
      {showBanner && (
        <div className={banner.big ? "bowl-banner big" : "bowl-banner"} data-testid="bowl-banner" key={banner.at}>{banner.text}</div>
      )}
      <div className="bowl-help">
        {mode === "aim" && <><b>A</b>/<b>D</b> move · <b>mouse</b> aim · <b>click</b> start the power meter · <b>E</b> leave</>}
        {mode === "power" && <><b>Click</b> to set your power</>}
        {mode === "curve" && <><b>Click</b> to set the curve: middle goes straight</>}
        {mode === "wait" && view?.phase !== "over" && <>Waiting for your turn</>}
      </div>
    </div>
  );
}

/** Other bears' strikes and spares (from the lanes), and everyone's finished games (from the server). */
function BowlNotes() {
  const me = usePartyStore((s) => s.sessionId);
  const games = useBowlNews((s) => s.games);
  const [notes, setNotes] = useState<{ text: string; at: number }[]>([]);
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    let prev = useLanes.getState().lanes;
    return useLanes.subscribe(({ lanes }) => {
      const fresh: { text: string; at: number }[] = [];
      for (const id of ["1", "2"] as const) {
        for (const b of lanes[id].bowlers) {
          const before = prev[id].bowlers.find((x) => x.id === b.id)?.rolls.length ?? 0;
          if (b.id === me || b.rolls.length !== before + 1) continue;
          const mark = lastMark(b.rolls);
          if (mark === "X") fresh.push({ text: `${b.name}: STRIKE!`, at: performance.now() });
          else if (mark === "/") fresh.push({ text: `${b.name}: spare`, at: performance.now() });
        }
      }
      prev = lanes;
      if (fresh.length) setNotes((n) => [...n.slice(-3), ...fresh]);
    });
  }, [me]);
  const live = [...notes, ...games.filter((g) => !g.mine).map((g) => ({ text: `${g.name} finished a game: ${g.score}${g.best ? " (new high score!)" : ""}`, at: g.at }))]
    .filter((n) => now - n.at < NOTE_MS);
  const mine = [...games].reverse().find((g) => g.mine && now - g.at < NOTE_MS * 1.5);
  useEffect(() => {
    if (!notes.length && !games.length) return;
    const id = setInterval(() => setNow(performance.now()), 300);
    return () => clearInterval(id);
  }, [notes.length, games.length]);
  return (
    <div className="bowl-notes">
      {mine && (
        <div className="bowl-final" data-testid="bowl-final">
          <div className="label">Game over</div>
          <div className="score">{mine.score}</div>
          {mine.best && <div className="best">New high score!</div>}
        </div>
      )}
      {live.map((n) => <div key={`${n.text}${n.at}`} className="bowl-note" data-testid="bowl-note">{n.text}</div>)}
    </div>
  );
}

/** The mark the latest ball got on the scoreboard. */
function lastMark(rolls: number[]) {
  const fs = frames(rolls);
  let last = "";
  for (const f of fs) if (f.marks.length) last = f.marks[f.marks.length - 1]!;
  return last;
}

