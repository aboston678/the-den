import { BUCKET_REACH, CAST_MAX, isStreamWater, rodBucket } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import { create } from "zustand";
import { devFish, reelInLine, reelPress, takeRod, useFishStore } from "../../net/party.ts";
import { playAt } from "../audio/audio.ts";
import { indoor } from "../house/lights.ts";
import { consumePress } from "../input/keyboard.ts";
import { cameraState, playerState } from "../state.ts";
import { leaping } from "./FishingLines.tsx";

// Our own fishing controls (GAME_SPEC §6, §13): E at the rod bucket takes or returns a rod; hold
// the left mouse button to charge a cast and let go to throw toward where the camera looks; R
// strikes a bite and reels a hooked fish (R with nothing on winds the lure back in). Walking into
// the house puts the rod away.

/** The shortest cast (metres). */
const CAST_MIN = 3;
/** Seconds of holding the button for a full-power cast. */
const CHARGE_S = 1.1;

/** For the HUD: the cast being charged, a hint, and the bucket prompt. */
export const useCastUi = create<{ charging: boolean; power: number; hint: string | null; hintAt: number; prompt: string | null }>(() => ({
  charging: false,
  power: 0,
  hint: null,
  hintAt: 0,
  prompt: null,
}));

const canCast = () => {
  const me = useFishStore.getState().me;
  return me.rod && me.state !== "bite" && me.state !== "fight" && (playerState.action === "locomotion" || playerState.action === "dance");
};

/** Where a cast with this power lands: straight out from the bear the way the camera looks. */
function castTarget(power: number) {
  const fx = -Math.sin(cameraState.yaw), fz = -Math.cos(cameraState.yaw);
  const d = CAST_MIN + (CAST_MAX - CAST_MIN) * Math.max(0, Math.min(1, power));
  return { x: playerState.position.x + fx * d, z: playerState.position.z + fz * d };
}

/** Throw a cast with this power (0…1). Returns false (and shows a hint) if it wouldn't land on the water. */
export function castWithPower(power: number) {
  if (!canCast()) return false;
  const t = castTarget(power);
  if (!isStreamWater(t.x, t.z)) {
    const anyWater = [0.1, 0.3, 0.5, 0.7, 0.9, 1].some((p) => {
      const q = castTarget(p);
      return isStreamWater(q.x, q.z);
    });
    useCastUi.setState({ hint: anyWater ? (power < 0.5 ? "Hold longer: the water's further out" : "Too far: let go sooner") : "Face the stream to cast", hintAt: performance.now() });
    return false;
  }
  playerState.castRequest = t;
  return true;
}

export function FishingControls() {
  useEffect(() => {
    let startedAt = 0;
    const down = (e: MouseEvent) => {
      if (e.button !== 0 || !document.pointerLockElement || !canCast()) return;
      startedAt = performance.now();
      useCastUi.setState({ charging: true, power: 0 });
    };
    const up = (e: MouseEvent) => {
      if (e.button !== 0 || !useCastUi.getState().charging) return;
      const power = Math.min(1, (performance.now() - startedAt) / 1000 / CHARGE_S);
      useCastUi.setState({ charging: false, power: 0 });
      castWithPower(power);
    };
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    // Dev and tests: cast without the mouse, and make the next bite quick.
    const den = window.__den as unknown as Record<string, unknown> | undefined;
    if (den) {
      den.fish = {
        cast: (power: number) => castWithPower(power),
        me: () => useFishStore.getState().me,
        catches: () => useFishStore.getState().catches,
        quickBite: (seconds = 1, species?: string, weight?: number) => devFish(seconds, species, weight),
        leaping: () => [...leaping],
      };
    }
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  useFrame((_, dt) => {
    const ui = useCastUi.getState();
    const me = useFishStore.getState().me;
    const p = playerState.position;

    // The rod bucket at the base of the dock.
    const b = rodBucket();
    const atBucket = Math.hypot(p.x - b.x, p.z - b.z) <= BUCKET_REACH && !indoor.level;
    const prompt = atBucket ? (me.rod ? "Put the rod back" : "Take a fishing rod") : null;
    if (ui.prompt !== prompt) useCastUi.setState({ prompt });
    if (atBucket && consumePress("KeyE")) takeRod(!me.rod);

    // Into the house: the rod goes away.
    if (me.rod && indoor.level) takeRod(false);

    // R: strike, reel, or wind the lure back in.
    if (me.rod && consumePress("KeyR")) { // (no rod: R is the bear hunt's reload)
      if (me.state === "bite" || me.state === "fight" || me.state === "landed") {
        reelPress();
        void playAt("reel-click", p.x, p.y + 1.2, p.z, 0.5, 3);
      } else if (me.state === "cast") reelInLine();
    }

    if (ui.charging) {
      if (!canCast()) useCastUi.setState({ charging: false, power: 0 });
      else useCastUi.setState({ power: Math.min(1, ui.power + dt / CHARGE_S) });
    }
  });

  return null;
}
