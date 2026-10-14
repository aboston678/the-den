// Catan game state: plain JSON so the server can send it as one string and tests can compare it.

export const RESOURCES = ["lumber", "brick", "wool", "grain", "ore"] as const;
export type Resource = (typeof RESOURCES)[number];
export type Hand = Record<Resource, number>;

export type Terrain = "forest" | "hills" | "pasture" | "fields" | "mountains" | "desert";

/** What each terrain produces. */
export const TERRAIN_RESOURCE: Record<Terrain, Resource | null> = {
  forest: "lumber",
  hills: "brick",
  pasture: "wool",
  fields: "grain",
  mountains: "ore",
  desert: null,
};

export interface Tile {
  terrain: Terrain;
  /** Number token 2–12, or null on the desert. */
  token: number | null;
}

export interface Harbor {
  /** Coast edge; both its corners get the harbor. */
  edge: number;
  /** "any" = 3:1, a resource = 2:1 of that resource. */
  kind: Resource | "any";
}

export interface Board {
  tiles: Tile[];
  harbors: Harbor[];
}

export type DevCard = "knight" | "vp" | "roadBuilding" | "yearOfPlenty" | "monopoly";

export interface CatanPlayer {
  /** Session id of the bear playing. */
  id: string;
  name: string;
  /** Chair 0–3 at the table; also picks the colour. */
  seat: number;
  hand: Hand;
  /** Development cards that can be played (or VP cards held). */
  dev: DevCard[];
  /** Development cards bought this turn (can't be played until next turn). */
  newDev: DevCard[];
  knights: number;
  /** Removed from the game (disconnected too long). */
  gone: boolean;
}

export interface Building {
  owner: number;
  city: boolean;
}

export type TradeReply = { kind: "accept" } | { kind: "decline" } | { kind: "counter"; give: Partial<Hand>; get: Partial<Hand> };

/** The player whose turn it is offers `give` for `get`; others reply. A counter's give/get are the replier's side. */
export interface TradeOffer {
  id: number;
  give: Partial<Hand>;
  get: Partial<Hand>;
  replies: Record<number, TradeReply>;
}

/** A vote to end the game early: who called it, each player's answer (null = not yet), and when it lapses (ms). */
export interface EndVote {
  by: number;
  votes: (boolean | null)[];
  until: number;
}

export type Phase = "setup" | "roll" | "discard" | "robber" | "steal" | "main" | "over";

export interface CatanGame {
  board: Board;
  robber: number;
  players: CatanPlayer[];
  /** Building on each corner (index = vertex id). */
  buildings: (Building | null)[];
  /** Owner (player index) of the road on each edge. */
  roads: (number | null)[];
  bank: Hand;
  deck: DevCard[];
  phase: Phase;
  /** Setup: which step of the snake order, and whether the settlement or road is next. */
  setupStep: number;
  setupPiece: "settlement" | "road";
  /** Setup: the settlement just placed (the road must touch it). */
  setupVertex: number | null;
  /** Player index whose turn it is. */
  turn: number;
  dice: [number, number] | null;
  /** Counts rolls so every screen plays each roll's tumble once. */
  rollId: number;
  devPlayed: boolean;
  /** Cards each player still has to discard after a 7. */
  discards: number[];
  /** Where the game goes after the robber: back to rolling (knight before the roll) or on with the turn. */
  robberReturn: "roll" | "main";
  /** Players the roller can steal from after moving the robber. */
  stealFrom: number[];
  offer: TradeOffer | null;
  offerCount: number;
  freeRoads: number;
  longestRoad: number | null;
  largestArmy: number | null;
  winner: number | null;
  endVote: EndVote | null;
  log: string[];
}

export const emptyHand = (): Hand => ({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 });

export const handSize = (h: Partial<Hand>) => RESOURCES.reduce((n, r) => n + (h[r] ?? 0), 0);

/** Deep copy (the game state is plain JSON). */
export const cloneGame = (g: CatanGame): CatanGame => JSON.parse(JSON.stringify(g)) as CatanGame;
