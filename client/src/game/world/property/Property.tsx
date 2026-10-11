import { Boundary } from "./Boundary.tsx";
import { Dock } from "./Dock.tsx";
import { Forest } from "./Forest.tsx";
import { HousePlaceholder } from "./HousePlaceholder.tsx";
import { Roads } from "./Roads.tsx";
import { StoneWalls } from "./StoneWalls.tsx";
import { Stream } from "./Stream.tsx";
import { Terrain } from "./Terrain.tsx";

/** The whole outdoor map (milestone 1.8, GAME_SPEC §4). The house itself arrives in 1.9. */
export function Property() {
  return (
    <>
      <Terrain />
      <Roads />
      <Stream />
      <Dock />
      <StoneWalls />
      <Forest />
      <HousePlaceholder />
      <Boundary />
    </>
  );
}
