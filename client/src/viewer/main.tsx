import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ModelViewer } from "./ModelViewer.tsx";
import "../styles.css";
import "./viewer.css";

// Dev-only turntable page for approving 3D models: /viewer.html?model=/models/bear-base.glb
// Add &compare=/models/other.glb to show a second model beside it.
const params = new URLSearchParams(location.search);
const model = params.get("model") ?? "/models/bear-base.glb";
const compare = params.get("compare");
// &clips=/models/a.glb,/models/b.glb borrows the animation clips from other files and plays
// them on the main model (the 1.4 rig test).
const clipFiles = params.get("clips")?.split(",").filter(Boolean) ?? [];
// &spin=0 starts paused; &angle=90 starts turned (degrees). Handy for matching screenshots.
const spin = params.get("spin") !== "0";
const angle = (Number(params.get("angle") ?? 0) * Math.PI) / 180;
// &clip=Run picks the clip; &t=0.25 freezes it at that many seconds (for matching screenshots).
const clipName = params.get("clip");
const freezeAt = params.has("t") ? Number(params.get("t")) : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ModelViewer
      url={model}
      compareUrl={compare}
      clipFiles={clipFiles}
      initialSpin={spin}
      initialAngle={angle}
      initialClip={clipName}
      freezeAt={freezeAt}
    />
  </StrictMode>,
);
