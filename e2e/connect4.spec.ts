import { expect, type Page, test } from "@playwright/test";
import { C4_SEATS } from "../shared/src/index.ts";
import { closePlayers, failOnErrors, hostGame, joinGame, newPlayer, skipIntro, waitForBear } from "./helpers.ts";

// Connect Four (round 2, Andrew 2026-10-16): two bears sit at the games table in the basement stair
// landing and play by clicking columns, a third watches, one reloads mid-game and the table waits,
// four in a row wins; then a rematch, and getting up mid-game ends it with no winner.
//   npx playwright test e2e/connect4.spec.ts   (screenshots in test-results/connect4/)

test.afterEach(closePlayers);

const state = (page: Page) => page.evaluate(() => window.__den!.c4!.state());
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/connect4/${name}.png` });

async function sitDown(page: Page, seat: number) {
  const s = C4_SEATS[seat]!;
  const x = s.x - Math.sin(s.yaw) * 0.7, z = s.z - Math.cos(s.yaw) * 0.7;
  await expect.poll(async () => (await state(page)).seated, { timeout: 10_000 }).toBe(false); // done getting up from a last game
  await page.waitForTimeout(2500); // and done cheering
  await page.evaluate(([x, z, y]) => window.__den!.teleport(x!, z!, y!), [x, z, s.y] as const);
  await expect.poll(async () => {
    const p = await page.evaluate(() => window.__den!.serverPosition());
    return p ? Math.hypot(p.x - x, p.z - z) : 99;
  }, { timeout: 60_000 }).toBeLessThan(0.6);
  await expect.poll(async () => (await state(page)).prompt, { timeout: 20_000 }).toBe("Sit at Connect Four");
  await page.keyboard.press("e");
  await expect.poll(async () => (await state(page)).seats[seat]).not.toBe("");
}

/** Click a column the way a player does (waits for the over-the-shoulder camera to settle). */
async function clickColumn(page: Page, col: number) {
  const before = (await state(page)).game!.moves;
  await page.waitForTimeout(150);
  const at = await page.evaluate((c) => window.__den!.c4!.screenOfColumn(c), col);
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  await expect.poll(async () => (await state(page)).game!.moves).toBe(before + 1);
}

test("two bears play Connect Four by clicking; a third watches; four in a row wins", async ({ page: ann, browser }) => {
  test.setTimeout(300_000);
  failOnErrors(ann);
  const code = await hostGame(ann, "Ann");
  const bob = await newPlayer(browser);
  await joinGame(bob, code, "Bob");
  await waitForBear(bob);
  const cat = await newPlayer(browser);
  await joinGame(cat, code, "Cat");
  await waitForBear(cat);

  await sitDown(ann, 0);
  await sitDown(bob, 1);
  const [annId, bobId] = (await state(ann)).seats as [string, string];
  await expect(ann.getByTestId("c4-lobby")).toBeVisible();
  await ann.waitForTimeout(1500);
  await shot(ann, "1-lobby");
  await ann.getByTestId("c4-start").click();
  await expect.poll(async () => (await state(bob)).game?.phase).toBe("play");

  // Red (a random bear) goes first. Red plays 0,1,2,3 along the bottom; yellow stacks up column 6.
  const game = (await state(ann)).game!;
  const red = game.players[0]!.id === annId ? ann : bob, yellow = red === ann ? bob : ann;
  await expect(red.getByTestId("c4-status")).toContainText("Your turn");
  await expect(yellow.getByTestId("c4-status")).toContainText("'s turn");

  // A watcher by the table follows along.
  const s = C4_SEATS[0]!;
  await cat.evaluate(([x, z, y]) => window.__den!.teleport(x!, z!, y!), [s.x - 1.6, s.z - 0.4, s.y] as const);
  for (const [i, col] of [0, 1].entries()) {
    await clickColumn(red, col);
    if (i === 0) await shot(red, "2-first-disc");
    await clickColumn(yellow, 6);
  }
  await expect(cat.getByTestId("c4-hud")).toContainText("Connect Four", { timeout: 20_000 });
  await shot(cat, "3-watching");

  // The yellow player reloads mid-game: the table waits, then play carries on.
  await yellow.reload();
  await expect(red.getByTestId("c4-status")).toContainText("Paused", { timeout: 20_000 });
  await skipIntro(yellow);
  await waitForBear(yellow);
  await expect(red.getByTestId("c4-status")).not.toContainText("Paused", { timeout: 20_000 });
  expect((await state(yellow)).seats).toEqual([annId, bobId]);
  await expect.poll(async () => (await state(yellow)).seated, { timeout: 20_000 }).toBe(true);

  await clickColumn(red, 2);
  await clickColumn(yellow, 6);
  await shot(yellow, "4-yellow-view");
  await clickColumn(red, 3);
  const over = (await state(ann)).game!;
  expect(over.phase).toBe("over");
  expect(over.winner).toBe(0);
  expect(over.line).toHaveLength(4);
  await expect(red.getByTestId("c4-over")).toContainText("You win!");
  await expect(yellow.getByTestId("c4-over")).toContainText("wins!");
  await red.waitForTimeout(800);
  await shot(yellow, "5-win");
  await expect.poll(async () => (await state(cat)).wins.length).toBe(1);

  // The winner jumped up to cheer; sit back down for a rematch, then the other bear leaves mid-game.
  await expect.poll(async () => (await state(red)).seats.includes(red === ann ? annId : bobId)).toBe(false);
  await sitDown(red, red === ann ? 0 : 1);
  await red.getByTestId("c4-start").click();
  await expect.poll(async () => (await state(ann)).game?.phase).toBe("play");
  await expect.poll(async () => (await state(bob)).prompt).toBe("Leave game");
  await bob.keyboard.press("e");
  await bob.getByTestId("c4-leave-yes").click();
  await expect.poll(async () => (await state(ann)).game?.phase).toBe("over");
  expect((await state(ann)).game!.winner).toBeNull();
  await expect(ann.getByTestId("c4-over")).toContainText("Game over");
});
