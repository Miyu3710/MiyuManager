import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";
const outputRoot = path.resolve("outputs", "app", "c6");
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

  await page.goto(baseUrl + "/#/stats", { waitUntil: "networkidle" });
  await page.waitForSelector(".stats-page .stats-metrics");
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.dataset.capture = "true";
  });
  await page.waitForTimeout(250);
  await page.screenshot({
    path: path.join(directory, "01-stats.png"),
    animations: "disabled",
  });
  const statsMetrics = await page.evaluate(() => ({
    viewport: [window.innerWidth, window.innerHeight],
    documentWidth: document.documentElement.scrollWidth,
    days: document.querySelectorAll(".stats-heatmap__grid span").length,
    sessions: document.querySelectorAll(".stats-session-row:not(.stats-session-row--head)").length,
  }));

  await page.goto(baseUrl + "/#/work/moonlit-atelier?tab=sessions", {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".session-history .detail-session-table__row--c6");
  await page.screenshot({
    path: path.join(directory, "02-play-sessions.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: /补录会话/ }).click();
  await page.waitForSelector(".session-editor");
  await page.getByLabel("备注").fill("补录二周目会话");
  await page
    .locator(".session-editor")
    .evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(150);
  await page.screenshot({
    path: path.join(directory, "03-session-backfill.png"),
    animations: "disabled",
  });
  const detailMetrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    rows: document.querySelectorAll(".detail-session-table__row--c6").length,
    editorVisible: Boolean(document.querySelector(".session-editor")),
  }));
  if (errors.length > 0) {
    throw new Error(`${viewport.name} console errors: ${errors.join(" | ")}`);
  }
  if (statsMetrics.documentWidth > statsMetrics.viewport[0]) {
    throw new Error(`${viewport.name} stats page overflows horizontally`);
  }
  if (detailMetrics.documentWidth > viewport.width) {
    throw new Error(`${viewport.name} detail page overflows horizontally`);
  }
  if (statsMetrics.days !== 84) {
    throw new Error(`${viewport.name} heatmap does not contain 84 days`);
  }
  console.log(viewport.name, JSON.stringify({ statsMetrics, detailMetrics }));
  await page.close();
}

await browser.close();
console.log(`C6 screenshots saved to ${outputRoot}`);
