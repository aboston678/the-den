import { DOORS, DOOR_REACH, type Door, GARAGE_DOOR_HEIGHT, DOOR_HEIGHT, roomById } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { type RapierRigidBody, useRapier } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { type Group, type Material, type Mesh, Quaternion, Vector3 } from "three";
import { create } from "zustand";
import { toggleDoor, usePartyStore } from "../../net/party.ts";
import { consumePress } from "../input/keyboard.ts";
import { playerState } from "../state.ts";
import { S } from "./space.ts";
import type { HouseMaterials } from "./style.ts";
import { floorOf } from "./walls.ts";

// Every door in the house opens and closes with E, for the whole party (GAME_SPEC §8.2). Hinged and
// French doors swing, the patio door slides, garage doors tilt up into the garage. The utility room is
// locked. Leaves are solid while they move (kinematic colliders).

/** What the bottom-of-screen prompt says ("E  Open door"), or null. */
export const useDoorPrompt = create<{ text: string | null }>(() => ({ text: null }));

const LEAF_T = 0.045;
const SWING_S = 0.9; // seconds to open

interface Leaf {
  /** Pivot along the wall (floorplan metres) and which way the leaf extends from it. */
  hingeU: number;
  dir: 1 | -1;
  width: number;
  style: "panel" | "pine" | "glass" | "garage";
  kind: "swing" | "slide" | "tilt";
}

const bottomOf = (d: Door) => Math.max(floorOf(d.level, d.a), floorOf(d.level, ["outside", "deck", "porch"].includes(d.b) ? null : d.b));
const heightOf = (d: Door) => (d.type === "garage" ? GARAGE_DOOR_HEIGHT : DOOR_HEIGHT);

/** +1 if room a is on the +z/+x side of the door's wall (the door swings into room a). */
function swingSide(d: Door): 1 | -1 {
  const r = roomById(d.a);
  if (!r) return 1;
  const centre = d.axis === "x" ? r.z + r.d / 2 : r.x + r.w / 2;
  return centre > (d.axis === "x" ? d.z : d.x) ? 1 : -1;
}

function leavesOf(d: Door): Leaf[] {
  const u = d.axis === "x" ? d.x : d.z;
  const u0 = u - d.width / 2 + 0.02, u1 = u + d.width / 2 - 0.02, w = u1 - u0;
  const pine = [d.a, d.b].some((r) => r === "mudroom" || r === "kitchen" || r === "half_bath");
  const glassy = d.a === "greenhouse" && d.b === "outside";
  switch (d.type) {
    case "french": return [{ hingeU: u0, dir: 1, width: w / 2, style: "glass", kind: "swing" }, { hingeU: u1, dir: -1, width: w / 2, style: "glass", kind: "swing" }];
    case "sliding": return [{ hingeU: u0 + w / 2, dir: 1, width: w / 2, style: "glass", kind: "slide" }];
    case "garage": return [{ hingeU: u, dir: 1, width: w, style: "garage", kind: "tilt" }];
    default: return [{ hingeU: u0, dir: 1, width: w, style: glassy ? "glass" : pine ? "pine" : "panel", kind: "swing" }];
  }
}

