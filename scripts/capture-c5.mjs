import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";
const outputRoot = path.resolve("outputs", "app", "c5");
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

  await page.goto(baseUrl + "/#/work/moonlit-atelier?tab=sources", { waitUntil: "networkidle" });
  await page.waitForSelector(".merge-panel");
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.dataset.capture = "true";
  });
  await page.getByRole("button", { name: "开始多源匹配" }).click();
  await page.waitForSelector(".merge-field", { timeout: 8000 });
  await page.waitForTimeout(350);
  await page.locator(".merge-panel").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(directory, "01-merge-preview.png"),
    animations: "disabled",
  });
  await page.locator(".merge-covers").scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    const images = Array.from(document.querySelectorAll(".merge-cover img"));
    await Promise.all(
      images.map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            }),
      ),
    );
  });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(directory, "01b-merge-covers.png"),
    animations: "disabled",
  });
  await page.locator(".metadata-searchbar select").selectOption("steam");
  await page.getByLabel("元数据搜索词").fill("月影工房");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.waitForSelector(".metadata-candidate", { timeout: 8000 });
  await page.locator(".metadata-candidate").first().click();
  await page.waitForSelector(".metadata-cover-option", { timeout: 8000 });
  await page.locator(".metadata-preview").scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await page.screenshot({
    path: path.join(directory, "01c-manual-cover-gallery.png"),
    animations: "disabled",
  });

  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const panel = document.querySelector(".merge-panel");
    return {
      viewport: [window.innerWidth, window.innerHeight],
      documentWidth: root.scrollWidth,
      panelWidth: panel?.scrollWidth ?? null,
      matched: document.querySelectorAll(".merge-source").length,
      fields: document.querySelectorAll(".merge-field").length,
      covers: document.querySelectorAll(".merge-cover").length,
    };
  });

  const settingsPage = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
  });
  settingsPage.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  settingsPage.on("pageerror", (error) => errors.push(error.message));
  await settingsPage.goto(baseUrl + "/#/settings", { waitUntil: "networkidle" });
  await settingsPage.waitForSelector(".settings-field-priorities");
  await settingsPage.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.dataset.capture = "true";
  });
  await settingsPage
    .locator(".settings-field-priorities")
    .evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await settingsPage.waitForTimeout(350);
  await settingsPage.screenshot({
    path: path.join(directory, "02-field-priorities.png"),
    animations: "disabled",
  });
  await settingsPage.getByLabel("全部字段跟随全局来源顺序").click();
  await settingsPage.waitForFunction(() =>
    document.querySelector(".settings-field-priorities")?.classList.contains("is-global"),
  );
  await settingsPage.waitForTimeout(500);
  await settingsPage.screenshot({
    path: path.join(directory, "02b-field-priorities-global.png"),
    animations: "disabled",
  });
  await settingsPage.getByLabel("全部字段跟随全局来源顺序").click();
  await settingsPage.waitForFunction(
    () => !document.querySelector(".settings-field-priorities")?.classList.contains("is-global"),
  );
  await settingsPage.close();

  if (!viewport.limited) {
    const libraryPage = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
    });
    libraryPage.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    libraryPage.on("pageerror", (error) => errors.push(error.message));
    await libraryPage.goto(baseUrl + "/#/library", { waitUntil: "networkidle" });
    await libraryPage.waitForSelector(".library-card");
    await libraryPage.getByRole("button", { name: "批量刮削" }).click();
    await libraryPage.locator(".library-card").nth(0).click();
    await libraryPage.locator(".library-card").nth(1).click();
    await libraryPage.waitForTimeout(250);
    await libraryPage.screenshot({
      path: path.join(directory, "03-library-selection.png"),
      animations: "disabled",
    });
    await libraryPage.getByRole("button", { name: "开始批量刮削" }).click();
    await libraryPage.waitForSelector(".batch-dialog");
    await libraryPage.waitForTimeout(250);
    await libraryPage.screenshot({
      path: path.join(directory, "04-batch-setup.png"),
      animations: "disabled",
    });
    await libraryPage.getByRole("button", { name: "开始匹配" }).click();
    await libraryPage.waitForSelector(".batch-work", { timeout: 15000 });
    await libraryPage.waitForTimeout(400);
    await libraryPage.screenshot({
      path: path.join(directory, "05-batch-review.png"),
      animations: "disabled",
    });
    await libraryPage.close();
  }

  console.log(viewport.name, JSON.stringify({ ...metrics, errors }));
  await page.close();
}

await browser.close();
console.log(`C5 screenshots saved to ${outputRoot}`);
