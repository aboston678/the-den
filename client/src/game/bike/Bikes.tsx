import { GARAGE_BIKE } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Object3D } from "three";
import { usePartyStore } from "../../net/party.ts";
import { remotes } from "../../net/remotes.ts";
import { playerState } from "../state.ts";
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
      <ParkedBike bike={{ state: "parked", ...GARAGE_BIKE }} garage />
      {parked.map(([id, b]) => <ParkedBike key={id} bike={b} />)}
    </group>
  );
}

/** True while a bear is riding a bike right where the garage bike stands (just after taking one). */
function garageSpotTaken() {
  const near = (x: number, z: number) => Math.hypot(x - GARAGE_BIKE.x, z - GARAGE_BIKE.z) < 1.8;
  if (playerState.riding && near(playerState.position.x, playerState.position.z)) return true;
  for (const r of remotes.values()) if (r.current.action === "ride" && near(r.current.x, r.current.z)) return true;
  return false;
}

function ParkedBike({ bike, garage = false }: { bike: BikeView; garage?: boolean }) {
  const model = useBikeCopy();
  const ref = useRef<Object3D>(null);
  // The garage's waiting bike steps aside while someone rides off on theirs, so two don't overlap.
  useFrame(() => {
    if (garage && ref.current) ref.current.visible = !garageSpotTaken();
  });
  // Leaning a touch onto its side stand.
  const rot = useMemo(() => [0, bike.yaw, 0.06] as const, [bike.yaw]);
  return <primitive ref={ref} object={model} position={[bike.x, bike.y, bike.z]} rotation-order="YXZ" rotation={rot} />;
}
