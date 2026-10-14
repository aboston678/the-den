import { describe, expect, it } from "vitest";
import { END_VOTE_S, endVotesNeeded, expireEndVote, removePlayer } from "./game.ts";
import { parseAction, type RuleContext } from "./rules.ts";
import { act, clearHands, dice, give, quickSetup, refused, start } from "./testkit.ts";
import { publicView } from "./view.ts";

// Leaving and the vote to end a game early (Andrew, GAME_SPEC §16): more than half of the players
// still in must say yes; the game then ends with no winner.

const at = (now: number): RuleContext => ({ ...dice(), now });

describe("catan vote to end the game", () => {
  it("needs more than half of the players still in", () => {
    expect(endVotesNeeded(start(2))).toBe(2);
    expect(endVotesNeeded(start(3))).toBe(2);
    expect(endVotesNeeded(start(4))).toBe(3);
    expect(endVotesNeeded(removePlayer(start(4), 3))).toBe(2);
  });

  it("3 players: the caller plus one yes ends it with no winner, on anyone's turn", () => {
    const g = quickSetup(start(3));
    let s = act(g, 2, { type: "proposeEnd" }, at(1000));
    expect(s.endVote).toEqual({ by: 2, votes: [null, null, true], until: 1000 + END_VOTE_S * 1000 });
    expect(s.phase).toBe("roll");
    s = act(s, 1, { type: "voteEnd", yes: true });
    expect(s.phase).toBe("over");
    expect(s.winner).toBeNull();
    expect(s.endVote).toBeNull();
    expect(s.log.at(-1)).toBe("The table voted to end the game");
    expect(refused(s, 0, { type: "roll" })).toMatch(/over/);
  });

  it("2 players: both have to agree; a no clears the vote and play goes on", () => {
    const g = quickSetup(start(2));
    let s = act(g, 0, { type: "proposeEnd" });
    expect(s.phase).not.toBe("over");
    s = act(s, 1, { type: "voteEnd", yes: false });
    expect(s.endVote).toBeNull();
    expect(s.phase).toBe("roll");
    expect(s.log.at(-1)).toMatch(/didn't pass/);
    s = act(act(s, 1, { type: "proposeEnd" }), 0, { type: "voteEnd", yes: true });
    expect(s.phase).toBe("over");
  });

  it("4 players: a 2–2 tie doesn't pass; it stops as soon as it can't reach 3", () => {
    const g = quickSetup(start(4));
    let s = act(g, 0, { type: "proposeEnd" });
    s = act(s, 1, { type: "voteEnd", yes: true });
    expect(s.endVote).not.toBeNull();
    s = act(s, 2, { type: "voteEnd", yes: false });
    expect(s.endVote).not.toBeNull(); // 2 yes, 1 open: could still reach 3
    s = act(s, 3, { type: "voteEnd", yes: false });
    expect(s.endVote).toBeNull();
    expect(s.phase).not.toBe("over");
  });

  it("one vote at a time, one answer each, and only while there's a vote", () => {
    const g = quickSetup(start(4));
    expect(refused(g, 1, { type: "voteEnd", yes: true })).toMatch(/no vote/);
    const s = act(g, 0, { type: "proposeEnd" });
    expect(refused(s, 1, { type: "proposeEnd" })).toMatch(/already a vote/);
    expect(refused(s, 0, { type: "voteEnd", yes: false })).toMatch(/already voted/);
    const t = act(s, 1, { type: "voteEnd", yes: false });
    expect(refused(t, 1, { type: "voteEnd", yes: true })).toMatch(/already voted/);
  });

  it("works mid-turn and during a 7's discards", () => {
    const g = quickSetup(start(3));
    clearHands(g);
    give(g, 2, { ore: 8 });
    let s = act(g, 0, { type: "roll" }, dice([[3, 4]]));
    expect(s.phase).toBe("discard");
    s = act(act(s, 2, { type: "proposeEnd" }), 0, { type: "voteEnd", yes: true });
    expect(s.phase).toBe("over");
  });

  it("lapses after 30 s", () => {
    const g = quickSetup(start(3));
    const s = act(g, 0, { type: "proposeEnd" }, at(5000));
    expect(expireEndVote(s, 5000 + END_VOTE_S * 1000 - 1)).toBe(s);
    const t = expireEndVote(s, 5000 + END_VOTE_S * 1000);
    expect(t.endVote).toBeNull();
    expect(t.phase).toBe("roll");
    expect(t.log.at(-1)).toMatch(/ran out of time/);
    expect(s.endVote).not.toBeNull(); // the old game isn't changed
  });

  it("someone leaving recounts the vote", () => {
    // 4 players, 2 yes: one of the others leaves → 3 left, 2 is now enough.
    let g = quickSetup(start(4));
    g = act(act(g, 0, { type: "proposeEnd" }), 1, { type: "voteEnd", yes: true });
    expect(g.phase).not.toBe("over");
    const s = removePlayer(g, 3);
    expect(s.phase).toBe("over");
    expect(s.winner).toBeNull();
    // A yes voter leaving doesn't count any more.
    let h = quickSetup(start(4));
    h = act(act(h, 0, { type: "proposeEnd" }), 1, { type: "voteEnd", yes: true });
    const t = removePlayer(h, 1);
    expect(t.endVote?.votes[1]).toBe(true);
    expect(t.phase).not.toBe("over");
    expect(act(t, 2, { type: "voteEnd", yes: true }).phase).toBe("over");
  });

  it("everyone sees the vote; moves from a browser are checked", () => {
    const s = act(quickSetup(start(3)), 1, { type: "proposeEnd" });
    expect(publicView(s).endVote?.by).toBe(1);
    expect(parseAction({ type: "proposeEnd" })).toEqual({ type: "proposeEnd" });
    expect(parseAction({ type: "voteEnd", yes: false })).toEqual({ type: "voteEnd", yes: false });
    expect(parseAction({ type: "voteEnd", yes: "yes" })).toBeNull();
    expect(parseAction({ type: "voteEnd" })).toBeNull();
  });
});

describe("catan leaving mid-game", () => {
  it("the roller leaving during discards clears everyone's discards", () => {
    const g = quickSetup(start(3));
    clearHands(g);
    give(g, 2, { ore: 8 });
    const s = act(g, 0, { type: "roll" }, dice([[3, 4]]));
    expect(s.discards[2]).toBe(4);
    const t = removePlayer(s, 0);
    expect(t.phase).toBe("roll");
    expect(t.turn).toBe(1);
    expect(t.discards).toEqual([0, 0, 0]);
  });
});
