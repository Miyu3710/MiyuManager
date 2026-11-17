import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1422";
const outputRoot = path.resolve("outputs", "redesign-bigscreen", "2026-11-16", "round6");
const viewports = [
  { name: "1120x720", width: 1120, height: 720 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "2048x1152", width: 2048, height: 1152 },
  { name: "2560x1440", width: 2560, height: 1440 },
];

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

const report = {};
const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

for (const viewport of viewports) {
  const directory = path.join(outputRoot, viewport.name);
  await fs.mkdir(directory, { recursive: true });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
  await page.waitForSelector(".bigscreen-hero");
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(850);
  await page.screenshot({ path: path.join(directory, "01-room.png"), animations: "disabled" });

  const idle = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.width),
        h: Math.round(box.height),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        right: Math.round(box.right),
      };
    };
    const root = document.querySelector(".bigscreen-root");
    const rootLine = root ? getComputedStyle(root, "::before") : null;
    const band = document.querySelector(".bigscreen-hero__summary-band");
    const bandStyle = band ? getComputedStyle(band) : null;
    return {
      viewport: [window.innerWidth, window.innerHeight],
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      active: document.activeElement?.getAttribute("data-bigscreen-focus"),
      poster: rect(".bigscreen-backdrop__print"),
      hero: rect(".bigscreen-hero"),
      copy: rect(".bigscreen-hero__copy"),
      kicker: rect(".bigscreen-hero__kicker"),
      kickerText: document.querySelector(".bigscreen-hero__kicker")?.textContent?.trim() ?? "",
      title: rect(".bigscreen-hero h1"),
      meta: rect(".bigscreen-hero__meta"),
      tags: rect(".bigscreen-hero__tags"),
      summary: rect(".bigscreen-hero__summary"),
      band: rect(".bigscreen-hero__summary-band"),
      bandLabel: document.querySelector(".bigscreen-hero__summary-band span")?.textContent ?? "",
      bandImage: bandStyle?.backgroundImage.includes("url(") ?? false,
      bandWash: (() => {
        const element = document.querySelector(".bigscreen-hero__summary-band");
        return element ? getComputedStyle(element, "::before").backgroundImage : null;
      })(),
      bandRing: bandStyle?.boxShadow ?? null,
      desc: rect(".bigscreen-hero__desc"),
      shelf: rect(".bigscreen-shelf"),
      shelfHead: rect(".bigscreen-shelf__head"),
      hint: rect(".bigscreen-hint"),
      dossier: rect(".bigscreen-dossier"),
      actionSlot: rect(".bigscreen-hero__action-slot"),
      facts: document.querySelectorAll(".bigscreen-facts").length,
      edition: document.querySelectorAll(".bigscreen-hero__edition").length,
      metaItems: document.querySelectorAll(".bigscreen-hero__meta > span").length,
      posterFocus: document.querySelectorAll('[data-bigscreen-focus="hero-poster"]').length,
      launchBefore: document.querySelectorAll('[data-bigscreen-focus="hero-launch"]').length,
      divider: rootLine
        ? {
            position: rootLine.position,
            top: rootLine.top,
            bottom: rootLine.bottom,
            width: rootLine.width,
          }
        : null,
      brandInsideRail: Boolean(document.querySelector(".bigscreen-rail .bigscreen-rail__brand")),
      topbarBrand: document.querySelectorAll(".bigscreen-brand").length,
      dossierItems: document.querySelectorAll(".bigscreen-dossier__item").length,
      railBrand: rect(".bigscreen-rail__brand img"),
      railItem: rect(".bigscreen-rail__item.is-active"),
      railGlyph: rect(".bigscreen-rail__item.is-active svg"),
      activeBarLeft: (() => {
        const element = document.querySelector(".bigscreen-rail__item.is-active");
        return element ? Number.parseFloat(getComputedStyle(element, "::before").left) : null;
      })(),
      selectedOpacity: (() => {
        const element = document.querySelector(".bigscreen-card.is-selected .cover-art");
        return element ? Number(getComputedStyle(element).opacity) : null;
      })(),
      dimmedOpacity: (() => {
        const element = document.querySelector(".bigscreen-card:not(.is-selected) .cover-art");
        return element ? Number(getComputedStyle(element).opacity) : null;
      })(),
      selectedMarker: (() => {
        const element = document.querySelector(".bigscreen-card.is-selected");
        if (!element) return null;
        const style = getComputedStyle(element, "::after");
        return { image: style.backgroundImage, height: style.height };
      })(),
      selectedTransform: (() => {
        const element = document.querySelector(".bigscreen-card.is-selected .cover-art");
        return element ? getComputedStyle(element).transform : null;
      })(),
      bandBlur: (() => {
        const element = document.querySelector(".bigscreen-hero__summary-band");
        return element ? getComputedStyle(element, "::after").filter : null;
      })(),
    };
  });

  check(
    idle.scroll[0] <= viewport.width && idle.scroll[1] <= viewport.height,
    viewport.name + " overflows: " + JSON.stringify(idle.scroll),
  );
  check(
    idle.poster.y === 0 && idle.poster.bottom === viewport.height,
    viewport.name + " poster does not fill the viewport: " + JSON.stringify(idle.poster),
  );
  check(
    idle.posterFocus === 0 && idle.launchBefore === 0,
    viewport.name + " still exposes the old poster focus or early launch action",
  );
  check(idle.facts === 0, viewport.name + " still renders the vertical facts column");
  check(idle.edition === 0, viewport.name + " still renders the old edition paragraph");
  check(
    idle.metaItems === 5,
    viewport.name + " publication metadata is incomplete: " + idle.metaItems,
  );
  check(idle.actionSlot === null, viewport.name + " reserves an empty launch slot before A");
  check(
    idle.brandInsideRail && idle.topbarBrand === 0,
    viewport.name + " does not place the mark in the rail",
  );
  check(
    idle.divider?.position === "fixed" &&
      idle.divider.top === "0px" &&
      idle.divider.bottom === "0px",
    viewport.name + " divider does not span the viewport: " + JSON.stringify(idle.divider),
  );
  check(
    Boolean(idle.active?.startsWith("shelf-")) && idle.dossierItems === 4,
    viewport.name + " does not start on the shelf with four records",
  );

  // A catalogue number heads the block, the introduction keeps its strip.
  check(idle.kicker !== null, viewport.name + " lost the catalogue kicker");
  check(
    idle.kickerText.startsWith("目录 "),
    viewport.name + " catalogue kicker text is wrong: " + idle.kickerText,
  );
  check(idle.summary !== null, viewport.name + " lost the introduction block");
  check(
    idle.band !== null && idle.band.h >= 28 && idle.band.h <= 80,
    viewport.name + " introduction strip height is off: " + JSON.stringify(idle.band),
  );
  check(
    idle.bandLabel === "简介",
    viewport.name + " introduction strip lost its label: " + idle.bandLabel,
  );
  check(
    Boolean(idle.bandWash?.includes("linear-gradient")) && idle.bandRing !== "none",
    viewport.name + " introduction strip has no painted surface",
  );

  // One left baseline for title, introduction, records and launch action.
  const edges = [idle.title.x, idle.desc.x, idle.dossier.x, idle.copy.x];
  check(
    Math.max(...edges) - Math.min(...edges) <= 2,
    viewport.name +
      " title/description/records do not share the left edge: " +
      JSON.stringify(edges),
  );
  check(
    idle.dossier.bottom <= idle.shelfHead.top,
    viewport.name + " records overlap the shelf: " + JSON.stringify([idle.dossier, idle.shelfHead]),
  );
  check(
    idle.hint === null || idle.shelf.bottom <= idle.hint.top + 1,
    viewport.name + " shelf collides with the key legend",
  );
  check(
    idle.title.y < viewport.height * 0.36,
    viewport.name +
      " info block sits too low in the default state: title y=" +
      idle.title.y +
      " of " +
      viewport.height,
  );

  // The app mark and the category icons share one centred column.
  const brandCenter = idle.railBrand.x + idle.railBrand.w / 2;
  const itemCenter = idle.railItem.x + idle.railItem.w / 2;
  check(
    Math.abs(brandCenter - itemCenter) <= 1,
    viewport.name +
      " app mark is not centred on the icon column: " +
      JSON.stringify([brandCenter, itemCenter]),
  );
  // The active bar sits beside the glyph, not out at the window edge.
  const barX = idle.railItem.x + (idle.activeBarLeft ?? 0);
  const glyphGap = idle.railGlyph.x - barX;
  check(
    idle.activeBarLeft !== null && idle.activeBarLeft >= 0 && glyphGap >= 4 && glyphGap <= 14,
    viewport.name + " active rail bar is too far from the glyph: gap=" + glyphGap,
  );
  // Covers stay fully opaque; the current work is lifted and underlined.
  check(
    idle.selectedOpacity === 1 && idle.dimmedOpacity === 1,
    viewport.name +
      " covers are translucent: " +
      JSON.stringify([idle.selectedOpacity, idle.dimmedOpacity]),
  );
  check(
    Boolean(idle.selectedMarker?.image.includes("linear-gradient")) &&
      idle.selectedMarker?.height === "2px" &&
      idle.selectedTransform !== null &&
      idle.selectedTransform !== "none",
    viewport.name + " selected cover lost its marker: " + JSON.stringify(idle.selectedMarker),
  );
  check(
    Boolean(idle.bandBlur?.includes("blur(")),
    viewport.name + " introduction strip is not blurred: " + idle.bandBlur,
  );

  // Arrow keys stay inside the shelf; Tab is the keyboard route to the rail.
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(100);
  const upFocus = await page.evaluate(() =>
    document.activeElement?.getAttribute("data-bigscreen-focus"),
  );
  check(
    Boolean(upFocus?.startsWith("shelf-")),
    viewport.name + " up from the shelf left the shelf: " + upFocus,
  );
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  const rightFocus = await page.evaluate(() =>
    document.activeElement?.getAttribute("data-bigscreen-focus"),
  );
  check(
    Boolean(rightFocus?.startsWith("shelf-")),
    viewport.name + " right from the shelf did not move along the shelf: " + rightFocus,
  );
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(100);
  const backFocus = await page.evaluate(() =>
    document.activeElement?.getAttribute("data-bigscreen-focus"),
  );
  check(
    backFocus !== rightFocus,
    viewport.name + " left from the shelf did not move back: " + backFocus,
  );

  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-bigscreen-focus="hero-launch"]');
  await page.waitForTimeout(620);
  await page.screenshot({ path: path.join(directory, "02-launch.png"), animations: "disabled" });
  const launch = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.width),
        h: Math.round(box.height),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
      };
    };
    return {
      active: document.activeElement?.getAttribute("data-bigscreen-focus"),
      shelfClass: document.querySelector(".bigscreen-shelf")?.className ?? "",
      shelfHidden: document.querySelector(".bigscreen-shelf")?.getAttribute("aria-hidden"),
      shelfInert: document.querySelector(".bigscreen-shelf")?.hasAttribute("inert"),
      shelf: rect(".bigscreen-shelf"),
      hero: rect(".bigscreen-hero"),
      copy: rect(".bigscreen-hero__copy"),
      lead: rect(".bigscreen-hero__lead"),
      kicker: rect(".bigscreen-hero__kicker"),
      title: rect(".bigscreen-hero h1"),
      summary: rect(".bigscreen-hero__summary"),
      desc: rect(".bigscreen-hero__desc"),
      dossier: rect(".bigscreen-dossier"),
      button: rect('[data-bigscreen-focus="hero-launch"]'),
      buttonStyle: (() => {
        const element = document.querySelector('[data-bigscreen-focus="hero-launch"]');
        if (!element) return null;
        const style = getComputedStyle(element);
        return {
          outlineStyle: style.outlineStyle,
          animationName: style.animationName,
          animationIterationCount: style.animationIterationCount,
          boxShadow: style.boxShadow,
        };
      })(),
      hint: rect(".bigscreen-hint"),
      shelfFocusables: document.querySelectorAll('[data-bigscreen-focus^="shelf-"]').length,
      hintText: document.querySelector(".bigscreen-hint")?.textContent ?? "",
      menu: document.querySelectorAll('[role="menu"]').length,
    };
  });
  check(
    launch.active === "hero-launch" &&
      launch.shelfClass.includes("is-collapsed") &&
      launch.shelfHidden === "true" &&
      launch.shelfInert &&
      launch.shelfFocusables === 0 &&
      launch.hintText.includes("A 启动游戏") &&
      !launch.hintText.includes("LT/RT") &&
      launch.menu === 0,
    viewport.name + " launch state is wrong: " + JSON.stringify(launch),
  );
  // Focus lives on the button's surface: no ring, a slow breathing plate.
  check(
    launch.buttonStyle?.outlineStyle === "none" &&
      Boolean(launch.buttonStyle?.animationName.includes("bigscreen-launch-breathe")) &&
      launch.buttonStyle?.animationIterationCount === "infinite" &&
      launch.buttonStyle?.boxShadow !== "none",
    viewport.name + " launch focus surface is wrong: " + JSON.stringify(launch.buttonStyle),
  );
  check(
    launch.shelf.h <= 2,
    viewport.name + " shelf did not collapse out of layout: " + JSON.stringify(launch.shelf),
  );
  check(
    launch.hero.h >= idle.hero.h + 100,
    viewport.name + " hero did not reclaim the collapsed shelf space",
  );
  check(
    launch.button !== null && launch.dossier !== null,
    viewport.name + " launch action or dossier is missing",
  );
  check(
    Math.abs(launch.button.x - launch.copy.x) <= 2,
    viewport.name + " launch action is not left-aligned: " + JSON.stringify(launch.button),
  );
  const actionGap = launch.button.top - launch.dossier.bottom;
  check(
    actionGap >= 8 && actionGap <= 40,
    viewport.name + " launch action is detached from the records: gap=" + actionGap,
  );
  check(
    launch.hint === null || launch.button.bottom <= launch.hint.top - 8,
    viewport.name + " launch action touches the key legend",
  );
  // The collapsed shelf must not leave a void above a small cluster.
  const blockHeight = launch.button.bottom - launch.kicker.top;
  check(
    blockHeight >= viewport.height * 0.45,
    viewport.name +
      " launch information block is too short: " +
      blockHeight +
      " of " +
      viewport.height,
  );
  check(
    launch.kicker.top <= viewport.height * 0.4,
    viewport.name +
      " launch information block starts too low: " +
      launch.kicker.top +
      " of " +
      viewport.height,
  );
  check(
    launch.desc.y < launch.dossier.y && launch.summary.y < launch.desc.y,
    viewport.name + " launch information order is wrong",
  );

  // The D-pad is locked on the launch action; pages keys do nothing either.
  for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "q", "e"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
    const lockedFocus = await page.evaluate(
      () => document.activeElement?.getAttribute("data-bigscreen-focus") ?? null,
    );
    check(
      lockedFocus === "hero-launch",
      viewport.name + " " + key + " escaped the launch action: " + lockedFocus,
    );
  }

  await page.keyboard.press("Escape");
  await page.waitForTimeout(520);
  const dismissed = await page.evaluate(() => {
    const shelf = document.querySelector(".bigscreen-shelf");
    const box = shelf?.getBoundingClientRect();
    return {
      active: document.activeElement?.getAttribute("data-bigscreen-focus"),
      shelfClass: shelf?.className ?? "",
      shelfHidden: shelf?.getAttribute("aria-hidden"),
      shelfInert: shelf?.hasAttribute("inert"),
      shelfHeight: Math.round(box?.height ?? 0),
      hint: document.querySelector(".bigscreen-hint")?.textContent ?? "",
    };
  });
  check(
    Boolean(dismissed.active?.startsWith("shelf-")) &&
      !dismissed.shelfClass.includes("is-collapsed") &&
      dismissed.shelfHidden === null &&
      !dismissed.shelfInert &&
      dismissed.shelfHeight >= 100 &&
      dismissed.hint.includes("LT/RT"),
    viewport.name + " did not restore the shelf: " + JSON.stringify(dismissed),
  );

  report[viewport.name] = { ...idle, launch, dismissed, errors };
  check(errors.length === 0, viewport.name + " browser errors: " + errors.join(" | "));
  console.log(viewport.name, JSON.stringify(report[viewport.name]));
  await page.close();
}

