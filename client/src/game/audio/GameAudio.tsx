import { streamCenter } from "@den/shared";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { PositionalAudio } from "three";
import { usePartyStore } from "../../net/party.ts";
import { FIRE_POS, indoor } from "../house/lights.ts";
import { current } from "../sky/look.ts";
import { settings } from "../../ui/settings.ts";
import { playerState } from "../state.ts";
import { getListener, loadSound, playAt, soundRoot } from "./audio.ts";
import { fireBuffer, roomToneBuffer, windBuffer } from "./synth.ts";

// Ambient sound by time of day (GAME_SPEC §10). Day: birds and wind in the pines, a woodpecker or
// a hermit thrush now and then. Dawn: the dawn chorus. Night: crickets and tree frogs, and the odd
// loon from the stream. The stream is heard near the water, the fire crackles at night, and
// indoors the outdoors gets quieter and muffled while the room's quiet hum comes up.

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

interface Bed {
  gain: GainNode;
  /** Target volume this frame. */
  level: () => number;
}

/** Stream sources along the bank, spaced along the water and kept level with the bear. */
const STREAM_SPOTS = [-28, 0, 28];

export function GameAudio() {
  const camera = useThree((s) => s.camera);
  const world = usePartyStore((s) => s.world);
  const property = world === "property";

  const parts = useMemo(() => {
    const listener = getListener();
    const ctx = listener.context;
    // Outdoor sounds go through one filter that closes down when you're inside.
    const outdoorFilter = ctx.createBiquadFilter();
    outdoorFilter.type = "lowpass";
    outdoorFilter.frequency.value = 18000;
    const outdoorGain = ctx.createGain();
    outdoorFilter.connect(outdoorGain).connect(listener.getInput());
    return { listener, ctx, outdoorFilter, outdoorGain, beds: [] as Bed[], sources: [] as AudioScheduledSourceNode[], positional: [] as PositionalAudio[] };
  }, []);

  useEffect(() => {
    camera.add(parts.listener);
    return () => {
      camera.remove(parts.listener);
    };
  }, [camera, parts]);

  // Looping beds.
  useEffect(() => {
    const { ctx } = parts;
    let cancelled = false;
    const startLoop = (buffer: AudioBuffer, level: () => number, dest: AudioNode, offset = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(dest);
      src.start(0, offset % buffer.duration);
      parts.sources.push(src);
      parts.beds.push({ gain, level });
    };
    const out = parts.outdoorFilter;
    const sky = () => current.sky;
    const dawnish = () => sky().glow * (sky().sun.x > 0 ? 1 : 0.3); // the chorus is loudest at sunrise
    const beds: [string, () => number][] = [
      ["day-birds", () => 0.8 * smooth(0.2, 0.8, sky().daylight)],
      ["dawn-chorus", () => 0.8 * dawnish() * smooth(0.1, 0.5, sky().daylight)],
      ["crickets", () => 0.7 * smooth(0.5, 0.95, current.night)],
      ["treefrogs", () => 0.3 * smooth(0.6, 1, current.night)],
    ];
    for (const [name, level] of beds) {
      void loadSound(name).then((b) => !cancelled && startLoop(b, level, out, Math.random() * 30)).catch((e) => console.warn("[den] sound", e));
    }
    startLoop(windBuffer(ctx), () => 0.12 + 0.1 * current.sky.daylight, out, Math.random() * 20);
    // Inside: a soft room hum (not muffled).
    startLoop(roomToneBuffer(ctx), () => 0.06 * indoor.amount, parts.listener.getInput());
    return () => {
      cancelled = true;
      for (const s of parts.sources) s.stop();
      parts.sources.length = 0;
      parts.beds.length = 0;
    };
  }, [parts]);

  // Positional loops: the stream (property only) and the fire.
  useEffect(() => {
    if (!property) return;
    const { listener } = parts;
    let cancelled = false;
    const make = (buffer: AudioBuffer, ref: number, volume: number) => {
      const s = new PositionalAudio(listener);
      s.setBuffer(buffer);
      s.setLoop(true);
      s.setRefDistance(ref);
      s.setDistanceModel("inverse");
      s.setRolloffFactor(1.3);
      s.setVolume(volume);
      s.offset = Math.random() * buffer.duration;
      soundRoot.add(s);
      parts.positional.push(s);
      return s;
    };
    void loadSound("stream").then((b) => {
      if (cancelled) return;
      STREAM_SPOTS.forEach((dz, i) => {
        const s = make(b, 9, 1.5);
        s.userData.streamOffset = dz;
        s.offset = (i * b.duration) / 3;
        s.play();
      });
    });
    const fire = make(fireBuffer(parts.ctx), 3, 0);
    fire.position.set(...FIRE_POS);
    fire.userData.fire = true;
    fire.play();
    return () => {
      cancelled = true;
      for (const s of parts.positional) {
        if (s.isPlaying) s.stop();
        soundRoot.remove(s);
      }
      parts.positional.length = 0;
    };
  }, [parts, property]);

  // One-shot birds and loons, now and then.
  const timers = useMemo(() => ({ bird: 8 + Math.random() * 15, loon: 10 + Math.random() * 30 }), []);

  useFrame((_, dt) => {
    const { ctx, outdoorFilter, outdoorGain } = parts;
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;
    // Inside: outdoors quieter and muffled.
    const inside = indoor.amount;
    outdoorFilter.frequency.setTargetAtTime(18000 - 17000 * inside, now, 0.15);
    outdoorGain.gain.setTargetAtTime(1 - 0.65 * inside, now, 0.15);
    const amb = settings().ambience;
    for (const bed of parts.beds) bed.gain.gain.setTargetAtTime(bed.level() * amb, now, 0.5);

    const p = playerState.position;
    for (const s of parts.positional) {
      if (s.userData.fire) {
        s.setVolume(0.9 * current.sky.exteriorLights * amb);
        continue;
      }
      const z = p.z + (s.userData.streamOffset as number);
      s.position.set(streamCenter(z) - 6, p.y > -6 ? -7 : p.y, z);
      // Muffled indoors too (the house is far from the stream anyway).
      s.setVolume(1.5 * (1 - 0.7 * inside) * amb);
    }

    // Day: a woodpecker or a thrush somewhere in the trees. Night: a loon on the stream.
    timers.bird -= dt;
    timers.loon -= dt;
    const sky = current.sky;
    if (timers.bird <= 0) {
      timers.bird = 25 + Math.random() * 45;
      if (sky.daylight > 0.5) {
        const a = Math.random() * Math.PI * 2, d = 25 + Math.random() * 30;
        void playAt(Math.random() < 0.5 ? "flicker" : "thrush", p.x + Math.cos(a) * d, p.y + 8, p.z + Math.sin(a) * d, 0.7 * (1 - 0.6 * inside) * amb, 12);
      }
    }
    if (timers.loon <= 0) {
      timers.loon = 45 + Math.random() * 75;
      if (property && current.night > 0.6) {
        const z = p.z + (Math.random() - 0.5) * 120;
        void playAt(`loon-${1 + Math.floor(Math.random() * 3)}`, streamCenter(z), -7, z, (1 - 0.6 * inside) * amb, 40);
      }
    }
  });

  return <primitive object={soundRoot} />;
}
