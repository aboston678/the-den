import { Callbacks, Client, type Room } from "@colyseus/sdk";
import {
  type BearAction, type BowlFrame, type C4Action, type C4Game, type CatanAction, type CatanPrivate, type CatanView, type FishState, MSG, PARTY_ROOM, type Pose, SERVER_MSG, type WorldName,
  isValidRoomCode, isWorldName, normalizeRoomCode, sanitizeBowlFrame, sanitizeNickname,
} from "@den/shared";
import { create } from "zustand";
import { applyRemoteFrame } from "../game/bowling/remoteFrames.ts";
import { type LanePhase, type LaneView, resetLanes, useLanes } from "../game/bowling/store.ts";
import { resetCatan, useCatan } from "../game/catan/store.ts";
import { resetC4, useC4 } from "../game/connect4/store.ts";
import { type BikeView, NO_BIKE, dropBike, setBike, useBikes } from "../game/bike/store.ts";
import { setServerClock } from "../game/sky/clock.ts";
import { playerState } from "../game/state.ts";
import { accessToken } from "./auth.ts";
import { type FishView, addSnapshot, remotes } from "./remotes.ts";

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
  rod: boolean;
  fishing: FishState;
  lureX: number;
  lureZ: number;
  tension: number;
  line: number;
  surges: number;
  catchSpecies: string;
  catchWeight: number;
  bike: string;
  bikeX: number;
  bikeY: number;
  bikeZ: number;
  bikeYaw: number;
}

/** A player's motorcycle as the server says. */
const bikeOf = (p: NetPlayer): BikeView => ({ state: p.bike ?? "", x: p.bikeX, y: p.bikeY, z: p.bikeZ, yaw: p.bikeYaw });

/** A player's fishing as the server says (GAME_SPEC §13). */
const fishOf = (p: NetPlayer): FishView => ({
  rod: p.rod, state: p.fishing, lureX: p.lureX, lureZ: p.lureZ, tension: p.tension, line: p.line, surges: p.surges, species: p.catchSpecies, weight: p.catchWeight,
});
export const NO_FISH: FishView = { rod: false, state: "", lureX: 0, lureZ: 0, tension: 0, line: 0, surges: 0, species: "", weight: 0 };

/** Our own bear's fishing, and the latest catches announced to the party. */
export const useFishStore = create<{ me: FishView; catches: { id: string; name: string; species: string; weight: number; best: boolean; at: number; mine: boolean }[] }>(() => ({
  me: NO_FISH,
  catches: [],
}));

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
  if (msg.includes("sign in")) return "Your sign-in has expired. Sign out and sign in again.";
  if (msg.includes("not found") || msg.includes("invalid") || msg.includes("expired")) return `No party with code ${code ?? ""}. Check the code and try again.`;
  if (msg.includes("locked") || msg.includes("full")) return "That party is full (6 bears max).";
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("refused")) return "Can't reach the game server. Try again in a moment.";
  return "Something went wrong joining the party. Try again.";
}

/** ?world=test starts a party on the 1.6 test field (dev and controller tests). */
const requestedWorld = () => new URLSearchParams(location.search).get("world") ?? undefined;
/** ?time=dusk (or night, noon, … or seconds) starts the party at that time of day (dev only). */
const requestedTime = () => new URLSearchParams(location.search).get("time") ?? undefined;

/** Who we are, for the server: our sign-in (GAME_SPEC §14), or in development just a name. */
async function identity(name: string) {
  const token = await accessToken();
  return token ? { token } : { name: sanitizeNickname(name) };
}

export async function createParty(name: string) {
  return enter(async () => getClient().create(PARTY_ROOM, { ...(await identity(name)), world: requestedWorld(), time: requestedTime() }), name);
}

export async function joinParty(rawCode: string, name: string) {
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) {
    usePartyStore.setState({ status: "error", error: "Party codes are 5 letters and numbers (no I or O, no 0 or 1)." });
    return;
  }
  return enter(async () => getClient().joinById(code, await identity(name)), name, code);
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

/** Fishing (GAME_SPEC §13): the server checks every request. */
export const takeRod = (take: boolean) => room?.send(MSG.rod, { take });
export const castTo = (x: number, z: number) => room?.send(MSG.cast, { x, z });
export const reelPress = () => room?.send(MSG.reel);
export const reelInLine = () => room?.send(MSG.reelIn);
/** Dev and tests: next bite after `biteIn` seconds (optionally a set species and weight). */
export const devFish = (biteIn: number, species?: string, weight?: number) => room?.send(MSG.devFish, { biteIn, species, weight });

