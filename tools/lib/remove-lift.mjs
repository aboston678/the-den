// Remove the "whole body leaves the ground" part of a jump clip, keeping crouch and leg tuck.
// The game's physics lifts the bear instead, so leaving it in would double the jump height.
import { Vector3 } from "three";
import { clipTimes, localMatricesAt, worldMatrices } from "./gltf-anim.mjs";

export function removeLift(doc, clipName, rootName = "Hips", footNames = ["LeftToeBase", "RightToeBase"]) {
  const root = doc.getRoot();
  const anim = root.listAnimations().find((a) => a.getName() === clipName);
  const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const hips = nodes.get(rootName);
  const channel = anim.listChannels().find((c) => c.getTargetNode() === hips && c.getTargetPath() === "translation");
  const sampler = channel.getSampler();
  const times = sampler.getInput().getArray();
  const lowest = (t) => {
    const world = worldMatrices(doc, localMatricesAt(doc, anim, t));
    return Math.min(...footNames.map((n) => new Vector3().setFromMatrixPosition(world.get(nodes.get(n))).y));
  };
  const ground = Math.min(...clipTimes(anim).map(lowest));
  // Hips translation is in its parent's space; find metres-per-unit from the parent's world scale.
  const parentScale = new Vector3().setFromMatrixScale(worldMatrices(doc, localMatricesAt(doc, null, 0)).get(hips.getParentNode())).y;
  const out = sampler.getOutput().getArray().slice();
  let maxLift = 0;
  times.forEach((t, i) => {
    const lift = Math.max(0, lowest(t) - ground - 0.02); // 2 cm tolerance for normal foot motion
    maxLift = Math.max(maxLift, lift);
    out[i * 3 + 1] -= lift / parentScale;
  });
  sampler.getOutput().setArray(out);
  return maxLift;
}
