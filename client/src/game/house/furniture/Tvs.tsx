import { FURNITURE, kindOf, levelOfRoom, roomFloorY } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, PositionalAudio, SRGBColorSpace, Vector3, VideoTexture } from "three";
import { create } from "zustand";
import { settings } from "../../../ui/settings.ts";
import { getListener } from "../../audio/audio.ts";
import { playerState } from "../../state.ts";
import { indoor } from "../lights.ts";
import { toWorld } from "../space.ts";

// The TVs in the common area and the basement den (GAME_SPEC §8.4) play Andrew's home-video loop.
// The clips are private: they never ship with the website. Signed-in players get a short-lived
// link to them (set here by sign-in, milestone 2.5); until then the screens stay dark. In
// development the local copy from `npm run build:tv` plays. Sound comes from each TV and is only
// heard up close; the video only runs while you're on the same floor as a TV and near it.

/** Where the TV loop comes from right now, or null (screens dark). */
export const useTvSource = create<{ url: string | null }>(() => ({ url: import.meta.env.DEV ? "/video/tv.mp4" : null }));

/** Play only within this distance of a TV (world metres). */
const PLAY_WITHIN = 16;

interface Screen {
  mesh: Mesh;
  world: Vector3;
  level: string;
}

function screens(material: MeshBasicMaterial): Screen[] {
  return FURNITURE.filter((p) => p.kind === "tv").map((p) => {
    const k = kindOf(p);
    const y = roomFloorY(p.room) + (p.y ?? 0);
    const m = new Matrix4().makeTranslation(p.x, y, p.z).multiply(new Matrix4().makeRotationY(((p.rot ?? 0) * Math.PI) / 180));
    // Matches the screen in tables.ts → tv(): just in front of the dark glass.
    const mesh = new Mesh(new PlaneGeometry(k.w - 0.03, k.h - 0.03).translate(0, 0.08 + k.h / 2, k.d / 2 + 0.003), material);
    mesh.applyMatrix4(m);
    mesh.name = "furniture:tv-screen";
    mesh.visible = false;
    const c = new Vector3(p.x, y + 0.08 + k.h / 2, p.z);
    return { mesh, world: new Vector3(...toWorld([c.x, c.y, c.z])), level: levelOfRoom(p.room)!.id };
  });
}

interface Parts {
  video: HTMLVideoElement;
  list: Screen[];
  sounds: PositionalAudio[];
  failed: boolean;
}

export function Tvs() {
  const url = useTvSource((s) => s.url);
  const [parts, setParts] = useState<Parts | null>(null);

  // Everything is made (and torn down) here, so a remount never reuses a video already wired to Web Audio.
  useEffect(() => {
    if (!url) return;
    const video = document.createElement("video");
    video.src = url;
    video.loop = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    const texture = new VideoTexture(video);
    texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({ map: texture, toneMapped: false });
    const p: Parts = { video, list: screens(material), sounds: [], failed: false };
    video.onerror = () => (p.failed = true);
    // Sound: the video's audio, played from each screen (one source, a panner per TV).
    const listener = getListener();
    try {
      const source = listener.context.createMediaElementSource(video);
      for (const s of p.list) {
        const a = new PositionalAudio(listener);
        a.setNodeSource(source as unknown as AudioBufferSourceNode);
        a.setRefDistance(1.6);
        a.setRolloffFactor(2.2);
        a.setDistanceModel("inverse");
        a.position.copy(s.world);
        a.updateMatrixWorld();
        p.sounds.push(a);
      }
    } catch {
      video.muted = true; // no Web Audio: play silently
    }
    setParts(p);
    return () => {
      setParts(null);
      video.pause();
      video.removeAttribute("src");
      video.load();
      texture.dispose();
      material.dispose();
      for (const s of p.list) s.mesh.geometry.dispose();
      for (const a of p.sounds) a.disconnect();
    };
  }, [url]);

  useFrame(() => {
    if (!parts || parts.failed) return;
    const p = playerState.position;
    const near = parts.list.some((s) => s.level === indoor.level && s.world.distanceTo(p) < PLAY_WITHIN);
    for (const s of parts.list) s.mesh.visible = near;
    const vol = settings().ambience;
    for (const a of parts.sounds) a.setVolume(0.9 * vol);
    if (near && parts.video.paused) void parts.video.play().catch(() => {});
    else if (!near && !parts.video.paused) parts.video.pause();
  });

  if (!parts) return null;
  return <>{parts.list.map((s) => <primitive key={s.mesh.uuid} object={s.mesh} />)}</>;
}
