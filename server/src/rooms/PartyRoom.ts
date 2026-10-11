import { Room, type Client } from "@colyseus/core";
import { MAX_PLAYERS, NET_TICK_HZ, generateRoomCode, sanitizeNickname } from "@den/shared";
import { PartyState, Player } from "./PartyState.ts";

// One room per party. For now this only proves clients can connect and see each other;
// party codes for joining, host hand-off rules and reconnects are milestone 1.7.
export class PartyRoom extends Room<{ state: PartyState }> {
  maxClients = MAX_PLAYERS;
  state = new PartyState();

  onCreate() {
    this.patchRate = 1000 / NET_TICK_HZ;
    this.state.code = generateRoomCode();
  }

  onJoin(client: Client, options?: { name?: unknown }) {
    const player = new Player();
    player.name = sanitizeNickname(options?.name);
    this.state.players.set(client.sessionId, player);
    if (!this.state.hostId) this.state.hostId = client.sessionId;
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      this.state.hostId = this.state.players.keys().next().value ?? "";
    }
  }
}
