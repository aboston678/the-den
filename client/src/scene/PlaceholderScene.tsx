import { OrbitControls, Sky } from "@react-three/drei";
import { CapsuleCollider, CuboidCollider, Physics, RigidBody } from "@react-three/rapier";
import { BEAR } from "@den/shared";

// Stand-in world for milestone 1.1: proves rendering, shadows and physics all run.
// The capsule is the bear's future collision shape (2.1 m tall) and drops onto the ground.

const BEAR_RADIUS = 0.45;
const HALF_HEIGHT = BEAR.heightM / 2 - BEAR_RADIUS;

export function PlaceholderScene() {
  return (
    <>
      <color attach="background" args={["#9fb7c9"]} />
      <fog attach="fog" args={["#9fb7c9", 30, 120]} />
      <Sky sunPosition={[40, 25, -30]} turbidity={6} rayleigh={1.5} />
      <hemisphereLight args={["#dfe9f3", "#3c4a2e", 0.6]} />
      <directionalLight
        position={[40, 25, -30]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />

      <Physics gravity={[0, -BEAR.gravity, 0]}>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[50, 0.5, 50]} position={[0, -0.5, 0]} />
          <mesh rotation-x={-Math.PI / 2} receiveShadow>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#4f6b3a" roughness={1} />
          </mesh>
        </RigidBody>

        <RigidBody colliders={false} position={[0, 4, 0]} enabledRotations={[false, false, false]}>
          <CapsuleCollider args={[HALF_HEIGHT, BEAR_RADIUS]} />
          <mesh castShadow position-y={0}>
            <capsuleGeometry args={[BEAR_RADIUS, HALF_HEIGHT * 2, 8, 16]} />
            <meshStandardMaterial color="#5a3d26" roughness={0.9} />
          </mesh>
        </RigidBody>
      </Physics>

      <OrbitControls target={[0, 1, 0]} maxPolarAngle={Math.PI / 2 - 0.05} />
    </>
  );
}
