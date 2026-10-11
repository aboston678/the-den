// Print the bear's width (x) and depth (z) at a few heights, to compare body shapes.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const pos = prim.getAttribute("POSITION");
  const p = [0, 0, 0];
  const rows = [];
  for (const h of [0.6, 0.9, 1.1, 1.3, 1.5]) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, p);
      // ignore the arms: only vertices within 0.42 m of the middle
      if (Math.abs(p[1] - h) > 0.03 || Math.abs(p[0]) > 0.42) continue;
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
    }
    rows.push(`${h} m: ${(maxX - minX).toFixed(2)} wide, ${(maxZ - minZ).toFixed(2)} deep`);
  }
  console.log(file.split("/").pop(), "\n  " + rows.join("\n  "));
}
