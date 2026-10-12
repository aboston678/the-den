import { START_TIME, wrapTime } from "@den/shared";

// The party's day/night clock as this browser sees it. The server sends the time once a second
// (GAME_SPEC §9); between ticks we count forward ourselves so the sun moves smoothly.

let serverTime: number = START_TIME;
let receivedAt = performance.now();

export function setServerClock(time: number) {
  serverTime = time;
  receivedAt = performance.now();
}

/** Seconds into the 68-minute cycle, right now. */
export const gameClock = () => wrapTime(serverTime + (performance.now() - receivedAt) / 1000);
