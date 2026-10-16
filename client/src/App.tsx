import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useState } from "react";
import { GameScene } from "./game/GameScene.tsx";
import { useQuality } from "./game/quality.ts";
import { tryRejoin, usePartyStore } from "./net/party.ts";
import { ActionPrompt } from "./ui/ActionPrompt.tsx";
import { FishingHud } from "./ui/FishingHud.tsx";
import { BowlingHud } from "./ui/BowlingHud.tsx";
import { CatanHud } from "./ui/CatanHud.tsx";
import { Connect4Hud } from "./ui/Connect4Hud.tsx";
import { ConnectionBadge, ControlsHint, PartyList } from "./ui/Hud.tsx";
import { LoadingScreen } from "./ui/LoadingScreen.tsx";
import { NameTags } from "./ui/NameTags.tsx";
import { Pause } from "./ui/Pause.tsx";
import { Intro } from "./ui/intro/Intro.tsx";
import { IntroBackdrop } from "./ui/intro/IntroBackdrop.tsx";
import { resumeMenuMusic, stopMenuMusic } from "./ui/intro/music.ts";
import { Splash } from "./ui/intro/Splash.tsx";
import { Home } from "./ui/home/Home.tsx";

/** Every page load: "Click to start" → the lyric intro → the lobby (or straight back into your game). */
type Stage = "splash" | "intro" | "menus";

export function App() {
  const [stage, setStage] = useState<Stage>("splash");
  const [backdropReady, setBackdropReady] = useState(false);
  const inGame = usePartyStore((s) => (s.status === "in-party" || s.status === "reconnecting") && s.phase === "playing");
  const playing = stage === "menus" && inGame;
  const dpr = Math.min(window.devicePixelRatio, useQuality().dpr); // render resolution (GAME_SPEC §17)

  useEffect(() => {
    tryRejoin(); // back into the party after a page reload (keeps your seat while the intro plays)
  }, []);

  // The menu song fades out as the game starts, and comes back if you leave to the menus.
  useEffect(() => {
    if (stage !== "menus") return;
    if (playing) stopMenuMusic(3);
    else void resumeMenuMusic();
  }, [stage, playing]);

  const start = useCallback(() => setStage("intro"), []);
  const introDone = useCallback(() => setStage("menus"), []);
  const ready = useCallback(() => setBackdropReady(true), []);

  if (stage !== "menus") {
    return (
      <div className="intro" data-stage={stage}>
        <IntroBackdrop visible={stage === "intro"} onReady={ready} />
        {stage === "splash" ? <Splash onStart={start} ready={backdropReady} /> : <Intro onDone={introDone} />}
      </div>
    );
  }
  return playing ? (
    <>
      <Canvas dpr={dpr} shadows="percentage" camera={{ position: [0, 3, 6], fov: 70 }}>
        <GameScene />
      </Canvas>
      <ConnectionBadge />
      <ControlsHint />
      <NameTags />
      <ActionPrompt />
      <FishingHud />
      <BowlingHud />
      <CatanHud />
      <Connect4Hud />
      <PartyList />
      <Pause />
      <LoadingScreen />
    </>
  ) : (
    <Home />
  );
}
