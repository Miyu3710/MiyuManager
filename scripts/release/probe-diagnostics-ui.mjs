import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";
const outputRoot = path.resolve("outputs", "app", "c9", "diagnostics-ui");
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const viewports = [
  { name: "1440x900", width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: "1920x1080", width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: "150pct-1280x720", width: 1280, height: 720, deviceScaleFactor: 1.5 },
  { name: "390x844", width: 390, height: 844, deviceScaleFactor: 1 },
];

await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-crash-reporter"],
});
const report = { viewports: {}, errors: [] };

for (const viewport of viewports) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
  });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl + "/#/settings");
  await page.waitForSelector("#data-settings");
  await page.locator("#data-settings").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);

  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    dataText: document.querySelector("#data-settings")?.textContent ?? "",
    buttons: Array.from(document.querySelectorAll("#data-settings button")).map((button) => ({
      text: button.textContent?.trim(),
      disabled: button.disabled,
    })),
  }));
  await page.screenshot({
    path: path.join(outputRoot, `${viewport.name}.png`),
    animations: "disabled",
  });
  if (metrics.documentWidth > metrics.viewportWidth + 1) {
    errors.push(`horizontal overflow: ${metrics.documentWidth} > ${metrics.viewportWidth}`);
  }
  for (const label of ["备份与恢复", "迁移与本地快照", "诊断日志"]) {
    if (!metrics.dataText.includes(label)) {
      errors.push(`missing data section: ${label}`);
    }
  }
  report.viewports[viewport.name] = { ...metrics, errors };
  report.errors.push(...errors);
  await page.close();
}

await browser.close();
await fs.writeFile(path.join(outputRoot, "result.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.errors.length > 0) {
  throw new Error(report.errors.join(" | "));
}
