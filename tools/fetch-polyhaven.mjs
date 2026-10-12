// Downloads the CC0 Poly Haven textures and models used by the outdoor map (milestone 1.8)
// into assets/polyhaven/ (gitignored: re-run this to get them back). Logged in docs/ASSETS.md.
// Usage: node tools/fetch-polyhaven.mjs
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";

export const TEXTURES = [
  "leafy_grass", "forrest_ground_01", "forest_leaves_02", "asphalt_02",
  "river_small_rocks", "stacked_stone_wall", "weathered_planks", "brown_mud_leaves_01",
  // The house (milestone 1.9).
  "wood_floor", "terracotta_floor_tiles", "garage_floor", "grey_roof_01", "red_brick", "coated_pine",
];
export const MODELS = [
  "fern_02", "boulder_01", "rock_moss_set_01", "rock_moss_set_02", "dead_tree_trunk", "tree_stump_01", "shrub_02", "shrub_04",
];
const MAPS = { Diffuse: "diff", nor_gl: "nor_gl", Rough: "rough" };
const OUT = "assets/polyhaven";
const HEADERS = { "User-Agent": "the-den-asset-fetch/1.0" };

const json = async (url) => (await fetch(url, { headers: HEADERS })).json();
const exists = (p) => access(p).then(() => true, () => false);

async function save(url, path) {
  if (await exists(path)) return;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  console.log("  saved", path);
}

for (const id of TEXTURES) {
  const files = await json(`https://api.polyhaven.com/files/${id}`);
  for (const [map, short] of Object.entries(MAPS)) {
    const f = files[map]["1k"].jpg;
    await save(f.url, join(OUT, "textures", id, `${short}.jpg`));
  }
}
for (const id of MODELS) {
  const g = (await json(`https://api.polyhaven.com/files/${id}`)).gltf["1k"].gltf;
  const dir = join(OUT, "models", id);
  await save(g.url, join(dir, `${id}.gltf`));
  for (const [rel, f] of Object.entries(g.include ?? {})) await save(f.url, join(dir, rel));
}
console.log("done");
