import { Suspense } from "react";
import { usePartyStore } from "../../net/party.ts";
import { Property } from "./property/Property.tsx";
import { TestGround } from "./TestGround.tsx";

/** The map this party plays on: the property (GAME_SPEC §4), or the 1.6 test field (?world=test). */
export function World() {
  const world = usePartyStore((s) => s.world);
  if (world === "test") return <TestGround />;
  return (
    <Suspense fallback={null}>
      <Property />
    </Suspense>
  );
}
