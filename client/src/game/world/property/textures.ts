import { useLoader } from "@react-three/fiber";
import {
  DataArrayTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Texture, TextureLoader,
} from "three";
import { TOON } from "../../artStyle.ts";

// CC0 ground and material textures (docs/ASSETS.md), built by tools/build-outdoor-textures.mjs.
// The cartoon art style swaps in painted colour maps for the lawn, forest floor and road
// (tools/build-toon-textures.mjs); their bump and roughness maps stay the same.
const DIR = "/textures/outdoor";
const PAINTED = new Set(["lawn", "forest", "forest_edge", "asphalt"]);
const diffUrl = (name: string) => `${DIR}/${TOON && PAINTED.has(name) ? "toon_" : ""}${name}_diff.webp`;
export type OutdoorTexture = "lawn" | "forest" | "forest_edge" | "mud" | "streambed" | "asphalt" | "stone_wall" | "planks"
  | "oak_floor" | "terracotta" | "concrete" | "knotty_pine" | "shingles" | "brick";

/** Colour, normal and roughness maps for one material, tiled every `tile` metres of UV. */
export function useOutdoorMaps(name: OutdoorTexture) {
  const [map, normalMap, roughnessMap] = useLoader(TextureLoader, [diffUrl(name), `${DIR}/${name}_nor.webp`, `${DIR}/${name}_rough.webp`]);
  for (const t of [map!, normalMap!, roughnessMap!]) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
  }
  map!.colorSpace = SRGBColorSpace;
  return { map: map!, normalMap: normalMap!, roughnessMap: roughnessMap! };
}

const SIZE = 1024;

/**
 * Stack several textures into two texture arrays for the terrain shader:
 *   colour (RGB) + roughness (A), and normal (RGB).
 * One sampler per array keeps the terrain well under the GPU's texture-unit limit.
 */
export function buildLayerArrays(layers: { diff: Texture; nor: Texture; rough: Texture }[]) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const read = (t: Texture) => {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(t.image as CanvasImageSource, 0, 0, SIZE, SIZE);
    return ctx.getImageData(0, 0, SIZE, SIZE).data;
  };
  const layerBytes = SIZE * SIZE * 4;
  const colour = new Uint8Array(layerBytes * layers.length);
  const normal = new Uint8Array(layerBytes * layers.length);
  layers.forEach((l, i) => {
    const d = read(l.diff);
    const r = read(l.rough);
    for (let p = 0; p < SIZE * SIZE; p++) d[p * 4 + 3] = r[p * 4]!; // roughness into alpha
    colour.set(d, i * layerBytes);
    normal.set(read(l.nor), i * layerBytes);
  });
  const make = (data: Uint8Array, srgb: boolean) => {
    const t = new DataArrayTexture(data, SIZE, SIZE, layers.length);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.minFilter = LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { colour: make(colour, true), normal: make(normal, false) };
}

/** The raw (non-tiled) image textures for the terrain layers, loaded together. */
export function useLayerImages(names: OutdoorTexture[]) {
  const urls = names.flatMap((n) => [diffUrl(n), `${DIR}/${n}_nor.webp`, `${DIR}/${n}_rough.webp`]);
  const all = useLoader(TextureLoader, urls);
  return names.map((_, i) => ({ diff: all[i * 3]!, nor: all[i * 3 + 1]!, rough: all[i * 3 + 2]! }));
}
