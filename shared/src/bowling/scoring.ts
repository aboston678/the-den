// Ten-pin scoring (GAME_SPEC §15): 10 frames; a strike scores 10 + the next two balls, a spare
// 10 + the next ball; the 10th frame gives a bonus ball after a strike or spare (up to 3 balls);
// a perfect game is 300. A bowler's game is just the list of pins knocked down by each ball.

export interface FrameView {
  /** What each ball shows on the scoreboard: "X", "/", "-" (none) or a number. */
  marks: string[];
  /** Running total through this frame, once it can be worked out (bonuses still to come = null). */
  total: number | null;
}

/** Which frame (0–9) and ball (0–2) is next, or null when the game's over. */
export function nextBall(rolls: readonly number[]): { frame: number; ball: number } | null {
  let i = 0;
  for (let frame = 0; frame < 10; frame++) {
    if (frame < 9) {
      if (i >= rolls.length) return { frame, ball: 0 };
      if (rolls[i] === 10) {
        i += 1;
        continue;
      }
      if (i + 1 >= rolls.length) return { frame, ball: 1 };
      i += 2;
      continue;
    }
    // 10th frame
    const t = rolls.slice(i);
    if (t.length === 0) return { frame, ball: 0 };
    if (t.length === 1) return { frame, ball: 1 };
    if (t.length === 2) return t[0]! + t[1]! >= 10 ? { frame, ball: 2 } : null;
    return null;
  }
  return null;
}

export const isGameOver = (rolls: readonly number[]) => nextBall(rolls) === null;

/** How many pins are standing for the next ball (10 on a fresh rack). */
export function pinsStanding(rolls: readonly number[]): number {
  const next = nextBall(rolls);
  if (!next || next.ball === 0) return 10;
  const prev = rolls[rolls.length - 1]!;
  if (next.frame < 9) return 10 - prev;
  // 10th frame: a fresh rack after a strike, or after a spare on ball 3.
  const t = rolls.slice(rolls.length - next.ball);
  if (next.ball === 1) return t[0] === 10 ? 10 : 10 - t[0]!;
  // ball 3: after X X or X/spare or a spare → fresh; after X then a non-strike → what's left
  if (t[0] === 10) return t[1] === 10 ? 10 : 10 - t[1]!;
  return 10;
}

/** Is knocking down `knocked` pins with the next ball possible? */
export const validRoll = (rolls: readonly number[], knocked: number) =>
  Number.isInteger(knocked) && knocked >= 0 && !isGameOver(rolls) && knocked <= pinsStanding(rolls);

/** The scoreboard: marks and running totals for all 10 frames. */
export function frames(rolls: readonly number[]): FrameView[] {
  const out: FrameView[] = [];
  let i = 0, total = 0, known = true;
  for (let frame = 0; frame < 10; frame++) {
    const marks: string[] = [];
    let score: number | null = null;
    const r = (k: number) => rolls[i + k];
    if (frame < 9) {
      if (r(0) === undefined) {
        out.push({ marks, total: null });
        known = false;
        continue;
      }
      if (r(0) === 10) {
        marks.push("X");
        if (r(1) !== undefined && r(2) !== undefined) score = 10 + r(1)! + r(2)!;
        i += 1;
      } else {
        marks.push(mark(r(0)!));
        if (r(1) !== undefined) {
          const spare = r(0)! + r(1)! === 10;
          marks.push(spare ? "/" : mark(r(1)!));
          if (!spare) score = r(0)! + r(1)!;
          else if (r(2) !== undefined) score = 10 + r(2)!;
        }
        i += r(1) === undefined ? 1 : 2;
      }
    } else {
      const t = rolls.slice(i, i + 3);
      let left = 10; // pins standing for each ball (a strike or spare racks a fresh set)
      for (const p of t) {
        if (left === 10 && p === 10) marks.push("X");
        else if (p === left) (marks.push("/"), (left = 10));
        else (marks.push(mark(p)), (left -= p));
      }
      if (isGameOver(rolls.slice(0, i + t.length)) && t.length >= 2) score = t.reduce((a, b) => a + b, 0);
    }
    if (score === null) known = false;
    if (known && score !== null) total += score;
    out.push({ marks, total: known && score !== null ? total : null });
  }
  return out;
}

/** Score so far, counting only frames that are settled. */
export function score(rolls: readonly number[]): number {
  let best = 0;
  for (const f of frames(rolls)) if (f.total !== null) best = f.total;
  return best;
}

/** The final score of a finished game (or the settled score so far). */
export const finalScore = score;

const mark = (p: number) => (p === 0 ? "-" : String(p));
