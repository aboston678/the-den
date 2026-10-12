import { Physics } from "@react-three/rapier";
import { Suspense, useEffect } from "react";
import { ThirdPersonCamera } from "./camera/ThirdPersonCamera.tsx";
import { attachKeyboard } from "./input/keyboard.ts";
import { Flashlights } from "./player/Flashlight.tsx";
import { Player } from "./player/Player.tsx";
import { RemoteBears } from "./remote/RemoteBears.tsx";
import { DayNightSky } from "./sky/Sky.tsx";
import { World } from "./world/World.tsx";

/** Everything inside the 3D canvas while playing. */
export function GameScene() {
  useEffect(() => attachKeyboard(), []);

  return (
    <>
      <DayNightSky />
      {/* Step physics once per rendered frame: the bear's controller moves it every frame, and a
          fixed 60 Hz step sometimes skipped a frame and lost that frame's movement. */}
      <Physics gravity={[0, -20, 0]} timeStep="vary">
        <World />
        <Suspense fallback={null}>
          <Player />
        </Suspense>
        <RemoteBears />
        <Flashlights />
        <ThirdPersonCamera />
      </Physics>
    </>
  );
}
