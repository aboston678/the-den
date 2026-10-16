import { type AnimationAction, type AnimationClip, AnimationMixer, LoopOnce, LoopRepeat, type Object3D, Quaternion, type QuaternionKeyframeTrack } from "three";
import { CLIP, CROSSFADE, MOVE } from "../config.ts";
import type { BearAction } from "../state.ts";
import { crossed, footfalls } from "./footfalls.ts";
import { locomotionWeights } from "./movement.ts";

const LOOPING = ["Idle", "Walk", "Run", "Dance", "Reel", "CrouchWalk"] as const;
const ONE_SHOT = ["Jump", "Roar", "Cast", "Celebrate", "Bowl", "SitDown", "StandUp"] as const;
/** The cast clip's long wind-up is skipped and the throw sped up (GAME_SPEC §13: casting should feel snappy). */
export const CAST = { from: 1.4, speed: 1.3, release: 2.6 } as const;
/** Seconds from starting a cast to the lure leaving the rod. */
export const CAST_RELEASE_S = (CAST.release - CAST.from) / CAST.speed;
/**
 * The bowl: only the crouch-and-release part of Crouch_Charge_and_Throw (both arms sweep forward low;
 * the rest of the clip is an overhead throw), sped up a little.
 */
export const BOWL = { from: 3.4, to: 5.05, speed: 1.15, release: 4.75 } as const;
/** Seconds from starting the bowl to the ball leaving the paw. */
export const BOWL_RELEASE_S = (BOWL.release - BOWL.from) / BOWL.speed;
/**
 * Sitting at the Catan table: just the lowering part of Stand_to_Sit, then hold its last pose.
 * (The Chair_Sit_Idle loop leans the cartoon bear's big tummy right over the board.)
 */
export const SIT = { from: 1.6, to: 4.5, speed: 1.5 } as const;
/** Getting up: just the rising part of Sit_to_Stand. */
export const STAND = { from: 1.2, to: 3.9, speed: 1.45 } as const;
type ClipName = (typeof LOOPING)[number] | (typeof ONE_SHOT)[number];

/**
 * The crouch walk (Cautious_Crouch_Walk) hunches the back ~60° and reaches the arms forward, which on a
 * round bear tips him nearly flat. Ease the back, head and arms partway back toward his standing pose.
 */
const CROUCH_EASE: Record<string, number> = { Spine: 0.55, Spine01: 0.55, Spine02: 0.55, neck: 0.35, Head: 0.15, LeftArm: 0.6, RightArm: 0.6, LeftForeArm: 0.4, RightForeArm: 0.4 };

