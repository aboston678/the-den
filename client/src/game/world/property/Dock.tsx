import { DOCK, STREAM, dockStartX, rodBucket } from "@den/shared";
import { CuboidCollider, CylinderCollider, type RapierCollider, RigidBody } from "@react-three/rapier";
import { useMemo } from "react";
import { MeshStandardMaterial } from "three";
import { useOutdoorMaps } from "./textures.ts";
import { groundY } from "../ground.ts";
import { invisibleColliders } from "../invisible.ts";

// The wooden dock (GAME_SPEC §4): 1.8 m wide, 8 m long, straight out east from our bank, and the
// bucket of fishing rods at its base (static until fishing arrives in milestone 2.4).

const BOARD = 0.12; // deck thickness
const BED_Y = -10.6; // posts go down to the stream bed

/** Ref callback: register a collider as an invisible barrier (cameras see through it). */
const invisible = (c: RapierCollider | null) => {
  if (c) invisibleColliders.add(c.handle);
};

export function Dock() {
  const maps = useOutdoorMaps("planks");
  const x0 = dockStartX();
  const cx = x0 + DOCK.length / 2;
  const deck = useMemo(() => {
    const m = new MeshStandardMaterial({ ...maps, color: "#c9c2b6" });
    m.map = maps.map.clone();
    m.map.repeat.set(DOCK.length / 2, DOCK.width / 2); // boards run across the dock
    m.map.needsUpdate = true;
    return m;
  }, [maps]);
  const wood = useMemo(() => new MeshStandardMaterial({ ...maps, color: "#6d6256" }), [maps]);

  const posts: [number, number][] = [];
  for (let x = x0 + 0.3; x <= x0 + DOCK.length; x += 2) posts.push([x, DOCK.z - DOCK.width / 2 + 0.08], [x, DOCK.z + DOCK.width / 2 - 0.08]);
  // Invisible rails where the dock is over deep water (past the wading limit): walk to the end, don't fall off.
  const railFrom = Math.max(x0, x0 - DOCK.startD + STREAM.wadeLimitD);
  const railLen = x0 + DOCK.length - railFrom;

  return (
    <group name="dock">
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[DOCK.length / 2, BOARD / 2, DOCK.width / 2]} position={[cx, DOCK.deckY - BOARD / 2, DOCK.z]} />
        {[-1, 1].map((side) => (
          <CuboidCollider key={side} ref={invisible} args={[railLen / 2, 1, 0.05]} position={[railFrom + railLen / 2, DOCK.deckY + 1, DOCK.z + side * (DOCK.width / 2 + 0.05)]} />
        ))}
        <CuboidCollider ref={invisible} args={[0.05, 1, DOCK.width / 2 + 0.1]} position={[x0 + DOCK.length + 0.05, DOCK.deckY + 1, DOCK.z]} />
      </RigidBody>
      <mesh material={deck} position={[cx, DOCK.deckY - BOARD / 2, DOCK.z]} castShadow receiveShadow>
        <boxGeometry args={[DOCK.length, BOARD, DOCK.width]} />
      </mesh>
      {/* Frame under the boards, and posts down to the bed. */}
      {[-1, 1].map((side) => (
        <mesh key={side} material={wood} position={[cx, DOCK.deckY - BOARD - 0.1, DOCK.z + side * (DOCK.width / 2 - 0.1)]} castShadow>
          <boxGeometry args={[DOCK.length, 0.2, 0.08]} />
        </mesh>
      ))}
      {posts.map(([x, z], i) => {
        const top = DOCK.deckY - BOARD, bottom = Math.min(BED_Y, groundY(x, z) - 0.3);
        return (
          <mesh key={i} material={wood} position={[x, (top + bottom) / 2, z]} castShadow>
            <cylinderGeometry args={[0.09, 0.1, top - bottom, 8]} />
          </mesh>
        );
      })}
      <RodBucket />
    </group>
  );
}

/** A galvanised bucket with four fishing rods leaning in it. */
function RodBucket() {
  const b = rodBucket();
  const y = groundY(b.x, b.z);
  const rods = [0.3, 1.9, 3.4, 5.0];
  return (
    <group position={[b.x, y, b.z]} name="rod-bucket">
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.22, 0.24]} position={[0, 0.22, 0]} />
      </RigidBody>
      <mesh position-y={0.22} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.19, 0.44, 20, 1, true]} />
        <meshStandardMaterial color="#9aa1a3" metalness={0.85} roughness={0.42} side={2} />
      </mesh>
      <mesh position-y={0.02}>
        <cylinderGeometry args={[0.19, 0.19, 0.02, 20]} />
        <meshStandardMaterial color="#7c8284" metalness={0.8} roughness={0.5} />
      </mesh>
      {rods.map((a, i) => (
        <group key={i} position={[Math.cos(a) * 0.08, 0.05, Math.sin(a) * 0.08]} rotation={[Math.sin(a) * 0.16, 0, Math.cos(a) * 0.16]}>
          <mesh position-y={1.1} castShadow>
            <cylinderGeometry args={[0.004, 0.009, 2.1, 6]} />
            <meshStandardMaterial color={i % 2 ? "#2b2b2e" : "#4a3a2a"} roughness={0.4} />
          </mesh>
          <mesh position-y={0.28}>
            <cylinderGeometry args={[0.016, 0.016, 0.32, 8]} />
            <meshStandardMaterial color="#b08a5e" roughness={0.9} />
          </mesh>
          <mesh position={[0.03, 0.5, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.04, 12]} />
            <meshStandardMaterial color="#5c5f63" metalness={0.7} roughness={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
