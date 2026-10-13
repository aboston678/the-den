import { type FishState, STREAM } from "@den/shared";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, SphereGeometry, Vector3,
} from "three";
import { NO_FISH, useFishStore, usePartyStore } from "../../net/party.ts";
import type { FishView } from "../../net/remotes.ts";
import { remotes } from "../../net/remotes.ts";
import { playAt } from "../audio/audio.ts";
import { rigs } from "./rig.ts";

// What everyone sees of everyone's fishing (GAME_SPEC §13): the line from the rod tip to a
// red-and-white bobber, the cast flying out, the bobber plunging on a bite and thrashing in a
// fight, splashes, and the fish held up when it's landed. Driven by the server's fishing state.

const FISH_URL = "/models/fish.glb";
const FISH_NODES: Record<string, string> = {
  sunfish: "fish-sunfish", perch: "fish-yellow-perch", crappie: "fish-crappie", smallmouth: "fish-smallmouth-bass", largemouth: "fish-largemouth-bass",
};
const SEGMENTS = 24;
const FLIGHT_S = 0.7;
const WATER = STREAM.waterY + 0.02;

/** A fish's length (metres) from its weight in pounds. */
export const fishLength = (lb: number) => Math.min(0.62, Math.max(0.14, 0.28 * Math.cbrt(lb)));

interface View {
  line: Line;
  bobber: Group;
  ring: Mesh;
  fish: Group;
  prev: FishState;
  prevSurges: number;
  flightFrom: Vector3;
  flightT: number;
  ringT: number;
  pos: Vector3;
}

