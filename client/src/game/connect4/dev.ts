import type { Camera } from "three";
import { c4Send } from "../../net/party.ts";
import { playerState } from "../state.ts";
import { useC4Prompt } from "./Connect4Controls.tsx";
import { cellPos } from "./Connect4Board.tsx";
import { useC4 } from "./store.ts";

// window.__den.c4: the Connect Four table as this browser sees it, for tests and screenshots.
// Moves go through the server like a click would.

export interface C4Dev {
  state: () => ReturnType<typeof useC4.getState> & { prompt: string | null; seated: boolean };
  sit: (seat: number) => void;
  stand: () => void;
  start: () => void;
  drop: (col: number) => void;
  /** Where a column's top hole is on screen (CSS pixels), to click it like a player. */
  screenOfColumn: (col: number) => { x: number; y: number };
}

export function installC4Dev(camera: Camera, canvas: HTMLCanvasElement) {
  if (!window.__den) return;
  window.__den.c4 = {
    state: () => ({ ...useC4.getState(), prompt: useC4Prompt.getState().text, seated: playerState.seated }),
    sit: (seat) => c4Send.sit(seat),
    stand: () => c4Send.stand(),
    start: () => c4Send.start(),
    drop: (col) => c4Send.drop(col),
    screenOfColumn: (col) => {
      const p = cellPos(col, 4).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    },
  };
}