/** Leaf meshes: the leaf box plus panels/glass/knob, built along +u from the pivot, hanging from y = 0 up. */
function LeafLook({ leaf, h, axis, m }: { leaf: Leaf; h: number; axis: "x" | "z"; m: HouseMaterials }) {
  const w = leaf.width, mid = (leaf.dir * w) / 2;
  const place = (u: number, y: number, d = 0): [number, number, number] => (axis === "x" ? [u, y, d] : [d, y, u]);
  const size = (lu: number, ly: number, ld: number): [number, number, number] => (axis === "x" ? [lu, ly, ld] : [ld, ly, lu]);
  const y0 = leaf.kind === "tilt" ? -h : 0; // garage doors hang down from their pivot at the top
  const body = leaf.style === "pine" ? "pine" : leaf.style === "glass" ? "trim" : "trim";
  const parts: { pos: [number, number, number]; size: [number, number, number]; mat: string }[] = [];
  if (leaf.style === "glass") {
    const f = 0.07;
    parts.push({ pos: place(mid, y0 + f / 2, 0), size: size(w, f, LEAF_T), mat: body });
    parts.push({ pos: place(mid, y0 + h - f / 2, 0), size: size(w, f, LEAF_T), mat: body });
    parts.push({ pos: place(leaf.dir * f / 2, y0 + h / 2, 0), size: size(f, h, LEAF_T), mat: body });
    parts.push({ pos: place(leaf.dir * (w - f / 2), y0 + h / 2, 0), size: size(f, h, LEAF_T), mat: body });
    parts.push({ pos: place(mid, y0 + h / 2, 0), size: size(w - 2 * f, h - 2 * f, 0.01), mat: "glass" });
    for (let i = 1; i < 5; i++) parts.push({ pos: place(mid, y0 + f + ((h - 2 * f) * i) / 5, 0), size: size(w - 2 * f, 0.02, 0.03), mat: "frame" });
    parts.push({ pos: place(mid, y0 + h / 2, 0), size: size(0.02, h - 2 * f, 0.03), mat: "frame" });
  } else {
    parts.push({ pos: place(mid, y0 + h / 2, 0), size: size(w, h, LEAF_T), mat: body });
    if (leaf.style === "garage") {
      for (let i = 1; i < 4; i++) parts.push({ pos: place(mid, y0 + (h * i) / 4, 0), size: size(w, 0.02, LEAF_T + 0.012), mat: "paint:#dcd9d1" });
      for (let i = 0; i < 4; i++) parts.push({ pos: place((w * (i + 0.5)) / 4 - w / 2 + mid, y0 + h * 0.82, 0), size: size(w / 4 - 0.12, 0.22, LEAF_T + 0.014), mat: "dark_glass" });
    } else {
      // Raised panels on both faces, and a brass knob.
      for (const [pu, pv, ph] of [[0.27, 0.72, 0.4], [0.73, 0.72, 0.4], [0.27, 0.28, 0.42], [0.73, 0.28, 0.42]] as const) {
        parts.push({ pos: place(leaf.dir * w * pu, y0 + h * pv, 0), size: size(w * 0.36, h * ph, LEAF_T + 0.016), mat: leaf.style === "pine" ? "pine" : "paint:#ebe8e0" });
      }
      parts.push({ pos: place(leaf.dir * (w - 0.08), y0 + 0.95, 0), size: size(0.05, 0.05, LEAF_T + 0.11), mat: "brass" });
    }
  }
  return (
    <>
      {parts.map((p, i) => (
        <mesh key={i} position={p.pos} material={m.get(p.mat) as Material} castShadow receiveShadow>
          <boxGeometry args={p.size} />
        </mesh>
      ))}
    </>
  );
}

