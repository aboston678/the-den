import {
  Environment,
  Lightformer,
  useAnimations,
  useGLTF,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { StrictMode, Suspense, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import "../styles.css";

// Dev-only page for approving the bear hunt's models (2026-10-17): the hunter from the front, side
// and back, and each gun side-on, muzzle to the right (+z turned to +x).
//   /hunt-sheet.html            the hunter (Idle) + guns
//   /hunt-sheet.html?clip=Run&t=0.3   the hunter frozen in a clip
const params = new URLSearchParams(location.search);
const clip = params.get("clip") ?? "Idle";
const t = Number(params.get("t") ?? 0.4);

function Hunter({ x, yaw }: { x: number; yaw: number }) {
  const { scene, animations } = useGLTF("/models/hunter.glb");
  const copy = useMemo(() => cloneSkinned(scene), [scene]);
  const { actions } = useAnimations(animations, copy);
  useEffect(() => {
    const a = actions[clip] ?? actions.Idle;
    if (!a) return;
    a.play();
    a.paused = true;
    a.time = t;
  }, [actions]);
  return <primitive object={copy} position={[x, 0, 0]} rotation-y={yaw} />;
}

const GUNS = ["sniper", "ar", "shotgun", "pistol", "scope"];
function Guns() {
  const { scene } = useGLTF("/models/guns.glb");
  return (
    <group position={[0, 0, 0]}>
      {GUNS.map((name, i) => {
        const node = scene.getObjectByName(name);
        if (!node) return null;
        const copy = node.clone();
        const s = name === "pistol" || name === "scope" ? 2.5 : 1.4;
        return (
          <group
            key={name}
            position={[1.75, 1.5 - i * 0.36, 0]}
            rotation-y={Math.PI / 2}
            scale={s}
          >
            <primitive object={copy} />
          </group>
        );
      })}
    </group>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ position: "fixed", inset: 0 }}>
      <Canvas camera={{ position: [0.3, 0.95, 5.6], fov: 36 }}>
        <color attach="background" args={["#cfd1d2"]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 5, 4]} intensity={2.4} />
        <Environment resolution={256}>
          <Lightformer
            form="rect"
            intensity={2}
            position={[0, 4, 4]}
            scale={[6, 3, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1}
            position={[-5, 2, -2]}
            rotation-y={Math.PI / 2}
            scale={[4, 3, 1]}
          />
        </Environment>
        <Suspense fallback={null}>
          <group position-y={-0.9}>
            <Hunter x={-1.6} yaw={0} />
            <Hunter x={-0.6} yaw={Math.PI / 2} />
            <Hunter x={0.4} yaw={Math.PI} />
            <Guns />
          </group>
        </Suspense>
      </Canvas>
    </div>
  </StrictMode>,
);
