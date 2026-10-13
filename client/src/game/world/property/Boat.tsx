import { DOCK, STREAM, dockStartX } from "@den/shared";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, type RapierCollider, RigidBody } from "@react-three/rapier";
import { useMemo, useRef } from "react";
import { type Group, type Material, type Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { FURNITURE_URL } from "../../house/furniture/Furniture.tsx";
import { invisibleColliders } from "../invisible.ts";

// Andrew's wakeboard boat (GAME_SPEC §4, milestone 2.2): tied alongside the dock's south side with
// a bow line, a stern line and two fenders, rocking gently on the stream. Scenery only: a solid
// box keeps bears from walking through (or climbing on) it. Made with Higgsfield image→3D from
// his photo, brand name removed (tools/build-furniture.mjs).

const LENGTH = 6.9, BEAM = 3.11;
/** How far the hull sits below the waterline. */
const DRAFT = 0.42;

const invisible = (c: RapierCollider | null) => {
  if (c) invisibleColliders.add(c.handle);
};

type V3 = [number, number, number];

/** A straight rope between two points. */
function Rope({ from, to, material }: { from: V3; to: V3; material: Material }) {
  const a = new Vector3(...from), b = new Vector3(...to);
  const dir = b.clone().sub(a);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
  const mid = a.add(b).multiplyScalar(0.5);
  return (
    <mesh material={material} position={mid} quaternion={q}>
      <cylinderGeometry args={[0.012, 0.012, dir.length(), 6]} />
    </mesh>
  );
}

export function Boat() {
  const { scene } = useGLTF(FURNITURE_URL);
  const hull = useMemo(() => {
    const src = scene.getObjectByName("boat") as Mesh | undefined;
    if (!src) return null;
    const m = src.clone();
    m.castShadow = m.receiveShadow = true;
    return m;
  }, [scene]);
  const rope = useMemo(() => new MeshStandardMaterial({ color: "#e9e4d6", roughness: 0.9 }), []);
  const fender = useMemo(() => new MeshStandardMaterial({ color: "#f4f3ef", roughness: 0.5 }), []);
  const bob = useRef<Group>(null);

  // Alongside the outer half of the dock, a hand's width off its south edge.
  const cx = dockStartX() + DOCK.length - LENGTH / 2 - 0.3;
  const cz = DOCK.z + DOCK.width / 2 + 0.25 + BEAM / 2;
  const y = STREAM.waterY - DRAFT;
  const edge = DOCK.z + DOCK.width / 2;

  useFrame(({ clock }) => {
    const g = bob.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.position.y = y + Math.sin(t * 1.1) * 0.035;
    g.rotation.x = Math.sin(t * 0.8) * 0.018; // roll
    g.rotation.z = Math.sin(t * 0.6 + 1) * 0.008; // pitch
  });

  if (!hull) return null;
  return (
    <group name="boat">
      <group ref={bob} position={[cx, y, cz]}>
        <primitive object={hull} />
      </group>
      {/* Bow and stern lines from the dock's edge to the boat, and fenders hanging between them. */}
      {[-1, 1].map((s) => {
        const x = cx + s * (LENGTH / 2 - 0.7);
        const from: V3 = [x, DOCK.deckY + 0.05, edge], to: V3 = [x + s * 0.4, y + DRAFT + 0.55, cz - BEAM / 2 + 0.15];
        return (
          <group key={s}>
            <Rope from={from} to={to} material={rope} />
            <mesh material={fender} position={[cx + s * 1.2, STREAM.waterY + 0.25, edge + 0.13]} castShadow>
              <capsuleGeometry args={[0.1, 0.35, 4, 10]} />
            </mesh>
          </group>
        );
      })}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider ref={invisible} args={[LENGTH / 2, 3, BEAM / 2 - 0.1]} position={[cx, STREAM.waterY + 1.5, cz]} />
      </RigidBody>
    </group>
  );
}
