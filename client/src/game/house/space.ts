import { HOUSE } from "@den/shared";

// Floorplan metres -> world metres (the house is built 1.25× real size, GAME_SPEC §4).
export const S = HOUSE.scale;
export const toWorld = ([x, y, z]: readonly [number, number, number]): [number, number, number] =>
  [HOUSE.originX + x * S, y * S, HOUSE.originZ + z * S];
