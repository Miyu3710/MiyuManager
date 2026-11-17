import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1422";
const outputRoot = path.resolve("outputs", "redesign-bigscreen", "2026-11-16", "settings");

await fs.mkdir(outputRoot, { recursive: true });

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

const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

async function openSettings() {
  await page.goto(baseUrl + "/#/settings", { waitUntil: "networkidle" });
  await page.waitForSelector("#bigscreen-settings");
  await page.evaluate(async () => document.fonts.ready);
  await page.locator("#bigscreen-settings").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
}

const toggle = () => page.locator('button[aria-label="大屏按键提示"]');

async function readToggle() {
  return {
    pressed: await toggle().getAttribute("aria-pressed"),
    label: (await page.locator("#bigscreen-settings").innerText()).replace(/\s+/g, " "),
    stored: await page.evaluate(() => {
      const raw = window.localStorage.getItem("miyu-appearance");
      if (!raw) return null;
      try {
        return JSON.parse(raw).state?.bigScreenHints ?? null;
      } catch {
        return null;
      }
    }),
  };
}

async function readBigScreenHint() {
  await page.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
  await page.waitForSelector(".bigscreen-hero");
  return page.evaluate(() => document.querySelectorAll(".bigscreen-hint").length);
}

await openSettings();
const initial = await readToggle();
assert.equal(initial.pressed, "true", "big screen hints should start enabled");
assert.ok(initial.label.includes("按键提示"), "settings row should label the toggle");
await page.locator("#bigscreen-settings").screenshot({
  path: path.join(outputRoot, "settings-hints-on.png"),
  animations: "disabled",
});

await toggle().click();
const switchedOff = await readToggle();
assert.equal(switchedOff.pressed, "false", "toggle should turn the setting off");
assert.equal(switchedOff.stored, false, "setting should persist to localStorage");
assert.equal(await readBigScreenHint(), 0, "bottom hint bar should disappear when the setting is off");

await openSettings();
const afterReload = await readToggle();
assert.equal(afterReload.pressed, "false", "setting should survive a reload");
await page.locator("#bigscreen-settings").screenshot({
  path: path.join(outputRoot, "settings-hints-off.png"),
  animations: "disabled",
});

await toggle().click();
const switchedOn = await readToggle();
assert.equal(switchedOn.pressed, "true", "toggle should turn the setting back on");
assert.equal(switchedOn.stored, true, "enabled setting should persist");
const hintVisible = await readBigScreenHint();
assert.equal(hintVisible, 1, "bottom hint bar should return when the setting is on");

assert.deepEqual(errors, [], "settings probe should not log browser errors");

await fs.writeFile(
  path.join(outputRoot, "report.json"),
  JSON.stringify(
    {
      initial,
      switchedOff,
      afterReload,
      switchedOn,
      hintVisible,
      errors,
    },
    null,
    2,
  ),
);

console.log("settings big-screen hint toggle: ok");
await browser.close();
