import { CATAN_SEATS, CATAN_TABLE, generateBoard, rng, type Board } from "@den/shared";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, type Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { cameraState } from "../state.ts";
import { boardAtlas, buildBoard } from "./boardMesh.ts";
import { Dice } from "./Dice.tsx";
import { installCatanDev } from "./dev.ts";
import { Picks } from "./Picks.tsx";
import { HEX, TILE_TOP, edgePos, hexPos, vertexPos } from "./layout.ts";
import { cityGeometry, robberGeometry, roadGeometry, settlementGeometry } from "./pieceMeshes.ts";
import { SEAT_COLOURS, useCatan } from "./store.ts";
import { usePartyStore } from "../../net/party.ts";
import { initCatanSounds } from "./sounds.ts";

// The Catan board on the dining table (GAME_SPEC §16): everyone in the room sees it in 3D. Before
// the first game a sample board sits there; during a game it shows the real board, every road,
// settlement and city in its owner's colour, the robber and the dice.

/** Only drawn when the camera is this close (it's indoors, on the main floor). */
const SHOW_WITHIN = 16;
/** A sample board for an empty table. */
const SAMPLE: Board = generateBoard(rng(2026));

const tmp = new Object3D();
const hidden = new Matrix4().makeScale(0, 0, 0);

export function CatanTable() {
  const group = useRef<Group>(null);
  const view = useCatan((s) => s.view);
  const board = view?.board ?? SAMPLE;
  const boardKey = JSON.stringify(board);
  // Numbers face whoever's looking: your chair's way, or from the south side (the room's door) if you're standing.
  const me = usePartyStore((s) => s.sessionId);
  const mySeat = useCatan((s) => s.seats.indexOf(me));
  const yaw = CATAN_SEATS[mySeat]?.yaw ?? CATAN_SEATS[2]!.yaw;
  const { camera, gl } = useThree();
  useEffect(() => installCatanDev(camera, gl.domElement), [camera, gl]);
  useEffect(initCatanSounds, []);

  // The fixed board: rebuilt only when a new game deals a new board.
  const meshes = useMemo(() => {
    const geo = buildBoard(board, yaw);
    const coloured = new Mesh(geo.coloured, new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    const tex = new MeshStandardMaterial({ map: boardAtlas(), roughness: 0.6 });
    tex.defines = { ...tex.defines, NO_SOFT_MAP: "" };
    const textured = new Mesh(geo.textured, tex);
    coloured.receiveShadow = textured.receiveShadow = true;
    return { coloured, textured };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, yaw]);
  useEffect(() => () => {
    meshes.coloured.geometry.dispose();
    meshes.textured.geometry.dispose();
  }, [meshes]);

  // Pieces: one instanced mesh per kind, coloured per owner.
  const pieces = useMemo(() => {
    const mat = () => new MeshStandardMaterial({ roughness: 0.55 });
    const roads = new InstancedMesh(roadGeometry(), mat(), 60);
    const towns = new InstancedMesh(settlementGeometry(), mat(), 20);
    const cities = new InstancedMesh(cityGeometry(), mat(), 16);
    const robber = new Mesh(robberGeometry(), new MeshStandardMaterial({ color: "#2b2a30", roughness: 0.4 }));
    for (const m of [roads, towns, cities]) {
      for (let i = 0; i < m.count; i++) {
        m.setMatrixAt(i, hidden);
        m.setColorAt(i, new Color("#ffffff"));
      }
      m.castShadow = true;
      m.frustumCulled = false;
    }
    robber.castShadow = true;
    return { roads, towns, cities, robber };
  }, []);

  useEffect(() => {
    const { roads, towns, cities, robber } = pieces;
    const colour = new Color();
    let r = 0, t = 0, c = 0;
    view?.roads.forEach((owner, e) => {
      if (owner === null) return;
      const p = edgePos(e);
      tmp.position.set(p.x, TILE_TOP, p.z);
      tmp.rotation.set(0, p.yaw, 0);
      tmp.scale.set(1, 1, p.len * 0.72);
      tmp.updateMatrix();
      roads.setMatrixAt(r, tmp.matrix);
      roads.setColorAt(r++, colour.set(SEAT_COLOURS[view.players[owner]!.seat]!));
    });
    view?.buildings.forEach((b, v) => {
      if (!b) return;
      const [x, y, z] = vertexPos(v);
      tmp.position.set(x, y, z);
      // Face out from the board centre so every house looks tidy.
      tmp.rotation.set(0, Math.atan2(x - CATAN_TABLE.x, z - CATAN_TABLE.z), 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      const into = b.city ? cities : towns;
      const i = b.city ? c++ : t++;
      into.setMatrixAt(i, tmp.matrix);
      into.setColorAt(i, colour.set(SEAT_COLOURS[view.players[b.owner]!.seat]!));
    });
    for (const [m, used] of [[roads, r], [towns, t], [cities, c]] as const) {
      for (let i = used; i < m.count; i++) m.setMatrixAt(i, hidden);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    const robberHex = view?.robber ?? SAMPLE.tiles.findIndex((x) => x.terrain === "desert");
    const [rx, ry, rz] = hexPos(robberHex);
    robber.position.set(rx + HEX * 0.42, ry + 0.008, rz - HEX * 0.1);
  }, [view, pieces]);

  const at = useMemo(() => new Vector3(CATAN_TABLE.x, CATAN_TABLE.topY, CATAN_TABLE.z), []);
  useFrame(({ camera }) => {
    if (!group.current) return;
    group.current.visible = camera.position.distanceTo(at) < SHOW_WITHIN || cameraState.override !== null;
  });

  return (
    <group ref={group} name="catan">
      <primitive object={meshes.coloured} />
      <primitive object={meshes.textured} />
      <primitive object={pieces.roads} />
      <primitive object={pieces.towns} />
      <primitive object={pieces.cities} />
      <primitive object={pieces.robber} />
      <Dice />
      <Picks />
    </group>
  );
}
