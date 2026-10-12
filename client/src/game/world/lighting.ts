import { type Material, ShaderChunk } from "three";

// Every light costs every lit pixel, and the forest's thousands of overlapping leaves are most of
// the pixels: the house's 10 lamps dropped the frame rate from 60 to ~20 until the forest stopped
// taking lamplight. Trees and forest props skip the house's point lights (they're far from the
// house). Leaves also skip flashlights (spot lights); bark, ground and everything else still
// catch your beam.

const begin = ShaderChunk.lights_fragment_begin;
const POINT = "#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )";
const SPOT = "#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )";

function skipLights(m: Material, spot: boolean) {
  const tag = spot ? "no-point-spot" : "no-point";
  if (m.userData.skipLights === tag) return;
  m.userData.skipLights = tag;
  let chunk = begin.replace(POINT, "#if 0");
  if (spot) chunk = chunk.replace(SPOT, "#if 0");
  const before = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_begin>", chunk);
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${key.call(m)}|${tag}`;
}

/** Forest bark, rocks, logs: no lamplight. */
export const ignorePointLights = (m: Material) => skipLights(m, false);
/** Leaves and fronds: no lamplight and no flashlights. */
export const ignoreLampsAndFlashlights = (m: Material) => skipLights(m, true);
