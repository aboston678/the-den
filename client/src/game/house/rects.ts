// Axis-aligned rectangles in floorplan metres (x west→east, z north→south).

export interface Box2 {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export const box = (x: number, z: number, w: number, d: number): Box2 => ({ x0: x, z0: z, x1: x + w, z1: z + d });
export const area = (b: Box2) => (b.x1 - b.x0) * (b.z1 - b.z0);

export function intersect(a: Box2, b: Box2): Box2 | null {
  const r = { x0: Math.max(a.x0, b.x0), z0: Math.max(a.z0, b.z0), x1: Math.min(a.x1, b.x1), z1: Math.min(a.z1, b.z1) };
  return r.x1 - r.x0 > 1e-6 && r.z1 - r.z0 > 1e-6 ? r : null;
}

/** a minus b, as up to four rectangles. */
export function subtract(a: Box2, b: Box2): Box2[] {
  const i = intersect(a, b);
  if (!i) return [a];
  const out: Box2[] = [];
  if (i.z0 > a.z0) out.push({ ...a, z1: i.z0 });
  if (i.z1 < a.z1) out.push({ ...a, z0: i.z1 });
  if (i.x0 > a.x0) out.push({ x0: a.x0, x1: i.x0, z0: i.z0, z1: i.z1 });
  if (i.x1 < a.x1) out.push({ x0: i.x1, x1: a.x1, z0: i.z0, z1: i.z1 });
  return out;
}

/** a minus every hole. */
export const subtractAll = (a: Box2, holes: Box2[]) => holes.reduce<Box2[]>((parts, h) => parts.flatMap((p) => subtract(p, h)), [a]);

export const contains = (b: Box2, x: number, z: number, eps = 0) => x >= b.x0 - eps && x <= b.x1 + eps && z >= b.z0 - eps && z <= b.z1 + eps;
