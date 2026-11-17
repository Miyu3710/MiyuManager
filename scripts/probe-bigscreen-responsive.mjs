import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";
const output = path.resolve("outputs", "redesign-bigscreen", "2026-11-16", "screens", "responsive");
const viewports = [
  { name: "1120x720", width: 1120, height: 720 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "4k", width: 3840, height: 2160 },
];
const longDescription =
  "白己津川市。除了是学园都市之外没有任何特色的城市。刚升入新年段不久，主人公的身边迎来了变化。由于大地震，供奉在白蛇九十九神社的神器遭到破损，从平行世界流入了赋予所有者特殊能力的装置。为了修复神社与神器，也为了守住与重要之人的约定，新的故事在春日里缓慢展开。".repeat(
    4,
  );

await fs.mkdir(output, { recursive: true });
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
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  });
  await page.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
  await page.waitForSelector(".bigscreen-hero");
  await page.waitForTimeout(650);
  await page.evaluate(
    ({ title, description }) => {
      const heading = document.querySelector(".bigscreen-hero h1");
      const desc = document.querySelector(".bigscreen-hero__desc");
      if (heading) heading.textContent = title;
      if (desc) desc.textContent = description;
    },
    { title: "9-nine-春色春恋春熙风", description: longDescription },
  );
  await page.locator(".bigscreen-card.is-selected").click();
  await page.waitForTimeout(360);
  await page.evaluate((description) => {
    const desc = document.querySelector(".bigscreen-hero__desc");
    if (desc) desc.textContent = description;
  }, longDescription);

  const metrics = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      return element ? element.getBoundingClientRect() : null;
    };
    const title = box(".bigscreen-hero h1");
    const titleElement = document.querySelector(".bigscreen-hero h1");
    const titleCss = getComputedStyle(titleElement);
    const desc = box(".bigscreen-hero__desc");
    const descElement = document.querySelector(".bigscreen-hero__desc");
    const descCss = getComputedStyle(descElement);
    const launch = box('[data-bigscreen-focus="hero-launch"]');
    const copy = box(".bigscreen-hero__copy");
    const cardFocus = document.querySelector(".bigscreen-card:focus");
    const selected = document.querySelector(".bigscreen-card.is-selected .cover-art");
    return {
      titleLines: titleElement
        ? Math.round(titleElement.offsetHeight / Number.parseFloat(titleCss.lineHeight))
        : null,
      titleFont: titleCss.fontSize,
      descLines: descElement
        ? Math.round(descElement.offsetHeight / Number.parseFloat(descCss.lineHeight))
        : null,
      descBottom: desc ? Math.round(desc.bottom) : null,
      launchTop: launch ? Math.round(launch.top) : null,
      launchBottom: launch ? Math.round(launch.bottom) : null,
      copyBottom: copy ? Math.round(copy.bottom) : null,
      gap: desc && launch ? Math.round(launch.top - desc.bottom) : null,
      focusedCardOutline: cardFocus ? getComputedStyle(cardFocus).outlineStyle : null,
      selectedOutline: selected ? getComputedStyle(selected).outlineStyle : null,
    };
  });
  report[viewport.name] = metrics;
  console.log(viewport.name, metrics);
  await page.screenshot({
    path: path.join(output, viewport.name + ".png"),
    animations: "disabled",
  });
  await page.close();
}

await browser.close();
await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
for (const [name, metrics] of Object.entries(report)) {
  if (metrics.titleLines > 2) {
    throw new Error(name + " long title exceeds the two-line clamp: " + metrics.titleLines);
  }
  if (metrics.gap === null || metrics.gap < 8) {
    throw new Error(name + " launch action crowds the description; gap=" + metrics.gap);
  }
  if (metrics.launchBottom > metrics.copyBottom) {
    throw new Error(name + " launch action escapes the copy area");
  }
  if (metrics.focusedCardOutline && metrics.focusedCardOutline !== "none") {
    throw new Error(name + " focused card still has an outline");
  }
  if (metrics.selectedOutline && metrics.selectedOutline !== "none") {
    throw new Error(name + " selected card still has an outline");
  }
}
console.log("responsive screens: " + output);
