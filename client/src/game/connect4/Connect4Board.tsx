import { C4_COLS, C4_ROWS, C4_TABLE, type C4Game, cellIndex, landingRow } from "@den/shared";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BoxGeometry, Color, CylinderGeometry, DynamicDrawUsage, ExtrudeGeometry, type InstancedMesh, Matrix4, MeshStandardMaterial, Path, Quaternion, Shape, Vector3,
} from "three";
import { c4Send, usePartyStore } from "../../net/party.ts";
import { play, playAt, take } from "../audio/audio.ts";
import { installC4Dev } from "./dev.ts";
import { DISC_COLOURS, useC4 } from "./store.ts";

// The Connect Four grid on the games table (Andrew, 2026-10-16): a blue upright frame with 7 × 6
// holes, standing across the table between the two chairs, red and yellow discs that drop in with
// a bounce and a clack, a see-through disc over the column you're pointing at on your turn, and the
// winning four pulsing. Everyone in the room sees the same board (it's the server's game).

/** Distance between hole centres (world metres). */
export const CELL = 0.11;
const DISC_R = 0.044, DISC_T = 0.024, FRAME_T = 0.034;
const GRID_W = C4_COLS * CELL + 0.06, GRID_H = C4_ROWS * CELL + 0.05;
/** Bottom of the grid, on little feet above the table top. */
const GRID_Y = C4_TABLE.topY + 0.05;
export const GRID_MID_Y = GRID_Y + GRID_H / 2;
const DROP_S = 0.38;

/** Where a cell's disc sits (world). Column 0 is at the west end. */
export const cellPos = (col: number, row: number) =>
  new Vector3(C4_TABLE.x + (col - (C4_COLS - 1) / 2) * CELL, GRID_Y + 0.025 + (row + 0.5) * CELL, C4_TABLE.z);
const TOP_Y = GRID_Y + GRID_H + CELL * 0.8;

const myTurn = (g: C4Game | null, me: string) => !!g && g.phase === "play" && g.players[g.turn]?.id === me;

