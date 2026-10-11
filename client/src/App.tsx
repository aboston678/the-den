import { Canvas } from "@react-three/fiber";
import { useEffect } from "react";
import { connectToParty } from "./net/party.ts";
import { PlaceholderScene } from "./scene/PlaceholderScene.tsx";
import { ConnectionBadge } from "./ui/ConnectionBadge.tsx";

export function App() {
  useEffect(() => {
    connectToParty();
  }, []);

  return (
    <>
      <Canvas shadows="percentage" camera={{ position: [6, 4, 8], fov: 70 }}>
        <PlaceholderScene />
      </Canvas>
      <ConnectionBadge />
    </>
  );
}
