import { ALLEY_CEILING_Y, BED, FOUL_X, LANES } from "@den/shared";
import { useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Texture } from "three";
import { KIOSK_SCREENS, MASKING, SCREENS } from "./alleyGeometry.ts";
import { drawScoreboard } from "./scoreboard.ts";
import { type LaneView, useLanes } from "./store.ts";

// The alley's screens (GAME_SPEC §15): three hung over the foul line (left and right = each
// lane's scorecard, middle = the painted woods), the kiosk's two small screens (one per lane), and
// the mural on the masking wall over the pins. Scorecards are canvases redrawn only when a lane
// changes; screens are unlit so the cartoon lighting doesn't dim them. Floorplan metres.

export const MURAL_URL = "/textures/bowling/woods-mural.webp";
const CANVAS = { w: 1024, h: 576 };

interface Board {
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
}

function makeBoard(): Board {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS.w;
  canvas.height = CANVAS.h;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, texture };
}

function redraw(board: Board, lane: LaneView) {
  drawScoreboard(board.canvas.getContext("2d")!, CANVAS.w, CANVAS.h, lane);
  board.texture.needsUpdate = true;
}

/** A flat screen facing the bowlers (−x), centred at a floorplan point. Kept sharp (no cartoon texture softening). */
function screen(centre: [number, number, number], w: number, h: number, material: MeshBasicMaterial, name: string) {
  material.defines = { ...material.defines, NO_SOFT_MAP: "" };
  const m = new Mesh(new PlaneGeometry(w, h).rotateY(-Math.PI / 2), material);
  m.position.set(...centre);
  m.name = name;
  return m;
}

/** The mural fills the masking wall (wider than 16:9), so crop the picture's top and bottom. */
function muralCrop(map: Texture, aspect: number) {
  const t = map.clone();
  t.colorSpace = SRGBColorSpace;
  const keep = Math.min(1, (16 / 9) / aspect);
  t.repeat.set(1, keep);
  t.offset.set(0, (1 - keep) * 0.55);
  t.needsUpdate = true;
  return t;
}

export function Monitors() {
  const mural = useTexture(MURAL_URL);
  const boards = useMemo(() => ({ "1": makeBoard(), "2": makeBoard() }), []);
  const meshes = useMemo(() => {
    mural.colorSpace = SRGBColorSpace;
    const out: Mesh[] = [];
    const board = (id: "1" | "2") => new MeshBasicMaterial({ map: boards[id].texture, toneMapped: false });
    const mid = (LANES[0]!.cz + LANES[1]!.cz) / 2;
    out.push(screen([SCREENS.x, SCREENS.y, LANES[0]!.cz], SCREENS.w, SCREENS.h, board("1"), "bowling:screen-1"));
    out.push(screen([SCREENS.x, SCREENS.y, mid], SCREENS.w, SCREENS.h, new MeshBasicMaterial({ map: mural, toneMapped: false }), "bowling:screen-mid"));
    out.push(screen([SCREENS.x, SCREENS.y, LANES[1]!.cz], SCREENS.w, SCREENS.h, board("2"), "bowling:screen-2"));
    for (const k of KIOSK_SCREENS) out.push(screen(k.centre, k.w, k.h, board(k.lane as "1" | "2"), `bowling:kiosk-${k.lane}`));
    // The mural on the masking wall, edge to edge across both lanes.
    const z0 = BED.z0 - 0.15, z1 = BED.z1 + 0.15, h = ALLEY_CEILING_Y - MASKING.bottom - 0.05;
    const mw = z1 - z0;
    out.push(screen([FOUL_X + MASKING.x - 0.005, MASKING.bottom + h / 2, (z0 + z1) / 2], mw, h,
      new MeshBasicMaterial({ map: muralCrop(mural, mw / h), color: "#e6e6e6" }), "bowling:mural"));
    return out;
  }, [mural, boards]);

  // Redraw a lane's scorecard whenever it changes (and once the scoreboard font has loaded).
  useEffect(() => {
    const draw = (lanes: Record<"1" | "2", LaneView>, prev?: Record<"1" | "2", LaneView>) => {
      for (const id of ["1", "2"] as const) if (!prev || lanes[id] !== prev[id]) redraw(boards[id], lanes[id]);
    };
    draw(useLanes.getState().lanes);
    void document.fonts?.ready.then(() => draw(useLanes.getState().lanes));
    return useLanes.subscribe((s, p) => draw(s.lanes, p.lanes));
  }, [boards]);
  useEffect(() => () => {
    for (const m of meshes) {
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
    }
    boards["1"].texture.dispose();
    boards["2"].texture.dispose();
  }, [meshes, boards]);

  return <>{meshes.map((m) => <primitive key={m.uuid} object={m} />)}</>;
}
