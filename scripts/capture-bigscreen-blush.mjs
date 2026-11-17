import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:1420";
const outputRoot = path.resolve("outputs", "redesign-bigscreen", "2026-11-16", "screens");
const viewports = [
  { name: "1120x720", width: 1120, height: 720, deviceScaleFactor: 1 },
  { name: "1440x900", width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: "1920x1080", width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: "150pct-1280x720", width: 1280, height: 720, deviceScaleFactor: 1.5 },
  { name: "2560x1440", width: 2560, height: 1440, deviceScaleFactor: 1 },
  { name: "4k", width: 3840, height: 2160, deviceScaleFactor: 1 },
];

await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-crash-reporter"],
});

const report = {};
const minFont = async (page) =>
  page.evaluate(() => {
    const sizes = [...document.querySelectorAll(".bigscreen-root *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          !element.closest(".cover-art") &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          element.childElementCount === 0 &&
          (element.textContent ?? "").trim().length > 0
        );
      })
      .map((element) => Number.parseFloat(getComputedStyle(element).fontSize))
      .filter(Number.isFinite);
    return sizes.length ? Math.min(...sizes) : null;
  });

for (const viewport of viewports) {
  const directory = path.join(outputRoot, viewport.name);
  await fs.mkdir(directory, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
  });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
  await page.waitForSelector(".bigscreen-hero, .bigscreen-state");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(850);

  await page.screenshot({
    path: path.join(directory, "01-room.png"),
    animations: "disabled",
  });

  const metrics = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      };
    };
    return {
      viewport: [window.innerWidth, window.innerHeight],
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      hero: box(".bigscreen-hero"),
      copy: box(".bigscreen-hero__copy"),
      poster: box(".bigscreen-backdrop__print"),
      backdrop: box(".bigscreen-backdrop__ambient"),
      rail: box(".bigscreen-rail"),
      shelf: box(".bigscreen-shelf"),
      shelfRow: box(".bigscreen-shelf__row"),
      hint: box(".bigscreen-hint"),
      active: document.activeElement?.getAttribute("data-bigscreen-focus"),
      cards: document.querySelectorAll(".bigscreen-card").length,
      focusables: document.querySelectorAll("[data-bigscreen-focus]").length,
      noHeroClickTarget: !document.querySelector(".bigscreen-hero__cover"),
      posterFocus: Boolean(document.querySelector('[data-bigscreen-focus="hero-poster"]')),
      launchFocusable: Boolean(document.querySelector('[data-bigscreen-focus="hero-launch"]')),
      drawers: document.querySelectorAll(".bigscreen-drawer").length,
      accent: getComputedStyle(document.querySelector(".bigscreen-root"))
        .getPropertyValue("--bs-image-accent")
        .trim(),
      skin: (() => {
        const style = (selector) => getComputedStyle(document.querySelector(selector));
        return {
          heroBackground: style(".bigscreen-hero").backgroundColor,
          heroBorders: [
            style(".bigscreen-hero").borderTopWidth,
            style(".bigscreen-hero").borderRightWidth,
            style(".bigscreen-hero").borderBottomWidth,
            style(".bigscreen-hero").borderLeftWidth,
          ],
          cardBackground: style(".bigscreen-card").backgroundColor,
          cardPadding: style(".bigscreen-card").padding,
          selectedOutline: document.querySelector(".bigscreen-card.is-selected .cover-art")
            ? style(".bigscreen-card.is-selected .cover-art").outlineStyle
            : "none",
          selectedBorderWidth: document.querySelector(".bigscreen-card.is-selected .cover-art")
            ? style(".bigscreen-card.is-selected .cover-art").borderWidth
            : "0px",
          posterOutline: style(".bigscreen-backdrop__print").outlineStyle,
          posterCoverBorderWidth: style(".bigscreen-backdrop__print .cover-art").borderWidth,
          railBackground: style(".bigscreen-rail").backgroundColor,
          topbarBorder: style(".bigscreen-topbar").borderBottomWidth,
          shelfBorder: style(".bigscreen-shelf").borderTopWidth,
          hintBorder: style(".bigscreen-hint").borderTopWidth,
          divider: (() => {
            const root = document.querySelector(".bigscreen-root");
            if (!root) return null;
            const css = getComputedStyle(root, "::before");
            return {
              position: css.position,
              top: css.top,
              bottom: css.bottom,
              width: css.width,
              left: css.left,
            };
          })(),
        };
      })(),
    };
  });
  metrics.minTextPx = await minFont(page);
  if (
    metrics.skin.heroBackground !== "rgba(0, 0, 0, 0)" ||
    metrics.skin.heroBorders.some((width) => width !== "0px") ||
    metrics.skin.cardBackground !== "rgba(0, 0, 0, 0)" ||
    metrics.skin.cardPadding !== "0px" ||
    metrics.skin.selectedOutline !== "none" ||
    metrics.skin.selectedBorderWidth !== "0px" ||
    metrics.skin.posterOutline !== "none" ||
    metrics.skin.posterCoverBorderWidth !== "0px" ||
    metrics.skin.railBackground !== "rgba(0, 0, 0, 0)" ||
    metrics.skin.topbarBorder !== "0px" ||
    metrics.skin.shelfBorder !== "0px" ||
    metrics.skin.hintBorder !== "0px"
  ) {
    throw new Error(
      viewport.name +
        " still renders a content card or extra divider: " +
        JSON.stringify(metrics.skin),
    );
  }
  if (
    metrics.skin.divider?.position !== "fixed" ||
    metrics.skin.divider.top !== "0px" ||
    metrics.skin.divider.bottom !== "0px"
  ) {
    throw new Error(
      viewport.name + " divider does not span the viewport: " + JSON.stringify(metrics.skin.divider),
    );
  }
  if (metrics.minTextPx !== null && metrics.minTextPx < 12) {
    throw new Error(viewport.name + " functional text drops below 12px: " + metrics.minTextPx);
  }
  if (!metrics.noHeroClickTarget || metrics.drawers !== 0) {
    throw new Error(viewport.name + " still exposes the poster click target or detail drawer");
  }
  if (metrics.posterFocus || metrics.launchFocusable) {
    throw new Error(viewport.name + " exposes a poster focus target or an early launch action");
  }

  if (viewport.name === "1920x1080") {
    await page.keyboard.press("c");
    await page.waitForSelector(".bigscreen-menu");
    await page.screenshot({
      path: path.join(directory, "02-game-menu.png"),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);

    await page.keyboard.press("m");
    await page.waitForSelector(".bigscreen-control");
    await page.screenshot({
      path: path.join(directory, "03-control.png"),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);

    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(180);
    await page.screenshot({
      path: path.join(directory, "04-category-focus.png"),
      animations: "disabled",
    });

    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(160);
    await page.screenshot({
      path: path.join(directory, "05-shelf-focus.png"),
      animations: "disabled",
    });
    const shelfFocusState = await page.evaluate(() => {
      const active = document.activeElement;
      const card = active?.closest?.(".bigscreen-card");
      const cover = card?.querySelector(".cover-art");
      return {
        activeKey: active?.getAttribute("data-bigscreen-focus"),
        cardOutline: card ? getComputedStyle(card).outlineStyle : "missing",
        coverOutline: cover ? getComputedStyle(cover).outlineStyle : "missing",
        cardBorderWidth: card ? getComputedStyle(card).borderWidth : "missing",
        coverBorderWidth: cover ? getComputedStyle(cover).borderWidth : "missing",
      };
    });
    if (
      !shelfFocusState.activeKey?.startsWith("shelf-") ||
      shelfFocusState.cardOutline !== "none" ||
      shelfFocusState.coverOutline !== "none" ||
      shelfFocusState.cardBorderWidth !== "0px" ||
      shelfFocusState.coverBorderWidth !== "0px"
    ) {
      throw new Error(
        "focused shelf card still renders an outline: " + JSON.stringify(shelfFocusState),
      );
    }

    await page.keyboard.press("PageDown");
    await page.waitForTimeout(520);
    const pagedRow = await page.evaluate(
      () => document.querySelector(".bigscreen-shelf__row")?.scrollLeft ?? 0,
    );
    if (pagedRow <= 0) {
      throw new Error("PageDown did not page the shelf");
    }
    await page.screenshot({
      path: path.join(directory, "06-shelf-page-2.png"),
      animations: "disabled",
    });

    await page.keyboard.press("Enter");
    await page.waitForTimeout(420);
    await page.screenshot({
      path: path.join(directory, "07-launch-reveal.png"),
      animations: "disabled",
    });
    const launchState = await page.evaluate(() => ({
      active: document.activeElement?.getAttribute("data-bigscreen-focus"),
      launchFocusable: Boolean(document.querySelector('[data-bigscreen-focus="hero-launch"]')),
      shelfCollapsed: Boolean(document.querySelector(".bigscreen-shelf.is-collapsed")),
      shelfInert: Boolean(document.querySelector(".bigscreen-shelf")?.hasAttribute("inert")),
      shelfFocusables: document.querySelectorAll('[data-bigscreen-focus^="shelf-"]').length,
      detailButtons: [...document.querySelectorAll(".bigscreen-hero button")].filter((button) =>
        (button.textContent ?? "").includes("游戏详情"),
      ).length,
    }));
    if (
      launchState.active !== "hero-launch" ||
      !launchState.launchFocusable ||
      !launchState.shelfCollapsed ||
      !launchState.shelfInert ||
      launchState.shelfFocusables !== 0 ||
      launchState.detailButtons !== 0
    ) {
      throw new Error("launch state did not quiet and lock the shelf correctly");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(420);
    const dismissedState = await page.evaluate(() => ({
      active: document.activeElement?.getAttribute("data-bigscreen-focus"),
      shelfCollapsed: Boolean(document.querySelector(".bigscreen-shelf.is-collapsed")),
      shelfInert: Boolean(document.querySelector(".bigscreen-shelf")?.hasAttribute("inert")),
      shelfFocusables: document.querySelectorAll('[data-bigscreen-focus^="shelf-"]').length,
    }));
    if (
      !dismissedState.active?.startsWith("shelf-") ||
      dismissedState.shelfCollapsed ||
      dismissedState.shelfInert ||
      dismissedState.shelfFocusables === 0
    ) {
      throw new Error("dismissing launch did not restore the shelf focus");
    }

    if (metrics.poster) {
      await page.mouse.click(
        metrics.poster.x + metrics.poster.w / 2,
        metrics.poster.y + metrics.poster.h / 2,
      );
      await page.waitForTimeout(120);
      const overlays = await page
        .locator(".bigscreen-menu, .bigscreen-control, .bigscreen-drawer")
        .count();
      if (overlays !== 0) {
        throw new Error("clicking the poster opened an overlay");
      }
      const clickState = await page.evaluate(() => ({
        active: document.activeElement?.getAttribute("data-bigscreen-focus"),
        launchFocusable: Boolean(document.querySelector('[data-bigscreen-focus="hero-launch"]')),
        shelfInert: Boolean(document.querySelector(".bigscreen-shelf")?.hasAttribute("inert")),
      }));
      if (clickState.launchFocusable || clickState.shelfInert) {
        throw new Error("clicking the poster still reveals the launch action");
      }
      metrics.posterClick = { overlays, ...clickState };
    }

    await page.locator(".bigscreen-card.is-selected").click();
    await page.waitForTimeout(260);
    const coverClickState = await page.evaluate(() => ({
      active: document.activeElement?.getAttribute("data-bigscreen-focus"),
      launchFocusable: Boolean(document.querySelector('[data-bigscreen-focus="hero-launch"]')),
      shelfInert: Boolean(document.querySelector(".bigscreen-shelf")?.hasAttribute("inert")),
      menus: document.querySelectorAll(".bigscreen-menu").length,
    }));
    if (
      coverClickState.active !== "hero-launch" ||
      !coverClickState.launchFocusable ||
      !coverClickState.shelfInert ||
      coverClickState.menus !== 0
    ) {
      throw new Error("clicking a shelf cover did not reveal the launch action");
    }
    metrics.coverClick = coverClickState;
  }

  report[viewport.name] = { ...metrics, errors };
  if (metrics.documentWidth > viewport.width) {
    throw new Error(viewport.name + " overflows horizontally");
  }
  if (metrics.documentHeight > viewport.height) {
    throw new Error(viewport.name + " overflows vertically");
  }
  if (errors.length) {
    throw new Error(viewport.name + " console errors: " + errors.join(" | "));
  }
  console.log(viewport.name, JSON.stringify(report[viewport.name]));
  await page.close();
}

await browser.close();
await fs.writeFile(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2));
console.log("screens: " + outputRoot);
