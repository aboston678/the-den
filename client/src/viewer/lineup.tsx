import { OrbitControls, Sky, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { StrictMode, Suspense, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Box3, type Object3D, Vector3 } from "three";
import "../styles.css";

// Dev-only page: every top-level piece of a GLB side by side on a lawn, for checking props and trees.
//   /lineup.html?model=/models/trees.glb&only=lod0   (only = keep names containing this text)
//   &group=1 puts pieces whose names share a prefix before "_lod"/"_bark"/"_leaves" in one spot.
const params = new URLSearchParams(location.search);
const url = params.get("model") ?? "/models/trees.glb";
const only = params.get("only");
const group = params.get("group") === "1";
const cam = (params.get("cam") ?? "0,12,40").split(",").map(Number) as [number, number, number];

function Lineup() {
  const { scene } = useGLTF(url);
  const spots = useMemo(() => {
    const byKey = new Map<string, Object3D[]>();
    for (const child of [...scene.children]) {
      if (only && !child.name.includes(only)) continue;
      const key = group ? child.name.replace(/_(lod\d|bark|leaves).*$/, "") : child.name;
      byKey.set(key, [...(byKey.get(key) ?? []), child]);
    }
    let x = 0;
    return [...byKey.entries()].map(([key, parts]) => {
      const box = new Box3();
      for (const p of parts) box.expandByObject(p);
      const w = Math.max(1, box.getSize(new Vector3()).x);
      const spot = { key, parts, x: x + w / 2 };
      x += w + 1;
      return spot;
    }).map((s, _, all) => ({ ...s, x: s.x - (all.at(-1)!.x) / 2 }));
  }, [scene]);
  return (
    <>
      {spots.map((s) => (
        <group key={s.key} position-x={s.x}>
          {s.parts.map((p) => <primitive key={p.uuid} object={p} castShadow receiveShadow />)}
        </group>
      ))}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ position: "fixed", inset: 0 }}>
      <Canvas shadows camera={{ position: cam, fov: 50 }}>
        <Sky sunPosition={[40, 30, 25]} />
        <hemisphereLight args={["#dfe9f3", "#3c4a2e", 0.8]} />
        <directionalLight position={[40, 30, 25]} intensity={2.4} castShadow />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color="#4f6b3a" />
        </mesh>
        <Suspense fallback={null}>
          <Lineup />
        </Suspense>
        <OrbitControls target={[0, cam[1] / 2, 0]} />
      </Canvas>
    </div>
  </StrictMode>,
);
