import { Callbacks, Client, type Room } from "@colyseus/sdk";
import {
  type BearAction, MSG, PARTY_ROOM, type Pose, type WorldName, isValidRoomCode, isWorldName, normalizeRoomCode, sanitizeNickname,
} from "@den/shared";
import { create } from "zustand";
import { setServerClock } from "../game/sky/clock.ts";
import { playerState } from "../game/state.ts";
import { addSnapshot, remotes } from "./remotes.ts";

// Party networking (GAME_SPEC §7): create/join with a 5-character code, lobby list, host
// starts the game, 20 Hz poses, and rejoining after a page reload.

/** The game server: on Railway when the site is online, on this computer during development. */
const PRODUCTION_SERVER = "https://the-den-production-2d98.up.railway.app";
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? (import.meta.env.PROD ? PRODUCTION_SERVER : "http://localhost:2567");
const TOKEN_KEY = "den.rejoin"; // sessionStorage: survives a reload of this tab only
const NAME_KEY = "den.nickname"; // localStorage: remembered between visits

/** Shape of a player in the server's synced state (server/src/rooms/PartyState.ts). */
interface NetPlayer {
  name: string;
  slot: number;
  connected: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  action: BearAction;
  flashlight: boolean;
  aimYaw: number;
  aimPitch: number;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  slot: number;
  connected: boolean;
}

interface PartyStore {
  status: "idle" | "connecting" | "in-party" | "reconnecting" | "error";
  error: string | null;
  code: string;
  sessionId: string;
  hostId: string;
  phase: "lobby" | "playing";
  /** Which map the party plays on (the property, or the test field with ?world=test). */
  world: WorldName;
  players: LobbyPlayer[];
  /** Other bears' session ids (for rendering them). */
  remoteIds: string[];
  /** Door id -> open, synced for the whole party. */
  doors: Record<string, boolean>;
}

export const usePartyStore = create<PartyStore>(() => ({
  status: "idle",
  error: null,
  code: "",
  sessionId: "",
  hostId: "",
  phase: "lobby",
  world: "property",
  players: [],
  remoteIds: [],
  doors: {},
}));

let client: Client | null = null;
let room: Room | null = null;
/** The join/rejoin in progress, so double clicks (or React's dev double-run) don't race. */
let joining: Promise<void> | null = null;
const getClient = () => (client ??= new Client(SERVER_URL));

export function savedNickname() {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberNickname(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode: fine */
  }
}

function friendlyError(err: unknown, code?: string) {
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  if (msg.includes("not found") || msg.includes("invalid") || msg.includes("expired")) return `No party with code ${code ?? ""}. Check the code and try again.`;
  if (msg.includes("locked") || msg.includes("full")) return "That party is full (6 bears max).";
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("refused")) return "Can't reach the game server. Try again in a moment.";
  return "Something went wrong joining the party. Try again.";
}

/** ?world=test starts a party on the 1.6 test field (dev and controller tests). */
const requestedWorld = () => new URLSearchParams(location.search).get("world") ?? undefined;
/** ?time=dusk (or night, noon, … or seconds) starts the party at that time of day (dev only). */
const requestedTime = () => new URLSearchParams(location.search).get("time") ?? undefined;

export async function createParty(name: string) {
  return enter(() => getClient().create(PARTY_ROOM, { name: sanitizeNickname(name), world: requestedWorld(), time: requestedTime() }), name);
}

export async function joinParty(rawCode: string, name: string) {
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) {
    usePartyStore.setState({ status: "error", error: "Party codes are 5 letters and numbers (no I or O, no 0 or 1)." });
    return;
  }
  return enter(() => getClient().joinById(code, { name: sanitizeNickname(name) }), name, code);
}

async function enter(connect: () => Promise<Room>, name: string, code?: string) {
  if (room || joining) return joining ?? undefined;
  rememberNickname(sanitizeNickname(name));
  usePartyStore.setState({ status: "connecting", error: null });
  joining = (async () => {
    try {
      bind(await connect());
    } catch (err) {
      console.warn("[den] could not join party", err);
      usePartyStore.setState({ status: "error", error: friendlyError(err, code) });
    } finally {
      joining = null;
    }
  })();
  return joining;
}

