import { BOUNDS, CORRIDOR_HALF, DRIVEWAY, TRACK_AREA, TRACK_ROAD, type Path } from "@den/shared";

// Where the invisible walls go for the way out to the racetrack (Andrew, 2026-10-16): along both
// sides of the road (the driveway past the old map edge, then the track road), stopping exactly at
// the property's edge and at the track's fence, which get a gap where the road goes through.

const inProperty = (x: number, z: number) => x > BOUNDS.minX && x < BOUNDS.maxX && z > BOUNDS.minZ && z < BOUNDS.maxZ;
/** The fence line round the track grounds (2 m inside their edge). */
export const FENCE = { minX: TRACK_AREA.minX + 2, maxX: TRACK_AREA.maxX - 2, minZ: TRACK_AREA.minZ + 2, maxZ: TRACK_AREA.maxZ - 2 } as const;
const inFence = (x: number, z: number) => x > FENCE.minX && x < FENCE.maxX && z > FENCE.minZ && z < FENCE.maxZ;

/** Where a road's walkable strip crosses a vertical (x = const) line: the gap to leave in a wall there. */
function gapOnX(path: Path, x: number, lo: number, hi: number) {
  let from = Infinity, to = -Infinity;
  for (let z = lo; z <= hi; z += 0.25) {
    if (path.closest(x, z, CORRIDOR_HALF)) {
      from = Math.min(from, z);
      to = Math.max(to, z);
    }
  }
  return { from: from - 0.3, to: to + 0.3 };
}

/** The gap in the property's west wall where the driveway leaves it. */
export const PROPERTY_GAP = gapOnX(DRIVEWAY, BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxZ);
/** The gate in the track fence's east side where the road comes in. */
export const GATE = gapOnX(TRACK_ROAD, FENCE.maxX, FENCE.minZ, FENCE.maxZ);

/** Wall pieces (x0, z0, x1, z1) along both sides of the way out. */
export function corridorWalls(): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const along = (path: Path, other: Path, s0: number, s1: number) => {
    for (const side of [-1, 1]) {
      let run: { x: number; z: number }[] = [];
      const flush = () => {
        for (let i = 0; i + 1 < run.length; i += 4) {
          const a = run[i]!, b = run[Math.min(run.length - 1, i + 4)]!;
          out.push([a.x, a.z, b.x, b.z]);
        }
        run = [];
      };
      for (let s = s0; s <= s1; s += 0.5) {
        const p = path.pointAt(s);
        const x = p.x + p.dz * CORRIDOR_HALF * side, z = p.z - p.dx * CORRIDOR_HALF * side;
        // Not inside the property or the track grounds (they have their own walls), nor across the other road's strip.
        const open = inProperty(x, z) || inFence(x, z) || !!other.closest(x, z, CORRIDOR_HALF - 0.2);
        if (open) flush();
        else run.push({ x, z });
      }
      flush();
    }
  };
  along(DRIVEWAY, TRACK_ROAD, 0, 120);
  along(TRACK_ROAD, DRIVEWAY, 0, TRACK_ROAD.length);
  return out;
}
