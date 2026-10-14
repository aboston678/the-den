import { STANCE, laneById, laneToFloorplan } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { DoubleSide, Mesh, MeshBasicMaterial, Shape, ShapeGeometry } from "three";
import { useBowling } from "./session.ts";

// The aim arrow on the lane in front of the bowler (Wii-Bowling style): starts at your feet and
// swings with the mouse. Only you see it. Floorplan metres, inside the house group.

const LENGTH = 5;

export function AimArrow() {
  const arrow = useMemo(() => {
    const s = new Shape();
    const w = 0.04, head = 0.4, hw = 0.14;
    s.moveTo(0, -w);
    s.lineTo(LENGTH - head, -w);
    s.lineTo(LENGTH - head, -hw);
    s.lineTo(LENGTH, 0);
    s.lineTo(LENGTH - head, hw);
    s.lineTo(LENGTH - head, w);
    s.lineTo(0, w);
    const g = new ShapeGeometry(s).rotateX(-Math.PI / 2); // lie flat, pointing along +x
    const m = new Mesh(g, new MeshBasicMaterial({ color: "#ffd36a", transparent: true, opacity: 0.75, depthWrite: false, side: DoubleSide, toneMapped: false }));
    m.name = "bowling:aim-arrow";
    m.renderOrder = 3;
    m.visible = false;
    return m;
  }, []);

  useFrame(() => {
    const { lane, mode, z, aim } = useBowling.getState();
    arrow.visible = !!lane && (mode === "aim" || mode === "power" || mode === "curve");
    if (!arrow.visible) return;
    arrow.position.set(...laneToFloorplan(laneById(lane!)!, STANCE.x + 0.35, 0.006, z));
    arrow.rotation.y = (-aim * Math.PI) / 180;
  });

  return <primitive object={arrow} />;
}
