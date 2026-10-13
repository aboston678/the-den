import { Color, type DataArrayTexture, MeshStandardMaterial } from "three";
import { TOON } from "../../artStyle.ts";

// The ground's shader: five CC0 textures (lawn, forest floor, forest edge, mud, stream bed) blended
// per vertex by the weights from surfaceAt() (shared/src/world/terrain.ts), tiled in world metres.
// Standard three.js lighting, shadows and fog still apply.

/** Texture-array layer order, and how many metres one tile of each covers. */
export const TERRAIN_LAYERS = ["lawn", "forest", "forest_edge", "mud", "streambed"] as const;
const TILE = [3.2, 4.5, 4.0, 3.5, 2.5];

/**
 * Cartoon art style: the textures are read blurrier (fewer, softer details), the lawn is a brighter
 * green and the bumps are gentler.
 */
const BIAS = TOON ? ", 2.5" : "";
const LAWN = TOON ? "vec3(0.74, 1.16, 0.46)" : "vec3(0.80, 1.02, 0.62)";
const BUMPS = TOON ? "0.35" : "1.0";
/** Cartoon: each ground layer is painted in one colour, the photo texture only adds a little light and dark. */
const PAINT = ["#6fc041", "#5d8a35", "#7d9a3c", "#7f8a44", "#7c7058"].map((hex) => {
  const c = new Color(hex);
  return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`;
});
const PAINT_LAYER = TOON
  ? `{
          const vec3 PAINT[5] = vec3[5](${PAINT.join(", ")});
          float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
          float avg = dot(texture(uColour, vec3(vWPos.xz / 40.0, float(i)), 8.0).rgb, vec3(0.2126, 0.7152, 0.0722));
          c.rgb = PAINT[i] * clamp(1.0 + (lum - avg) / max(avg, 0.02) * 0.35, 0.75, 1.25);
        }`
  : "";

export function createTerrainMaterial(colour: DataArrayTexture, normal: DataArrayTexture) {
  const mat = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uColour = { value: colour };
    shader.uniforms.uNormal = { value: normal };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        attribute vec4 splatA; // lawn, forest, forest edge, mud
        attribute vec2 splatB; // stream bed, brightness variation
        varying vec4 vSplatA;
        varying vec2 vSplatB;
        varying vec3 vWPos;
        varying vec3 vWNormal;`)
      .replace("#include <fog_vertex>", `#include <fog_vertex>
        vSplatA = splatA;
        vSplatB = splatB;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`);

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray uColour;
        uniform sampler2DArray uNormal;
        varying vec4 vSplatA;
        varying vec2 vSplatB;
        varying vec3 vWPos;
        varying vec3 vWNormal;
        const float TILE[5] = float[5](${TILE.map((t) => t.toFixed(2)).join(", ")});
        const mat2 TURN = mat2(0.8, -0.6, 0.6, 0.8);
        vec3 tNormal;
        float tRough;

        // Colour + roughness, mixed with a bigger rotated copy so the tiling doesn't show.
        vec4 layerColour(int i, vec2 p) {
          vec4 a = texture(uColour, vec3(p / TILE[i], float(i))${BIAS});
          vec4 b = texture(uColour, vec3(TURN * p / (TILE[i] * 3.7), float(i))${BIAS});
          return mix(a, b, 0.35);
        }
        vec3 layerNormal(int i, vec2 p) {
          return texture(uNormal, vec3(p / TILE[i], float(i))).xyz * 2.0 - 1.0;
        }`)
      .replace("#include <map_fragment>", `
        float w[5] = float[5](vSplatA.x, vSplatA.y, vSplatA.z, vSplatA.w, vSplatB.x);
        vec4 cr = vec4(0.0);
        vec3 nt = vec3(0.0);
        float total = 0.0;
        for (int i = 0; i < 5; i++) {
          if (w[i] < 0.01) continue;
          vec4 c = layerColour(i, vWPos.xz);
          if (i == 0) c.rgb *= ${LAWN}; // greener, lusher lawn (summer, GAME_SPEC §1)
          ${PAINT_LAYER}
          cr += c * w[i];
          nt += layerNormal(i, vWPos.xz) * w[i];
          total += w[i];
        }
        cr /= max(total, 1e-4);
        diffuseColor.rgb *= cr.rgb * vSplatB.y;
        tRough = cr.a;
        tNormal = normalize(nt * vec3(${BUMPS}, ${BUMPS}, 1.0) + vec3(0.0, 0.0, 0.001));`)
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = mix(0.75, 1.0, tRough);")
      .replace("#include <normal_fragment_maps>", `{
        // Tangent frame from world axes (the textures are tiled on world x/z).
        vec3 N = normalize(vWNormal);
        vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
        vec3 B = cross(T, N);
        vec3 nW = normalize(T * tNormal.x + B * tNormal.y + N * tNormal.z);
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
      }`);
  };
  return mat;
}
