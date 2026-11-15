import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";
const outputRoot = path.resolve("outputs", "app", "c8", "probes");
await fs.mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-crash-reporter"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(baseUrl + "/#/", { waitUntil: "networkidle" });
await page.waitForSelector(".home-page");
await page.keyboard.press("Tab");
const skipLink = await page.evaluate(() => ({
  text: document.activeElement?.textContent?.trim() ?? null,
  className: document.activeElement?.className ?? null,
}));
await page.screenshot({ path: path.join(outputRoot, "01-skip-link.png"), animations: "disabled" });

await page.keyboard.press("Control+K");
await page.waitForSelector(".global-search");
const searchFocus = await page.evaluate(() => document.activeElement?.getAttribute("role"));
await page.keyboard.type("月影");
await page.waitForTimeout(220);
await page.keyboard.press("ArrowDown");
const selectedOption = await page.evaluate(
  () => document.querySelector(".global-search__item[data-active='true'] b")?.textContent ?? null,
);
await page.screenshot({
  path: path.join(outputRoot, "02-search-keyboard.png"),
  animations: "disabled",
});
await page.keyboard.press("Escape");
await page.waitForTimeout(180);
const searchClosed = await page.evaluate(() => ({
  open: Boolean(document.querySelector(".global-search")),
  focusLabel: document.activeElement?.getAttribute("aria-label") ?? null,
}));

await page.goto(baseUrl + "/#/collections", { waitUntil: "networkidle" });
await page.waitForSelector(".collections-page");
await page
  .getByRole("button", { name: /新建收藏集/ })
  .first()
  .click();
const dialogFocus = await page.evaluate(() => ({
  label: document.activeElement?.getAttribute("aria-label") ?? null,
  placeholder: document.activeElement?.getAttribute("placeholder") ?? null,
}));
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
const dialogClosed = await page.evaluate(() => !document.querySelector("[role='dialog']"));

await page.goto(baseUrl + "/#/settings", { waitUntil: "networkidle" });
await page.waitForSelector(".settings-page");
await page.getByRole("button", { name: "网络", exact: true }).click();
await page.waitForTimeout(700);
const networkVisible = await page.evaluate(() => {
  const section = document.querySelector("#network-settings");
  if (!section) return false;
  const rect = section.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0;
});
await page.screenshot({
  path: path.join(outputRoot, "03-network-focus.png"),
  animations: "disabled",
});

await page.getByRole("button", { name: "外观", exact: true }).click();
await page.waitForTimeout(600);
await page.locator("#appearance-settings .settings-switch").click();
await page.goto(baseUrl + "/#/", { waitUntil: "networkidle" });
await page.waitForSelector(".home-page");
const reducedMotion = await page.evaluate(() => document.documentElement.dataset.reduceMotion);
await page.screenshot({
  path: path.join(outputRoot, "04-reduced-motion.png"),
  animations: "disabled",
});

const result = {
  skipLink,
  search: { focus: searchFocus, selectedOption, closed: searchClosed },
  collections: { dialogFocus, dialogClosed },
  settings: { networkVisible },
  reducedMotion,
  errors,
};
console.log(JSON.stringify(result, null, 2));
await fs.writeFile(path.join(outputRoot, "a11y-result.json"), JSON.stringify(result, null, 2));
await browser.close();

if (errors.length > 0) {
  throw new Error(errors.join(" | "));
}
if (skipLink.text !== "跳到主要内容") {
  throw new Error("skip link is not the first Tab target");
}
if (searchFocus !== "combobox" || !selectedOption) {
  throw new Error("global search keyboard path failed");
}
if (searchClosed.open || searchClosed.focusLabel !== "打开全局搜索") {
  throw new Error("global search did not return focus to its trigger");
}
if (!dialogFocus.placeholder || !dialogClosed) {
  throw new Error("collection dialog focus path failed");
}
if (!networkVisible || reducedMotion !== "true") {
  throw new Error("settings or reduced motion probe failed");
}
