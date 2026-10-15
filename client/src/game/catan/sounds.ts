import { CATAN_TABLE, handSize, type CatanPrivate, type CatanView } from "@den/shared";
import { usePartyStore } from "../../net/party.ts";
import { play, playAt, take } from "../audio/audio.ts";
import { useCatan } from "./store.ts";

// Catan's sounds (GAME_SPEC §10): pieces clacking onto the board and the robber thumping down
// (from the table, for everyone in the room), and for you alone: cards coming and going, a ding
// when it's your turn, a buzz when a move is refused. The winner's fanfare plays at the table.
// The dice have their own clatter (Dice.tsx).

const atTable = (name: string, volume = 1) => void playAt(name, CATAN_TABLE.x, CATAN_TABLE.topY + 0.1, CATAN_TABLE.z, volume, 3);

const pieces = (v: CatanView) => v.roads.filter((r) => r !== null).length + v.buildings.filter((b) => b).length + v.buildings.filter((b) => b?.city).length;
const handTotal = (m: CatanPrivate | null) => (m ? handSize(m.hand) + m.dev.length + m.newDev.length : 0);
const myTurn = (v: CatanView | null, me: string) => !!v && v.phase !== "over" && v.players[v.turn]?.id === me && v.players[v.turn]?.gone === false;

let started = false;

/** Listens to the table for the rest of the visit (call once). */
export function initCatanSounds() {
  if (started) return;
  started = true;
  useCatan.subscribe((now, before) => {
    const me = usePartyStore.getState().sessionId;
    const v = now.view, old = before.view;
    if (v && old && v.log[0] === old.log[0]) {
      // Same game: what changed on the board?
      if (pieces(v) > pieces(old)) atTable(take("piece-place", 2), 0.9);
      if (v.robber !== old.robber) atTable("robber", 1);
      if (v.phase === "over" && old.phase !== "over" && v.winner !== null) atTable("fanfare", 0.9);
    }
    if (myTurn(v, me) && (!myTurn(old, me) || (v!.phase === "setup" && v!.setupStep !== old?.setupStep))) void play("turn-ding", 0.5);
    const got = handTotal(now.mine), had = handTotal(before.mine);
    if (now.mine && before.mine && got !== had) void play(got > had ? "card-take" : "card-give", 0.5);
    if (now.error && now.error !== before.error) void play("ui-error", 0.5);
  });
}
