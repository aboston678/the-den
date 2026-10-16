// Connect Four (Andrew, 2026-10-16): two bears at the games table in the basement stair landing.
// A 7 × 6 upright grid; players take turns dropping a disc into a column (red first), and four in a
// row across, up or diagonally wins. A full grid is a draw. Server-authoritative like Catan; there's
// nothing secret, so the whole game is the view everyone sees.

export const C4_COLS = 7;
export const C4_ROWS = 6;
export const C4_PLAYERS = 2;
/** Disc colours by player: red goes first. */
export const C4_COLOURS = ["red", "yellow"] as const;

export interface C4Player {
  /** Session id. */
  id: string;
  name: string;
  /** Chair 0 (north) or 1 (south). */
  seat: number;
  /** Left mid-game. */
  gone: boolean;
}

export interface C4Game {
  /** Cell (col, row) at col * C4_ROWS + row, row 0 at the bottom: -1 empty, else the player (0 red, 1 yellow). */
  cells: number[];
  /** players[0] is red and moves first. */
  players: C4Player[];
  /** Whose turn (player index). */
  turn: number;
  phase: "play" | "over";
  /** Player index, or null for a draw or a game someone left. */
  winner: number | null;
  /** The winning four cells. */
  line: number[];
  /** Discs dropped so far; the last one (cell index, -1 before the first). */
  moves: number;
  last: number;
}

export type C4Action = { type: "drop"; col: number };
export type C4Result = { ok: true; game: C4Game } | { ok: false; error: string };

export const cellIndex = (col: number, row: number) => col * C4_ROWS + row;

export function newC4Game(seated: { id: string; name: string; seat: number }[]): C4Game {
  return {
    cells: Array(C4_COLS * C4_ROWS).fill(-1),
    players: seated.map((s) => ({ ...s, gone: false })),
    turn: 0, phase: "play", winner: null, line: [], moves: 0, last: -1,
  };
}

/** The row a disc dropped in this column lands in, or -1 when the column is full. */
export function landingRow(cells: readonly number[], col: number): number {
  for (let row = 0; row < C4_ROWS; row++) if (cells[cellIndex(col, row)] === -1) return row;
  return -1;
}

/** Four (or more) in a row through this cell for its owner: the cells, or [] if none. */
export function fourThrough(cells: readonly number[], col: number, row: number): number[] {
  const who = cells[cellIndex(col, row)];
  if (who === undefined || who < 0) return [];
  for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
    const run = [cellIndex(col, row)];
    for (const s of [1, -1]) {
      for (let c = col + dc * s, r = row + dr * s; c >= 0 && c < C4_COLS && r >= 0 && r < C4_ROWS && cells[cellIndex(c, r)] === who; c += dc * s, r += dr * s) {
        run.push(cellIndex(c, r));
      }
    }
    if (run.length >= 4) return run;
  }
  return [];
}

/** Check a move a browser sent. */
export function parseC4Action(raw: unknown): C4Action | null {
  const a = raw as { type?: unknown; col?: unknown } | null;
  if (!a || a.type !== "drop" || typeof a.col !== "number" || !Number.isInteger(a.col) || a.col < 0 || a.col >= C4_COLS) return null;
  return { type: "drop", col: a.col };
}

/** Player `p` makes a move. Returns the new game, or why it isn't allowed. */
export function applyC4(game: C4Game, p: number, action: C4Action): C4Result {
  if (game.phase !== "play") return { ok: false, error: "The game is over" };
  if (p !== game.turn) return { ok: false, error: "It's not your turn" };
  const row = landingRow(game.cells, action.col);
  if (row < 0) return { ok: false, error: "That column is full" };
  const g: C4Game = { ...game, cells: [...game.cells], players: game.players.map((pl) => ({ ...pl })) };
  const cell = cellIndex(action.col, row);
  g.cells[cell] = p;
  g.moves++;
  g.last = cell;
  const line = fourThrough(g.cells, action.col, row);
  if (line.length) {
    g.phase = "over";
    g.winner = p;
    g.line = line;
  } else if (g.moves === C4_COLS * C4_ROWS) {
    g.phase = "over"; // a draw
  } else g.turn = 1 - p;
  return { ok: true, game: g };
}

/** A player leaves mid-game: it ends with no winner (like Catan with fewer than 2 left). */
export function leaveC4(game: C4Game, p: number): C4Game {
  const g: C4Game = { ...game, players: game.players.map((pl, i) => (i === p ? { ...pl, gone: true } : { ...pl })) };
  if (g.phase === "play") {
    g.phase = "over";
    g.winner = null;
  }
  return g;
}
