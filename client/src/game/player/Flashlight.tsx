import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  AdditiveBlending, CanvasTexture, CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial, Object3D, SpotLight, Vector3,
} from "three";
import { remotes } from "../../net/remotes.ts";
import { current } from "../sky/look.ts";
import { cameraState, playerState } from "../state.ts";

// Flashlights (F, GAME_SPEC §9): a spot light from the bear's chest plus a faint visible beam.
// Everyone sees everyone's beam; only your own casts shadows. A fixed set of spot lights is reused
// (dark when off) so switching beams on never makes three.js rebuild its shaders.

/** Spot lights shared by every beam: yours plus the nearest other bears' that are switched on. */
const LIGHTS = 2;
const MAX_BEAMS = 6;
const RANGE = 32;
const ANGLE = 0.38; // radians, half the cone
const BEAM_LENGTH = 9; // the visible shaft
const CHEST_HEIGHT = 1.45;
const CHEST_FORWARD = 0.55;

/** Where the local flashlight points: along the camera's view, tipped up a little (it looks down at the bear). */
export function flashlightAim() {
  return { yaw: cameraState.yaw + Math.PI, pitch: Math.min(0.6, -cameraState.pitch + 0.12) };
}

const dirOf = (yaw: number, pitch: number, out: Vector3) =>
  out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

function beamTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#000");
  g.addColorStop(0.6, "#555");
  g.addColorStop(1, "#fff"); // bright at the lamp end (the top of the cylinder)
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  return new CanvasTexture(c);
}

interface Beam {
  on: boolean;
  origin: Vector3;
  dir: Vector3;
  /** Distance from the local bear, for picking which beams get real lights. */
  dist: number;
  mine: boolean;
}

export function Flashlights() {
  const parts = useMemo(() => {
    const lights = Array.from({ length: LIGHTS }, (_, i) => {
      const l = new SpotLight("#fff2dc", 0, RANGE, ANGLE, 0.45, 2);
      if (i === 0) {
        l.castShadow = true;
        l.shadow.mapSize.set(512, 512);
        l.shadow.camera.near = 0.3;
        l.shadow.camera.far = RANGE;
        l.shadow.bias = -0.0005;
        // Render the shadow map once now: while the beam is off it isn't redrawn (see below), and a
        // shadow map that was never drawn makes WebGL refuse to draw anything at all.
        l.shadow.autoUpdate = false;
        l.shadow.needsUpdate = true;
      }
      const target = new Object3D();
      l.target = target;
      return { light: l, target };
    });
    const tex = beamTexture();
    const radius = Math.tan(ANGLE) * BEAM_LENGTH * 0.8;
    // A cylinder with its narrow end at the origin, pointing down +z.
    const geo = new CylinderGeometry(0.06, radius, BEAM_LENGTH, 20, 1, true).translate(0, -BEAM_LENGTH / 2, 0).rotateX(-Math.PI / 2);
    const shafts = Array.from({ length: MAX_BEAMS }, () => {
      const m = new Mesh(geo, new MeshBasicMaterial({
        color: "#fff0d0", alphaMap: tex, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: true,
      }));
      m.renderOrder = 3;
      m.frustumCulled = false;
      m.visible = false;
      return m;
    });
    const beams: Beam[] = Array.from({ length: MAX_BEAMS }, () => ({ on: false, origin: new Vector3(), dir: new Vector3(), dist: 0, mine: false }));
    return { lights, shafts, beams, geo, tex };
  }, []);
  useEffect(() => () => {
    parts.geo.dispose();
    parts.tex.dispose();
  }, [parts]);

  useFrame(() => {
    const me = playerState.position;
    const beams = parts.beams;
    let n = 0;
    const add = (on: boolean, x: number, y: number, z: number, bodyYaw: number, aimYaw: number, aimPitch: number, mine: boolean) => {
      if (!on || n >= MAX_BEAMS) return;
      const b = beams[n++]!;
      b.on = true;
      b.mine = mine;
      b.origin.set(x + Math.sin(bodyYaw) * CHEST_FORWARD, y + CHEST_HEIGHT, z + Math.cos(bodyYaw) * CHEST_FORWARD);
      dirOf(aimYaw, aimPitch, b.dir);
      b.dist = mine ? -1 : Math.hypot(x - me.x, z - me.z);
    };
    const aim = flashlightAim();
    add(playerState.flashlight, me.x, me.y, me.z, playerState.yaw, aim.yaw, aim.pitch, true);
    for (const r of remotes.values()) {
      const c = r.current;
      // Remote bears face where they last moved; their beam points where their camera looks.
      add(c.flashlight, c.x, c.y, c.z, c.aimYaw, c.aimYaw, c.aimPitch, false);
    }
    for (let i = n; i < MAX_BEAMS; i++) beams[i]!.on = false;

    // Visible shafts for every beam; stronger at night (you can't see a beam in daylight).
    const shaftOpacity = 0.03 + 0.12 * current.night;
    parts.shafts.forEach((s, i) => {
      const b = beams[i]!;
      // Your own shaft would fill the screen from behind; you see your beam on what it lights.
      s.visible = b.on && !b.mine;
      if (!s.visible) return;
      s.position.copy(b.origin);
      s.lookAt(b.origin.x + b.dir.x, b.origin.y + b.dir.y, b.origin.z + b.dir.z);
      (s.material as MeshBasicMaterial).opacity = shaftOpacity;
    });

    // Real lights: slot 0 (the one with shadows) is yours; the rest go to the nearest other beams.
    const active = beams.slice(0, n);
    const mine = active.find((b) => b.mine);
    const others = active.filter((b) => !b.mine).sort((a, b) => a.dist - b.dist);
    parts.lights.forEach(({ light, target }, i) => {
      const b = i === 0 ? mine : others[i - 1];
      light.intensity = b ? 90 : 0;
      // Only redraw the shadow map while your beam is on (it would otherwise redraw the forest every frame).
      if (i === 0) light.shadow.autoUpdate = !!b;
      if (!b) return;
      light.position.copy(b.origin);
      target.position.copy(b.origin).addScaledVector(b.dir, 5);
      target.updateMatrixWorld();
    });
  });

  return (
    <>
      {parts.lights.map(({ light, target }, i) => (
        <group key={i}>
          <primitive object={light} />
          <primitive object={target} />
        </group>
      ))}
      {parts.shafts.map((s, i) => <primitive key={i} object={s} />)}
    </>
  );
}
