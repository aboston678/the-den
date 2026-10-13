import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { TOON } from "../artStyle.ts";
import { BearAnimator } from "./BearAnimator.ts";

/** The realistic bear, or the cartoon one with the cartoon art style (same skeleton names and clips). */
const BEAR_URL = TOON ? "/models/bear-toon.glb" : "/models/bear.glb";
useGLTF.preload(BEAR_URL);

/** A fresh copy of the animated bear (each player needs its own skeleton and animator). */
export function useBearModel() {
  const { scene, animations } = useGLTF(BEAR_URL);
  const model = useMemo(() => {
    const m = cloneSkinned(scene);
    m.traverse((o) => {
      o.castShadow = true;
      o.frustumCulled = false; // skinned bounds don't follow the animation
    });
    return m;
  }, [scene]);
  const animator = useMemo(() => new BearAnimator(model, animations), [model, animations]);
  return { model, animator };
}
