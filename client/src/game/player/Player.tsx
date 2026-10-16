import { useFrame } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, type RapierCollider, type RapierRigidBody, useRapier } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import type { KinematicCharacterController } from "@dimforge/rapier3d-compat";
import { type Group, Matrix4, Vector3 } from "three";
import { BEAR, NET_TICK_HZ } from "@den/shared";
import { CAPSULE, CAPSULE_CENTER, CONTROLLER_OFFSET, CROUCH_SHRINK, JUMP_AIR_TIME, MOVE } from "../config.ts";
import { castTo, sendPose, useFishStore } from "../../net/party.ts";
import { useRod } from "../fishing/rig.ts";
import { applyLipHold } from "../fishing/lipHold.ts";
import { useHeldBall } from "../bowling/heldBall.ts";
import { useBowling } from "../bowling/session.ts";
import { useLanes } from "../bowling/store.ts";
import { BOWL_RELEASE_S, CAST_RELEASE_S } from "./BearAnimator.ts";
import { type SeatMove, seatStep } from "./seating.ts";
import { remotes } from "../../net/remotes.ts";
import { consumePress, isHeld } from "../input/keyboard.ts";
import { playAt } from "../audio/audio.ts";
import { flashlightAim } from "./Flashlight.tsx";
import { cameraState, playerState } from "../state.ts";
import { groundY } from "../world/ground.ts";
import { invisibleColliders } from "../world/invisible.ts";
import { approach, facingYaw, moveDirection, turnToward } from "./movement.ts";
import { useBearModel } from "./useBearModel.ts";
import { STAIR_FEET } from "../house/structure.ts";
import { toWorld } from "../house/space.ts";
import { bearSounds } from "../audio/footsteps.ts";

const MAX_DT = 0.1;
/** Grace period after leaving the ground in which the bear still counts as grounded ("coyote time"). */
const COYOTE = 0.15;
/** Only switch to the falling pose after actually dropping this far below the last ground height. */
const FALL_DROP = 0.4;
/** Highest step the bear walks up without jumping (metres); higher at the foot of a staircase. */
const STEP_UP = 0.35, STAIR_FOOT_STEP_UP = 0.75;
const FEET = STAIR_FEET.map((f) => {
  const a = toWorld([f.x0, f.y0, f.z0]), b = toWorld([f.x1, f.y1, f.z1]);
  return { minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minY: a[1], maxY: b[1], minZ: Math.min(a[2], b[2]), maxZ: Math.max(a[2], b[2]) };
});
const atStairFoot = (x: number, y: number, z: number) => FEET.some((f) => x > f.minX && x < f.maxX && y > f.minY && y < f.maxY && z > f.minZ && z < f.maxZ);
/** Seconds a roar holds the bear still before walking off cancels it. */
const ROAR_PLANTED_S = 1.2;
/** Ground probe: a ray from this high above the feet straight down (stays inside the bear). */
const PROBE_FROM = 1.0;
const UP = new Vector3(0, 1, 0);
const tmpMatrix = new Matrix4();
const tmpMatrix2 = new Matrix4();

