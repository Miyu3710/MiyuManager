import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:1420";
const outputRoot = path.resolve("outputs", "app");
const tempRoot = path.resolve("tmp");

await fs.mkdir(tempRoot, { recursive: true });
process.env.TEMP = tempRoot;
process.env.TMP = tempRoot;

const routes = [
  { name: "00-home", path: "/" },
  { name: "01-library", path: "/library" },
  { name: "02-detail", path: "/work/moonlit-atelier" },
  { name: "03-stats", path: "/stats" },
  { name: "04-settings", path: "/settings" },
  { name: "05-bigscreen", path: "/big-screen" },
];

const viewports = [
  { name: "1440x900", width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: "1920x1080", width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: "150pct-1280x720", width: 1280, height: 720, deviceScaleFactor: 1.5 },
  {
    name: "4k",
    width: 3840,
    height: 2160,
    deviceScaleFactor: 1,
    routes: routes.filter((route) => route.name === "00-home" || route.name === "01-library"),
  },
];

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-crash-reporter"],
});

for (const viewport of viewports.filter(
  (item) => !process.env.APP_ONLY || item.name === process.env.APP_ONLY,
)) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
  });

  for (const route of viewport.routes ?? routes) {
    await page.goto(`${baseUrl}/#${route.path}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".app-window, .bigscreen-root");
    await page.evaluate(async () => {
      await document.fonts.ready;
      document.documentElement.dataset.capture = "true";
    });
    await page.waitForTimeout(250);

    const outputDir = path.join(outputRoot, viewport.name);
    await fs.mkdir(outputDir, { recursive: true });
    await page.screenshot({
      path: path.join(outputDir, `${route.name}.png`),
      animations: "disabled",
    });

    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const scroller = document.querySelector(".app-page, .bigscreen-main");
      return {
        viewport: [window.innerWidth, window.innerHeight],
        documentWidth: Math.max(root.scrollWidth, document.documentElement.scrollWidth),
        scroller: scroller
          ? {
              clientWidth: scroller.clientWidth,
              scrollWidth: scroller.scrollWidth,
              clientHeight: scroller.clientHeight,
              scrollHeight: scroller.scrollHeight,
            }
          : null,
      };
    });
    console.log(`${viewport.name} ${route.name}`, JSON.stringify(metrics));
  }

  await page.close();
}

await browser.close();
console.log(`App screenshots saved to ${outputRoot}`);
