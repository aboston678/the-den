import { ContactShadows, Environment, Lightformer, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { BEAR, HOUSE_SCALE } from "@den/shared";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { type AnimationClip, Box3, type Group, type Mesh, type SkinnedMesh, Vector3 } from "three";

// A real interior door is 2.03 m; the house is built 1.25× bigger (GAME_SPEC §4).
const DOOR_HEIGHT = 2.03 * HOUSE_SCALE;
const DOOR_WIDTH = 0.9 * HOUSE_SCALE;

interface ModelStats {
  heightM: number;
  triangles: number;
  bones: number;
  clips: string[];
}

export function ModelViewer({
  url,
  compareUrl,
  clipFiles = [],
  initialSpin = true,
  initialAngle = 0,
  initialClip = null,
  freezeAt = null,
}: {
  url: string;
  compareUrl?: string | null;
  clipFiles?: string[];
  initialSpin?: boolean;
  initialAngle?: number;
  initialClip?: string | null;
  freezeAt?: number | null;
}) {
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [clip, setClip] = useState<string | null>(null);
  const [spin, setSpin] = useState(initialSpin);

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
          <group position-x={compareUrl ? 0.85 : 0}>
            <Turntable spin={spin} angle={initialAngle}>
              <Model
                url={url}
                clipFiles={clipFiles}
                clip={clip}
                freezeAt={freezeAt}
                onLoaded={(s) => {
                  setStats(s);
                  setClip(initialClip && s.clips.includes(initialClip) ? initialClip : (s.clips.at(-1) ?? null));
                }}
              />
            </Turntable>
          </group>
          {compareUrl && (
            <group position-x={-0.85}>
              <Turntable spin={spin} angle={initialAngle}>
                <Model url={compareUrl} clip={clip} freezeAt={freezeAt} onLoaded={() => {}} />
              </Turntable>
            </group>
          )}
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
        {compareUrl && <code>left: {compareUrl} · right: {url}</code>}
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

function Turntable({ spin, angle, children }: { spin: boolean; angle: number; children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  useEffect(() => {
    if (ref.current) ref.current.rotation.y = angle;
  }, [angle]);
  useFrame((_, dt) => {
    if (spin && ref.current) ref.current.rotation.y += dt * 0.4;
  });
  return <group ref={ref}>{children}</group>;
}

function Model({
  url,
  clipFiles = [],
  clip,
  freezeAt = null,
  onLoaded,
}: {
  url: string;
  clipFiles?: string[];
  clip: string | null;
  freezeAt?: number | null;
  onLoaded: (s: ModelStats) => void;
}) {
  const gltf = useGLTF(url);
  const extra = useGLTF(clipFiles) as unknown as { animations: AnimationClip[] }[];
  // Clips from other files drive this model's bones by name, so they only work if the
  // skeletons match. Name each borrowed clip after its file so they're easy to tell apart.
  const animations = useMemo(
    () => [
      ...gltf.animations,
      ...extra.flatMap((g, i) =>
        g.animations.map((a) => {
          const c = a.clone();
          c.name = `${clipFiles[i]!.split("/").pop()!.replace(".glb", "")}: ${a.name}`;
          return c;
        }),
      ),
    ],
    [gltf, extra, clipFiles],
  );
  const { actions } = useAnimations(animations, gltf.scene);

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
    return { heightM: size.y, triangles, bones: bones.size, clips: animations.map((a) => a.name) };
  }, [gltf, animations]);

  useEffect(() => onLoaded(stats), [stats]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!clip) return;
    // A compared model may name its clips differently; fall back to its first clip.
    const action = actions[clip] ?? Object.values(actions)[0];
    if (freezeAt !== null && action) {
      action.reset().play();
      action.time = freezeAt;
      action.paused = true;
    } else {
      action?.reset().fadeIn(0.2).play();
    }
    return () => {
      action?.fadeOut(0.2);
    };
  }, [clip, actions, freezeAt]);

  return <primitive object={gltf.scene} />;
}

/** A doorway at house scale, off to the side, to check the bear fits. */
function Doorway() {
  const post = 0.1;
  return (
    <group position={[-2.6, 0, -0.9]} rotation-y={0.5}>
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
