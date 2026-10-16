import { BIKE_REACH, GARAGE_BIKE, MIN_LAP_S, bikeBlocked, inTrackArea } from "@den/shared";
import type { Player } from "./PartyState.ts";

// The motorcycle on the server (Andrew, 2026-10-16). Each bear has at most one bike: "riding" it,
// "parked" somewhere (everyone sees it there), or none. The garage always has one waiting, so taking
// it gives you a bike (your old parked one goes). The server checks you're next to the bike, and
// only a bear it says is riding may move at a bike's speed.

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);

/** Handle a bike message. Returns true if anything changed. */
export function bikeMessage(p: Player, raw: unknown): boolean {
  const m = (raw ?? {}) as { do?: unknown; x?: unknown; y?: unknown; z?: unknown; yaw?: unknown };
  const near = (x: number, z: number, y: number) => Math.hypot(p.x - x, p.z - z) <= BIKE_REACH + 0.6 && Math.abs(p.y - y) < 2;
  if (m.do === "take") {
    if (p.bike === "riding" || p.rod || !near(GARAGE_BIKE.x, GARAGE_BIKE.z, GARAGE_BIKE.y)) return false;
    p.bike = "riding";
    return true;
  }
  if (m.do === "mount") {
    if (p.bike !== "parked" || p.rod || !near(p.bikeX, p.bikeZ, p.bikeY)) return false;
    p.bike = "riding";
    return true;
  }
  if (m.do === "park") {
    if (p.bike !== "riding") return false;
    // Where the bike stops: what the rider says, if it's next to them and not inside the house.
    let x = num(m.x), y = num(m.y), z = num(m.z);
    if (!(Math.hypot(x - p.x, z - p.z) <= 3 && Math.abs(y - p.y) < 2) || bikeBlocked(x, z)) ({ x, y, z } = p);
    p.bike = "parked";
    p.bikeX = x;
    p.bikeY = y;
    p.bikeZ = z;
    p.bikeYaw = Number.isFinite(num(m.yaw)) ? num(m.yaw) : p.yaw;
    return true;
  }
  return false;
}

/**
 * Lap times at the racetrack (session only, not saved). A lap counts from a bear on a bike at the
 * track, no quicker than a bike flat out all the way round could manage.
 */
export class Laps {
  private best = new Map<string, number>();

  /** A finished lap; returns what to tell the party, or null if it doesn't count. */
  record(id: string, p: Player, raw: unknown): { s: number; best: boolean; record: boolean } | null {
    const s = typeof raw === "number" ? raw : Number.NaN;
    if (!(s >= MIN_LAP_S && s < 900) || p.bike !== "riding" || !inTrackArea(p.x, p.z)) return null;
    const mine = this.best.get(id) ?? Infinity;
    const party = Math.min(Infinity, ...this.best.values());
    if (s < mine) this.best.set(id, s);
    return { s, best: s < mine, record: s < party };
  }

  leave(id: string) {
    this.best.delete(id);
  }
}
