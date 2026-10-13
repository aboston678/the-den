import { STREAM, streamCenter } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import {
  BufferAttribute, BufferGeometry, DataTexture, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, Vector2,
} from "three";
import { TOON } from "../../artStyle.ts";

// The stream (GAME_SPEC §4): ~20 m wide, slow, flowing north→south. A water surface that follows
// the meandering centre line, with gently moving ripples. The stream bed and banks are terrain.

const HALF = STREAM.width / 2 + 3; // a little wider than the water so its edges hide under the banks
const RIPPLE_TILE = 13; // metres per ripple texture repeat
const FLOW = 0.25; // m/s southward

/** A tileable ripple normal map, made from a few overlapping waves. */
function rippleNormals(size = 256) {
  const h = (x: number, y: number) => {
    const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
    return Math.sin(u * 3 + v * 2) * 0.5 + Math.sin(u * 7 - v * 5 + 1.3) * 0.25 + Math.sin(v * 11 + u * 2 + 2.1) * 0.15
      + Math.sin(u * 17 + v * 13 + 0.4) * 0.08;
  };
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
      const len = Math.hypot(dx, dy, 0.35);
      const i = (y * size + x) * 4;
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((0.35 / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new DataTexture(data, size, size);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function surfaceGeometry() {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const zs: number[] = [];
  for (let z = -185; z <= 185; z += 2) zs.push(z);
  zs.forEach((z, i) => {
    const c = streamCenter(z);
    pos.push(c - HALF, STREAM.waterY, z, c + HALF, STREAM.waterY, z);
    uv.push((c - HALF) / RIPPLE_TILE, z / RIPPLE_TILE, (c + HALF) / RIPPLE_TILE, z / RIPPLE_TILE);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function Stream() {
  const geometry = useMemo(surfaceGeometry, []);
  const material = useMemo(() => new MeshStandardMaterial({
    // Cartoon art style: clear turquoise water with livelier ripples (the realistic look: dark, still).
    color: TOON ? "#2b8fae" : "#1d2620",
    roughness: TOON ? 0.32 : 0.16, // cartoon: broader, softer glints (sharp ones flash as white stripes in banded light)
    metalness: 0,
    transparent: true,
    opacity: TOON ? 0.82 : 0.9,
    normalMap: rippleNormals(),
    normalScale: TOON ? new Vector2(0.25, 0.25) : new Vector2(0.18, 0.18),
    envMapIntensity: TOON ? 1.4 : 0.7,
  }), []);

  useFrame((_, dt) => {
    // Ripples drift downstream (uv.y follows world z).
    material.normalMap!.offset.y -= (FLOW / RIPPLE_TILE) * Math.min(dt, 0.1);
  });

  return <mesh geometry={geometry} material={material} receiveShadow name="stream" renderOrder={1} />;
}
