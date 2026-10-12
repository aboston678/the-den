// Remove a walk clip's own forward travel ("root motion"), keeping the stride and sway.
// The game moves the bear itself; left in, the bear would glide forward and snap back each loop.
import { Matrix4, Vector3 } from "three";
import { localMatricesAt, worldMatrices } from "./gltf-anim.mjs";

export function removeDrift(doc, clipName, rootName = "Hips") {
  const root = doc.getRoot();
  const anim = root.listAnimations().find((a) => a.getName() === clipName);
  const hips = root.listNodes().find((n) => n.getName() === rootName);
  const channel = anim.listChannels().find((c) => c.getTargetNode() === hips && c.getTargetPath() === "translation");
  const sampler = channel.getSampler();
  const times = sampler.getInput().getArray();
  const hipsAt = (t) => new Vector3().setFromMatrixPosition(worldMatrices(doc, localMatricesAt(doc, anim, t)).get(hips));
  const t0 = times[0], t1 = times[times.length - 1];
  const travel = hipsAt(t1).sub(hipsAt(t0)).setY(0); // horizontal travel over the whole clip (world)
  // Hips translation lives in its parent's space: turn world offsets into that space (rotation + scale only).
  const parentWorld = worldMatrices(doc, localMatricesAt(doc, anim, t0)).get(hips.getParentNode());
  const toParent = new Matrix4().copy(parentWorld).setPosition(0, 0, 0).invert();
  const out = sampler.getOutput().getArray().slice();
  times.forEach((t, i) => {
    const d = travel.clone().multiplyScalar((t - t0) / (t1 - t0)).applyMatrix4(toParent);
    out[i * 3] -= d.x;
    out[i * 3 + 1] -= d.y;
    out[i * 3 + 2] -= d.z;
  });
  sampler.getOutput().setArray(out);
  return { metres: travel.length(), speed: travel.length() / (t1 - t0) };
}
