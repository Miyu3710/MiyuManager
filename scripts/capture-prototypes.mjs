import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.PROTO_BASE_URL ?? "http://localhost:1420";
const outputRoot = path.resolve("outputs", "prototypes");
const tempRoot = path.resolve("tmp");

await fs.mkdir(tempRoot, { recursive: true });
process.env.TEMP = tempRoot;
process.env.TMP = tempRoot;

const routes = [
  { name: "00-gallery", path: "/" },
  { name: "01-launcher-home", path: "/prototype/screening" },
  { name: "01-launcher-library", path: "/prototype/screening/library" },
  { name: "01-launcher-detail", path: "/prototype/screening/work/moonlit-atelier" },
  { name: "02-shop-home", path: "/prototype/archive" },
  { name: "02-shop-library", path: "/prototype/archive/library" },
  { name: "02-shop-detail", path: "/prototype/archive/work/moonlit-atelier" },
  { name: "03-channel-home", path: "/prototype/channel" },
  { name: "03-channel-library", path: "/prototype/channel/library" },
  { name: "03-channel-detail", path: "/prototype/channel/work/moonlit-atelier" },
];

const viewports = [
  { name: "1440x900", width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: "1920x1080", width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: "150pct-1280x720", width: 1280, height: 720, deviceScaleFactor: 1.5 },
  {
    name: "4k-home",
    width: 3840,
    height: 2160,
    deviceScaleFactor: 1,
    routes: routes.filter((route) => route.name.endsWith("-home") || route.name === "00-gallery"),
  },
];

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--force-device-scale-factor=1"],
});

for (const viewport of viewports.filter(
  (item) => !process.env.PROTO_ONLY || item.name === process.env.PROTO_ONLY,
)) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
  });

  for (const route of viewport.routes ?? routes) {
    await page.goto(`${baseUrl}/#${route.path}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".app-window");
    await page.evaluate(async () => {
      await document.fonts.ready;
      document.documentElement.dataset.capture = "true";
    });
    await page.waitForTimeout(300);

    const outputDir = path.join(outputRoot, viewport.name);
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${route.name}.png`);
    await page.screenshot({ path: outputPath, animations: "disabled" });

    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const app = document.querySelector(".app-window");
      const scroller = document.querySelector(
        ".screening-page, .archive-main, .channel-main, .gallery-main",
      );
      return {
        viewport: [window.innerWidth, window.innerHeight],
        documentWidth: Math.max(root.scrollWidth, app?.scrollWidth ?? 0),
        documentHeight: Math.max(root.scrollHeight, app?.scrollHeight ?? 0),
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
console.log(`Screenshots saved to ${outputRoot}`);
