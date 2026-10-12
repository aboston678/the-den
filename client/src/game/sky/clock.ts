import { START_TIME, wrapTime } from "@den/shared";

// The party's day/night clock as this browser sees it. The server sends the time once a second
// (GAME_SPEC §9); between ticks we count forward ourselves so the sun moves smoothly.

let serverTime: number = START_TIME;
let receivedAt = performance.now();
/** A fixed time of day (the intro's dusk), or null to follow the party's clock. */
let held: number | null = null;

export function holdClock(time: number | null) {
  held = time;
}

export function setServerClock(time: number) {
  serverTime = time;
  receivedAt = performance.now();
}

/** Seconds into the 68-minute cycle, right now. */
export const gameClock = () => held ?? wrapTime(serverTime + (performance.now() - receivedAt) / 1000);
