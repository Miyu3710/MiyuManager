import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";
const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-crash-reporter"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${baseUrl}/#/`, { waitUntil: "networkidle" });
await page.waitForSelector(".home-page");
await page.evaluate(async () => document.fonts.ready);

const shelf = page.locator(".home-shelf-card").first();
await shelf.scrollIntoViewIfNeeded();
const cover = shelf.locator(".cover-art").first();
const coverBefore = await cover.evaluate((element) => getComputedStyle(element).transform);
await shelf.hover();
await page.waitForTimeout(320);
const coverAfter = await cover.evaluate((element) => getComputedStyle(element).transform);

const search = page.getByRole("button", { name: "打开全局搜索" });
await search.focus();
await search.press("Enter");
await page.waitForSelector(".global-search");
const searchFocus = await page.evaluate(() => document.activeElement?.getAttribute("role"));
await page.keyboard.press("Escape");
await page.waitForTimeout(120);
const searchFocusRestored = await page.evaluate(
  () => document.activeElement?.getAttribute("aria-label") === "打开全局搜索",
);

await page.goto(`${baseUrl}/#/library`, { waitUntil: "networkidle" });
await page.waitForSelector(".library-page");
await page.getByRole("button", { name: "多选" }).click();
await page.getByRole("button", { name: "全选", exact: true }).click();
const batchTrigger = page.getByRole("button", { name: "批量刮削" });
await batchTrigger.click();
await page.waitForSelector(".batch-dialog");
const dialogFocus = await page.evaluate(() => ({
  rootInert: document.getElementById("root")?.inert,
  inside: Boolean(document.activeElement?.closest(".batch-dialog")),
}));
await page.keyboard.press("Escape");
await page.waitForTimeout(160);
const dialogClosed = await page.evaluate(() => ({
  open: Boolean(document.querySelector(".batch-dialog")),
  rootInert: document.getElementById("root")?.inert,
  focusRestored: document.activeElement?.textContent?.includes("批量刮削") ?? false,
}));

const reduced = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
await reduced.goto(`${baseUrl}/#/`, { waitUntil: "networkidle" });
await reduced.waitForSelector(".home-page");
const reducedState = await reduced.evaluate(() => ({
  appOpacity: getComputedStyle(document.querySelector(".app-window")).opacity,
  transitionDuration: getComputedStyle(document.querySelector(".home-shelf-card .cover-art"))
    .transitionDuration,
}));

console.log(
  JSON.stringify(
    {
      hoverChangesCover: coverBefore !== coverAfter,
      coverBefore,
      coverAfter,
      searchFocus,
      searchFocusRestored,
      dialogFocus,
      dialogClosed,
      reducedState,
    },
    null,
    2,
  ),
);

await browser.close();
