import {
  BUCKET_REACH, CAST_MAX, type Fight, HOOK_WINDOW_S, JENNA, JENNA_EVERY, MAX_REELS_PER_S, isStreamWater, rodBucket, rollBiteDelay, rollSpecies, rollWeight,
  speciesById, startFight, stepFight,
} from "@den/shared";
import type { Player } from "./PartyState.ts";

// Fishing on the server (GAME_SPEC §13): who holds a rod, where each lure is, when the fish bite,
// the fight, and the results. Clients only ask ("take a rod", "cast here", "R"); the server
// decides and writes the outcome into the synced player state so every bear sees the same thing.

/**
 * How long results stay on screen before the line is free again (seconds). A landed fish is held up
 * by its lip until the angler lets it go (R), or for at most this long.
 */
const SHOW_RESULT_S = { landed: 60, released: 1.2, snapped: 2, missed: 2 } as const;
/** R presses right after landing are still the fight's mashing, not "let it go" (seconds). */
export const RELEASE_GRACE_S = 1.5;
/** Walk further than this from your lure and the line is wound in (world metres). */
const MAX_WANDER = CAST_MAX + 6;

interface Angler {
  biteAt: number;
  hookBy: number;
  resultUntil: number;
  landedAt: number;
  fight: Fight | null;
  presses: number;
  pressWindowStart: number;
  pressesInWindow: number;
  /** Heaviest of each species this session (personal bests; saved for good in milestone 2.6). */
  best: Map<string, number>;
  /**
   * The Jenna Catfish's turn (round 3): every run of JENNA_EVERY casts has one random cast that's hers
   * (`slot`). Her turn stays owed until she's landed, so if she snaps the line, gets away or the line
   * comes in, she's back on the next cast.
   */
  jenna: { castsInRun: number; slot: number; owed: boolean; thisCast: boolean };
  /** Dev and tests: the next bite's delay, species and weight. */
  forced?: { biteIn: number; species?: string; weight?: number };
}

export interface Catch {
  id: string;
  name: string;
  species: string;
  weight: number;
  best: boolean;
}

export class Fishing {
  private anglers = new Map<string, Angler>();

  constructor(private rand: () => number = Math.random) {}

  private angler(id: string) {
    let a = this.anglers.get(id);
    if (!a) {
      a = { biteAt: 0, hookBy: 0, resultUntil: 0, landedAt: 0, fight: null, presses: 0, pressWindowStart: 0, pressesInWindow: 0, best: new Map(),
        jenna: { castsInRun: 0, slot: Math.floor(this.rand() * JENNA_EVERY), owed: false, thisCast: false } };
      this.anglers.set(id, a);
    }
    return a;
  }

  remove(id: string) {
    this.anglers.delete(id);
  }

  /** Their connection dropped (or they reloaded): the fish gets away and the line comes in, so nobody watches a fight that's stalled. They keep the rod. */
  drop(id: string, p: Player) {
    if (p.fishing === "cast" || p.fishing === "bite" || p.fishing === "fight") this.clearLine(id, p);
  }

  /** Take a rod from the bucket, or put it back (only standing at the bucket; putting it away also works anywhere, e.g. going indoors). */
  rod(id: string, p: Player, take: boolean) {
    if (take) {
      const b = rodBucket();
      if (Math.hypot(p.x - b.x, p.z - b.z) > BUCKET_REACH + 1 || p.bike === "riding") return; // no fishing from the motorcycle
      p.rod = true;
    } else {
      p.rod = false;
      this.clearLine(id, p);
    }
  }

  /** Cast the lure to (x, z): it must land on the water, within reach. */
  cast(id: string, p: Player, x: number, z: number, now: number) {
    if (!p.rod || !Number.isFinite(x) || !Number.isFinite(z)) return;
    if (p.fishing === "bite" || p.fishing === "fight") return;
    if (Math.hypot(x - p.x, z - p.z) > CAST_MAX + 2 || !isStreamWater(x, z)) return;
    const a = this.angler(id);
    a.fight = null;
    a.biteAt = now + (a.forced ? a.forced.biteIn : rollBiteDelay(this.rand())) * 1000;
    // Is this cast the catfish's? (One random cast in every run of four; still owed from an earlier one counts.)
    const j = a.jenna;
    if (j.castsInRun === j.slot) j.owed = true;
    j.thisCast = j.owed;
    if (++j.castsInRun >= JENNA_EVERY) {
      j.castsInRun = 0;
      j.slot = Math.floor(this.rand() * JENNA_EVERY);
    }
    p.fishing = "cast";
    p.lureX = x;
    p.lureZ = z;
    p.tension = 0;
    p.line = Math.hypot(x - p.x, z - p.z);
    p.catchSpecies = "";
  }

