import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:1420";
const outputRoot = path.resolve("outputs", "app", "redesign");
const requested = process.env.CAPTURE_VIEWPORT;
const routes = [
  { name: "00-home", path: "/", ready: ".home-page" },
  { name: "01-library", path: "/library", ready: ".library-page" },
  { name: "02-detail", path: "/work/moonlit-atelier", ready: ".detail-page" },
  { name: "03-stats", path: "/stats", ready: ".stats-page" },
  { name: "04-settings", path: "/settings", ready: ".settings-page" },
  { name: "05-bigscreen", path: "/big-screen", ready: ".bigscreen-root" },
  { name: "06-collections", path: "/collections", ready: ".collections-page" },
  { name: "07-onboarding", path: "/onboarding", ready: ".onboarding-panel" },
];
const viewports = [
  { name: "1440x900", width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: "1920x1080", width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: "150pct-1280x720", width: 1280, height: 720, deviceScaleFactor: 1.5 },
  { name: "min-1120x720", width: 1120, height: 720, deviceScaleFactor: 1 },
].filter((viewport) => !requested || viewport.name === requested);

await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-crash-reporter"],
});

for (const viewport of viewports) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
  });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const route of routes) {
    await page.goto(baseUrl + "/#" + route.path, { waitUntil: "networkidle" });
    await page.waitForSelector(".app-window, .bigscreen-root");
    await page.waitForSelector(route.ready);
    await page.evaluate(async () => {
      await document.fonts.ready;
      document.documentElement.dataset.capture = "true";
    });
    await page.waitForTimeout(220);

    const directory = path.join(outputRoot, viewport.name);
    await fs.mkdir(directory, { recursive: true });
    await page.screenshot({
      path: path.join(directory, route.name + ".png"),
      animations: "disabled",
    });

    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const scroller = document.querySelector(".app-page, .bigscreen-main");
      const smallest = [...document.querySelectorAll(".app-page *")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            element.childElementCount === 0 &&
            (element.textContent ?? "").trim().length > 0
          );
        })
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize))
        .filter(Number.isFinite);
      return {
        viewport: [window.innerWidth, window.innerHeight],
        documentWidth: root.scrollWidth,
        documentHeight: root.scrollHeight,
        scroller: scroller
          ? {
              clientWidth: scroller.clientWidth,
              scrollWidth: scroller.scrollWidth,
              clientHeight: scroller.clientHeight,
              scrollHeight: scroller.scrollHeight,
            }
          : null,
        minTextPx: smallest.length ? Math.min(...smallest) : null,
      };
    });
    console.log(viewport.name, route.name, JSON.stringify(metrics));
    if (metrics.documentWidth > viewport.width) {
      throw new Error(viewport.name + " " + route.name + " overflows horizontally");
    }
  }

  if (errors.length > 0) {
    throw new Error(viewport.name + " console errors: " + errors.join(" | "));
  }
  await page.close();
}

await browser.close();
console.log("Redesign screenshots saved to " + outputRoot);
