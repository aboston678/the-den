import { DRIVEWAY, DRIVEWAY_WIDTH, HOUSE_FOOTPRINT, type HuntRole, PADDOCK, STREAM, TRACK, TRACK_AREA, TRACK_ROAD, TRACK_WIDTH, TRAIL, inTrackArea, lawnMask, streamCenter } from "@den/shared";
import { useEffect, useRef } from "react";
import { cameraState, playerState } from "../game/state.ts";
import { remotes } from "../net/remotes.ts";
import { roleOf } from "../game/hunt/store.ts";

// The bear hunt's mini-map (Andrew, 2026-10-17), top right, north up: the property and the racetrack
// drawn once, a window round you, you as an arrow. The bear sees every hunter as a red dot; hunters
// see only each other (blue). The bear never shows on a hunter's map.

const SIZE = 200; // px on screen
const WORLD = { minX: TRACK_AREA.minX - 30, maxX: 180, minZ: TRACK_AREA.minZ - 30, maxZ: 180 };
const PX = 1; // map pixels per metre in the drawn-once picture

let picture: HTMLCanvasElement | null = null;
/** The whole map drawn once: woods, lawn, stream, roads, house, the track. */
function drawPicture() {
  const c = document.createElement("canvas");
  c.width = Math.ceil((WORLD.maxX - WORLD.minX) * PX);
  c.height = Math.ceil((WORLD.maxZ - WORLD.minZ) * PX);
  const ctx = c.getContext("2d")!;
  const X = (x: number) => (x - WORLD.minX) * PX, Z = (z: number) => (z - WORLD.minZ) * PX;
  ctx.fillStyle = "#24361f"; // woods
  ctx.fillRect(0, 0, c.width, c.height);
  // Farmland and the track grounds.
  ctx.fillStyle = "#5d6b37";
  ctx.fillRect(X(TRACK_AREA.minX - 30), Z(TRACK_AREA.minZ - 30), (TRACK_AREA.maxX - TRACK_AREA.minX + 140) * PX, (TRACK_AREA.maxZ - TRACK_AREA.minZ + 60) * PX);
  ctx.fillStyle = "#6f8a3f";
  ctx.fillRect(X(TRACK_AREA.minX), Z(TRACK_AREA.minZ), (TRACK_AREA.maxX - TRACK_AREA.minX) * PX, (TRACK_AREA.maxZ - TRACK_AREA.minZ) * PX);
  // The lawn round the house.
  ctx.fillStyle = "#6f9447";
  for (let x = -110; x < 140; x += 4) for (let z = -105; z < 105; z += 4) if (lawnMask(x, z) > 0.5) ctx.fillRect(X(x), Z(z), 4 * PX, 4 * PX);
  // The stream.
  ctx.fillStyle = "#3d7fa8";
  for (let z = -140; z < 140; z += 2) {
    const cx = streamCenter(z);
    ctx.fillRect(X(cx - STREAM.width / 2), Z(z), STREAM.width * PX, 2 * PX);
  }
  const road = (path: { pointAt(s: number): { x: number; z: number }; length: number }, width: number, colour: string) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2, width * PX);
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.beginPath();
    for (let s = 0; s <= path.length; s += 4) {
      const q = path.pointAt(Math.min(s, path.length));
      if (s === 0) ctx.moveTo(X(q.x), Z(q.z));
      else ctx.lineTo(X(q.x), Z(q.z));
    }
    ctx.stroke();
  };
  road(TRAIL, 2, "#a08a63");
  road(DRIVEWAY, DRIVEWAY_WIDTH, "#545454");
  road(TRACK_ROAD, 4, "#545454");
  road(TRACK, TRACK_WIDTH, "#3c3c3c");
  ctx.fillStyle = "#4a4a4a";
  ctx.fillRect(X(PADDOCK.minX), Z(PADDOCK.minZ), (PADDOCK.maxX - PADDOCK.minX) * PX, (PADDOCK.maxZ - PADDOCK.minZ) * PX);
  // The house.
  ctx.fillStyle = "#e9e2d0";
  for (const r of HOUSE_FOOTPRINT) ctx.fillRect(X(r.minX), Z(r.minZ), (r.maxX - r.minX) * PX, (r.maxZ - r.minZ) * PX);
  return c;
}

export function MiniMap({ role }: { role: HuntRole }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    picture ??= drawPicture();
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext("2d")!;
      const p = playerState.position;
      const span = inTrackArea(p.x, p.z) ? 600 : 250; // metres across
      const k = SIZE / span;
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(picture!, (p.x - span / 2 - WORLD.minX) * PX, (p.z - span / 2 - WORLD.minZ) * PX, span * PX, span * PX, 0, 0, SIZE, SIZE);
      const at = (x: number, z: number) => [SIZE / 2 + (x - p.x) * k, SIZE / 2 + (z - p.z) * k] as const;
      // Other players: hunters (red for the bear, blue for fellow hunters). Never the bear.
      for (const r of remotes.values()) {
        if (roleOf(r.id) !== "hunter") continue;
        const [sx, sz] = at(r.current.x, r.current.z);
        ctx.fillStyle = role === "bear" ? "#ff3b2f" : "#56a8ff";
        ctx.beginPath();
        ctx.arc(Math.max(6, Math.min(SIZE - 6, sx)), Math.max(6, Math.min(SIZE - 6, sz)), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
      // You: an arrow the way the camera faces.
      ctx.save();
      ctx.translate(SIZE / 2, SIZE / 2);
      ctx.rotate(-cameraState.yaw);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(239,230,210,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(239,230,210,0.8)";
      ctx.font = "bold 12px system-ui";
      ctx.fillText("N", SIZE / 2 - 4, 14);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [role]);
  return <canvas ref={ref} className="hunt-map" width={SIZE} height={SIZE} data-testid="hunt-map" data-role={role} />;
}

/** For tests: which players the map draws (ids). */
export function mapDots(role: HuntRole) {
  return [...remotes.values()].filter((r) => roleOf(r.id) === "hunter").map((r) => ({ id: r.id, colour: role === "bear" ? "red" : "blue" }));
}
