import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending, BackSide, BufferGeometry, CanvasTexture, Color, CubeCamera, type DirectionalLight, Float32BufferAttribute,
  Fog, HalfFloatType, type HemisphereLight, Matrix4, Mesh, MeshBasicMaterial, Object3D, Points, PointsMaterial, Scene, ShaderMaterial,
  SphereGeometry, Sprite, SpriteMaterial, Vector3, WebGLCubeRenderTarget,
} from "three";
import { Sky as SkyMesh } from "three/addons/objects/Sky.js";
import { indoor } from "../house/lights.ts";
import { useQuality } from "../quality.ts";
import { playerState } from "../state.ts";
import { gameClock } from "./clock.ts";
import { current, lookAt } from "./look.ts";

// The day/night sky (GAME_SPEC §9): moving sun and moon, sunset colours, a night sky with stars,
// fog and soft sky light that follow the time of day. The server owns the clock (sky/clock.ts).

const DOME_R = 600; // night dome, stars and moon sit this far out, centred on the camera
const ENV_REFRESH_S = 3; // re-light the scene from the sky this often (1 s around sunset/sunrise)

/** Dark blue night sky, lighter at the horizon; fades in as daylight goes. */
function nightDome() {
  const mat = new ShaderMaterial({
    uniforms: { opacity: { value: 0 }, horizon: { value: new Color("#16223a") }, zenith: { value: new Color("#03060d") } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float opacity; uniform vec3 horizon; uniform vec3 zenith;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizon, zenith, pow(h, 0.6)), opacity);
        #include <colorspace_fragment>
      }`,
    side: BackSide,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const mesh = new Mesh(new SphereGeometry(DOME_R, 32, 16), mat);
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  return mesh;
}

/** ~2,500 stars over the upper sky. */
function stars() {
  const pos: number[] = [];
  const col: number[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  while (pos.length < 2500 * 3) {
    const y = rand() * 1.05 - 0.05;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pos.push(Math.cos(a) * r * (DOME_R - 20), y * (DOME_R - 20), Math.sin(a) * r * (DOME_R - 20));
    const b = 0.45 + rand() ** 3 * 0.55;
    const warm = rand() * 0.15;
    col.push(b, b * (1 - warm * 0.3), b * (1 - warm));
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new Float32BufferAttribute(col, 3));
  const mat = new PointsMaterial({
    size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: AdditiveBlending,
  });
  const points = new Points(geo, mat);
  points.renderOrder = -1;
  points.frustumCulled = false;
  return points;
}

/** A soft, slightly cratered full moon. */
function moon() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const glow = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  glow.addColorStop(0, "rgba(220,230,255,0.35)");
  glow.addColorStop(1, "rgba(220,230,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#eef1f6";
  ctx.beginPath();
  ctx.arc(64, 64, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(150,160,180,0.35)";
  for (const [x, y, r] of [[58, 58, 5], [70, 66, 4], [62, 72, 3], [69, 55, 2.5]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false, fog: false, opacity: 0 }));
  sprite.scale.setScalar(70);
  sprite.renderOrder = -1;
  return sprite;
}

function makeSky() {
  const sky = new SkyMesh();
  sky.scale.setScalar(900);
  const u = sky.material.uniforms;
  u.turbidity!.value = 5;
  u.rayleigh!.value = 1.2;
  u.mieCoefficient!.value = 0.004;
  u.mieDirectionalG!.value = 0.8;
  u.cloudCoverage!.value = 0.22; // a few fair-weather summer clouds
  u.cloudDensity!.value = 0.35;
  return sky;
}

/** How far ahead of the bear the shadow box is centred, as a share of its half-width. */
const SHADOW_AHEAD = 0.4;
const shadowTmp = {
  fwd: new Vector3(), centre: new Vector3(), dir: new Vector3(), origin: new Vector3(), up: new Vector3(0, 1, 0),
  basis: new Matrix4(), inverse: new Matrix4(),
};

/** Everything in the sky, plus the fog, sky light and exposure that go with the time of day. */
export function DayNightSky() {
  const { scene, gl, camera } = useThree();
  const q = useQuality();
  const SHADOW_HALF = q.shadowHalf; // metres of crisp shadows around the bear
  const SHADOW_MAP = q.shadowMap;
  const parts = useMemo(() => {
    const sky = makeSky();
    const dome = nightDome();
    const starField = stars();
    const moonSprite = moon();
    // A second copy of the sky (sharing materials) that the scene's reflections are rendered from.
    const envScene = new Scene();
    envScene.add(new Mesh(sky.geometry, sky.material).copy(sky, false), new Mesh(dome.geometry, dome.material));
    const target = new WebGLCubeRenderTarget(128, { type: HalfFloatType });
    const cubeCamera = new CubeCamera(1, 2000, target);
    return { sky, dome, starField, moonSprite, envScene, target, cubeCamera };
  }, []);
  const light = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const shadowTarget = useMemo(() => new Object3D(), []);
  const envTimer = useRef(Infinity);

  useEffect(() => {
    scene.background = current.fog.clone();
    scene.environment = parts.target.texture;
    return () => {
      scene.background = null;
      scene.environment = null;
      parts.target.dispose();
    };
  }, [scene, parts]);
  useEffect(() => {
    scene.fog = new Fog(current.fog.clone(), q.fog[0], q.fog[1]);
    return () => {
      scene.fog = null;
    };
  }, [scene, q]);

  useFrame((_, dt) => {
    const look = lookAt(gameClock(), current, indoor.amount);
    const { sky, dome, starField, moonSprite } = parts;
    const u = sky.material.uniforms;
    const s = look.sky.sun, m = look.sky.moon;
    u.sunPosition!.value.set(s.x, s.y, s.z).multiplyScalar(450000);
    u.time!.value += dt * 1000;

    // Keep the sky things centred on the camera so they never get closer as you walk.
    for (const o of [sky, dome, starField]) o.position.copy(camera.position);
    // The night sky only takes over once the sunset colours have gone.
    (dome.material as ShaderMaterial).uniforms.opacity!.value = Math.min(1, Math.max(0, (look.night - 0.35) / 0.5));
    (starField.material as PointsMaterial).opacity = Math.max(0, (look.night - 0.6) / 0.4) * 0.95;
    moonSprite.position.set(m.x, m.y, m.z).multiplyScalar(DOME_R - 40).add(camera.position);
    (moonSprite.material as SpriteMaterial).opacity = Math.max(0, Math.min(1, (m.y + 0.02) * 12)) * Math.max(0.35, look.night);

    if (scene.fog instanceof Fog) scene.fog.color.copy(look.fog);
    if (scene.background instanceof Color) scene.background.copy(look.fog);
    scene.environmentIntensity = look.envIntensity;
    gl.toneMappingExposure = look.exposure;
    if (hemi.current) {
      hemi.current.color.copy(look.hemi.sky);
      hemi.current.groundColor.copy(look.hemi.ground);
      hemi.current.intensity = look.hemi.intensity;
    }

    // Sun or moon: its shadow box follows the bear, pushed ahead toward where the camera looks (the
    // shadows behind you aren't on screen), and snapped to whole shadow-map texels as the light
    // sees them, so shadow edges hold still instead of shimmering while you move.
    const l = light.current;
    if (l) {
      const texel = (SHADOW_HALF * 2) / SHADOW_MAP;
      const p = playerState.position;
      camera.getWorldDirection(shadowTmp.fwd).setY(0);
      if (shadowTmp.fwd.lengthSq() > 1e-6) shadowTmp.fwd.normalize();
      const centre = shadowTmp.centre.set(p.x, p.y, p.z).addScaledVector(shadowTmp.fwd, SHADOW_HALF * SHADOW_AHEAD);
      // Never let the light skim the ground flat: shadows would stretch for kilometres.
      const dir = shadowTmp.dir.set(look.light.dir.x, Math.max(look.light.dir.y, 0.08), look.light.dir.z).normalize();
      // Into the light's own view (the same turn the shadow camera makes), round, and back out.
      shadowTmp.basis.lookAt(dir, shadowTmp.origin, shadowTmp.up);
      centre.applyMatrix4(shadowTmp.inverse.copy(shadowTmp.basis).transpose());
      centre.set(Math.round(centre.x / texel) * texel, Math.round(centre.y / texel) * texel, centre.z).applyMatrix4(shadowTmp.basis);
      shadowTarget.position.copy(centre);
      l.position.copy(centre).addScaledVector(dir, 120);
      shadowTarget.updateMatrixWorld();
      l.color.copy(look.light.color);
      l.intensity = look.light.intensity;
    }

    // Re-render the sky into the reflection map now and then (often while the colours change fast).
    envTimer.current += dt;
    if (envTimer.current >= (look.sky.glow > 0.05 ? 1 : ENV_REFRESH_S)) {
      envTimer.current = 0;
      // Without the sun's disc: baked into a 128 px map it would light everything like a floodlight.
      u.showSunDisc!.value = 0;
      parts.cubeCamera.update(gl, parts.envScene);
      u.showSunDisc!.value = 1;
    }
  });

  return (
    <>
      <primitive object={parts.sky} />
      <primitive object={parts.dome} />
      <primitive object={parts.starField} />
      <primitive object={parts.moonSprite} />
      <hemisphereLight ref={hemi} />
      <primitive object={shadowTarget} />
      <directionalLight
        key={q.tier} // a new shadow map when the preset changes
        ref={light}
        target={shadowTarget}
        castShadow
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}
