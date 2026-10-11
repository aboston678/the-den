import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { HOUSE_SCALE } from "@den/shared";

// Milestone 1.6 test field: everything the bear will meet in the house, at house scale.
// Replaced by the real property map in milestone 1.8.

const STEP_RISE = 0.19 * HOUSE_SCALE; // a real 19 cm stair rise
const STEP_RUN = 0.28 * HOUSE_SCALE;
const DOOR_W = 0.9 * HOUSE_SCALE;
const DOOR_H = 2.03 * HOUSE_SCALE;
const CEILING = 2.6 * HOUSE_SCALE;

function Block({ position, size, color = "#8a8f87", rotation = [0, 0, 0] as [number, number, number] }: {
  position: [number, number, number];
  size: [number, number, number];
  color?: string;
  rotation?: [number, number, number];
}) {
  return (
    <RigidBody type="fixed" position={position} rotation={rotation} colliders="cuboid">
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </RigidBody>
  );
}

/** Ramp rising toward -z, `angle` degrees, starting at `z`. */
function Ramp({ x, z, angle, length = 8, width = 3, color }: { x: number; z: number; angle: number; length?: number; width?: number; color: string }) {
  const a = (angle * Math.PI) / 180;
  const rise = Math.sin(a) * length;
  const run = Math.cos(a) * length;
  return <Block position={[x, rise / 2 - 0.05, z - run / 2]} size={[width, 0.1, length]} rotation={[a, 0, 0]} color={color} />;
}

function Stairs({ x, z, steps = 9, width = 1.5 }: { x: number; z: number; steps?: number; width?: number }) {
  const top = steps * STEP_RISE;
  return (
    <>
      {Array.from({ length: steps }, (_, i) => (
        <Block key={i} position={[x, (i + 1) * STEP_RISE / 2, z - i * STEP_RUN - STEP_RUN / 2]} size={[width, (i + 1) * STEP_RISE, STEP_RUN]} color="#b08a5a" />
      ))}
      <Block position={[x, top / 2, z - steps * STEP_RUN - 1.5]} size={[width + 1, top, 3]} color="#9a7a50" />
    </>
  );
}

/** A small room with a house-size doorway and ceiling, to test the camera indoors. */
function Room({ x, z }: { x: number; z: number }) {
  const w = 6, d = 6, t = 0.2, wall = "#e7dcc6";
  const side = (w - DOOR_W) / 2;
  return (
    <>
      <Block position={[x, CEILING / 2, z - d / 2]} size={[w, CEILING, t]} color={wall} />
      <Block position={[x - w / 2, CEILING / 2, z]} size={[t, CEILING, d]} color={wall} />
      <Block position={[x + w / 2, CEILING / 2, z]} size={[t, CEILING, d]} color={wall} />
      {/* front wall with a doorway in the middle */}
      <Block position={[x - (DOOR_W + side) / 2, CEILING / 2, z + d / 2]} size={[side, CEILING, t]} color={wall} />
      <Block position={[x + (DOOR_W + side) / 2, CEILING / 2, z + d / 2]} size={[side, CEILING, t]} color={wall} />
      <Block position={[x, (CEILING + DOOR_H) / 2, z + d / 2]} size={[DOOR_W, CEILING - DOOR_H, t]} color={wall} />
      <Block position={[x, CEILING + t / 2, z]} size={[w + t, t, d + t]} color="#cfc6b4" />
    </>
  );
}

export function TestGround() {
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[60, 0.5, 60]} position={[0, -0.5, 0]} />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[120, 120]} />
          <meshStandardMaterial color="#4f6b3a" roughness={1} />
        </mesh>
      </RigidBody>

      {/* 1 m stripes along a lane to judge speed */}
      {Array.from({ length: 20 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[-3, 0.005, -2 - i]} receiveShadow>
          <planeGeometry args={[1.2, 0.08]} />
          <meshStandardMaterial color={i % 5 === 4 ? "#e0712c" : "#d8d2c0"} />
        </mesh>
      ))}

      <Ramp x={4} z={-4} angle={20} color="#7d8a6c" />
      <Ramp x={8} z={-4} angle={55} length={5} color="#8b5a4a" />
      <Stairs x={12} z={-4} />
      <Room x={-12} z={-10} />
      {/* narrow corridor */}
      <Block position={[-20, 1.6, -6]} size={[0.2, 3.2, 8]} color="#b9b2a2" />
      <Block position={[-21.6, 1.6, -6]} size={[0.2, 3.2, 8]} color="#b9b2a2" />
      {/* box to jump onto (0.9 m, under the 1.1 m jump) */}
      <Block position={[4, 0.45, 6]} size={[2, 0.9, 2]} color="#6f7f8f" />

      {/* crates to shove */}
      {[0, 1, 2].map((i) => (
        <RigidBody key={i} position={[-4 + i * 1.2, 0.4 + i * 0.01, 6]} colliders="cuboid" mass={20}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.8, 0.8, 0.8]} />
            <meshStandardMaterial color="#a0703c" roughness={0.8} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
