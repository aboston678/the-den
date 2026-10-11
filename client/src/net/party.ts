import { Client, type Room } from "@colyseus/sdk";
import { PARTY_ROOM } from "@den/shared";
import { create } from "zustand";

// Milestone 1.1: just join (or create) a party room to prove the browser can reach the
// game server. Real create/join-by-code flows come in milestone 1.7.

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:2567";

type PartyStatus = "idle" | "connecting" | "connected" | "error";

interface PartyStore {
  status: PartyStatus;
  playerCount: number;
  error: string | null;
}

export const usePartyStore = create<PartyStore>(() => ({
  status: "idle",
  playerCount: 0,
  error: null,
}));

let room: Room | null = null;

export async function connectToParty(name = "Bear") {
  // React StrictMode runs effects twice in development; only connect once.
  if (usePartyStore.getState().status !== "idle") return;
  usePartyStore.setState({ status: "connecting", error: null });

  try {
    const client = new Client(SERVER_URL);
    // ?party=name joins a separate room (tests use this); real party codes come in 1.7.
    const party = new URLSearchParams(location.search).get("party") ?? "default";
    room = await client.joinOrCreate(PARTY_ROOM, { name, party });
    room.onStateChange((state) => {
      usePartyStore.setState({ playerCount: state.players?.size ?? 0 });
    });
    room.onLeave(() => {
      usePartyStore.setState({ status: "idle", playerCount: 0 });
      room = null;
    });
    usePartyStore.setState({ status: "connected" });
  } catch (err) {
    console.warn("[den] could not reach the game server", err);
    usePartyStore.setState({ status: "error", error: String(err) });
  }
}
