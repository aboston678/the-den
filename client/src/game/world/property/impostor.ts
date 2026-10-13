import {
  AmbientLight, Box3, Color, DirectionalLight, Group, LinearMipmapLinearFilter, Mesh, OrthographicCamera, PlaneGeometry, SRGBColorSpace,
  Scene, ShaderMaterial, UniformsLib, UniformsUtils, Vector3, type WebGLRenderer, WebGLRenderTarget,
} from "three";
import type { LodPart } from "./InstancedLod.tsx";
import { LOD_FADE_FRAGMENT, LOD_FADE_FRAGMENT_PARS, LOD_FADE_VERTEX, LOD_FADE_VERTEX_PARS } from "./lodFade.ts";

// Far trees as "impostors" (GAME_SPEC §17): each tree kind is photographed once from the side into
// a small picture, and far-away copies are drawn as a single card that always turns to face the
// camera. 2 triangles instead of ~800, and beyond ~60 m nobody can tell, especially through haze.

const W = 384, H = 768; // sharp enough not to look fuzzy at the hand-over distance

export interface Impostor {
  geometry: PlaneGeometry;
  material: ShaderMaterial;
}

/** Photograph a tree (its parts, in model space) and make the card for it. */
export function bakeImpostor(gl: WebGLRenderer, parts: LodPart[]): Impostor {
  const scene = new Scene();
  const group = new Group();
  for (const p of parts) {
    const m = new Mesh(p.geometry, p.material);
    m.applyMatrix4(p.matrix);
    group.add(m);
  }
  scene.add(group);
  // Flat, even light, so the in-game shading (below) can do the rest.
  scene.add(new AmbientLight("#ffffff", 1.6));
  const sun = new DirectionalLight("#ffffff", 1.4);
  sun.position.set(0.3, 1, 1);
  scene.add(sun);

  const box = new Box3().setFromObject(group);
  const size = box.getSize(new Vector3()), centre = box.getCenter(new Vector3());
  const width = Math.max(size.x, size.z), height = size.y;
  // Keep the picture's 1:2 shape: pad whichever way is short.
  const viewW = Math.max(width, height * (W / H)), viewH = viewW * (H / W);
  const cam = new OrthographicCamera(-viewW / 2, viewW / 2, viewH, 0, 0.1, 200);
  cam.position.set(centre.x, box.min.y, centre.z + 100);
  cam.lookAt(centre.x, box.min.y, centre.z);

  const rt = new WebGLRenderTarget(W, H, { samples: 4 });
  rt.texture.colorSpace = SRGBColorSpace;
  rt.texture.generateMipmaps = true;
  rt.texture.minFilter = LinearMipmapLinearFilter;
  const prev = { target: gl.getRenderTarget(), clear: gl.getClearColor(new Color()), alpha: gl.getClearAlpha(), shadows: gl.shadowMap.enabled };
  gl.shadowMap.enabled = false;
  gl.setRenderTarget(rt);
  gl.setClearColor("#2f3a26", 0); // a dark green edge colour, so mipmaps don't fringe white
  gl.clear();
  gl.render(scene, cam);
  gl.setRenderTarget(prev.target);
  gl.setClearColor(prev.clear, prev.alpha);
  gl.shadowMap.enabled = prev.shadows;

  // A card standing on the ground, as wide and tall as the photo.
  const geometry = new PlaneGeometry(viewW, viewH).translate(centre.x, viewH / 2 + box.min.y, 0);
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { map: { value: null }, light: { value: new Color(1, 1, 1) } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      ${LOD_FADE_VERTEX_PARS}
      varying vec2 vUv;
      void main() {
        vUv = uv;
        ${LOD_FADE_VERTEX}
        // Turn the card to face the camera (round the vertical axis only), keeping the copy's size.
        vec3 origin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float scale = length(instanceMatrix[0].xyz);
        vec3 toCam = cameraPosition - origin;
        toCam.y = 0.0;
        vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
        vec3 world = origin + right * position.x * scale + vec3(0.0, position.y * scale, 0.0);
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform sampler2D map;
      uniform vec3 light;
      ${LOD_FADE_FRAGMENT_PARS}
      varying vec2 vUv;
      void main() {
        ${LOD_FADE_FRAGMENT}
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.5) discard;
        gl_FragColor = vec4(t.rgb * light, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
  material.uniforms.map!.value = rt.texture;
  material.userData.lodFade = true; // the dissolve is built in above
  return { geometry, material };
}
