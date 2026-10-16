import { C4_SEATS, C4_TABLE, nearestC4Seat } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import { create } from "zustand";
import { c4Send, usePartyStore } from "../../net/party.ts";
import { consumePress } from "../input/keyboard.ts";
import { cameraState, playerState } from "../state.ts";
import { GRID_MID_Y } from "./Connect4Board.tsx";
import { myC4Player, useC4 } from "./store.ts";

// Sitting at the Connect Four table (Andrew, 2026-10-16), the same way as Catan: E next to a free
// chair asks the server for it; seated, the camera looks over your shoulder at the grid with the
// mouse free for clicking a column. E gets up (mid-game it asks first: leaving ends the game).

export const useC4Prompt = create<{ text: string | null }>(() => ({ text: null }));

/** Over your shoulder: behind and above your chair, looking at the middle of the grid. */
export function gridShot(seat: number) {
  const s = C4_SEATS[seat]!;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  return {
    from: new Vector3(s.x - fx * 0.55, C4_TABLE.topY + 0.85, s.z - fz * 0.55),
    look: new Vector3(C4_TABLE.x, GRID_MID_Y, C4_TABLE.z),
  };
}

export function Connect4Controls() {
  useEffect(() => () => release(), []);
  /** A win we're celebrating: up out of the chair, then cheer. */
  const cheer = useRef<{ game: string; stage: "up" | "done" } | null>(null);

  useFrame(() => {
    const me = usePartyStore.getState().sessionId;
    const { seats, game } = useC4.getState();
    const mySeat = me ? seats.indexOf(me) : -1;

    const won = game?.phase === "over" && game.winner !== null && game.players[game.winner]?.id === me;
    const gameKey = game ? `${game.players.map((p) => p.id).join()}|${game.moves}|${game.last}` : "";
    if (won && cheer.current?.game !== gameKey) {
      cheer.current = { game: gameKey, stage: "up" };
      if (mySeat >= 0) c4Send.stand();
    }
    if (cheer.current?.stage === "up" && mySeat < 0 && !playerState.seated) {
      cheer.current.stage = "done";
      playerState.celebrateRequest = true;
    }
    const setPrompt = (text: string | null) => {
      if (useC4Prompt.getState().text !== text) useC4Prompt.setState({ text });
    };

    if (mySeat >= 0) {
      const seat = C4_SEATS[mySeat]!;
      if (playerState.seat !== seat) playerState.seat = seat;
      if (!cameraState.override || !cameraState.freeMouse) {
        cameraState.override = gridShot(mySeat);
        cameraState.freeMouse = true;
        if (document.pointerLockElement) document.exitPointerLock();
      }
      const playing = myC4Player(me) >= 0;
      setPrompt(playing ? "Leave game" : "Get up");
      if (consumePress("KeyE")) {
        if (playing) useC4.setState({ confirmLeave: true });
        else c4Send.stand();
      }
      return;
    }

    if (useC4.getState().confirmLeave) useC4.setState({ confirmLeave: false });
    if (playerState.seat && C4_SEATS.includes(playerState.seat)) {
      playerState.seat = null;
      release();
    }
    if (playerState.seated) return setPrompt(null); // still getting up
    const seat = nearestC4Seat(playerState.position.x, playerState.position.z, seats.map((s) => s !== ""));
    const onFloor = Math.abs(playerState.position.y - C4_TABLE.y) < 1;
    if (seat < 0 || !onFloor) return setPrompt(null);
    setPrompt("Sit at Connect Four");
    if (consumePress("KeyE")) c4Send.sit(seat);
  });

  return null;
}

function release() {
  if (cameraState.freeMouse) {
    cameraState.override = null;
    cameraState.freeMouse = false;
  }
}
