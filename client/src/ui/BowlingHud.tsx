import { useEffect, useMemo, useState } from "react";
import { drawScoreboard } from "../game/bowling/scoreboard.ts";
import { useBowling } from "../game/bowling/session.ts";
import { useLanes } from "../game/bowling/store.ts";

// The bowling HUD (GAME_SPEC §11.5, §15): the POWER and CURVE meters, the big STRIKE! / SPARE!
// banner, a small copy of your lane's scorecard (the overhead screens aren't always in view), and
// which keys do what.

const BANNER_MS = 2200;

export function BowlingHud() {
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
        {mode === "wait" && view?.phase !== "over" && <>Waiting for your turn · <b>E</b> leave the lane</>}
        {mode === "wait" && view?.phase === "over" && <>Game over · <b>E</b> new game</>}
      </div>
    </div>
  );
}
