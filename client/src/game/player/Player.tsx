import { useFrame } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, type RapierCollider, type RapierRigidBody, useRapier } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import type { KinematicCharacterController } from "@dimforge/rapier3d-compat";
import { type Group, Matrix4, Vector3 } from "three";
import { NET_TICK_HZ } from "@den/shared";
import { CAPSULE, CAPSULE_CENTER, CONTROLLER_OFFSET, JUMP_AIR_TIME, MOVE } from "../config.ts";
import { sendPose } from "../../net/party.ts";
import { remotes } from "../../net/remotes.ts";
import { clearPresses, consumePress, isHeld } from "../input/keyboard.ts";
import { cameraState, playerState } from "../state.ts";
import { groundY } from "../world/ground.ts";
import { invisibleColliders } from "../world/invisible.ts";
import { approach, facingYaw, moveDirection, turnToward } from "./movement.ts";
import { useBearModel } from "./useBearModel.ts";

const MAX_DT = 0.1;
/** Grace period after leaving the ground in which the bear still counts as grounded ("coyote time"). */
const COYOTE = 0.15;
/** Only switch to the falling pose after actually dropping this far below the last ground height. */
const FALL_DROP = 0.4;
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
    c.enableAutostep(0.35, 0.25, true); // house stairs are 0.24 m at 1.25× scale
    c.enableSnapToGround(0.4);
    c.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((50 * Math.PI) / 180);
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

  // Start facing away from the camera (which begins on the +z side looking toward −z).
  const s = useRef({ vy: 0, speed: 0, yaw: Math.PI, dir: { x: 0, z: -1 }, airTime: 0, actionTime: 0, roarReadyAt: 0, groundY: 0, ready: false,
    pushX: 0, pushZ: 0, staggerUntil: 0, sendTimer: 0 });

  useFrame(({ clock }, rawDt) => {
    const controller = controllerRef.current;
    if (!body.current || !collider.current || !controller) return;
    // Real time up to 10 fps so slow laptops still move at the right speed; beyond that
    // (tab switches, hiccups) slow down rather than teleport.
    const dt = Math.min(rawDt, MAX_DT);
    const st = s.current;
    const now = clock.elapsedTime;

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
    const moving = dir.x !== 0 || dir.z !== 0;
    const sprint = isHeld("ShiftLeft") || isHeld("ShiftRight");
    const grounded = playerState.grounded;
    const start = (a: typeof playerState.action) => {
      animator.start(a, JUMP_AIR_TIME);
      st.actionTime = 0;
    };

    // --- actions: dance (B), roar (Y), jump (Space) ---
    let action = animator.action;
    if (consumePress("KeyB") && grounded) {
      if (action === "dance") start("locomotion");
      else if (action === "locomotion") start("dance");
    }
    if (consumePress("KeyY") && grounded && now >= st.roarReadyAt && (action === "locomotion" || action === "dance")) {
      start("roar");
      st.roarReadyAt = now + MOVE.roarCooldown;
    }
    action = animator.action;
    if (moving && (action === "dance" || action === "roar")) start("locomotion"); // moving cancels
    if (action === "roar" && animator.roarFinished) start("locomotion");
    if (consumePress("Space") && grounded && animator.action !== "jump" && st.vy <= 0) {
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
    const canMove = action === "locomotion" || action === "jump" || action === "fall";
    const staggered = playerState.gameTime < st.staggerUntil;
    const targetSpeed = (canMove && moving ? (sprint ? MOVE.sprintSpeed : MOVE.walkSpeed) : 0) * (staggered ? 0.3 : 1);
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
    controller.computeColliderMovement(collider.current, desired);
    const moved = controller.computedMovement();
    const nowGrounded = controller.computedGrounded();
    if (st.vy > 0 && moved.y < desired.y * 0.5) st.vy = 0; // bumped our head
    if (nowGrounded && st.vy < 0) st.vy = -1; // stay pressed onto slopes and steps

    const p = body.current.translation();

    // If the feet ever end up below a floor (Rapier's controller ignores surfaces it's already
    // inside), lift the bear back on top.
    const floorY = st.vy <= 0 ? floorBelow(p.x, p.y - CAPSULE_CENTER, p.z) : null;
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
    if (visual.current) visual.current.rotation.y = st.yaw;
    animator.update(dt, Math.min(st.speed, groundSpeed));

    // --- tell the party where we are, 20 times a second ---
    st.sendTimer += dt;
    if (st.sendTimer >= 1 / NET_TICK_HZ) {
      st.sendTimer = 0;
      const pos = playerState.position;
      sendPose({ x: pos.x, y: pos.y, z: pos.z, yaw: st.yaw, speed: playerState.speed, action: animator.action });
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
    clearPresses();
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
