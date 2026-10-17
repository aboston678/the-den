import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { Box3, Group, type Object3D, PositionalAudio, Quaternion, Vector3 } from "three";
import { asset } from "../../asset.ts";
import { autoGear, bikeRevs } from "@den/shared";
import { getListener, loadSound, toBus } from "../audio/audio.ts";
import { revsToRpm } from "./engineSynth.ts";
import engineWorkletUrl from "./engineWorklet.ts?worker&url";
import { aim, reachTo } from "../player/reach.ts";

// A bear riding the motorcycle (Andrew, 2026-10-16), ours or anyone else's: the bike under the bear,
// the bear raised onto the seat in the held sitting pose, leaning forward with both paws on the
// grips, the whole thing leaning into turns and tipping with the slope, and the engine note rising
// with speed.

export const BIKE_URL = asset("/models/bike.glb");

/** Where the bear goes on the bike (bike metres: +z forward, y up, centred on its footprint). Tuned by eye. */
// Round 4's bike (tools/build-bike.mjs): seat ~0.97 m up at z −0.4, tank top ~1.2 m at z 0.13, grips ~1.08 m at z 0.39.
// `side` puts the bear back over the bike's middle: the sitting pose shifts its hips ~14 cm to its left (Andrew's screenshot).
export const SEAT = { lift: 0.6, back: 0.34, side: -0.14 } as const;
/** Where the rear tyre touches the ground (bike metres): a wheelie pivots about it. */
const REAR_CONTACT_Z = -0.815;
/** The handlebar grips (bike metres). */
const GRIP = { x: 0.32, y: 1.08, z: 0.39 } as const;
/** The foot pegs (bike metres): the feet go here, knees forward and out round the tank (round 4: the legs used to hang through the bodywork). */
const PEG = { x: 0.22, y: 0.45, z: -0.2 } as const;
/** How far the back bends forward into a racing tuck, and the neck back up so the bear looks ahead (radians). */
const HUNCH = { Spine: 0.32, Spine01: 0.42, Spine02: 0.3, neck: -0.65 } as const;

export interface Rider {
  bike: Object3D;
  /** The engine (engineSynth.ts on the audio thread), heard from the bike. */
  engine: { audio: PositionalAudio; node: AudioWorkletNode } | null;
  loading: boolean;
  /** The gear last frame, to hear each shift. */
  heardGear: number;
  /** Other bears' bikes: speed last frame and a guess at their throttle (speeding up = on it). */
  lastSpeed: number;
  throttle: number;
  /** 0…1: on the bike (eases in and out for the arms). */
  k: number;
  /** Other bears' bikes: the gear an automatic box would be in, for the engine note. */
  gear: number;
  /** How many turns the front wheel has rolled (tests check the wheels spin). */
  wheelTurns: number;
}

/** The bike model, a fresh copy for each use. */
export function useBikeCopy() {
  const { scene } = useGLTF(BIKE_URL);
  return useMemo(() => {
    const src = scene.getObjectByName("motorcycle") ?? scene;
    // The GLB stores compressed (quantized) positions with a scale + offset on the node: keep it, inside a plain group we can move.
    scene.updateMatrixWorld(true);
    const inner = src.clone(true);
    src.matrixWorld.decompose(inner.position, inner.quaternion, inner.scale);
    inner.traverse((o) => {
      o.castShadow = true;
    });
    const bike = new Group();
    bike.name = "motorcycle";
    bike.add(inner);
    bike.userData.wheels = wheelPivots(bike);
    return bike;
  }, [scene]);
}

/** A wheel that spins (round 4): a pivot at its axle holding the wheel, and the tyre's radius. */
interface Wheel { pivot: Group; radius: number; angle: number }

/**
 * The wheels are their own parts in the model (tools/build-bike.mjs). Their nodes carry the file's
 * compression offsets, so each is moved under a fresh pivot at the middle of the wheel, which turns about x.
 */
function wheelPivots(bike: Group): Wheel[] {
  bike.updateMatrixWorld(true);
  const out: Wheel[] = [];
  for (const name of ["wheel_front", "wheel_rear"]) {
    const wheel = bike.getObjectByName(name);
    if (!wheel) continue;
    const box = new Box3().setFromObject(wheel);
    const pivot = new Group();
    pivot.name = `${name}_pivot`;
    box.getCenter(pivot.position);
    bike.add(pivot);
    pivot.updateMatrixWorld(true);
    pivot.attach(wheel);
    out.push({ pivot, radius: (box.max.y - box.min.y) / 2, angle: 0 });
  }
  return out;
}

/** Roll the bike's wheels along by `speed` (m/s) for `dt` seconds. Returns how far the front one turned (radians). */
function spinWheels(bike: Object3D, speed: number, dt: number) {
  let turned = 0;
  for (const [i, w] of ((bike.userData.wheels ?? []) as Wheel[]).entries()) {
    const d = (speed * dt) / Math.max(0.1, w.radius);
    w.angle = (w.angle + d) % (Math.PI * 2);
    w.pivot.rotation.x = w.angle;
    if (i === 0) turned = d;
  }
  return turned;
}