export function Connect4Board() {
  const { camera, gl } = useThree();
  useEffect(() => installC4Dev(camera, gl.domElement), [camera, gl]);
  const game = useC4((s) => s.game);
  const [hover, setHover] = useState(-1);
  const discs = useRef<InstancedMesh>(null);
  /** The newest disc's drop: which cell, and how far through (seconds). */
  const drop = useRef({ cell: -1, t: 1, moves: 0 });

  const parts = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-GRID_W / 2, 0);
    shape.lineTo(GRID_W / 2, 0);
    shape.lineTo(GRID_W / 2, GRID_H);
    shape.lineTo(-GRID_W / 2, GRID_H);
    shape.lineTo(-GRID_W / 2, 0);
    for (let c = 0; c < C4_COLS; c++) {
      for (let r = 0; r < C4_ROWS; r++) {
        const hole = new Path();
        hole.absarc((c - (C4_COLS - 1) / 2) * CELL, 0.025 + (r + 0.5) * CELL, DISC_R + 0.004, 0, Math.PI * 2, true);
        shape.holes.push(hole);
      }
    }
    const frame = new ExtrudeGeometry(shape, { depth: FRAME_T, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -FRAME_T / 2);
    const disc = new CylinderGeometry(DISC_R, DISC_R, DISC_T, 24).rotateX(Math.PI / 2);
    const foot = new BoxGeometry(0.07, 0.05, 0.22);
    return {
      frame, disc, foot,
      blue: new MeshStandardMaterial({ color: "#2457c9", roughness: 0.35 }),
      disc_mat: new MeshStandardMaterial({ roughness: 0.3 }),
      ghost: new MeshStandardMaterial({ transparent: true, opacity: 0.5, roughness: 0.3, depthWrite: false }),
      hit: new BoxGeometry(CELL, GRID_H + CELL, 0.3),
    };
  }, []);

  // Sounds: a clack as each disc lands, a ding when it's your turn, the fanfare for a win.
  useEffect(() => useC4.subscribe((now, before) => {
    const g = now.game, old = before.game;
    const id = usePartyStore.getState().sessionId;
    if (g && old && g.phase === "over" && old.phase === "play" && g.winner !== null) setTimeout(() => atBoard("fanfare", 0.9), DROP_S * 1000);
    if (myTurn(g, id) && !myTurn(old, id) && g!.moves > 0) setTimeout(() => void play("turn-ding", 0.4), DROP_S * 1000);
    if (now.error && now.error !== before.error) void play("ui-error", 0.5);
  }), []);

  useFrame((state, dt) => {
    const mesh = discs.current;
    if (!mesh) return;
    const g = useC4.getState().game;
    const d = drop.current;
    if (g && g.moves !== d.moves) {
      if (g.moves === d.moves + 1 && g.last >= 0) {
        d.cell = g.last;
        d.t = 0;
      } else d.t = DROP_S; // a new game or a jump (joining late): no animation
      d.moves = g.moves;
    }
    const wasDropping = d.t < DROP_S;
    d.t += dt;
    if (wasDropping && d.t >= DROP_S) atBoard(take("piece-place", 2), 0.8);
    const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), col = new Color();
    let n = 0;
    if (g) {
      const pulse = 1 + 0.18 * Math.max(0, Math.sin(state.clock.elapsedTime * 7));
      for (let c = 0; c < C4_COLS; c++) {
        for (let r = 0; r < C4_ROWS; r++) {
          const i = cellIndex(c, r), who = g.cells[i]!;
          if (who < 0) continue;
          const p = cellPos(c, r);
          if (i === d.cell && d.t < DROP_S) {
            // Falls from above the grid, with a little bounce at the bottom.
            const k = d.t / DROP_S;
            const fall = k < 0.8 ? 1 - (k / 0.8) ** 2 : -Math.sin(((k - 0.8) / 0.2) * Math.PI) * 0.04;
            p.y += fall * (TOP_Y - p.y);
          }
          s.setScalar(g.line.includes(i) ? pulse : 1);
          m.compose(p, q, s);
          mesh.setMatrixAt(n, m);
          mesh.setColorAt(n, col.set(DISC_COLOURS[who]!));
          n++;
        }
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  const me = usePartyStore((s) => s.sessionId);
  const mine = myTurn(game, me);
  const ghostCol = mine && hover >= 0 && game && landingRow(game.cells, hover) >= 0 ? hover : -1;
  parts.ghost.color.set(DISC_COLOURS[game?.turn ?? 0]!);

  return (
    <group name="connect-four">
      <mesh geometry={parts.frame} material={parts.blue} position={[C4_TABLE.x, GRID_Y, C4_TABLE.z]} castShadow />
      {[-1, 1].map((sx) => (
        <mesh key={sx} geometry={parts.foot} material={parts.blue} position={[C4_TABLE.x + sx * (GRID_W / 2 - 0.035), C4_TABLE.topY + 0.025, C4_TABLE.z]} />
      ))}
      <instancedMesh ref={discs} args={[parts.disc, parts.disc_mat, C4_COLS * C4_ROWS]} frustumCulled={false}>
        <instancedBufferAttribute attach="instanceColor" args={[new Float32Array(C4_COLS * C4_ROWS * 3), 3]} usage={DynamicDrawUsage} />
      </instancedMesh>
      {ghostCol >= 0 && <mesh geometry={parts.disc} material={parts.ghost} position={[cellPos(ghostCol, 0).x, TOP_Y, C4_TABLE.z]} />}
      {/* Click a column (only on your turn). */}
      {mine && Array.from({ length: C4_COLS }, (_, c) => (
        <mesh
          key={c}
          name={`c4-col-${c}`}
          geometry={parts.hit}
          position={[cellPos(c, 0).x, GRID_Y + GRID_H / 2 + CELL / 2, C4_TABLE.z]}
          visible={false}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            setHover(c);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHover((h) => (h === c ? -1 : h));
            document.body.style.cursor = "";
          }}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            c4Send.drop(c);
          }}
        />
      ))}
    </group>
  );
}

function atBoard(name: string, volume: number) {
  void playAt(name, C4_TABLE.x, GRID_MID_Y, C4_TABLE.z, volume, 3);
}
