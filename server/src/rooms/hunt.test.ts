import { GUN, GUN_LOCKER, HIDE_SPOTS, HUNT_CIRCLE, type HuntResult, parseShot } from "@den/shared";
import { describe, expect, it } from "vitest";
import { Hunt } from "./hunt.ts";
import { Hunt as HuntState, Player } from "./PartyState.ts";

const T0 = 1_000_000;

/** Bears standing in the circle. `pick` = the random number (picks the bear, then the spot). */
function circle(names = ["Ann", "Bob", "Cal"], pick = 0) {
  const state = new HuntState();
  const hunt = new Hunt(() => pick);
  hunt.setup(state);
  const players = new Map<string, Player>();
  names.forEach((name, i) => {
    const p = new Player();
    p.name = name;
    Object.assign(p, { x: HUNT_CIRCLE.x + (i - 1) * 0.8, y: 0, z: HUNT_CIRCLE.z });
    players.set(`s${i}`, p);
  });
  return { state, hunt, players };
}

/** Everyone in the circle readies up and the countdown runs out. */
function live(names?: string[], pick = 0) {
  const x = circle(names, pick);
  x.players.forEach((p, id) => x.hunt.ready(x.state, id, p, true));
  x.hunt.tick(x.state, x.players, T0);
  expect(x.state.phase).toBe("countdown");
  const e = x.hunt.tick(x.state, x.players, T0 + 5000);
  expect(x.state.phase).toBe("live");
  const bearId = x.state.bearId;
  const hunterId = [...x.players.keys()].find((id) => id !== bearId)!;
  return { ...x, e, bearId, hunterId, bear: x.players.get(bearId)!, hunter: x.players.get(hunterId)! };
}

/** A shot from the hunter straight at the bear (put 20 m in front of it). */
function aimAt(x: ReturnType<typeof live>, gun = "sniper", dist = 20) {
  Object.assign(x.bear, { x: x.hunter.x, y: x.hunter.y, z: x.hunter.z + dist, speed: 0 });
  return parseShot({ gun, from: { x: x.hunter.x, y: x.hunter.y + 1.7, z: x.hunter.z - 3 }, dir: { x: 0, y: 0, z: 1 }, hit: { x: x.bear.x, y: x.bear.y + 1.7, z: x.bear.z - 0.4 } })!;
}

describe("bear hunt: getting started", () => {
  it("starts 5 s after everyone in the circle is ready (2+), and not before", () => {
    const x = circle(["Ann", "Bob"]);
    x.hunt.ready(x.state, "s0", x.players.get("s0")!, true);
    x.hunt.tick(x.state, x.players, T0);
    expect(x.state.phase).toBe("idle"); // Bob isn't ready
    x.hunt.ready(x.state, "s1", x.players.get("s1")!, true);
    x.hunt.tick(x.state, x.players, T0);
    expect(x.state.phase).toBe("countdown");
    x.hunt.tick(x.state, x.players, T0 + 4900);
    expect(x.state.phase).toBe("countdown");
    x.hunt.tick(x.state, x.players, T0 + 5000);
    expect(x.state.phase).toBe("live");
  });

  it("needs two bears, and stepping out of the circle unreadies you and stops the countdown", () => {
    const x = circle(["Ann"]);
    x.hunt.ready(x.state, "s0", x.players.get("s0")!, true);
    x.hunt.tick(x.state, x.players, T0);
    expect(x.state.phase).toBe("idle");

    const y = circle(["Ann", "Bob"]);
    y.players.forEach((p, id) => y.hunt.ready(y.state, id, p, true));
    y.hunt.tick(y.state, y.players, T0);
    expect(y.state.phase).toBe("countdown");
    y.players.get("s1")!.x += 10;
    y.hunt.tick(y.state, y.players, T0 + 1000);
    expect(y.state.phase).toBe("idle");
    expect(y.state.ready.has("s1")).toBe(false);
  });

  it("you can't ready up from outside the circle", () => {
    const x = circle(["Ann"]);
    const p = x.players.get("s0")!;
    p.x += 10;
    x.hunt.ready(x.state, "s0", p, true);
    expect(x.state.ready.size).toBe(0);
  });

  it("makes one random bear (moved to a hiding spot, told only to it) and hunters with the scoped sniper", () => {
    const x = live(["Ann", "Bob", "Cal"], 0.5);
    expect(x.bearId).toBe("s1");
    expect(x.bear.role).toBe("bear");
    expect(x.e.warp?.id).toBe("s1");
    const spot = x.e.warp!.spot;
    expect(x.bear.x).toBeCloseTo(spot.x);
    expect(x.bear.z).toBeCloseTo(spot.z);
    for (const id of ["s0", "s2"]) {
      const h = x.players.get(id)!;
      expect(h.role).toBe("hunter");
      expect(h.gun).toBe("sniper");
      expect(h.scoped).toBe("sniper");
      expect(h.ammo).toBe(1);
    }
    expect(x.bear.guns).toBe("");
    expect(x.state.bearHealth).toBe(100);
    expect(x.state.ready.size).toBe(0);
  });

  it("ignores the bear's old position until its browser has made the move", () => {
    const x = live(["Ann", "Bob"]);
    expect(x.hunt.holdPose(x.bearId, x.bear, { x: HUNT_CIRCLE.x, z: HUNT_CIRCLE.z }, T0 + 5100)).toBe(true);
    expect(x.hunt.holdPose(x.bearId, x.bear, { x: x.bear.x + 1, z: x.bear.z }, T0 + 5200)).toBe(false);
    expect(x.hunt.holdPose(x.bearId, x.bear, { x: HUNT_CIRCLE.x, z: HUNT_CIRCLE.z }, T0 + 5300)).toBe(false); // done
  });

  it("never drops the bear at the same spot twice running", () => {
    const x = circle(["Ann", "Bob"], 0);
    const spots: string[] = [];
    let now = T0;
    for (let round = 0; round < 3; round++) {
      x.players.forEach((p, id) => {
        Object.assign(p, { x: HUNT_CIRCLE.x, z: HUNT_CIRCLE.z });
        x.hunt.ready(x.state, id, p, true);
      });
      x.hunt.tick(x.state, x.players, now);
      const e = x.hunt.tick(x.state, x.players, (now += 5000));
      spots.push(e.warp!.spot.name);
      x.hunt.devSkip(x.state, 601);
      x.hunt.tick(x.state, x.players, (now += 10));
      x.hunt.tick(x.state, x.players, (now += 13_000));
      expect(x.state.phase).toBe("idle");
    }
    expect(spots[0]).not.toBe(spots[1]);
    expect(spots[1]).not.toBe(spots[2]);
    expect(HIDE_SPOTS.map((s) => s.name)).toContain(spots[0]);
  });
});

