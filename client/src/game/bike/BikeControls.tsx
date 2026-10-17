import { BIKE, BIKE_REACH, GARAGE_BIKE, bikeBlocked } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import { create } from "zustand";
import { bikeSend, useFishStore } from "../../net/party.ts";
import { consumePress } from "../input/keyboard.ts";
import { playerState } from "../state.ts";
import { showBikeBodies } from "./rider.ts";
import { useBikes } from "./store.ts";

// Getting on and off the motorcycle (Andrew, 2026-10-16). E by the garage bike takes one (there's
// always one waiting); E while riding (slowly) parks it where you are and steps you off beside it;
// E by your parked bike gets back on. The server agrees first, then the bear hops on.

export const useBikePrompt = create<{ text: string | null }>(() => ({ text: null }));

/** Where we're about to get on, while the server confirms (ms when asked). */
let pending: { x: number; y: number; z: number; yaw: number; at: number } | null = null;

export function BikeControls() {
  useEffect(() => {
    // Dev and tests: what the bikes look like from here.
    if (window.__den) {
      window.__den.bike = {
        state: () => ({ riding: playerState.riding, speed: playerState.speed, wheelTurns: playerState.bike.wheelTurns, prompt: useBikePrompt.getState().text, ...useBikes.getState() }),
        showBodies: showBikeBodies,
      };
    }
    return () => {
      playerState.riding = false;
      pending = null;
    };
  }, []);

  useFrame(() => {
    const me = useBikes.getState().me;
    const p = playerState.position;
    const setPrompt = (text: string | null) => {
      if (useBikePrompt.getState().text !== text) useBikePrompt.setState({ text });
    };

    if (playerState.riding) {
      if (me.state !== "riding" && !pending) {
        // The server says we're not on a bike (e.g. we rejoined): step off.
        playerState.riding = false;
        return setPrompt(null);
      }
      const slow = playerState.speed < BIKE.stopSpeed;
      setPrompt(slow ? "Get off" : "Slow down to get off");
      if (consumePress("KeyE") && slow) {
        const yaw = playerState.yaw;
        bikeSend.park(p.x, p.y, p.z, yaw);
        playerState.riding = false;
        // Step off to the bike's left (or right, if the left is the house).
        const lx = Math.cos(yaw), lz = -Math.sin(yaw);
        const side = bikeBlocked(p.x + lx * 1.1, p.z + lz * 1.1) ? -1 : 1;
        playerState.teleportTo = { x: p.x + lx * 1.1 * side, y: Number.NaN, z: p.z + lz * 1.1 * side };
      }
      return;
    }

    if (pending) {
      if (me.state === "riding") {
        playerState.teleportTo = { x: pending.x, y: pending.y, z: pending.z, yaw: pending.yaw };
        playerState.riding = true;
        pending = null;
      } else if (performance.now() - pending.at > 2000) pending = null; // refused
      return setPrompt(null);
    }

    if (playerState.seated || playerState.hold) return setPrompt(null);
    const near = (x: number, y: number, z: number) => Math.hypot(p.x - x, p.z - z) < BIKE_REACH && Math.abs(p.y - y) < 1;
    const rod = useFishStore.getState().me.rod;
    const mine = me.state === "parked" && near(me.x, me.y, me.z);
    const garage = near(GARAGE_BIKE.x, GARAGE_BIKE.y, GARAGE_BIKE.z);
    if (!mine && !garage) return setPrompt(null);
    if (rod) return setPrompt("Put the rod back to ride");
    setPrompt(mine ? "Get on your motorcycle" : "Ride the motorcycle");
    if (!consumePress("KeyE")) return;
    if (mine) {
      bikeSend.mount();
      pending = { x: me.x, y: me.y, z: me.z, yaw: me.yaw, at: performance.now() };
    } else {
      bikeSend.take();
      pending = { ...GARAGE_BIKE, at: performance.now() };
    }
  }, -0.5); // after doors (a closed garage door's E comes first), before the other things E does

  return null;
}
