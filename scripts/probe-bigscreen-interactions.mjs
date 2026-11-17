import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-crash-reporter",
    "--no-proxy-server",
    "--proxy-bypass-list=*",
  ],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript(() => {
  const state = { pressed: new Set() };
  window.__fakePad = {
    press(index) {
      state.pressed.add(index);
    },
    release(index) {
      state.pressed.delete(index);
    },
  };
  const readPad = () => ({
    id: "Fake Xbox Controller (STANDARD GAMEPAD)",
    index: 0,
    connected: true,
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, index) => {
      const pressed = state.pressed.has(index);
      return { pressed, touched: pressed, value: pressed ? 1 : 0 };
    }),
  });
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => [readPad()],
  });
});

const snap = () =>
  page.evaluate(() => {
    const shelf = document.querySelector(".bigscreen-shelf");
    const row = document.querySelector(".bigscreen-shelf__row");
    return {
      active: document.activeElement?.getAttribute("data-bigscreen-focus"),
      category: document.querySelector(".bigscreen-rail__item.is-active")?.dataset.categoryId,
      rowScroll: Math.round(row?.scrollLeft ?? -1),
      launch: Boolean(document.querySelector('[data-bigscreen-focus="hero-launch"]')),
      shelfClass: shelf?.className ?? null,
      shelfInert: Boolean(shelf?.hasAttribute("inert")),
      menu: document.querySelectorAll(".bigscreen-menu").length,
      hint: document.querySelector(".bigscreen-hint")?.textContent ?? "",
      posterFocus: document.querySelectorAll('[data-bigscreen-focus="hero-poster"]').length,
    };
  });

const tap = async (index) => {
  await page.evaluate((i) => window.__fakePad.press(i), index);
  await page.waitForTimeout(70);
  await page.evaluate((i) => window.__fakePad.release(i), index);
  await page.waitForTimeout(240);
};

const waitForFocus = (key) =>
  page.waitForFunction(
    (expected) => document.activeElement?.getAttribute("data-bigscreen-focus") === expected,
    key,
  );

await page.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
await page.waitForSelector(".bigscreen-hero");
await page.waitForTimeout(500);

const initial = await snap();
console.log("initial", initial);
assert.equal(initial.active, "shelf-1");
assert.equal(initial.posterFocus, 0);
assert.equal(initial.launch, false);
assert.ok(initial.hint.includes("A 显示启动"));

await page.keyboard.press("ArrowUp");
await waitForFocus("category-recent");
const railFocus = await snap();
console.log("rail focus", railFocus);
assert.equal(railFocus.active, "category-recent");

await page.keyboard.press("ArrowRight");
await waitForFocus("shelf-1");
const backToShelf = await snap();
console.log("back to shelf", backToShelf);
assert.equal(backToShelf.active, "shelf-1");

await tap(0);
await waitForFocus("hero-launch");
await page.waitForTimeout(180);
const launchOpen = await snap();
console.log("A reveal", launchOpen);
assert.equal(launchOpen.active, "hero-launch");
assert.equal(launchOpen.launch, true);
assert.equal(launchOpen.menu, 0);
assert.ok(launchOpen.shelfClass.includes("is-collapsed"));
assert.equal(launchOpen.shelfInert, true);
assert.ok(launchOpen.hint.includes("A 启动游戏"));

await tap(1);
await waitForFocus("shelf-1");
await page.waitForTimeout(180);
const launchClosed = await snap();
console.log("B close", launchClosed);
assert.equal(launchClosed.active, "shelf-1");
assert.equal(launchClosed.launch, false);
assert.equal(launchClosed.shelfInert, false);
assert.ok(!launchClosed.shelfClass.includes("is-collapsed"));
assert.ok(launchClosed.hint.includes("LT/RT 翻页"));

await tap(3);
await page.waitForSelector(".bigscreen-menu");
await waitForFocus("menu-launch");
const menuOpen = await snap();
console.log("Y menu", menuOpen);
assert.equal(menuOpen.menu, 1);
assert.equal(menuOpen.launch, false);

await tap(1);
await page.waitForFunction(() => document.querySelectorAll(".bigscreen-menu").length === 0);
await waitForFocus("shelf-1");
const menuClosed = await snap();
console.log("Y close", menuClosed);
assert.equal(menuClosed.menu, 0);
assert.equal(menuClosed.active, "shelf-1");

const categoryBefore = menuClosed.category;
await tap(4);
await page.waitForFunction(
  (previous) =>
    document.querySelector(".bigscreen-rail__item.is-active")?.dataset.categoryId !== previous,
  categoryBefore,
);
await page.waitForFunction(() =>
  document.activeElement?.getAttribute("data-bigscreen-focus")?.startsWith("shelf-"),
);
const lbFromShelf = await snap();
console.log("LB from shelf", lbFromShelf);
assert.notEqual(lbFromShelf.category, categoryBefore);
assert.match(lbFromShelf.active ?? "", /^shelf-/);

await tap(5);
await page.waitForFunction(
  (expected) =>
    document.querySelector(".bigscreen-rail__item.is-active")?.dataset.categoryId === expected,
  categoryBefore,
);
await page.waitForFunction(() =>
  document.activeElement?.getAttribute("data-bigscreen-focus")?.startsWith("shelf-"),
);
const rbFromShelf = await snap();
console.log("RB from shelf", rbFromShelf);
assert.equal(rbFromShelf.category, categoryBefore);
assert.match(rbFromShelf.active ?? "", /^shelf-/);

await tap(7);
await page.waitForTimeout(700);
const pagedRight = await snap();
console.log("RT page", pagedRight);
assert.ok(pagedRight.rowScroll > 0);
assert.match(pagedRight.active ?? "", /^shelf-/);

await tap(6);
await page.waitForTimeout(700);
const pagedLeft = await snap();
console.log("LT page", pagedLeft);
assert.equal(pagedLeft.rowScroll, 0);
assert.match(pagedLeft.active ?? "", /^shelf-/);

await page.locator(".bigscreen-card.is-selected").click();
await waitForFocus("hero-launch");
await page.waitForTimeout(180);
const clickReveal = await snap();
console.log("click selected cover", clickReveal);
assert.equal(clickReveal.launch, true);
assert.equal(clickReveal.menu, 0);
assert.equal(clickReveal.shelfInert, true);

await tap(1);
await page.waitForFunction(() =>
  document.activeElement?.getAttribute("data-bigscreen-focus")?.startsWith("shelf-"),
);
const dismissed = await snap();
console.log("dismissed", dismissed);
assert.equal(dismissed.shelfInert, false);
assert.equal(dismissed.launch, false);

await browser.close();
console.log("big-screen interactions: ok");