/** Bowling (GAME_SPEC §15): the server runs turns and scores; we send what our own ball did. */
export const bowlSend = {
  join: (lane: string) => room?.send(MSG.bowlJoin, { lane }),
  leave: () => room?.send(MSG.bowlLeave),
  newGame: (lane: string) => room?.send(MSG.bowlNewGame, { lane }),
  rolling: (lane: string) => room?.send(MSG.bowlRolling, { lane }),
  result: (lane: string, knocked: number) => room?.send(MSG.bowlResult, { lane, knocked }),
  frame: (f: BowlFrame) => room?.send(MSG.bowlFrame, f),
  /** Dev and tests: set my balls so far this game (the server ignores it in production). */
  devRolls: (lane: string, rolls: number[]) => room?.send(MSG.devBowl, { lane, rolls }),
};

/** Finished games announced to the party (newest last). */
export const useBowlNews = create<{ games: { id: string; name: string; lane: string; score: number; best: boolean; at: number; mine: boolean }[] }>(() => ({ games: [] }));

interface NetLane {
  bowlers: { forEach(cb: (b: { id: string; name: string; rolls: string }) => void): void };
  turn: number;
  phase: string;
  standing: number;
}

/** The lanes as the server last sent them (JSON), so the store only changes when they do. */
const lastLanes: Record<string, string> = {};

/** Copy the lanes from the server's state into the store (only when something changed). */
function syncLanes(r: Room) {
  const lanes = r.state?.lanes as { get(id: string): NetLane | undefined } | undefined;
  if (!lanes) return;
  const next = { ...useLanes.getState().lanes };
  let changed = false;
  for (const id of ["1", "2"] as const) {
    const l = lanes.get(id);
    if (!l) continue;
    const bowlers: LaneView["bowlers"] = [];
    l.bowlers.forEach((b) => bowlers.push({ id: b.id, name: b.name, rolls: b.rolls ? b.rolls.split(",").map(Number) : [] }));
    const view: LaneView = { id, bowlers, turn: l.turn ?? 0, phase: (l.phase || "idle") as LanePhase, standing: l.standing ?? 0x3ff };
    const json = JSON.stringify(view);
    if (json !== lastLanes[id]) {
      lastLanes[id] = json;
      next[id] = view;
      changed = true;
    }
  }
  if (changed) useLanes.setState({ lanes: next });
}

/** Catan (GAME_SPEC §16): the server holds the game; we send moves. */
export const catanSend = {
  sit: (seat: number) => room?.send(MSG.catanSit, { seat }),
  stand: () => room?.send(MSG.catanStand),
  start: (h: boolean) => room?.send(MSG.catanStart, h ? { h: true } : {}),
  act: (action: CatanAction) => room?.send(MSG.catanAct, { action }),
  quit: () => room?.send(MSG.catanQuit),
  /** Dev and tests: next roll, extra cards, victory point cards (the server ignores it in production). */
  dev: (dice?: [number, number], give?: Record<string, number>, vp?: boolean) => room?.send(MSG.devCatan, { dice, give, vp }),
};

interface NetCatan {
  seats: { forEach(cb: (id: string) => void): void };
  view: string;
  waitingFor: string;
  waitUntil: number;
}
let lastCatan = "";

/** Copy the Catan table into its store (only when something changed). */
function syncCatan(r: Room) {
  const t = r.state?.catan as NetCatan | undefined;
  if (!t) return;
  const seats: string[] = [];
  t.seats.forEach((id) => seats.push(id));
  const key = `${seats.join(",")}|${t.waitingFor}|${t.waitUntil}|${t.view}`;
  if (key === lastCatan) return;
  lastCatan = key;
  useCatan.setState({ seats, view: t.view ? (JSON.parse(t.view) as CatanView) : null, waitingFor: t.waitingFor, waitUntil: t.waitUntil });
}

/** The motorcycle (Andrew, 2026-10-16): take the garage bike, get on ours, park it here. */
export const bikeSend = {
  take: () => room?.send(MSG.bike, { do: "take" }),
  mount: () => room?.send(MSG.bike, { do: "mount" }),
  park: (x: number, y: number, z: number, yaw: number) => room?.send(MSG.bike, { do: "park", x, y, z, yaw }),
};

/** Connect Four (Andrew, 2026-10-16): the server holds the game; we send moves. */
export const c4Send = {
  sit: (seat: number) => room?.send(MSG.c4Sit, { seat }),
  stand: () => room?.send(MSG.c4Stand),
  start: () => room?.send(MSG.c4Start),
  drop: (col: number) => room?.send(MSG.c4Act, { action: { type: "drop", col } satisfies C4Action }),
};