// Hints off: the layout must close up instead of leaving a fixed bottom band.
for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  await page.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const raw = localStorage.getItem("miyu-appearance");
    const persisted = raw ? JSON.parse(raw) : { state: {}, version: 4 };
    persisted.state = { ...persisted.state, bigScreenHints: false };
    localStorage.setItem("miyu-appearance", JSON.stringify(persisted));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".bigscreen-hero");
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(outputRoot, viewport.name, "03-hints-off.png"),
    animations: "disabled",
  });
  const hintsOff = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
    };
    return {
      hint: document.querySelectorAll(".bigscreen-hint").length,
      shelf: box(".bigscreen-shelf"),
      hero: box(".bigscreen-hero"),
      title: box(".bigscreen-hero h1"),
      viewport: window.innerHeight,
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    };
  });
  const shelfGap = hintsOff.viewport - (hintsOff.shelf?.bottom ?? 0);
  check(hintsOff.hint === 0, viewport.name + " hints-off preference did not remove the legend");
  check(
    shelfGap >= 0 && shelfGap <= 64,
    viewport.name + " hints-off leaves an abnormal bottom gap: " + shelfGap,
  );
  check(
    hintsOff.scroll[0] <= viewport.width && hintsOff.scroll[1] <= viewport.height,
    viewport.name + " hints-off state overflows: " + JSON.stringify(hintsOff.scroll),
  );
  report[viewport.name].hintsOff = { ...hintsOff, shelfGap };
  console.log(viewport.name + " hints-off", JSON.stringify(report[viewport.name].hintsOff));
  await page.close();
}

