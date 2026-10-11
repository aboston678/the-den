// A smooth path through control points (the driveway, the trail, stone walls), sampled
// about every metre, with fast "how far am I from it, and where along it" queries.

export interface PathPoint {
  x: number;
  z: number;
}

export interface PathHit {
  /** Distance from the path's centre line, metres. */
  dist: number;
  /** Metres along the path to the closest point. */
  s: number;
  /** Closest point on the centre line. */
  x: number;
  z: number;
}

const CHUNK = 16; // segments per bounding box

export class Path {
  readonly points: PathPoint[] = [];
  /** Metres along the path at each point. */
  readonly at: number[] = [];
  readonly length: number;
  private boxes: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];

  /** Catmull-Rom curve through `control`, sampled roughly every `step` metres. */
  constructor(control: PathPoint[], step = 1) {
    for (let i = 0; i < control.length - 1; i++) {
      const p0 = control[Math.max(0, i - 1)]!, p1 = control[i]!, p2 = control[i + 1]!, p3 = control[Math.min(control.length - 1, i + 2)]!;
      const n = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const cr = (a: number, b: number, c: number, d: number) =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        this.points.push({ x: cr(p0.x, p1.x, p2.x, p3.x), z: cr(p0.z, p1.z, p2.z, p3.z) });
      }
    }
    this.points.push({ ...control[control.length - 1]! });
    let s = 0;
    this.at.push(0);
    for (let i = 1; i < this.points.length; i++) {
      s += Math.hypot(this.points[i]!.x - this.points[i - 1]!.x, this.points[i]!.z - this.points[i - 1]!.z);
      this.at.push(s);
    }
    this.length = s;
    for (let i = 0; i < this.points.length - 1; i += CHUNK) {
      const seg = this.points.slice(i, Math.min(this.points.length, i + CHUNK + 1));
      this.boxes.push({
        minX: Math.min(...seg.map((p) => p.x)), maxX: Math.max(...seg.map((p) => p.x)),
        minZ: Math.min(...seg.map((p) => p.z)), maxZ: Math.max(...seg.map((p) => p.z)),
      });
    }
  }

  /** Closest point on the path, or null if it's further than `maxDist` away. */
  closest(x: number, z: number, maxDist = Infinity): PathHit | null {
    let best: PathHit | null = null;
    for (let b = 0; b < this.boxes.length; b++) {
      const box = this.boxes[b]!;
      const reach = Math.min(maxDist, best?.dist ?? Infinity);
      if (x < box.minX - reach || x > box.maxX + reach || z < box.minZ - reach || z > box.maxZ + reach) continue;
      const end = Math.min(this.points.length - 1, (b + 1) * CHUNK);
      for (let i = b * CHUNK; i < end; i++) {
        const a = this.points[i]!, c = this.points[i + 1]!;
        const dx = c.x - a.x, dz = c.z - a.z;
        const len2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
        const px = a.x + dx * t, pz = a.z + dz * t;
        const dist = Math.hypot(x - px, z - pz);
        if (dist <= maxDist && (!best || dist < best.dist)) {
          best = { dist, s: this.at[i]! + t * (this.at[i + 1]! - this.at[i]!), x: px, z: pz };
        }
      }
    }
    return best;
  }

  /** Point and unit direction at `s` metres along the path. */
  pointAt(s: number) {
    const clamped = Math.max(0, Math.min(this.length, s));
    let i = 0;
    while (i < this.at.length - 2 && this.at[i + 1]! < clamped) i++;
    const a = this.points[i]!, b = this.points[i + 1]!;
    const segLen = this.at[i + 1]! - this.at[i]! || 1;
    const t = (clamped - this.at[i]!) / segLen;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / segLen, dz: (b.z - a.z) / segLen };
  }
}
