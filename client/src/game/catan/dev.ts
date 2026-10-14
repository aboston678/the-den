import type { CatanAction } from "@den/shared";
import { type Camera, Vector3 } from "three";
import { catanSend } from "../../net/party.ts";
import { playerState } from "../state.ts";
import { useCatanPrompt } from "./CatanControls.tsx";
import { edgePos, hexPos, vertexPos, TILE_TOP } from "./layout.ts";
import { useCatan } from "./store.ts";

// window.__den.catan: the Catan table as this browser sees it, for tests and the screenshot tour.
// Moves go through the server like any click would; the dev-only extras (forced dice, free cards)
// only work in development builds and the server ignores them in production.

export interface CatanDev {
  state: () => ReturnType<typeof useCatan.getState> & { prompt: string | null; seated: boolean };
  sit: (seat: number) => void;
  stand: () => void;
  start: () => void;
  act: (action: CatanAction) => void;
  quit: () => void;
  /** Dev only: next roll's dice, cards from the bank, and (vp) every victory point card left in the deck for me. */
  dev: (dice?: [number, number], give?: Record<string, number>, vp?: boolean) => void;
  /** Where a corner, edge or hex of the board is on screen (CSS pixels), to click it like a player. */
  screenOf: (kind: "vertex" | "edge" | "hex", id: number) => { x: number; y: number };
}

export function installCatanDev(camera: Camera, canvas: HTMLCanvasElement) {
  if (!window.__den) return;
  window.__den.catan = {
    state: () => ({ ...useCatan.getState(), prompt: useCatanPrompt.getState().text, seated: playerState.seated }),
    sit: (seat) => catanSend.sit(seat),
    stand: () => catanSend.stand(),
    start: () => catanSend.start(false),
    act: (action) => catanSend.act(action),
    quit: () => catanSend.quit(),
    dev: (dice, give, vp) => {
      if (import.meta.env.DEV) catanSend.dev(dice, give, vp);
    },
    screenOf: (kind, id) => {
      const p = kind === "vertex" ? new Vector3(...vertexPos(id)) : kind === "hex" ? new Vector3(...hexPos(id)) : (() => {
        const e = edgePos(id);
        return new Vector3(e.x, TILE_TOP, e.z);
      })();
      p.project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    },
  };
}
