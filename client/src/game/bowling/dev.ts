import { type LaneView, useLanes } from "./store.ts";

// window.__den.bowl: what the lanes look like to this browser, for tests and the screenshot tour.
// The write half only works in development builds.

export interface BowlDev {
  lanes: () => Record<"1" | "2", LaneView>;
  /** Dev only: show made-up bowlers and scores on the screens. */
  setLanes: (lanes: Partial<Record<"1" | "2", Partial<LaneView>>>) => void;
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
  };
}
