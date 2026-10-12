import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { Material, Mesh, Texture } from "three";
import { autoStepDown } from "./quality.ts";
import { playerState } from "./state.ts";

// Performance numbers for tests and tuning (GAME_SPEC §17): frame rate over the last couple of
// seconds, draw calls and triangles per frame, and roughly how much texture memory the scene uses.

const frames: number[] = [];
const last = { calls: 0, triangles: 0 };

export const perfStats = { frames, last };

function textureMB(scene: import("three").Object3D) {
  const seen = new Set<Texture>();
  scene.traverse((o) => {
    const mats = (o as Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      for (const v of Object.values(m as Material & Record<string, unknown>)) {
        if (v && (v as Texture).isTexture) seen.add(v as Texture);
      }
    }
  });
  let bytes = 0;
  for (const t of seen) {
    const img = t.image as { width?: number; height?: number } | undefined;
    if (img?.width && img.height) bytes += img.width * img.height * 4 * (t.generateMipmaps ? 1.33 : 1);
  }
  return bytes / 1024 / 1024;
}

/** Auto graphics: 6 s after landing, average 4 s of frames; step down a tier if that's too slow. */
const autoCheck = { since: -1, done: false };

export function PerfProbe() {
  const { gl, scene } = useThree();
  useEffect(() => {
    if (!window.__den) return;
    window.__den.perf = () => {
      const recent = frames.slice(-120);
      const avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
      const sorted = [...recent].sort((a, b) => a - b);
      return {
        fps: avg ? 1000 / avg : 0,
        p95ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        calls: last.calls,
        triangles: last.triangles,
        textureMB: Math.round(textureMB(scene)),
        programs: gl.info.programs?.length ?? 0,
        pixelRatio: gl.getPixelRatio(),
        size: `${gl.domElement.width}x${gl.domElement.height}`,
      };
    };
    /** Triangles and draw calls by mesh name (camera view only, no shadows), biggest first. */
    window.__den.perfBreakdown = () => {
      const by = new Map<string, { tris: number; meshes: number }>();
      scene.traverseVisible((o) => {
        const m = o as Mesh & { count?: number; isInstancedMesh?: boolean };
        if (!m.isMesh || !m.geometry) return;
        const g = m.geometry;
        const tris = (g.index ? g.index.count : g.attributes.position!.count) / 3;
        const n = m.isInstancedMesh ? (m.count ?? 0) : 1;
        if (!n) return;
        const key = (m.name || m.parent?.name || "?").split(":")[0]!;
        const e = by.get(key) ?? { tris: 0, meshes: 0 };
        e.tris += tris * n;
        e.meshes += 1;
        by.set(key, e);
      });
      return [...by.entries()].sort((a, b) => b[1].tris - a[1].tris).slice(0, 25).map(([k, v]) => `${k}: ${Math.round(v.tris / 1000)}k tris, ${v.meshes} draws`);
    };
    frames.length = 0;
  }, [gl, scene]);
  useFrame((_, dt) => {
    frames.push(dt * 1000);
    if (frames.length > 600) frames.splice(0, frames.length - 600);
    // R3F resets gl.info each frame before rendering, so this is last frame's totals (shadows included).
    last.calls = gl.info.render.calls;
    last.triangles = gl.info.render.triangles;

    if (!autoCheck.done && playerState.grounded && playerState.colliderHandle >= 0) {
      if (autoCheck.since < 0) autoCheck.since = 0;
      autoCheck.since += dt;
      if (autoCheck.since > 10) {
        autoCheck.done = true;
        let ms = 0, n = 0;
        for (let i = frames.length - 1; i >= 0 && ms < 4000; i--, n++) ms += frames[i]!;
        const avg = ms / Math.max(1, n);
        const next = autoStepDown(1000 / avg);
        if (next) console.info(`[den] graphics: Auto stepped down to ${next} (${(1000 / avg).toFixed(0)} fps)`);
      }
    }
  });
  return null;
}
