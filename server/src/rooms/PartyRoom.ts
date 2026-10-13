import { type Client, Room, matchMaker } from "@colyseus/core";
import {
  DOOR_REACH,
  INTERACTIVE_DOORS,
  MAX_PLAYERS,
  MSG,
  NET_TICK_HZ,
  type Pose,
  RECONNECT_WINDOW_S,
  SERVER_MSG,
  START_TIME,
  type WorldName,
  doorById,
  generateRoomCode,
  isWorldName,
  parseTime,
  sanitizeNickname,
  sanitizePose,
  spawnPoint,
  wrapTime,
} from "@den/shared";
import { type Bear, authenticate } from "../auth.ts";
import { devToolsOn } from "../config.ts";
import { PartyState, Player } from "./PartyState.ts";
import { Fishing } from "./fishing.ts";

const num = (v: unknown) => (typeof v === "number" ? v : Number.NaN);

/** A party code no other live room is using. */
async function uniqueRoomCode() {
  for (;;) {
    const code = generateRoomCode();
    if ((await matchMaker.query({ roomId: code })).length === 0) return code;
  }
}

/**
 * One room per party (GAME_SPEC §7). The room id IS the 5-character party code, so friends join
 * with client.joinById(code). Max 6 bears; the host hands off to the next bear if they leave;
 * a dropped bear has 30 s to reconnect before losing its spot.
 */
export class PartyRoom extends Room<{ state: PartyState }> {
  maxClients = MAX_PLAYERS;
  state = new PartyState();
  private lastPoseAt = new Map<string, number>();
  private fishing = new Fishing();
  /** Supabase user id per bear (server-side only; used to save stats), null for development players. */
  readonly userIds = new Map<string, string | null>();

  async onCreate(options?: { world?: unknown; time?: unknown }) {
    this.roomId = await uniqueRoomCode();
    this.state.code = this.roomId;
    if (isWorldName(options?.world)) this.state.world = options.world;
    if (this.state.world === "property") for (const d of INTERACTIVE_DOORS) this.state.doors.set(d.id, false);
    this.patchRate = 1000 / NET_TICK_HZ;

    // The party's day/night clock (GAME_SPEC §9). Ticking once a second keeps the patches tiny;
    // browsers fill in the time between ticks themselves.
    this.state.clock = (devToolsOn() ? parseTime(options?.time) : undefined) ?? START_TIME;
    this.clock.setInterval(() => {
      this.state.clock = wrapTime(this.state.clock + 1);
    }, 1000);

    this.onMessage(MSG.pose, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "playing") return;
      const now = Date.now();
      const seconds = (now - (this.lastPoseAt.get(client.sessionId) ?? now - 50)) / 1000;
      this.lastPoseAt.set(client.sessionId, now);
      const pose = sanitizePose(message, poseOf(player), seconds);
      Object.assign(player, pose);
    });

    this.onMessage(MSG.door, (client, message: { id?: unknown }) => {
      const player = this.state.players.get(client.sessionId);
      const door = typeof message?.id === "string" ? doorById(message.id) : undefined;
      if (!player || !door || door.locked || !this.state.doors.has(door.id) || this.state.phase !== "playing") return;
      // Only bears standing next to the door can open it.
      const near = Math.hypot(player.x - door.world.x, player.z - door.world.z) <= DOOR_REACH + 1.5 && Math.abs(player.y - door.world.y) < 2.5;
      if (near) this.state.doors.set(door.id, !this.state.doors.get(door.id));
    });

    // Fishing (GAME_SPEC §13): the server runs the bites and fights; ticks at the network rate.
    const playing = (client: Client) => (this.state.phase === "playing" ? this.state.players.get(client.sessionId) : undefined);
    this.onMessage(MSG.rod, (client, message: { take?: unknown }) => {
      const p = playing(client);
      if (p) this.fishing.rod(client.sessionId, p, message?.take === true);
    });
    this.onMessage(MSG.cast, (client, message: { x?: unknown; z?: unknown }) => {
      const p = playing(client);
      if (p) this.fishing.cast(client.sessionId, p, num(message?.x), num(message?.z), Date.now());
    });
    this.onMessage(MSG.reel, (client) => {
      const p = playing(client);
      if (p) this.fishing.reel(client.sessionId, p, Date.now());
    });
    this.onMessage(MSG.reelIn, (client) => {
      const p = playing(client);
      if (p) this.fishing.reelIn(client.sessionId, p);
    });
    this.onMessage(MSG.devFish, (client, message: { biteIn?: unknown; species?: unknown; weight?: unknown }) => {
      if (!devToolsOn()) return;
      const biteIn = Math.max(0, Math.min(60, num(message?.biteIn) || 0));
      this.fishing.force(client.sessionId, biteIn, typeof message?.species === "string" ? message.species : undefined,
        Number.isFinite(num(message?.weight)) ? num(message?.weight) : undefined);
    });
    let lastFishTick = Date.now();
    this.clock.setInterval(() => {
      const now = Date.now();
      const caught = this.fishing.tick(this.state.players as unknown as Map<string, Player>, now, (now - lastFishTick) / 1000);
      lastFishTick = now;
      for (const c of caught) this.broadcast(SERVER_MSG.caught, c);
    }, 1000 / NET_TICK_HZ);

    this.onMessage(MSG.devTime, (_client, message: { time?: unknown }) => {
      const time = parseTime(message?.time);
      if (devToolsOn() && time !== undefined) this.state.clock = time;
    });

    this.onMessage(MSG.start, (client) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== "lobby") return;
      this.state.phase = "playing";
      this.state.players.forEach((player) => placeAtSpawn(player, this.state.world as WorldName));
    });
  }

  /** Signed-in players only (GAME_SPEC §14): checks the Google sign-in; development can join with a name. */
  async onAuth(_client: Client, options?: { token?: unknown; name?: unknown }): Promise<Bear> {
    return authenticate(options);
  }

  onJoin(client: Client, _options?: unknown) {
    const bear = client.auth as Bear;
    const player = new Player();
    player.name = bear.username;
    this.userIds.set(client.sessionId, bear.userId);
    player.slot = this.freeSlot();
    placeAtSpawn(player, this.state.world as WorldName);
    this.state.players.set(client.sessionId, player);
    if (!this.state.hostId) this.state.hostId = client.sessionId;
  }

  onDrop(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.allowReconnection(client, RECONNECT_WINDOW_S);
  }

  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.fishing.remove(client.sessionId);
    this.userIds.delete(client.sessionId);
    this.lastPoseAt.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      // Next host: the remaining bear with the lowest slot, preferring connected ones.
      const next = [...this.state.players.entries()]
        .sort(([, a], [, b]) => Number(b.connected) - Number(a.connected) || a.slot - b.slot)[0];
      this.state.hostId = next?.[0] ?? "";
    }
  }

  private freeSlot() {
    const used = new Set([...this.state.players.values()].map((p) => p.slot));
    for (let s = 0; s < MAX_PLAYERS; s++) if (!used.has(s)) return s;
    return 0;
  }
}

function poseOf(p: Player): Pose {
  return {
    x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: p.speed, action: p.action as Pose["action"], flashlight: p.flashlight, aimYaw: p.aimYaw, aimPitch: p.aimPitch,
  };
}

function placeAtSpawn(player: Player, world: WorldName) {
  const spot = spawnPoint(player.slot, world);
  Object.assign(player, { x: spot.x, y: spot.y, z: spot.z, yaw: spot.yaw, speed: 0, action: "locomotion" });
}
