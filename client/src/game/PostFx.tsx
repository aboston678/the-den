import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { Effect, ToneMappingMode } from "postprocessing";
import { useMemo } from "react";
import { Uniform } from "three";
import { useQuality } from "./quality.ts";

// Screen effects by preset (GAME_SPEC §3, §17). High: soft glow round bright lights (lamps, windows,
// the fire, flashlights), ambient occlusion (soft contact shadows in corners and under things) and
// a gentle vignette. Low and Medium draw the scene straight to the screen: on an M1 these effects
// cost ~15 fps at 1080p.

/** The effect chain does its own tone mapping, so it applies the sky's exposure itself (sky/Sky.tsx sets it). */
class ExposureEffect extends Effect {
  constructor() {
    super("Exposure", /* glsl */ `
      uniform float exposure;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = vec4(inputColor.rgb * exposure, inputColor.a);
      }`, { uniforms: new Map([["exposure", new Uniform(1)]]) });
  }
}

export function PostFx() {
  const q = useQuality();
  const gl = useThree((s) => s.gl);
  const exposure = useMemo(() => new ExposureEffect(), []);
  useFrame(() => {
    exposure.uniforms.get("exposure")!.value = gl.toneMappingExposure;
  });
  if (!q.bloom) return null;
  return (
    <EffectComposer multisampling={4}>
      {q.ambientOcclusion ? <N8AO aoRadius={1.2} intensity={2.2} distanceFalloff={0.6} halfRes quality="performance" /> : <></>}
      <primitive object={exposure} />
      <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.3} darkness={0.45} />
    </EffectComposer>
  );
}
