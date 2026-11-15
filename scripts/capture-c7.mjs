import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";
const outputRoot = path.resolve("outputs", "app", "c7");
const viewports = [
  { name: "1440x900", width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: "1920x1080", width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: "150pct-1280x720", width: 1280, height: 720, deviceScaleFactor: 1.5 },
  { name: "4k", width: 3840, height: 2160, deviceScaleFactor: 1 },
];

await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-crash-reporter"],
});

const allMetrics = {};

for (const viewport of viewports) {
  const directory = path.join(outputRoot, viewport.name);
  await fs.mkdir(directory, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
  });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
  await page.waitForSelector(".bigscreen-root");
  await page.waitForSelector(".bigscreen-hero, .bigscreen-state");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(directory, "01-bigscreen.png"),
    animations: "disabled",
  });

  const initial = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      };
    };
    return {
      viewport: [window.innerWidth, window.innerHeight],
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      hero: box(".bigscreen-hero"),
      side: box(".bigscreen-side"),
      shelf: box(".bigscreen-shelf"),
      active: document.activeElement?.getAttribute("data-bigscreen-focus"),
      title: document.querySelector(".bigscreen-hero h1")?.textContent ?? null,
      shelfVisible: Boolean(document.querySelector(".bigscreen-shelf")),
      focusables: document.querySelectorAll("[data-bigscreen-focus]").length,
    };
  });

  await page.keyboard.press("c");
  await page.waitForSelector(".bigscreen-menu");
  await page.screenshot({
    path: path.join(directory, "02-game-menu.png"),
    animations: "disabled",
  });
  const menu = await page.evaluate(() => ({
    active: document.activeElement?.getAttribute("data-bigscreen-focus"),
    items: [...document.querySelectorAll(".bigscreen-menu__item")].map((item) =>
      item.textContent?.trim(),
    ),
  }));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);

  await page.keyboard.press("m");
  await page.waitForSelector(".bigscreen-control");
  await page.screenshot({
    path: path.join(directory, "03-control.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);

  const focusPath = [];
  for (const key of ["ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown", "ArrowLeft"]) {
    await page.keyboard.press(key);
    focusPath.push(
      await page.evaluate(() => document.activeElement?.getAttribute("data-bigscreen-focus")),
    );
  }

  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
  if (await page.locator(".bigscreen-drawer").count()) {
    await page.screenshot({
      path: path.join(directory, "04-detail-drawer.png"),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(60);
  }

  const metrics = { initial, menu, focusPath, errors };
  allMetrics[viewport.name] = metrics;
  if (initial.documentWidth > viewport.width) {
    throw new Error(`${viewport.name} overflows horizontally`);
  }
  if (initial.documentHeight > viewport.height) {
    throw new Error(`${viewport.name} overflows vertically`);
  }
  if (errors.length > 0) {
    throw new Error(`${viewport.name} console errors: ${errors.join(" | ")}`);
  }
  console.log(viewport.name, JSON.stringify(metrics));
  await page.close();
}

await browser.close();
console.log(JSON.stringify({ outputRoot, allMetrics }, null, 2));
