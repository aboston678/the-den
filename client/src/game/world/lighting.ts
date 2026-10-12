import { type Material, ShaderChunk } from "three";

// The house's lamps are point lights. Every point light costs every lit pixel, and the forest's
// thousands of overlapping leaves made 10 lamps drop the frame rate from 60 to ~20. Trees and
// forest props don't need lamplight (they're far from the house), so they skip it. The flashlight
// is a spot light and still lights them.

const CHUNK = ShaderChunk.lights_fragment_begin.replace("#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )", "#if 0");

export function ignorePointLights(m: Material) {
  if (m.userData.noPointLights) return;
  m.userData.noPointLights = true;
  const before = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_begin>", CHUNK);
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${key.call(m)}|no-point-lights`;
}
