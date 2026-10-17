import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { Group, type Object3D, PositionalAudio, Quaternion, Vector3 } from "three";
import { asset } from "../../asset.ts";
import { BIKE } from "@den/shared";
import { getListener, loadSound, toBus } from "../audio/audio.ts";
import { reachTo } from "../player/reach.ts";

// A bear riding the motorcycle (Andrew, 2026-10-16), ours or anyone else's: the bike under the bear,
// the bear raised onto the seat in the held sitting pose, leaning forward with both paws on the
// grips, the whole thing leaning into turns and tipping with the slope, and the engine note rising
// with speed.

export const BIKE_URL = asset("/models/bike.glb");

/** Where the bear goes on the bike (bike metres: +z forward, y up, centred on its footprint). Tuned by eye. */
export const SEAT = { lift: 0.44, back: 0.26 } as const; // the realistic bear (round 3)
/** The handlebar grips (bike metres). */
const GRIP = { x: 0.3, y: 1.12, z: 0.5 } as const;
/** How far the back and neck bend forward over the tank (radians). */
const HUNCH = { Spine01: 0.22, Spine02: 0.12, neck: -0.18 } as const;

export interface Rider {
  bike: Object3D;
  sound: PositionalAudio | null;
  loading: boolean;
  /** 0…1: on the bike (eases in and out for the arms). */
  k: number;
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
    return bike;
  }, [scene]);
}

/** Set up a bear's ride: the bike (hidden until they're riding) in its turning group. */
export function useRider(visual: React.RefObject<Group | null>): Rider {
  const bike = useBikeCopy();
  const rider = useMemo<Rider>(() => ({ bike, sound: null, loading: false, k: 0 }), [bike]);
  useEffect(() => {
    const g = visual.current;
    if (!g) return;
    g.rotation.order = "YXZ"; // turn, then tip with the slope, then lean
    bike.visible = false;
    g.add(bike);
    return () => {
      g.remove(bike);
      if (rider.sound) {
        if (rider.sound.isPlaying) rider.sound.stop();
        rider.sound.parent?.remove(rider.sound);
        rider.sound.disconnect();
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
const RIDE_BONES = ["LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand", "Spine01", "Spine02", "neck"];

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
 * and `pitch` (+ = nose down) tip the bear and bike together; `speed` sets the engine note.
 */
export function applyRide(r: Rider, model: Object3D, visual: Group, riding: boolean, speed: number, lean: number, pitch: number, dt: number) {
  r.k = Math.max(0, Math.min(1, r.k + (riding ? dt : -dt) * 5));
  r.bike.visible = riding;
  model.position.set(0, riding ? SEAT.lift : 0, riding ? SEAT.back : 0);
  visual.rotation.x = riding ? pitch : 0;
  visual.rotation.z = riding ? lean : 0;
  engine(r, riding, speed);
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

/** The engine: idles at a standstill, rising to a scream at top speed. */
function engine(r: Rider, riding: boolean, speed: number) {
  if (riding && !r.sound && !r.loading && getListener().context.state === "running") {
    r.loading = true;
    void loadSound("engine").then((buffer) => {
      const s = new PositionalAudio(getListener());
      toBus(s, "effects");
      s.setBuffer(buffer);
      s.setLoop(true);
      s.setRefDistance(5);
      s.setRolloffFactor(1.1);
      r.bike.add(s);
      r.sound = s;
    }).catch(() => {}).finally(() => {
      r.loading = false;
    });
  }
  const s = r.sound;
  if (!s) return;
  if (riding && !s.isPlaying) s.play();
  if (!riding && s.isPlaying) s.stop();
  if (!riding) return;
  const revs = Math.min(1, Math.abs(speed) / BIKE.trackSpeed);
  s.setPlaybackRate(0.75 + revs * 2.3);
  s.setVolume(0.35 + revs * 0.45);
}

useGLTF.preload(BIKE_URL);
