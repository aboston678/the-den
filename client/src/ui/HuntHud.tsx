import { BEAR_HEALTH, GUN, GUNS, type GunId, HUNT_CIRCLE, HUNT_LIMIT_S, SWIPE, bearPoints } from "@den/shared";
import { useEffect, useState } from "react";
import { huntSend, usePartyStore } from "../net/party.ts";
import { cameraState, playerState } from "../game/state.ts";
import { closeLocker } from "../game/hunt/HuntControls.tsx";
import { huntSeconds, myRole, serverNow, useHunt } from "../game/hunt/store.ts";
import { MiniMap } from "./MiniMap.tsx";

// The bear hunt on screen (Andrew, 2026-10-17): who's ready in the circle and the countdown; during
// a hunt the clock, the bear's points and health, your role, and (hunters) the crosshair, gun, ammo
// and scope, (the bear) the swipe; the locker's panel in the basement; and the result at the end.

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const KEY: Record<GunId, string> = { sniper: "1", pistol: "2", ar: "3", shotgun: "4" };
const HOW_NEAR = 14; // metres from the circle to see who's ready

/** Re-render a few times a second (clocks and the scope). */
function useTick(ms = 100) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function HuntHud() {
  useTick();
  const h = useHunt();
  const me = usePartyStore((s) => s.sessionId);
  const players = usePartyStore((s) => s.players);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "A bear";
  const role = myRole(me);
  const p = playerState.position;
  const nearCircle = Math.hypot(p.x - HUNT_CIRCLE.x, p.z - HUNT_CIRCLE.z) < HOW_NEAR;

  if (h.phase === "over" && h.result) {
    const r = h.result;
    const head = r.how === "shot" ? `${r.byId === me ? "You" : r.byName} took the bear down!` : r.how === "survived" ? "The bear survived!" : r.how === "bearLeft" ? "The bear left the hunt" : "The hunters all left";
    return (
      <div className="hunt-hud">
        <div className="hunt-result" data-testid="hunt-result">
          <h2>{head}</h2>
          <p>
            {r.bearId === me ? "You" : r.bearName} lasted <b>{mmss(r.seconds)}</b> as the bear: <b data-testid="hunt-points">{r.points}</b> point{r.points === 1 ? "" : "s"}
            {r.how === "shot" && r.byGun ? `. Taken down with the ${r.byGun === "ar" ? "AR" : GUN[r.byGun].name.toLowerCase()}.` : ""}
          </p>
          <p className="hunt-sub">Step into the blue circle by the dock for another hunt.</p>
        </div>
      </div>
    );
  }

  if (h.phase === "idle" || h.phase === "countdown") {
    if (!nearCircle) return null;
    const left = Math.max(0, Math.ceil((h.countdownEnd - serverNow()) / 1000));
    return (
      <div className="hunt-hud">
        <div className="hunt-lobby" data-testid="hunt-lobby">
          <h3>Bear hunt</h3>
          {h.phase === "countdown" ? <p className="hunt-count" data-testid="hunt-countdown">Starting in {left}…</p> : <p>Stand in the blue circle and press <b>E</b> when you're ready. Everyone in the circle (2 or more) must be ready.</p>}
          <ul>{h.ready.map((id) => <li key={id}>✔ {id === me ? "You" : nameOf(id)}</li>)}</ul>
        </div>
      </div>
    );
  }

  // A hunt is on.
  const secs = huntSeconds();
  const pts = bearPoints(secs);
  const nextAt = Math.min(HUNT_LIMIT_S, (Math.floor(secs / 60) + 1) * 60);
  const health = Math.max(0, h.bearHealth) / BEAR_HEALTH;
  if (role === "") {
    return (
      <div className="hunt-hud">
        <div className="hunt-bar small" data-testid="hunt-watching">Bear hunt on · {mmss(secs)} · {nameOf(h.bearId)} has {pts} pts</div>
      </div>
    );
  }
  const started = serverNow() - h.startedAt < 6000;
  const mine = h.me;
  const down = serverNow() < mine.downUntil;
  const hitFlash = performance.now() - h.hitAt < 350;
  const scoped = cameraState.aim === 2;
  return (
    <div className="hunt-hud" data-role={role}>
      <div className="hunt-bar" data-testid="hunt-bar">
        <span className="hunt-clock" data-testid="hunt-clock">{mmss(secs)} / {mmss(HUNT_LIMIT_S)}</span>
        <span className="hunt-health" title="The bear's health"><i style={{ width: `${health * 100}%` }} data-testid="hunt-health" data-health={h.bearHealth} /></span>
        <span>Bear: <b data-testid="hunt-live-points">{pts}</b> pts{secs < HUNT_LIMIT_S ? ` · ${bearPoints(nextAt)} at ${mmss(nextAt)}` : ""}</span>
      </div>
      {started && (
        <div className="hunt-banner" data-testid="hunt-banner">
          {role === "bear" ? <><h2>You're the bear!</h2><p>Hide{h.spot ? `: you start in ${h.spot}` : ""}. Every minute you survive doubles your points. Red dots are hunters.</p></>
            : <><h2>You're a hunter</h2><p>Find {nameOf(h.bearId)} the bear and take it down. More guns in the basement locker.</p></>}
        </div>
      )}
      {role === "bear" && <BearTools />}
      {role === "hunter" && (
        <>
          {scoped ? <div className="hunt-scope" data-testid="hunt-scope" /> : <div className={`hunt-cross${hitFlash ? " hit" : ""}`} data-testid="hunt-cross" />}
          {hitFlash && <div className="hunt-hitmark" data-testid="hunt-hit">HIT</div>}
          <div className="hunt-guns" data-testid="hunt-guns">
            {GUNS.filter((g) => mine.guns.includes(g)).map((g) => (
              <div key={g} className={g === mine.gun ? "on" : ""}>
                <kbd>{KEY[g]}</kbd> {GUN[g].name}{mine.scoped.includes(g) ? " + scope" : ""}
              </div>
            ))}
            {mine.gun && (
              <div className="hunt-ammo" data-testid="hunt-ammo">
                {mine.reloadUntil ? "Reloading…" : <><b>{mine.ammo}</b> / {GUN[mine.gun].mag}</>}
              </div>
            )}
            <p className="hunt-keys">Left click fire · Right click aim · R reload</p>
          </div>
          {down && <div className="hunt-down" data-testid="hunt-down">Knocked down by the bear!</div>}
          {h.lockerOpen && <LockerPanel />}
        </>
      )}
      <MiniMap role={role} />
    </div>
  );
}

function BearTools() {
  return (
    <div className="hunt-guns bear">
      <div><kbd>Left click</kbd> Swipe ({SWIPE.downS} s knock-down, close up)</div>
      <div><kbd>Y</kbd> Roar (everyone hears where)</div>
    </div>
  );
}

function LockerPanel() {
  const mine = useHunt((s) => s.me);
  return (
    <div className="hunt-locker" data-testid="hunt-locker" onPointerDown={(e) => e.stopPropagation()}>
      <h3>Gun locker</h3>
      {GUNS.map((g) => {
        const has = mine.guns.includes(g), scoped = mine.scoped.includes(g);
        return (
          <div key={g} className="row">
            <span><kbd>{KEY[g]}</kbd> {GUN[g].name} <small>{g === "sniper" ? "1 shot a reload" : g === "ar" ? "fully automatic" : g === "pistol" ? "semi-automatic" : "close range"}</small></span>
            <button type="button" data-testid={`locker-${g}`} onClick={() => huntSend.locker(has ? "return" : "take", g)}>{has ? "Put back" : "Take"}</button>
            <button type="button" data-testid={`scope-${g}`} disabled={!has} onClick={() => huntSend.locker("scope", g, !scoped)}>{scoped ? "Scope off" : "Scope on"}</button>
          </div>
        );
      })}
      <button type="button" className="close" onClick={closeLocker}>Done (E)</button>
    </div>
  );
}
