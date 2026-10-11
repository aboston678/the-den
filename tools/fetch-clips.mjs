// Download every clip in assets/models/bear/clips/manifest.json that isn't on disk yet,
// and strip it to skeleton + animation (see strip-clip.mjs).
// Usage: node tools/fetch-clips.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = "assets/models/bear/clips";
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
for (const [name, clip] of Object.entries(manifest.clips)) {
  const out = join(dir, clip.file);
  if (existsSync(out) || !clip.url) continue;
  const res = await fetch(clip.url);
  if (!res.ok) throw new Error(`${name}: download failed (${res.status})`);
  const full = join(tmpdir(), `den-clip-${clip.file}`);
  writeFileSync(full, Buffer.from(await res.arrayBuffer()));
  execFileSync("node", ["tools/strip-clip.mjs", full, out], { stdio: "ignore" });
  console.log(`${name}: ${out}`);
}
