import {
  BEAR_HEALTH,
  GUN,
  GUNS,
  type GunId,
  HIDE_SPOTS,
  HUNT_COUNTDOWN_S,
  HUNT_LIMIT_S,
  HUNT_MIN_PLAYERS,
  HUNT_RESULTS_S,
  type HideSpot,
  type HuntResult,
  SWIPE,
  type ShotClaim,
  canSwipe,
  checkHit,
  inHuntCircle,
  isGun,
  nearLocker,
  pickHideSpot,
  pointsAtEnd,
  startLoadout,
} from "@den/shared";
import type { Hunt as HuntState, Player } from "./PartyState.ts";

// The bear hunt on the server (Andrew, 2026-10-17). Bears ready up in the circle by the dock; when
// everyone standing in it is ready (2+), a 5 s countdown, then one of them at random becomes the bear
// and is moved to a hiding spot (told only to the bear), the rest are hunters with the scoped sniper.
// The server owns ammo, reloads, fire rate, damage, the clock and the end. A hunter's browser casts
// each shot's ray and says where it hit the bear; checkHit() decides whether that holds up.

type Players = { get(id: string): Player | undefined; forEach(cb: (p: Player, id: string) => void): void };

/** A shot to pass on to everyone (sound, tracer). `to` is where the bullet stopped (or flew out of range). */
export interface ShotEvent {
  id: string;
  gun: GunId;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  hit: boolean;
}

/** Something the room must do after a tick or a message. */
export interface HuntEvents {
  /** Move this bear to its hiding spot (sent to that bear alone). */
  warp?: { id: string; spot: HideSpot };
  /** The hunt just ended. */
  over?: HuntResult & { players: string[] };
}

const list = (s: string): GunId[] => s.split(",").filter(isGun);

export class Hunt {
  /** Rounds left in each hunter's guns (the synced `ammo` is the gun in hand). */
  private ammo = new Map<string, Partial<Record<GunId, number>>>();
  private lastShot = new Map<string, number>();
  private lastSwipe = new Map<string, number>();
  private lastSpot = -1;
  /** Everyone in the running hunt (session ids), and the bear's name for the result. */
  private players: string[] = [];
  /** While set, poses far from here are ignored (the bear's browser hasn't caught up with the move yet). */
  private warps = new Map<string, { x: number; z: number; until: number }>();

  constructor(private rand: () => number = Math.random) {}

  get live() {
    return this.state?.phase === "live";
  }
  private state: HuntState | null = null;

  setup(state: HuntState) {
    this.state = state;
  }

  /** Ready (or not) in the circle. Only between hunts, standing in the circle. */
  ready(state: HuntState, id: string, p: Player, on: boolean) {
    if (state.phase === "live") return;
    if (!on) {
      state.ready.delete(id);
      return;
    }
    if (inHuntCircle(p.x, p.z) && p.connected) state.ready.set(id, true);
  }

  tick(state: HuntState, players: Players, now: number): HuntEvents {
    // Ready only counts while you're standing in the circle.
    if (state.phase === "idle" || state.phase === "countdown" || state.phase === "over") {
      for (const id of [...state.ready.keys()]) {
        const p = players.get(id);
        if (!p || !p.connected || !inHuntCircle(p.x, p.z)) state.ready.delete(id);
      }
    }
    if (state.phase === "over" && now >= state.overUntil) {
      state.phase = "idle";
      state.result = "";
      state.bearId = "";
    }
    if (state.phase === "idle" || state.phase === "countdown") {
      const inCircle: string[] = [];
      players.forEach((p, id) => {
        if (p.connected && inHuntCircle(p.x, p.z)) inCircle.push(id);
      });
      const allReady = inCircle.length >= HUNT_MIN_PLAYERS && inCircle.every((id) => state.ready.get(id));
      if (state.phase === "idle" && allReady) {
        state.phase = "countdown";
        state.countdownEnd = now + HUNT_COUNTDOWN_S * 1000;
      } else if (state.phase === "countdown" && !allReady) {
        state.phase = "idle";
      } else if (state.phase === "countdown" && now >= state.countdownEnd) {
        return this.start(state, players, inCircle.sort(), now);
      }
    }
    if (state.phase === "live") {
      if (now >= state.endsAt) return { over: this.end(state, players, "survived", now) };
      // Finished reloads.
      players.forEach((p, id) => {
        if (p.role === "hunter" && p.reloadUntil && now >= p.reloadUntil) {
          p.reloadUntil = 0;
          const gun = p.gun as GunId;
          if (isGun(gun)) {
            this.rounds(id)[gun] = GUN[gun].mag;
            p.ammo = GUN[gun].mag;
          }
        }
      });
    }
    return {};
  }

