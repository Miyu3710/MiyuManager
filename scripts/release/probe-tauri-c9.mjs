import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const outputDir = path.resolve("outputs", "app", "c9");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const pages = browser.contexts().flatMap((context) => context.pages());
const page = pages.find((candidate) => candidate.url().includes("tauri.localhost"));
if (!page) {
  throw new Error("Tauri WebView page not found");
}

const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

const invoke = (command, args = {}) =>
  page.evaluate(
    ([name, payload]) => window.__TAURI_INTERNALS__.invoke(name, payload),
    [command, args],
  );

await page.waitForSelector(".app-boot, .onboarding-panel, .app-window");
await invoke("onboarding_complete");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".app-window");
await page.evaluate(() => {
  window.location.hash = "#/settings";
});
await page.waitForSelector(".settings-page");
await page.locator("#data-settings").scrollIntoViewIfNeeded();
await page.waitForTimeout(500);

const cspMeta = await page.evaluate(
  () => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null,
);
const cspHeader = await page.evaluate(async () => {
  const response = await fetch(window.location.href);
  return response.headers.get("content-security-policy");
});
const csp = cspMeta ?? cspHeader;
const appInfo = await invoke("app_info");
const before = await invoke("database_health");
const backup = await invoke("database_backup_default");
const after = await invoke("database_health");

await page.evaluate(() => {
  window.location.hash = "#/";
});
await page.waitForSelector(".home-page");
await page.evaluate(() => {
  window.location.hash = "#/settings";
});
await page.waitForSelector(".settings-page");
await page.locator("#data-settings").scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outputDir, "tauri-database-health.png") });

const metrics = await page.evaluate(() => ({
  documentWidth: document.documentElement.scrollWidth,
  viewportWidth: document.documentElement.clientWidth,
  dataText: document.querySelector("#data-settings")?.textContent ?? "",
}));

const result = {
  csp,
  appInfo,
  before,
  backup,
  after,
  metrics,
  errors,
};
await fs.writeFile(path.join(outputDir, "tauri-c9-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (errors.length > 0) throw new Error(errors.join(" | "));
if (!csp?.includes("default-src 'self'")) throw new Error("production CSP was not injected");
if (csp.includes("unsafe-eval")) throw new Error("production CSP allows unsafe-eval");
if (!backup.path || backup.sizeBytes <= 0) throw new Error("database backup was not created");
if (after.backupCount <= before.backupCount) throw new Error("backup count did not increase");
if (metrics.documentWidth > metrics.viewportWidth + 1) throw new Error("settings page overflowed");
if (!metrics.dataText.includes("完整性通过")) throw new Error("database health was not rendered");
