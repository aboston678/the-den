import { useGLTF } from "@react-three/drei";
import { type RefObject, useEffect, useMemo } from "react";
import { type Group, Group as ThreeGroup, Mesh, type Object3D, Quaternion, Vector3 } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { GUNS, type GunId, type BearAction } from "@den/shared";
import { asset } from "../../asset.ts";
import { BearAnimator } from "../player/BearAnimator.ts";
import { reachTo } from "../player/reach.ts";

// The bear hunt's hunter (Andrew's own design, 2026-10-17): his model, driven by the same animator
// as the bear (his own clip speeds, idle for the bear's hobby clips), with the gun in hand and both
// arms posed onto it on top of whatever clip is playing. Used for our own hunter and everyone else's.

export const HUNTER_URL = asset("/models/hunter.glb");
export const GUNS_URL = asset("/models/guns.glb");
useGLTF.preload(HUNTER_URL);
useGLTF.preload(GUNS_URL);

/** Where things are on each gun (its own metres: bottom at y = 0, centred on z, muzzle toward +z). */
export const GUN_FIT: Record<GunId, { len: number; grip: [number, number]; fore: [number, number]; muzzle: [number, number]; scope: [number, number, number]; long: boolean }> = {
  // grip/fore/muzzle: [y, z]; scope: [y, z, scale]
  sniper: { len: 1.15, grip: [0.08, -0.17], fore: [0.12, 0.12], muzzle: [0.155, 0.575], scope: [0.155, -0.04, 1], long: true },
  ar: { len: 0.88, grip: [0.09, -0.12], fore: [0.2, 0.16], muzzle: [0.21, 0.44], scope: [0.25, -0.02, 0.8], long: true },
  shotgun: { len: 1.1, grip: [0.08, -0.22], fore: [0.12, 0.13], muzzle: [0.17, 0.55], scope: [0.165, -0.12, 0.7], long: true },
  pistol: { len: 0.21, grip: [0.04, -0.06], fore: [0.04, -0.06], muzzle: [0.11, 0.105], scope: [0.135, 0.0, 0.35], long: false },
};

/** Where the gun sits on the hunter (his own space: feet at 0, facing +z, his right is −x). */
const HOLD = {
  long: { aim: { pos: new Vector3(-0.13, 1.47, 0.08), pitch: 0 }, ready: { pos: new Vector3(-0.12, 1.2, 0.18), pitch: -0.55 } },
  pistol: { aim: { pos: new Vector3(-0.06, 1.45, 0.5), pitch: 0 }, ready: { pos: new Vector3(-0.1, 1.1, 0.34), pitch: -0.6 } },
};

export interface HunterRig {
  model: Object3D;
  animator: BearAnimator;
  /** The gun mount (pivot at the butt for long guns, at the grip for the pistol), turned by aim pitch. */
  mount: Group;
  guns: Record<GunId, Object3D>;
  scope: Object3D;
  arms: { upper: Object3D; fore: Object3D; hand: Object3D }[];
  /** Eased 0 (low ready) … 1 (shouldered) and the last action we started. */
  raise: number;
  action: BearAction | null;
  /** The muzzle in world space this frame (for flashes and tracers). */
  muzzle: Vector3;
}

/** A fresh hunter with his guns, added to `visual` (hidden until he's a hunter). */
export function useHunterRig(visual: RefObject<Group | null>): HunterRig {
  const { scene, animations } = useGLTF(HUNTER_URL);
  const gunsGltf = useGLTF(GUNS_URL);
  const rig = useMemo<HunterRig>(() => {
    const model = cloneSkinned(scene);
    model.traverse((o) => {
      o.castShadow = true;
      o.frustumCulled = false;
    });
    model.visible = false;
    const animator = new BearAnimator(model, animations, { natural: { walk: 1.22, run: 6.2, crouch: 1.0 }, lenient: true });
    const mount = new ThreeGroup();
    mount.name = "gun-mount";
    mount.visible = false;
    const guns = {} as Record<GunId, Object3D>;
    for (const g of GUNS) {
      const node = gunsGltf.scene.getObjectByName(g)?.clone() ?? new ThreeGroup();
      // Long guns pivot at the butt (the shoulder), the pistol at its grip (the hands).
      const holder = new ThreeGroup();
      holder.add(node);
      const fit = GUN_FIT[g];
      holder.position.set(0, -fit.grip[0], fit.long ? fit.len / 2 - 0.02 : -fit.grip[1]);
      holder.visible = false;
      node.traverse((o) => {
        if (o instanceof Mesh) o.castShadow = true;
      });
      guns[g] = holder;
      mount.add(holder);
    }
    const scope = gunsGltf.scene.getObjectByName("scope")?.clone() ?? new ThreeGroup();
    scope.visible = false;
    const arms = (["Right", "Left"] as const).map((s) => ({
      upper: model.getObjectByName(`${s}Arm`)!, fore: model.getObjectByName(`${s}ForeArm`)!, hand: model.getObjectByName(`${s}Hand`)!,
    }));
    return { model, animator, mount, guns, scope, arms, raise: 0, action: null, muzzle: new Vector3() };
  }, [scene, animations, gunsGltf.scene]);

  useEffect(() => {
    const g = visual.current;
    if (!g) return;
    g.add(rig.model, rig.mount);
    return () => void g.remove(rig.model, rig.mount);
  }, [rig, visual]);
  return rig;
}

