import { formatLap, inTrackArea } from "@den/shared";
import { useEffect, useState } from "react";
import { useLaps } from "../game/track/laps.ts";
import { playerState } from "../game/state.ts";

// The lap timer at the racetrack (Andrew, 2026-10-16): your lap so far, your last and best laps, and
// a note when anyone in the party sets a best lap.

const NEWS_MS = 6000;

export function LapHud() {
  const { current, last, best, news } = useLaps();
  const [atTrack, setAtTrack] = useState(false);
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    const id = setInterval(() => {
      setAtTrack(inTrackArea(playerState.position.x, playerState.position.z));
      setNow(performance.now());
    }, 250);
    return () => clearInterval(id);
  }, []);
  const recent = news.filter((n) => now - n.at < NEWS_MS && (n.best || n.record));
  if (!atTrack && !recent.length) return null;
  return (
    <div className="lap-hud" data-testid="lap-hud">
      {atTrack && (
        <div className="lap-times">
          <div><span>Lap</span><b data-testid="lap-current">{current === null ? (playerState.riding ? "Cross the line" : "On the bike") : formatLap(current)}</b></div>
          <div><span>Last</span><b>{last === null ? "–" : formatLap(last)}</b></div>
          <div><span>Best</span><b data-testid="lap-best">{best === null ? "–" : formatLap(best)}</b></div>
        </div>
      )}
      {recent.map((n) => (
        <div key={`${n.id}${n.at}`} className="catch-toast lap-toast" data-testid="lap-toast">
          {n.mine ? "You" : <b>{n.name}</b>} set {n.record ? "the party's best lap" : n.mine ? "a new best lap" : "a new best lap"}: <b>{formatLap(n.s)}</b>
        </div>
      ))}
    </div>
  );
}
