import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo } from "react";
import { type Group, Mesh, type Object3D, Vector3 } from "three";
import { BALL_COLOURS, ballGeometry, ballMaterial } from "./models.ts";

// A bowling ball in a bear's right paw (GAME_SPEC §15) while it's their turn, until it leaves
// the paw. Used for our bear and everyone else's. Real size: the bear model is 1.25× scale, so is the ball.

const SCALE = 1.25;
const handPos = new Vector3();
/** The ball sits just under and in front of the paw (bear space, metres). */
const CUPPED = new Vector3(0, -0.1, 0.05);
let shared: { geo: ReturnType<typeof ballGeometry>; mats: ReturnType<typeof ballMaterial>[] } | null = null;

export function useHeldBall(model: Object3D, parent: RefObject<Group | null>, state: () => { show: boolean; colour: number }) {
  const hand = useMemo(() => model.getObjectByName("RightHand") ?? null, [model]);
  const ball = useMemo(() => {
    shared ??= { geo: ballGeometry(18), mats: BALL_COLOURS.map((c) => ballMaterial(c)) };
    const m = new Mesh(shared.geo, shared.mats[0]);
    m.scale.setScalar(SCALE);
    m.name = "held-ball";
    m.visible = false;
    return m;
  }, []);

  useEffect(() => {
    const p = parent.current;
    p?.add(ball);
    return () => void p?.remove(ball);
  }, [ball, parent]);

  useFrame(() => {
    const p = parent.current;
    const s = state();
    ball.visible = s.show && !!hand && !!p;
    if (!ball.visible || !hand || !p) return;
    ball.material = shared!.mats[s.colour % shared!.mats.length]!;
    hand.getWorldPosition(handPos);
    p.updateWorldMatrix(true, false);
    ball.position.copy(p.worldToLocal(handPos)).add(CUPPED);
  });
}
