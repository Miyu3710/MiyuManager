import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";
const output = path.resolve("outputs", "redesign-bigscreen", "2026-11-16", "screens", "layout");

await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-crash-reporter"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
await page.waitForSelector(".bigscreen-hero");
await page.waitForTimeout(700);

const styles = await page.evaluate(() => {
  const pick = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const css = getComputedStyle(element);
    return {
      outline: css.outline,
      boxShadow: css.boxShadow,
      opacity: css.opacity,
      transform: css.transform,
    };
  };
  return {
    poster: pick(".bigscreen-backdrop__print"),
    selectedCover: pick(".bigscreen-card.is-selected .cover-art"),
    print: pick(".bigscreen-backdrop__print"),
    leftScrim: getComputedStyle(document.querySelector(".bigscreen-scrim")).backgroundImage,
  };
});
console.log("styles", JSON.stringify(styles, null, 2));
await page.screenshot({ path: path.join(output, "01-clean.png"), animations: "disabled" });

const titleMetrics = await page.evaluate(() => {
  const title = document.querySelector(".bigscreen-hero h1");
  const copy = document.querySelector(".bigscreen-hero__copy");
  const desc = document.querySelector(".bigscreen-hero__desc");
  if (!title || !copy || !desc) return null;
  title.textContent = "9-nine-春色春恋春熙风";
  title.className = "is-long";
  desc.textContent =
    "白己津川市。除了是学园都市之外没有任何特色的城市。刚升入新年段不久，主人公的身边迎来了变化。由于大地震，供奉在白蛇九十九神社的神器遭到破损，从平行世界流入了赋予所有者特殊能力的装置。为了修复神社与神器，也为了守住与重要之人的约定，新的故事在春日里缓慢展开。";
  const titleStyle = getComputedStyle(title);
  const titleRect = title.getBoundingClientRect();
  const copyRect = copy.getBoundingClientRect();
  return {
    titleFont: Number.parseFloat(titleStyle.fontSize),
    titleLineHeight: Number.parseFloat(titleStyle.lineHeight),
    titleLines: Math.round(titleRect.height / Number.parseFloat(titleStyle.lineHeight)),
    titleWidth: Math.round(titleRect.width),
    copyWidth: Math.round(copyRect.width),
    titleRight: Math.round(titleRect.right),
    copyRight: Math.round(copyRect.right),
  };
});
console.log("long title", titleMetrics);
console.log(
  "title widths",
  await page.evaluate(() => {
    const title = document.querySelector(".bigscreen-hero h1");
    if (!title) return null;
    const range = document.createRange();
    const widths = {};
    for (const size of [56, 64, 72, 80, 88, 96]) {
      title.style.fontSize = size + "px";
      range.selectNodeContents(title);
      widths[size] = Math.round(range.getBoundingClientRect().width);
    }
    title.style.fontSize = "";
    return widths;
  }),
);
await page.screenshot({ path: path.join(output, "02-long-title.png"), animations: "disabled" });

await page.locator(".bigscreen-card.is-selected").click();
await page.waitForTimeout(320);
await page.evaluate(() => {
  const title = document.querySelector(".bigscreen-hero h1");
  const desc = document.querySelector(".bigscreen-hero__desc");
  if (title) {
    title.textContent = "9-nine-春色春恋春熙风";
    title.className = "is-long";
  }
  if (desc) {
    desc.textContent =
      "白己津川市。除了是学园都市之外没有任何特色的城市。刚升入新年段不久，主人公的身边迎来了变化。由于大地震，供奉在白蛇九十九神社的神器遭到破损，从平行世界流入了赋予所有者特殊能力的装置。为了修复神社与神器，也为了守住与重要之人的约定，新的故事在春日里缓慢展开。";
  }
});
const button = page.locator('[data-bigscreen-focus="hero-launch"]');
const before = await button.boundingBox();
const buttonMetrics = await page.evaluate(() => {
  const launch = document.querySelector('[data-bigscreen-focus="hero-launch"]');
  const desc = document.querySelector(".bigscreen-hero__desc");
  const copy = document.querySelector(".bigscreen-hero__copy");
  if (!launch || !desc || !copy) return null;
  const rect = launch.getBoundingClientRect();
  const copyRect = copy.getBoundingClientRect();
  return {
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    height: Math.round(rect.height),
    copyBottom: Math.round(copyRect.bottom),
    descBottom: Math.round(desc.getBoundingClientRect().bottom),
    gap: Math.round(rect.top - desc.getBoundingClientRect().bottom),
  };
});
await page.screenshot({ path: path.join(output, "03-long-launch.png"), animations: "disabled" });
console.log("launch", before, buttonMetrics);

await page.keyboard.press("Escape");
await page.waitForTimeout(320);
for (let index = 0; index < 7; index += 1) {
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(80);
}
await page.waitForTimeout(500);
console.log(
  "bright selected",
  await page.evaluate(() => ({
    title: document.querySelector(".bigscreen-hero h1")?.textContent,
    active: document.activeElement?.getAttribute("data-bigscreen-focus"),
    accent: getComputedStyle(document.querySelector(".bigscreen-root"))
      .getPropertyValue("--bs-image-accent")
      .trim(),
  })),
);
await page.screenshot({
  path: path.join(output, "04-bright-backdrop.png"),
  animations: "disabled",
});

await browser.close();
console.log("layout screens: " + output);
