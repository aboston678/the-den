import { useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, type RapierCollider, type RapierRigidBody, useRapier } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { type Group, type Material, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { INTERP_DELAY_MS, sampleAt } from "../../net/interpolate.ts";
import { usePartyStore } from "../../net/party.ts";
import { remotes } from "../../net/remotes.ts";
import { playAt } from "../audio/audio.ts";
import { nameTagEls } from "./nameTags.ts";
import { CAPSULE, CAPSULE_CENTER, JUMP_AIR_TIME } from "../config.ts";
import { useBearModel } from "../player/useBearModel.ts";
import { useRod } from "../fishing/rig.ts";
import { applyLipHold } from "../fishing/lipHold.ts";
import { useHeldBall } from "../bowling/heldBall.ts";
import { useLanes } from "../bowling/store.ts";
import { cameraState, playerState } from "../state.ts";
import { invisibleColliders } from "../world/invisible.ts";
import { bearSounds } from "../audio/footsteps.ts";
import { CAST_RELEASE_S } from "../player/BearAnimator.ts";
import { applyRide, useRider } from "../bike/rider.ts";
import { groundY } from "../world/ground.ts";
import { inGarage } from "@den/shared";
import { makeGlow, poseHunter, useHunterRig } from "../hunt/hunterRig.ts";
import { myRole, roleOf } from "../hunt/store.ts";

/** Rapier collider handle → the player it belongs to (the bear hunt's bullets find their target with it). */
export const colliderOwners = new Map<number, string>();

/** Every remote hunter's glow copies (tests check the bear sees them). */
export const allGlows = new Set<Mesh[]>();

/** The bear's view of hunters through walls and trees (bear hunt): flat glowing orange, drawn on top. */
const GLOW = new MeshBasicMaterial({ color: "#ff6a1a", transparent: true, opacity: 0.55, depthTest: false, depthWrite: false });

/** Name tags: fully visible up close, gone by 30 m (GAME_SPEC §5.3). */
const TAG_FULL = 15;
const TAG_GONE = 30;
const TAG_HEIGHT = 2.45; // above the feet
/** Bears this close to a roaring bear get a camera shake (GAME_SPEC §5.3). */
const ROAR_SHAKE_RADIUS = 6;

const tagWorld = new Vector3();
const screen = new Vector3();

/** Every other bear in the party. */
export function RemoteBears() {
  const ids = usePartyStore((s) => s.remoteIds);
  return (
    <>
      {ids.map((id) => (
        <Suspense key={id} fallback={null}>
          <RemoteBearView id={id} />
        </Suspense>
      ))}
    </>
  );
}

function RemoteBearView({ id }: { id: string }) {
  const { model, animator } = useBearModel();
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const visual = useRef<Group>(null);
  const frame = useRef(0);
  const { world, rapier } = useRapier();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const bear = remotes.get(id);
  const start = bear?.current ?? { x: 0, y: 0, z: 0 };
  const yaw = useRef(0);
  const rider = useRider(visual);
  const hunter = useHunterRig(visual);
  const glows = useMemo(() => makeGlow(hunter, GLOW), [hunter]);
  useEffect(() => {
    allGlows.add(glows);
    return () => void allGlows.delete(glows);
  }, [glows]);
  const owned = useRef<number | null>(null);
  useEffect(() => () => {
    if (owned.current !== null) colliderOwners.delete(owned.current);
  }, []);
  /** On a bike: lean worked out from how fast they're turning, and tip from the slope. */
  const ride = useRef({ yaw: 0, lean: 0, pitch: 0 });
  useRod(id, model, visual, () => ({ rod: remotes.get(id)?.fish.rod ?? false, action: animator.action, yaw: yaw.current }));
  // Bowling: a ball in the paw while it's their turn at the line (it leaves the paw when they roll).
  useHeldBall(model, visual, () => {
    const lanes = useLanes.getState().lanes;
    for (const lane of [lanes["1"], lanes["2"]]) {
      if (lane.phase === "aim" && lane.bowlers[lane.turn]?.id === id) return { show: true, colour: lane.turn };
    }
    return { show: false, colour: 0 };
  });

  // Catan: while you're at the board camera, other bears sitting at the table fade a little so
  // their heads don't hide the board. Their own material copies, dithered (no sorting, and set up
  // once so fading never rebuilds a shader).
  const fadeMaterials = useMemo(() => {
    const mats: (Material & { opacity: number })[] = [];
    model.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      // Reuse a copy already made (React may run this twice in development).
      let mat = o.material as Material & { opacity: number; alphaHash: boolean };
      if (!mat.userData.fade) {
        mat = mat.clone() as typeof mat;
        mat.alphaHash = true;
        mat.userData.fade = true;
        o.material = mat;
      }
      mats.push(mat);
    });
    return mats;
  }, [model]);
  const fade = useRef(1);

  const reel = useRef({ line: 0, at: 0 });
  useFrame((_, rawDt) => {
    const b = remotes.get(id);
    if (!b || !body.current) return;
    const dt = Math.min(rawDt, 0.1);
    const s = sampleAt(b.snapshots, performance.now() - INTERP_DELAY_MS);
    if (!s) return;

    const target = playerState.seated && cameraState.freeMouse && s.action === "sit" ? 0.45 : 1;
    if (fade.current !== target) {
      fade.current += Math.max(-dt * 3, Math.min(dt * 3, target - fade.current));
      for (const m of fadeMaterials) m.opacity = fade.current;
    }

    body.current.setNextKinematicTranslation({ x: s.x, y: s.y + CAPSULE_CENTER, z: s.z });
    if (collider.current && owned.current !== collider.current.handle) {
      if (owned.current !== null) colliderOwners.delete(owned.current);
      owned.current = collider.current.handle;
      colliderOwners.set(owned.current, id);
    }
    if (visual.current) visual.current.rotation.y = s.yaw;
    yaw.current = s.yaw;

    // The bear hunt (2026-10-17): players in a hunt don't see (or bump into) bears who aren't in it.
    const me = usePartyStore.getState().sessionId;
    const mine = myRole(me), theirs = roleOf(id);
    const hidden = mine !== "" && theirs === "";
    if (visual.current) visual.current.visible = !hidden;
    b.hidden = hidden;
    if (collider.current && collider.current.isEnabled() === hidden) collider.current.setEnabled(!hidden);
    const isHunter = theirs === "hunter";
    model.visible = !isHunter;
    for (const g of glows) g.visible = isHunter && mine === "bear";

    if (s.action !== animator.action) {
      animator.start(s.action, JUMP_AIR_TIME);
      const near = Math.hypot(s.x - playerState.position.x, s.z - playerState.position.z) < ROAR_SHAKE_RADIUS;
      if (s.action === "roar" && near) cameraState.shake = Math.max(cameraState.shake, 0.5);
      if (s.action === "roar") void playAt("roar", s.x, s.y + 1.6, s.z, 1.8, 8);
      // Their cast whooshes as the lure leaves the rod, like yours.
      if (s.action === "cast") setTimeout(() => void playAt("cast-whoosh", s.x, s.y + 2, s.z, 0.8, 4), CAST_RELEASE_S * 1000);
    }
    // Their reel clicks while they wind a fish in.
    const line = b.fish.line;
    if (b.fish.state === "fight" && line < reel.current.line - 0.05 && performance.now() - reel.current.at > 120) {
      reel.current.at = performance.now();
      void playAt("reel-click", s.x, s.y + 1.2, s.z, 0.5, 3);
    }
    reel.current.line = line;
    animator.update(dt, s.action === "locomotion" || s.action === "crouch" ? s.speed : 0);
    if (isHunter) {
      if (hunter.action !== s.action) {
        hunter.animator.start(s.action, JUMP_AIR_TIME);
        hunter.action = s.action;
      }
      hunter.animator.update(dt, s.action === "locomotion" || s.action === "crouch" ? s.speed : 0);
    }
    poseHunter(hunter, {
      show: isHunter, action: s.action, speed: s.speed, gun: (b.hunt.gun || "") as never, scoped: b.hunt.scoped, pitch: s.aimPitch, aiming: s.speed < 2.5, dt,
    });
    applyLipHold(id, model, yaw.current, remotes.get(id)?.fish.state === "landed", animator.action !== "celebrate" && animator.action !== "cast", dt);
    if (visual.current) {
      const r = ride.current, riding = animator.action === "ride";
      const turn = Math.atan2(Math.sin(s.yaw - r.yaw), Math.cos(s.yaw - r.yaw)) / Math.max(dt, 1e-3);
      r.yaw = s.yaw;
      const lean = riding ? Math.max(-0.75, Math.min(0.75, -Math.atan((turn * s.speed) / 9.8))) : 0;
      r.lean += (lean - r.lean) * Math.min(1, dt * 5);
      const fx = Math.sin(s.yaw) * 1.1, fz = Math.cos(s.yaw) * 1.1;
      const slope = !riding || inGarage(s.x, s.z) ? 0 : Math.atan2(groundY(s.x + fx, s.z + fz) - groundY(s.x - fx, s.z - fz), 2.2);
      r.pitch += (Math.max(-0.35, Math.min(0.35, -slope)) - r.pitch) * Math.min(1, dt * 8);
      applyRide(rider, isHunter ? hunter.model : model, visual.current, riding, s.speed, r.lean, r.pitch, dt, { wheelie: riding ? s.wheelie : 0 });
    }
    if (!hidden) bearSounds(isHunter ? hunter.animator : animator, s.x, s.y, s.z);
    b.current = { x: s.x, y: s.y, z: s.z, speed: s.speed, action: s.action, flashlight: s.flashlight, aimYaw: s.aimYaw, aimPitch: s.aimPitch, wheelie: s.wheelie };

    // Name tag: over the head, fading with distance, hidden behind walls (checked every 4th frame).
    const tag = nameTagEls.get(id);
    if (!tag) return;
    tagWorld.set(s.x, s.y + TAG_HEIGHT, s.z);
    const dist = camera.position.distanceTo(tagWorld);
    let opacity = dist <= TAG_FULL ? 1 : Math.max(0, 1 - (dist - TAG_FULL) / (TAG_GONE - TAG_FULL));
    if (opacity > 0 && frame.current++ % 4 === 0) {
      const dir = tagWorld.clone().sub(camera.position).normalize();
      const hit = world.castRay(new rapier.Ray(camera.position, dir), dist, true, undefined, undefined, undefined, undefined,
        (c) => c.handle !== collider.current?.handle && c.handle !== playerState.colliderHandle && !invisibleColliders.has(c.handle));
      tag.dataset.occluded = hit && hit.timeOfImpact < dist - 0.3 ? "1" : "";
    }
    if (tag.dataset.occluded) opacity = 0;
    // Hunters never see the bear's name tag (it would give it away), and nobody sees hidden bears' tags.
    if (hidden || (theirs === "bear" && mine === "hunter")) opacity = 0;
    screen.copy(tagWorld).project(camera);
    if (screen.z > 1) opacity = 0; // behind the camera
    tag.style.transform = `translate(-50%, -50%) translate(${((screen.x + 1) / 2) * size.width}px, ${((1 - screen.y) / 2) * size.height}px)`;
    tag.style.opacity = String(opacity);
    b.tagVisible = opacity > 0.05;
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[start.x, start.y + CAPSULE_CENTER, start.z]}>
      <CapsuleCollider ref={collider} args={[CAPSULE.halfHeight, CAPSULE.radius]} />
      <group ref={visual} position-y={-CAPSULE_CENTER}>
        <primitive object={model} />
      </group>
    </RigidBody>
  );
}
