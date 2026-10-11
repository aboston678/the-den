import {
  APRON, DRIVEWAY, DRIVEWAY_WIDTH, type PathPoint, RETAINING_WALL, RETAINING_WALL_HEIGHT, STONE_WALLS, TRAIL, TRAIL_WIDTH, heightAt, noise2,
} from "@den/shared";
import { useRapier } from "@react-three/rapier";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, MeshStandardMaterial } from "three";
import { useOutdoorMaps } from "./textures.ts";

// Dry-stacked stone walls (GAME_SPEC §4): old field walls along the woodline and in the woods,
// and the retaining wall beside the driveway and apron. Each wall is a tapered, slightly uneven
// band of stone following the ground, with gaps where the driveway or trail crosses.

const TILE = 1.6; // metres per stone texture repeat

interface WallSpec {
  points: PathPoint[];
  /** Bottom and top heights at a point along the wall. */
  bottom: (x: number, z: number) => number;
  top: (x: number, z: number, i: number) => number;
  baseWidth: number;
  topWidth: number;
}

/** Split a wall into runs, leaving gaps where it would cross the driveway or the trail. */
function runs(points: PathPoint[]) {
  const out: PathPoint[][] = [];
  let run: PathPoint[] = [];
  for (const p of points) {
    const blocked = DRIVEWAY.closest(p.x, p.z, DRIVEWAY_WIDTH / 2 + 1.2) || TRAIL.closest(p.x, p.z, TRAIL_WIDTH / 2 + 1);
    if (blocked) {
      if (run.length > 1) out.push(run);
      run = [];
    } else run.push(p);
  }
  if (run.length > 1) out.push(run);
  return out;
}

/**
 * Wall mesh: three strips (one side, the top, the other side) with their own vertices, so the
 * edges between them stay crisp, plus end caps. Widths wobble a little so it reads as stacked stone.
 */
function wallGeometry(walls: WallSpec[]) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const strip = (rows: [number, number, number, number, number, number, number, number, number, number][]) => {
    // Each row: x0 y0 z0 x1 y1 z1 (the strip's two edges), u, v0, v1, unused.
    const base = pos.length / 3;
    rows.forEach(([x0, y0, z0, x1, y1, z1, u, v0, v1], i) => {
      pos.push(x0, y0, z0, x1, y1, z1);
      uv.push(u, v0, u, v1);
      if (i > 0) {
        const a = base + (i - 1) * 2, c = a + 2;
        idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    });
  };
  for (const w of walls) {
    for (const pts of runs(w.points)) {
      const sides: Parameters<typeof strip>[0][] = [[], [], []];
      const ends: number[][] = [];
      let s = 0;
      pts.forEach((p, i) => {
        const q = pts[Math.min(pts.length - 1, i + 1)]!, o = pts[Math.max(0, i - 1)]!;
        const len = Math.hypot(q.x - o.x, q.z - o.z) || 1;
        const nx = (q.z - o.z) / len, nz = -(q.x - o.x) / len; // sideways (left of travel)
        if (i > 0) s += Math.hypot(p.x - pts[i - 1]!.x, p.z - pts[i - 1]!.z);
        const y0 = w.bottom(p.x, p.z), y1 = w.top(p.x, p.z, i);
        const lump = 1 + 0.12 * noise2(p.x, p.z, 1.1, 70);
        const b = (w.baseWidth / 2) * lump, t = (w.topWidth / 2) * lump;
        const R0 = [p.x - nx * b, y0, p.z - nz * b], R1 = [p.x - nx * t, y1, p.z - nz * t];
        const L1 = [p.x + nx * t, y1, p.z + nz * t], L0 = [p.x + nx * b, y0, p.z + nz * b];
        const u = s / TILE;
        sides[0]!.push([...R0, ...R1, u, y0 / TILE, y1 / TILE, 0] as never);
        sides[1]!.push([...R1, ...L1, u, 0, (2 * t) / TILE, 0] as never);
        sides[2]!.push([...L1, ...L0, u, y1 / TILE, y0 / TILE, 0] as never);
        if (i === 0 || i === pts.length - 1) ends.push([...R0, ...R1, ...L1, ...L0]);
      });
      sides.forEach(strip);
      // End caps.
      ends.forEach((e, k) => {
        const base = pos.length / 3;
        pos.push(...e);
        uv.push(0, 0, 0, 1 / TILE, 0.5, 1 / TILE, 0.5, 0);
        if (k === 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      });
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const FIELD_WALLS: WallSpec[] = STONE_WALLS.map((points, k) => ({
  points,
  bottom: (x, z) => heightAt(x, z) - 0.25,
  top: (x, z) => heightAt(x, z) + 0.8 + 0.18 * noise2(x, z, 3, 40 + k) + 0.06 * noise2(x, z, 0.7, 50 + k),
  baseWidth: 1.0,
  topWidth: 0.6,
}));

const RETAINING: WallSpec = {
  points: RETAINING_WALL.points,
  bottom: () => APRON.y - 0.3,
  top: (x, z) => APRON.y + RETAINING_WALL_HEIGHT + 0.05 * noise2(x, z, 1.2, 60),
  baseWidth: 0.8,
  topWidth: 0.55,
};

/** Box colliders every ~2 m along the walls. */
function useWallColliders(walls: WallSpec[]) {
  const { world, rapier } = useRapier();
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    for (const w of walls) {
      for (const pts of runs(w.points)) {
        for (let i = 0; i < pts.length - 1; i += 4) {
          const a = pts[i]!, b = pts[Math.min(pts.length - 1, i + 4)]!;
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          if (len < 0.1) continue;
          const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
          const y0 = w.bottom(mx, mz), y1 = w.top(mx, mz, i);
          const angle = Math.atan2(b.x - a.x, b.z - a.z);
          const desc = rapier.ColliderDesc.cuboid(w.baseWidth / 2 - 0.1, (y1 - y0) / 2, len / 2 + 0.05)
            .setTranslation(mx, (y0 + y1) / 2, mz)
            .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });
          world.createCollider(desc, body);
        }
      }
    }
    return () => world.removeRigidBody(body);
  }, [world, rapier, walls]);
}

export function StoneWalls() {
  const maps = useOutdoorMaps("stone_wall");
  const material = useMemo(() => new MeshStandardMaterial({ ...maps, color: "#d2cbbf" }), [maps]);
  const walls = useMemo(() => [...FIELD_WALLS, RETAINING], []);
  const geometry = useMemo(() => wallGeometry(walls), [walls]);
  useWallColliders(walls);
  return <mesh geometry={geometry} material={material} castShadow receiveShadow name="stone-walls" />;
}
