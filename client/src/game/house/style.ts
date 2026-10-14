import {
  CanvasTexture, Color, DoubleSide, type Material, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Texture, Vector2,
} from "three";
import type { useOutdoorMaps } from "../world/property/textures.ts";
import { atlasMaterial } from "./furniture/atlas.ts";
import { furnitureTexture } from "./furniture/textures.ts";

// What each room looks like (GAME_SPEC §8.2, the photos named in docs/floorplan.json): floor, walls,
// ceiling. Furniture (2.1/2.2) uses the same materials so it merges into the same meshes.

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
  bowling_lounge: { floor: "carpet", floorColor: "#b49c7a", wall: "#efe9dc" },
  bowling_alley: { floor: "carpet", floorColor: "#b49c7a", wall: "#efe9dc" },
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

/** Bowling-lane boards: narrow honey-orange maple strips running along the lane (x), with a little grain. */
function laneBoards() {
  return canvasTexture(512, (ctx, s) => {
    const boards = 20, bw = s / boards;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let b = 0; b < boards; b++) {
      const l = 58 + rnd() * 9;
      ctx.fillStyle = `hsl(${24 + rnd() * 6}, ${62 + rnd() * 10}%, ${l}%)`;
      ctx.fillRect(0, b * bw, s, bw);
      ctx.strokeStyle = "rgba(90,40,10,0.08)";
      for (let g = 0; g < 4; g++) {
        const y = b * bw + rnd() * bw;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(s * 0.3, y + (rnd() - 0.5) * 3, s * 0.7, y + (rnd() - 0.5) * 3, s, y);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(70,30,10,0.35)"; // the seam between boards
      ctx.fillRect(0, b * bw, s, 1);
    }
  }, true);
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
      // Bowling lanes: the oak boards, lighter and polished (reference/bowling/alley-inspiration.jpg).
      case "lane": {
        const map = laneBoards();
        map.repeat.set(1 / 1.2, 1 / 0.54); // 1.2 m of grain, 20 boards (27 mm each) per tile
        return new MeshStandardMaterial({ map, roughness: 0.32, envMapIntensity: 0.1 }); // underground: no blue sky in the polish
      }
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
      // Furniture (milestone 2.1): wood grain, upholstery, leather, metal, lamp glow and generated pictures.
      case "wood": {
        // The exact colour asked for, with the oak's grain as surface relief only (a tinted oak map came out too dark and red).
        const t = (tex: Texture) => {
          const c = tex.clone();
          c.repeat.set(1 / 1.2, 1 / 1.2);
          c.needsUpdate = true;
          return c;
        };
        return new MeshStandardMaterial({ color: arg, roughness: 0.55, normalMap: t(this.tex.oak.normalMap), normalScale: new Vector2(0.6, 0.6) });
      }
      case "fabric": {
        const m = new MeshStandardMaterial({ color: arg, roughness: 0.95, map: this.carpet.clone() });
        m.map!.repeat.set(3, 3);
        return m;
      }
      case "leather": return new MeshStandardMaterial({ color: arg, roughness: 0.42, map: this.speckle });
      case "metal": return new MeshStandardMaterial({ color: arg, roughness: 0.32, metalness: 0.85 });
      case "plastic": return new MeshStandardMaterial({ color: arg, roughness: 0.45 });
      case "glow": return new MeshStandardMaterial({ color: arg, emissive: arg, emissiveIntensity: 0.9, roughness: 0.8 });
      case "tex": {
        const fabricLike = arg?.startsWith("fabric_") || arg?.startsWith("braided") || arg?.startsWith("round") || arg?.startsWith("oriental");
        const cutout = arg?.startsWith("braided") || arg?.startsWith("round"); // oval and round rugs: transparent corners
        return new MeshStandardMaterial({ map: furnitureTexture(arg ?? "palette"), roughness: fabricLike ? 0.95 : arg === "palette" ? 0.6 : 0.8, alphaTest: cutout ? 0.5 : 0 });
      }
      case "atlas": return atlasMaterial(arg ?? "matte");
      case "screen": return new MeshStandardMaterial({ color: "#0b0d10", roughness: 0.15, metalness: 0.4 });
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
