import { CLEARING, heightAt, lawnMask, noise2, streamCenter } from "@den/shared";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from "three";
import { useQuality } from "../../quality.ts";
import { current } from "../../sky/look.ts";

// Fireflies (GAME_SPEC §9, polish): soft yellow-green sparks drifting a metre or two over the lawn
// and along the stream banks from dusk to dawn, each blinking on its own slow rhythm. One draw.

const COUNT = { low: 300, medium: 700, high: 1000 } as const;

/** Where they hover: mostly over the lawn's edges (near the trees), some along the stream. Same every load. */
function places(n: number) {
  const out: number[] = [];
  let i = 0;
  while (out.length < n * 3 && i < n * 40) {
    i++;
    const a = noise2(i, 0, 1, 31) * Math.PI, r = Math.sqrt(Math.abs(noise2(i, 1, 1, 32)));
    let x: number, z: number;
    if (i % 3 === 0) {
      z = -60 + 120 * Math.abs(noise2(i, 2, 1, 33));
      x = streamCenter(z) - (8 + 9 * Math.abs(noise2(i, 3, 1, 34)));
    } else {
      x = CLEARING.cx + Math.cos(a * 2) * CLEARING.rx * (0.2 + 0.85 * r);
      z = CLEARING.cz + Math.sin(a * 2) * CLEARING.rz * (0.2 + 0.85 * r);
      if (lawnMask(x, z) < 0.2) continue;
    }
    out.push(x, heightAt(x, z) + 0.4 + 1.4 * Math.abs(noise2(i, 4, 1, 35)), z);
  }
  return new Float32Array(out);
}

const vertex = /* glsl */ `
  uniform float uTime, uFade, uSize, uView;
  attribute float aSeed;
  varying float vGlow;
  void main() {
    vec3 p = position;
    // Lazy loops and bobbing.
    p.x += sin(uTime * 0.31 + aSeed * 7.0) * 0.9 + sin(uTime * 0.77 + aSeed * 3.0) * 0.3;
    p.z += cos(uTime * 0.27 + aSeed * 5.0) * 0.9;
    p.y += sin(uTime * 0.6 + aSeed * 11.0) * 0.35;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // Blink: dark most of the time, a soft glow for about a second every few seconds.
    float b = sin(uTime * (0.5 + fract(aSeed * 13.0) * 0.6) + aSeed * 40.0);
    float near = 1.0 - smoothstep(35.0, 60.0, -mv.z);
    vGlow = pow(max(b, 0.0), 3.0) * uFade * near;
    gl_PointSize = uSize * uView * projectionMatrix[1][1] / max(-mv.z, 0.5) * (0.6 + 0.4 * vGlow);
    if (vGlow < 0.01) gl_PointSize = 0.0;
  }`;

const fragment = /* glsl */ `
  varying float vGlow;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = smoothstep(1.0, 0.0, d);
    // A bright dot with a soft halo round it.
    gl_FragColor = vec4(vec3(0.85, 1.0, 0.35) * (pow(core, 10.0) * 3.0 + pow(core, 2.5) * 0.45) * vGlow, 1.0);
  }`;

export function Fireflies() {
  const q = useQuality();
  const size = useThree((s) => s.size);
  const points = useMemo(() => {
    const n = COUNT[q.tier];
    const pos = places(n);
    const seed = new Float32Array(pos.length / 3).map((_, i) => (i * 0.6180339) % 1);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new BufferAttribute(seed, 1));
    g.computeBoundingSphere();
    const m = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uSize: { value: 0.55 }, uView: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const p = new Points(g, m);
    p.name = "fireflies";
    p.renderOrder = 5;
    return p;
  }, [q.tier]);
  useEffect(() => () => {
    points.geometry.dispose();
    (points.material as ShaderMaterial).dispose();
  }, [points]);
  useEffect(() => {
    (points.material as ShaderMaterial).uniforms.uView!.value = size.height / 2;
  }, [points, size.height]);

  useFrame((_, dt) => {
    const u = (points.material as ShaderMaterial).uniforms;
    // Out once the porch lights are on and the light is fading, gone again at dawn.
    const sky = current.sky;
    const fade = sky.exteriorLights * Math.min(1, Math.max(0, (0.75 - sky.daylight) / 0.35));
    u.uFade!.value = fade;
    u.uTime!.value += dt;
    points.visible = fade > 0.01;
  });
  return <primitive object={points} />;
}
