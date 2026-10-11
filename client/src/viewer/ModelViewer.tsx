import { ContactShadows, Environment, Lightformer, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { BEAR, HOUSE_SCALE } from "@den/shared";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Box3, type Group, type Mesh, type SkinnedMesh, Vector3 } from "three";

// A real interior door is 2.03 m; the house is built 1.25× bigger (GAME_SPEC §4).
const DOOR_HEIGHT = 2.03 * HOUSE_SCALE;
const DOOR_WIDTH = 0.9 * HOUSE_SCALE;

interface ModelStats {
  heightM: number;
  triangles: number;
  bones: number;
  clips: string[];
}

export function ModelViewer({ url }: { url: string }) {
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [clip, setClip] = useState<string | null>(null);
  const [spin, setSpin] = useState(true);

  return (
    <>
      <Canvas shadows="percentage" camera={{ position: [0, 1.6, 5.2], fov: 40 }}>
        <color attach="background" args={["#1f2a22"]} />
        <ambientLight intensity={0.25} />
        <directionalLight position={[3, 5, 4]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} />
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={2} position={[0, 4, 4]} scale={[6, 3, 1]} />
          <Lightformer form="rect" intensity={1} position={[-5, 2, -2]} rotation-y={Math.PI / 2} scale={[4, 3, 1]} />
          <Lightformer form="rect" intensity={0.6} color="#ffd9b0" position={[5, 1, -3]} rotation-y={-Math.PI / 2} scale={[4, 3, 1]} />
        </Environment>
        <Suspense fallback={null}>
          <Turntable spin={spin}>
            <Model url={url} clip={clip} onLoaded={(s) => { setStats(s); setClip(s.clips[0] ?? null); }} />
          </Turntable>
        </Suspense>
        <Doorway />
        <ContactShadows position={[0, 0.001, 0]} opacity={0.6} scale={8} blur={2.2} far={3} />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[4, 64]} />
          <meshStandardMaterial color="#2b3a2e" roughness={1} />
        </mesh>
        <OrbitControls target={[0, 1.05, 0]} minDistance={1.5} maxDistance={10} />
      </Canvas>

      <div className="viewer-panel" data-testid="viewer-panel" data-loaded={stats ? "yes" : "no"}>
        <strong>THE DEN · model viewer</strong>
        <code>{url}</code>
        {stats ? (
          <>
            <span>Height: {stats.heightM.toFixed(2)} m (target {BEAR.heightM} m) · door frame {DOOR_HEIGHT.toFixed(2)} m</span>
            <span>{stats.triangles.toLocaleString()} triangles · {stats.bones} bones</span>
            <div className="viewer-clips">
              {stats.clips.map((name) => (
                <button key={name} className={name === clip ? "active" : ""} onClick={() => setClip(name)}>
                  {name}
                </button>
              ))}
              {stats.clips.length === 0 && <span>No animation clips</span>}
            </div>
            <label>
              <input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} /> Turntable
            </label>
          </>
        ) : (
          <span>Loading…</span>
        )}
      </div>
    </>
  );
}

function Turntable({ spin, children }: { spin: boolean; children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (spin && ref.current) ref.current.rotation.y += dt * 0.4;
  });
  return <group ref={ref}>{children}</group>;
}

function Model({ url, clip, onLoaded }: { url: string; clip: string | null; onLoaded: (s: ModelStats) => void }) {
  const gltf = useGLTF(url);
  const { actions } = useAnimations(gltf.animations, gltf.scene);

  const stats = useMemo<ModelStats>(() => {
    let triangles = 0;
    const bones = new Set<string>();
    gltf.scene.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        const geo = mesh.geometry;
        triangles += (geo.index ? geo.index.count : geo.attributes.position!.count) / 3;
        const skinned = obj as SkinnedMesh;
        if (skinned.isSkinnedMesh) skinned.skeleton.bones.forEach((b) => bones.add(b.uuid));
      }
    });
    const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
    return { heightM: size.y, triangles, bones: bones.size, clips: gltf.animations.map((a) => a.name) };
  }, [gltf]);

  useEffect(() => onLoaded(stats), [stats]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!clip) return;
    const action = actions[clip];
    action?.reset().fadeIn(0.2).play();
    return () => {
      action?.fadeOut(0.2);
    };
  }, [clip, actions]);

  return <primitive object={gltf.scene} />;
}

/** A doorway at house scale, off to the side, to check the bear fits. */
function Doorway() {
  const post = 0.1;
  return (
    <group position={[-1.9, 0, -0.6]} rotation-y={0.5}>
      <mesh position={[-DOOR_WIDTH / 2 - post / 2, DOOR_HEIGHT / 2, 0]} castShadow>
        <boxGeometry args={[post, DOOR_HEIGHT, 0.15]} />
        <meshStandardMaterial color="#efe6d2" />
      </mesh>
      <mesh position={[DOOR_WIDTH / 2 + post / 2, DOOR_HEIGHT / 2, 0]} castShadow>
        <boxGeometry args={[post, DOOR_HEIGHT, 0.15]} />
        <meshStandardMaterial color="#efe6d2" />
      </mesh>
      <mesh position={[0, DOOR_HEIGHT + post / 2, 0]} castShadow>
        <boxGeometry args={[DOOR_WIDTH + post * 2, post, 0.15]} />
        <meshStandardMaterial color="#efe6d2" />
      </mesh>
    </group>
  );
}
