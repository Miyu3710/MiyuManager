import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:1420";
const outputRoot = path.resolve("outputs", "app", "c2");
const width = Number(process.env.PROBE_WIDTH ?? 1440);
const height = Number(process.env.PROBE_HEIGHT ?? 900);
const suffix = process.env.PROBE_SUFFIX ?? "";
await fs.mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-crash-reporter"],
});
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push(message.text());
  }
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(baseUrl + "/#/library", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "添加目录", exact: true }).first().click();
await page.waitForSelector(".scan-dialog");
await page.waitForTimeout(260);
await page.screenshot({ path: path.join(outputRoot, "00-scan-progress" + suffix + ".png") });
await page.waitForSelector(".scan-candidate", { timeout: 5000 });
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outputRoot, "01-scan-review" + suffix + ".png") });

const dialogMetrics = await page.evaluate(() => {
  const dialog = document.querySelector(".scan-dialog");
  const body = document.querySelector(".scan-dialog__body");
  return {
    viewport: [window.innerWidth, window.innerHeight],
    dialog: dialog?.getBoundingClientRect().toJSON() ?? null,
    body: body
      ? {
          clientHeight: body.clientHeight,
          scrollHeight: body.scrollHeight,
        }
      : null,
  };
});

await page.getByRole("button", { name: /导入选中/ }).click();
await page.waitForSelector(".scan-dialog", { state: "detached", timeout: 5000 });
await page.waitForTimeout(350);
await page.screenshot({
  path: path.join(outputRoot, "02-library-after-import" + suffix + ".png"),
});

const libraryMetrics = await page.evaluate(() => {
  const scroller = document.querySelector(".library-scroll");
  const footer = document.querySelector(".library-foot");
  return {
    scroller: scroller
      ? {
          clientWidth: scroller.clientWidth,
          scrollWidth: scroller.scrollWidth,
          clientHeight: scroller.clientHeight,
          scrollHeight: scroller.scrollHeight,
        }
      : null,
    footer: footer?.textContent?.trim() ?? null,
  };
});

console.log(JSON.stringify({ dialogMetrics, libraryMetrics, errors }, null, 2));
await browser.close();