/** Set up a bear's ride: the bike (hidden until they're riding) in its turning group. */
export function useRider(visual: React.RefObject<Group | null>): Rider {
  const bike = useBikeCopy();
  const rider = useMemo<Rider>(() => ({ bike, engine: null, loading: false, heardGear: 1, lastSpeed: 0, throttle: 0, k: 0, gear: 1, wheelTurns: 0 }), [bike]);
  useEffect(() => {
    const g = visual.current;
    if (!g) return;
    g.rotation.order = "YXZ"; // turn, then tip with the slope, then lean
    bike.visible = false;
    g.add(bike);
    return () => {
      g.remove(bike);
      if (rider.engine) {
        rider.engine.audio.parent?.remove(rider.engine.audio);
        rider.engine.audio.disconnect();
        rider.engine.node.port.close();
      }
    };
  }, [bike, visual, rider]);
  return rider;
}

const v = { a: new Vector3(), b: new Vector3(), up: new Vector3(0, 1, 0), left: new Vector3(), fwd: new Vector3() };
const q = { a: new Quaternion(), w: new Quaternion(), p: new Quaternion() };
const bones = new WeakMap<Object3D, Record<string, Object3D | undefined>>();
/** Per bone: its rotation from the animation, and what we last turned it to. */
const posed = new WeakMap<Object3D, { base: Quaternion; ours: Quaternion }>();
const RIDE_BONES = ["LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand", "Spine", "Spine01", "Spine02", "neck",
  "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"];

/**
 * Put the bones we bend back to the animation's pose. The riding pose is a frozen clip, and three.js
 * stops rewriting bones whose value hasn't changed, so without this our bend from last frame stays and
 * the next one is added on top: the bear's upper body spun round and round (Andrew's video, round 3).
 */
function restorePose(b: Record<string, Object3D | undefined>) {
  for (const bone of Object.values(b)) {
    if (!bone) continue;
    const p = posed.get(bone);
    if (!p) posed.set(bone, { base: bone.quaternion.clone(), ours: new Quaternion(2, 2, 2, 2) });
    else if (bone.quaternion.equals(p.ours)) bone.quaternion.copy(p.base); // the animation left our bend in place
    else p.base.copy(bone.quaternion); // the animation wrote a fresh pose this frame
  }
}

/** Remember what we turned the bones to, so next frame can tell whether the animation rewrote them. */
function notePose(b: Record<string, Object3D | undefined>) {
  for (const bone of Object.values(b)) if (bone) posed.get(bone)?.ours.copy(bone.quaternion);
}

/**
 * Call after the bear's animation has updated this frame. `lean` (radians, + = to the bear's right)
 * and `pitch` (+ = nose down) tip the bear and bike together. For our own bike, `revs` (0…1), `gear`
 * and `throttle` (0…1) drive the engine; other bears' bikes follow `speed` through an automatic box.
 * `wheelie` (radians) lifts the front, bear and bike together, pivoting on the rear tyre.
 */
