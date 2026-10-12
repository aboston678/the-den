import { TIME_PRESETS, heightAt } from "@den/shared";
import { useFrame, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { useProgress } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { CatmullRomCurve3, Vector3 } from "three";
import { holdClock } from "../../game/sky/clock.ts";
import { DayNightSky } from "../../game/sky/Sky.tsx";
import { playerState } from "../../game/state.ts";
import { World } from "../../game/world/World.tsx";
import { INTRO_LENGTH, introTime } from "./music.ts";

// The intro's backdrop (GAME_SPEC §11): the real property at golden dusk, the camera gliding out
// of the woods by the driveway toward the lit house, timed to the song. Physics is paused; nothing
// moves but the camera.

/** Where the camera goes (world x, z; it stays this high above the ground). */
// Up the driveway through the woods, out onto the front lawn (the clearing, shared/src/world/layout.ts).
const PATH: [number, number][] = [[-96, -88], [-78, -62], [-62, -40], [-44, -20], [-22, -20], [0, -26]];
const HEIGHT = 2.6;
const HOUSE_LOOK = new Vector3(2, 3, 2);

function CameraGlide() {
  const camera = useThree((s) => s.camera);
  const curve = useMemo(
    () => new CatmullRomCurve3(PATH.map(([x, z], i) => new Vector3(x, heightAt(x, z) + HEIGHT + (i === PATH.length - 1 ? 2.5 : 0), z)), false, "centripetal"),
    [],
  );
  const look = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const k = Math.min(1, introTime() / INTRO_LENGTH);
    const u = k * k * (3 - 2 * k) * 0.55 + k * 0.45; // eases in and out a little
    const pos = curve.getPointAt(u);
    camera.position.copy(pos);
    // Look along the drive at first, then turn toward the house as it comes into view.
    const ahead = curve.getPointAt(Math.min(1, u + 0.08));
    const toHouse = Math.min(1, Math.max(0, (u - 0.3) / 0.45));
    look.copy(ahead).setY(ahead.y - 0.3).lerp(HOUSE_LOOK, toHouse);
    camera.lookAt(look);
    playerState.position.set(pos.x, pos.y - HEIGHT, pos.z); // lamps and shadows centre on the view
  });
  return null;
}

/**
 * Calls onReady once the world has loaded and frames come smoothly (building the forest and the
 * house briefly freezes the page; that should happen behind "Click to start", not mid-song).
 */
function ReadyWatch({ onReady }: { onReady: () => void }) {
  const { active, loaded } = useProgress();
  const smooth = useRef(0);
  const told = useRef(false);
  useFrame((_, dt) => {
    if (told.current) return;
    smooth.current = !active && loaded > 0 && dt < 0.1 ? smooth.current + 1 : 0;
    if (smooth.current > 20) {
      told.current = true;
      onReady();
    }
  });
  return null;
}

export function IntroScene({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    holdClock(TIME_PRESETS.dusk);
    return () => holdClock(null);
  }, []);
  return (
    <>
      <DayNightSky />
      <Physics paused>
        <World />
      </Physics>
      <CameraGlide />
      <ReadyWatch onReady={onReady} />
    </>
  );
}
