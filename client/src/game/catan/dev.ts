import type { CatanAction } from "@den/shared";
import { catanSend } from "../../net/party.ts";
import { playerState } from "../state.ts";
import { useCatanPrompt } from "./CatanControls.tsx";
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
  /** Dev only: next roll's dice and cards from the bank for me. */
  dev: (dice?: [number, number], give?: Record<string, number>) => void;
}

export function installCatanDev() {
  if (!window.__den) return;
  window.__den.catan = {
    state: () => ({ ...useCatan.getState(), prompt: useCatanPrompt.getState().text, seated: playerState.seated }),
    sit: (seat) => catanSend.sit(seat),
    stand: () => catanSend.stand(),
    start: () => catanSend.start(false),
    act: (action) => catanSend.act(action),
    quit: () => catanSend.quit(),
    dev: (dice, give) => {
      if (import.meta.env.DEV) catanSend.dev(dice, give);
    },
  };
}
