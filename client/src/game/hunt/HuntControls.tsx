import { GUN, GUNS, type GunId, type ShotClaim, inHuntCircle, nearLocker } from "@den/shared";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useEffect } from "react";
import { Vector3 } from "three";
import { create } from "zustand";
import { huntSend, usePartyStore } from "../../net/party.ts";
import { playAt } from "../audio/audio.ts";
import { consumePress } from "../input/keyboard.ts";
import { colliderOwners } from "../remote/RemoteBears.tsx";
import { cameraState, playerState } from "../state.ts";
import { invisibleColliders } from "../world/invisible.ts";
import { huntAim } from "./aim.ts";
import { firedShot } from "./events.ts";
import { mapDots } from "../../ui/MiniMap.tsx";
import { myRole, serverNow, useHunt } from "./store.ts";

// Our own bear hunt controls (Andrew, 2026-10-17; GAME_SPEC §16c):
// - in the blue circle by the dock: E readies up (or stands down);
// - a hunter: left mouse fires (hold for the AR), right mouse aims (through the scope if one's
//   fitted), R reloads, 1–4 pick a gun (sniper, pistol, AR, shotgun), E at the basement locker opens it;
// - the bear: left mouse swipes.
// Each shot's ray is cast here from the camera through the crosshair: walls, trees and the ground
// stop it. If it hits the bear we say where; the server checks it and decides the damage.

export const useHuntPrompt = create<{ text: string | null }>(() => ({ text: null }));

const KEYS: Record<string, GunId> = { Digit1: "sniper", Digit2: "pistol", Digit3: "ar", Digit4: "shotgun" };
const v = { o: new Vector3(), d: new Vector3(), r: new Vector3(), u: new Vector3(), end: new Vector3() };

/** Dev and tests: fire one shot from code, optionally straight at a point (returns whether it went off). Set by HuntControls. */
let fireNow: ((at?: Vector3) => boolean) | null = null;
/** Dev and tests: what our last shot's ray hit (whose collider, how far), and why a pull didn't fire. */
let lastRay: { owner: string | null; toi: number | null; claim: ShotClaim | null; refused: string | null } = { owner: null, toi: null, claim: null, refused: null };

