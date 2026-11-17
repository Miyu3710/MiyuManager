import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";
const outputRoot = path.resolve("outputs", "redesign-bigscreen", "2026-11-16", "round4");
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

  const idle = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.width),
        h: Math.round(box.height),
        bottom: Math.round(box.bottom),
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
      title: rect(".bigscreen-hero h1"),
      meta: rect(".bigscreen-hero__meta"),
      shelf: rect(".bigscreen-shelf"),
      hint: rect(".bigscreen-hint"),
      dossier: rect(".bigscreen-dossier"),
      actionSlot: rect(".bigscreen-hero__action-slot"),
      facts: document.querySelectorAll(".bigscreen-facts").length,
      metaItems: document.querySelectorAll(".bigscreen-hero__meta > span").length,
      posterFocus: document.querySelectorAll('[data-bigscreen-focus="hero-poster"]').length,
      launchBefore: document.querySelectorAll('[data-bigscreen-focus="hero-launch"]').length,
      divider: rootLine
        ? {
            position: rootLine.position,
            top: rootLine.top,
            bottom: rootLine.bottom,
            width: rootLine.width,
          }
        : null,
      brandInsideRail: Boolean(document.querySelector(".bigscreen-rail .bigscreen-rail__brand")),
      topbarBrand: document.querySelectorAll(".bigscreen-brand").length,
      dossierItems: document.querySelectorAll(".bigscreen-dossier__item").length,
    };
  });

  if (idle.scroll[0] > viewport.width || idle.scroll[1] > viewport.height) {
    throw new Error(viewport.name + " overflows: " + JSON.stringify(idle.scroll));
  }
  if (idle.poster.y !== 0 || idle.poster.bottom !== viewport.height) {
    throw new Error(viewport.name + " poster does not fill the viewport: " + JSON.stringify(idle.poster));
  }
  if (idle.posterFocus !== 0 || idle.launchBefore !== 0) {
    throw new Error(viewport.name + " still exposes the old poster focus or early launch action");
  }
  if (idle.facts !== 0) {
    throw new Error(viewport.name + " still renders the vertical facts column");
  }
  if (idle.metaItems !== 5) {
    throw new Error(viewport.name + " publication metadata is incomplete: " + idle.metaItems);
  }
  if (idle.actionSlot !== null) {
    throw new Error(viewport.name + " reserves an empty launch slot before A");
  }
  if (!idle.brandInsideRail || idle.topbarBrand !== 0) {
    throw new Error(viewport.name + " does not place the mark in the rail");
  }
  if (idle.divider?.position !== "fixed" || idle.divider.top !== "0px" || idle.divider.bottom !== "0px") {
    throw new Error(viewport.name + " divider does not span the viewport: " + JSON.stringify(idle.divider));
  }
  if (!idle.active?.startsWith("shelf-") || idle.dossierItems !== 4) {
    throw new Error(viewport.name + " does not start on the shelf with four records");
  }

  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(100);
  const upFocus = await page.evaluate(() =>
    document.activeElement?.getAttribute("data-bigscreen-focus"),
  );
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
  await page.waitForTimeout(620);
  await page.screenshot({ path: path.join(directory, "02-launch.png"), animations: "disabled" });
  const launch = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.width),
        h: Math.round(box.height),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
      };
    };
    return {
      active: document.activeElement?.getAttribute("data-bigscreen-focus"),
      shelfClass: document.querySelector(".bigscreen-shelf")?.className ?? "",
      shelfHidden: document.querySelector(".bigscreen-shelf")?.getAttribute("aria-hidden"),
      shelfInert: document.querySelector(".bigscreen-shelf")?.hasAttribute("inert"),
      shelf: rect(".bigscreen-shelf"),
      hero: rect(".bigscreen-hero"),
      copy: rect(".bigscreen-hero__copy"),
      dossier: rect(".bigscreen-dossier"),
      button: rect('[data-bigscreen-focus="hero-launch"]'),
      hint: rect(".bigscreen-hint"),
      shelfFocusables: document.querySelectorAll('[data-bigscreen-focus^="shelf-"]').length,
      hintText: document.querySelector(".bigscreen-hint")?.textContent ?? "",
      menu: document.querySelectorAll('[role="menu"]').length,
    };
  });
  if (
    launch.active !== "hero-launch" ||
    !launch.shelfClass.includes("is-collapsed") ||
    launch.shelfHidden !== "true" ||
    !launch.shelfInert ||
    launch.shelfFocusables !== 0 ||
    !launch.hintText.includes("A 启动游戏") ||
    launch.hintText.includes("LT/RT") ||
    launch.menu !== 0
  ) {
    throw new Error(viewport.name + " launch state is wrong: " + JSON.stringify(launch));
  }
  if (launch.shelf.h > 2) {
    throw new Error(viewport.name + " shelf did not collapse out of layout: " + JSON.stringify(launch.shelf));
  }
  if (launch.hero.h < idle.hero.h + 100) {
    throw new Error(viewport.name + " hero did not reclaim the collapsed shelf space");
  }
  if (!launch.button || !launch.dossier) {
    throw new Error(viewport.name + " launch action or dossier is missing");
  }
  if (Math.abs(launch.button.x - launch.copy.x) > 2) {
    throw new Error(viewport.name + " launch action is not left-aligned: " + JSON.stringify(launch.button));
  }
  if (launch.button.top < launch.dossier.bottom + 8) {
    throw new Error(viewport.name + " launch action crowds the dossier");
  }
  if (launch.button.bottom > launch.hint.top - 8) {
    throw new Error(viewport.name + " launch action touches the key legend");
  }

  await page.keyboard.press("Escape");
  await page.waitForTimeout(520);
  const dismissed = await page.evaluate(() => {
    const shelf = document.querySelector(".bigscreen-shelf");
    const box = shelf?.getBoundingClientRect();
    return {
      active: document.activeElement?.getAttribute("data-bigscreen-focus"),
      shelfClass: shelf?.className ?? "",
      shelfHidden: shelf?.getAttribute("aria-hidden"),
      shelfInert: shelf?.hasAttribute("inert"),
      shelfHeight: Math.round(box?.height ?? 0),
      hint: document.querySelector(".bigscreen-hint")?.textContent ?? "",
    };
  });
  if (
    !dismissed.active?.startsWith("shelf-") ||
    dismissed.shelfClass.includes("is-collapsed") ||
    dismissed.shelfHidden !== null ||
    dismissed.shelfInert ||
    dismissed.shelfHeight < 100 ||
    !dismissed.hint.includes("LT/RT")
  ) {
    throw new Error(viewport.name + " did not restore the shelf: " + JSON.stringify(dismissed));
  }

  report[viewport.name] = { ...idle, launch, dismissed, errors };
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
  shelf: Math.round(document.querySelector(".bigscreen-shelf")?.getBoundingClientRect().bottom ?? 0),
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
