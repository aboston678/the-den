import { useProgress } from "@react-three/drei";
import { useEffect } from "react";
import { getListener } from "../../game/audio/audio.ts";
import { preloadMusic } from "./music.ts";
import { fullscreenIfWanted } from "../fullscreen.ts";

// Black screen, "Click to start" (GAME_SPEC §11): browsers only allow sound after a click or key,
// and the intro is all about the song. Until the 3D world behind it has loaded it shows a thin
// loading bar instead, so the intro never stutters.

export function Splash({ onStart, ready }: { onStart: () => void; ready: boolean }) {
  const { progress } = useProgress();
  const start = () => {
    if (!ready) return;
    void getListener().context.resume(); // inside the click/key, so the browser allows sound
    fullscreenIfWanted(); // full screen from the very first click (on by default, Andrew round 3)
    preloadMusic();
    onStart();
  };
  useEffect(() => {
    if (!ready) return;
    const key = (e: KeyboardEvent) => {
      if (!e.repeat) start();
    };
    window.addEventListener("keydown", key, { once: true });
    return () => window.removeEventListener("keydown", key);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button className={`splash${ready ? " ready" : ""}`} data-testid="start" disabled={!ready} onClick={start}>
      {ready ? (
        <span>Click to start</span>
      ) : (
        <div className="splash-loading" data-testid="splash-loading">
          <div style={{ width: `${Math.max(4, Math.min(96, progress))}%` }} />
        </div>
      )}
    </button>
  );
}
