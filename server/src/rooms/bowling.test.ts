import { APPROACH_WORLD_Y, LANES, joinSpot } from "@den/shared";
import { describe, expect, it } from "vitest";
import { Bowling, IDLE_KICK_S, RESET_S } from "./bowling.ts";
import { Lane, Player } from "./PartyState.ts";

// The server's bowling rules: joining, turns, checking results, scoring, game over.

function party(...names: string[]) {
  const lanes = new Map<string, Lane>(LANES.map((l) => [l.id, new Lane()]));
  const players = new Map<string, Player>();
  const spot = joinSpot(LANES[0]!);
  for (const n of names) {
    const p = new Player();
    p.name = n;
    Object.assign(p, { x: spot.x, y: APPROACH_WORLD_Y, z: spot.z });
    players.set(n, p);
  }
  return { lanes, players, b: new Bowling(), lane: lanes.get("1")! };
}

const ALL = 0x3ff;
/** A mask of n pins (the first n). */
const pins = (n: number) => (1 << n) - 1;

describe("bowling on the server", () => {
  it("joins at the ball return only, up to 4, not mid-game", () => {
    const { lanes, players, b, lane } = party("a", "b", "c", "d", "e", "far");
    players.get("far")!.x += 30;
    expect(b.join(lanes, "1", "far", players.get("far")!, 0)).toBe(false);
    for (const n of ["a", "b", "c", "d"]) expect(b.join(lanes, "1", n, players.get(n)!, 0)).toBe(true);
    expect(b.join(lanes, "1", "e", players.get("e")!, 0)).toBe(false); // full
    expect(lane.bowlers.map((x) => x.name)).toEqual(["a", "b", "c", "d"]);
    expect(lane.phase).toBe("aim");
    b.leave(lanes, "d", 0);
    b.rolling(lanes, "1", "a", 0);
    b.result(lanes, "1", "a", pins(3), 2000);
    expect(b.join(lanes, "1", "e", players.get("e")!, 2000)).toBe(false); // a game is under way
  });

  it("only the bowler whose turn it is can report, only standing pins count, and not too fast", () => {
    const { lanes, players, b, lane } = party("a", "b");
    b.join(lanes, "1", "a", players.get("a")!, 0);
    b.join(lanes, "1", "b", players.get("b")!, 0);
    b.rolling(lanes, "1", "b", 0); // not b's turn
    expect(lane.phase).toBe("aim");
    b.rolling(lanes, "1", "a", 0);
    b.result(lanes, "1", "a", pins(10), 500); // too soon after rolling
    expect(lane.bowlers[0]!.rolls).toBe("");
    b.result(lanes, "1", "a", pins(7), 2000);
    expect(lane.bowlers[0]!.rolls).toBe("7");
    expect(lane.standing).toBe(ALL & ~pins(7));
    expect(lane.phase).toBe("reset");
    // Second ball: knocking "all ten" only counts the 3 still standing.
    b.tick(lanes, players, 2000 + RESET_S * 1000);
    expect(lane.phase).toBe("aim");
    expect(lane.turn).toBe(0);
    b.rolling(lanes, "1", "a", 6000);
    b.result(lanes, "1", "a", ALL, 8000);
    expect(lane.bowlers[0]!.rolls).toBe("7,3");
    // Frame over: b's turn, fresh rack.
    b.tick(lanes, players, 8000 + RESET_S * 1000);
    expect(lane.turn).toBe(1);
    expect(lane.standing).toBe(ALL);
  });

  it("plays a whole game: a perfect 300 for one, then game over with the scores", () => {
    const { lanes, players, b, lane } = party("solo");
    b.join(lanes, "1", "solo", players.get("solo")!, 0);
    let now = 0, results: { name: string; score: number }[] = [];
    for (let ball = 0; ball < 12; ball++) {
      b.rolling(lanes, "1", "solo", now);
      now += 2000;
      b.result(lanes, "1", "solo", ALL, now);
      now += RESET_S * 1000;
      results = results.concat(b.tick(lanes, players, now));
    }
    expect(lane.bowlers[0]!.rolls).toBe("10,10,10,10,10,10,10,10,10,10,10,10");
    expect(lane.phase).toBe("over");
    expect(results).toEqual([{ id: "solo", name: "solo", lane: "1", score: 300 }]);
    // Another ball isn't accepted; a new game is.
    b.rolling(lanes, "1", "solo", now);
    expect(lane.phase).toBe("over");
    b.newGame(lanes, "1", "solo", now);
    expect(lane.phase).toBe("aim");
    expect(lane.bowlers[0]!.rolls).toBe("");
  });

  it("passes the turn on when the bowler up leaves, and frees an empty lane", () => {
    const { lanes, players, b, lane } = party("a", "b");
    b.join(lanes, "1", "a", players.get("a")!, 0);
    b.join(lanes, "1", "b", players.get("b")!, 0);
    b.rolling(lanes, "1", "a", 0);
    b.result(lanes, "1", "a", pins(4), 2000);
    b.leave(lanes, "a", 2500);
    expect(lane.bowlers.map((x) => x.name)).toEqual(["b"]);
    expect(lane.turn).toBe(0);
    expect(lane.phase).toBe("aim");
    expect(lane.standing).toBe(ALL);
    b.leave(lanes, "b", 3000);
    expect(lane.phase).toBe("idle");
  });

  it("takes bowlers who walk off (or sit idle at the line too long) off the lane", () => {
    const { lanes, players, b, lane } = party("a", "b");
    b.join(lanes, "1", "a", players.get("a")!, 0);
    b.join(lanes, "1", "b", players.get("b")!, 0);
    players.get("b")!.x += 40;
    b.tick(lanes, players, 1000);
    expect(lane.bowlers.map((x) => x.name)).toEqual(["a"]);
    b.tick(lanes, players, IDLE_KICK_S * 1000 + 10);
    expect(lane.bowlers).toHaveLength(0);
    expect(lane.phase).toBe("idle");
  });

  it("a lost ball counts as a miss so the game can go on", () => {
    const { lanes, players, b, lane } = party("a");
    b.join(lanes, "1", "a", players.get("a")!, 0);
    b.rolling(lanes, "1", "a", 0);
    b.tick(lanes, players, 30_000);
    expect(lane.bowlers[0]!.rolls).toBe("0");
  });
});

describe("dev shortcut", () => {
  it("sets a valid unfinished game for a bowler on the lane, and refuses anything else", () => {
    const { lanes, players, b, lane } = party("a");
    b.join(lanes, "1", "a", players.get("a")!, 0);
    b.devSetRolls(lanes, "1", "a", Array(18).fill(0), 0);
    expect(lane.bowlers[0]!.rolls).toBe(Array(18).fill(0).join(","));
    expect(lane.standing).toBe(0x3ff);
    b.devSetRolls(lanes, "1", "a", [7], 0);
    expect(lane.standing).toBe(0b111); // 3 pins left
    b.devSetRolls(lanes, "1", "a", [7, 7], 0); // impossible
    expect(lane.bowlers[0]!.rolls).toBe("7");
    b.devSetRolls(lanes, "1", "a", Array(12).fill(10), 0); // finished game
    expect(lane.bowlers[0]!.rolls).toBe("7");
  });
});
