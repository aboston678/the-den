import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, type RapierCollider, type RapierRigidBody, useRapier } from "@react-three/rapier";
import { Suspense, useRef } from "react";
import { type Group, Vector3 } from "three";
import { INTERP_DELAY_MS, sampleAt } from "../../net/interpolate.ts";
import { usePartyStore } from "../../net/party.ts";
import { remotes } from "../../net/remotes.ts";
import { playAt } from "../audio/audio.ts";
import { CAPSULE, CAPSULE_CENTER, JUMP_AIR_TIME } from "../config.ts";
import { useBearModel } from "../player/useBearModel.ts";
import { cameraState, playerState } from "../state.ts";
import { invisibleColliders } from "../world/invisible.ts";

/** Name tags: fully visible up close, gone by 30 m (GAME_SPEC §5.3). */
const TAG_FULL = 15;
const TAG_GONE = 30;
const TAG_HEIGHT = 2.45; // above the feet
/** Bears this close to a roaring bear get a camera shake (GAME_SPEC §5.3). */
const ROAR_SHAKE_RADIUS = 6;

const tagWorld = new Vector3();

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
  const tag = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const { world, rapier } = useRapier();
  const camera = useThree((s) => s.camera);
  const bear = remotes.get(id);
  const start = bear?.current ?? { x: 0, y: 0, z: 0 };

  useFrame((_, rawDt) => {
    const b = remotes.get(id);
    if (!b || !body.current) return;
    const dt = Math.min(rawDt, 0.1);
    const s = sampleAt(b.snapshots, performance.now() - INTERP_DELAY_MS);
    if (!s) return;

    body.current.setNextKinematicTranslation({ x: s.x, y: s.y + CAPSULE_CENTER, z: s.z });
    if (visual.current) visual.current.rotation.y = s.yaw;

    if (s.action !== animator.action) {
      animator.start(s.action, JUMP_AIR_TIME);
      const near = Math.hypot(s.x - playerState.position.x, s.z - playerState.position.z) < ROAR_SHAKE_RADIUS;
      if (s.action === "roar" && near) cameraState.shake = Math.max(cameraState.shake, 0.5);
      if (s.action === "roar") void playAt("roar", s.x, s.y + 1.6, s.z, 1.8, 8);
    }
    animator.update(dt, s.action === "locomotion" ? s.speed : 0);
    b.current = { x: s.x, y: s.y, z: s.z, speed: s.speed, action: s.action, flashlight: s.flashlight, aimYaw: s.aimYaw, aimPitch: s.aimPitch };

    // Name tag: fade with distance; hide behind walls (checked every 4th frame).
    if (!tag.current) return;
    tagWorld.set(s.x, s.y + TAG_HEIGHT, s.z);
    const dist = camera.position.distanceTo(tagWorld);
    let opacity = dist <= TAG_FULL ? 1 : Math.max(0, 1 - (dist - TAG_FULL) / (TAG_GONE - TAG_FULL));
    if (opacity > 0 && frame.current++ % 4 === 0) {
      const dir = tagWorld.clone().sub(camera.position).normalize();
      const hit = world.castRay(new rapier.Ray(camera.position, dir), dist, true, undefined, undefined, undefined, undefined,
        (c) => c.handle !== collider.current?.handle && c.handle !== playerState.colliderHandle && !invisibleColliders.has(c.handle));
      tag.current.dataset.occluded = hit && hit.timeOfImpact < dist - 0.3 ? "1" : "";
    }
    if (tag.current.dataset.occluded) opacity = 0;
    tag.current.style.opacity = String(opacity);
    b.tagVisible = opacity > 0.05;
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[start.x, start.y + CAPSULE_CENTER, start.z]}>
      <CapsuleCollider ref={collider} args={[CAPSULE.halfHeight, CAPSULE.radius]} />
      <group ref={visual} position-y={-CAPSULE_CENTER}>
        <primitive object={model} />
      </group>
      <Html position={[0, TAG_HEIGHT - CAPSULE_CENTER, 0]} center zIndexRange={[10, 0]}>
        <div ref={tag} className={`name-tag${bear?.connected === false ? " away" : ""}`} data-testid={`tag-${id}`}>
          {bear?.name}
        </div>
      </Html>
    </RigidBody>
  );
}
