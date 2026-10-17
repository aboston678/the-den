import { useFrame } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense, useEffect } from "react";
import { GameAudio } from "./audio/GameAudio.tsx";
import { BowlingControls } from "./bowling/BowlingControls.tsx";
import { CatanControls } from "./catan/CatanControls.tsx";
import { CatanTable } from "./catan/CatanTable.tsx";
import { Connect4Board } from "./connect4/Connect4Board.tsx";
import { Connect4Controls } from "./connect4/Connect4Controls.tsx";
import { BikeControls } from "./bike/BikeControls.tsx";
import { Bikes } from "./bike/Bikes.tsx";
import { LapControls } from "./track/laps.ts";
import { FishingControls } from "./fishing/FishingControls.tsx";
import { HuntCircle } from "./hunt/HuntCircle.tsx";
import { HuntControls } from "./hunt/HuntControls.tsx";
import { LockerGuns } from "./hunt/LockerGuns.tsx";
import { Tracers } from "./hunt/Tracers.tsx";
import { FishingLines } from "./fishing/FishingLines.tsx";
import { ThirdPersonCamera } from "./camera/ThirdPersonCamera.tsx";
import { attachKeyboard, beginInputFrame } from "./input/keyboard.ts";
import { PerfProbe } from "./PerfProbe.tsx";
import { PostFx } from "./PostFx.tsx";
import { Flashlights } from "./player/Flashlight.tsx";
import { Player } from "./player/Player.tsx";
import { RemoteBears } from "./remote/RemoteBears.tsx";
import { DayNightSky } from "./sky/Sky.tsx";
import { World } from "./world/World.tsx";

/** Everything inside the 3D canvas while playing. */
export function GameScene() {
  useEffect(() => attachKeyboard(), []);
  // Before anything else each frame (negative priority runs first and keeps automatic rendering).
  useFrame(beginInputFrame, -1);

  return (
    <>
      <DayNightSky />
      <PerfProbe />
      <PostFx />
      <GameAudio />
      {/* Step physics once per rendered frame: the bear's controller moves it every frame, and a
          fixed 60 Hz step sometimes skipped a frame and lost that frame's movement. */}
      <Physics gravity={[0, -20, 0]} timeStep="vary">
        <World />
        <Suspense fallback={null}>
          <Player />
        </Suspense>
        <RemoteBears />
        <FishingControls />
        <BowlingControls />
        <CatanControls />
        <CatanTable />
        <Connect4Controls />
        <Connect4Board />
        <BikeControls />
        <LapControls />
        <Suspense fallback={null}>
          <Bikes />
        </Suspense>
        <Suspense fallback={null}>
          <FishingLines />
        </Suspense>
        <HuntCircle />
        <HuntControls />
        <Tracers />
        <Suspense fallback={null}>
          <LockerGuns />
        </Suspense>
        <Flashlights />
        <ThirdPersonCamera />
      </Physics>
    </>
  );
}