export function HuntControls() {
  const camera = useThree((s) => s.camera);
  const { world, rapier } = useRapier();

  useEffect(() => {
    let lastShot = 0;
    const me = () => usePartyStore.getState().sessionId;
    /** One pull of the trigger. */
    const fire = (at?: Vector3): boolean => {
      const h = useHunt.getState();
      const g = h.me.gun;
      const refuse = (why: string) => {
        lastRay.refused = why;
        return false;
      };
      if (myRole(me()) !== "hunter" || !g || playerState.riding || h.lockerOpen) return refuse("not armed");
      const now = serverNow();
      if (now < h.me.downUntil) return refuse("down");
      if (h.me.reloadUntil) return refuse("reloading");
      const gun = GUN[g];
      if (performance.now() - lastShot < gun.interval * 1000) return refuse("too soon");
      if (h.me.ammo <= 0) {
        void playAt("gun-dry", playerState.position.x, playerState.position.y + 1.4, playerState.position.z, 0.8, 3);
        huntSend.reload();
        lastShot = performance.now();
        return false;
      }
      lastShot = performance.now();
      huntAim.firedAt = performance.now();
      const spread = huntAim.scoped ? gun.spread.scope : huntAim.aiming ? gun.spread.aim : gun.spread.hip;
      camera.getWorldPosition(v.o);
      camera.getWorldDirection(v.d);
      if (at) v.d.subVectors(at, v.o).normalize();
      v.r.set(1, 0, 0).applyQuaternion(camera.quaternion);
      v.u.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const bearId = h.bearId;
      let claim: ShotClaim | null = null;
      let tracerEnd: Vector3 | null = null;
      for (let i = 0; i < gun.pellets; i++) {
        // Random spread inside a cone.
        const a = Math.random() * Math.PI * 2, rad = at ? 0 : spread * Math.sqrt(Math.random());
        const dir = v.d.clone().addScaledVector(v.r, Math.cos(a) * rad).addScaledVector(v.u, Math.sin(a) * rad).normalize();
        const hit = world.castRay(new rapier.Ray(v.o, dir), gun.range + 8, true, undefined, undefined, undefined, undefined,
          (c) => c.handle !== playerState.colliderHandle && !invisibleColliders.has(c.handle) && !c.isSensor() && c.isEnabled());
        const end = v.o.clone().addScaledVector(dir, hit ? hit.timeOfImpact : gun.range);
        const onBear = !!hit && colliderOwners.get(hit.collider.handle) === bearId;
        if (i === 0) lastRay = { owner: hit ? (colliderOwners.get(hit.collider.handle) ?? `collider ${hit.collider.handle}`) : null, toi: hit?.timeOfImpact ?? null, claim: null, refused: null };
        if (onBear && (!claim || !claim.hit)) {
          claim = { gun: g, from: { x: v.o.x, y: v.o.y, z: v.o.z }, dir: { x: dir.x, y: dir.y, z: dir.z }, hit: { x: end.x, y: end.y, z: end.z } };
          tracerEnd = end;
        } else if (!claim) {
          claim = { gun: g, from: { x: v.o.x, y: v.o.y, z: v.o.z }, dir: { x: dir.x, y: dir.y, z: dir.z }, end: { x: end.x, y: end.y, z: end.z } };
          tracerEnd = end;
        }
      }
      huntSend.fire(claim!);
      lastRay.claim = claim;
      // Bang, flash and tracer right away (from the gun's muzzle).
      const muzzle = playerState.muzzle;
      firedShot({ id: me(), gun: g, from: { x: muzzle.x, y: muzzle.y, z: muzzle.z }, to: { x: tracerEnd!.x, y: tracerEnd!.y, z: tracerEnd!.z }, hit: false, at: performance.now(), mine: true });
      return true;
    };
    fireNow = fire;

    let holding = false;
    const down = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      const role = myRole(me());
      if (e.button === 2 && role === "hunter") huntAim.aiming = true;
      if (e.button !== 0) return;
      if (role === "bear") {
        huntAim.swipeRequest = true;
        huntSend.swipe();
      } else if (role === "hunter") {
        holding = true;
        fire();
      }
    };
    const up = (e: MouseEvent) => {
      if (e.button === 2) huntAim.aiming = false;
      if (e.button === 0) holding = false;
    };
    const noMenu = (e: MouseEvent) => {
      if (myRole(me()) !== "") e.preventDefault();
    };
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    window.addEventListener("contextmenu", noMenu);
    // The AR keeps firing while the button is held.
    const auto = setInterval(() => {
      const g = useHunt.getState().me.gun;
      if (holding && g && GUN[g].auto && document.pointerLockElement) fire();
      if (!document.pointerLockElement) holding = false;
    }, 25);
    return () => {
      fireNow = null;
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("contextmenu", noMenu);
      clearInterval(auto);
      huntAim.aiming = huntAim.scoped = false;
      cameraState.aim = 0;
    };
  }, [camera, world, rapier]);

  useFrame(() => {
    const me = usePartyStore.getState().sessionId;
    const h = useHunt.getState();
    const role = myRole(me);
    const p = playerState.position;
    const setPrompt = (text: string | null) => {
      if (useHuntPrompt.getState().text !== text) useHuntPrompt.setState({ text });
    };

    // Not a hunter (any more): put the gun down and close the locker.
    if (role !== "hunter") {
      huntAim.aiming = huntAim.scoped = false;
      if (cameraState.aim) cameraState.aim = 0;
      if (h.lockerOpen) closeLocker();
    }

    // The circle by the dock: ready up between hunts.
    if (h.phase !== "live" && inHuntCircle(p.x, p.z)) {
      const ready = h.ready.includes(me);
      setPrompt(ready ? "Not ready" : "Ready for bear hunt");
      if (consumePress("KeyE")) huntSend.ready(!ready);
      return;
    }
    if (role !== "hunter") return setPrompt(null);

    // A hunter: the locker, guns, reloading, aiming.
    const atLocker = nearLocker(p.x, p.y, p.z);
    if (h.lockerOpen && (!atLocker || consumePress("KeyE") || consumePress("Escape"))) closeLocker();
    else if (atLocker && !h.lockerOpen) {
      setPrompt("Open the gun locker");
      if (consumePress("KeyE")) openLocker();
    } else setPrompt(h.lockerOpen ? "Close the locker" : null);

    for (const [key, gun] of Object.entries(KEYS)) {
      if (consumePress(key) && h.me.guns.includes(gun) && h.me.gun !== gun) {
        huntSend.gun(gun);
        void playAt("gun-reload", p.x, p.y + 1.4, p.z, 0.4, 3);
      }
    }
    if (consumePress("KeyR") && h.me.gun && !h.me.reloadUntil && h.me.ammo < GUN[h.me.gun].mag) {
      huntSend.reload();
      void playAt("gun-reload", p.x, p.y + 1.4, p.z, 0.9, 4);
    }
    const g = h.me.gun;
    huntAim.scoped = huntAim.aiming && !!g && h.me.scoped.includes(g) && !playerState.riding && serverNow() >= h.me.downUntil;
    cameraState.aim = !g || playerState.riding ? 0 : huntAim.scoped ? 2 : huntAim.aiming ? 1 : 0;
    cameraState.zoom = g ? GUN[g].zoom : 1;
  });

  // Dev and tests: shoot, read the hunt, skip its clock.
  useEffect(() => {
    const den = window.__den as unknown as Record<string, unknown> | undefined;
    if (!den) return;
    den.hunt = {
      state: () => ({ ...useHunt.getState(), me: { ...useHunt.getState().me }, role: myRole(usePartyStore.getState().sessionId) }),
      ready: (on = true) => huntSend.ready(on),
      fire: () => fireNow?.() ?? false,
      fireAt: (x: number, y: number, z: number) => fireNow?.(new Vector3(x, y, z)) ?? false,
      spot: (name: string) => huntSend.devSpot(name),
      lastRay: () => lastRay,
      dots: () => mapDots(myRole(usePartyStore.getState().sessionId)),
      aim: (on: boolean) => {
        huntAim.aiming = on;
      },
      locker: (what: "take" | "return" | "scope", gun: GunId, on?: boolean) => huntSend.locker(what, gun, on),
      gun: (gun: GunId) => huntSend.gun(gun),
      reload: () => huntSend.reload(),
      swipe: () => {
        huntAim.swipeRequest = true;
        huntSend.swipe();
      },
      skip: (s: number) => huntSend.devSkip(s),
      guns: GUNS,
    };
  }, []);

  return null;
}

function openLocker() {
  useHunt.setState({ lockerOpen: true });
  cameraState.freeMouse = true;
  if (document.pointerLockElement) document.exitPointerLock();
}

export function closeLocker() {
  useHunt.setState({ lockerOpen: false });
  cameraState.freeMouse = false;
}