/** After a page reload, quietly rejoin the party this tab was in (30 s window). */
export async function tryRejoin() {
  let token: string | null = null;
  try {
    token = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  if (!token || room || joining) return joining ?? undefined;
  usePartyStore.setState({ status: "connecting", error: null });
  joining = (async () => {
    try {
      bind(await reconnectWithRetry(token));
    } catch {
      forgetToken();
      usePartyStore.setState({ status: "idle" });
    } finally {
      joining = null;
    }
  })();
  return joining;
}

/**
 * The reloaded page can ask to rejoin before the server has noticed the old page closed,
 * and the server refuses until it has. So keep trying for a few seconds before giving up.
 */
async function reconnectWithRetry(token: string, tries = 8, gapMs = 500) {
  for (let i = 1; ; i++) {
    try {
      return await getClient().reconnect(token);
    } catch (err) {
      if (i >= tries) throw err;
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }
}

export async function leaveParty() {
  forgetToken();
  await room?.leave(true);
}

export function startGame() {
  room?.send(MSG.start);
}

/** Ask the server to open or close a door (it checks we're next to it). */
export function toggleDoor(id: string) {
  if (room && usePartyStore.getState().phase === "playing") room.send(MSG.door, { id });
}

/** Where the server thinks our bear is (it moves its copy at sprint speed; tests wait for it). */
export function serverPosition() {
  const me = room?.state?.players?.get(room.sessionId) as NetPlayer | undefined;
  return me ? { x: me.x, y: me.y, z: me.z } : null;
}

/** Jump the party's clock (dev and tests; the server ignores it in production). */
export function setDevTime(time: number | string) {
  room?.send(MSG.devTime, { time });
}

export function sendPose(pose: Pose) {
  if (room && usePartyStore.getState().phase === "playing") room.send(MSG.pose, pose);
}

function saveToken(r: Room) {
  try {
    sessionStorage.setItem(TOKEN_KEY, r.reconnectionToken);
  } catch {
    /* ignore */
  }
}

function forgetToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function bind(r: Room) {
  room = r;
  saveToken(r);
  const $ = Callbacks.get(r);

  const sync = () => {
    if (!r.state?.players) return; // the first state patch hasn't arrived yet
    const players: LobbyPlayer[] = [];
    r.state.players.forEach((p: NetPlayer, id: string) => players.push({ id, name: p.name, slot: p.slot, connected: p.connected }));
    players.sort((a, b) => a.slot - b.slot);
    usePartyStore.setState({
      code: r.state.code,
      hostId: r.state.hostId,
      phase: r.state.phase,
      world: isWorldName(r.state.world) ? r.state.world : "property",
      players,
      remoteIds: players.map((p) => p.id).filter((id) => id !== r.sessionId),
    });
  };

  /** Put our bear where the server says (start of game, or rejoining mid-game). */
  const placeLocalBear = () => {
    const me = r.state?.players?.get(r.sessionId);
    if (me) playerState.teleportTo = { x: me.x, y: me.y, z: me.z, yaw: me.yaw };
  };

  $.listen("phase", (phase: string, previous: string) => {
    sync();
    if (phase === "playing" && previous !== "playing") placeLocalBear();
  });
  $.listen("hostId", sync);
  $.listen("code", sync);
  $.listen("world", sync);
  $.listen("clock", (time: number) => setServerClock(time));

  $.onAdd("players", (value: unknown, key: unknown) => {
    const p = value as NetPlayer;
    const id = key as string;
    if (id !== r.sessionId) {
      const bear = {
        id,
        name: p.name,
        connected: p.connected,
        snapshots: [],
        current: { x: p.x, y: p.y, z: p.z, speed: 0, action: "locomotion" as BearAction, flashlight: false, aimYaw: 0, aimPitch: 0 },
        tagVisible: false,
      };
      remotes.set(id, bear);
      const snap = () => {
        bear.connected = p.connected;
        addSnapshot(bear, {
          x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: p.speed, action: p.action, flashlight: p.flashlight, aimYaw: p.aimYaw, aimPitch: p.aimPitch,
        });
      };
      snap();
      $.onChange(p, () => {
        const wasConnected = bear.connected;
        snap();
        if (wasConnected !== p.connected) sync();
      });
    }
    sync();
  });
  $.onRemove("players", (_value: unknown, key: unknown) => {
    remotes.delete(key as string);
    sync();
  });

  const setDoor = (open: boolean, id: string) => usePartyStore.setState((st) => ({ doors: { ...st.doors, [id]: open } }));
  $.onAdd("doors", (open: unknown, id: unknown) => setDoor(open as boolean, id as string));
  $.onChange("doors", (id: unknown, open: unknown) => setDoor(open as boolean, id as string));

  r.onDrop(() => usePartyStore.setState({ status: "reconnecting" }));
  r.onReconnect(() => {
    saveToken(r);
    usePartyStore.setState({ status: "in-party" });
  });
  r.onLeave(() => {
    room = null;
    remotes.clear();
    forgetToken();
    usePartyStore.setState({ status: "idle", code: "", hostId: "", phase: "lobby", players: [], remoteIds: [], sessionId: "", doors: {} });
  });

  usePartyStore.setState({ status: "in-party", sessionId: r.sessionId, error: null });
  sync(); // no-op until the first state patch; the listeners above fire when it lands
}