/** The local player's bear: kinematic capsule + Rapier character controller + animated model. */
export function Player({ spawn = [0, 0, 0] as [number, number, number] }) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const visual = useRef<Group>(null);
  const { world, rapier } = useRapier();

  // Created in an effect (not useMemo) so React's dev-mode double mount gets a fresh one.
  const controllerRef = useRef<KinematicCharacterController | null>(null);
  useEffect(() => {
    const c = world.createCharacterController(CONTROLLER_OFFSET);
    c.enableAutostep(STEP_UP, 0.25, true); // house stairs are 0.24 m at 1.25× scale
    c.enableSnapToGround(0.4);
    c.setMaxSlopeClimbAngle((50 * Math.PI) / 180); // the basement stairs' ramp is 44°
    c.setMinSlopeSlideAngle((55 * Math.PI) / 180);
    c.setApplyImpulsesToDynamicBodies(true);
    c.setCharacterMass(300);
    controllerRef.current = c;
    return () => {
      controllerRef.current = null;
      world.removeCharacterController(c);
    };
  }, [world]);

  const { model, animator } = useBearModel();
  const toes = useMemo(() => ["LeftToeBase", "RightToeBase"].map((n) => model.getObjectByName(n)!), [model]);
  useRod("me", model, visual, () => ({ rod: useFishStore.getState().me.rod, action: animator.action, yaw: playerState.yaw }));
  useHeldBall(model, visual, () => {
    const { lane, mode } = useBowling.getState();
    return { show: mode === "aim" || mode === "power" || mode === "curve" || mode === "throw", colour: lane ? useLanes.getState().lanes[lane].turn : 0 };
  });

  // Start facing away from the camera (which begins on the +z side looking toward −z).
  const s = useRef({ vy: 0, speed: 0, yaw: Math.PI, dir: { x: 0, z: -1 }, airTime: 0, actionTime: 0, roarReadyAt: 0, atStairFoot: false, short: false, groundY: 0, ready: false,
    pushX: 0, pushZ: 0, staggerUntil: 0, sendTimer: 0, castAt: null as { x: number; z: number } | null, released: false,
    chair: null as SeatMove | null });

  useFrame(({ clock }, rawDt) => {
    const controller = controllerRef.current;
    if (!body.current || !collider.current || !controller) return;
    // Real time up to 10 fps so slow laptops still move at the right speed; beyond that
    // (tab switches, hiccups) slow down rather than teleport.
    const dt = Math.min(rawDt, MAX_DT);
    const st = s.current;
    const now = clock.elapsedTime;

    /** Whether a full-height bear fits here (getting up from a crouch). */
    const canStand = () => {
      const p = body.current!.translation();
      let blocked = false;
      world.intersectionsWithShape(
        { x: p.x, y: p.y + 0.1, z: p.z }, { x: 0, y: 0, z: 0, w: 1 }, new rapier.Capsule(CAPSULE.halfHeight, CAPSULE.radius - 0.05),
        (c) => {
          if (c.isSensor() || invisibleColliders.has(c.handle)) return true;
          blocked = true;
          return false;
        },
        undefined, undefined, collider.current!,
      );
      return !blocked;
    };

    /** Height of the floor under (x, feetY, z), probing from inside the bear, or null. */
    const floorBelow = (x: number, feetY: number, z: number) => {
      const hit = world.castRay(
        new rapier.Ray({ x, y: feetY + PROBE_FROM, z }, { x: 0, y: -1, z: 0 }),
        PROBE_FROM + 0.6, true, undefined, undefined, undefined, undefined,
        (c) => c.handle !== collider.current!.handle,
      );
      return hit ? feetY + PROBE_FROM - hit.timeOfImpact : null;
    };
    // Don't start simulating until the level's colliders exist under the bear; otherwise it
    // falls into the floor during the first frames after loading.
    if (!st.ready) {
      const start = body.current.translation();
      if (floorBelow(start.x, start.y - CAPSULE_CENTER, start.z) === null) return;
      st.ready = true;
    }
    st.actionTime += dt;

    const dir = moveDirection(
      {
        forward: isHeld("KeyW") || isHeld("ArrowUp"),
        back: isHeld("KeyS") || isHeld("ArrowDown"),
        left: isHeld("KeyA") || isHeld("ArrowLeft"),
        right: isHeld("KeyD") || isHeld("ArrowRight"),
      },
      cameraState.yaw,
    );
    // Bowling holds the bear on its spot on the approach, and a chair holds it at the Catan table:
    // no walking, jumping or dancing.
    const held = playerState.hold;
    const seated = playerState.seat !== null || st.chair !== null;
    if (held || seated) dir.x = dir.z = 0;
    const moving = dir.x !== 0 || dir.z !== 0;
    const sprint = isHeld("ShiftLeft") || isHeld("ShiftRight");
    const grounded = playerState.grounded;
    const start = (a: typeof playerState.action) => {
      animator.start(a, JUMP_AIR_TIME);
      st.actionTime = 0;
    };

    // --- actions: dance (B), roar (Y), jump (Space) ---
    let action = animator.action;
    if (consumePress("KeyF")) playerState.flashlight = !playerState.flashlight;
    if (consumePress("KeyB") && grounded && !held && !seated) {
      if (action === "dance") start("locomotion");
      else if (action === "locomotion") start("dance");
    }
    // Crouch (C): toggles; sprinting or jumping stands the bear up, if there's room overhead.
    if (consumePress("KeyC") && grounded && !held && !seated) {
      if (action === "locomotion" || action === "dance") start("crouch");
      else if (action === "crouch" && canStand()) start("locomotion");
    }
    if (action === "crouch" && sprint && moving && canStand()) start("locomotion");
    action = animator.action;
    if (consumePress("KeyY") && grounded && !held && !seated && now >= st.roarReadyAt && (action === "locomotion" || action === "dance")) {
      start("roar");
      st.roarReadyAt = now + MOVE.roarCooldown;
      void playAt("roar", playerState.position.x, playerState.position.y + 1.6, playerState.position.z, 1.8, 8);
    }
    action = animator.action;

    // --- fishing (GAME_SPEC §13): cast where asked, reel while a fish is on, celebrate a big one ---
    const fish = useFishStore.getState().me;
    const req = playerState.castRequest;
    if (req) {
      playerState.castRequest = null;
      if (grounded && (action === "locomotion" || action === "dance")) {
        st.yaw = Math.atan2(req.x - playerState.position.x, req.z - playerState.position.z);
        st.speed = 0;
        start("cast");
        st.castAt = req;
      }
    }
    if (animator.action === "cast") {
      if (st.castAt && st.actionTime >= CAST_RELEASE_S) {
        castTo(st.castAt.x, st.castAt.z);
        void playAt("cast-whoosh", playerState.position.x, playerState.position.y + 2, playerState.position.z, 0.8, 4);
        st.castAt = null;
      }
      if (animator.finished("Cast") || st.actionTime > 2.2) start("locomotion");
    }
    if (fish.state === "fight" && animator.action !== "reel" && grounded) start("reel");
    if (animator.action === "reel") {
      st.yaw = turnToward(st.yaw, Math.atan2(fish.lureX - playerState.position.x, fish.lureZ - playerState.position.z), 3 * dt);
      if (fish.state !== "fight") start(fish.state === "landed" && fish.weight >= 2 ? "celebrate" : "locomotion");
    }
    // --- bowling (GAME_SPEC §15): the bowl, the release, a celebration on a strike ---
    if (playerState.bowlRequest) {
      playerState.bowlRequest = false;
      start("bowl");
      st.released = false;
    }
    if (animator.action === "bowl") {
      if (!st.released && st.actionTime >= BOWL_RELEASE_S) {
        st.released = true;
        playerState.bowlReleased = true;
      }
      if (animator.finished("Bowl") || st.actionTime > 2.2) start("locomotion");
    }
    if (playerState.celebrateRequest) {
      playerState.celebrateRequest = false;
      if (grounded) start("celebrate");
    }
    if (animator.action === "celebrate" && (animator.finished("Celebrate") || moving)) start("locomotion");
    action = animator.action;

    // Moving cancels a dance, or a roar once it's under way (a roar plants the bear first, so pressing Y
    // while walking still roars instead of being cancelled in the same frame).
    if (moving && (action === "dance" || (action === "roar" && st.actionTime >= ROAR_PLANTED_S))) start("locomotion");
    if (action === "roar" && animator.roarFinished) start("locomotion");
    if (consumePress("Space") && grounded && !held && !seated && animator.action !== "jump" && st.vy <= 0 && (animator.action !== "crouch" || canStand())) {
      st.vy = MOVE.jumpVelocity;
      start("jump");
    }
    action = animator.action;

    // --- bumping: when touching another bear, shove ourselves away (each client moves only its
    // own bear). A sprinting bear shoves much harder and makes us stagger.
    const touch = 2 * CAPSULE.radius + 0.15;
    for (const r of remotes.values()) {
      const dx = playerState.position.x - r.current.x, dz = playerState.position.z - r.current.z;
      const d = Math.hypot(dx, dz);
      if (d >= touch || d < 1e-4 || Math.abs(playerState.position.y - r.current.y) > 1.5) continue;
      const sprinting = r.current.speed > MOVE.walkSpeed + 0.5;
      const strength = MOVE.shove + (sprinting ? MOVE.sprintShove : 0);
      if (strength > Math.hypot(st.pushX, st.pushZ)) {
        st.pushX = (dx / d) * strength;
        st.pushZ = (dz / d) * strength;
      }
      if (sprinting && st.staggerUntil < playerState.gameTime) {
        st.staggerUntil = playerState.gameTime + MOVE.staggerTime;
        cameraState.shake = Math.max(cameraState.shake, 0.3);
      }
    }
    const pushDecay = Math.exp(-6 * dt);
    st.pushX *= pushDecay;
    st.pushZ *= pushDecay;

    // --- horizontal: accelerate toward walk/sprint speed, turn to face the way we go ---
    const crouched = action === "crouch";
    const canMove = action === "locomotion" || action === "jump" || action === "fall" || crouched;
    const staggered = playerState.gameTime < st.staggerUntil;
    const pace = crouched ? BEAR.crouchSpeed : sprint ? MOVE.sprintSpeed : MOVE.walkSpeed;
    const targetSpeed = (canMove && moving ? pace : 0) * (staggered ? 0.3 : 1);
    // A crouched bear is shorter: shrink the capsule, keeping its feet where they are.
    if (crouched !== st.short && collider.current) {
      st.short = crouched;
      collider.current.setHalfHeight(CAPSULE.halfHeight - (crouched ? CROUCH_SHRINK / 2 : 0));
      collider.current.setTranslationWrtParent({ x: 0, y: crouched ? -CROUCH_SHRINK / 2 : 0, z: 0 });
    }
    st.speed = approach(st.speed, targetSpeed, MOVE.acceleration * dt);
    if (moving && canMove) {
      st.dir = dir;
      st.yaw = turnToward(st.yaw, facingYaw(dir), MOVE.turnSpeed * dt);
    }

    // --- vertical: gravity ---
    st.vy -= MOVE.gravity * dt;
    const desired = {
      x: (st.dir.x * st.speed + st.pushX) * dt,
      y: st.vy * dt,
      z: (st.dir.z * st.speed + st.pushZ) * dt,
    };
    if (held) {
      // Glide to the bowling spot (A/D slides it) and face down the lane.
      const cur = body.current.translation();
      desired.x = held.x - cur.x;
      desired.z = held.z - cur.z;
      st.speed = 0;
      st.pushX = st.pushZ = 0;
      st.yaw = held.yaw;
    }
    // --- Catan chairs (GAME_SPEC §16): walk in, sit, get back up; the bear goes exactly where the
    // chair says (no bumping into the chair or table on the way) ---
    const here = body.current.translation();
    const chairSpot = seatStep(st.chair, playerState.seat, { x: here.x, y: here.y - CAPSULE_CENTER, z: here.z }, st.yaw, dt, animator, start);
    st.chair = chairSpot ? chairSpot.move : null;
    let moved: { x: number; y: number; z: number };
    let nowGrounded: boolean;
    if (chairSpot) {
      moved = { x: chairSpot.x - here.x, y: chairSpot.y + CAPSULE_CENTER - here.y, z: chairSpot.z - here.z };
      nowGrounded = true;
      st.vy = 0;
      st.speed = 0;
      st.pushX = st.pushZ = 0;
      st.yaw = chairSpot.yaw ?? st.yaw;
    } else {
      // Getting on or off the bottom of a staircase from the side: let the bear step higher there.
      const atFoot = atStairFoot(here.x, here.y - CAPSULE_CENTER, here.z);
      if (atFoot !== st.atStairFoot) {
        st.atStairFoot = atFoot;
        controller.enableAutostep(atFoot ? STAIR_FOOT_STEP_UP : STEP_UP, 0.25, true);
      }
      controller.computeColliderMovement(collider.current, desired);
      const m = controller.computedMovement();
      moved = { x: m.x, y: m.y, z: m.z };
      nowGrounded = controller.computedGrounded();
    }
    playerState.seated = st.chair !== null;
    if (st.vy > 0 && moved.y < desired.y * 0.5) st.vy = 0; // bumped our head
    // Stay lightly pressed onto the ground (snap-to-ground does the rest). Pressing harder slowed
    // the bear to a crawl on the house's steep stairs, since the push is projected along the slope.
    if (nowGrounded && st.vy < 0) st.vy = -0.1;

    const p = body.current.translation();

    // If the feet ever end up below a floor (Rapier's controller ignores surfaces it's already
    // inside), lift the bear back on top.
    const floorY = st.vy <= 0 && !chairSpot ? floorBelow(p.x, p.y - CAPSULE_CENTER, p.z) : null;
    const feet = p.y + moved.y - CAPSULE_CENTER;
    if (floorY !== null && feet < floorY - 0.03) {
      moved.y += floorY - feet;
      st.vy = 0;
    }

    const tp = playerState.teleportTo;
    if (tp) {
      let y = tp.y;
      if (Number.isNaN(y)) {
        const hit = world.castRay(new rapier.Ray({ x: tp.x, y: 80, z: tp.z }, { x: 0, y: -1, z: 0 }), 200, true, undefined, undefined, undefined, undefined,
          (c) => c.handle !== collider.current!.handle && !invisibleColliders.has(c.handle));
        y = hit ? 80 - hit.timeOfImpact : groundY(tp.x, tp.z);
      }
      p.x = tp.x; p.y = y + CAPSULE_CENTER; p.z = tp.z;
      moved.x = moved.y = moved.z = 0;
      st.vy = 0;
      if (tp.yaw !== undefined) {
        st.yaw = tp.yaw;
        st.dir = { x: Math.sin(tp.yaw), z: Math.cos(tp.yaw) };
        cameraState.yaw = tp.yaw + Math.PI; // camera behind the bear
      }
      playerState.teleportTo = null;
      body.current.setTranslation(p, true);
    }
    body.current.setNextKinematicTranslation({ x: p.x + moved.x, y: p.y + moved.y, z: p.z + moved.z });

    // --- air states ---
    // Rapier's ground flag can flicker for a few frames while standing still, so: coyote time
    // for jumping, and "falling" only once the bear has really dropped.
    st.airTime = nowGrounded ? 0 : st.airTime + dt;
    const feetY = p.y + moved.y - CAPSULE_CENTER;
    if (nowGrounded) st.groundY = feetY;
    if (action === "locomotion" && !nowGrounded && feetY < st.groundY - FALL_DROP) start("fall");
    if ((action === "jump" || action === "fall") && nowGrounded && st.actionTime > 0.1 && st.vy <= 0) start("locomotion");

    // --- outputs ---
    const groundSpeed = Math.hypot(moved.x, moved.z) / dt; // slower when pushing into a wall
    playerState.position.set(p.x + moved.x, p.y + moved.y - CAPSULE_CENTER, p.z + moved.z);
    playerState.speed = groundSpeed;
    playerState.grounded = nowGrounded || (st.airTime < COYOTE && st.vy <= 0);
    playerState.gameTime += dt;
    playerState.action = animator.action;
    playerState.colliderHandle = collider.current.handle;
    playerState.yaw = st.yaw;
    if (visual.current) {
      visual.current.rotation.y = st.yaw;
      // At the Catan board camera your own bear would fill the view; everyone else still sees it.
      visual.current.visible = !playerState.hidden && !(playerState.seated && cameraState.freeMouse);
    }
    animator.update(dt, Math.min(st.speed, groundSpeed));
    applyLipHold("me", model, playerState.yaw, fish.state === "landed", animator.action !== "celebrate" && animator.action !== "cast", dt);
    bearSounds(animator, playerState.position.x, playerState.position.y, playerState.position.z);

    // --- tell the party where we are, 20 times a second ---
    st.sendTimer += dt;
    if (st.sendTimer >= 1 / NET_TICK_HZ) {
      st.sendTimer = 0;
      const pos = playerState.position;
      const aim = flashlightAim();
      sendPose({
        x: pos.x, y: pos.y, z: pos.z, yaw: st.yaw, speed: playerState.speed, action: animator.action,
        flashlight: playerState.flashlight, aimYaw: aim.yaw, aimPitch: aim.pitch,
      });
    }
    if (playerState.trackFeet && visual.current) {
      // Test helper only: toe positions relative to the bear, placed with this frame's
      // position and facing (the scene graph's own transforms lag the physics by a frame).
      model.updateMatrixWorld(true);
      const toLocal = tmpMatrix.copy(visual.current.matrixWorld).invert();
      toes.forEach((toe, i) => {
        playerState.feet[i]!.setFromMatrixPosition(tmpMatrix2.multiplyMatrices(toLocal, toe.matrixWorld))
          .applyAxisAngle(UP, st.yaw)
          .add(playerState.position);
      });
    }
  });

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[spawn[0], spawn[1] + CAPSULE_CENTER, spawn[2]]}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider ref={collider} args={[CAPSULE.halfHeight, CAPSULE.radius]} />
      <group ref={visual} position-y={-CAPSULE_CENTER}>
        <primitive object={model} />
      </group>
    </RigidBody>
  );
}
