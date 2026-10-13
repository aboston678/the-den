import { CanvasTexture, Color, type Material, MeshStandardMaterial, NearestFilter, SRGBColorSpace } from "three";

// Shared colour sheets for code-built furniture. Every plain colour a piece asks for ("wood:#c79a5c",
// "fabric:#e2d8c4", "metal:#c9ccce", "brass", …) gets one texel on the sheet of its finish (matte,
// glossy, metal or glowing), and the part's texture coordinates point at that texel. Four materials
// cover all of it, which keeps the house's draw calls inside the GAME_SPEC §17 budget.

type Finish = "matte" | "gloss" | "metal" | "glow";
const FINISH: Record<string, Finish> = { wood: "matte", fabric: "matte", paint: "matte", plastic: "gloss", leather: "gloss", metal: "metal", glow: "glow" };
/** Width of each sheet; colours beyond this would wrap (we use far fewer). */
const SIZE = 128;
const sheets: Record<Finish, string[]> = { matte: [], gloss: [], metal: [], glow: [] };

/** The shared material key and texel for a furniture colour key, or null for keys that keep their own material. */
export function atlasKey(key: string): { key: string; uv: [number, number] } | null {
  let [kind, color] = key.split(":") as [string, string | undefined];
  if (key === "brass") (kind = "metal"), (color = "#c8a24a");
  const finish = FINISH[kind];
  if (!finish || !color?.startsWith("#")) return null;
  const list = sheets[finish];
  let i = list.indexOf(color);
  if (i < 0) i = list.push(color) - 1;
  return { key: `atlas:${finish}`, uv: [(i + 0.5) / SIZE, 0.5] };
}

/** The material for one sheet (called by HouseMaterials once the house is built, so every colour is known). */
export function atlasMaterial(finish: string): Material {
  const list = sheets[finish as Finish] ?? [];
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = 1;
  const ctx = c.getContext("2d")!;
  list.forEach((col, i) => {
    ctx.fillStyle = new Color(col).getStyle();
    ctx.fillRect(i, 0, 1, 1);
  });
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  map.magFilter = map.minFilter = NearestFilter;
  map.generateMipmaps = false;
  switch (finish) {
    case "gloss": return new MeshStandardMaterial({ map, roughness: 0.42 });
    case "metal": return new MeshStandardMaterial({ map, roughness: 0.32, metalness: 0.85 });
    case "glow": return new MeshStandardMaterial({ map, emissiveMap: map, emissive: "#ffffff", emissiveIntensity: 0.9, roughness: 0.8 });
    default: return new MeshStandardMaterial({ map, roughness: 0.85 });
  }
}
