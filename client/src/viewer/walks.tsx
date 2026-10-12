import { useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { StrictMode, Suspense, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { CanvasTexture, RepeatWrapping, type Group } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import "../styles.css";

// Dev-only page: walk clips side by side on the bear, all walking at the game's walk speed with
// each clip sped up the way the game does it (speed ÷ the clip's natural pace). For choosing a walk.
//   /walks.html?model=/models/bear-walks-preview.glb&clips=Walk:0.71,WalkOrc:0.36,WalkMonster:0.76,Walk2:1.03&speed=1.8
const params = new URLSearchParams(location.search);
const url = params.get("model") ?? "/models/bear.glb";
const speed = Number(params.get("speed") ?? 1.8);
const clips = (params.get("clips") ?? "Walk:0.71").split(",").map((c) => {
  const [name, natural] = c.split(":");
  return { name: name!, natural: Number(natural) };
});
const labels = (params.get("labels") ?? clips.map((c) => c.name).join(",")).split(",");
const GAP = 2.6;

function Bear({ clip, natural, x }: { clip: string; natural: number; x: number }) {
  const { scene, animations } = useGLTF(url);
  const model = useMemo(() => cloneSkinned(scene) as Group, [scene]);
  const { actions } = useAnimations(animations, model);
  useEffect(() => {
    const a = actions[clip];
    a?.play();
    if (a) a.timeScale = speed / natural;
  }, [actions, clip, natural]);
  useFrame(({ clock }) => {
    model.position.set(x, 0, clock.elapsedTime * speed);
  });
  return <primitive object={model} />;
}

function Follow() {
  const camera = useThree((s) => s.camera);
  useFrame(({ clock }) => {
    const z = clock.elapsedTime * speed;
    // In front of the bears and a little to the side, walking backwards with them.
    camera.position.set(2.5, 2.4, z + 8.5);
    camera.lookAt(0, 1.0, z);
  });
  return null;
}

function Ground() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#5a7442";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#4c6638";
    g.fillRect(0, 0, 32, 32);
    g.fillRect(32, 32, 32, 32);
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(200, 200);
    return t;
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[400, 400]} />
      <meshStandardMaterial map={tex} />
    </mesh>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ position: "fixed", inset: 0 }}>
      <Canvas shadows camera={{ fov: 45 }}>
        <color attach="background" args={["#b9cbd6"]} />
        <hemisphereLight args={["#dfe9f3", "#3c4a2e", 1]} />
        <directionalLight position={[10, 20, 8]} intensity={2.4} castShadow />
        <Ground />
        <Suspense fallback={null}>
          {clips.map((c, i) => <Bear key={c.name} clip={c.name} natural={c.natural} x={(i - (clips.length - 1) / 2) * GAP} />)}
        </Suspense>
        <Follow />
      </Canvas>
      <div style={{ position: "fixed", top: 16, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 18, font: "600 20px Oswald, system-ui", color: "#1b120b" }}>
        {labels.map((l) => <span key={l} style={{ background: "#efe6d2", padding: "4px 12px", borderRadius: 6 }}>{l}</span>)}
      </div>
    </div>
  </StrictMode>,
);
