import { click, useBowling } from "./session.ts";
import { type LaneView, useLanes } from "./store.ts";

// window.__den.bowl: what the lanes look like to this browser, for tests and the screenshot tour.
// The write half only works in development builds.

export interface BowlDev {
  lanes: () => Record<"1" | "2", LaneView>;
  /** Dev only: show made-up bowlers and scores on the screens. */
  setLanes: (lanes: Partial<Record<"1" | "2", Partial<LaneView>>>) => void;
  /** Your turn, as the HUD sees it. */
  me: () => { lane: string | null; mode: string; z: number; aim: number; power: number; curve: number; banner: string | null };
  /** A click of the mouse button on the meters (tests can't capture the mouse). */
  click: () => void;
  /** Dev only: skip the meters and bowl with these settings (when you're at the line). */
  throw: (t: { z: number; aim: number; power: number; curve: number }) => boolean;
}

export function installBowlDev() {
  if (!window.__den) return;
  window.__den.bowl = {
    lanes: () => useLanes.getState().lanes,
    setLanes: (patch) => {
      if (!import.meta.env.DEV) return;
      const cur = useLanes.getState().lanes;
      useLanes.setState({ lanes: { "1": { ...cur["1"], ...patch["1"] }, "2": { ...cur["2"], ...patch["2"] } } });
    },
    me: () => {
      const s = useBowling.getState();
      return { lane: s.lane, mode: s.mode, z: s.z, aim: s.aim, power: s.power, curve: s.curve, banner: s.banner?.text ?? null };
    },
    click,
    throw: (t) => {
      if (!import.meta.env.DEV || useBowling.getState().mode !== "aim") return false;
      useBowling.setState({ ...t, mode: "throw" });
      window.__den!.player.bowlRequest = true;
      return true;
    },
  };
}
