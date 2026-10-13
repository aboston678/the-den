import { BufferGeometry, type Material } from "three";

// Smooth hand-overs between detail levels (no more trees "popping"). Near the edge of a level, a
// copy is drawn in both levels at once and each pixel goes to one or the other by a fixed
// screen-space pattern: the near one dissolves out while the far one dissolves in. Each copy has a
// `lodFade` number (InstancedLod.tsx sets it):
//    0       fully drawn (also what anything without the number gets, e.g. the impostor photo shoot)
//   +t      fading in:  pixels where the pattern is below t
//   -t      fading out: the other pixels (exactly the ones the incoming copy leaves out)

export const LOD_FADE_VERTEX_PARS = /* glsl */ `
attribute float lodFade;
varying float vLodFade;
`;
export const LOD_FADE_VERTEX = /* glsl */ `
vLodFade = lodFade;
`;
export const LOD_FADE_FRAGMENT_PARS = /* glsl */ `
varying float vLodFade;
`;
/** Interleaved-gradient noise: an even, fine-grained pattern that reads as a soft blend. */
export const LOD_FADE_FRAGMENT = /* glsl */ `
if (vLodFade != 0.0) {
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (vLodFade > 0.0 ? n >= vLodFade : n < -vLodFade) discard;
}
`;

/** Teach a standard (three.js built-in) material the fade, keeping any earlier shader tweaks. */
export function addLodFade(m: Material) {
  if (m.userData.lodFade) return;
  m.userData.lodFade = true;
  const before = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${LOD_FADE_VERTEX_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${LOD_FADE_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${LOD_FADE_FRAGMENT_PARS}`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>\n${LOD_FADE_FRAGMENT}`);
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${key.call(m)}|lodFade`;
}

/**
 * A geometry that shares another's data (same GPU buffers) but can carry its own per-copy
 * attributes: each instanced mesh gets its own `lodFade` without touching the model file's geometry.
 */
export function shareGeometry(src: BufferGeometry) {
  const g = new BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
  g.setIndex(src.index);
  for (const grp of src.groups) g.addGroup(grp.start, grp.count, grp.materialIndex);
  g.boundingBox = src.boundingBox;
  g.boundingSphere = src.boundingSphere;
  return g;
}
