// Catan dice. Server-only: this file is imported through "@den/shared/catan-dice" and is never
// re-exported from the package index, so it never ends up in the website's code.
//
// "fair" rolls two ordinary dice. "house" is Andrew's prank mode (GAME_SPEC §16): the totals are
// flipped so 2 and 12 come up as often as 6 and 8 normally do, and 6 and 8 as rarely as 2 and 12.
// 7 keeps its usual 1 in 6. The two faces shown always add up to the total.

export type DiceMode = "fair" | "house";

/** How many of every 36 rolls land on each total (index = total). */
export const FAIR_WEIGHTS = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1] as const;
export const HOUSE_WEIGHTS = [0, 0, 5, 4, 3, 2, 1, 6, 1, 2, 3, 4, 5] as const;

const d6 = (rand: () => number) => 1 + Math.floor(rand() * 6);

/** Picks a total from a weight table. */
function pickTotal(weights: readonly number[], rand: () => number): number {
  const sum = weights.reduce((a, b) => a + b, 0);
  let x = rand() * sum;
  for (let t = 2; t <= 12; t++) {
    x -= weights[t]!;
    if (x < 0) return t;
  }
  return 12;
}

/** Two faces (each 1–6) adding up to `total`, chosen evenly among the ways to make it. */
export function facesFor(total: number, rand: () => number): [number, number] {
  const lo = Math.max(1, total - 6), hi = Math.min(6, total - 1);
  const a = lo + Math.floor(rand() * (hi - lo + 1));
  return [a, total - a];
}

export function rollDice(mode: DiceMode, rand: () => number = Math.random): [number, number] {
  if (mode === "fair") return [d6(rand), d6(rand)];
  return facesFor(pickTotal(HOUSE_WEIGHTS, rand), rand);
}
