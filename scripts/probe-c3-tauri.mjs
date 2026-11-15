import fs from "node:fs/promises";
import { chromium } from "playwright-core";

const browser = await chromium.connectOverCDP("http://localhost:9222");
const pages = browser.contexts().flatMap((context) => context.pages());
const pageInfo = [];
for (const page of pages) {
  pageInfo.push({ url: page.url(), title: await page.title() });
}
console.log(pageInfo);
const page = pages.find((candidate) => candidate.url().includes("localhost:1420"));
if (!page) {
  throw new Error("Tauri WebView page not found");
}
await page.waitForSelector(".app-window");
console.log(await page.title());
const info = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("app_info"));
console.log("app info", info);
const importResult = await page.evaluate(async () => {
  const gameDir = "D:\\Projects\\MiyuManager\\tmp\\c3-fixture\\月影工房 完全版";
  return window.__TAURI_INTERNALS__.invoke("library_import_candidates", {
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
});
console.log("import", importResult);
const detail = await page.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("library_get", { workId: 1 }),
);
console.log("detail", JSON.stringify(detail, null, 2));
await page.evaluate(() => {
  window.location.hash = "#/work/1";
});
await page.waitForSelector(".detail-page");
console.log("cover button", await page.getByRole("button", { name: "本地图片" }).count());
await page.getByRole("button", { name: "本地图片" }).click();
await page.waitForSelector(".detail-cover-candidates");
const candidateCount = await page.locator(".detail-cover-candidate").count();
console.log("cover candidates", candidateCount);
if (candidateCount > 0) {
  await page.locator(".detail-cover-candidate").first().click();
  await page.waitForSelector(".cover-art--image img");
  await page.waitForFunction(() => {
    const image = document.querySelector(".cover-art--image img");
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  const imageInfo = await page.locator(".cover-art--image img").evaluate((image) => ({
    src: image.src,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }));
  console.log("cover image", imageInfo);
  await page.screenshot({ path: "tmp/c3-tauri-detail-cover.png" });
}
await page.getByRole("button", { name: "编辑资料" }).first().click();
await page.waitForSelector(".detail-edit-dialog");
await page.getByLabel("原题").fill("月影のアトリエ 完全版");
await page.getByLabel("年份").fill("2024");
await page.getByLabel("开发商").fill("Lunar Atelier");
await page.getByLabel("标签（每行或逗号分隔）").fill("奇幻\n悬疑\n本地测试");
await page.getByLabel("用户备注（手动内容）").fill("C3 实际窗口验证备注");
await page.getByRole("button", { name: "保存资料" }).click();
await page.waitForSelector(".detail-edit-dialog", { state: "detached" });
await page.waitForFunction(() => document.body.innerText.includes("C3 实际窗口验证备注"));
console.log(
  "edited detail",
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("library_get", { workId: 1 })),
);

await page.getByRole("tab", { name: "启动配置" }).click();
await page.waitForSelector(".detail-launch-form");
await page.getByLabel("游戏参数").fill("--window\n--test-cjk 路径");
await page.getByLabel("环境变量（KEY=VALUE，每行一个）").fill("MIYU_C3=1\nLOCALE=zh-CN");
await page.getByRole("button", { name: "保存配置" }).click();
await page.waitForFunction(() => document.body.innerText.includes("启动配置已保存"));
console.log(
  "saved profile",
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("library_get", { workId: 1 })),
);

await page.getByRole("button", { name: "启动游戏" }).click();
await page.waitForSelector(".detail-launch-status.is-running");
const launchState = await page.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("launch_state", { workId: 1 }),
);
console.log("launch state", launchState);
await page.screenshot({ path: "tmp/c3-tauri-launch-running.png" });
await page.waitForFunction(() => document.body.innerText.includes("已退出"), null, {
  timeout: 15000,
});
console.log(
  "after exit",
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("library_get", { workId: 1 })),
);
const launchEvidence = await fs.readFile("tmp/c3-fixture/月影工房 完全版/dummy-launch.txt", "utf8");
console.log("launch evidence", launchEvidence);
if (!launchEvidence.includes("--test-cjk 路径") || !launchEvidence.includes("env=1")) {
  throw new Error("arguments or environment variables were not passed to the game");
}
await page.screenshot({ path: "tmp/c3-tauri-launch-exited.png" });

