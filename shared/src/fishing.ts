import { STREAM, streamCenter } from "./world/layout.ts";

// Fishing rules (GAME_SPEC §13), shared by the browser and the game server. The server owns the
// bites, the fight and the results; the browser uses the same numbers to draw them.

/** "landed": the bear holds the fish up by its lip until the angler lets it go (R), then "released" while it drops back in. */
export type FishState = "" | "cast" | "bite" | "fight" | "landed" | "released" | "snapped" | "missed";

export interface Species {
  id: string;
  name: string;
  /** Chance out of 100. */
  chance: number;
  minLb: number;
  maxLb: number;
  /** How hard it pulls: surge strength and how fast it runs. */
  fight: number;
  jumps: boolean;
  /** Weight curve exponent: min + (max − min) × r^curve. Default 2.2 (big fish rare); 1 = even spread. */
  curve?: number;
  /** The fight's line tension uses weight × this (default 1), so a monster doesn't snap the line on the first press. */
  pullPerLb?: number;
}

// Every species jumps clear of the water while you reel it in (Andrew, 2026-10-16), so you can see what's on.
// The Jenna Catfish (Andrew's own monster, always 200–400 lb) isn't left to chance: she's 1 cast in
// every 4 (round 3; the server's cast counter, JENNA_EVERY), so her chance in the random table is 0
// and the other fish share the rest.
export const SPECIES: Species[] = [
  { id: "sunfish", name: "Pumpkinseed sunfish", chance: 28, minLb: 0.1, maxLb: 1.0, fight: 0.6, jumps: true },
  { id: "perch", name: "Yellow perch", chance: 24, minLb: 0.1, maxLb: 1.5, fight: 0.6, jumps: true },
  { id: "crappie", name: "Crappie", chance: 16, minLb: 0.25, maxLb: 2.5, fight: 1.0, jumps: true },
  { id: "smallmouth", name: "Smallmouth bass", chance: 17, minLb: 0.5, maxLb: 8.0, fight: 1.5, jumps: true },
  { id: "largemouth", name: "Largemouth bass", chance: 15, minLb: 0.5, maxLb: 8.0, fight: 1.5, jumps: true },
  { id: "jenna_catfish", name: "Jenna Catfish", chance: 0, minLb: 200, maxLb: 400, fight: 3.0, jumps: true, curve: 1, pullPerLb: 0.02 },
];
export const JENNA = "jenna_catfish";
/** The Jenna Catfish bites on one cast in every this many (a random one in each run of casts). */
export const JENNA_EVERY = 4;
export const speciesById = (id: string) => SPECIES.find((s) => s.id === id);

/** The longest cast, metres. */
export const CAST_MAX = 25;
/** Bites come this many seconds after the lure lands. */
export const BITE_MIN_S = 10;
export const BITE_MAX_S = 45;
/** Seconds to start reeling after a bite before the fish gets away. */
export const HOOK_WINDOW_S = 2.5;
/** Line this short = fish landed (metres). */
export const LANDED_LINE = 1.5;
/** How close to the rod bucket you must be to take or return a rod (world metres). */
export const BUCKET_REACH = 2.6;
/** Most reel presses the server counts per second (spamming faster doesn't help). */
export const MAX_REELS_PER_S = 14;

/** Pick a species from a random number 0…1 using the chances (never the Jenna Catfish: she comes by the cast counter). */
export function rollSpecies(r: number): Species {
  const pool = SPECIES.filter((s) => s.chance > 0);
  let t = r * 100;
  for (const s of pool) {
    if (t < s.chance) return s;
    t -= s.chance;
  }
  return pool[pool.length - 1]!;
}

/** Weight in pounds: min + (max − min) × r^2.2, so big fish are rare (the species' own curve if it has one). */
export const rollWeight = (s: Species, r: number) => s.minLb + (s.maxLb - s.minLb) * Math.pow(r, s.curve ?? 2.2);

/** Seconds until a bite, from a random number 0…1. */
export const rollBiteDelay = (r: number) => BITE_MIN_S + (BITE_MAX_S - BITE_MIN_S) * r;

/** "2 lb 5 oz" / "11 oz". */
export function formatWeight(lb: number) {
  const totalOz = Math.max(1, Math.round(lb * 16));
  const pounds = Math.floor(totalOz / 16), oz = totalOz % 16;
  return pounds ? (oz ? `${pounds} lb ${oz} oz` : `${pounds} lb`) : `${oz} oz`;
}

/** Is (x, z) on the stream's water (not the banks)? World metres. */
export function isStreamWater(x: number, z: number) {
  return Math.abs(x - streamCenter(z)) < STREAM.width / 2 - 0.6;
}

// --- the fight ---

export interface Fight {
  species: string;
  weight: number;
  /** 0 … 1; at 1 the line snaps. */
  tension: number;
  /** Metres of line out; reel it to LANDED_LINE. */
  line: number;
  /** Seconds until the fish's next surge. */
  surgeIn: number;
  /** Seconds since the fight began. */
  time: number;
  /** Counts surges, so viewers can splash on each one. */
  surges: number;
}

/** Tuning (GAME_SPEC §13: a big bass takes ~10–15 s and is genuinely tense). */
export const FIGHT = {
  reelPerPress: 0.5, // metres of line per R
  tensionPerPress: 0.05, // + 0.004 per lb
  tensionPerLb: 0.004,
  drainPerS: 0.35, // tension drains while you ease off
  surgeBase: 0.05, // + 0.02 per lb, × the species' fight
  surgePerLb: 0.02,
  runPerSurge: 0.4, // metres the fish takes on a surge, × fight
  driftPerS: 0.15, // metres the fish slowly pulls out, × fight
  maxSurgeFight: 1.5, // the surge's tension uses at most this much of the fight
} as const;

export function startFight(species: Species, weight: number, line: number, r: number): Fight {
  return { species: species.id, weight, tension: 0.15, line, surgeIn: 1 + r * 1.5, time: 0, surges: 0 };
}

/**
 * Advance a fight by dt seconds with `presses` R presses in that time. `rand` gives 0…1.
 * Returns "snapped", "landed" or null (still fighting).
 */
export function stepFight(f: Fight, dt: number, presses: number, rand: () => number): "snapped" | "landed" | null {
  const s = speciesById(f.species)!;
  const pull = f.weight * (s.pullPerLb ?? 1);
  f.time += dt;
  f.tension += presses * (FIGHT.tensionPerPress + FIGHT.tensionPerLb * pull);
  f.line -= presses * FIGHT.reelPerPress;
  f.tension -= FIGHT.drainPerS * dt;
  f.line += FIGHT.driftPerS * s.fight * dt;
  f.surgeIn -= dt;
  if (f.surgeIn <= 0) {
    // A surge's yank tops out at a bass's fight; a stronger fish (the catfish) runs further instead.
    f.tension += (FIGHT.surgeBase + FIGHT.surgePerLb * pull) * Math.min(s.fight, FIGHT.maxSurgeFight);
    f.line += FIGHT.runPerSurge * s.fight;
    f.surgeIn = 1.5 + rand() * 2.5;
    f.surges++;
  }
  f.tension = Math.max(0, f.tension);
  if (f.tension >= 1) return "snapped";
  if (f.line <= LANDED_LINE) return "landed";
  return null;
}
