// Downloads the public-domain (US National Park Service) and CC0 (OpenGameArt) recordings used for
// the ambience and roar (milestone 1.10) into assets/audio/src/ (gitignored: re-run to get them
// back). Also Kenney's CC0 sound packs (Phase 5: footsteps, doors, UI, cards), unzipped into
// assets/audio/src/kenney/<pack>/. Logged in docs/ASSETS.md. Usage: node tools/fetch-audio.mjs
import { access, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const NPS = "https://www.nps.gov/nps-audiovideo/legacy/mp3";
export const SOURCES = {
  "loon.mp3": `${NPS}/imr/avElement/yell-YELLCOLO20160913T18ms.mp3`, // Yellowstone: common loon
  "dawn-chorus.mp3": `${NPS}/imr/avElement/yell-YELLDawnChorus.mp3`, // Yellowstone: dawn chorus
  "hermit-thrush.mp3": `${NPS}/nri/avElement/nri-HermitThrushYOSE.mp3`, // NPS sound gallery
  "flicker.mp3": `${NPS}/nri/avElement/nri-NorthernFlickerYOSE.mp3`, // NPS sound gallery: northern flicker (woodpecker)
  "crickets.mp3": `${NPS}/nri/avElement/nri-Cricket.mp3`, // NPS sound gallery
  "treefrogs.mp3": `${NPS}/nri/avElement/nri-GreenTreeFrogEvergladesNP.mp3`, // NPS sound gallery: green tree frogs
  "grizzly-a.mp3": `${NPS}/imr/avElement/yell-YELLgrizzlyA20160624SM3031431.mp3`, // Yellowstone: grizzly
  "grizzly-b.mp3": `${NPS}/imr/avElement/yell-YELLgrizzlyB20160624SM3031431.mp3`, // Yellowstone: grizzly
  "birds-and-wind.ogg": "https://opengameart.org/sites/default/files/Birds%20and%20Wind%20-%20Ambient_1.ogg", // Spring Spring, CC0
  "river.mp3": "https://opengameart.org/sites/default/files/VistulaShort_0.mp3", // RandomMind, CC0
};
const KENNEY = "https://kenney.nl/media/pages/assets";
const PACKS = {
  "kenney_impact-sounds": `${KENNEY}/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip`,
  "kenney_rpg-audio": `${KENNEY}/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip`,
  "kenney_interface-sounds": `${KENNEY}/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip`,
  "kenney_casino-audio": `${KENNEY}/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip`,
};
const OUT = "assets/audio/src";
const exists = (p) => access(p).then(() => true, () => false);

await mkdir(OUT, { recursive: true });
for (const [name, url] of Object.entries(SOURCES)) {
  const path = join(OUT, name);
  if (await exists(path)) continue;
  const res = await fetch(url, { headers: { "User-Agent": "the-den-asset-fetch/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  console.log("  saved", path);
}

for (const [name, url] of Object.entries(PACKS)) {
  const dir = join(OUT, "kenney", name);
  if (await exists(dir)) continue;
  const res = await fetch(url, { headers: { "User-Agent": "the-den-asset-fetch/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(dir, { recursive: true });
  const zip = `${dir}.zip`;
  await writeFile(zip, Buffer.from(await res.arrayBuffer()));
  execFileSync("unzip", ["-q", "-o", zip, "-d", dir]);
  console.log("  saved", dir);
}
