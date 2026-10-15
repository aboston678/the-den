import { HOUSE, houseToWorld } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, ShaderMaterial } from "three";
import { current } from "../../sky/look.ts";

// Wood smoke from the great room's chimney (polish) while the fire is lit (dusk to dawn, like the
// fire itself, house/Lights.tsx): soft grey puffs that rise, drift with the wind, swell and fade.
// Each puff is a card turned to face you; the whole plume is one draw.

const PUFFS = 18;
/** Seconds for a puff to rise and fade. */
const LIFE = 9;
/** The chimney top (house/exterior.ts chimney(), floorplan metres). */
const TOP = (() => {
  const w = houseToWorld(29.125, 7.1);
  return { x: w.x, y: 8.3 * HOUSE.scale, z: w.z };
})();

const vertex = /* glsl */ `
  uniform float uTime;
  attribute float aSeed;
  varying vec2 vUv;
  varying float vAge;
  void main() {
    vUv = uv;
    float age = fract(uTime / ${LIFE.toFixed(1)} + aSeed);
    vAge = age;
    vec3 centre = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    // Up, and leaning away on the breeze as it goes.
    centre += vec3(2.6 * age * age + sin(aSeed * 20.0 + uTime * 0.3) * 0.3 * age, 4.5 * age, 1.2 * age * age);
    float size = 0.7 + 2.6 * age;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = centre + (right * position.x + up * position.y) * size;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }`;

const fragment = /* glsl */ `
  uniform float uAmount;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vAge;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float puff = smoothstep(1.0, 0.2, d);
    float a = puff * smoothstep(0.0, 0.08, vAge) * (1.0 - smoothstep(0.45, 1.0, vAge)) * 0.38 * uAmount;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

const SMOKE = new Color("#c9c6c2");

export function ChimneySmoke() {
  const mesh = useMemo(() => {
    const geo = new PlaneGeometry(1, 1);
    geo.setAttribute("aSeed", new InstancedBufferAttribute(new Float32Array(PUFFS).map((_, i) => i / PUFFS), 1));
    const mat = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uColor: { value: new Color() } },
      transparent: true,
      depthWrite: false,
    });
    const m = new InstancedMesh(geo, mat, PUFFS);
    const mx = new Matrix4().setPosition(TOP.x, TOP.y, TOP.z);
    for (let i = 0; i < PUFFS; i++) m.setMatrixAt(i, mx);
    m.frustumCulled = false;
    m.name = "chimney-smoke";
    m.renderOrder = 4;
    return m;
  }, []);
  useEffect(() => () => {
    mesh.geometry.dispose();
    (mesh.material as ShaderMaterial).dispose();
  }, [mesh]);

  useFrame((_, dt) => {
    const u = (mesh.material as ShaderMaterial).uniforms;
    const lit = current.sky.exteriorLights;
    u.uAmount!.value = lit;
    u.uTime!.value += dt;
    // Lit by the sky: pale grey by sunset, a dim blue-grey at night.
    (u.uColor!.value as Color).copy(SMOKE).lerp(current.fog, 0.45).multiplyScalar(0.55 + 0.45 * current.sky.daylight);
    mesh.visible = lit > 0.02;
  });
  return <primitive object={mesh} />;
}
