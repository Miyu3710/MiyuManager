import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";
const output = path.resolve("outputs", "app", "ui-states");
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-crash-reporter"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const layout = {};
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

async function ready(selector) {
  await page.waitForSelector(selector);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(220);
}

async function shot(name) {
  await page.screenshot({ path: path.join(output, name + ".png"), animations: "disabled" });
}

async function measure(name, selector) {
  const result = await page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          bottom: Math.round(rect.bottom),
          right: Math.round(rect.right),
        },
        viewport: [window.innerWidth, window.innerHeight],
        overflowY: style.overflowY,
        client: [element.clientWidth, element.clientHeight],
        scroll: [element.scrollWidth, element.scrollHeight],
      };
    });
  layout[name] = result;
}

async function go(hash, selector) {
  await page.goto(`${baseUrl}/#${hash}`, { waitUntil: "networkidle" });
  await ready(selector);
}

await go("/", ".home-page");
await page.getByRole("button", { name: "打开全局搜索" }).click();
await page.waitForSelector(".global-search");
await measure("global-search", ".global-search");
await shot("01-global-search");
await page.keyboard.press("Escape");

await go("/library", ".library-page");
await shot("02-library-grid");
await page.getByRole("button", { name: "列表视图" }).click();
await page.waitForTimeout(220);
await shot("03-library-list");
await page.getByRole("button", { name: /排序方式/ }).click();
await page.waitForSelector(".library-sort-menu");
await shot("04-library-sort");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "封面视图" }).click();
await page.getByRole("button", { name: "多选" }).click();
await page.waitForSelector(".library-batch-bar");
await page.getByRole("button", { name: "全选", exact: true }).click();
await shot("05-library-selection");
await page.getByRole("button", { name: "批量刮削" }).click();
await page.waitForSelector(".batch-dialog");
await measure("batch-dialog", ".batch-dialog");
await shot("06-batch-dialog");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
if (await page.locator(".batch-dialog").count()) {
  const close = page.locator('.batch-dialog button[aria-label="关闭"]');
  if (await close.count()) await close.first().click();
}
await go("/library", ".library-page");
await page.getByRole("button", { name: "扫描 Steam 库" }).click();
await page.waitForSelector(".steam-dialog");
await page.waitForTimeout(600);
await measure("steam-dialog", ".steam-dialog");
await shot("07-steam-dialog");

await go("/settings", ".settings-page");
await page.getByRole("button", { name: /管理排除项/ }).click();
await page.waitForSelector(".scan-exclusions-dialog");
await measure("scan-exclusions-dialog", ".scan-exclusions-dialog");
await shot("08-scan-exclusions");

await go("/work/moonlit-atelier", ".detail-page");
await page.locator(".detail-edit-button").click();
await page.waitForSelector(".detail-edit-dialog");
await measure("detail-edit-dialog", ".detail-edit-dialog");
await shot("09-work-edit");
await page.keyboard.press("Escape");

await go("/collections", ".collections-page");
await page.getByRole("button", { name: /新建收藏集/ }).click();
await page.waitForSelector(".collection-dialog");
await measure("collection-create", ".collection-dialog");
await shot("10-collection-create");
await page.keyboard.press("Escape");
await page.locator(".collection-card__main").first().click();
await ready(".collection-works, .collections-page .ds-empty");
await shot("11-collection-detail");
await page.getByRole("button", { name: "添加作品" }).click();
await page.waitForSelector(".collection-dialog--wide");
await measure("collection-add-works", ".collection-dialog--wide");
await shot("12-collection-add-works");

await page.keyboard.press("Escape");
await go("/onboarding", ".onboarding-welcome");
await page.getByRole("button", { name: "开始设置" }).click();
await page.waitForSelector(".onboarding-directory");
await shot("13-onboarding-directory");

await page.reload({ waitUntil: "networkidle" });
await ready(".onboarding-welcome");
await page.getByRole("button", { name: "开始设置" }).click();
await page.waitForSelector(".onboarding-directory");
await page.getByRole("button", { name: /选择目录并扫描/ }).click();
await page.waitForSelector("button:has-text('确认并导入')", { timeout: 6000 });
await shot("14-onboarding-review");
await page.locator("button:has-text('确认并导入')").click();
await page.waitForSelector("h1:has-text('选择要启用的来源')", { timeout: 5000 });
await shot("15-onboarding-sources");

await go("/", ".home-page");
await page.locator(".home-board").scrollIntoViewIfNeeded();
await page.waitForTimeout(180);
await shot("16-home-sections");

await go("/stats", ".stats-page");
await page.locator(".stats-calendar").scrollIntoViewIfNeeded();
await page.waitForTimeout(180);
await shot("17-stats-calendar");
await page.locator(".stats-history").scrollIntoViewIfNeeded();
await page.waitForTimeout(180);
await shot("18-stats-history");

await go("/settings", ".settings-page");
await page.locator("#launcher-settings").scrollIntoViewIfNeeded();
await page.waitForTimeout(180);
await shot("19-settings-launcher");
await page.locator("#data-settings").scrollIntoViewIfNeeded();
await page.waitForTimeout(180);
await shot("20-settings-data");

await go("/work/moonlit-atelier", ".detail-page");
await page.locator(".detail-tabs").scrollIntoViewIfNeeded();
await page.waitForTimeout(180);
await shot("21-detail-lower");

console.log(JSON.stringify({ output, errors, layout, files: await fs.readdir(output) }, null, 2));
await browser.close();
