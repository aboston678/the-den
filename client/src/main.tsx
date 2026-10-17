import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { applyArtStyle } from "./game/artStyle.ts";
import { initAuth } from "./net/auth.ts";
import { initUiSounds } from "./ui/uiSound.ts";
import "./styles.css";

applyArtStyle(); // no-op while the cartoon look is retired (game/artStyle.ts)
initUiSounds(); // a click on every button (GAME_SPEC §10)
initAuth(); // remembered Google sign-in, or the one we just came back from (GAME_SPEC §14)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
