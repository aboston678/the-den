import { expect, type Page, test } from "@playwright/test";
import {
  CATAN_SEATS, CATAN_TABLE, HEX_VERTICES, legalCities, legalRoads, legalSettlements, type CatanView,
} from "../shared/src/index.ts";
import { closePlayers, failOnErrors, hostGame, joinGame, newPlayer, skipIntro, waitForBear } from "./helpers.ts";

// Catan (GAME_SPEC §16, milestones 4.2–4.4): two bears sit down and play through the HUD and by
// clicking the board (setup, a roll that pays, building, a bank trade, a player trade, a 7 with a
// discard and the robber), a third watches, a player reloads mid-game and gets their cards back,
// and a win ends the game.
//   npx playwright test e2e/catan.spec.ts   (screenshots in test-results/catan/)

test.afterEach(closePlayers);

const state = (page: Page) => page.evaluate(() => window.__den!.catan!.state());
const view = async (page: Page) => (await state(page)).view as CatanView;
const hand = async (page: Page) => (await state(page)).mine!.hand;
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/catan/${name}.png` });

async function sitDown(page: Page, seat: number) {
  const s = CATAN_SEATS[seat]!;
  const x = s.x - Math.sin(s.yaw) * 0.75, z = s.z - Math.cos(s.yaw) * 0.75;
  await page.evaluate(([x, z, y]) => window.__den!.teleport(x!, z!, y!), [x, z, s.y] as const);
  await expect.poll(async () => {
    const p = await page.evaluate(() => window.__den!.serverPosition());
    return p ? Math.hypot(p.x - x, p.z - z) : 99;
  }, { timeout: 60_000 }).toBeLessThan(0.6);
  await expect.poll(async () => (await state(page)).prompt, { timeout: 20_000 }).toBe("Sit at the Catan table");
  await page.keyboard.press("e");
  await expect.poll(async () => (await state(page)).seats[seat]).not.toBe("");
}

/** Click a board spot the way a player does (the camera must have settled). */
async function clickSpot(page: Page, kind: "vertex" | "edge" | "hex", id: number) {
  const at = await page.evaluate(([k, i]) => window.__den!.catan!.screenOf(k as "vertex", i as number), [kind, id] as const);
  await page.mouse.click(at.x, at.y);
}

const g = (v: CatanView) => ({ buildings: v.buildings, roads: v.roads }) as never;

test("two bears play Catan; a third watches", async ({ page: ann, browser }) => {
  test.setTimeout(420_000);
  failOnErrors(ann);
  const code = await hostGame(ann, "Ann");
  const bob = await newPlayer(browser);
  await joinGame(bob, code, "Bob");
  await waitForBear(bob);
  const cat = await newPlayer(browser);
  await joinGame(cat, code, "Cat");
  await waitForBear(cat);

  await sitDown(ann, 2);
  await sitDown(bob, 0);
  const seats = (await state(ann)).seats;
  const annId = seats[2]!, bobId = seats[0]!;
  const pageOf = (id: string) => (id === annId ? ann : bob);
  await expect(ann.getByTestId("catan-lobby")).toBeVisible();
  await ann.waitForTimeout(1500);
  await shot(ann, "1-lobby");

  // Start from the HUD.
  await ann.getByTestId("catan-start").click();
  await expect.poll(async () => (await view(ann))?.phase).toBe("setup");
  await expect(bob.getByTestId("catan-status")).toBeVisible();

  // Setup: the first settlement and road by clicking glowing spots; the rest through the same moves.
  for (let step = 0; step < 4; step++) {
    const v = await view(ann);
    const who = pageOf(v.players[v.turn]!.id);
    const spots = legalSettlements(g(v), v.turn, true);
    const vertex = spots[Math.floor(spots.length * [0.2, 0.75, 0.45, 0.6][step]!)]!;
    if (step === 0) {
      await who.waitForTimeout(800);
      await shot(who, "2-setup-picks");
      await clickSpot(who, "vertex", vertex);
    } else await who.evaluate((x) => window.__den!.catan!.act({ type: "placeSettlement", vertex: x }), vertex);
    await expect.poll(async () => (await view(ann)).setupPiece).toBe("road");
    const v2 = await view(ann);
    const edge = legalRoads(g(v2), v2.turn, v2.setupVertex)[0]!;
    if (step === 0) await clickSpot(who, "edge", edge);
    else await who.evaluate((e) => window.__den!.catan!.act({ type: "placeRoad", edge: e }), edge);
    await expect.poll(async () => (await view(ann)).roads.filter((r) => r !== null).length).toBe(step + 1);
  }
  await expect.poll(async () => (await view(ann)).phase).toBe("roll");
  // Pieces clack onto the board for everyone at the table (Phase 5 sound pass).
  const clacks = (p: Page) => p.evaluate(() => Object.entries(window.__den!.audio().played).reduce((n, [k, v]) => n + (k.startsWith("piece-place-") ? v : 0), 0));
  for (const p of [ann, bob]) await expect.poll(() => clacks(p)).toBeGreaterThanOrEqual(8);

  // A roll that pays: pick a number one of the roller's settlements touches.
  let v = await view(ann);
  const roller = pageOf(v.players[v.turn]!.id);
  const other = roller === ann ? bob : ann;
  const rIdx = v.turn, oIdx = 1 - v.turn;
  const myHex = HEX_VERTICES.findIndex((vs, h) => v.board.tiles[h]!.token !== null && h !== v.robber && vs.some((x) => v.buildings[x]?.owner === rIdx));
  const token = v.board.tiles[myHex]!.token!;
  const before = await hand(roller);
  await roller.evaluate((t) => window.__den!.catan!.dev([Math.min(6, t - 1), t - Math.min(6, t - 1)]), token);
  await roller.getByTestId("catan-roll").click();
  await expect.poll(async () => (await view(ann)).phase).toBe("main");
  await expect.poll(async () => Object.values(await hand(roller)).reduce((a, b) => a + b, 0)).toBeGreaterThan(Object.values(before).reduce((a, b) => a + b, 0));
  await roller.waitForTimeout(1300);
  await shot(roller, "3-rolled");

  // Build a road with the HUD: pick Road, click a glowing edge.
  await roller.evaluate(() => window.__den!.catan!.dev(undefined, { brick: 1, lumber: 1 }));
  await expect(roller.getByTestId("catan-build-road")).toBeEnabled();
  await roller.getByTestId("catan-build-road").click();
  v = await view(ann);
  const roadsBefore = v.roads.filter((r) => r === rIdx).length;
  await roller.waitForTimeout(300);
  await clickSpot(roller, "edge", legalRoads(g(v), rIdx)[0]!);
  await expect.poll(async () => (await view(ann)).roads.filter((r) => r === rIdx).length).toBe(roadsBefore + 1);

  // Bank trade: 4 ore for 1 wool.
  await roller.evaluate(() => window.__den!.catan!.dev(undefined, { ore: 4 }));
  await expect.poll(async () => (await hand(roller)).ore).toBeGreaterThanOrEqual(4);
  const preTrade = await hand(roller);
  await roller.getByTestId("catan-trade").click();
  const panel = roller.getByTestId("catan-trade-panel");
  await expect(panel).toBeVisible();
  const ratio = Number(await panel.getByTestId("card-ore").first().locator(".count").textContent());
  await panel.getByTestId("card-ore").first().click();
  await panel.getByTestId("card-wool").nth(1).click();
  await shot(roller, "4-bank-trade");
  await panel.getByTestId("catan-bank-trade").click();
  await expect.poll(async () => (await hand(roller)).wool).toBe(preTrade.wool + 1);
  expect((await hand(roller)).ore).toBe(preTrade.ore - ratio);

  // Player trade: offer 1 grain for 1 brick; the other bear accepts; confirm.
  await roller.evaluate(() => window.__den!.catan!.dev(undefined, { grain: 1 }));
  await other.evaluate(() => window.__den!.catan!.dev(undefined, { brick: 1 }));
  await expect.poll(async () => (await hand(other)).brick).toBeGreaterThan(0);
  const rBefore = await hand(roller), oBefore = await hand(other);
  await panel.getByTestId("plus-grain").first().click();
  await panel.getByTestId("plus-brick").nth(1).click();
  await panel.getByTestId("catan-send-offer").click();
  await expect(other.getByTestId("catan-offer")).toBeVisible();
  await shot(other, "5-offer");
  await other.getByTestId("catan-accept").click();
  await roller.getByTestId(`confirm-${oIdx}`).click();
  await expect.poll(async () => (await hand(roller)).brick).toBe(rBefore.brick + 1);
  expect((await hand(roller)).grain).toBe(rBefore.grain - 1);
  expect((await hand(other)).grain).toBe(oBefore.grain + 1);

  // End the turn; the other bear rolls a 7 while the first holds 9 cards.
  await roller.getByTestId("catan-end-turn").click();
  await expect.poll(async () => (await view(ann)).turn).toBe(oIdx);
  await roller.evaluate(() => window.__den!.catan!.dev(undefined, { lumber: 9 }));
  await expect.poll(async () => (await hand(roller)).lumber).toBeGreaterThanOrEqual(9);
  const cards = Object.values(await hand(roller)).reduce((a, b) => a + b, 0);
  await other.evaluate(() => window.__den!.catan!.dev([3, 4]));
  await other.getByTestId("catan-roll").click();
  await expect(roller.getByTestId("catan-discard")).toBeVisible();
  await shot(roller, "6-discard");
  for (let i = 0; i < Math.floor(cards / 2); i++) await roller.getByTestId("catan-discard").getByTestId("plus-lumber").click();
  await roller.getByTestId("catan-discard-go").click();
  await expect.poll(async () => (await view(ann)).phase).toBe("robber");

  // The robber: click a glowing hex next to the first bear's settlement; one victim, so it steals.
  v = await view(ann);
  const target = HEX_VERTICES.findIndex((vs, h) => h !== v.robber && vs.some((x) => v.buildings[x]?.owner === rIdx));
  const otherBefore = Object.values(await hand(other)).reduce((a, b) => a + b, 0);
  await other.waitForTimeout(400);
  await clickSpot(other, "hex", target);
  await expect.poll(async () => (await view(ann)).robber).toBe(target);
  for (const p of [ann, bob]) await expect.poll(() => p.evaluate(() => window.__den!.audio().played.robber ?? 0)).toBeGreaterThan(0);
  await expect.poll(async () => Object.values(await hand(other)).reduce((a, b) => a + b, 0)).toBe(otherBefore + 1);
  await expect.poll(async () => (await view(ann)).phase).toBe("main");

  // A bear standing by the table follows along.
  await cat.evaluate(([x, z]) => window.__den!.teleport(x!, z!, 0), [CATAN_TABLE.x - 2.2, CATAN_TABLE.z + 1.6] as const);
  await expect(cat.getByTestId("catan-hud")).toBeVisible({ timeout: 20_000 });
  await expect(cat.getByTestId("catan-player")).toHaveCount(2);
  await cat.waitForTimeout(800);
  await shot(cat, "7-watching");

  // Bob reloads mid-game: the table waits for him, then he's back with the same cards.
  const bobHand = await hand(bob);
  await bob.reload();
  await expect(ann.getByTestId("catan-waiting")).toBeVisible({ timeout: 20_000 });
  await skipIntro(bob);
  await waitForBear(bob);
  await expect.poll(async () => (await state(bob)).mine?.hand, { timeout: 20_000 }).toEqual(bobHand);
  await expect(ann.getByTestId("catan-waiting")).toBeHidden({ timeout: 20_000 });

  // The bear whose turn it is reaches 10 points: victory point cards, two cities, and a new settlement.
  const turnId = (await view(ann)).players[(await view(ann)).turn]!.id;
  const winner = pageOf(turnId);
  const wIdx = (await view(ann)).turn;
  await winner.evaluate(() => window.__den!.catan!.dev(undefined, { ore: 6, grain: 6, brick: 6, lumber: 6, wool: 2 }, true));
  await expect.poll(async () => (await hand(winner)).ore).toBeGreaterThanOrEqual(6);
  for (let i = 0; i < 6 && legalSettlements(g(await view(ann)), wIdx).length === 0; i++) {
    const roads = legalRoads(g(await view(ann)), wIdx);
    await winner.evaluate((e) => window.__den!.catan!.act({ type: "buildRoad", edge: e }), roads[i % roads.length]!);
    await winner.waitForTimeout(250);
  }
  const spot = legalSettlements(g(await view(ann)), wIdx)[0]!;
  await winner.evaluate((x) => window.__den!.catan!.act({ type: "buildSettlement", vertex: x }), spot);
  await winner.waitForTimeout(300);
  for (const c of legalCities(g(await view(ann)), wIdx).slice(0, 2)) {
    if ((await view(ann)).phase === "over") break;
    await winner.evaluate((x) => window.__den!.catan!.act({ type: "buildCity", vertex: x }), c);
    await winner.waitForTimeout(300);
  }
  await expect.poll(async () => (await view(ann)).phase, { timeout: 15_000 }).toBe("over");
  expect((await view(ann)).winner).toBe(wIdx);
  // (Generous waits: with three browsers on one laptop the other screens can lag a few seconds.)
  await expect(winner.getByTestId("catan-over")).toContainText("You win!", { timeout: 15_000 });
  const loser = winner === ann ? bob : ann;
  await expect(loser.getByTestId("catan-over")).toContainText("wins!", { timeout: 15_000 });
  await expect.poll(async () => (await state(loser)).wins.length).toBeGreaterThan(0);
  await shot(loser, "8-game-over");
  // The winner jumps up and cheers.
  await expect.poll(async () => (await state(winner)).seats.includes(turnId), { timeout: 15_000 }).toBe(false);
  await expect.poll(() => winner.evaluate(() => window.__den!.player.action), { timeout: 15_000 }).toBe("celebrate");
});

// Stopping early (Andrew, GAME_SPEC §16): leave with a confirm, or a majority vote to end the game.
test("players can leave a game, or vote to end it", async ({ page: ann, browser }) => {
  test.setTimeout(300_000);
  failOnErrors(ann);
  const code = await hostGame(ann, "Ann");
  const bob = await newPlayer(browser);
  await joinGame(bob, code, "Bob");
  await waitForBear(bob);
  const cat = await newPlayer(browser);
  await joinGame(cat, code, "Cat");
  await waitForBear(cat);
  await sitDown(ann, 2);
  await sitDown(bob, 0);
  await sitDown(cat, 1);
  const catId = (await state(ann)).seats[1]!;
  await ann.getByTestId("catan-start").click();
  await expect.poll(async () => (await view(ann))?.phase).toBe("setup");

  // A vote that fails: Ann calls it (2 of 3 needed), Bob and Cat say no.
  await ann.getByTestId("catan-vote-end").click();
  await expect(bob.getByTestId("catan-end-vote")).toContainText("Ann wants to end the game");
  await expect(bob.getByTestId("catan-end-vote")).toContainText("1 of 2");
  await expect(ann.getByTestId("catan-end-vote")).toContainText("You voted yes");
  await bob.waitForTimeout(600);
  await shot(bob, "9-vote");
  await bob.getByTestId("catan-vote-no").click();
  await cat.getByTestId("catan-vote-no").click();
  await expect(ann.getByTestId("catan-end-vote")).toBeHidden();
  expect((await view(ann)).phase).toBe("setup");

  // E asks before getting up mid-game; Keep playing stays seated.
  await expect.poll(async () => (await state(bob)).prompt).toBe("Leave game");
  await bob.keyboard.press("e");
  await expect(bob.getByTestId("catan-leave-confirm")).toBeVisible();
  await bob.getByTestId("catan-leave-cancel").click();
  await expect(bob.getByTestId("catan-leave-confirm")).toBeHidden();
  expect((await view(ann)).players.every((p) => !p.gone)).toBe(true);

  // Cat leaves with the button: out of the game and out of the chair; the others play on.
  await cat.getByTestId("catan-leave").click();
  await cat.waitForTimeout(400);
  await shot(cat, "10-leave-confirm");
  await cat.getByTestId("catan-leave-go").click();
  await expect.poll(async () => (await view(ann)).players.find((p) => p.id === catId)?.gone).toBe(true);
  await expect.poll(async () => (await state(ann)).seats[1]).toBe("");
  expect((await view(ann)).phase).not.toBe("over");

  // Ann calls a vote again; with 2 left, Bob's yes ends it with no winner.
  await ann.getByTestId("catan-vote-end").click();
  await bob.getByTestId("catan-vote-yes").click();
  await expect.poll(async () => (await view(ann)).phase).toBe("over");
  expect((await view(ann)).winner).toBeNull();
  for (const p of [ann, bob]) await expect(p.getByTestId("catan-over-vote")).toBeVisible();
  await bob.waitForTimeout(500);
  await shot(bob, "11-ended-by-vote");

  // Both can get up again.
  await expect.poll(async () => (await state(bob)).prompt).toBe("Get up");
  await bob.keyboard.press("e");
  await expect.poll(async () => (await state(ann)).seats[0]).toBe("");
});
