import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, type LineSegments, type Points } from "three";
import { useHunt } from "./store.ts";

// Every gunshot in the bear hunt (2026-10-17) leaves a quick streak from the muzzle to where the
// bullet stopped, and a flash at the muzzle, for everyone to see. One line draw and one point draw.

const MAX = 32;
const STREAK_S = 0.12;
const FLASH_S = 0.06;

export function Tracers() {
  const lines = useRef<LineSegments>(null);
  const flashes = useRef<Points>(null);
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(MAX * 6), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const flashGeo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(MAX * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  useFrame(() => {
    const now = performance.now();
    const shots = useHunt.getState().shots;
    const pos = geo.attributes.position as BufferAttribute;
    const fpos = flashGeo.attributes.position as BufferAttribute;
    let n = 0, f = 0;
    for (const s of shots) {
      const age = (now - s.at) / 1000;
      if (age < STREAK_S && n < MAX) {
        // The streak flies out: its back end chases the front.
        const k = Math.min(1, age / STREAK_S);
        const bx = s.from.x + (s.to.x - s.from.x) * k * 0.7, by = s.from.y + (s.to.y - s.from.y) * k * 0.7, bz = s.from.z + (s.to.z - s.from.z) * k * 0.7;
        pos.setXYZ(n * 2, bx, by, bz);
        pos.setXYZ(n * 2 + 1, s.to.x, s.to.y, s.to.z);
        n++;
      }
      if (age < FLASH_S && f < MAX) fpos.setXYZ(f++, s.from.x, s.from.y, s.from.z);
    }
    geo.setDrawRange(0, n * 2);
    flashGeo.setDrawRange(0, f);
    pos.needsUpdate = true;
    fpos.needsUpdate = true;
    if (lines.current) lines.current.visible = n > 0;
    if (flashes.current) flashes.current.visible = f > 0;
  });

  return (
    <>
      <lineSegments ref={lines} geometry={geo} frustumCulled={false} name="tracers">
        <lineBasicMaterial color="#ffe2a0" transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </lineSegments>
      <points ref={flashes} geometry={flashGeo} frustumCulled={false} name="muzzle-flashes">
        <pointsMaterial color="#ffc46b" size={0.55} sizeAttenuation transparent opacity={0.95} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </points>
    </>
  );
}