describe("bear hunt: shooting", () => {
  it("the sniper takes the bear down in one hit and ends the hunt", () => {
    const x = live();
    const r = x.hunt.fire(x.state, x.hunterId, x.hunter, aimAt(x), x.players, T0 + 70_000);
    expect(r?.event.hit).toBe(true);
    expect(x.state.bearHealth).toBe(0);
    expect(r?.over?.how).toBe("shot");
    expect(r?.over?.byId).toBe(x.hunterId);
    expect(r?.over?.points).toBe(1); // lasted 1:05
    expect(x.state.phase).toBe("over");
    expect(x.hunter.role).toBe("");
    expect(x.hunter.guns).toBe("");
    const shown = JSON.parse(x.state.result) as HuntResult;
    expect(shown.byName).toBe(x.hunter.name);
  });

  it("one round per reload for the sniper; reloading takes 2.5 s", () => {
    const x = live();
    const miss = { ...aimAt(x), hit: undefined };
    expect(x.hunt.fire(x.state, x.hunterId, x.hunter, miss, x.players, T0 + 6000)?.event.hit).toBe(false);
    expect(x.hunter.ammo).toBe(0);
    expect(x.hunt.fire(x.state, x.hunterId, x.hunter, miss, x.players, T0 + 9000)).toBeNull(); // empty
    x.hunt.reload(x.state, x.hunterId, x.hunter, T0 + 9000);
    x.hunt.tick(x.state, x.players, T0 + 11_000);
    expect(x.hunter.ammo).toBe(0);
    x.hunt.tick(x.state, x.players, T0 + 11_600);
    expect(x.hunter.ammo).toBe(1);
  });

  it("pistol 3 hits, AR 2 (from the locker), and the fire rate holds", () => {
    const x = live(["Ann", "Bob"]);
    Object.assign(x.hunter, { x: GUN_LOCKER.x, y: GUN_LOCKER.y, z: GUN_LOCKER.z + 1 });
    x.hunt.locker(x.state, x.hunterId, x.hunter, { do: "take", gun: "pistol" });
    expect(x.hunter.gun).toBe("pistol");
    expect(x.hunter.guns).toBe("sniper,pistol");
    expect(x.hunter.ammo).toBe(12);
    let t = T0 + 6000;
    expect(x.hunt.fire(x.state, x.hunterId, x.hunter, aimAt(x, "pistol"), x.players, t)?.event.hit).toBe(true);
    expect(x.state.bearHealth).toBe(66);
    expect(x.hunt.fire(x.state, x.hunterId, x.hunter, aimAt(x, "pistol"), x.players, t + 50)).toBeNull(); // too fast
    x.hunt.fire(x.state, x.hunterId, x.hunter, aimAt(x, "pistol"), x.players, (t += 300));
    expect(x.state.bearHealth).toBe(32);
    x.hunt.locker(x.state, x.hunterId, x.hunter, { do: "take", gun: "ar" });
    x.hunt.fire(x.state, x.hunterId, x.hunter, aimAt(x, "ar"), x.players, (t += 300));
    expect(x.state.phase).toBe("over");
  });

  it("refuses the wrong gun, a gun you don't carry, the locker from afar, and shots while knocked down", () => {
    const x = live(["Ann", "Bob"]);
    expect(x.hunt.fire(x.state, x.hunterId, x.hunter, aimAt(x, "ar"), x.players, T0 + 6000)).toBeNull();
    x.hunt.locker(x.state, x.hunterId, x.hunter, { do: "take", gun: "ar" });
    expect(x.hunter.guns).toBe("sniper"); // not at the locker
    x.hunt.select(x.state, x.hunterId, x.hunter, "shotgun");
    expect(x.hunter.gun).toBe("sniper");
    x.hunter.downUntil = T0 + 9000;
    expect(x.hunt.fire(x.state, x.hunterId, x.hunter, aimAt(x), x.players, T0 + 7000)).toBeNull();
    expect(x.hunt.fire(x.state, x.bearId, x.bear, aimAt(x), x.players, T0 + 9500)).toBeNull(); // the bear has no gun
  });

  it("a hit that isn't where the bear is counts as a miss", () => {
    const x = live(["Ann", "Bob"]);
    const shot = aimAt(x);
    x.bear.x += 8;
    const r = x.hunt.fire(x.state, x.hunterId, x.hunter, shot, x.players, T0 + 6000);
    expect(r?.event.hit).toBe(false);
    expect(x.state.bearHealth).toBe(100);
  });

  it("the scope goes on and off at the locker, and guns go back", () => {
    const x = live(["Ann", "Bob"]);
    Object.assign(x.hunter, { x: GUN_LOCKER.x, y: GUN_LOCKER.y, z: GUN_LOCKER.z + 1 });
    x.hunt.locker(x.state, x.hunterId, x.hunter, { do: "scope", gun: "sniper", on: false });
    expect(x.hunter.scoped).toBe("");
    x.hunt.locker(x.state, x.hunterId, x.hunter, { do: "take", gun: "shotgun" });
    x.hunt.locker(x.state, x.hunterId, x.hunter, { do: "scope", gun: "shotgun", on: true });
    expect(x.hunter.scoped).toBe("shotgun");
    x.hunt.locker(x.state, x.hunterId, x.hunter, { do: "return", gun: "shotgun" });
    expect(x.hunter.guns).toBe("sniper");
    expect(x.hunter.gun).toBe("sniper");
    expect(x.hunter.scoped).toBe("");
  });
});

