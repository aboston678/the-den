import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ModelViewer } from "./ModelViewer.tsx";
import "../styles.css";
import "./viewer.css";

// Dev-only turntable page for approving 3D models: /viewer.html?model=/models/bear-base.glb
const model = new URLSearchParams(location.search).get("model") ?? "/models/bear-base.glb";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ModelViewer url={model} />
  </StrictMode>,
);
