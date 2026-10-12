import { Canvas } from "@react-three/fiber";
import { useEffect } from "react";
import { GameScene } from "./game/GameScene.tsx";
import { tryRejoin, usePartyStore } from "./net/party.ts";
import { ActionPrompt } from "./ui/ActionPrompt.tsx";
import { ConnectionBadge } from "./ui/ConnectionBadge.tsx";
import { ControlsHint } from "./ui/ControlsHint.tsx";
import { Lobby } from "./ui/Lobby.tsx";

export function App() {
  const inGame = usePartyStore((s) => (s.status === "in-party" || s.status === "reconnecting") && s.phase === "playing");

  useEffect(() => {
    tryRejoin(); // back into the party after a page reload
  }, []);

  return inGame ? (
    <>
      <Canvas shadows="percentage" camera={{ position: [0, 3, 6], fov: 70 }}>
        <GameScene />
      </Canvas>
      <ConnectionBadge />
      <ControlsHint />
      <ActionPrompt />
    </>
  ) : (
    <Lobby />
  );
}
