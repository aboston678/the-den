import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo } from "react";
import { CylinderGeometry, type Group as GroupT, Group, Mesh, MeshStandardMaterial, type Object3D, TorusGeometry, Vector3 } from "three";
import type { BearAction } from "../state.ts";
import { CAST_RELEASE_S } from "../player/BearAnimator.ts";

// The fishing rod in a bear's right paw (GAME_SPEC §13), for our bear and everyone else's. The rod
// follows the paw's position; its angle comes from what the bear is doing (held forward, swung
// back and over on a cast, raised high while fighting a fish), which reads better than trusting
// the paw's own twist through every clip. Each frame the rod tip's position is published here so
// the fishing line can hang from it.

export const ROD_LENGTH = 2.3;

/** Where each bear's rod tip and paw are this frame ("me" for our own bear). */
export const rigs = new Map<string, { tip: Vector3; hand: Vector3; yaw: number; visible: boolean }>();

function makeRod() {
  const g = new Group();
  g.name = "fishing-rod";
  const blank = new MeshStandardMaterial({ color: "#2a2f2c", roughness: 0.35, metalness: 0.3 });
  const cork = new MeshStandardMaterial({ color: "#b8925e", roughness: 0.9 });
  const metal = new MeshStandardMaterial({ color: "#b9bcbf", roughness: 0.3, metalness: 0.9 });
  const add = (geo: CylinderGeometry | TorusGeometry, mat: MeshStandardMaterial, y: number, rx = 0) => {
    const m = new Mesh(geo, mat);
    m.position.y = y;
    m.rotation.x = rx;
    m.castShadow = true;
    g.add(m);
  };
  // Built along +y from the butt; the paw holds it 0.3 m up.
  add(new CylinderGeometry(0.02, 0.022, 0.42, 8).translate(0, 0.21, 0), cork, 0);
  add(new CylinderGeometry(0.035, 0.035, 0.05, 12).rotateZ(Math.PI / 2), metal, 0.5); // reel
  add(new CylinderGeometry(0.003, 0.012, ROD_LENGTH - 0.42, 6).translate(0, (ROD_LENGTH - 0.42) / 2, 0), blank, 0.42);
  for (const y of [0.8, 1.2, 1.55, 1.85, 2.1]) add(new TorusGeometry(0.012, 0.002, 4, 8), metal, y, Math.PI / 2);
  const tip = new Group();
  tip.position.y = ROD_LENGTH;
  tip.name = "rod-tip";
  g.add(tip);
  g.position.y = -0.3; // so the grip sits in the paw
  const holder = new Group();
  holder.add(g);
  return { holder, tip };
}

/** How far the rod leans forward from straight up (radians) for an action, `t` seconds into it. */
function rodLean(action: BearAction, t: number) {
  if (action === "cast") {
    // Swing back over the shoulder, then whip forward on release and settle pointing out.
    const k = t / CAST_RELEASE_S;
    if (k < 0.55) return -0.6 - 0.5 * (k / 0.55);
    if (k < 1) return -1.1 + 2.5 * ((k - 0.55) / 0.45);
    return 1.4 - 0.2 * Math.min(1, (k - 1) * 2);
  }
  if (action === "reel") return 0.55 + Math.sin(t * 9) * 0.04; // held high, bucking a little
  if (action === "celebrate") return 0.1;
  return 1.0; // carried pointing forward and up
}

const handPos = new Vector3();

/**
 * Give a bear model a rod. `state()` says whether it's holding one and what it's doing.
 * The rod is drawn as part of `parent` (the bear's turning group).
 */
export function useRod(id: string, model: Object3D, parent: RefObject<GroupT | null>, state: () => { rod: boolean; action: BearAction; yaw: number }) {
  const rod = useMemo(makeRod, []);
  const hand = useMemo(() => model.getObjectByName("RightHand") ?? null, [model]);
  const timer = useMemo(() => ({ action: "" as string, t: 0 }), []);

  useEffect(() => {
    const p = parent.current;
    p?.add(rod.holder);
    return () => {
      p?.remove(rod.holder);
      rigs.delete(id);
    };
  }, [rod, parent, id]);

  useFrame((_, dt) => {
    const p = parent.current;
    const s = state();
    rod.holder.visible = s.rod && !!hand && !!p;
    if (!rod.holder.visible || !hand || !p) {
      rigs.delete(id);
      return;
    }
    if (timer.action !== s.action) (timer.action = s.action), (timer.t = 0);
    timer.t += dt;
    // Into the turning group's space: the group already faces the bear's way.
    hand.getWorldPosition(handPos);
    p.updateWorldMatrix(true, false);
    rod.holder.position.copy(p.worldToLocal(handPos.clone()));
    rod.holder.rotation.set(rodLean(s.action, timer.t), 0, -0.12);
    rod.holder.updateMatrixWorld(true);
    const r = rigs.get(id) ?? { tip: new Vector3(), hand: new Vector3(), yaw: 0, visible: true };
    rod.tip.getWorldPosition(r.tip);
    r.hand.copy(handPos);
    r.yaw = s.yaw;
    r.visible = true;
    rigs.set(id, r);
  });
}