  private start(state: HuntState, players: Players, ids: string[], now: number): HuntEvents {
    const bearId = ids[Math.min(ids.length - 1, Math.floor(this.rand() * ids.length))]!;
    this.lastSpot = pickHideSpot(this.rand, this.lastSpot);
    const spot = HIDE_SPOTS[this.lastSpot]!;
    this.players = ids;
    state.phase = "live";
    state.ready.clear();
    state.bearId = bearId;
    state.bearHealth = BEAR_HEALTH;
    state.startedAt = now;
    state.endsAt = now + HUNT_LIMIT_S * 1000;
    state.result = "";
    for (const id of ids) {
      const p = players.get(id)!;
      p.downUntil = 0;
      p.reloadUntil = 0;
      if (id === bearId) {
        p.role = "bear";
        this.clearGuns(id, p);
        p.bike = p.bike === "riding" ? "" : p.bike; // off the bike: it can't come along to the hiding spot
        Object.assign(p, { x: spot.x, z: spot.z, speed: 0, action: "locomotion" });
        if (spot.y !== null) p.y = spot.y;
        this.warps.set(id, { x: spot.x, z: spot.z, until: now + 5000 });
      } else {
        p.role = "hunter";
        const kit = startLoadout();
        this.ammo.set(id, { ...kit.ammo });
        p.guns = kit.guns.join(",");
        p.scoped = kit.scoped.join(",");
        p.gun = kit.gun;
        p.ammo = kit.ammo[kit.gun as GunId] ?? 0;
      }
    }
    return { warp: { id: bearId, spot } };
  }

  /** End the hunt: roles and guns go away, the result stays up for a few seconds. */
  private end(state: HuntState, players: Players, how: HuntResult["how"], now: number, by?: { id: string; gun: GunId }): HuntResult & { players: string[] } {
    const seconds = Math.min(HUNT_LIMIT_S, Math.max(0, (now - state.startedAt) / 1000));
    const bear = players.get(state.bearId);
    const result: HuntResult = {
      how, bearId: state.bearId, bearName: bear?.name ?? "The bear", seconds, points: pointsAtEnd(how, seconds),
      ...(by ? { byId: by.id, byName: players.get(by.id)?.name ?? "A hunter", byGun: by.gun } : {}),
    };
    for (const id of this.players) {
      const p = players.get(id);
      if (!p) continue;
      p.role = "";
      p.downUntil = 0;
      this.clearGuns(id, p);
    }
    const ended = { ...result, players: [...this.players] };
    this.players = [];
    this.warps.clear();
    state.phase = "over";
    state.result = JSON.stringify(result);
    state.overUntil = now + HUNT_RESULTS_S * 1000;
    return ended;
  }

  private clearGuns(id: string, p: Player) {
    p.gun = p.guns = p.scoped = "";
    p.ammo = 0;
    p.reloadUntil = 0;
    this.ammo.delete(id);
  }

  private rounds(id: string) {
    let r = this.ammo.get(id);
    if (!r) this.ammo.set(id, (r = {}));
    return r;
  }

  private armed(state: HuntState, p: Player, now: number) {
    return state.phase === "live" && p.role === "hunter" && now >= p.downUntil && p.bike !== "riding";
  }

  /** At the locker: take or put back a gun, fit or remove a scope. */
  locker(state: HuntState, id: string, p: Player, msg: { do?: unknown; gun?: unknown; on?: unknown }) {
    if (state.phase !== "live" || p.role !== "hunter" || !isGun(msg.gun) || !nearLocker(p.x, p.y, p.z)) return;
    const gun = msg.gun;
    const guns = list(p.guns), scoped = list(p.scoped);
    if (msg.do === "take" && !guns.includes(gun)) {
      guns.push(gun);
      this.rounds(id)[gun] = GUN[gun].mag;
      p.gun = gun;
      p.reloadUntil = 0;
    } else if (msg.do === "return" && guns.includes(gun)) {
      guns.splice(guns.indexOf(gun), 1);
      if (scoped.includes(gun)) scoped.splice(scoped.indexOf(gun), 1);
      if (p.gun === gun) {
        p.gun = guns[0] ?? "";
        p.reloadUntil = 0;
      }
    } else if (msg.do === "scope" && guns.includes(gun)) {
      const on = msg.on === true;
      if (on && !scoped.includes(gun)) scoped.push(gun);
      if (!on && scoped.includes(gun)) scoped.splice(scoped.indexOf(gun), 1);
    } else return;
    p.guns = GUNS.filter((g) => guns.includes(g)).join(",");
    p.scoped = GUNS.filter((g) => scoped.includes(g)).join(",");
    p.ammo = isGun(p.gun) ? (this.rounds(id)[p.gun] ?? 0) : 0;
  }

