import { CLEARING, HOUSE_FOOTPRINT, heightAt, lawnMask, noise2 } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, ShaderMaterial } from "three";
import { useQuality } from "../../quality.ts";
import { current } from "../../sky/look.ts";

// Butterflies by day (polish): a few dozen little orange, white and yellow butterflies flitting
// over the flower bed by the house and the lawn's flowery edges. Wings flap in the shader; one draw.

const COUNT = { low: 0, medium: 36, high: 54 } as const;
const COLOURS = ["#f08a24", "#fbf7ea", "#f6d33a", "#f08a24", "#8fc6f0"].map((c) => new Color(c));

/** Two wings, each a pair of triangles hinged on the body (x = 0). `aSide` = which wing. */
function wings() {
  const pos: number[] = [], side: number[] = [];
  for (const s of [-1, 1]) {
    const w = (x: number, z: number) => [s * x, 0, z];
    for (const v of [w(0, 0.03), w(0.07, 0.05), w(0.075, -0.01), w(0, 0.03), w(0.075, -0.01), w(0, -0.03), w(0, -0.03), w(0.075, -0.01), w(0.05, -0.06)]) {
      pos.push(...v);
      side.push(s);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("aSide", new BufferAttribute(new Float32Array(side), 1));
  return g;
}

function homes(n: number) {
  const out: { x: number; y: number; z: number }[] = [];
  const house = HOUSE_FOOTPRINT.find((r) => r.name === "house")!;
  for (let i = 0; out.length < n && i < n * 40; i++) {
    let x: number, z: number;
    if (i % 3 === 0) {
      // The bed in front of the house (Flowers.tsx).
      x = house.minX + (house.maxX - house.minX) * Math.abs(noise2(i, 0, 1, 71));
      z = house.minZ - 2.4 - 1.5 * Math.abs(noise2(i, 1, 1, 72));
    } else {
      const a = noise2(i, 2, 1, 73) * Math.PI * 2;
      x = CLEARING.cx + Math.cos(a) * CLEARING.rx * 0.85;
      z = CLEARING.cz + Math.sin(a) * CLEARING.rz * 0.85;
      const l = lawnMask(x, z);
      if (l < 0.25 || l > 0.85) continue;
    }
    out.push({ x, y: heightAt(x, z) + 0.6, z });
  }
  return out;
}

const vertex = /* glsl */ `
  uniform float uTime;
  attribute float aSide;
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    float t = uTime + aSeed * 50.0;
    vec3 home = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    // Wandering loops round its patch, bobbing up and down.
    vec3 c = home + vec3(sin(t * 0.37) * 1.6 + sin(t * 0.91) * 0.4, 0.25 * sin(t * 1.3) + 0.15 * sin(t * 3.1), cos(t * 0.29) * 1.6 + cos(t * 0.83) * 0.4);
    vec3 v = vec3(0.37 * cos(t * 0.37) * 1.6, 0.0, -0.29 * sin(t * 0.29) * 1.6);
    float heading = atan(v.x, v.z);
    // Flap: wings swing up and down round the body.
    float flap = (0.25 + 0.95 * abs(sin(t * 14.0))) * aSide;
    vec3 p = position;
    float r = abs(p.x);
    p = vec3(aSide * r * cos(flap * aSide), r * sin(abs(flap)), p.z);
    float ch = cos(heading), sh = sin(heading);
    p = vec3(p.x * ch + p.z * sh, p.y, -p.x * sh + p.z * ch) * 2.2;
    gl_Position = projectionMatrix * viewMatrix * vec4(c + p, 1.0);
  }`;

const fragment = /* glsl */ `
  uniform float uLight;
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(vColor * uLight, 1.0);
  }`;

export function Butterflies() {
  const q = useQuality();
  const mesh = useMemo(() => {
    const items = homes(COUNT[q.tier]);
    const geo = wings();
    geo.setAttribute("aSeed", new InstancedBufferAttribute(new Float32Array(items.map((_, i) => (i * 0.618) % 1)), 1));
    geo.setAttribute("aColor", new InstancedBufferAttribute(new Float32Array(items.flatMap((_, i) => COLOURS[i % COLOURS.length]!.toArray())), 3));
    const mat = new ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: { uTime: { value: 0 }, uLight: { value: 1 } }, side: DoubleSide });
    const m = new InstancedMesh(geo, mat, items.length);
    const mx = new Matrix4();
    items.forEach((p, i) => m.setMatrixAt(i, mx.makeTranslation(p.x, p.y, p.z)));
    m.frustumCulled = false;
    m.name = "butterflies";
    return m;
  }, [q.tier]);
  useEffect(() => () => {
    mesh.geometry.dispose();
    (mesh.material as ShaderMaterial).dispose();
  }, [mesh]);

  useFrame((_, dt) => {
    const u = (mesh.material as ShaderMaterial).uniforms;
    u.uTime!.value += dt;
    const day = current.sky.daylight;
    u.uLight!.value = 0.75 + 0.25 * day;
    // Out in full daylight only; they settle before the sun gets low.
    mesh.visible = mesh.count > 0 && day > 0.85 && current.sky.glow < 0.3;
  });
  return <primitive object={mesh} />;
}
