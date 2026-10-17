import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  AdditiveBlending, BoxGeometry, CanvasTexture, Color, CylinderGeometry, Group, InstancedMesh, MeshStandardMaterial, Object3D,
  type MeshBasicMaterial, PointLight, SpotLight, Sprite, SpriteMaterial, type Material,
} from "three";
import { useQuality } from "../quality.ts";
import { lodBias } from "../world/property/InstancedLod.tsx";
import { current } from "../sky/look.ts";
import { playerState } from "../state.ts";
import { EXTERIOR_FIXTURES, FIRE_POS, type Fixture, INTERIOR_FIXTURES, indoor, insideHouse } from "./lights.ts";

// The house's lights (GAME_SPEC §8.2, §9). Every fixture glows, but only a few real lights exist:
// a fixed pool that moves to the fixtures nearest the bear. Keeping the number of lights constant
// means three.js never rebuilds its shaders (no stutter) and the cost stays flat.

const WARM = new Color("#ffcf9a"); // ~2700 K
const REASSIGN_S = 0.25;
const FADE_S = 0.35;
/** Lights on another floor count as this many metres further away. */
const OTHER_FLOOR_PENALTY = 8;

interface Slot {
  light: PointLight;
  lamp: Lamp | null;
  /** 0 … 1: fades out before moving, fades in after. */
  level: number;
}

/** A lamp a real light can sit at: a ceiling light indoors, or a lantern outside. */
interface Lamp {
  fixture: Fixture;
  outdoor: boolean;
  intensity: number;
}

/**
 * One pool of real lights shared by the indoor lamps and the outdoor lanterns, following the nearest
 * lamps that are on (round 3: two separate pools cost an M1 ~15 fps on Medium, since every lit pixel
 * pays for every light, even an unused one). Indoors that's the room's ceiling lights; outside at night,
 * the lanterns.
 */
class LightPool {
  slots: Slot[];
  private timer = 0;
  private wanted = new Set<Lamp>();

  constructor(n: number, readonly lamps: Lamp[], distance: number) {
    this.slots = Array.from({ length: n }, () => {
      const light = new PointLight(WARM, 0, distance, 2);
      light.castShadow = false;
      return { light, lamp: null, level: 0 };
    });
  }

  /** `outside` = how lit the lanterns are (0 by day, 1 at night). */
  update(dt: number, x: number, y: number, z: number, onFloor: string | null, outside: number) {
    this.timer -= dt;
    const strength = (l: Lamp) => (l.outdoor ? outside : 1);
    if (this.timer <= 0) {
      this.timer = REASSIGN_S;
      const score = (l: Lamp) => Math.hypot(l.fixture.pos[0] - x, l.fixture.pos[1] - y, l.fixture.pos[2] - z)
        + (onFloor && !l.outdoor && l.fixture.level !== onFloor ? OTHER_FLOOR_PENALTY : 0)
        + (l.outdoor && onFloor ? OTHER_FLOOR_PENALTY : 0) // inside, the lanterns are through a wall
        + (strength(l) < 0.01 ? 1000 : 0); // switched off (lanterns by day)
      this.wanted = new Set([...this.lamps].sort((a, b) => score(a) - score(b)).slice(0, this.slots.length));
    }
    const missing = [...this.wanted].filter((l) => !this.slots.some((s) => s.lamp === l));
    for (const s of this.slots) {
      const keep = s.lamp && this.wanted.has(s.lamp);
      if (keep) s.level = Math.min(1, s.level + dt / FADE_S);
      else if (s.level > 0) s.level = Math.max(0, s.level - dt / FADE_S);
      else if (missing.length) {
        s.lamp = missing.shift()!;
        s.light.position.set(...s.lamp.fixture.pos);
      }
      s.light.intensity = s.lamp ? s.lamp.intensity * s.lamp.fixture.power * s.level * strength(s.lamp) : 0;
    }
  }
}

