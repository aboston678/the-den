import { type Client, Room, matchMaker } from "@colyseus/core";
import {
  MAX_PLAYERS,
  MSG,
  NET_TICK_HZ,
  type Pose,
  RECONNECT_WINDOW_S,
  generateRoomCode,
  sanitizeNickname,
  sanitizePose,
  spawnPoint,
} from "@den/shared";
import { PartyState, Player } from "./PartyState.ts";

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

  async onCreate() {
    this.roomId = await uniqueRoomCode();
    this.state.code = this.roomId;
    this.patchRate = 1000 / NET_TICK_HZ;

    this.onMessage(MSG.pose, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "playing") return;
      const now = Date.now();
      const seconds = (now - (this.lastPoseAt.get(client.sessionId) ?? now - 50)) / 1000;
      this.lastPoseAt.set(client.sessionId, now);
      const pose = sanitizePose(message, poseOf(player), seconds);
      Object.assign(player, pose);
    });

    this.onMessage(MSG.start, (client) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== "lobby") return;
      this.state.phase = "playing";
      this.state.players.forEach((player) => placeAtSpawn(player));
    });
  }

  onJoin(client: Client, options?: { name?: unknown }) {
    const player = new Player();
    player.name = sanitizeNickname(options?.name);
    player.slot = this.freeSlot();
    placeAtSpawn(player);
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
  return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: p.speed, action: p.action as Pose["action"] };
}

function placeAtSpawn(player: Player) {
  const spot = spawnPoint(player.slot);
  Object.assign(player, { x: spot.x, y: 0, z: spot.z, yaw: spot.yaw, speed: 0, action: "locomotion" });
}