// Start menu: five actions, no monitor or gamepad sections.
const controlPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await controlPage.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
await controlPage.waitForSelector(".bigscreen-hero");
await controlPage.evaluate(async () => document.fonts.ready);
await controlPage.waitForTimeout(450);
await controlPage.keyboard.press("m");
await controlPage.waitForSelector(".bigscreen-control");
await controlPage.waitForTimeout(420);
await controlPage.screenshot({
  path: path.join(outputRoot, "1920x1080", "04-control.png"),
  animations: "disabled",
});
const control = await controlPage.evaluate(() => ({
  rows: Array.from(document.querySelectorAll(".bigscreen-control__row")).map(
    (element) => element.textContent?.trim() ?? "",
  ),
  active: document.activeElement?.getAttribute("data-bigscreen-focus") ?? null,
  dialog: document.querySelectorAll('[role="dialog"][aria-label="大屏控制菜单"]').length,
  body: document.body.textContent ?? "",
}));
check(control.dialog === 1, "control menu did not open");
check(
  control.rows.join("|") === "返回|刷新游戏库|隐藏按键提示|退出大屏幕模式|关闭 Miyu",
  "control menu actions are wrong: " + JSON.stringify(control.rows),
);
check(
  !control.body.includes("显示器") && !control.body.includes("手柄"),
  "control menu still renders the display or gamepad section",
);
check(control.active === "control-back", "control menu focus is wrong: " + control.active);

