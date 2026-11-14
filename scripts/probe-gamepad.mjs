import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-crash-reporter"],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:1420/#/settings", { waitUntil: "networkidle" });
const result = await page.evaluate(() => ({
  hasGetGamepads: typeof navigator.getGamepads === "function",
  gamepadCount:
    typeof navigator.getGamepads === "function"
      ? navigator.getGamepads().filter((pad) => pad !== null).length
      : 0,
  userAgent: navigator.userAgent,
}));
console.log(JSON.stringify(result, null, 2));
await browser.close();