describe("bear hunt: the clock, the swipe, leaving", () => {
  it("the bear wins 512 points at ten minutes", () => {
    const x = live();
    const e = x.hunt.tick(x.state, x.players, T0 + 5000 + 600_000);
    expect(e.over?.how).toBe("survived");
    expect(e.over?.points).toBe(512);
    expect(e.over?.players.length).toBe(3);
  });

  it("banks points for full minutes when shot: 3:00 = 4", () => {
    const x = live(["Ann", "Bob"]);
    const r = x.hunt.fire(x.state, x.hunterId, x.hunter, aimAt(x), x.players, T0 + 5000 + 180_500);
    expect(r?.over?.points).toBe(4);
  });

  it("the swipe knocks down hunters in reach in front, then has to cool down", () => {
    const x = live(["Ann", "Bob"]);
    Object.assign(x.bear, { x: 0, y: 0, z: 0, yaw: 0 });
    Object.assign(x.hunter, { x: 0, y: 0, z: 1.8 });
    expect(x.hunt.swipe(x.state, x.bearId, x.bear, x.players, T0 + 6000)).toEqual([x.hunterId]);
    expect(x.hunter.downUntil).toBe(T0 + 9000);
    expect(x.hunt.holdPose(x.hunterId, x.hunter, { x: 5, z: 5 }, T0 + 7000)).toBe(true);
    expect(x.hunt.swipe(x.state, x.bearId, x.bear, x.players, T0 + 9500)).toEqual([]); // cooling down
    expect(x.hunt.swipe(x.state, x.hunterId, x.hunter, x.players, T0 + 20_000)).toEqual([]); // hunters can't swipe
    x.hunter.bike = "riding";
    expect(x.hunt.swipe(x.state, x.bearId, x.bear, x.players, T0 + 30_000)).toEqual([]); // nor knock one off a bike
  });

  it("ends when the bear leaves (it keeps its points) or the last hunter leaves", () => {
    const x = live(["Ann", "Bob"]);
    const r = x.hunt.leave(x.state, x.bearId, x.players, T0 + 5000 + 125_000);
    expect(r?.how).toBe("bearLeft");
    expect(r?.points).toBe(2);

    const y = live(["Ann", "Bob", "Cal"]);
    const hunters = [...y.players.keys()].filter((id) => id !== y.bearId);
    expect(y.hunt.leave(y.state, hunters[0]!, y.players, T0 + 9000)).toBeNull();
    expect(y.hunt.leave(y.state, hunters[1]!, y.players, T0 + 9000)?.how).toBe("huntersLeft");
  });

  it("opens the circle again once the results have been up", () => {
    const x = live(["Ann", "Bob"]);
    x.hunt.tick(x.state, x.players, T0 + 5000 + 600_000);
    expect(x.state.phase).toBe("over");
    x.hunt.tick(x.state, x.players, T0 + 5000 + 600_000 + 12_000);
    expect(x.state.phase).toBe("idle");
    expect(x.state.result).toBe("");
  });
});
