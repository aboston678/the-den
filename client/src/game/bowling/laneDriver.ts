import { isGameOver, nextBall, pinsStanding } from "@den/shared";
import { type LaneView, useLanes } from "./store.ts";

// Who decides turns and scores. 3.2: a solo practice lane kept in this browser. (3.3 hands this to
// the party's game server.) The controls only ever call these and read the lanes store.

export const ALL_PINS = 0x3ff;
export const LOCAL_ID = "me";

const set = (id: "1" | "2", patch: Partial<LaneView>) =>
  useLanes.setState((s) => ({ lanes: { ...s.lanes, [id]: { ...s.lanes[id], ...patch } } }));

export const laneDriver = {
  /** Step onto a lane (a fresh game if it's empty or finished). */
  join(id: "1" | "2", name: string) {
    set(id, { bowlers: [{ id: LOCAL_ID, name, rolls: [] }], turn: 0, phase: "aim", standing: ALL_PINS });
  },
  leave(id: "1" | "2") {
    set(id, { bowlers: [], turn: 0, phase: "idle", standing: ALL_PINS });
  },
  /** The ball is on its way (others see "rolling"). */
  rolling(id: "1" | "2") {
    set(id, { phase: "rolling" });
  },
  /** A ball's result: which of the pins that were standing went down. */
  result(id: "1" | "2", knockedMask: number) {
    const lane = useLanes.getState().lanes[id];
    const me = lane.bowlers[lane.turn];
    if (!me) return;
    const knocked = popcount(knockedMask & lane.standing);
    const rolls = [...me.rolls, knocked];
    const fresh = nextBall(rolls)?.ball === 0 || pinsStanding(rolls) === 10;
    const over = isGameOver(rolls);
    set(id, {
      bowlers: lane.bowlers.map((b, i) => (i === lane.turn ? { ...b, rolls } : b)),
      standing: fresh || over ? ALL_PINS : lane.standing & ~knockedMask,
      phase: over ? "over" : "reset",
    });
  },
  /** The pinsetter's done: next ball. */
  ready(id: "1" | "2") {
    const lane = useLanes.getState().lanes[id];
    if (lane.phase === "reset") set(id, { phase: "aim" });
  },
};

export const popcount = (m: number) => {
  let n = 0;
  for (let i = 0; i < 10; i++) if (m & (1 << i)) n++;
  return n;
};
