import { HOUSE, HOUSE_FOOTPRINT } from "@den/shared";
import { CuboidCollider, RigidBody } from "@react-three/rapier";

// Stand-in blocks marking where the house goes until milestone 1.9 builds it from the floorplan:
// the main block (basement to roof), the porch, the deck and the greenhouse.

const ROOF_Y = 8;
const LOOK: Record<string, { bottom: number; top: number; color: string }> = {
  house: { bottom: HOUSE.basementFloorY - 0.2, top: ROOF_Y, color: "#ecebe6" },
  porch: { bottom: -0.6, top: 0.15, color: "#d9d6cf" },
  deck: { bottom: -0.1, top: 0.05, color: "#a9a49b" },
  greenhouse: { bottom: -0.2, top: 3.2, color: "#cfe0dc" },
};

export function HousePlaceholder() {
  return (
    <group name="house-placeholder">
      {HOUSE_FOOTPRINT.map((r) => {
        const look = LOOK[r.name]!;
        const w = r.maxX - r.minX, d = r.maxZ - r.minZ, h = look.top - look.bottom;
        const pos: [number, number, number] = [(r.minX + r.maxX) / 2, (look.top + look.bottom) / 2, (r.minZ + r.maxZ) / 2];
        return (
          <RigidBody key={r.name} type="fixed" colliders={false} position={pos}>
            <CuboidCollider args={[w / 2, h / 2, d / 2]} />
            <mesh castShadow receiveShadow>
              <boxGeometry args={[w, h, d]} />
              <meshStandardMaterial color={look.color} roughness={0.85} transparent={r.name === "greenhouse"} opacity={r.name === "greenhouse" ? 0.55 : 1} />
            </mesh>
          </RigidBody>
        );
      })}
      {/* A dark roof slab so the block reads as a house from the woods. */}
      {(() => {
        const r = HOUSE_FOOTPRINT[0]!;
        return (
          <mesh position={[(r.minX + r.maxX) / 2, ROOF_Y + 0.15, (r.minZ + r.maxZ) / 2]} castShadow>
            <boxGeometry args={[r.maxX - r.minX + 0.6, 0.3, r.maxZ - r.minZ + 0.6]} />
            <meshStandardMaterial color="#45484c" roughness={0.9} />
          </mesh>
        );
      })()}
    </group>
  );
}
