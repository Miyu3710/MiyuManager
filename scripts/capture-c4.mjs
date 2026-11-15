import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:1420";
const outputRoot = path.resolve("outputs", "app", "c4");
const viewports = [
  { name: "1440x900", width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: "1920x1080", width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: "150pct-1280x720", width: 1280, height: 720, deviceScaleFactor: 1.5 },
  { name: "4k", width: 3840, height: 2160, deviceScaleFactor: 1, limited: true },
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

  await page.goto(baseUrl + "/#/work/moonlit-atelier?tab=sources", {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".metadata-panel");
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.dataset.capture = "true";
  });
  await page.locator(".metadata-heading").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({
    path: path.join(directory, "01-sources-empty.png"),
    animations: "disabled",
  });

  if (!viewport.limited) {
    await page.getByLabel("元数据搜索词").fill("月影");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await page.waitForSelector(".metadata-candidate", { timeout: 5000 });
    await page.locator(".metadata-workbench").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(directory, "02-search-results.png"),
      animations: "disabled",
    });

    await page.locator(".metadata-candidate").first().click();
    await page.waitForSelector(".metadata-preview-row", { timeout: 5000 });
    await page.locator(".metadata-preview").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(directory, "03-preview.png"),
      animations: "disabled",
    });

    await page.getByRole("button", { name: /导入 \d+ 个字段/ }).click();
    await page.waitForTimeout(500);
    await page.locator(".metadata-ledger").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(directory, "04-imported.png"),
      animations: "disabled",
    });

    await page.locator(".metadata-lock-button").nth(3).click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(directory, "04b-locked.png"),
      animations: "disabled",
    });
  }

  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const panel = document.querySelector(".metadata-panel");
    return {
      viewport: [window.innerWidth, window.innerHeight],
      documentWidth: root.scrollWidth,
      panelWidth: panel?.scrollWidth ?? null,
      candidates: document.querySelectorAll(".metadata-candidate").length,
      claimRows: document.querySelectorAll(".metadata-ledger__row").length,
    };
  });
  await page.close();

  if (!viewport.limited) {
    const settingsPage = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
    });
    await settingsPage.goto(baseUrl + "/#/settings", { waitUntil: "networkidle" });
    await settingsPage.waitForSelector("#source-settings");
    await settingsPage.locator("#source-settings").scrollIntoViewIfNeeded();
    await settingsPage.waitForTimeout(250);
    await settingsPage.screenshot({
      path: path.join(directory, "05-settings-priority.png"),
      animations: "disabled",
    });
    await settingsPage.locator(".settings-oauth").scrollIntoViewIfNeeded();
    await settingsPage.waitForTimeout(250);
    await settingsPage.screenshot({
      path: path.join(directory, "06-oauth-accounts.png"),
      animations: "disabled",
    });
    await settingsPage.close();
  }

  console.log(viewport.name, JSON.stringify({ ...metrics, errors }));
}

await browser.close();
console.log(`C4 screenshots saved to ${outputRoot}`);
