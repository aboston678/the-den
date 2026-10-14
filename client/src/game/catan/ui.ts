import { RESOURCES, legalCities, legalRoads, legalSettlements, piecesLeft, type CatanGame, type CatanView, type Hand } from "@den/shared";
import { create } from "zustand";
import { usePartyStore } from "../../net/party.ts";
import { useCatan } from "./store.ts";

// What you're doing at the Catan table right now (GAME_SPEC §16): which building tool is picked,
// and which panels are open. The board's click markers (Picks.tsx) and the HUD both read it.

export type Tool = "road" | "settlement" | "city" | null;
export type Panel = "trade" | "yearOfPlenty" | "monopoly" | "leave" | null;

export const useCatanUi = create<{ tool: Tool; panel: Panel }>(() => ({ tool: null, panel: null }));

export const setTool = (tool: Tool) => useCatanUi.setState((s) => ({ tool: s.tool === tool ? null : tool, panel: null }));
export const openPanel = (panel: Panel) => useCatanUi.setState((s) => ({ panel: s.panel === panel ? null : panel, tool: null }));
export const closeAll = () => useCatanUi.setState({ tool: null, panel: null });

/** The placement helpers only look at buildings and roads, which the public view has. */
export const asGame = (v: CatanView) => v as unknown as CatanGame;

export const canAfford = (hand: Hand | undefined, cost: Partial<Hand>) => !!hand && RESOURCES.every((r) => hand[r] >= (cost[r] ?? 0));

/** Your seat in the game and whose turn it is. */
export function me() {
  const id = usePartyStore.getState().sessionId;
  const { view, mine } = useCatan.getState();
  const index = view ? view.players.findIndex((p) => p.id === id && !p.gone) : -1;
  return { id, view, mine, index, myTurn: !!view && index >= 0 && view.turn === index && view.phase !== "over" };
}

export type Spots = { kind: "vertex" | "edge" | "hex"; ids: number[]; act: (id: number) => import("@den/shared").CatanAction };

/** The spots you can click on the board right now, and the move each one makes. */
export function clickable(view: CatanView | null, index: number, tool: Tool): Spots | null {
  if (!view || index < 0 || view.turn !== index) return null;
  const g = asGame(view);
  if (view.phase === "setup") {
    return view.setupPiece === "settlement"
      ? { kind: "vertex", ids: legalSettlements(g, index, true), act: (vertex) => ({ type: "placeSettlement", vertex }) }
      : { kind: "edge", ids: legalRoads(g, index, view.setupVertex), act: (edge) => ({ type: "placeRoad", edge }) };
  }
  if (view.phase === "robber") {
    return { kind: "hex", ids: view.board.tiles.map((_, h) => h).filter((h) => h !== view.robber), act: (hex) => ({ type: "moveRobber", hex }) };
  }
  const free = view.freeRoads > 0 && (view.phase === "main" || view.phase === "roll");
  if (free || (view.phase === "main" && tool === "road")) {
    return { kind: "edge", ids: piecesLeft(g, index).road > 0 ? legalRoads(g, index) : [], act: (edge) => ({ type: "buildRoad", edge }) };
  }
  if (view.phase !== "main") return null;
  if (tool === "settlement") return { kind: "vertex", ids: legalSettlements(g, index), act: (vertex) => ({ type: "buildSettlement", vertex }) };
  if (tool === "city") return { kind: "vertex", ids: legalCities(g, index), act: (vertex) => ({ type: "buildCity", vertex }) };
  return null;
}
