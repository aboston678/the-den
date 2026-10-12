import { BufferGeometry, Float32BufferAttribute } from "three";

// Small geometry builders with texture coordinates in metres (so tiled floor/wall textures keep
// their real size), and merging everything per material.

type V3 = [number, number, number];

/** A flat quad from four corners (counter-clockwise seen from the front), UVs from `uv(point)`. */
export function quad(p: [V3, V3, V3, V3], uv: (p: V3) => [number, number]): BufferGeometry {
  const [a, b, c, d] = p;
  const pos = [...a, ...b, ...c, ...a, ...c, ...d];
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
  const len = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
  const nrm = Array.from({ length: 6 }, () => [n[0]! / len, n[1]! / len, n[2]! / len]).flat();
  const uvs = [a, b, c, a, c, d].flatMap((q) => uv(q));
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  return g;
}

const xz = (p: V3): [number, number] => [p[0], p[2]];

/**
 * Faces of an axis-aligned box, sorted into material keys: top, bottom and sides.
 * UVs are world metres (top/bottom use x/z, sides use the horizontal run and height).
 */
export function boxFaces(min: V3, max: V3, keys: { top: string; bottom?: string; sides?: string }, out: GeoBuckets) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  add(out, keys.top, quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], xz));
  if (keys.bottom) add(out, keys.bottom, quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], xz));
  const side = keys.sides ?? keys.bottom;
  if (!side) return;
  add(out, side, quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], (p) => [p[0], p[1]])); // +z
  add(out, side, quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], (p) => [p[0], p[1]])); // -z
  add(out, side, quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], (p) => [p[2], p[1]])); // +x
  add(out, side, quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], (p) => [p[2], p[1]])); // -x
}

/** Geometries waiting to be merged, by material key. */
export type GeoBuckets = Map<string, BufferGeometry[]>;
export const add = (out: GeoBuckets, key: string, g: BufferGeometry) => out.set(key, [...(out.get(key) ?? []), g]);

/** Merge a bucket of non-indexed geometries (position, normal, uv) into one. */
export function mergeBucket(list: BufferGeometry[]): BufferGeometry {
  let count = 0;
  for (const g of list) count += g.getAttribute("position").count;
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of list) {
    const n = g.getAttribute("position").count;
    pos.set(g.getAttribute("position").array as Float32Array, o * 3);
    nrm.set(g.getAttribute("normal").array as Float32Array, o * 3);
    const u = g.getAttribute("uv");
    if (u) uv.set(u.array as Float32Array, o * 2);
    o += n;
    g.dispose();
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

/** An axis-aligned box for collisions, in floorplan metres. */
export interface SolidBox {
  min: V3;
  max: V3;
  /** A tilted box instead: centre, half sizes and a rotation about the x or z axis (roof slopes). */
  tilted?: { centre: V3; half: V3; axis: "x" | "z"; angle: number };
}