export function FishingLines() {
  const { scene: fishScene } = useGLTF(FISH_URL);
  const lineMat = useMemo(() => new LineBasicMaterial({ color: "#fbf8f0" }), []);
  const parts = useMemo(() => ({
    red: new MeshStandardMaterial({ color: "#d42a1e", roughness: 0.4 }),
    white: new MeshStandardMaterial({ color: "#f4f2ec", roughness: 0.4 }),
    ring: new MeshBasicMaterial({ color: "#e9f2f4", transparent: true, opacity: 0, depthWrite: false }),
  }), []);
  const root = useMemo(() => {
    const g = new Group();
    g.name = "fishing";
    return g;
  }, []);
  const views = useMemo(() => new Map<string, View>(), []);

  const viewFor = (id: string): View => {
    let v = views.get(id);
    if (v) return v;
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
    const line = new Line(geo, lineMat);
    line.frustumCulled = false;
    const bobber = new Group();
    const top = new Mesh(new SphereGeometry(0.08, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), parts.red);
    const bottom = new Mesh(new SphereGeometry(0.08, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), parts.white);
    bobber.add(top, bottom);
    const ring = new Mesh(new RingGeometry(0.2, 0.32, 24).rotateX(-Math.PI / 2), parts.ring.clone());
    const fish = new Group();
    for (const [species, node] of Object.entries(FISH_NODES)) {
      const src = fishScene.getObjectByName(node);
      if (!src) continue;
      const m = src.clone();
      m.name = species;
      m.visible = false;
      fish.add(m);
    }
    root.add(line, bobber, ring, fish);
    v = { line, bobber, ring, fish, prev: "", prevSurges: 0, flightFrom: new Vector3(), flightT: 1, ringT: 1, pos: new Vector3() };
    views.set(id, v);
    return v;
  };

  useEffect(() => () => {
    for (const v of views.values()) v.line.geometry.dispose();
    views.clear();
  }, [views]);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const ids = ["me", ...usePartyStore.getState().remoteIds];
    for (const [id, v] of views) {
      if (!ids.includes(id)) {
        root.remove(v.line, v.bobber, v.ring, v.fish);
        views.delete(id);
      }
    }
    for (const id of ids) {
      const f: FishView = id === "me" ? useFishStore.getState().me : (remotes.get(id)?.fish ?? NO_FISH);
      const rig = rigs.get(id);
      const v = viewFor(id);
      const out = f.state === "cast" || f.state === "bite" || f.state === "fight";
      const target = new Vector3(f.lureX, WATER, f.lureZ);

      // State changes: start the cast's flight, sounds and splashes.
      if (f.state !== v.prev) {
        if (f.state === "cast" && rig) {
          v.flightFrom.copy(rig.tip);
          v.flightT = 0;
        }
        if (f.state === "bite") splash(v, target, "plop", 0.7);
        if (f.state === "landed") splash(v, v.pos, "splash", 1);
        if (f.state === "snapped" && rig) void playAt("line-snap", rig.tip.x, rig.tip.y, rig.tip.z, 0.8, 4);
        v.prev = f.state;
      }
      if (f.state === "fight" && f.surges !== v.prevSurges) splash(v, v.pos, "splash", 0.5);
      v.prevSurges = f.surges;

      // The bobber: flying out, floating, plunging on a bite, dragged under in a fight.
      v.bobber.visible = out && !!rig;
      if (v.bobber.visible) {
        if (v.flightT < 1) {
          v.flightT = Math.min(1, v.flightT + dt / FLIGHT_S);
          const k = v.flightT;
          v.pos.lerpVectors(v.flightFrom, target, k);
          v.pos.y += Math.sin(Math.PI * k) * 3;
          if (k === 1) splash(v, target, "plop", 0.6);
        } else {
          const bob = f.state === "bite" ? -0.1 + Math.sin(t * 25) * 0.04 : f.state === "fight" ? -0.06 + Math.sin(t * 17) * 0.05 : Math.sin(t * 2.2) * 0.012;
          v.pos.set(target.x + (f.state === "fight" ? Math.sin(t * 7) * 0.15 : 0), WATER + bob, target.z + (f.state === "fight" ? Math.cos(t * 5) * 0.15 : 0));
        }
        v.bobber.position.copy(v.pos);
      }

      // The line: from the rod tip to the bobber, sagging when slack, straight under tension.
      v.line.visible = v.bobber.visible;
      if (v.line.visible && rig) {
        const a = rig.tip, b = v.pos;
        const dist = a.distanceTo(b);
        const sag = f.state === "fight" ? (1 - f.tension) * 0.08 * dist : v.flightT < 1 ? 0 : 0.12 * dist;
        const pos = v.line.geometry.getAttribute("position") as BufferAttribute;
        for (let i = 0; i <= SEGMENTS; i++) {
          const k = i / SEGMENTS;
          pos.setXYZ(i, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - sag * 4 * k * (1 - k), a.z + (b.z - a.z) * k);
        }
        pos.needsUpdate = true;
      }

      // The catch, held up for everyone to see.
      v.fish.visible = f.state === "landed" && !!rig;
      if (v.fish.visible && rig) {
        const len = fishLength(f.weight);
        v.fish.position.set(rig.hand.x + Math.sin(rig.yaw) * 0.35, rig.hand.y + 0.1, rig.hand.z + Math.cos(rig.yaw) * 0.35);
        v.fish.rotation.set(0, rig.yaw + Math.PI / 2 + Math.sin(t * 14) * 0.25, Math.sin(t * 9) * 0.15);
        v.fish.scale.set(len * 0.55, len, len);
        for (const c of v.fish.children) c.visible = c.name === f.species;
      }

      // Splash ring, fading out.
      if (v.ringT < 1) {
        v.ringT = Math.min(1, v.ringT + dt / 0.8);
        v.ring.scale.setScalar(0.6 + v.ringT * 2.2);
        (v.ring.material as MeshBasicMaterial).opacity = 0.7 * (1 - v.ringT);
      }
      v.ring.visible = v.ringT < 1;
    }
  });

  return <primitive object={root} />;
}

function splash(v: View, at: Vector3, sound: "plop" | "splash", volume: number) {
  v.ring.position.set(at.x, WATER + 0.01, at.z);
  v.ringT = 0;
  void playAt(sound, at.x, at.y, at.z, volume, 6);
}

useGLTF.preload(FISH_URL);
