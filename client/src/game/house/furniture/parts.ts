import { type BufferGeometry, CircleGeometry, CylinderGeometry, Matrix4, SphereGeometry, TorusGeometry } from "three";
import { type GeoBuckets, add, quad } from "../geometry.ts";
import { atlasKey } from "./atlas.ts";

// Building blocks for code-built furniture (floorplan metres). A piece is built around its own
// origin (footprint centre, y = 0 at its bottom, front facing +z) into a Kit, which places every
// part into the house's material buckets with the piece's position and rotation. Plain colours
// (wood:#…, fabric:#…, metal:#…) all go onto a few shared colour-sheet materials (atlas.ts), so the
// furniture costs a handful of draw calls instead of one per colour.

type V3 = [number, number, number];
/** How a box face's texture is laid out: metres (tiling wood, fabric), stretched 0…1, or one fixed texel (palette colours). */
export type UV = "m" | "fit" | [number, number];

/** Material keys for a box's faces: one for all, or the front (+z) / top different. */
export type Faces = string | { all: string; front?: string; top?: string };

export class Kit {
  constructor(private out: GeoBuckets, private m: Matrix4) {}

  private put(key: string, g: BufferGeometry) {
    g.applyMatrix4(this.m);
    const shared = atlasKey(key);
    if (shared) pin(g, shared.uv);
    add(this.out, shared?.key ?? key, g);
  }

  /** An axis-aligned box between two corners. */
  box(min: V3, max: V3, faces: Faces, uv: UV = "m") {
    const k = typeof faces === "string" ? { all: faces } : faces;
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const map = (u: number, v: number, u0: number, u1: number, v0: number, v1: number): [number, number] =>
      uv === "m" ? [u, v] : uv === "fit" ? [(u - u0) / (u1 - u0 || 1), (v - v0) / (v1 - v0 || 1)] : uv;
    const face = (key: string, p: [V3, V3, V3, V3], f: (q: V3) => [number, number]) => this.put(key, quad(p, f));
    face(k.top ?? k.all, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], (q) => map(q[0], -q[2], x0, x1, -z1, -z0));
    face(k.all, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], (q) => map(q[0], q[2], x0, x1, z0, z1));
    face(k.front ?? k.all, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], (q) => map(q[0], q[1], x0, x1, y0, y1));
    face(k.all, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], (q) => map(-q[0], q[1], -x1, -x0, y0, y1));
    face(k.all, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], (q) => map(-q[2], q[1], -z1, -z0, y0, y1));
    face(k.all, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], (q) => map(q[2], q[1], z0, z1, y0, y1));
  }

  /** A box by centre and size. */
  block(c: V3, size: V3, faces: Faces, uv: UV = "m") {
    this.box([c[0] - size[0] / 2, c[1] - size[1] / 2, c[2] - size[2] / 2], [c[0] + size[0] / 2, c[1] + size[1] / 2, c[2] + size[2] / 2], faces, uv);
  }

  /** An upright cylinder (or cone) standing on y0. `uv` pins it to one palette colour. */
  cyl(x: number, y0: number, z: number, rBottom: number, rTop: number, h: number, key: string, seg = 12, uv?: [number, number]) {
    const g = new CylinderGeometry(rTop, rBottom, h, seg).toNonIndexed();
    g.translate(x, y0 + h / 2, z);
    this.put(key, pin(g, uv));
  }

  /** A cylinder lying along x (rods, rolls). */
  rodX(x0: number, x1: number, y: number, z: number, r: number, key: string, seg = 8) {
    const g = new CylinderGeometry(r, r, x1 - x0, seg).toNonIndexed();
    g.rotateZ(Math.PI / 2).translate((x0 + x1) / 2, y, z);
    this.put(key, g);
  }

  /** A cylinder lying along z (logs, rails). */
  rodZ(z0: number, z1: number, x: number, y: number, r: number, key: string, seg = 8) {
    const g = new CylinderGeometry(r, r, z1 - z0, seg).toNonIndexed();
    g.rotateX(Math.PI / 2).translate(x, y, (z0 + z1) / 2);
    this.put(key, g);
  }

  sphere(c: V3, r: number, key: string, scale: V3 = [1, 1, 1], seg = 10, uv?: [number, number]) {
    const g = new SphereGeometry(r, seg, Math.max(6, seg - 2)).toNonIndexed();
    g.scale(...scale).translate(...c);
    this.put(key, pin(g, uv));
  }

  /** A flat disc lying on the floor (round rugs), texture stretched across it. */
  disc(c: V3, r: number, key: string, seg = 48) {
    const g = new CircleGeometry(r, seg).toNonIndexed();
    g.rotateX(-Math.PI / 2).translate(...c);
    this.put(key, g);
  }

  /** A ring lying flat (round table edges, fan rims). */
  ring(c: V3, r: number, tube: number, key: string) {
    const g = new TorusGeometry(r, tube, 6, 24).toNonIndexed();
    g.rotateX(Math.PI / 2).translate(...c);
    this.put(key, g);
  }

  /** A flat quad facing +z (pictures, screens), texture stretched across it. */
  panel(c: V3, w: number, h: number, key: string) {
    const [x, y, z] = c;
    this.put(key, quad([[x - w / 2, y - h / 2, z], [x + w / 2, y - h / 2, z], [x + w / 2, y + h / 2, z], [x - w / 2, y + h / 2, z]], (q) => [(q[0] - x + w / 2) / w, (q[1] - y + h / 2) / h]));
  }

  /** A flat quad lying on the floor (rectangular rugs). */
  floorPanel(c: V3, w: number, d: number, key: string) {
    const [x, y, z] = c;
    this.put(key, quad([[x - w / 2, y, z + d / 2], [x + w / 2, y, z + d / 2], [x + w / 2, y, z - d / 2], [x - w / 2, y, z - d / 2]], (q) => [(q[0] - x + w / 2) / w, (z + d / 2 - q[2]) / d]));
  }

  /** A child kit, moved and turned (degrees about y) relative to this one. */
  at(x: number, y: number, z: number, rotDeg = 0): Kit {
    return new Kit(this.out, this.m.clone().multiply(new Matrix4().makeTranslation(x, y, z)).multiply(new Matrix4().makeRotationY((rotDeg * Math.PI) / 180)));
  }
}

/** Point every texture coordinate at one texel (palette colours). */
function pin(g: BufferGeometry, uv?: [number, number]) {
  if (!uv) return g;
  const a = g.getAttribute("uv");
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0], uv[1]);
  return g;
}

/** Four legs under a rectangle (tables, chairs, cabinets). */
export function legs(k: Kit, w: number, d: number, h: number, t: number, key: string, inset = 0.03, taper = 1) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - inset - t / 2), z = sz * (d / 2 - inset - t / 2);
      if (taper === 1) k.box([x - t / 2, 0, z - t / 2], [x + t / 2, h, z + t / 2], key);
      else k.cyl(x, 0, z, (t / 2) * taper, t / 2, h, key, 8);
    }
  }
}

/** A cheap random generator with a seed, so every load builds the same books and jars. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
