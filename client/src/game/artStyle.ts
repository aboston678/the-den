import { ShaderChunk } from "three";
import { settings } from "../ui/settings.ts";

// The art-style test (2026-10-13): Andrew is weighing a brighter, chunkier cartoon look against the
// current realistic one. "Cartoon" is picked in Settings (it reloads the page) or with ?toon in the
// address. It changes the look only, never the gameplay:
//  - lighting in soft bands (lit side / shade side) instead of a smooth photographic falloff
//  - textures softened toward their own average colours, a little more colour saturation
//  - chunky stylized trees and round bushes (toonTrees.ts), a deeper blue sky, a brighter lawn

export type ArtStyle = "realistic" | "cartoon";

/** Decided once at load: shaders and tree models are built for one style. */
export const TOON: boolean = (() => {
  try {
    if (new URLSearchParams(location.search).has("toon")) return true;
  } catch {
    /* no location (tests in node) */
  }
  return settings().artStyle === "cartoon";
})();

/** Soft two-band lighting: anything facing the light is lit almost evenly, with a narrow soft edge. */
const BAND = /* glsl */ `
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	dotNL = smoothstep( 0.0, 0.14, dotNL ) * ( 0.78 + 0.22 * smoothstep( 0.35, 0.75, dotNL ) );
`;

/**
 * Each texture pixel is mostly its blurred surroundings: shapes and colours stay, fine photographic
 * grain goes. Materials already painted for this style (the cartoon scenery models) opt out with the
 * NO_SOFT_MAP define.
 */
const SOFT_MAP = /* glsl */ `
	#ifdef NO_SOFT_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#else
	vec4 sampledDiffuseColor = mix( texture2D( map, vMapUv ), texture( map, vMapUv, 3.0 ), 0.65 );
	#endif
`;

/** A touch more colour, before tone mapping. */
const SATURATE = /* glsl */ `
	gl_FragColor.rgb = max( mix( vec3( dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), gl_FragColor.rgb, 1.15 ), 0.0 );
`;

/** Rewrite three.js's built-in shader pieces for the cartoon look. Call before anything is drawn. */
export function applyArtStyle() {
  if (!TOON || ShaderChunk.lights_physical_pars_fragment.includes("smoothstep( 0.0, 0.14")) return;
  const lights = ShaderChunk.lights_physical_pars_fragment;
  const direct = "\tfloat dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n";
  if (!lights.includes(direct)) throw new Error("three.js lighting chunk changed: update artStyle.ts");
  ShaderChunk.lights_physical_pars_fragment = lights.replace(direct, BAND);

  const map = "\tvec4 sampledDiffuseColor = texture2D( map, vMapUv );\n";
  if (!ShaderChunk.map_fragment.includes(map)) throw new Error("three.js map chunk changed: update artStyle.ts");
  ShaderChunk.map_fragment = ShaderChunk.map_fragment.replace(map, SOFT_MAP);

  ShaderChunk.tonemapping_fragment = SATURATE + ShaderChunk.tonemapping_fragment;
}
