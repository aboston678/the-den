import { LANE } from "./lane.ts";

// What a bowler's browser streams while its ball and pins move (GAME_SPEC §15 "Sync"), so the
// rest of the party sees the same roll and crash. Lane coordinates (see lane.ts), rounded to
// millimetres. The server checks the shape and passes it on; it never trusts it for the score.

export interface BowlFrame {
  lane: "1" | "2";
  /** The ball: x, y, z, then its rotation as a quaternion (x, y, z, w); null when hidden. */
  b: number[] | null;
  /** The ten pins, 7 numbers each like the ball; null when they haven't moved. */
  p: number[] | null;
  /** Pins that are gone (swept or in the pit): bit mask. */
  g: number;
  /** Sweep bar: how far down (0…1) and its lane x. */
  s: [number, number];
  /** A sound to play with this frame. */
  snd?: BowlSound;
}

export const BOWL_SOUNDS = ["roll", "crash", "tap", "sweep", "return"] as const;
export type BowlSound = (typeof BOWL_SOUNDS)[number];

const LIMITS = { x: [-6, LANE.pitEdge + LANE.pitDepth + 0.5], y: [-1, 2], z: [-1.2, 1.2] } as const;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round = (v: number, k = 1000) => Math.round(v * k) / k;

/** One body: position inside the lane's box and a unit quaternion, or null. */
function body(a: unknown, at: number): number[] | null {
  if (!Array.isArray(a)) return null;
  const v = a.slice(at, at + 7);
  if (v.length !== 7 || !v.every(finite)) return null;
  const [x, y, z, qx, qy, qz, qw] = v as number[];
  if (x! < LIMITS.x[0] || x! > LIMITS.x[1] || y! < LIMITS.y[0] || y! > LIMITS.y[1] || z! < LIMITS.z[0] || z! > LIMITS.z[1]) return null;
  const n = Math.hypot(qx!, qy!, qz!, qw!);
  if (n < 0.5 || n > 1.5) return null;
  return [round(x!), round(y!), round(z!), round(qx! / n, 1e4), round(qy! / n, 1e4), round(qz! / n, 1e4), round(qw! / n, 1e4)];
}

/** A clean copy of a frame from a browser, or null if it isn't one. */
export function sanitizeBowlFrame(m: unknown): BowlFrame | null {
  if (!m || typeof m !== "object") return null;
  const f = m as Record<string, unknown>;
  if (f.lane !== "1" && f.lane !== "2") return null;
  const b = f.b === null ? null : body(f.b, 0);
  if (f.b !== null && !b) return null;
  let p: number[] | null = null;
  if (f.p !== null) {
    if (!Array.isArray(f.p) || f.p.length !== 70) return null;
    p = [];
    for (let i = 0; i < 10; i++) {
      const one = body(f.p, i * 7);
      if (!one) return null;
      p.push(...one);
    }
  }
  const g = finite(f.g) ? Math.round(f.g) & 0x3ff : 0;
  const s = Array.isArray(f.s) && f.s.length === 2 && f.s.every(finite) ? [Math.min(1, Math.max(0, f.s[0] as number)), round(f.s[1] as number)] as [number, number] : [0, 0] as [number, number];
  const snd = BOWL_SOUNDS.includes(f.snd as BowlSound) ? (f.snd as BowlSound) : undefined;
  return { lane: f.lane, b, p, g, s, ...(snd ? { snd } : {}) };
}