let lastC4 = "";

/** Copy the Connect Four table into its store (only when something changed). */
function syncC4(r: Room) {
  const t = r.state?.c4 as NetCatan | undefined;
  if (!t) return;
  const seats: string[] = [];
  t.seats.forEach((id) => seats.push(id));
  const key = `${seats.join(",")}|${t.waitingFor}|${t.waitUntil}|${t.view}`;
  if (key === lastC4) return;
  lastC4 = key;
  useC4.setState({ seats, game: t.view ? (JSON.parse(t.view) as C4Game) : null, waitingFor: t.waitingFor, waitUntil: t.waitUntil });
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
        fish: fishOf(p),
      };
      remotes.set(id, bear);
      const snap = () => {
        bear.connected = p.connected;
        addSnapshot(bear, {
          x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: p.speed, action: p.action, flashlight: p.flashlight, aimYaw: p.aimYaw, aimPitch: p.aimPitch,
        });
      };
      snap();
      setBike(id, bikeOf(p));
      $.onChange(p, () => {
        const wasConnected = bear.connected;
        snap();
        bear.fish = fishOf(p);
        setBike(id, bikeOf(p));
        if (wasConnected !== p.connected) sync();
      });
    } else {
      const mine = () => {
        useFishStore.setState({ me: fishOf(p) });
        setBike("me", bikeOf(p));
      };
      mine();
      $.onChange(p, mine);
    }
    sync();
  });
  $.onRemove("players", (_value: unknown, key: unknown) => {
    remotes.delete(key as string);
    dropBike(key as string);
    sync();
  });

  const setDoor = (open: boolean, id: string) => usePartyStore.setState((st) => ({ doors: { ...st.doors, [id]: open } }));
  $.onAdd("doors", (open: unknown, id: unknown) => setDoor(open as boolean, id as string));
  $.onChange("doors", (id: unknown, open: unknown) => setDoor(open as boolean, id as string));

  r.onMessage(SERVER_MSG.caught, (c: { id: string; name: string; species: string; weight: number; best: boolean }) => {
    useFishStore.setState((st) => ({ catches: [...st.catches.slice(-4), { ...c, at: performance.now(), mine: c.id === r.sessionId }] }));
  });

  r.onStateChange(() => {
    syncLanes(r);
    syncCatan(r);
    syncC4(r);
  });
  r.onMessage(SERVER_MSG.c4Error, (m: { error: string }) => useC4.setState({ error: { text: m.error, at: performance.now() } }));
  r.onMessage(SERVER_MSG.c4Won, (w: { id: string; name: string }) => {
    useC4.setState((st) => ({ wins: [...st.wins.slice(-4), { ...w, at: performance.now(), mine: w.id === r.sessionId }] }));
  });
  r.onMessage(SERVER_MSG.catanPrivate, (mine: CatanPrivate | null) => useCatan.setState({ mine }));
  r.onMessage(SERVER_MSG.catanError, (m: { error: string }) => useCatan.setState({ error: { text: m.error, at: performance.now() } }));
  r.onMessage(SERVER_MSG.catanOk, () => useCatan.setState({ ok: performance.now() }));
  r.onMessage(SERVER_MSG.catanWon, (w: { id: string; name: string; vp: number }) => {
    useCatan.setState((st) => ({ wins: [...st.wins.slice(-4), { ...w, at: performance.now(), mine: w.id === r.sessionId }] }));
  });
  r.onMessage(SERVER_MSG.bowlFrame, (f: unknown) => {
    const frame = sanitizeBowlFrame(f);
    if (frame) applyRemoteFrame(frame);
  });
  r.onMessage(SERVER_MSG.bowled, (g: { id: string; name: string; lane: string; score: number; best: boolean }) => {
    useBowlNews.setState((st) => ({ games: [...st.games.slice(-4), { ...g, at: performance.now(), mine: g.id === r.sessionId }] }));
  });

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
    useFishStore.setState({ me: NO_FISH, catches: [] });
    resetLanes();
    for (const k of Object.keys(lastLanes)) delete lastLanes[k];
    useBowlNews.setState({ games: [] });
    resetCatan();
    lastCatan = "";
    resetC4();
    lastC4 = "";
    useBikes.setState({ me: NO_BIKE, others: {} });
  });

  usePartyStore.setState({ status: "in-party", sessionId: r.sessionId, error: null });
  sync(); // no-op until the first state patch; the listeners above fire when it lands
}
