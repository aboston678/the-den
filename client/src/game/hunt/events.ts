import { usePartyStore } from "../../net/party.ts";
import { playAt } from "../audio/audio.ts";
import { cameraState, playerState } from "../state.ts";
import { type ShotNews, useHunt } from "./store.ts";

// What happens in this browser when the server tells the party about the bear hunt (2026-10-17):
// a gunshot everyone hears (Andrew: "everyone in the game should be able to hear"), the bear's
// swipe, and the bear being sent to its hiding spot.

/**
 * A gunshot carries across the whole map: full volume out to `range` metres, then fading slowly,
 * so even someone at the racetrack ~1 km away still hears a faint crack.
 */
const SHOT_SOUND: Record<ShotNews["gun"], { volume: number; range: number }> = {
  sniper: { volume: 3, range: 60 },
  shotgun: { volume: 2.8, range: 50 },
  ar: { volume: 2.2, range: 40 },
  pistol: { volume: 2, range: 35 },
};

export function heardShot(shot: ShotNews) {
  // Our own shots already banged and flew when we fired (hunt/shooting.ts); the server just says whether it hit.
  if (shot.mine) {
    if (shot.hit) {
      useHunt.setState({ hitAt: shot.at });
      void playAt("hit-thud", shot.to.x, shot.to.y, shot.to.z, 1.4, 6);
    }
    return;
  }
  addShot(shot);
  const snd = SHOT_SOUND[shot.gun];
  void playAt(`shot-${shot.gun}`, shot.from.x, shot.from.y, shot.from.z, snd.volume, snd.range);
  if (shot.hit) void playAt("hit-thud", shot.to.x, shot.to.y, shot.to.z, 1.4, 6);
  // The bear feels it.
  const me = usePartyStore.getState().sessionId;
  if (shot.hit && useHunt.getState().bearId === me) cameraState.shake = Math.max(cameraState.shake, 0.45);
}

/** Remember a shot for the tracers (the last couple of seconds' worth). */
export function addShot(shot: ShotNews) {
  useHunt.setState((st) => ({ shots: [...st.shots.filter((s) => shot.at - s.at < 2000).slice(-30), shot] }));
}

/** Our own shot: the bang and the kick right away (the server's echo only says whether it hit). */
export function firedShot(shot: ShotNews) {
  addShot(shot);
  const snd = SHOT_SOUND[shot.gun];
  void playAt(`shot-${shot.gun}`, shot.from.x, shot.from.y, shot.from.z, snd.volume, snd.range);
  cameraState.shake = Math.max(cameraState.shake, shot.gun === "sniper" || shot.gun === "shotgun" ? 0.18 : 0.06);
}

/** The bear swiped: a whoosh, and a jolt for whoever it knocked down. */
export function heardSwipe(id: string, down: string[], me: string) {
  const from = id === me ? playerState.position : null;
  const p = from ?? (window.__den?.remotes().find((r) => r.id === id) ?? null);
  if (p) void playAt("cast-whoosh", p.x, ("y" in p ? p.y : playerState.position.y) + 1.4, p.z, 1.2, 5);
  if (down.includes(me)) cameraState.shake = Math.max(cameraState.shake, 0.6);
}

/** We're the bear: off to the hiding spot the server picked. */
export function warpedTo(w: { x: number; y: number | null; z: number; name: string }) {
  playerState.riding = false;
  playerState.seat = null;
  playerState.hold = null;
  playerState.teleportTo = { x: w.x, y: w.y ?? Number.NaN, z: w.z };
  useHunt.setState({ spot: w.name });
}