  /** Switch to another gun you carry (keys 1–4). A reload in progress is dropped. */
  select(state: HuntState, id: string, p: Player, gun: unknown) {
    if (state.phase !== "live" || p.role !== "hunter" || !isGun(gun) || !list(p.guns).includes(gun)) return;
    p.gun = gun;
    p.reloadUntil = 0;
    p.ammo = this.rounds(id)[gun] ?? 0;
  }

  reload(state: HuntState, id: string, p: Player, now: number) {
    const gun = p.gun as GunId;
    if (!this.armed(state, p, now) || !isGun(gun) || p.reloadUntil) return;
    if ((this.rounds(id)[gun] ?? 0) >= GUN[gun].mag) return;
    p.reloadUntil = now + GUN[gun].reload * 1000;
  }

  /**
   * A shot. Returns what to pass on to everyone (null if refused: no gun, no rounds, too fast,
   * reloading, knocked down, riding), and the result if it took the bear down.
   */
  fire(state: HuntState, id: string, p: Player, shot: ShotClaim, players: Players, now: number): { event: ShotEvent; over?: HuntResult & { players: string[] } } | null {
    const gun = shot.gun;
    if (!this.armed(state, p, now) || p.gun !== gun || p.reloadUntil) return null;
    const rounds = this.rounds(id);
    if ((rounds[gun] ?? 0) <= 0) return null;
    if (now - (this.lastShot.get(id) ?? 0) < GUN[gun].interval * 1000 * 0.75) return null;
    this.lastShot.set(id, now);
    rounds[gun] = (rounds[gun] ?? 0) - 1;
    p.ammo = rounds[gun]!;

    const bear = players.get(state.bearId);
    const hit = !!bear && checkHit(shot, p, bear);
    const range = GUN[gun].range;
    const to = (hit ? shot.hit : shot.end) ?? { x: shot.from.x + shot.dir.x * range, y: shot.from.y + shot.dir.y * range, z: shot.from.z + shot.dir.z * range };
    const event: ShotEvent = { id, gun, from: { x: p.x, y: p.y + 1.45, z: p.z }, to, hit };
    if (!hit) return { event };
    state.bearHealth = Math.max(0, state.bearHealth - GUN[gun].damage);
    if (state.bearHealth > 0) return { event };
    return { event, over: this.end(state, players, "shot", now, { id, gun }) };
  }

  /** The bear's swipe: knocks down every hunter in reach in front of it. Returns who went down. */
  swipe(state: HuntState, id: string, p: Player, players: Players, now: number): string[] {
    if (state.phase !== "live" || p.role !== "bear" || id !== state.bearId) return [];
    if (now - (this.lastSwipe.get(id) ?? -Infinity) < SWIPE.cooldownS * 1000) return [];
    this.lastSwipe.set(id, now);
    const down: string[] = [];
    players.forEach((h, hid) => {
      if (h.role !== "hunter" || now < h.downUntil) return;
      if (canSwipe(p, h)) {
        h.downUntil = now + SWIPE.downS * 1000;
        down.push(hid);
      }
    });
    return down;
  }

  /**
   * Should this pose be ignored? While the server is moving the bear to its hiding spot (until its
   * browser reports being there), and while a hunter is knocked down (it can't move).
   */
  holdPose(id: string, p: Player, pose: { x?: unknown; z?: unknown }, now: number): boolean {
    const w = this.warps.get(id);
    if (w) {
      const x = typeof pose.x === "number" ? pose.x : Number.NaN, z = typeof pose.z === "number" ? pose.z : Number.NaN;
      if (now < w.until && !(Math.hypot(x - w.x, z - w.z) < 4)) return true;
      this.warps.delete(id);
    }
    return p.role === "hunter" && now < p.downUntil;
  }

  /** Someone left the party: out of the circle, and the hunt ends if their side is now empty. */
  leave(state: HuntState, id: string, players: Players, now: number): (HuntResult & { players: string[] }) | null {
    state.ready.delete(id);
    this.ammo.delete(id);
    this.warps.delete(id);
    if (state.phase !== "live" || !this.players.includes(id)) return null;
    this.players = this.players.filter((x) => x !== id);
    if (id === state.bearId) return this.end(state, players, "bearLeft", now);
    if (!this.players.some((x) => players.get(x)?.role === "hunter")) return this.end(state, players, "huntersLeft", now);
    return null;
  }

  /** Dev and tests: jump the hunt's clock forward. */
  devSkip(state: HuntState, seconds: number) {
    if (state.phase !== "live") return;
    state.startedAt -= seconds * 1000;
    state.endsAt -= seconds * 1000;
  }
}
