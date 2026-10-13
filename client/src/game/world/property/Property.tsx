import { Boundary } from "./Boundary.tsx";
import { Boat } from "./Boat.tsx";
import { Dock } from "./Dock.tsx";
import { Forest } from "./Forest.tsx";
import { Grass } from "./Grass.tsx";
import { TOON } from "../../artStyle.ts";
import { House } from "../../house/House.tsx";
import { Roads } from "./Roads.tsx";
import { StoneWalls } from "./StoneWalls.tsx";
import { Stream } from "./Stream.tsx";
import { Terrain } from "./Terrain.tsx";

/** The whole property: the outdoor map (milestone 1.8, GAME_SPEC §4) and the house (1.9). */
/** Everything here loads together under World's single Suspense boundary (see world/physics.ts). */
export function Property() {
  return (
    <>
      <Terrain />
      <Roads />
      <Stream />
      <Dock />
      <Boat />
      <StoneWalls />
      <Forest />
      {TOON && <Grass />}
      <House />
      <Boundary />
    </>
  );
}
