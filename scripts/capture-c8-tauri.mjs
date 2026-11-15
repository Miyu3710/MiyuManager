import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const outputDir = path.resolve("outputs", "app", "c8");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.connectOverCDP("http://localhost:9222");
const pages = browser.contexts().flatMap((context) => context.pages());
const page = pages.find((candidate) => candidate.url().includes("localhost:1420"));
if (!page) {
  throw new Error("Tauri WebView page not found");
}

const invoke = (command, args = {}) =>
  page.evaluate(
    ([name, payload]) => window.__TAURI_INTERNALS__.invoke(name, payload),
    [command, args],
  );

const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.waitForSelector(".app-window");
const appInfo = await invoke("app_info");
const preferences = await invoke("preferences_get");
const collections = await invoke("collections_list");

await page.evaluate(() => {
  window.location.hash = "#/collections";
});
await page.waitForSelector(".collections-page");
await page.waitForSelector(".collection-card");
await page.screenshot({
  path: path.join(outputDir, "tauri-collections.png"),
  animations: "disabled",
});

await page.evaluate(() => {
  window.location.hash = "#/collections/1";
});
await page.waitForSelector(".collection-works");
const collectionWorks = await page.locator(".collection-work").count();
await page.screenshot({
  path: path.join(outputDir, "tauri-collection-detail.png"),
  animations: "disabled",
});

await page.evaluate(() => {
  window.location.hash = "#/settings";
});
await page.waitForSelector(".settings-page");
await page.locator("#network-settings").scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outputDir, "tauri-settings.png"), animations: "disabled" });

await page.evaluate(() => {
  window.location.hash = "#/";
});
await page.waitForSelector(".home-page");
await page.screenshot({ path: path.join(outputDir, "tauri-home.png"), animations: "disabled" });
await page.keyboard.press("Control+K");
await page.waitForSelector(".global-search");
await page.getByRole("combobox", { name: "全局搜索" }).fill("月影");
await page.waitForTimeout(220);
await page.screenshot({ path: path.join(outputDir, "tauri-search.png"), animations: "disabled" });
await page.keyboard.press("Escape");

await page.evaluate(() => {
  window.location.hash = "#/onboarding";
});
await page.waitForSelector(".onboarding-panel");
await page.screenshot({
  path: path.join(outputDir, "tauri-onboarding.png"),
  animations: "disabled",
});

const result = {
  appInfo,
  preferences,
  collections: collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    workCount: collection.workCount,
    covers: collection.covers.length,
  })),
  collectionWorks,
  errors,
};
await fs.writeFile(path.join(outputDir, "tauri-c8-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length > 0) throw new Error(errors.join(" | "));
if (!appInfo.onboardingCompleted) throw new Error("onboarding not completed");
if (!collections.some((collection) => collection.name === "深夜推荐")) {
  throw new Error("collection was not persisted");
}
if (collectionWorks < 2) throw new Error("collection membership was not persisted");
