import { CATAN_SEATS, CATAN_TABLE, nearestSeat } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import { create } from "zustand";
import { catanSend, usePartyStore } from "../../net/party.ts";
import { consumePress } from "../input/keyboard.ts";
import { cameraState, playerState } from "../state.ts";
import { myPlayer, useCatan } from "./store.ts";
import { openPanel } from "./ui.ts";

// Sitting at the Catan table (GAME_SPEC §16): E next to a free chair asks the server for it; once
// the server seats you, the bear sits and the camera moves above your side of the board with the
// mouse pointer free for clicking. E again gets up (not while you're playing a game that's on).

export const useCatanPrompt = create<{ text: string | null }>(() => ({ text: null }));

/** Board camera: above and behind your side, looking down at the board. */
const CAM_BACK = 0.8, CAM_UP = 1.42, LOOK_AHEAD = 0.06;

export function boardShot(seat: number) {
  const s = CATAN_SEATS[seat]!;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  return {
    from: new Vector3(CATAN_TABLE.x - fx * CAM_BACK, CATAN_TABLE.topY + CAM_UP, CATAN_TABLE.z - fz * CAM_BACK),
    look: new Vector3(CATAN_TABLE.x + fx * LOOK_AHEAD, CATAN_TABLE.topY, CATAN_TABLE.z + fz * LOOK_AHEAD),
  };
}

export function CatanControls() {
  // Getting up (or leaving) puts the camera and mouse back to normal.
  useEffect(() => () => release(), []);
  /** A win we're celebrating: jump up out of the chair, then cheer (GAME_SPEC §16). */
  const cheer = useRef<{ game: string; stage: "up" | "done" } | null>(null);

  useFrame(() => {
    const me = usePartyStore.getState().sessionId;
    const { seats, view } = useCatan.getState();
    const mySeat = me ? seats.indexOf(me) : -1;

    const won = view?.phase === "over" && view.winner !== null && view.players[view.winner]?.id === me;
    const gameKey = view ? `${view.players.map((p) => p.id).join()}|${view.log[0]}|${view.rollId}` : "";
    if (won && cheer.current?.game !== gameKey) {
      cheer.current = { game: gameKey, stage: "up" };
      if (mySeat >= 0) catanSend.stand();
    }
    if (cheer.current?.stage === "up" && mySeat < 0 && !playerState.seated) {
      cheer.current.stage = "done";
      playerState.celebrateRequest = true;
    }
    const setPrompt = (text: string | null) => {
      if (useCatanPrompt.getState().text !== text) useCatanPrompt.setState({ text });
    };

    if (mySeat >= 0) {
      // Seated: follow the server's chair, board camera, free mouse.
      const seat = CATAN_SEATS[mySeat]!;
      if (playerState.seat !== seat) playerState.seat = seat;
      if (!cameraState.override || !cameraState.freeMouse) {
        cameraState.override = boardShot(mySeat);
        cameraState.freeMouse = true;
        if (document.pointerLockElement) document.exitPointerLock();
      }
      // Mid-game, getting up means leaving the game, so E asks first.
      const playing = myPlayer(me) >= 0;
      setPrompt(playing ? "Leave game" : "Get up");
      if (consumePress("KeyE")) {
        if (playing) openPanel("leave");
        else catanSend.stand();
      }
      return;
    }

    if (playerState.seat) {
      playerState.seat = null;
      release();
    }
    if (playerState.seated) return setPrompt(null); // still getting up
    const seat = nearestSeat(playerState.position.x, playerState.position.z, seats.map((s) => s !== ""));
    const onFloor = Math.abs(playerState.position.y - (CATAN_SEATS[0]?.y ?? 0)) < 1;
    if (seat < 0 || !onFloor) return setPrompt(null);
    setPrompt("Sit at the Catan table");
    if (consumePress("KeyE")) catanSend.sit(seat);
  });

  return null;
}

function release() {
  if (cameraState.freeMouse) {
    cameraState.override = null;
    cameraState.freeMouse = false;
  }
}
