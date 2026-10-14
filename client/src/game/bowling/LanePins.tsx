import { LANE, LANES, laneToFloorplan } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { RACK_SPOTS } from "./alleyGeometry.ts";
import { laneRender } from "./laneState.ts";
import { BALL_COLOURS, ballGeometry, ballMaterial, pinGeometry, pinMaterial } from "./models.ts";

// The moving parts of both lanes (GAME_SPEC §15): 20 pins (one instanced mesh), each lane's ball,
// the sweep bars, and the balls waiting on the ball return. Positions come from laneState.ts every
// frame. Drawn in floorplan metres inside the house group.

const PIN_COUNT = 10;
const m = new Matrix4(), pos = new Vector3(), one = new Vector3(1, 1, 1), hidden = new Matrix4().makeScale(0, 0, 0);

export function LanePins() {
  const parts = useMemo(() => {
    const pins = new InstancedMesh(pinGeometry(), pinMaterial(), PIN_COUNT * LANES.length);
    pins.name = "bowling:pins";
    pins.castShadow = false;
    pins.frustumCulled = false; // moves every frame; the alley is small
    const geo = ballGeometry();
    const materials = BALL_COLOURS.map((c) => ballMaterial(c));
    const balls = LANES.map((l) => {
      const b = new Mesh(geo, materials[0]);
      b.name = `bowling:ball-${l.id}`;
      b.visible = false;
      return b;
    });
    // One ball of each colour resting on the return's rails.
    const rack = RACK_SPOTS.map((spot, i) => {
      const b = new Mesh(geo, materials[i % materials.length]);
      b.position.set(...spot);
      b.rotation.set(0.4 * i, 1.3 * i, 0);
      b.name = "bowling:rack-ball";
      return b;
    });
    // Sweep bars: a dark beam across each lane, lowered in front of the pins between balls.
    const barGeo = new BoxGeometry(0.05, 0.16, LANE.width + 2 * LANE.gutter);
    const barMat = new MeshStandardMaterial({ color: "#2a2c31", roughness: 0.5, metalness: 0.4 });
    const bars = LANES.map((l) => {
      const bar = new Mesh(barGeo, barMat);
      bar.name = `bowling:sweep-${l.id}`;
      return bar;
    });
    return { pins, balls, rack, bars, geo, materials, barGeo, barMat };
  }, []);
  useEffect(() => () => {
    parts.pins.geometry.dispose();
    (parts.pins.material as MeshStandardMaterial).dispose();
    parts.geo.dispose();
    parts.materials.forEach((x) => x.dispose());
    parts.barGeo.dispose();
    parts.barMat.dispose();
  }, [parts]);

  useFrame(() => {
    LANES.forEach((lane, li) => {
      const r = laneRender[lane.id as "1" | "2"];
      r.pins.forEach((pin, i) => {
        if (pin.gone) return parts.pins.setMatrixAt(li * PIN_COUNT + i, hidden);
        pos.set(...laneToFloorplan(lane, pin.p.x, pin.p.y, pin.p.z));
        parts.pins.setMatrixAt(li * PIN_COUNT + i, m.compose(pos, pin.q, one));
      });
      const ball = parts.balls[li]!;
      ball.visible = r.ball.visible;
      if (r.ball.visible) {
        ball.position.set(...laneToFloorplan(lane, r.ball.p.x, r.ball.p.y, r.ball.p.z));
        ball.quaternion.copy(r.ball.q);
        ball.material = parts.materials[r.ball.colour % parts.materials.length]!;
      }
      const bar = parts.bars[li]!;
      bar.visible = r.sweep.down > 0.01;
      bar.position.set(...laneToFloorplan(lane, r.sweep.x, 0.08 + (1 - r.sweep.down) * 0.6, 0));
    });
    parts.pins.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <primitive object={parts.pins} />
      {parts.balls.map((b) => <primitive key={b.uuid} object={b} />)}
      {parts.rack.map((b) => <primitive key={b.uuid} object={b} />)}
      {parts.bars.map((b) => <primitive key={b.uuid} object={b} />)}
    </>
  );
}
