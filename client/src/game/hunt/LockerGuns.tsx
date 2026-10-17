import { GUN_LOCKER } from "@den/shared";
import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import { Group } from "three";
import { GUNS_URL } from "./hunterRig.ts";

// The guns standing in the basement gun locker (bear hunt, 2026-10-17): sniper, AR and shotgun upright
// on the rack, muzzles up, the pistol and a scope on the top shelf. Scenery: the real ones are taken
// from the locker's panel (ui/HuntHud.tsx).

const UPRIGHT: [string, number][] = [["sniper", -0.42], ["ar", 0.0], ["shotgun", 0.42]];

export function LockerGuns() {
  const { scene } = useGLTF(GUNS_URL);
  const group = useMemo(() => {
    const g = new Group();
    g.name = "locker-guns";
    // The locker faces south (+z): its inside back is d/2 behind the centre.
    for (const [name, x] of UPRIGHT) {
      const gun = scene.getObjectByName(name)?.clone();
      if (!gun) continue;
      const stand = new Group();
      stand.add(gun);
      // Stand the gun on its butt: muzzle (+z) up, the bottom of the stock toward the back wall.
      stand.rotation.set(-Math.PI / 2, 0, 0);
      stand.position.set(x, 0.58 + (name === "sniper" ? 1.15 : name === "ar" ? 0.88 : 1.1) / 2, 0.02);
      g.add(stand);
    }
    for (const [name, x] of [["pistol", -0.3], ["scope", 0.2]] as const) {
      const p = scene.getObjectByName(name)?.clone();
      if (!p) continue;
      p.position.set(x, 1.58 * 1.25, 0.0);
      p.rotation.y = Math.PI / 2;
      g.add(p);
    }
    return g;
  }, [scene]);
  return <primitive object={group} position={[GUN_LOCKER.x, GUN_LOCKER.y, GUN_LOCKER.z]} />;
}
