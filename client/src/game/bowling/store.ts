import { create } from "zustand";

// What the browser knows about the two lanes (GAME_SPEC §15): who's bowling, their balls so far,
// whose turn it is. Filled from the party room's state (net/party.ts, milestone 3.3); the
// overhead screens, kiosk and HUD draw from it.

export interface BowlerView {
  id: string;
  name: string;
  /** Pins knocked down by each ball so far. */
  rolls: number[];
}

export type LanePhase = "idle" | "aim" | "rolling" | "reset" | "over";

export interface LaneView {
  id: "1" | "2";
  bowlers: BowlerView[];
  /** Index into bowlers of whose turn it is. */
  turn: number;
  phase: LanePhase;
  /** 10 bits: which pins are standing (bit 0 = the head pin). */
  standing: number;
}

const empty = (id: "1" | "2"): LaneView => ({ id, bowlers: [], turn: 0, phase: "idle", standing: 0x3ff });

export const useLanes = create<{ lanes: Record<"1" | "2", LaneView> }>(() => ({ lanes: { "1": empty("1"), "2": empty("2") } }));

export const resetLanes = () => useLanes.setState({ lanes: { "1": empty("1"), "2": empty("2") } });