/** One instanced mesh with a copy of `geo` at every fixture. */
function fixtureMeshes(fixtures: Fixture[], geo: BoxGeometry | CylinderGeometry, material: Material, yOffset: number) {
  const mesh = new InstancedMesh(geo, material, fixtures.length);
  const o = new Object3D();
  fixtures.forEach((f, i) => {
    o.position.set(f.pos[0], f.pos[1] + yOffset, f.pos[2]);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function flameTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 96, 2, 32, 80, 60);
  g.addColorStop(0, "rgba(255,240,190,1)");
  g.addColorStop(0.25, "rgba(255,170,60,0.9)");
  g.addColorStop(0.6, "rgba(230,80,20,0.35)");
  g.addColorStop(1, "rgba(120,20,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(32, 80, 26, 48, 0, 0, Math.PI * 2);
  ctx.fill();
  return new CanvasTexture(c);
}

/** Flames (a few flickering sprites) and a flickering orange light, lit from dusk till dawn. */
function makeFire() {
  const group = new Group();
  const tex = flameTexture();
  const flames = [-0.32, -0.1, 0.12, 0.3].map((dz, i) => {
    const s = new Sprite(new SpriteMaterial({ map: tex, blending: AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    s.position.set(FIRE_POS[0], FIRE_POS[1], FIRE_POS[2] + dz);
    s.userData.phase = i * 1.7;
    group.add(s);
    return s;
  });
  const light = new PointLight("#ff8a3c", 0, 9, 2);
  light.position.set(FIRE_POS[0] - 0.5, FIRE_POS[1] + 0.3, FIRE_POS[2]);
  group.add(light);
  return { group, flames, light };
}

export function HouseLights({ windowGlow }: { windowGlow: MeshBasicMaterial }) {
  const q = useQuality(); // how many real lights (GAME_SPEC §17)
  const parts = useMemo(() => {
    const lamps = new LightPool(q.lampLights, [
      ...INTERIOR_FIXTURES.map((fixture) => ({ fixture, outdoor: false, intensity: 7 })),
      ...EXTERIOR_FIXTURES.map((fixture) => ({ fixture, outdoor: true, intensity: 5 })),
    ], 10);
    const glowMat = new MeshStandardMaterial({ color: "#fff6e8", emissive: WARM, emissiveIntensity: 2.2, roughness: 0.6 });
    const lanternMat = new MeshStandardMaterial({ color: "#2a2620", emissive: WARM, emissiveIntensity: 0, roughness: 0.5 });
    const ceilingLamps = fixtureMeshes(INTERIOR_FIXTURES, new CylinderGeometry(0.2, 0.24, 0.08, 16), glowMat, 0.0);
    const lanterns = fixtureMeshes(EXTERIOR_FIXTURES, new BoxGeometry(0.2, 0.32, 0.2), lanternMat, 0);
    ceilingLamps.name = "house:ceiling-lamps";
    lanterns.name = "house:lanterns";
    // High: the lamp in the room you're in casts real shadows (a wide spot light pointing down).
    const shadowLamp = q.indoorShadow ? new SpotLight(WARM, 0, 11, 1.25, 0.8, 2) : null;
    if (shadowLamp) {
      shadowLamp.castShadow = true;
      shadowLamp.shadow.mapSize.set(1024, 1024);
      shadowLamp.shadow.camera.near = 0.2;
      shadowLamp.shadow.bias = -0.0006;
      shadowLamp.shadow.normalBias = 0.02;
      shadowLamp.shadow.needsUpdate = true; // draw it once now: a never-drawn shadow map blanks the screen (see Flashlight.tsx)
    }
    return { lamps, glowMat, lanternMat, ceilingLamps, lanterns, fire: makeFire(), shadowLamp };
  }, [q]);
  useEffect(() => () => {
    parts.ceilingLamps.dispose();
    parts.lanterns.dispose();
  }, [parts]);

  useFrame(({ clock }, dt) => {
    const p = playerState.position;
    const head = p.y + 1.6;
    const floor = insideHouse(p.x, p.y + 0.5, p.z);
    indoor.level = floor;
    indoor.amount += ((floor ? 1 : 0) - indoor.amount) * Math.min(1, dt * 2.5);
    lodBias.value = floor ? 2.5 : 1; // inside, the forest is only glimpsed through windows

    const outside = current.sky.exteriorLights;
    const lamp = parts.shadowLamp;
    if (lamp) {
      // The nearest ceiling light on your floor, while you're inside.
      let best: (typeof INTERIOR_FIXTURES)[number] | null = null, bestD = Infinity;
      if (floor) {
        for (const f of INTERIOR_FIXTURES) {
          if (f.level !== floor) continue;
          const d = Math.hypot(f.pos[0] - p.x, f.pos[2] - p.z);
          if (d < bestD) (best = f), (bestD = d);
        }
      }
      lamp.intensity = best ? 3.5 * best.power * indoor.amount : 0; // on top of the ordinary lamp light there
      if (best) {
        lamp.position.set(best.pos[0], best.pos[1] - 0.1, best.pos[2]);
        lamp.target.position.set(best.pos[0], best.pos[1] - 5, best.pos[2]);
        lamp.target.updateMatrixWorld();
      }
      lamp.shadow.autoUpdate = !!best; // no shadow redraws outdoors
    }
    parts.lamps.update(dt, p.x, head, p.z, floor, outside);
    parts.lanternMat.emissiveIntensity = 3 * outside;
    windowGlow.opacity = 0.7 * current.night;

    // The fire: lit from dusk to dawn, flickering.
    const t = clock.elapsedTime;
    const lit = outside;
    const flicker = 0.75 + 0.15 * Math.sin(t * 13.1) + 0.1 * Math.sin(t * 23.7 + 1.3);
    parts.fire.light.intensity = 9 * lit * flicker;
    for (const s of parts.fire.flames) {
      const ph = s.userData.phase as number;
      const k = 0.8 + 0.2 * Math.sin(t * 9 + ph) + 0.1 * Math.sin(t * 17 + ph * 2);
      s.scale.set(0.26 * k, 0.72 * k * (0.85 + 0.15 * Math.sin(t * 6 + ph)), 1);
      (s.material as SpriteMaterial).opacity = lit * (0.75 + 0.25 * Math.sin(t * 11 + ph));
    }
    // Hide only the sprites: hiding a light would change the light count and make three.js rebuild shaders.
    for (const s of parts.fire.flames) s.visible = lit > 0.01;
  });

  return (
    <>
      {parts.lamps.slots.map((s, i) => <primitive key={`lamp${i}`} object={s.light} />)}
      <primitive object={parts.ceilingLamps} />
      <primitive object={parts.lanterns} />
      <primitive object={parts.fire.group} />
      {parts.shadowLamp && <primitive object={parts.shadowLamp} />}
      {parts.shadowLamp && <primitive object={parts.shadowLamp.target} />}
    </>
  );
}
