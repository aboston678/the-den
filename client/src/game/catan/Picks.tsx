import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BoxGeometry, CylinderGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D, SphereGeometry } from "three";
import { catanSend } from "../../net/party.ts";
import { HEX, TILE_TOP, edgePos, hexPos, vertexPos } from "./layout.ts";
import { useCatan } from "./store.ts";
import { type Spots, clickable, closeAll, me, useCatanUi } from "./ui.ts";

// Glowing markers on every spot you can click right now (GAME_SPEC §16): corners for settlements
// and cities, edges for roads, hexes for the robber. Clicking one sends the move to the server.

const tmp = new Object3D();
const hidden = new Matrix4().makeScale(0, 0, 0);

function markers(geo: BoxGeometry | SphereGeometry | CylinderGeometry, n: number) {
  const m = new InstancedMesh(geo, new MeshBasicMaterial({ color: "#fff6c8", transparent: true, opacity: 0.85, depthWrite: false }), n);
  m.frustumCulled = false;
  m.renderOrder = 5;
  for (let i = 0; i < n; i++) m.setMatrixAt(i, hidden);
  return m;
}

export function Picks() {
  const meshes = useMemo(() => ({
    vertex: markers(new SphereGeometry(0.014, 12, 8), 54),
    edge: markers(new BoxGeometry(0.012, 0.01, 1), 72),
    hex: markers(new CylinderGeometry(HEX * 0.42, HEX * 0.42, 0.006, 24), 19),
  }), []);
  const live = useRef<Spots | null>(null);
  const key = useRef("");

  useFrame(({ clock }) => {
    const { view } = useCatan.getState();
    const { index } = me();
    const spots = clickable(view, index, useCatanUi.getState().tool);
    live.current = spots;
    const k = spots ? `${spots.kind}:${spots.ids.join(",")}` : "";
    const pulse = 0.55 + 0.35 * Math.sin(clock.elapsedTime * 5);
    for (const m of Object.values(meshes)) (m.material as MeshBasicMaterial).opacity = pulse;
    if (k === key.current) return;
    key.current = k;
    for (const [kind, m] of Object.entries(meshes)) {
      const ids = spots?.kind === kind ? spots.ids : [];
      for (let i = 0; i < m.count; i++) {
        const id = ids[i];
        if (id === undefined) {
          m.setMatrixAt(i, hidden);
          continue;
        }
        if (kind === "vertex") {
          const [x, y, z] = vertexPos(id);
          tmp.position.set(x, y + 0.012, z);
          tmp.rotation.set(0, 0, 0);
          tmp.scale.set(1, 1, 1);
        } else if (kind === "edge") {
          const p = edgePos(id);
          tmp.position.set(p.x, TILE_TOP + 0.006, p.z);
          tmp.rotation.set(0, p.yaw, 0);
          tmp.scale.set(1, 1, p.len * 0.6);
        } else {
          const [x, , z] = hexPos(id);
          tmp.position.set(x, TILE_TOP + 0.02, z);
          tmp.rotation.set(0, 0, 0);
          tmp.scale.set(1, 1, 1);
        }
        tmp.updateMatrix();
        m.setMatrixAt(i, tmp.matrix);
      }
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  });

  const click = (kind: Spots["kind"]) => (e: ThreeEvent<MouseEvent>) => {
    const spots = live.current;
    if (!spots || spots.kind !== kind || e.instanceId === undefined) return;
    const id = spots.ids[e.instanceId];
    if (id === undefined) return;
    e.stopPropagation();
    catanSend.act(spots.act(id));
    closeAll();
  };
  const hover = (on: boolean) => () => {
    document.body.style.cursor = on ? "pointer" : "";
  };

  return (
    <>
      {(["vertex", "edge", "hex"] as const).map((kind) => (
        <primitive key={kind} object={meshes[kind]} onClick={click(kind)} onPointerOver={hover(true)} onPointerOut={hover(false)} />
      ))}
    </>
  );
}
