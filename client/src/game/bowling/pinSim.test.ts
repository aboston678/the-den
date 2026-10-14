import { type BallState, LANE, reachedPins, stepBall, throwBall } from "@den/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { PinDeck, rapierReady } from "./pinSim.ts";

// Tuning the pin crash (GAME_SPEC §15): a ball in the pocket should usually strike, a dead-centre
// "nose" hit should often leave pins (splits), a light brush should leave most standing. Seeded,
// so the numbers are the same every run.

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Roll a ball from the lane model into the pins; how many fall. */
function bowl(ball: BallState, seed: number) {
  while (!reachedPins(ball)) stepBall(ball, 1 / 240);
  if (ball.gutter) return 0;
  const deck = new PinDeck(seeded(seed));
  deck.rack(null);
  deck.launch(ball);
  while (!deck.settled()) deck.step(1 / 60);
  const down = deck.standing().filter((s) => !s).length;
  deck.dispose();
  return down;
}

/** A ball that arrives at the head pin at lane z (no curve: straight down the boards). */
const straightAt = (z: number, power = 0.6) => throwBall({ z, aim: 0, power, curve: 0 }, () => 0.5);

const POCKET_Z = 0.065; // between the head pin and the 3 pin, the right-hander's pocket

describe("pin physics", () => {
  beforeAll(() => rapierReady());

  it("all ten stand still on their own", () => {
    const deck = new PinDeck(seeded(1));
    deck.rack(null);
    for (let i = 0; i < 240; i++) deck.step(1 / 60);
    expect(deck.standing().every(Boolean)).toBe(true);
    deck.dispose();
  });

  it("a hooking ball aimed at the pocket strikes often (with the usual luck)", () => {
    let strikes = 0;
    const runs = 20;
    for (let i = 0; i < runs; i++) {
      // Thrown from the right with a left hook, arriving in the pocket at an angle.
      const ball = throwBall({ z: 0.4, aim: 0.65, power: 0.65, curve: -1 }, seeded(100 + i));
      if (bowl(ball, 200 + i) === 10) strikes++;
    }
    console.log(`pocket hook: ${strikes}/${runs} strikes`);
    expect(strikes / runs).toBeGreaterThanOrEqual(0.3);
  });

  it("straight into the pocket strikes sometimes, straight on the nose rarely", () => {
    let pocket = 0, nose = 0, noseDown = 0;
    const runs = 15;
    for (let i = 0; i < runs; i++) {
      if (bowl(straightAt(POCKET_Z), 300 + i) === 10) pocket++;
      const n = bowl(straightAt(0), 400 + i);
      if (n === 10) nose++;
      noseDown += n;
    }
    console.log(`straight pocket: ${pocket}/${runs} strikes; nose: ${nose}/${runs} strikes, ${(noseDown / runs).toFixed(1)} pins on average`);
    expect(nose).toBeLessThanOrEqual(pocket);
    expect(noseDown / runs).toBeGreaterThan(6);
  });

  it("a ball brushing the edge takes only a few pins", () => {
    const down = bowl(straightAt(LANE.width / 2 - 0.13), 500);
    console.log(`edge brush: ${down} pins`);
    expect(down).toBeGreaterThan(0);
    expect(down).toBeLessThan(6);
  });

  it("a gutter ball scores nothing", () => {
    expect(bowl(throwBall({ z: 0.35, aim: 3, power: 0.5, curve: 0 }, () => 0.5), 600)).toBe(0);
  });
});
