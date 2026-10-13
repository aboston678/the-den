import { describe, expect, it } from "vitest";
import { DOORS, roomById } from "./floorplan.ts";
import { FURNITURE, type Footprint, KINDS, type Placement, footprint, isSolid, kindOf, levelOfRoom, wallFace } from "./furniture.ts";

const overlap = (a: Footprint, b: Footprint, slack = 0) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > slack && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > slack;
const name = (p: Placement) => `${p.kind} in ${p.room} at (${p.x}, ${p.z})`;

/** Space a door needs on each side: its swing (into room a for hinged doors) or a strip to walk through. */
function doorZones(level: string): { door: string; zone: Footprint }[] {
  const out: { door: string; zone: Footprint }[] = [];
  for (const d of DOORS) {
    if (d.level !== level) continue;
    const u = d.axis === "x" ? d.x : d.z, c = d.axis === "x" ? d.z : d.x;
    const a = roomById(d.a);
    const aSide = a ? ((d.axis === "x" ? a.z + a.d / 2 : a.x + a.w / 2) > c ? 1 : -1) : 1;
    const swings = d.type === "hinged" || d.type === "exterior" || d.type === "french";
    const depth = (side: number) => (d.type === "garage" ? (side === aSide ? 1.0 : 0) : swings && side === aSide ? 0.9 : 0.6);
    for (const side of [-1, 1]) {
      const near = c, far = c + side * depth(side);
      const [c0, c1] = [Math.min(near, far), Math.max(near, far)];
      const zone = d.axis === "x"
        ? { x0: u - d.width / 2, x1: u + d.width / 2, z0: c0, z1: c1 }
        : { x0: c0, x1: c1, z0: u - d.width / 2, z1: u + d.width / 2 };
      out.push({ door: d.id, zone });
    }
  }
  return out;
}

/** Stairs and the fireplace (with its hearth). */
const KEEP_CLEAR: Record<string, Footprint[]> = {
  main: [
    { x0: 25.6, x1: 26.9, z0: 0, z1: 3.5 }, // main stairs (bottom step at the front door end) + the wall under them
    { x0: 28.35, x1: 29.5, z0: 6.0, z1: 8.2 }, // fireplace + hearth
  ],
};

describe("furniture layout", () => {
  it("uses known kinds and rooms", () => {
    for (const p of FURNITURE) {
      expect(KINDS[p.kind], name(p)).toBeDefined();
      expect(roomById(p.room), name(p)).toBeDefined();
    }
  });

  it("keeps every piece inside its room, off the wall surfaces", () => {
    const bad: string[] = [];
    for (const p of FURNITURE) {
      const f = footprint(p);
      const eps = 0.002;
      const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2;
      if (f.z0 < wallFace(p.room, "n", mx) - eps || f.z1 > wallFace(p.room, "s", mx) + eps || f.x0 < wallFace(p.room, "w", mz) - eps || f.x1 > wallFace(p.room, "e", mz) + eps) bad.push(name(p));
    }
    expect(bad).toEqual([]);
  });

  it("leaves every doorway, the stairs and the fireplace clear", () => {
    const bad: string[] = [];
    for (const p of FURNITURE) {
      if (!isSolid(p)) continue;
      const level = levelOfRoom(p.room)!.id;
      const f = footprint(p, true);
      for (const { door, zone } of doorZones(level)) if (overlap(f, zone)) bad.push(`${name(p)} blocks ${door}`);
      for (const zone of KEEP_CLEAR[level] ?? []) if (overlap(f, zone)) bad.push(`${name(p)} blocks the stairs/fireplace`);
    }
    expect(bad).toEqual([]);
  });

  it("doesn't stack solid pieces into each other (chairs may tuck under tables)", () => {
    const solid = FURNITURE.filter(isSolid);
    const bad: string[] = [];
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i]!, b = solid[j]!;
        if (a.room !== b.room) continue;
        const tuck = kindOf(a).tuck || kindOf(b).tuck;
        if (overlap(footprint(a, true), footprint(b, true), tuck ? 0.12 : 0.01)) bad.push(`${name(a)} overlaps ${name(b)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("puts exactly 4 chairs round the Catan table", () => {
    expect(FURNITURE.filter((p) => p.room === "formal_dining" && p.kind === "chippendale_chair")).toHaveLength(4);
  });
});
