import { type AnimationAction, type AnimationClip, AnimationMixer, LoopOnce, LoopRepeat, type Object3D } from "three";
import { CLIP, CROSSFADE, MOVE } from "../config.ts";
import type { BearAction } from "../state.ts";
import { locomotionWeights } from "./movement.ts";

const LOOPING = ["Idle", "Walk", "Run", "Dance"] as const;
const ONE_SHOT = ["Jump", "Roar"] as const;
type ClipName = (typeof LOOPING)[number] | (typeof ONE_SHOT)[number];

/**
 * Blends the bear's clips: idle/walk/run by speed (each sped up or slowed down to match the
 * ground speed so feet don't slide), with jump, roar and dance faded in on top.
 * Weights move toward their targets over CROSSFADE seconds.
 */
export class BearAnimator {
  readonly mixer: AnimationMixer;
  private actions = new Map<ClipName, AnimationAction>();
  private weights = new Map<ClipName, number>();
  private current: BearAction = "locomotion";

  constructor(root: Object3D, clips: AnimationClip[]) {
    this.mixer = new AnimationMixer(root);
    for (const name of [...LOOPING, ...ONE_SHOT]) {
      const clip = clips.find((c) => c.name === name);
      if (!clip) throw new Error(`bear.glb is missing the ${name} clip`);
      const action = this.mixer.clipAction(clip);
      if ((ONE_SHOT as readonly string[]).includes(name)) {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(LoopRepeat, Infinity);
        action.play();
      }
      action.setEffectiveWeight(name === "Idle" ? 1 : 0);
      this.actions.set(name, action);
      this.weights.set(name, name === "Idle" ? 1 : 0);
    }
  }

  /** Start an action (call once when it begins). `airTime` is the expected jump duration. */
  start(action: BearAction, airTime = 0) {
    this.current = action;
    if (action === "jump") {
      const jump = this.actions.get("Jump")!;
      jump.reset().play();
      jump.time = CLIP.jumpTakeoff - 0.08; // skip the long wind-up: physics takes off right away
      jump.timeScale = (CLIP.jumpLand - CLIP.jumpTakeoff) / Math.max(0.2, airTime);
    } else if (action === "fall") {
      const jump = this.actions.get("Jump")!;
      jump.reset().play();
      jump.time = (CLIP.jumpTakeoff + CLIP.jumpLand) / 2;
      jump.timeScale = 0; // hold the mid-air pose
    } else if (action === "roar") {
      this.actions.get("Roar")!.reset().play();
    } else if (action === "dance") {
      this.actions.get("Dance")!.reset().play();
    }
  }

  get action() {
    return this.current;
  }

  /** True once the roar has played to its end. */
  get roarFinished() {
    const roar = this.actions.get("Roar")!;
    return roar.time >= roar.getClip().duration - 0.05;
  }

  update(dt: number, speed: number) {
    const target: Record<ClipName, number> = { Idle: 0, Walk: 0, Run: 0, Dance: 0, Jump: 0, Roar: 0 };
    if (this.current === "locomotion") {
      const loco = locomotionWeights(speed, MOVE.walkSpeed, MOVE.sprintSpeed);
      target.Idle = loco.idle;
      target.Walk = loco.walk;
      target.Run = loco.run;
    } else if (this.current === "jump" || this.current === "fall") target.Jump = 1;
    else if (this.current === "roar") target.Roar = 1;
    else if (this.current === "dance") target.Dance = 1;

    // Match leg speed to ground speed (never slower than the clip's own pace).
    this.actions.get("Walk")!.timeScale = Math.max(1, speed / CLIP.walkNaturalSpeed);
    this.actions.get("Run")!.timeScale = Math.max(0.6, speed / CLIP.runNaturalSpeed);

    const step = dt / CROSSFADE;
    for (const [name, action] of this.actions) {
      const w = this.weights.get(name)!;
      const next = w + Math.max(-step, Math.min(step, target[name] - w));
      this.weights.set(name, next);
      action.setEffectiveWeight(next);
    }
    this.mixer.update(dt);
  }
}
