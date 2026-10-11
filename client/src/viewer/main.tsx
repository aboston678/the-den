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
// &spin=0 starts paused; &angle=90 starts turned (degrees). Handy for matching screenshots.
const spin = params.get("spin") !== "0";
const angle = (Number(params.get("angle") ?? 0) * Math.PI) / 180;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ModelViewer url={model} compareUrl={compare} initialSpin={spin} initialAngle={angle} />
  </StrictMode>,
);
