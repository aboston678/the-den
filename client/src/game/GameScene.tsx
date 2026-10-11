import { Environment, Sky } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { type DirectionalLight, Object3D, Vector3 } from "three";
import { ThirdPersonCamera } from "./camera/ThirdPersonCamera.tsx";
import { attachKeyboard } from "./input/keyboard.ts";
import { Player } from "./player/Player.tsx";
import { RemoteBears } from "./remote/RemoteBears.tsx";
import { playerState } from "./state.ts";
import { World } from "./world/World.tsx";

/** Mid-morning summer sun, from the south-east (the day/night cycle arrives in milestone 1.10). */
const SUN_DIR = new Vector3(0.45, 0.62, 0.64).normalize();
const SKY = "#c4d3dc"; // horizon colour: fog fades into it
const SHADOW_HALF = 45; // metres of crisp shadows around the bear
const SHADOW_MAP = 2048;

/** The sun: its shadow box follows the bear, snapped to whole shadow-map texels so edges don't shimmer. */
function Sun() {
  const light = useRef<DirectionalLight>(null);
  const target = useMemo(() => new Object3D(), []);
  const texel = (SHADOW_HALF * 2) / SHADOW_MAP;
  useFrame(() => {
    if (!light.current) return;
    const p = playerState.position;
    const x = Math.round(p.x / texel) * texel, z = Math.round(p.z / texel) * texel;
    target.position.set(x, p.y, z);
    light.current.position.set(x + SUN_DIR.x * 120, p.y + SUN_DIR.y * 120, z + SUN_DIR.z * 120);
    target.updateMatrixWorld();
  });
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        intensity={2.6}
        color="#fff4e6"
        castShadow
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}

/** Everything inside the 3D canvas while playing. */
export function GameScene() {
  useEffect(() => attachKeyboard(), []);
  const sunPos = SUN_DIR.clone().multiplyScalar(100).toArray();

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 35, 185]} />
      <Sky sunPosition={sunPos} turbidity={5} rayleigh={1.2} mieCoefficient={0.004} />
      {/* Soft light from the sky on every surface (rendered once from the same sky). */}
      <Environment frames={1} resolution={128} environmentIntensity={0.55}>
        <Sky sunPosition={sunPos} turbidity={5} rayleigh={1.2} mieCoefficient={0.004} />
      </Environment>
      <hemisphereLight args={["#dfe9f3", "#3a4630", 0.45]} />
      <Sun />
      {/* Step physics once per rendered frame: the bear's controller moves it every frame, and a
          fixed 60 Hz step sometimes skipped a frame and lost that frame's movement. */}
      <Physics gravity={[0, -20, 0]} timeStep="vary">
        <World />
        <Suspense fallback={null}>
          <Player />
        </Suspense>
        <RemoteBears />
        <ThirdPersonCamera />
      </Physics>
    </>
  );
}
