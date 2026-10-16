import { useEffect, useState } from "react";
import { perfStats } from "../game/PerfProbe.tsx";
import { useQuality } from "../game/quality.ts";
import { current } from "../game/sky/look.ts";
import { usePartyStore } from "../net/party.ts";
import { useSettings } from "./settings.ts";

// The in-game HUD (GAME_SPEC §11.5): party badge with a small time-of-day icon (and the frame
// rate, if Settings → Show frame rate is on), the party list
// while Tab is held, and a controls reminder that fades after a while (the pause menu has them all).

function timeIcon() {
  const { phase, sun } = current.sky;
  if (phase === "night") return { icon: "☾", label: "Night" };
  if (phase === "dusk") return { icon: "◐", label: "Dusk" };
  if (phase === "dawn") return { icon: "◑", label: "Dawn" };
  return { icon: "☀", label: sun.y > 0.75 ? "Midday" : sun.x > 0 ? "Morning" : "Afternoon" };
}

export function ConnectionBadge() {
  const { status, code, players } = usePartyStore();
  const [time, setTime] = useState(timeIcon);
  useEffect(() => {
    const id = setInterval(() => setTime(timeIcon()), 1000);
    return () => clearInterval(id);
  }, []);
  const label = status === "reconnecting" ? "Reconnecting…" : `Party ${code} · ${players.length} bear${players.length === 1 ? "" : "s"}`;
  return (
    <div className={`badge badge--${status}`} data-testid="connection-status" data-status={status}>
      <strong>THE DEN</strong>
      <span>{label}</span>
      <span className="badge-time" title={time.label} data-testid="time-of-day">
        {time.icon} {time.label}
      </span>
      <FrameRate />
    </div>
  );
}

/** Frames per second right now, and the graphics level it's running at. */
function FrameRate() {
  const on = useSettings((s) => s.showFps);
  const tier = useQuality().tier;
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      // The typical frame of the last ~1.5 s, so one hitch (or coming back from the menu) doesn't skew it.
      const recent = perfStats.frames.slice(-90).sort((a, b) => a - b);
      const mid = recent[Math.floor(recent.length / 2)];
      setFps(mid ? Math.round(1000 / mid) : 0);
    }, 500);
    return () => clearInterval(id);
  }, [on]);
  if (!on) return null;
  const tone = fps >= 50 ? "good" : fps >= 30 ? "ok" : "slow";
  return (
    <span className={`badge-fps badge-fps--${tone}`} data-testid="fps">
      {fps} fps · {tier[0]!.toUpperCase() + tier.slice(1)}
    </span>
  );
}

/** Everyone in the party, while Tab is held. */
export function PartyList() {
  const [open, setOpen] = useState(false);
  const { players, hostId, sessionId } = usePartyStore();
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Tab") return;
      e.preventDefault(); // Tab would move focus around the page
      setOpen(true);
    };
    const up = (e: KeyboardEvent) => e.code === "Tab" && setOpen(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  if (!open) return null;
  return (
    <div className="party-overlay" data-testid="party-overlay">
      <h3>Party</h3>
      <ul>
        {players.map((p) => (
          <li key={p.id} className={p.connected ? "" : "away"}>
            {p.name}
            {p.id === hostId && <span className="tag">host</span>}
            {p.id === sessionId && <span className="tag">you</span>}
            {!p.connected && <span className="tag">reconnecting…</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const CONTROLS: [string, string][] = [
  ["WASD", "move"], ["Shift", "sprint"], ["Space", "jump"], ["Mouse", "look (click first)"], ["Scroll", "zoom"],
  ["E", "doors, rod bucket"], ["Hold mouse", "cast (with a rod)"], ["R", "reel"], ["F", "flashlight"], ["Y", "roar"], ["B", "dance"], ["Tab", "party"], ["Esc", "menu (full screen, settings)"],
];

/** A one-line controls reminder for the first moments in the game. */
export function ControlsHint() {
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setFaded(true), 25_000);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className={`controls-hint${faded ? " faded" : ""}`}>
      Click to look around · <b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump · <b>E</b> doors · <b>F</b> flashlight · <b>Y</b> roar · <b>B</b> dance · <b>Esc</b> menu
    </div>
  );
}
