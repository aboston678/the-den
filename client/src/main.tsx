import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { applyArtStyle } from "./game/artStyle.ts";
import { initAuth } from "./net/auth.ts";
import "./styles.css";

applyArtStyle(); // the cartoon-look test, if picked (before anything is drawn)
initAuth(); // remembered Google sign-in, or the one we just came back from (GAME_SPEC §14)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
