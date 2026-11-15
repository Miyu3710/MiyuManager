import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";
const outputRoot = path.resolve("outputs", "app", "c8");
const requested = process.env.CAPTURE_VIEWPORT;
const viewports = [
  { name: "1440x900", width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: "1920x1080", width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: "150pct-1280x720", width: 1280, height: 720, deviceScaleFactor: 1.5 },
  { name: "4k", width: 3840, height: 2160, deviceScaleFactor: 1 },
].filter((viewport) => !requested || viewport.name === requested);

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

  const ready = async (selector) => {
    await page.waitForSelector(selector);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.waitForTimeout(180);
  };
  const shot = async (name) => {
    await page.screenshot({ path: path.join(directory, name + ".png"), animations: "disabled" });
  };
  const scrollTo = async (selector) => {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
  };
  const metrics = await page.evaluate(() => ({}));

  await page.goto(baseUrl + "/#/", { waitUntil: "networkidle" });
  await ready(".home-page");
  await shot("01-home");
  metrics.home = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    hero: Boolean(document.querySelector(".home-hero")),
    sections: [...document.querySelectorAll(".home-section h2, .home-board h2")].map(
      (element) => element.textContent,
    ),
  }));

  await page.keyboard.press("Control+K");
  await page.waitForSelector(".global-search");
  await page.getByRole("combobox", { name: "全局搜索" }).fill("月影");
  await page.waitForTimeout(220);
  await shot("02-global-search");
  metrics.search = await page.evaluate(() => ({
    items: document.querySelectorAll(".global-search__item").length,
    first: document.querySelector(".global-search__item b")?.textContent ?? null,
  }));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);

  await page.goto(baseUrl + "/#/collections", { waitUntil: "networkidle" });
  await ready(".collections-grid");
  await shot("03-collections");
  await page.locator(".collection-card__main").first().click();
  await ready(".collection-works, .collections-page .ds-empty");
  await shot("04-collection-detail");
  metrics.collections = await page.evaluate(() => ({
    cards: document.querySelectorAll(".collection-card").length,
    works: document.querySelectorAll(".collection-work").length,
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));

  await page.goto(baseUrl + "/#/settings", { waitUntil: "networkidle" });
  await ready(".settings-page");
  await scrollTo("#launcher-settings");
  await shot("05-settings-launcher");
  await scrollTo("#network-settings");
  await shot("06-settings-network");
  await scrollTo("#data-settings");
  await shot("07-settings-data");
  metrics.settings = await page.evaluate(() => ({
    launcher: Boolean(document.querySelector(".settings-preference-form")),
    updateCheck: Boolean(document.querySelector("#data-settings")),
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));

  await page.goto(baseUrl + "/#/onboarding", { waitUntil: "networkidle" });
  await ready(".onboarding-welcome");
  await shot("08-onboarding-welcome");
  await page.getByRole("button", { name: /开始设置/ }).click();
  await page.waitForSelector(".onboarding-directory");
  await shot("09-onboarding-directory");
  await page.getByRole("button", { name: /选择目录并扫描/ }).click();
  await page.waitForSelector("button:has-text('确认并导入')", { timeout: 6000 });
  await shot("10-onboarding-review");
  await page.locator("button:has-text('确认并导入')").click();
  await page.waitForSelector("h1:has-text('选择要启用的来源')", { timeout: 5000 });
  await shot("11-onboarding-sources");
  await page.getByRole("button", { name: "稍后设置来源" }).click();
  await page.waitForSelector("h1:has-text('游戏库已经准备好了')", { timeout: 5000 });
  await shot("12-onboarding-done");
  metrics.onboarding = await page.evaluate(() => ({
    done: Boolean(document.querySelector(".onboarding-done")),
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));

  allMetrics[viewport.name] = { ...metrics, errors };
  if (metrics.home.width > metrics.home.viewport) {
    throw new Error(`${viewport.name} home overflows horizontally`);
  }
  if (errors.length > 0) {
    throw new Error(`${viewport.name} console errors: ${errors.join(" | ")}`);
  }
  console.log(viewport.name, JSON.stringify(allMetrics[viewport.name]));
  await page.close();
}

await browser.close();
await fs.writeFile(
  path.join(outputRoot, "capture-result.json"),
  JSON.stringify(allMetrics, null, 2),
);
console.log(JSON.stringify({ outputRoot, allMetrics }, null, 2));
