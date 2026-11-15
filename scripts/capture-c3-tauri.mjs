import fs from "node:fs/promises";
import { chromium } from "playwright-core";

const outputDir = "outputs/app/c3";
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

await page.waitForSelector(".app-window");
let detail = (await invoke("library_get", { workId: 1 })) ?? null;
if (!detail) {
  const gameDir = "D:\\Projects\\MiyuManager\\tmp\\c3-fixture\\月影工房 完全版";
  await invoke("library_import_candidates", {
    candidates: [
      {
        exePath: gameDir + "\\game_zh.exe",
        workingDir: gameDir,
        displayName: "月影工房 完全版",
        rootPath: "D:\\Projects\\MiyuManager\\tmp\\c3-fixture",
        sizeBytes: 536870912,
      },
    ],
  });
  detail = await invoke("library_get", { workId: 1 });
}

if (!detail.coverPath) {
  await invoke("work_apply_local_cover", {
    workId: detail.workId,
    sourcePath: "D:\\Projects\\MiyuManager\\tmp\\c3-fixture\\月影工房 完全版\\cover.png",
  });
  detail = await invoke("library_get", { workId: detail.workId });
}

await page.evaluate(() => {
  window.location.hash = "#/work/1";
});
await page.waitForSelector(".detail-page");
await page.waitForSelector(".cover-art--image img");
await page.waitForFunction(() => {
  const image = document.querySelector(".cover-art--image img");
  return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
});
await page.waitForTimeout(4300);
await page.screenshot({ path: `${outputDir}/01-detail-cover.png` });

await page.getByRole("tab", { name: "启动配置" }).click();
await page.waitForSelector(".detail-launch-form");
await page
  .locator(".detail-tabs")
  .evaluate((element) => element.scrollIntoView({ block: "start" }));
await page.screenshot({ path: `${outputDir}/02-detail-launch.png` });

await page.getByRole("tab", { name: "概览" }).click();
await page.getByRole("button", { name: "编辑资料" }).first().click();
await page.waitForSelector(".detail-edit-dialog");
await page.screenshot({ path: `${outputDir}/03-detail-edit.png` });
await page.keyboard.press("Escape");
await page.waitForSelector(".detail-edit-dialog", { state: "detached" });

await page.evaluate(() => {
  document.querySelector(".app-page")?.scrollTo({ top: 0 });
});
await page.getByRole("button", { name: "启动游戏" }).click();
await page.waitForSelector(".detail-launch-status.is-running");
await page.screenshot({ path: `${outputDir}/04-launch-running.png` });
const launchState = await invoke("launch_state", { workId: detail.workId });
await page.waitForFunction(() => document.body.innerText.includes("已退出"), null, {
  timeout: 15000,
});
await page.waitForTimeout(4300);
await page.screenshot({ path: `${outputDir}/05-launch-exited.png` });

await page.evaluate(() => {
  window.location.hash = "#/library";
});
await page.waitForSelector(".library-card");
await page.waitForSelector(".library-card .cover-art--image img");
await page.waitForFunction(() => {
  const image = document.querySelector(".library-card .cover-art--image img");
  return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
});
await page.screenshot({ path: `${outputDir}/06-library-thumbnail.png` });

await page.evaluate(() => {
  window.location.hash = "#/work/1?tab=launch";
});
await page.waitForSelector(".detail-launch-form");
const launchSection = page.locator(".detail-launch-section").first();
await page.getByLabel("可执行文件").fill("D:\\missing\\game.exe");
await launchSection.getByRole("button", { name: "校验路径" }).click();
await page.waitForFunction(() => document.body.innerText.includes("可执行文件不存在"));
await page.locator(".detail-validation").scrollIntoViewIfNeeded();
await page.screenshot({ path: `${outputDir}/07-invalid-path.png` });

const info = await invoke("app_info");
const library = await invoke("library_query", {
  query: { search: "", status: "all", sort: "last_played_desc", page: 0, pageSize: 10 },
});
const log = JSON.stringify(
  {
    info,
    launchState,
    detail: await invoke("library_get", { workId: detail.workId }),
    library,
  },
  null,
  2,
);
await fs.writeFile(`${outputDir}/probe.log`, log);
console.log(log);

await browser.close();
