import { AnimationMixer, type AnimationClip, type Object3D, Vector3 } from "three";

// When each foot touches down during one loop of the walk or run clip (GAME_SPEC §10 footsteps),
// as fractions of the loop. Worked out once per clip by playing it on the bear and finding where
// each foot is lowest, so any walk (cartoon or realistic bear) gets its steps in time.

const cache = new WeakMap<AnimationClip, number[]>();
const SAMPLES = 64;

export function footfalls(root: Object3D, clip: AnimationClip): number[] {
  const known = cache.get(clip);
  if (known) return known;
  const feet: Object3D[] = [];
  root.traverse((o) => {
    if (/(^|[^a-z])(left|right)foot$/i.test(o.name)) feet.push(o);
  });
  let out = [0, 0.5];
  if (feet.length === 2) {
    const mixer = new AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.play();
    const low = feet.map(() => ({ y: Infinity, at: 0 }));
    const p = new Vector3();
    for (let i = 0; i < SAMPLES; i++) {
      mixer.setTime((i / SAMPLES) * clip.duration);
      root.updateMatrixWorld(true);
      feet.forEach((f, k) => {
        const y = f.getWorldPosition(p).y;
        if (y < low[k]!.y) low[k] = { y, at: i / SAMPLES };
      });
    }
    action.stop();
    mixer.uncacheRoot(root);
    out = low.map((l) => l.at).sort((a, b) => a - b);
  }
  cache.set(clip, out);
  return out;
}

/** True if the loop went from phase `a` to phase `b` (both 0…1, may wrap) past any of `marks`. */
export function crossed(a: number, b: number, marks: readonly number[]) {
  if (a === b) return false;
  return marks.some((m) => (a < b ? m > a && m <= b : m > a || m <= b));
}