function DoorView({ door, m }: { door: Door; m: HouseMaterials }) {
  const leaves = useMemo(() => leavesOf(door), [door]);
  const pivots = useRef<(Group | null)[]>([]);
  const solids = useRef<(Mesh | null)[]>([]);
  const open = usePartyStore((s) => !!s.doors[door.id]);
  const t = useRef(0);
  const { world, rapier } = useRapier();
  const bodies = useRef<RapierRigidBody[]>([]);
  const side = swingSide(door);
  const h = heightOf(door), y = bottomOf(door);
  const c = door.axis === "x" ? door.z : door.x;

  // A moving box collider per leaf (sizes in world metres).
  useEffect(() => {
    bodies.current = leaves.map((leaf) => {
      const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased());
      const hx = (leaf.width / 2) * S, hy = (h / 2) * S, hz = (LEAF_T / 2 + 0.01) * S;
      world.createCollider(door.axis === "x" ? rapier.ColliderDesc.cuboid(hx, hy, hz) : rapier.ColliderDesc.cuboid(hz, hy, hx), body);
      return body;
    });
    return () => bodies.current.forEach((b) => world.removeRigidBody(b));
  }, [world, rapier, leaves, door.axis, h]);

  const tmp = useMemo(() => ({ p: new Vector3(), q: new Quaternion() }), []);
  useFrame((_, dt) => {
    const target = open ? 1 : 0;
    t.current += Math.sign(target - t.current) * Math.min(Math.abs(target - t.current), Math.min(dt, 0.1) / SWING_S);
    const e = t.current * t.current * (3 - 2 * t.current); // ease in and out
    leaves.forEach((leaf, i) => {
      const g = pivots.current[i];
      if (!g) return;
      if (leaf.kind === "swing") {
        g.rotation.y = (door.axis === "x" ? -side * leaf.dir : side * leaf.dir) * (Math.PI / 2) * e * 0.97;
      } else if (leaf.kind === "slide") {
        const shift = -leaf.width * 0.95 * e; // slides back over the fixed half
        if (door.axis === "x") g.position.x = leaf.hingeU + shift;
        else g.position.z = leaf.hingeU + shift;
      } else {
        if (door.axis === "x") g.rotation.x = -side * (Math.PI / 2) * e;
        else g.rotation.z = side * (Math.PI / 2) * e;
      }
      const solid = solids.current[i], body = bodies.current[i];
      if (solid && body) {
        solid.updateWorldMatrix(true, false);
        solid.matrixWorld.decompose(tmp.p, tmp.q, new Vector3());
        body.setNextKinematicTranslation(tmp.p);
        body.setNextKinematicRotation(tmp.q);
      }
    });
  });

  return (
    <>
      {leaves.map((leaf, i) => {
        const pivotY = leaf.kind === "tilt" ? y + h : y;
        // A slide panel sits just inside the wall line so it can pass the fixed half.
        const offset = leaf.kind === "slide" ? side * 0.05 : 0;
        const pos: [number, number, number] = door.axis === "x" ? [leaf.hingeU, pivotY, c + offset] : [c + offset, pivotY, leaf.hingeU];
        const centre = (leaf.dir * leaf.width) / 2, cy = leaf.kind === "tilt" ? -h / 2 : h / 2;
        return (
          <group key={i} ref={(g) => { pivots.current[i] = g; }} position={pos}>
            <LeafLook leaf={leaf} h={h} axis={door.axis} m={m} />
            {/* Invisible box matching the leaf, whose world pose drives the collider. */}
            <mesh ref={(mm) => { solids.current[i] = mm; }} position={door.axis === "x" ? [centre, cy, 0] : [0, cy, centre]} visible={false}>
              <boxGeometry args={[0.01, 0.01, 0.01]} />
            </mesh>
          </group>
        );
      })}
      {door.type === "sliding" && (() => {
        // The fixed half of the patio door.
        const u = door.axis === "x" ? door.x : door.z;
        const fixed: Leaf = { hingeU: u - door.width / 2 + 0.02, dir: 1, width: door.width / 2 - 0.02, style: "glass", kind: "swing" };
        const pos: [number, number, number] = door.axis === "x" ? [fixed.hingeU, y, c] : [c, y, fixed.hingeU];
        return <group position={pos}><LeafLook leaf={fixed} h={h} axis={door.axis} m={m} /></group>;
      })()}
    </>
  );
}

/** All the house's doors, and the E-to-open interaction. */
export function Doors({ materials }: { materials: HouseMaterials }) {
  const doors = useMemo(() => DOORS.filter((d) => d.type !== "opening"), []);

  // Runs before the player's frame (which clears unused key presses).
  useFrame(() => {
    const p = playerState.position;
    let best: Door | null = null, bestD = DOOR_REACH;
    for (const d of doors) {
      const dist = Math.hypot(p.x - d.world.x, p.z - d.world.z);
      if (dist < bestD && Math.abs(p.y - d.world.y) < 1.6) {
        best = d;
        bestD = dist;
      }
    }
    const open = best ? !!usePartyStore.getState().doors[best.id] : false;
    const text = !best ? null : best.locked ? "Locked" : `${open ? "Close" : "Open"} ${best.type === "garage" ? "garage door" : "door"}`;
    if (useDoorPrompt.getState().text !== text) useDoorPrompt.setState({ text });
    if (best && consumePress("KeyE") && !best.locked) toggleDoor(best.id);
  }, -1);

  return (
    <>
      {doors.map((d) => <DoorView key={d.id} door={d} m={materials} />)}
    </>
  );
}
