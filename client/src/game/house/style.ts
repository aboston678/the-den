import {
  CanvasTexture, Color, DoubleSide, type Material, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Texture, Vector2,
} from "three";
import type { useOutdoorMaps } from "../world/property/textures.ts";

// What each room looks like (GAME_SPEC §8.2, the photos named in docs/floorplan.json): floor, walls,
// ceiling. Furniture comes in milestone 2.1/2.2.

export type FloorKind = "oak" | "terracotta" | "concrete" | "tile" | "carpet" | "pine";
export interface RoomStyle {
  floor: FloorKind;
  /** Carpet or tile colour. */
  floorColor?: string;
  wall: string;
  /** Speckled plaster / wallpaper look. */
  speckled?: boolean;
  ceiling?: "white" | "pine";
  beams?: boolean;
}

const CREAM = "#ece5d6";
export const ROOM_STYLES: Record<string, RoomStyle> = {
  // basement
  den: { floor: "carpet", floorColor: "#c7b99f", wall: "#ece2c9", beams: true },
  utility: { floor: "concrete", wall: "#cfcfca" },
  stair_landing: { floor: "carpet", floorColor: "#b9ad97", wall: CREAM },
  bowling_lounge: { floor: "carpet", floorColor: "#5e3134", wall: "#d9cfbd" },
  bowling_alley: { floor: "oak", wall: "#3d424c" },
  // main floor
  garage: { floor: "concrete", wall: "#e6e4dd" },
  mudroom: { floor: "terracotta", wall: "#e3d6bf", speckled: true, ceiling: "pine", beams: true },
  half_bath: { floor: "tile", floorColor: "#ddd6c8", wall: "#e8e1d0" },
  kitchen: { floor: "terracotta", wall: "#ddd0b8", speckled: true, ceiling: "pine", beams: true },
  pantry: { floor: "terracotta", wall: "#e8e0cc" },
  dining_hall: { floor: "oak", wall: "#d9cbb0", speckled: true },
  common_area: { floor: "carpet", floorColor: "#d4c8b2", wall: "#d8a3a5" },
  great_room: { floor: "carpet", floorColor: "#d8d0c0", wall: CREAM },
  office: { floor: "carpet", floorColor: "#6a2a30", wall: "#2c3550" },
  foyer: { floor: "oak", wall: CREAM },
  formal_dining: { floor: "oak", wall: "#c9b28e" },
  bedroom_main: { floor: "carpet", floorColor: "#7d8b97", wall: "#8e9cab" },
  // upstairs
  landing: { floor: "carpet", floorColor: "#cdc2ad", wall: CREAM },
  balcony_hall: { floor: "carpet", floorColor: "#cdc2ad", wall: CREAM },
  bathroom_up: { floor: "tile", floorColor: "#e9e7e1", wall: "#f1efe9", speckled: true },
  bedroom_skylight: { floor: "carpet", floorColor: "#c9bda6", wall: "#e2b27a" },
  bedroom_pink: { floor: "carpet", floorColor: "#4f8a95", wall: "#e3b3bd" },
  bedroom_yellow: { floor: "carpet", floorColor: "#cbbd9f", wall: "#efe1a6" },
  great_room_void: { floor: "carpet", wall: CREAM },
  attic_west: { floor: "pine", wall: "#9c8461" },
};
export const styleOf = (room: string): RoomStyle => ROOM_STYLES[room] ?? { floor: "oak", wall: CREAM };

// --- generated textures ---

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, srgb = false) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

/** Soft grey noise (for carpet pile and speckled plaster). */
function noiseTexture(size: number, contrast: number) {
  return canvasTexture(size, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let i = 0; i < s * s; i++) {
      const v = 255 - Math.random() * contrast;
      img.data.set([v, v, v, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }, true);
}

/** Normal map for horizontal lap siding: each board's lower edge sticks out a little. */
function clapboardNormals(boards = 8) {
  return canvasTexture(256, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const h = s / boards;
    for (let y = 0; y < s; y++) {
      const t = (y % h) / h; // 0 at a board's top, 1 at its bottom edge
      const slope = t > 0.9 ? -0.9 : 0.12; // gentle tilt, then the shadowed lip
      const ny = slope, nz = 1;
      const len = Math.hypot(ny, nz);
      for (let x = 0; x < s; x++) img.data.set([128, 128 + (ny / len) * 127, 128 + (nz / len) * 127, 255], (y * s + x) * 4);
    }
    ctx.putImageData(img, 0, 0);
  });
}

// --- materials ---

export type Maps = ReturnType<typeof useOutdoorMaps>;
export interface HouseTextures {
  oak: Maps;
  terracotta: Maps;
  concrete: Maps;
  pine: Maps;
  shingles: Maps;
  brick: Maps;
  planks: Maps;
}