  /** One press of R: strike, reel, or let a landed fish go. */
  reel(id: string, p: Player, now: number) {
    const a = this.angler(id);
    if (p.fishing === "landed") {
      if (now - a.landedAt >= RELEASE_GRACE_S * 1000) this.result(p, a, "released", now);
      return;
    }
    if (now - a.pressWindowStart > 1000) {
      a.pressWindowStart = now;
      a.pressesInWindow = 0;
    }
    if (++a.pressesInWindow > MAX_REELS_PER_S) return;
    if (p.fishing === "bite") {
      // Strike: the fish is hooked.
      const forced = a.forced;
      const species = (forced?.species && speciesById(forced.species)) || (a.jenna.thisCast ? speciesById(JENNA)! : rollSpecies(this.rand()));
      const weight = forced?.weight ?? rollWeight(species, this.rand());
      a.forced = undefined;
      a.fight = startFight(species, weight, Math.max(4, Math.hypot(p.lureX - p.x, p.lureZ - p.z)), this.rand());
      a.presses = 0;
      // Everyone can see what's on the line (it jumps while it fights); the catch card waits for the landing.
      p.catchSpecies = species.id;
      p.catchWeight = weight;
      p.fishing = "fight";
    } else if (p.fishing === "fight") a.presses++;
  }

  /** Wind the lure back in (no fish on, or giving up on one). */
  reelIn(id: string, p: Player) {
    if (p.fishing === "cast" || p.fishing === "bite" || p.fishing === "fight") this.clearLine(id, p);
  }

  /** Dev and tests: make the next bite come quickly (optionally a set species and weight). */
  force(id: string, biteIn: number, species?: string, weight?: number) {
    this.angler(id).forced = { biteIn, species, weight };
  }

  /** Every server tick: bites, the fights, results timing out. Returns fish landed this tick. */
  tick(players: Map<string, Player>, now: number, dt: number): Catch[] {
    const caught: Catch[] = [];
    players.forEach((p, id) => {
      if (!p.fishing) return;
      const a = this.angler(id);
      if (p.fishing === "cast" || p.fishing === "bite" || p.fishing === "fight") {
        if (!p.rod || Math.hypot(p.lureX - p.x, p.lureZ - p.z) > MAX_WANDER) return this.clearLine(id, p);
      }
      switch (p.fishing) {
        case "cast":
          if (now >= a.biteAt) {
            p.fishing = "bite";
            a.hookBy = now + HOOK_WINDOW_S * 1000;
          }
          break;
        case "bite":
          if (now >= a.hookBy) this.result(p, a, "missed", now);
          break;
        case "fight": {
          const f = a.fight!;
          const r = stepFight(f, dt, a.presses, this.rand);
          a.presses = 0;
          p.tension = f.tension;
          p.line = f.line;
          p.surges = f.surges;
          // The lure (and fish) come in toward the bear as the line shortens.
          const dx = p.lureX - p.x, dz = p.lureZ - p.z, d = Math.hypot(dx, dz) || 1;
          const along = Math.max(1.2, Math.min(d, f.line));
          let lx = p.x + (dx / d) * along, lz = p.z + (dz / d) * along;
          if (!isStreamWater(lx, lz)) ({ lx, lz } = { lx: p.lureX, lz: p.lureZ }); // stay on the water's edge
          p.lureX = lx;
          p.lureZ = lz;
          if (r === "snapped") this.result(p, a, "snapped", now);
          if (r === "landed") {
            const prev = a.best.get(f.species) ?? 0;
            const best = f.weight > prev;
            if (best) a.best.set(f.species, f.weight);
            if (f.species === JENNA) a.jenna.owed = false; // landed her: her turn is used
            p.catchSpecies = f.species;
            p.catchWeight = f.weight;
            this.result(p, a, "landed", now);
            a.landedAt = now;
            caught.push({ id, name: p.name, species: f.species, weight: f.weight, best });
          }
          break;
        }
        default:
          if (now >= a.resultUntil) {
            p.fishing = "";
            p.catchSpecies = "";
          }
      }
    });
    return caught;
  }

  private result(p: Player, a: Angler, state: "landed" | "released" | "snapped" | "missed", now: number) {
    p.fishing = state;
    p.tension = 0;
    a.fight = null;
    a.resultUntil = now + SHOW_RESULT_S[state] * 1000;
  }

  private clearLine(id: string, p: Player) {
    const a = this.angler(id);
    a.fight = null;
    p.fishing = "";
    p.tension = 0;
    p.line = 0;
    p.catchSpecies = "";
  }
}
