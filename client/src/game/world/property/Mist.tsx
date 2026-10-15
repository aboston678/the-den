import { CLEARING, heightAt, lawnMask, noise2, streamCenter, STREAM } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, ShaderMaterial } from "three";
import { useQuality } from "../../quality.ts";
import { current } from "../../sky/look.ts";

// Low mist (polish): soft banks drifting just over the stream and the edges of the lawn, thickest
// around sunrise, lighter at dusk and through the night, gone by day. Each bank is a big soft card
// that turns to face you (round its upright axis) and fades out at its bottom edge, near you and far
// away, so it never shows a hard line where it meets the ground. One draw.

const COUNT = { low: 0, medium: 70, high: 110 } as const;
const W = 14, H = 3.2;

function places(n: number) {
  const out: { x: number; y: number; z: number; s: number }[] = [];
  for (let i = 0; out.length < n && i < n * 30; i++) {
    let x: number, z: number, y: number;
    if (i % 2 === 0) {
      // Over the water, hugging it.
      z = -90 + 180 * Math.abs(noise2(i, 0, 1, 41));
      x = streamCenter(z) + noise2(i, 1, 1, 42) * STREAM.width * 0.35;
      y = STREAM.waterY + 0.9;
    } else {
      // Round the lawn's edge, where it meets the trees.
      const a = noise2(i, 2, 1, 43) * Math.PI * 2;
      x = CLEARING.cx + Math.cos(a) * CLEARING.rx * (0.8 + 0.25 * Math.abs(noise2(i, 3, 1, 44)));
      z = CLEARING.cz + Math.sin(a) * CLEARING.rz * (0.8 + 0.25 * Math.abs(noise2(i, 3, 1, 45)));
      if (lawnMask(x, z) < 0.1) continue;
      y = heightAt(x, z) + 0.9;
    }
    out.push({ x, y, z, s: 0.7 + 0.6 * Math.abs(noise2(i, 4, 1, 46)) });
  }
  return out;
}

const vertex = /* glsl */ `
  uniform float uTime;
  attribute float aSeed;
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    vec3 centre = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float scale = length(instanceMatrix[0].xyz);
    centre.x += sin(uTime * 0.05 + aSeed * 6.0) * 2.5;
    centre.z += cos(uTime * 0.04 + aSeed * 4.0) * 2.5;
    // Face the camera, staying upright.
    vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
    vec3 world = centre + right * position.x * scale + vec3(0.0, 1.0, 0.0) * position.y * scale;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = -mv.z;
    vFade = smoothstep(2.0, 9.0, d) * (1.0 - smoothstep(70.0, 110.0, d));
  }`;

const fragment = /* glsl */ `
  uniform float uTime, uAmount;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    vec2 c = vUv - 0.5;
    // A soft oval, puffy at the top, fading to nothing at the bottom edge.
    float shape = 1.0 - smoothstep(0.15, 0.5, length(c * vec2(1.0, 1.6)));
    shape *= smoothstep(0.0, 0.45, vUv.y);
    float n = noise(vUv * vec2(4.0, 2.0) + vec2(uTime * 0.03 + vSeed * 9.0, vSeed * 5.0)) * 0.6
            + noise(vUv * vec2(9.0, 4.0) - vec2(uTime * 0.05, 0.0)) * 0.4;
    float a = shape * smoothstep(0.25, 0.75, n) * vFade * uAmount * 0.75;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

const WHITE = new Color("#eef2f6");

export function Mist() {
  const q = useQuality();
  const mesh = useMemo(() => {
    const items = places(COUNT[q.tier]);
    const geo = new PlaneGeometry(W, H);
    geo.setAttribute("aSeed", new InstancedBufferAttribute(new Float32Array(items.map((_, i) => (i * 0.37) % 1)), 1));
    const mat = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uColor: { value: new Color() } },
      transparent: true,
      depthWrite: false,
    });
    const m = new InstancedMesh(geo, mat, items.length);
    const mx = new Matrix4();
    items.forEach((p, i) => m.setMatrixAt(i, mx.makeScale(p.s, p.s, p.s).setPosition(p.x, p.y, p.z)));
    m.frustumCulled = false; // the cards turn and drift in the shader
    m.name = "mist";
    m.renderOrder = 4;
    return m;
  }, [q.tier]);
  useEffect(() => () => {
    mesh.geometry.dispose();
    (mesh.material as ShaderMaterial).dispose();
  }, [mesh]);

  useFrame((_, dt) => {
    const u = (mesh.material as ShaderMaterial).uniforms;
    const sky = current.sky;
    // Thick at sunrise, lighter at sunset and through the night.
    const amount = Math.min(1, (1 - sky.daylight) * 0.35 + sky.glow * (sky.phase === "dawn" || sky.phase === "night" ? 0.95 : 0.5));
    u.uAmount!.value = amount;
    u.uTime!.value += dt;
    // The colour of the light: pale by day, the sky's tint at dawn and dusk, dim blue at night.
    (u.uColor!.value as Color).copy(current.fog).lerp(WHITE, 0.35 * sky.daylight + 0.2).multiplyScalar(0.8 + 0.4 * sky.daylight);
    mesh.visible = amount > 0.02 && mesh.count > 0;
  });
  return <primitive object={mesh} />;
}
