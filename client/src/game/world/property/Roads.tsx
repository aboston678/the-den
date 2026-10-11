import { APRON, DRIVEWAY, DRIVEWAY_WIDTH, drivewayY, heightAt } from "@den/shared";
import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, MeshStandardMaterial } from "three";
import { useOutdoorMaps } from "./textures.ts";

// The asphalt driveway (GAME_SPEC §4): a strip laid on the ground along the driveway path, and
// the paved apron in front of the garage doors. Walking on it uses the terrain's collision,
// which is already flattened to the road's height (shared/src/world/terrain.ts).

const LIFT = 0.04; // sits just above the ground
const TILE = 4; // metres per texture repeat
const ACROSS = 4; // vertices across the road, so it follows any small dips

function drivewayGeometry() {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const rows = DRIVEWAY.points.length;
  for (let i = 0; i < rows; i++) {
    const s = DRIVEWAY.at[i]!;
    const p = DRIVEWAY.pointAt(s);
    const roadY = drivewayY(s);
    for (let k = 0; k <= ACROSS; k++) {
      const off = (k / ACROSS - 0.5) * DRIVEWAY_WIDTH;
      const x = p.x + p.dz * off, z = p.z - p.dx * off;
      pos.push(x, Math.max(roadY, heightAt(x, z)) + LIFT, z);
      uv.push((k / ACROSS) * (DRIVEWAY_WIDTH / TILE), s / TILE);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let k = 0; k < ACROSS; k++) {
      const a = i * (ACROSS + 1) + k, b = a + 1, c = a + ACROSS + 1, d = c + 1;
      idx.push(a, c, b, b, c, d); // counter-clockwise seen from above
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function Roads() {
  const maps = useOutdoorMaps("asphalt");
  const material = useMemo(
    () => new MeshStandardMaterial({ ...maps, color: "#9a9894", polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    [maps],
  );
  const driveway = useMemo(drivewayGeometry, []);
  const apron = { w: APRON.maxX - APRON.minX, d: APRON.maxZ - APRON.minZ };

  return (
    <>
      <mesh geometry={driveway} material={material} receiveShadow name="driveway" />
      <mesh
        material={material}
        receiveShadow
        name="apron"
        position={[(APRON.minX + APRON.maxX) / 2, APRON.y + LIFT - 0.005, (APRON.minZ + APRON.maxZ) / 2]}
        rotation-x={-Math.PI / 2}
      >
        <planeGeometry
          args={[apron.w, apron.d]}
          onUpdate={(g) => {
            const uv = g.attributes.uv!;
            for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (apron.w / TILE), uv.getY(i) * (apron.d / TILE));
          }}
        />
      </mesh>
    </>
  );
}
