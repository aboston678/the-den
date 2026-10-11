// Shrink a Higgsfield clip GLB to just its skeleton + animation (drops the duplicate mesh and
// textures, ~17 MB -> well under 1 MB). retarget-clip.mjs only needs the skin and the clip.
// Usage: node tools/strip-clip.mjs in.glb out.glb
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";

const [input, output] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
for (const node of root.listNodes()) node.setMesh(null); // skins stay on their nodes
// Remove everything no longer used; keepLeaves so end bones like head_end survive.
await doc.transform(prune({ keepLeaves: true }));
await io.write(output, doc);