function easeCrouch(crouch: AnimationClip, idle: AnimationClip) {
  const out = crouch.clone();
  const a = new Quaternion(), b = new Quaternion();
  for (const track of out.tracks) {
    const [bone, prop] = track.name.split(".");
    const k = CROUCH_EASE[bone!];
    if (!k || prop !== "quaternion") continue;
    const rest = idle.tracks.find((t) => t.name === track.name) as QuaternionKeyframeTrack | undefined;
    if (!rest) continue;
    b.fromArray(rest.values, 0);
    const v = track.values;
    for (let i = 0; i < v.length; i += 4) a.fromArray(v, i).slerp(b, k).toArray(v, i);
  }
  return out;
}

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
  /** Footfall phases of the walk and run loops, and where each loop was last frame. */
  private steps: { Walk: number[]; Run: number[] };
  private lastPhase = { Walk: 0, Run: 0 };
  /** Sounds the bear made this frame (footsteps, landing): read and cleared by whoever plays them. */
  readonly events: { step: "walk" | "run" | null; land: boolean } = { step: null, land: false };

  constructor(root: Object3D, clips: AnimationClip[]) {
    this.mixer = new AnimationMixer(root);
    for (const name of [...LOOPING, ...ONE_SHOT]) {
      let clip = clips.find((c) => c.name === name);
      if (!clip) throw new Error(`bear.glb is missing the ${name} clip`);
      if (name === "CrouchWalk") clip = easeCrouch(clip, clips.find((c) => c.name === "Idle")!);
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
    this.steps = { Walk: footfalls(root, this.actions.get("Walk")!.getClip()), Run: footfalls(root, this.actions.get("Run")!.getClip()) };
    this.mixer.update(0); // back to this bear's own pose after measuring
  }

  /** Start an action (call once when it begins). `airTime` is the expected jump duration. */
  start(action: BearAction, airTime = 0) {
    if ((this.current === "jump" || this.current === "fall") && action === "locomotion") this.events.land = true;
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
    } else if (action === "cast") {
      const cast = this.actions.get("Cast")!;
      cast.reset().play();
      cast.time = CAST.from;
      cast.timeScale = CAST.speed;
    } else if (action === "reel") {
      this.actions.get("Reel")!.reset().play();
    } else if (action === "celebrate") {
      this.actions.get("Celebrate")!.reset().play();
    } else if (action === "bowl") {
      const bowl = this.actions.get("Bowl")!;
      bowl.reset().play();
      bowl.time = BOWL.from;
      bowl.timeScale = BOWL.speed;
    } else if (action === "sit") {
      const sit = this.actions.get("SitDown")!;
      sit.reset().play();
      sit.time = SIT.from;
      sit.timeScale = SIT.speed;
    } else if (action === "stand") {
      const stand = this.actions.get("StandUp")!;
      stand.reset().play();
      stand.time = STAND.from;
      stand.timeScale = STAND.speed;
    }
  }

  /** True once a one-shot has played to its end (the bowl, sit and stand stop early). */
  finished(name: "Cast" | "Celebrate" | "Bowl" | "SitDown" | "StandUp") {
    const a = this.actions.get(name)!;
    const end = name === "Bowl" ? BOWL.to : name === "SitDown" ? SIT.to : name === "StandUp" ? STAND.to : a.getClip().duration - 0.05;
    return a.time >= end;
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
    const target: Record<ClipName, number> = {
      Idle: 0, Walk: 0, Run: 0, Dance: 0, Jump: 0, Roar: 0, Reel: 0, Cast: 0, Celebrate: 0, Bowl: 0, SitDown: 0, StandUp: 0, CrouchWalk: 0,
    };
    if (this.current === "locomotion") {
      const loco = locomotionWeights(speed, MOVE.walkSpeed, MOVE.sprintSpeed);
      target.Idle = loco.idle;
      target.Walk = loco.walk;
      target.Run = loco.run;
    } else if (this.current === "jump" || this.current === "fall") target.Jump = 1;
    else if (this.current === "roar") target.Roar = 1;
    else if (this.current === "dance") target.Dance = 1;
    else if (this.current === "cast") target.Cast = 1;
    else if (this.current === "reel") target.Reel = 1;
    else if (this.current === "celebrate") target.Celebrate = 1;
    else if (this.current === "bowl") target.Bowl = 1;
    else if (this.current === "sit") {
      // Lower into the chair, then stay put in the seated pose.
      target.SitDown = 1;
      const sit = this.actions.get("SitDown")!;
      if (sit.time >= SIT.to) {
        sit.time = SIT.to;
        sit.timeScale = 0;
      }
    } else if (this.current === "stand") target.StandUp = 1;
    else if (this.current === "crouch") target.CrouchWalk = 1; // stood still, it holds its pose

    // Crouched, the sneak plays as fast as the bear is going (frozen mid-step when it stops).
    this.actions.get("CrouchWalk")!.timeScale = speed / CLIP.crouchNaturalSpeed;

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

    // A footstep each time the leading walk or run loop passes a footfall.
    const walk = this.weights.get("Walk")!, run = this.weights.get("Run")!;
    for (const name of ["Walk", "Run"] as const) {
      const a = this.actions.get(name)!;
      const phase = (a.time % a.getClip().duration) / a.getClip().duration;
      const lead = name === "Walk" ? walk >= run : run > walk;
      if (this.current === "locomotion" && lead && Math.max(walk, run) > 0.3 && crossed(this.lastPhase[name], phase, this.steps[name])) {
        this.events.step = name === "Walk" ? "walk" : "run";
      }
      this.lastPhase[name] = phase;
    }
  }
}
