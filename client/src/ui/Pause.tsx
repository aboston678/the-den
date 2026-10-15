import { useEffect, useRef, useState } from "react";
import { cameraState } from "../game/state.ts";
import { leaveParty } from "../net/party.ts";
import { CONTROLS } from "./Hud.tsx";
import { SettingsPanel } from "./Settings.tsx";

// The pause menu (GAME_SPEC §11.6). Esc frees the mouse (the browser does that); when that
// happens, or Esc is pressed with the mouse already free, this menu opens. The party plays on.

export function Pause() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const wasLocked = useRef(false);

  useEffect(() => {
    const lockChange = () => {
      const locked = !!document.pointerLockElement;
      // Letting the mouse go for the Catan board isn't a pause.
      if (wasLocked.current && !locked && !cameraState.freeMouse) setOpen(true);
      if (locked) setOpen(false);
      wasLocked.current = locked;
    };
    const key = (e: KeyboardEvent) => {
      if (e.code === "Escape" && !document.pointerLockElement) setOpen((o) => !o);
    };
    document.addEventListener("pointerlockchange", lockChange);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerlockchange", lockChange);
      window.removeEventListener("keydown", key);
    };
  }, []);

  const resume = () => {
    setOpen(false);
    // Browsers can refuse (e.g. straight after Esc); a click on the game locks it then.
    if (!cameraState.freeMouse) void Promise.resolve(document.querySelector("canvas")?.requestPointerLock?.()).catch(() => {});
  };

  if (!open) return null;
  if (settings) return <SettingsPanel onClose={() => setSettings(false)} />;
  return (
    <div className="modal-backdrop" data-testid="pause">
      <div className="panel pause">
        <h2>Paused</h2>
        <p className="note">The party keeps playing.</p>
        <button className="primary big" data-testid="resume" onClick={resume}>Resume</button>
        <button data-testid="pause-settings" onClick={() => setSettings(true)}>Settings</button>
        <button className="quiet" data-testid="leave-game" onClick={() => leaveParty()}>Leave to home screen</button>
        <dl className="pause-controls">
          {CONTROLS.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
