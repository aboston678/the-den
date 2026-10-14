import { PIN_SPOTS } from "@den/shared";
import { Quaternion, Vector3 } from "three";

// Where each lane's pins, ball and sweep bar are right now, in lane coordinates (see
// shared/src/bowling/lane.ts). Written by the bowler's own physics or by the positions streamed
// from another bowler; read every frame by LanePins.tsx. Plain mutable objects (no re-renders).

export interface PinPose {
  p: Vector3;
  q: Quaternion;
  /** Off the deck (swept away, or in the pit). */
  gone: boolean;
}

export interface LaneRender {
  pins: PinPose[];
  ball: { p: Vector3; q: Quaternion; visible: boolean; colour: number };
  /** Sweep bar: 0 = up out of sight, 1 = down on the deck; x = how far it has swept (lane x). */
  sweep: { down: number; x: number };
}

export const restingPins = (): PinPose[] => PIN_SPOTS.map((s) => ({ p: new Vector3(s.x, 0, s.z), q: new Quaternion(), gone: false }));

const fresh = (): LaneRender => ({
  pins: restingPins(),
  ball: { p: new Vector3(), q: new Quaternion(), visible: false, colour: 0 },
  sweep: { down: 0, x: 0 },
});

export const laneRender: Record<"1" | "2", LaneRender> = { "1": fresh(), "2": fresh() };

/** Stand all ten pins back on their spots. */
export function rackPins(r: LaneRender) {
  PIN_SPOTS.forEach((s, i) => {
    const pin = r.pins[i]!;
    pin.p.set(s.x, 0, s.z);
    pin.q.identity();
    pin.gone = false;
  });
}