/** All the house's materials, made once and shared (so meshes can be merged per material). */
export class HouseMaterials {
  private cache = new Map<string, Material>();
  private carpet = noiseTexture(128, 40);
  private speckle = noiseTexture(256, 26);
  private clapNormals = clapboardNormals();

  constructor(private tex: HouseTextures) {}

  get(key: string): Material {
    let m = this.cache.get(key);
    if (!m) {
      m = this.make(key);
      m.name = key;
      this.cache.set(key, m);
    }
    return m;
  }

  private tiled(maps: Maps, repeat: number, color = "#ffffff") {
    const clone = (t: Texture) => {
      const c = t.clone();
      c.repeat.set(repeat, repeat);
      c.needsUpdate = true;
      return c;
    };
    return new MeshStandardMaterial({ map: clone(maps.map), normalMap: clone(maps.normalMap), roughnessMap: clone(maps.roughnessMap), color });
  }

  private make(key: string): Material {
    const [kind, arg] = key.split(":") as [string, string | undefined];
    switch (kind) {
      // Floors (UVs are in metres).
      case "oak": return this.tiled(this.tex.oak, 1 / 2.2, "#e8c99a");
      case "terracotta": return this.tiled(this.tex.terracotta, 1 / 2, "#e7a27c");
      case "concrete": return this.tiled(this.tex.concrete, 1 / 3, "#c9c6bf");
      case "pine": return this.tiled(this.tex.pine, 1 / 2.4, "#f0c48c");
      case "tile": return new MeshStandardMaterial({ color: arg, roughness: 0.35, map: this.speckle, normalScale: new Vector2(0.3, 0.3) });
      case "carpet": {
        const m = new MeshStandardMaterial({ color: arg, roughness: 1, map: this.carpet });
        m.map = this.carpet.clone();
        m.map.repeat.set(4, 4);
        return m;
      }
      // Walls and ceilings.
      case "paint": return new MeshStandardMaterial({ color: arg, roughness: 0.92 });
      case "speckled": {
        const m = new MeshStandardMaterial({ color: arg, roughness: 0.95, map: this.speckle.clone() });
        m.map!.repeat.set(0.7, 0.7);
        return m;
      }
      case "ceiling": return new MeshStandardMaterial({ color: "#f3f0e8", roughness: 0.95 });
      case "trim": return new MeshStandardMaterial({ color: "#f6f4ee", roughness: 0.55 });
      case "oak_trim": return new MeshStandardMaterial({ ...this.tex.oak, color: "#d9ad6e", roughness: 0.5 });
      // Outside.
      case "clapboard": {
        const n = this.clapNormals.clone();
        n.repeat.set(1, 1 / (8 * 0.13)); // 13 cm boards
        return new MeshStandardMaterial({ color: "#f2f1ec", roughness: 0.7, normalMap: n, normalScale: new Vector2(0.9, 0.9) });
      }
      case "foundation": return this.tiled(this.tex.concrete, 1 / 2.5, "#b4b1aa");
      case "shingles": return this.tiled(this.tex.shingles, 1 / 2.2, "#8d9094");
      case "brick": return this.tiled(this.tex.brick, 1 / 1.6, "#d8a491");
      case "deck": return this.tiled(this.tex.planks, 1 / 2, "#c4beb4");
      case "porch_floor": return this.tiled(this.tex.planks, 1 / 2, "#a5a8a6");
      case "glass": return new MeshStandardMaterial({
        color: "#a9bcc4", roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.22, envMapIntensity: 1.6, side: DoubleSide, depthWrite: false,
      });
      // Warm light behind the windows at night; Lights.tsx fades its opacity with the time of day.
      case "window_glow": return new MeshBasicMaterial({ color: "#f2b866", transparent: true, opacity: 0, depthWrite: false });
      case "dark_glass": return new MeshStandardMaterial({ color: "#20262a", roughness: 0.08, metalness: 0.3, envMapIntensity: 1.4 });
      case "shutter": return new MeshStandardMaterial({ color: "#1d2228", roughness: 0.6 });
      case "frame": return new MeshStandardMaterial({ color: "#f4f3ef", roughness: 0.4, metalness: 0.2 });
      case "attic": return new MeshStandardMaterial({ color: "#8c7556", roughness: 1 });
      case "brass": return new MeshStandardMaterial({ color: "#c8a24a", roughness: 0.3, metalness: 0.9 });
      default: return new MeshStandardMaterial({ color: new Color(arg ?? "#ff00ff") });
    }
  }
}

/** Material key for a room's walls. */
export const wallKey = (room: string | null) => {
  if (!room) return "clapboard";
  const s = styleOf(room);
  return `${s.speckled ? "speckled" : "paint"}:${s.wall}`;
};
/** Material key for a room's floor. */
export const floorKey = (room: string) => {
  const s = styleOf(room);
  return s.floor === "carpet" || s.floor === "tile" ? `${s.floor}:${s.floorColor ?? "#cfc5b0"}` : s.floor;
};