for (let index = 0; index < 4; index += 1) {
  await controlPage.keyboard.press("ArrowDown");
}
await controlPage.keyboard.press("Enter");
await controlPage.waitForTimeout(320);
await controlPage.screenshot({
  path: path.join(outputRoot, "1920x1080", "05-quit.png"),
  animations: "disabled",
});
const quitView = await controlPage.evaluate(() => ({
  rows: Array.from(document.querySelectorAll(".bigscreen-control__row")).map(
    (element) => element.textContent?.trim() ?? "",
  ),
  active: document.activeElement?.getAttribute("data-bigscreen-focus") ?? null,
}));
check(
  quitView.rows.join("|") === "取消|关闭 Miyu",
  "quit confirmation actions are wrong: " + JSON.stringify(quitView.rows),
);
check(quitView.active === "control-quit-cancel", "quit confirmation focus: " + quitView.active);
console.log("control", JSON.stringify({ control, quitView }));
report.control = { control, quitView };
await controlPage.close();

// LB still changes category while the launch action is showing.
const padPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await padPage.addInitScript(() => {
  const state = { pressed: new Set() };
  window.__fakePad = {
    press(index) {
      state.pressed.add(index);
    },
    release(index) {
      state.pressed.delete(index);
    },
  };
  const readPad = () => ({
    id: "Fake Xbox Controller (STANDARD GAMEPAD)",
    index: 0,
    connected: true,
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, index) => {
      const pressed = state.pressed.has(index);
      return { pressed, touched: pressed, value: pressed ? 1 : 0 };
    }),
  });
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => [readPad()],
  });
});
await padPage.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
await padPage.waitForSelector(".bigscreen-hero");
await padPage.waitForTimeout(500);
await padPage.keyboard.press("Enter");
await padPage.waitForSelector('[data-bigscreen-focus="hero-launch"]');
await padPage.waitForTimeout(520);
const categoryBefore = await padPage.evaluate(
  () => document.querySelector(".bigscreen-rail__item.is-active")?.dataset.categoryId ?? null,
);
await padPage.evaluate(() => window.__fakePad.press(4));
await padPage.waitForTimeout(90);
await padPage.evaluate(() => window.__fakePad.release(4));
await padPage.waitForFunction(
  (previous) =>
    document.querySelector(".bigscreen-rail__item.is-active")?.dataset.categoryId !== previous,
  categoryBefore,
);
await padPage.waitForTimeout(760);
const afterLb = await padPage.evaluate(() => ({
  category: document.querySelector(".bigscreen-rail__item.is-active")?.dataset.categoryId ?? null,
  active: document.activeElement?.getAttribute("data-bigscreen-focus") ?? null,
  launch: Boolean(document.querySelector('[data-bigscreen-focus="hero-launch"]')),
  shelfCollapsed: document.querySelector(".bigscreen-shelf")?.classList.contains("is-collapsed"),
  shelfInert: document.querySelector(".bigscreen-shelf")?.hasAttribute("inert"),
}));
check(afterLb.category !== categoryBefore, "LB did not change the category from the launch action");
check(
  afterLb.launch === false && afterLb.shelfCollapsed === false && afterLb.shelfInert === false,
  "LB did not restore the shelf: " + JSON.stringify(afterLb),
);
check(
  Boolean(afterLb.active?.startsWith("shelf-")),
  "LB did not move focus onto the new shelf: " + afterLb.active,
);
console.log("launch LB", JSON.stringify({ categoryBefore, afterLb }));
report.launchExit = { categoryBefore, afterLb };
await padPage.close();

await browser.close();
await fs.writeFile(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error("FAILURES:\n" + failures.map((line) => "- " + line).join("\n"));
  process.exitCode = 1;
} else {
  console.log("screens: " + outputRoot);
}