await page
  .getByLabel("包装器程序（可选）")
  .fill("D:\\Projects\\MiyuManager\\tmp\\c3-fixture\\wrapper.exe");
await page.getByLabel("包装器参数（每行一个）").fill("-runas\nprofile test");
await page.getByRole("button", { name: "保存配置" }).click();
await page.waitForFunction(() => document.body.innerText.includes("启动配置已保存"));
await page.getByRole("button", { name: "启动游戏" }).click();
await page.waitForSelector(".detail-launch-status.is-running");
await page.waitForFunction(() => document.body.innerText.includes("已退出"), null, {
  timeout: 15000,
});
const wrapperEvidence = await fs.readFile(
  "tmp/c3-fixture/月影工房 完全版/wrapper-args.txt",
  "utf8",
);
console.log("wrapper evidence", wrapperEvidence);
if (!wrapperEvidence.includes("-runas") || !wrapperEvidence.includes("game_zh.exe")) {
  throw new Error("wrapper did not receive the configured arguments and game path");
}
await page.getByLabel("包装器程序（可选）").fill("");
await page.getByLabel("包装器参数（每行一个）").fill("");
await page.getByRole("button", { name: "保存配置" }).click();
await page.waitForFunction(() => document.body.innerText.includes("启动配置已保存"));

const finalDetail = await page.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("library_get", { workId: 1 }),
);
for (const relative of [finalDetail.coverPath, finalDetail.coverThumbPath]) {
  if (relative) {
    await fs.unlink("tmp/c3-appdata/assets/" + relative);
  }
}
await page.reload();
await page.waitForSelector(".detail-page");
await page.waitForSelector(".cover-art--fallback");
console.log("cover fallback after deleting cache files");
await page.screenshot({ path: "tmp/c3-tauri-cover-fallback.png" });

await page.getByRole("button", { name: "本地图片" }).click();
await page.waitForSelector(".detail-cover-candidates");
await page.locator(".detail-cover-candidate").first().click();
await page.waitForSelector(".cover-art--image img");
await page.waitForFunction(() => {
  const image = document.querySelector(".cover-art--image img");
  return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
});

await page.getByRole("tab", { name: "启动配置" }).click();
await page.waitForSelector(".detail-launch-form");
const launchSection = page.locator(".detail-launch-section").first();
await page.getByLabel("可执行文件").fill("D:\\missing\\game.exe");
await launchSection.getByRole("button", { name: "校验路径" }).click();
await page.waitForFunction(() => document.body.innerText.includes("可执行文件不存在"));
console.log("invalid executable reported");
await page.screenshot({ path: "tmp/c3-tauri-invalid-exe.png" });
await page.getByLabel("可执行文件").fill(finalDetail.exePath);
await page.getByLabel("包装器程序（可选）").fill("D:\\missing\\LEProc.exe");
await launchSection.getByRole("button", { name: "校验路径" }).click();
await page.waitForFunction(() => document.body.innerText.includes("包装器不存在"));
console.log("invalid wrapper reported");
await page.getByLabel("包装器程序（可选）").fill("");
await launchSection.getByRole("button", { name: "校验路径" }).click();
await page.waitForFunction(() => document.body.innerText.includes("路径可用"));
console.log(
  "path validation restored",
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("monitors_list")),
);
await page.getByRole("button", { name: "启动游戏" }).click();
await page.waitForSelector(".detail-launch-status.is-running");
await page.getByRole("button", { name: "停止游戏" }).click();
await page.waitForFunction(() => document.body.innerText.includes("已退出"), null, {
  timeout: 10000,
});
console.log(
  "stopped process tree",
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("launch_state", { workId: 1 })),
);
await page.evaluate(() => {
  window.location.hash = "#/library";
});
await page.waitForSelector(".library-card");
await page.waitForSelector(".library-card .cover-art--image img");
const libraryCover = await page
  .locator(".library-card .cover-art--image img")
  .first()
  .evaluate((image) => ({
    src: image.src,
    naturalWidth: image.naturalWidth,
  }));
console.log("library thumbnail", libraryCover);
await page.screenshot({ path: "tmp/c3-tauri-library.png" });
await page.screenshot({ path: "tmp/c3-tauri-home.png" });
await browser.close();
