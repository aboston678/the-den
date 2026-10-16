import { GARAGE_BIKE } from "@den/shared";
import { useMemo } from "react";
import { usePartyStore } from "../../net/party.ts";
import { useBikeCopy } from "./rider.ts";
import { type BikeView, useBikes } from "./store.ts";

// The parked motorcycles (Andrew, 2026-10-16): the one always waiting in the garage, and every bear's
// own bike wherever they left it. Bikes being ridden are drawn with their riders (rider.ts).

export function Bikes() {
  const world = usePartyStore((s) => s.world);
  const me = useBikes((s) => s.me);
  const others = useBikes((s) => s.others);
  if (world !== "property") return null;
  const parked = [["me", me] as const, ...Object.entries(others)].filter(([, b]) => b.state === "parked");
  return (
    <group name="bikes">
      <ParkedBike bike={{ state: "parked", ...GARAGE_BIKE }} />
      {parked.map(([id, b]) => <ParkedBike key={id} bike={b} />)}
    </group>
  );
}

function ParkedBike({ bike }: { bike: BikeView }) {
  const model = useBikeCopy();
  // Leaning a touch onto its side stand.
  const rot = useMemo(() => [0, bike.yaw, 0.06] as const, [bike.yaw]);
  return <primitive object={model} position={[bike.x, bike.y, bike.z]} rotation-order="YXZ" rotation={rot} />;
}
