import { Sky } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { Suspense, useEffect } from "react";
import { ThirdPersonCamera } from "./camera/ThirdPersonCamera.tsx";
import { attachKeyboard } from "./input/keyboard.ts";
import { Player } from "./player/Player.tsx";
import { TestGround } from "./world/TestGround.tsx";

const SUN: [number, number, number] = [40, 30, 25];

/** Everything inside the 3D canvas while playing. */
export function GameScene() {
  useEffect(() => attachKeyboard(), []);

  return (
    <>
      <color attach="background" args={["#9fb7c9"]} />
      <fog attach="fog" args={["#9fb7c9", 40, 140]} />
      <Sky sunPosition={SUN} turbidity={6} rayleigh={1.5} />
      <hemisphereLight args={["#dfe9f3", "#3c4a2e", 0.7]} />
      <directionalLight
        position={SUN}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
        shadow-bias={-0.0005}
      />
      {/* Step physics once per rendered frame: the bear's controller moves it every frame, and a
          fixed 60 Hz step sometimes skipped a frame and lost that frame's movement. */}
      <Physics gravity={[0, -20, 0]} timeStep="vary">
        <TestGround />
        <Suspense fallback={null}>
          <Player />
        </Suspense>
        <ThirdPersonCamera />
      </Physics>
    </>
  );
}
