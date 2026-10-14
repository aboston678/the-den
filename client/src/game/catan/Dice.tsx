import { CATAN_SEATS, CATAN_TABLE, rng } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { InstancedMesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from "three";
import { playAt } from "../audio/audio.ts";
import { DICE_HITS } from "../audio/synth.ts";
import { DIE, DIE_FACES, dieGeometry, diePips } from "./pieceMeshes.ts";
import { useCatan } from "./store.ts";

// The two dice (GAME_SPEC §16). The server rolls; every screen plays the same tumble (seeded by
// the roll's number) from the roller's side of the table, and the dice always land showing the
// server's faces. Between rolls they rest beside the board.

const TUMBLE_S = 1.05;
/** The table's corners, clear of the board and of the bears in the middle of each side. */
const CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => new Vector3(CATAN_TABLE.x + sx! * 0.72, 0, CATAN_TABLE.z + sz! * 0.5));

/** Where the dice come to rest: the corner on the roller's right. */
function restSpot(seat: number) {
  const s = CATAN_SEATS[seat]!;
  const rx = -Math.cos(s.yaw), rz = Math.sin(s.yaw); // the bear's right, facing the table
  const want = new Vector3(s.sitX + rx * 0.6, 0, s.sitZ + rz * 0.6);
  const c = CORNERS.reduce((a, b) => (a.distanceTo(want) < b.distanceTo(want) ? a : b));
  return [c.clone().add(new Vector3(-0.035, 0, 0)), c.clone().add(new Vector3(0.035, 0, 0.03))];
}
const UP = new Vector3(0, 1, 0);
const NORMALS = [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)];

/** The turn that puts face `value` on top, then a twist about the vertical. */
function showing(value: number, twist: number) {
  const n = NORMALS[DIE_FACES.indexOf(value as (typeof DIE_FACES)[number])]!;
  return new Quaternion().setFromAxisAngle(UP, twist).multiply(new Quaternion().setFromUnitVectors(n, UP));
}

interface Tumble {
  id: number;
  t: number;
  from: Vector3[];
  to: Quaternion[];
  axis: Vector3[];
  turns: number[];
  played: boolean;
}

const tmp = new Object3D();
const spin = new Quaternion();

export function Dice() {
  const mesh = useMemo(() => {
    const mat = new MeshStandardMaterial({ map: diePips(), roughness: 0.35 });
    mat.defines = { ...mat.defines, NO_SOFT_MAP: "" };
    const m = new InstancedMesh(dieGeometry(), mat, 2);
    m.castShadow = true;
    m.frustumCulled = false;
    return m;
  }, []);
  const tumble = useRef<Tumble | null>(null);
  const seen = useRef(-1);
  const rest = useRef(restSpot(2));

  useFrame((_, dt) => {
    const view = useCatan.getState().view;
    const dice = view?.dice ?? [5, 2];
    const rollId = view?.rollId ?? 0;
    const restY = CATAN_TABLE.topY + DIE / 2;

    // A new roll: start the tumble from the roller's side (only one we haven't already shown).
    if (view && rollId !== seen.current) {
      const first = seen.current === -1;
      seen.current = rollId;
      if (!first && view.dice) {
        const r = rng(rollId * 7919 + 13);
        const seatIndex = view.players[view.turn]?.seat ?? 0;
        const seat = CATAN_SEATS[seatIndex]!;
        rest.current = restSpot(seatIndex);
        const sx = seat.sitX + (CATAN_TABLE.x - seat.sitX) * 0.35, sz = seat.sitZ + (CATAN_TABLE.z - seat.sitZ) * 0.35;
        tumble.current = {
          id: rollId,
          t: 0,
          from: [0, 1].map((i) => new Vector3(sx + (i - 0.5) * 0.06, CATAN_TABLE.topY + 0.35, sz)),
          to: [0, 1].map((i) => showing(view.dice![i]!, r() * Math.PI * 2)),
          axis: [0, 1].map(() => new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize()),
          turns: [0, 1].map(() => 2 + Math.floor(r() * 3)),
          played: false,
        };
      }
    }

    const tb = tumble.current;
    for (let i = 0; i < 2; i++) {
      const at = rest.current[i]!;
      if (tb) {
        const k = Math.min(1, tb.t / TUMBLE_S);
        // Arc in and bounce a few times on the hits.
        const ease = 1 - Math.pow(1 - k, 2.2);
        tmp.position.lerpVectors(tb.from[i]!, new Vector3(at.x, restY, at.z), ease);
        const firstHit = DICE_HITS[0] / TUMBLE_S;
        const hop = k < firstHit ? (1 - k / firstHit) * 0.3 : Math.abs(Math.sin(((k - firstHit) / (1 - firstHit)) * Math.PI * 3)) * 0.05 * (1 - k);
        tmp.position.y = restY + hop;
        spin.setFromAxisAngle(tb.axis[i]!, (1 - ease) * tb.turns[i]! * Math.PI * 2);
        tmp.quaternion.copy(spin).multiply(tb.to[i]!);
      } else {
        tmp.position.set(at.x, restY, at.z);
        tmp.quaternion.copy(showing(dice[i]!, i * 0.5 + 0.3));
      }
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    if (tb) {
      if (!tb.played) {
        tb.played = true;
        void playAt("dice-roll", CATAN_TABLE.x, CATAN_TABLE.topY + 0.2, CATAN_TABLE.z, 0.9, 6);
      }
      tb.t += dt;
      if (tb.t >= TUMBLE_S) tumble.current = null;
    }
  });

  return <primitive object={mesh} />;
}

/** True while the dice are still tumbling (the HUD waits to show the total). */
export const DICE_TUMBLE_S = TUMBLE_S;
