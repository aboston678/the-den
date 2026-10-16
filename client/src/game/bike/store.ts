import { create } from "zustand";

// The motorcycles as the server reports them (Andrew, 2026-10-16): ours, and everyone else's parked
// ones. Filled by net/party.ts.

export interface BikeView {
  /** "" none, "riding", or "parked" at x/y/z facing yaw. */
  state: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export const NO_BIKE: BikeView = { state: "", x: 0, y: 0, z: 0, yaw: 0 };

export const useBikes = create<{ me: BikeView; others: Record<string, BikeView> }>(() => ({ me: NO_BIKE, others: {} }));

const same = (a: BikeView | undefined, b: BikeView) => !!a && a.state === b.state && a.x === b.x && a.y === b.y && a.z === b.z && a.yaw === b.yaw;

export function setBike(id: string | "me", b: BikeView) {
  const st = useBikes.getState();
  if (id === "me") {
    if (!same(st.me, b)) useBikes.setState({ me: b });
  } else if (!same(st.others[id], b)) useBikes.setState({ others: { ...st.others, [id]: b } });
}

export function dropBike(id: string) {
  const { [id]: _gone, ...others } = useBikes.getState().others;
  useBikes.setState({ others });
}
