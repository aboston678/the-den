import { useProgress } from "@react-three/drei";
import { useEffect, useState } from "react";
import { playerState } from "../game/state.ts";

// The loading screen (GAME_SPEC §11.2): from Play until your bear has landed. The logo, a real
// progress bar and rotating tips, then it fades into the game.

const TIPS = [
  "Press Y to roar. Bears nearby feel it.",
  "Press F for your flashlight. Everyone can see your beam.",
  "Doors open with E, for the whole party.",
  "A full day and night takes 68 minutes. The house lights stay on.",
  "Hold Tab to see who's in your party.",
  "Grab a rod from the bucket at the dock, hold the mouse to cast, and spam R when a fish bites.",
];

export function LoadingScreen() {
  const { progress } = useProgress();
  const [landed, setLanded] = useState(false);
  const [gone, setGone] = useState(false);
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    playerState.colliderHandle = -1; // left over from an earlier game; the new bear sets it once it exists
    playerState.grounded = false;
    const check = setInterval(() => {
      if (playerState.colliderHandle >= 0 && playerState.grounded) setLanded(true);
    }, 100);
    const rotate = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 4000);
    return () => {
      clearInterval(check);
      clearInterval(rotate);
    };
  }, []);
  useEffect(() => {
    if (!landed) return;
    const id = setTimeout(() => setGone(true), 900);
    return () => clearTimeout(id);
  }, [landed]);

  if (gone) return null;
  return (
    <div className={`loading${landed ? " done" : ""}`} data-testid="loading-screen">
      <img src="/ui/logo.png" alt="The Den" />
      <div className="loading-bar">
        <div style={{ width: `${landed ? 100 : Math.min(95, progress)}%` }} />
      </div>
      <p>{TIPS[tip]}</p>
    </div>
  );
}
