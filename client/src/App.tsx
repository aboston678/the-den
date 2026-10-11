import { Canvas } from "@react-three/fiber";
import { useEffect } from "react";
import { GameScene } from "./game/GameScene.tsx";
import { connectToParty } from "./net/party.ts";
import { ConnectionBadge } from "./ui/ConnectionBadge.tsx";
import { ControlsHint } from "./ui/ControlsHint.tsx";

export function App() {
  useEffect(() => {
    connectToParty();
  }, []);

  return (
    <>
      <Canvas shadows="percentage" camera={{ position: [0, 3, 6], fov: 70 }}>
        <GameScene />
      </Canvas>
      <ConnectionBadge />
      <ControlsHint />
    </>
  );
}
