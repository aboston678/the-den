import { Canvas } from "@react-three/fiber";
import { IntroScene } from "./IntroScene.tsx";

/**
 * The 3D dusk scene behind the splash and the intro. It starts loading as the page opens (hidden
 * behind "Click to start") and fades in when the intro begins.
 */
export function IntroBackdrop({ visible, onReady }: { visible: boolean; onReady: () => void }) {
  return (
    <div className={`intro-scene${visible ? " ready" : ""}`}>
      <Canvas shadows="percentage" camera={{ fov: 55, near: 0.1, far: 1000 }}>
        <IntroScene onReady={onReady} />
      </Canvas>
    </div>
  );
}
