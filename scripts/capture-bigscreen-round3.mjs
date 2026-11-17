import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1422";
const outputRoot = path.resolve("outputs", "redesign-bigscreen", "2026-11-16", "round3");
const viewports = [
  { name: "1120x720", width: 1120, height: 720 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "2560x1440", width: 2560, height: 1440 },
];

await fs.mkdir(outputRoot, { recursive: true });
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

const report = {};

for (const viewport of viewports) {
  const directory = path.join(outputRoot, viewport.name);
  await fs.mkdir(directory, { recursive: true });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
  await page.waitForSelector(".bigscreen-hero");
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(850);
  await page.screenshot({ path: path.join(directory, "01-room.png"), animations: "disabled" });

  const metrics = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.width),
        h: Math.round(box.height),
      };
    };
    const root = document.querySelector(".bigscreen-root");
    const rootLine = root ? getComputedStyle(root, "::before") : null;
    return {
      viewport: [window.innerWidth, window.innerHeight],
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      active: document.activeElement?.getAttribute("data-bigscreen-focus"),
      poster: rect(".bigscreen-backdrop__print"),
      hero: rect(".bigscreen-hero"),
      copy: rect(".bigscreen-hero__copy"),
      rail: rect(".bigscreen-rail"),
      brand: rect(".bigscreen-rail__brand"),
      shelf: rect(".bigscreen-shelf"),
      hint: rect(".bigscreen-hint"),
      dossier: rect(".bigscreen-dossier"),
      actionSlot: rect(".bigscreen-hero__action-slot"),
      posterTop: rect(".bigscreen-backdrop__print")?.y,
      posterBottom:
        (rect(".bigscreen-backdrop__print")?.y ?? 0) +
        (rect(".bigscreen-backdrop__print")?.h ?? 0),
      divider: rootLine
        ? {
            position: rootLine.position,
            top: rootLine.top,
            bottom: rootLine.bottom,
            width: rootLine.width,
          }
        : null,
      topbarBrand: document.querySelectorAll(".bigscreen-brand").length,
      posterFocus: document.querySelectorAll('[data-bigscreen-focus="hero-poster"]').length,
      launchBefore: document.querySelectorAll('[data-bigscreen-focus="hero-launch"]').length,
      brandInsideRail: Boolean(document.querySelector(".bigscreen-rail .bigscreen-rail__brand")),
      dossierItems: document.querySelectorAll(".bigscreen-dossier__item").length,
    };
  });

  if (metrics.scroll[0] > viewport.width || metrics.scroll[1] > viewport.height) {
    throw new Error(viewport.name + " overflows: " + JSON.stringify(metrics.scroll));
  }
  if (metrics.posterTop !== 0 || metrics.posterBottom !== viewport.height) {
    throw new Error(viewport.name + " poster does not fill the viewport block: " + JSON.stringify(metrics.poster));
  }
  if (metrics.posterFocus !== 0 || metrics.launchBefore !== 0) {
    throw new Error(viewport.name + " still exposes the old hero focus/launch state");
  }
  if (!metrics.brandInsideRail || metrics.topbarBrand !== 0) {
    throw new Error(viewport.name + " does not place the mark in the rail");
  }
  if (!metrics.active?.startsWith("shelf-")) {
    throw new Error(viewport.name + " does not start on the shelf: " + metrics.active);
  }
  if (metrics.dossierItems !== 4) {
    throw new Error(viewport.name + " does not render the four-cell dossier");
  }

  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(100);
  const upFocus = await page.evaluate(() => document.activeElement?.getAttribute("data-bigscreen-focus"));
  if (upFocus !== "category-recent") {
    throw new Error(viewport.name + " up from shelf did not reach the category rail: " + upFocus);
  }
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  const returnedFocus = await page.evaluate(() =>
    document.activeElement?.getAttribute("data-bigscreen-focus"),
  );
  if (!returnedFocus?.startsWith("shelf-")) {
    throw new Error(viewport.name + " right from rail did not return to the shelf: " + returnedFocus);
  }

  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-bigscreen-focus="hero-launch"]');
  await page.waitForTimeout(420);
  await page.screenshot({ path: path.join(directory, "02-launch.png"), animations: "disabled" });
  const launch = await page.evaluate(() => ({
    active: document.activeElement?.getAttribute("data-bigscreen-focus"),
    shelfClass: document.querySelector(".bigscreen-shelf")?.className ?? "",
    shelfInert: document.querySelector(".bigscreen-shelf")?.hasAttribute("inert"),
    shelfFocusables: document.querySelectorAll('[data-bigscreen-focus^="shelf-"]').length,
    hint: document.querySelector(".bigscreen-hint")?.textContent ?? "",
    menu: document.querySelectorAll('[role="menu"]').length,
  }));
  if (
    launch.active !== "hero-launch" ||
    !launch.shelfClass.includes("is-deemphasized") ||
    launch.shelfClass.includes("is-collapsed") ||
    !launch.shelfInert ||
    launch.shelfFocusables !== 0 ||
    !launch.hint.includes("A 启动游戏") ||
    launch.hint.includes("LT/RT") ||
    launch.menu !== 0
  ) {
    throw new Error(viewport.name + " launch state is wrong: " + JSON.stringify(launch));
  }

  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  const dismissed = await page.evaluate(() => ({
    active: document.activeElement?.getAttribute("data-bigscreen-focus"),
    shelfClass: document.querySelector(".bigscreen-shelf")?.className ?? "",
    shelfInert: document.querySelector(".bigscreen-shelf")?.hasAttribute("inert"),
    hint: document.querySelector(".bigscreen-hint")?.textContent ?? "",
  }));
  if (
    !dismissed.active?.startsWith("shelf-") ||
    dismissed.shelfClass.includes("is-deemphasized") ||
    dismissed.shelfInert ||
    !dismissed.hint.includes("LT/RT")
  ) {
    throw new Error(viewport.name + " did not return to the shelf: " + JSON.stringify(dismissed));
  }

  report[viewport.name] = { ...metrics, launch, dismissed, errors };
  if (errors.length) {
    throw new Error(viewport.name + " browser errors: " + errors.join(" | "));
  }
  console.log(viewport.name, JSON.stringify(report[viewport.name]));
  await page.close();
}

const togglePage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await togglePage.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
await togglePage.evaluate(() => {
  const raw = localStorage.getItem("miyu-appearance");
  const persisted = raw ? JSON.parse(raw) : { state: {}, version: 4 };
  persisted.state = { ...persisted.state, bigScreenHints: false };
  localStorage.setItem("miyu-appearance", JSON.stringify(persisted));
});
await togglePage.reload({ waitUntil: "networkidle" });
await togglePage.waitForSelector(".bigscreen-hero");
await togglePage.waitForTimeout(500);
await togglePage.screenshot({
  path: path.join(outputRoot, "1920x1080", "03-hints-off.png"),
  animations: "disabled",
});
const hintsOff = await togglePage.evaluate(() => ({
  hint: document.querySelectorAll(".bigscreen-hint").length,
  shelf: document.querySelector(".bigscreen-shelf")?.getBoundingClientRect().bottom,
  viewport: window.innerHeight,
}));
if (hintsOff.hint !== 0) {
  throw new Error("hints-off preference did not remove the key legend");
}
report.hintsOff = hintsOff;
await togglePage.close();

await browser.close();
await fs.writeFile(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2));
console.log("screens: " + outputRoot);
