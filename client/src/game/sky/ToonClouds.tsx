import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { CanvasTexture, Color, Group, SRGBColorSpace, Sprite, SpriteMaterial } from "three";
import { current } from "./look.ts";

// Big puffy painted clouds for the cartoon art style (game/artStyle.ts), like the concept pictures:
// white tops, soft blue-grey bellies. Flat pictures far away round the horizon that always face you
// and move with you (so they never get closer), tinted by the sunlight and faded out at night.

const COUNT = 10, DIST = 560; // inside the sky domes (600 m)

/** One cloud drawn on a canvas: overlapping round puffs, lit from above. */
function cloudTexture(seed: number) {
  const W = 512, H = 256, c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const puffs: [number, number, number][] = [];
  const n = 9 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = W * (0.14 + 0.72 * t + (rand() - 0.5) * 0.08);
    const r = H * (0.16 + 0.2 * Math.sin(t * Math.PI) + rand() * 0.08);
    puffs.push([x, H * 0.72 - r * 0.55 - rand() * H * 0.06, r]);
  }
  // Belly first (blue-grey), then the lit tops slightly higher, then a flat soft base.
  for (const [layer, dy, colour] of [[0, 0, "#b9c6dc"], [1, -0.12, "#ffffff"]] as const) {
    for (const [x, y, r] of puffs) {
      const g = ctx.createRadialGradient(x, y + dy * r, r * 0.2, x, y + dy * r, r * (layer ? 0.92 : 1));
      g.addColorStop(0, colour);
      g.addColorStop(0.82, colour);
      g.addColorStop(1, layer ? "rgba(255,255,255,0)" : "rgba(185,198,220,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y + dy * r, r * (layer ? 0.92 : 1), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Cut a soft flat bottom.
  ctx.globalCompositeOperation = "destination-out";
  const fade = ctx.createLinearGradient(0, H * 0.7, 0, H * 0.82);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, H * 0.7, W, H * 0.3);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function ToonClouds() {
  const camera = useThree((s) => s.camera);
  const group = useMemo(() => {
    const g = new Group();
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 2 + Math.sin(i * 12.9) * 0.25;
      const mat = new SpriteMaterial({ map: cloudTexture(i + 1), transparent: true, depthWrite: false, fog: false, toneMapped: false });
      const sprite = new Sprite(mat);
      const w = 280 + 140 * Math.abs(Math.sin(i * 7.7));
      sprite.scale.set(w, w / 2, 1);
      sprite.position.set(Math.cos(a) * DIST, 95 + 70 * Math.abs(Math.sin(i * 3.3)), Math.sin(a) * DIST);
      sprite.renderOrder = -1; // right after the sky, before everything else
      g.add(sprite);
    }
    return g;
  }, []);
  useEffect(() => () => group.children.forEach((s) => {
    const m = (s as Sprite).material;
    m.map?.dispose();
    m.dispose();
  }), [group]);

  const tint = useMemo(() => new Color(), []);
  useFrame(() => {
    group.position.copy(camera.position);
    const day = 1 - current.night;
    // Sunlit white by day, warm at sunset (the light's colour), gone by night.
    tint.setRGB(1, 1, 1).lerp(current.light.color, 0.35 + 0.4 * current.sky.glow);
    for (const s of group.children) {
      const m = (s as Sprite).material;
      m.color.copy(tint);
      m.opacity = Math.max(0, Math.min(1, (day - 0.15) / 0.5));
    }
  });
  return <primitive object={group} />;
}