const posed = new WeakMap<Object3D, { base: Quaternion; ours: Quaternion }>();
/** Undo last frame's arm pose where the animation left it in place (see bike/rider.ts restorePose). */
function restore(bones: Object3D[]) {
  for (const bone of bones) {
    const p = posed.get(bone);
    if (!p) posed.set(bone, { base: bone.quaternion.clone(), ours: new Quaternion(2, 2, 2, 2) });
    else if (bone.quaternion.equals(p.ours)) bone.quaternion.copy(p.base);
    else p.base.copy(bone.quaternion);
  }
}
const note = (bones: Object3D[]) => bones.forEach((b) => posed.get(b)?.ours.copy(b.quaternion));

const v = { g: new Vector3(), f: new Vector3(), h: new Vector3(), w: new Vector3() };

export interface HunterPose {
  /** He's a hunter right now (else the rig is hidden). */
  show: boolean;
  action: BearAction;
  speed: number;
  gun: GunId | "";
  scoped: boolean;
  /** Up/down aim (radians, + = up). */
  pitch: number;
  /** Shouldered (aiming, or standing still); otherwise the gun is carried low. */
  aiming: boolean;
  dt: number;
}

/** Call after `rig.animator.update`: shows the gun, raises it, and puts both hands on it. */
export function poseHunter(rig: HunterRig, p: HunterPose) {
  rig.model.visible = p.show;
  const armed = p.show && p.gun !== "" && p.action !== "down" && p.action !== "ride" && p.action !== "sit" && p.action !== "stand";
  rig.mount.visible = armed;
  if (!armed) return;
  const gun = p.gun as GunId;
  const fit = GUN_FIT[gun];
  for (const g of GUNS) rig.guns[g].visible = g === gun;
  // The scope rides on the gun in hand.
  const holder = rig.guns[gun];
  if (p.scoped) {
    if (rig.scope.parent !== holder.children[0]) holder.children[0]!.add(rig.scope);
    rig.scope.position.set(0, fit.scope[0], fit.scope[1]);
    rig.scope.scale.setScalar(fit.scope[2]);
  }
  rig.scope.visible = p.scoped;

  const want = p.aiming ? 1 : 0;
  rig.raise += Math.sign(want - rig.raise) * Math.min(Math.abs(want - rig.raise), p.dt * 5);
  const k = rig.raise * rig.raise * (3 - 2 * rig.raise);
  const hold = fit.long ? HOLD.long : HOLD.pistol;
  rig.mount.position.lerpVectors(hold.ready.pos, hold.aim.pos, k);
  rig.mount.rotation.set(-((1 - k) * hold.ready.pitch + k * Math.max(-1.2, Math.min(1.2, p.pitch))), 0, 0, "YXZ");

  // Hands on the gun: right on the grip, left on the fore-end (both on the grip for the pistol).
  rig.model.updateWorldMatrix(true, true);
  rig.mount.updateWorldMatrix(true, true);
  const local = holder.children[0]!;
  const bones = rig.arms.flatMap((a) => [a.upper, a.fore, a.hand]);
  restore(bones);
  rig.model.updateWorldMatrix(true, true);
  const grip = local.localToWorld(v.g.set(0, fit.grip[0], fit.grip[1]));
  const fore = local.localToWorld(v.f.set(fit.long ? 0 : 0.02, fit.fore[0], fit.fore[1]));
  const down = v.h.set(0, -1, 0);
  const [right, left] = rig.arms as [HunterRig["arms"][0], HunterRig["arms"][0]];
  reachTo(right.upper, right.fore, right.hand, grip, down, 1);
  reachTo(left.upper, left.fore, left.hand, fore, down, 1);
  note(bones);
  local.localToWorld(rig.muzzle.set(0, fit.muzzle[0], fit.muzzle[1]));
}

/** For the bear's eyes only: copies of a hunter's meshes that glow through walls and trees. */
export function makeGlow(rig: HunterRig, material: import("three").Material) {
  const glows: Mesh[] = [];
  rig.model.traverse((o) => {
    if (!(o as Mesh).isMesh) return;
    const src = o as Mesh & { skeleton?: unknown; bindMatrix?: unknown };
    const copy = src.clone() as Mesh;
    copy.material = material;
    copy.renderOrder = 999;
    copy.castShadow = false;
    copy.visible = false;
    copy.name = "hunter-glow";
    src.parent!.add(copy);
    glows.push(copy);
  });
  return glows;
}
