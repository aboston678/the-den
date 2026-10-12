import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { type Group, MeshStandardMaterial, Vector3 } from "three";
import { useBearModel } from "../../game/player/useBearModel.ts";

// The home screen's 3D stage (GAME_SPEC §11.3): your bear on a slowly turning round pedestal
// (drag to spin it), your party's bears standing beside you with name tags, in a moody warm-lit
// clearing. Everyone just breathes in the Idle clip.

export interface StageBear {
  id: string;
  name: string;
  you: boolean;
}

/** Where party members stand (you're in the middle on the pedestal), and how they're turned. */
const SPOTS: [number, number, number][] = [[0, 0, 0], [2.3, -0.9, -0.35], [-2.3, -0.9, 0.35], [4.3, -2, -0.5], [-4.3, -2, 0.5], [6.1, -3.2, -0.6]];
const PEDESTAL_TOP = 0.28;

const spin = { yaw: 0, dragging: false, lastX: 0, idle: 0 };
/** Name tags are plain page elements (outside the 3D canvas), moved each frame to sit over each bear's head. */
const tags = new Map<string, HTMLDivElement>();
const tagWorld = new Vector3();

function Bear({ bear, index }: { bear: StageBear; index: number }) {
  const { model, animator } = useBearModel();
  const group = useRef<Group>(null);
  const [x, z, turn] = SPOTS[index] ?? SPOTS[SPOTS.length - 1]!;
  useEffect(() => {
    animator.update(Math.random() * 3, 0); // don't breathe in step with each other
  }, [animator]);
  const camera = useThree((st) => st.camera);
  const size = useThree((st) => st.size);
  useFrame((_, dt) => {
    animator.update(Math.min(dt, 0.1), 0);
    if (group.current && bear.you) group.current.rotation.y = spin.yaw;
    const tag = tags.get(bear.id);
    if (tag) {
      tagWorld.set(x, (bear.you ? PEDESTAL_TOP : 0) + 2.3, z).project(camera);
      tag.style.transform = `translate(-50%, -50%) translate(${((tagWorld.x + 1) / 2) * size.width}px, ${((1 - tagWorld.y) / 2) * size.height}px)`;
      tag.style.opacity = "1";
    }
  });
  return (
    <group ref={group} position={[x, bear.you ? PEDESTAL_TOP : 0, z]} rotation-y={turn}>
      <primitive object={model} />
    </group>
  );
}

function Pedestal() {
  const ring = useMemo(() => new MeshStandardMaterial({ color: "#2a1a10", emissive: "#e0712c", emissiveIntensity: 1.6 }), []);
  return (
    <group>
      <mesh position-y={PEDESTAL_TOP / 2} receiveShadow castShadow>
        <cylinderGeometry args={[1.15, 1.25, PEDESTAL_TOP, 64]} />
        <meshStandardMaterial color="#2e2a24" roughness={0.85} />
      </mesh>
      <mesh position-y={PEDESTAL_TOP + 0.002} rotation-x={-Math.PI / 2} material={ring}>
        <ringGeometry args={[1.08, 1.13, 96]} />
      </mesh>
    </group>
  );
}

/** Drag anywhere on the stage to spin your bear; it turns slowly by itself when left alone. */
function SpinControls() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      spin.dragging = true;
      spin.lastX = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (!spin.dragging) return;
      spin.yaw += (e.clientX - spin.lastX) * 0.01;
      spin.lastX = e.clientX;
      spin.idle = 0;
    };
    const up = () => {
      spin.dragging = false;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [gl]);
  useFrame((_, dt) => {
    spin.idle += dt;
    if (!spin.dragging && spin.idle > 2) spin.yaw += dt * 0.25;
  });
  return null;
}

export function HomeStage({ bears }: { bears: StageBear[] }) {
  return (
    <div className="home-stage" data-testid="home-stage">
      <Canvas shadows="percentage" camera={{ position: [-1.6, 1.7, 8.2], fov: 38 }} onCreated={({ camera }) => camera.lookAt(-1.6, 1.15, 0)}>
        <color attach="background" args={["#0b100d"]} />
        <fog attach="fog" args={["#0b100d", 9, 22]} />
        <hemisphereLight args={["#8fa3b8", "#1a140e", 0.35]} />
        {/* Warm key light from the front-right, a cool rim from behind, an ember glow from below. */}
        <spotLight position={[4, 7, 6]} angle={0.55} penumbra={0.6} intensity={140} color="#ffd6a8" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />
        <spotLight position={[-3, 5, -5]} angle={0.7} penumbra={0.8} intensity={90} color="#9fb8d6" />
        <pointLight position={[0, 0.6, 1.8]} intensity={4} distance={5} color="#e0712c" />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[14, 64]} />
          <meshStandardMaterial color="#17130f" roughness={1} />
        </mesh>
        <Pedestal />
        <Suspense fallback={null}>
          {bears.slice(0, SPOTS.length).map((b, i) => <Bear key={b.id} bear={b} index={i} />)}
        </Suspense>
        <SpinControls />
      </Canvas>
      {bears.slice(0, SPOTS.length).map((b) => (
        <div
          key={b.id}
          ref={(el) => {
            if (el) tags.set(b.id, el);
            else tags.delete(b.id);
          }}
          className={`name-tag home-tag${b.you ? " you" : ""}`}
          style={{ opacity: 0 }}
        >
          {b.name}
        </div>
      ))}
    </div>
  );
}
