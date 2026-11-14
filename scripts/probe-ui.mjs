import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-crash-reporter"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const output = path.resolve("outputs", "app", "probes");
await fs.mkdir(output, { recursive: true });

await page.goto("http://localhost:1420/#/library", { waitUntil: "networkidle" });
const tabWalk = [];
for (let index = 0; index < 8; index += 1) {
  await page.keyboard.press("Tab");
  tabWalk.push(
    await page.evaluate(() => {
      const element = document.activeElement;
      return {
        tag: element?.tagName,
        label: element?.getAttribute("aria-label"),
        text: element?.textContent?.trim().slice(0, 40),
        outline: element ? getComputedStyle(element).outlineStyle : null,
      };
    }),
  );
}
await page.screenshot({ path: path.join(output, "keyboard-focus.png"), animations: "disabled" });

await page.goto("http://localhost:1420/#/settings", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "紧凑", exact: true }).click();
const density = await page.evaluate(() => document.documentElement.dataset.density);
await page.locator(".settings-switch").click();
const reduceMotion = await page.evaluate(() => document.documentElement.dataset.reduceMotion);

await page.emulateMedia({ reducedMotion: "reduce" });
await page.goto("http://localhost:1420/#/", { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(output, "reduced-motion.png"), animations: "disabled" });
const reducedStyle = await page.evaluate(() => {
  const element = document.querySelector(".home-recent__card");
  return element ? getComputedStyle(element).transitionDuration : null;
});

await page.goto("http://localhost:1420/#/big-screen", { waitUntil: "networkidle" });
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
const bigScreenFocus = await page.evaluate(() => ({
  card: document.activeElement?.getAttribute("data-bigscreen-card"),
  outline: document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : null,
}));

console.log(
  JSON.stringify(
    {
      tabWalk,
      density,
      reduceMotion,
      reducedStyle,
      bigScreenFocus,
    },
    null,
    2,
  ),
);

await browser.close();
