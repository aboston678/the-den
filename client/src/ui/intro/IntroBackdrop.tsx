import { Canvas } from "@react-three/fiber";
import { useQuality } from "../../game/quality.ts";
import { IntroScene } from "./IntroScene.tsx";

/**
 * The 3D dusk scene behind the splash and the intro. It starts loading as the page opens (hidden
 * behind "Click to start") and fades in when the intro begins.
 */
export function IntroBackdrop({ visible, onReady }: { visible: boolean; onReady: () => void }) {
  const dpr = Math.min(window.devicePixelRatio, useQuality().dpr);
  return (
    <div className={`intro-scene${visible ? " ready" : ""}`}>
      <Canvas dpr={dpr} shadows="percentage" camera={{ fov: 55, near: 0.1, far: 1000 }}>
        <IntroScene onReady={onReady} />
      </Canvas>
    </div>
  );
}