export function applyRide(r: Rider, model: Object3D, visual: Group, riding: boolean, speed: number, lean: number, pitch: number, dt: number,
  { revs, gear, throttle, wheelie = 0 }: { revs?: number; gear?: number; throttle?: number; wheelie?: number } = {}) {
  r.k = Math.max(0, Math.min(1, r.k + (riding ? dt : -dt) * 5));
  r.bike.visible = riding;
  if (riding) r.wheelTurns += spinWheels(r.bike, speed, dt) / (Math.PI * 2);
  model.position.set(riding ? SEAT.side : 0, riding ? SEAT.lift : 0, riding ? SEAT.back : 0);
  r.bike.position.set(0, 0, 0);
  // The wheelie: turn the bike and bear nose-up about the rear tyre's contact point.
  const w = riding ? wheelie : 0;
  for (const o of [r.bike, model]) {
    const dz = o.position.z - REAR_CONTACT_Z, dy = o.position.y;
    o.rotation.x = -w;
    o.position.y = dy * Math.cos(w) + dz * Math.sin(w);
    o.position.z = REAR_CONTACT_Z + dz * Math.cos(w) - dy * Math.sin(w);
  }
  visual.rotation.x = riding ? pitch : 0;
  visual.rotation.z = riding ? lean : 0;
  if (!riding) r.gear = 1;
  else if (gear !== undefined) r.gear = gear;
  else r.gear = autoGear(speed, r.gear);
  if (throttle === undefined) {
    // Someone else's bike: on the throttle while it's speeding up.
    const accel = (speed - r.lastSpeed) / Math.max(dt, 1e-3);
    r.throttle += ((accel > 0.6 ? 1 : 0) - r.throttle) * Math.min(1, dt * 8);
  }
  r.lastSpeed = speed;
  engine(r, riding, revs ?? bikeRevs(speed, r.gear), throttle ?? r.throttle);
  let b = bones.get(model);
  if (!b) {
    b = Object.fromEntries(RIDE_BONES.map((n) => [n, model.getObjectByName(n)]));
    bones.set(model, b);
  }
  restorePose(b);
  if (r.k <= 0) return notePose(b);

  visual.updateWorldMatrix(true, true);
  // Bend forward over the tank, about the bear's own left-right axis.
  visual.getWorldQuaternion(q.p);
  v.left.set(1, 0, 0).applyQuaternion(q.p);
  for (const [name, angle] of Object.entries(HUNCH)) {
    const bone = b[name];
    if (!bone) continue;
    q.a.setFromAxisAngle(v.left, angle * r.k);
    bone.getWorldQuaternion(q.w);
    bone.parent!.getWorldQuaternion(q.p);
    bone.quaternion.copy(q.p.invert().multiply(q.a.multiply(q.w)));
    bone.updateMatrixWorld(true);
  }
  // Feet on the pegs, knees forward and out so the thighs hug the tank.
  for (const [side, sx] of [["Left", 1], ["Right", -1]] as const) {
    const thigh = b[`${side}UpLeg`], shin = b[`${side}Leg`], foot = b[`${side}Foot`];
    if (!thigh || !shin || !foot) continue;
    const peg = r.bike.localToWorld(v.a.set(PEG.x * sx, PEG.y, PEG.z));
    const knee = v.b.set(sx * 0.7, 0.1, 1).applyQuaternion(visual.getWorldQuaternion(q.p));
    reachTo(thigh, shin, foot, peg, knee, r.k);
    // Soles on the pegs: toes forward and a little down, not dangling to the ground.
    const toe = b[`${side}ToeBase`];
    if (toe) {
      const at = toe.getWorldPosition(new Vector3()), len = foot.getWorldPosition(v.b).distanceTo(at);
      aim(foot, at, r.bike.localToWorld(v.a.set(PEG.x * sx * 1.05, PEG.y - len * 0.35, PEG.z + len * 0.94)), r.k);
    }
  }
  // Paws on the grips, elbows out and down.
  for (const [side, sx] of [["Left", 1], ["Right", -1]] as const) {
    const upper = b[`${side}Arm`], fore = b[`${side}ForeArm`], hand = b[`${side}Hand`];
    if (!upper || !fore || !hand) continue;
    const grip = r.bike.localToWorld(v.a.set(GRIP.x * sx, GRIP.y, GRIP.z));
    const hint = v.b.set(sx * 0.8, -0.6, -0.2).applyQuaternion(visual.getWorldQuaternion(q.p));
    reachTo(upper, fore, hand, grip, hint, r.k);
  }
  notePose(b);
}

/** How the engine is heard: loud (Andrew, 2026-10-17), carrying across the property. */
const ENGINE = { refDistance: 10, rolloff: 0.9, volume: 1.5 } as const;

let worklet: Promise<void> | null = null;
let engineSeed = 1;

/** Start a bike's engine: the engine module on the audio thread, fed Andrew's idle recording. */
async function startEngine(r: Rider) {
  const ctx = getListener().context;
  worklet ??= ctx.audioWorklet.addModule(engineWorkletUrl);
  const [, idle] = await Promise.all([worklet, loadSound("bike-idle")]);
  const node = new AudioWorkletNode(ctx, "den-engine", { numberOfInputs: 0, outputChannelCount: [1], processorOptions: { seed: engineSeed++ } });
  node.port.postMessage({ idle: idle.getChannelData(0).slice(), rate: idle.sampleRate });
  const audio = new PositionalAudio(getListener());
  audio.setNodeSource(node as unknown as AudioScheduledSourceNode);
  toBus(audio, "effects");
  audio.setRefDistance(ENGINE.refDistance);
  audio.setRolloffFactor(ENGINE.rolloff);
  audio.setVolume(ENGINE.volume);
  r.bike.add(audio);
  r.engine = { audio, node };
}

/**
 * The engine (engineSynth.ts): one continuous note gliding with the revs, louder and brighter on the
 * throttle, with a cut and pop on each upshift and a blip and crackle on each downshift.
 */
function engine(r: Rider, riding: boolean, revs: number, throttle: number) {
  if (riding && !r.engine && !r.loading && getListener().context.state === "running") {
    r.loading = true;
    void startEngine(r).catch(() => {}).finally(() => {
      r.loading = false;
    });
  }
  const e = r.engine;
  if (e && riding && r.gear !== r.heardGear) e.node.port.postMessage({ shift: Math.sign(r.gear - r.heardGear) });
  r.heardGear = riding ? r.gear : 1;
  if (!e) return;
  const p = e.node.parameters;
  p.get("on")!.value = riding ? 1 : 0;
  p.get("rpm")!.value = revsToRpm(revs);
  p.get("throttle")!.value = throttle;
}

useGLTF.preload(BIKE_URL);
