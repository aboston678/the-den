import { frames } from "@den/shared";
import type { LaneView } from "./store.ts";

// Drawing a lane's scorecard onto a canvas (GAME_SPEC §15): the overhead screens, the kiosk and the
// HUD all use this. Bright blue like the screens in reference/bowling/alley-inspiration.jpg: one
// row per bowler (up to 4) with the 10 frames, each ball's mark and the running total; the bowler
// whose turn it is is highlighted.

const FONT = "Oswald, system-ui, sans-serif";

export function drawScoreboard(ctx: CanvasRenderingContext2D, W: number, H: number, lane: LaneView) {
  const u = W / 1024; // everything is laid out for 1024 px wide
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#2a6be0");
  bg.addColorStop(1, "#123d9c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // A soft light flare in the corner, like the photo's screens.
  const flare = ctx.createRadialGradient(W * 0.18, H * 0.05, 0, W * 0.18, H * 0.05, W * 0.45);
  flare.addColorStop(0, "rgba(255,255,255,0.28)");
  flare.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = flare;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${64 * u}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(lane.id, 26 * u, 52 * u);
  ctx.font = `500 ${36 * u}px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const current = lane.bowlers[lane.turn];
  const status = lane.bowlers.length === 0
    ? "Press E at the ball return to bowl"
    : lane.phase === "over" ? "Game over" : current ? `${current.name}'s turn` : "";
  ctx.fillText(status.toUpperCase(), 90 * u, 54 * u);

  if (lane.bowlers.length === 0) {
    ctx.font = `500 ${40 * u}px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textAlign = "center";
    ctx.fillText("OPEN LANE", W / 2, H * 0.58);
    return;
  }

  const top = 100 * u, rowH = (H - top - 16 * u) / Math.max(2, lane.bowlers.length);
  const nameW = 150 * u, frameW = 82 * u, tenthW = 112 * u, left = 12 * u;
  lane.bowlers.forEach((b, row) => {
    const y = top + row * rowH;
    const mine = row === lane.turn && lane.phase !== "over";
    ctx.fillStyle = mine ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.8)";
    ctx.fillRect(left, y, W - 2 * left, rowH - 8 * u);
    if (mine) {
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 5 * u;
      ctx.strokeRect(left, y, W - 2 * left, rowH - 8 * u);
    }
    const h = rowH - 8 * u;
    ctx.fillStyle = "#0e2a6b";
    ctx.textAlign = "left";
    ctx.font = `600 ${Math.min(34, h / u / 3) * u}px ${FONT}`;
    ctx.fillText(clip(ctx, b.name, nameW - 20 * u), left + 12 * u, y + h / 2);
    const fs = frames(b.rolls);
    let x = left + nameW;
    fs.forEach((f, i) => {
      const w = i === 9 ? tenthW : frameW;
      ctx.strokeStyle = "rgba(14,42,107,0.45)";
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(x, y, w, h);
      const boxes = i === 9 ? 3 : 2, bw = w / (i === 9 ? 3 : 2);
      for (let k = 0; k < boxes; k++) {
        const bx = x + w - (boxes - k) * bw;
        ctx.strokeRect(bx, y, bw, h * 0.45);
        const m = f.marks[k];
        if (!m) continue;
        ctx.fillStyle = m === "X" || m === "/" ? "#c4162a" : "#0e2a6b";
        ctx.textAlign = "center";
        ctx.font = `600 ${Math.min(h * 0.32, bw * 0.95)}px ${FONT}`;
        ctx.fillText(m, bx + bw / 2, y + h * 0.24);
      }
      if (f.total !== null) {
        ctx.fillStyle = "#0e2a6b";
        ctx.textAlign = "center";
        ctx.font = `600 ${Math.min(h * 0.4, w * 0.5)}px ${FONT}`;
        ctx.fillText(String(f.total), x + w / 2, y + h * 0.73);
      }
      x += w;
    });
  });
}

function clip(ctx: CanvasRenderingContext2D, s: string, max: number) {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}
