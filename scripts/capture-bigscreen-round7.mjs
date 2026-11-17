import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";
const outputRoot = path.resolve("outputs", "redesign-bigscreen", "2026-11-17", "round7");
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

const failures = [];
const report = {};
const check = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

const readState = (page) =>
  page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      };
    };
    const selected = document.querySelector(".bigscreen-card.is-selected");
    const selectedCover = selected?.querySelector(".cover-art");
    const markerBefore = selected ? getComputedStyle(selected, "::before") : null;
    const heading = document.querySelector("#bigscreen-shelf-title");
    const count = document.querySelector(".bigscreen-shelf__count");
    const shelf = document.querySelector(".bigscreen-shelf");
    const shelfStyle = shelf ? getComputedStyle(shelf) : null;
    const shelfInner = document.querySelector(".bigscreen-shelf__inner");
    const shelfRow = document.querySelector(".bigscreen-shelf__row");
    const shelfRowStyle = shelfRow ? getComputedStyle(shelfRow) : null;
    const launchButton = document.querySelector('[data-bigscreen-focus="hero-launch"]');
    const launchStyle = launchButton ? getComputedStyle(launchButton) : null;
    const firstCategory = document.querySelector(".bigscreen-rail__item");
    return {
      active: document.activeElement?.getAttribute("data-bigscreen-focus") ?? null,
      firstCategory: firstCategory?.getAttribute("data-category-id") ?? null,
      activeCategory:
        document
          .querySelector(".bigscreen-rail__item.is-active")
          ?.getAttribute("data-category-id") ?? null,
      title: document.querySelector(".bigscreen-hero h1")?.textContent ?? "",
      count: count?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      countParent: count?.parentElement?.className ?? null,
      countAfterHeading: heading?.nextElementSibling === count,
      heading: box("#bigscreen-shelf-title"),
      countBox: box(".bigscreen-shelf__count"),
      selectedAriaCurrent: selected?.getAttribute("aria-current") ?? null,
      shelfBox: box(".bigscreen-shelf"),
      selected: box(".bigscreen-card.is-selected"),
      selectedCover: box(".bigscreen-card.is-selected .cover-art"),
      selectedOutline: selectedCover ? getComputedStyle(selectedCover).outlineStyle : null,
      selectedTransform: selected ? getComputedStyle(selected).transform : null,
      markerBefore: markerBefore
        ? {
            borderStyle: markerBefore.borderStyle,
            borderWidth: markerBefore.borderWidth,
            borderColor: markerBefore.borderColor,
            boxShadow: markerBefore.boxShadow,
            animationName: markerBefore.animationName,
          }
        : null,
      copyAnimation: document.querySelector(".bigscreen-hero__copy")
        ? getComputedStyle(document.querySelector(".bigscreen-hero__copy")).animationName
        : null,
      countAnimation: count ? getComputedStyle(count).animationName : null,
      railMarkerAnimation: document.querySelector(".bigscreen-rail__item.is-active")
        ? getComputedStyle(document.querySelector(".bigscreen-rail__item.is-active"), "::before")
            .transitionProperty
        : null,
      launch: Boolean(document.querySelector('[data-bigscreen-focus="hero-launch"]')),
      launchFocus: launchStyle
        ? {
            animationName: launchStyle.animationName,
            animationIterationCount: launchStyle.animationIterationCount,
            animationDuration: launchStyle.animationDuration,
            outlineStyle: launchStyle.outlineStyle,
            backgroundImage: launchStyle.backgroundImage,
            boxShadow: launchStyle.boxShadow,
          }
        : null,
      shelfCollapsed: document
        .querySelector(".bigscreen-shelf")
        ?.classList.contains("is-collapsed"),
      shelfMotion: shelfStyle
        ? {
            transitionProperty: shelfStyle.transitionProperty,
            transitionDuration: shelfStyle.transitionDuration,
            gridTemplateRows: shelfStyle.gridTemplateRows,
            hasInner: Boolean(document.querySelector(".bigscreen-shelf__inner")),
            innerOverflow: shelfInner ? getComputedStyle(shelfInner).overflow : null,
          }
        : null,
      shelfRow: shelfRowStyle
        ? {
            paddingInline: [shelfRowStyle.paddingLeft, shelfRowStyle.paddingRight],
            paddingBlock: [shelfRowStyle.paddingTop, shelfRowStyle.paddingBottom],
            maskImage: shelfRowStyle.maskImage,
          }
        : null,
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    };
  });

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
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(directory, "01-default.png"), animations: "disabled" });

  const initial = await readState(page);
  check(
    initial.scroll[0] <= viewport.width && initial.scroll[1] <= viewport.height,
    viewport.name + " overflows: " + JSON.stringify(initial.scroll),
  );
  check(
    initial.countParent === "bigscreen-shelf__identity" && initial.countAfterHeading,
    viewport.name + " shelf count is not beside its heading",
  );
  check(
    Boolean(initial.heading && initial.countBox && initial.countBox.x - initial.heading.right < 90),
    viewport.name + " shelf count sits too far from the heading: " + JSON.stringify(initial),
  );
  check(
    initial.selectedAriaCurrent === "true",
    viewport.name + " current cover is not marked with aria-current",
  );
  check(
    initial.firstCategory === "all" && initial.activeCategory === "recent",
    viewport.name + " sidebar order or current category is wrong: " + JSON.stringify(initial),
  );
  check(
    initial.markerBefore?.borderStyle === "solid" &&
      initial.markerBefore?.borderWidth === "2px" &&
      initial.markerBefore?.boxShadow !== "none",
    viewport.name + " selected frame is too weak or missing",
  );
  check(
    Number.parseFloat(initial.shelfRow?.paddingInline[0] ?? "0") >= 12 &&
      Number.parseFloat(initial.shelfRow?.paddingInline[1] ?? "0") >= 24 &&
      initial.shelfRow?.paddingBlock.every((value) => Number.parseFloat(value) >= 30) &&
      Boolean(initial.shelfRow?.maskImage.includes("linear-gradient")),
    viewport.name + " shelf edge treatment is missing: " + JSON.stringify(initial.shelfRow),
  );
  check(
    initial.selectedOutline === "none",
    viewport.name + " selected cover still uses an outline",
  );

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(360);
  await page.screenshot({
    path: path.join(directory, "02-next-selection.png"),
    animations: "disabled",
  });
  const moved = await readState(page);
  check(
    moved.active !== initial.active,
    viewport.name + " ArrowRight did not move the shelf focus",
  );
  check(
    moved.title !== initial.title,
    viewport.name + " focus change did not update the hero copy",
  );
  check(
    moved.selectedAriaCurrent === "true" && moved.selected?.x !== initial.selected?.x,
    viewport.name + " current cover marker did not follow focus",
  );

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(45);
  }
  await page.waitForTimeout(420);
  const selectionStress = await page.evaluate(() => {
    const root = document.querySelector(".bigscreen-root");
    const row = document.querySelector(".bigscreen-shelf__row");
    return {
      active: document.activeElement?.getAttribute("data-bigscreen-focus") ?? null,
      rootScroll: [root?.scrollLeft ?? 0, root?.scrollTop ?? 0],
      documentScroll: [
        document.documentElement.scrollLeft,
        document.documentElement.scrollTop,
        document.body.scrollLeft,
        document.body.scrollTop,
      ],
      rowScroll: row?.scrollLeft ?? 0,
      rowScrollable: (row?.scrollWidth ?? 0) > (row?.clientWidth ?? 0),
      rootOverflow: root ? getComputedStyle(root).overflow : null,
    };
  });
  await page.screenshot({
    path: path.join(directory, "02b-selection-tail.png"),
    animations: "disabled",
  });
  check(
    selectionStress.active?.startsWith("shelf-") &&
      selectionStress.rootScroll[0] === 0 &&
      selectionStress.rootScroll[1] === 0 &&
      selectionStress.documentScroll.every((value) => value === 0) &&
      selectionStress.rootOverflow === "clip" &&
      selectionStress.rowScrollable &&
      selectionStress.rowScroll > 0,
    viewport.name + " shelf focus shifted the page: " + JSON.stringify(selectionStress),
  );

  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-bigscreen-focus="hero-launch"]');
  await page.waitForTimeout(420);
  await page.screenshot({ path: path.join(directory, "03-launch.png"), animations: "disabled" });
  const launch = await readState(page);
  check(
    launch.launch && launch.shelfCollapsed,
    viewport.name + " launch reveal did not collapse the shelf",
  );
  check(
    launch.launchFocus?.animationName.includes("bigscreen-launch-sheen") &&
      launch.launchFocus?.animationIterationCount === "infinite" &&
      launch.launchFocus?.animationDuration === "3.8s" &&
      launch.launchFocus?.outlineStyle === "none" &&
      launch.launchFocus?.backgroundImage.includes("linear-gradient") &&
      launch.launchFocus?.boxShadow.includes("inset 0 0 0 1px"),
    viewport.name + " launch focus loop or thin keyline is wrong",
  );
  check(
    launch.shelfMotion?.transitionProperty.includes("grid-template-rows") &&
      launch.shelfMotion?.hasInner === true &&
      launch.shelfMotion?.innerOverflow === "clip",
    viewport.name + " shelf collapse is not using the measured-height grid transition",
  );

  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  const restoring = await page.evaluate(() => {
    const shelf = document.querySelector(".bigscreen-shelf");
    const inner = document.querySelector(".bigscreen-shelf__inner");
    return {
      height: shelf?.getBoundingClientRect().height ?? 0,
      innerHeight: inner?.getBoundingClientRect().height ?? 0,
      collapsed: shelf?.classList.contains("is-collapsed") ?? false,
    };
  });
  await page.screenshot({
    path: path.join(directory, "03b-shelf-restoring.png"),
    animations: "allow",
  });
  await page.waitForTimeout(360);
  const restored = await readState(page);
  check(
    !restored.launch && !restored.shelfCollapsed && restored.active?.startsWith("shelf-"),
    viewport.name + " Escape did not restore the shelf",
  );
  check(
    !restoring.collapsed &&
      restoring.height > 4 &&
      restoring.height < (initial.shelfBox?.h ?? viewport.height) * 0.9,
    viewport.name + " shelf restore jumps instead of growing: " + JSON.stringify(restoring),
  );
  check(
    restored.shelfMotion?.transitionProperty.includes("grid-template-rows") &&
      restored.shelfMotion?.transitionDuration.includes("0.42s"),
    viewport.name +
      " shelf restore transition is not registered: " +
      JSON.stringify(restored.shelfMotion),
  );

  await page.getByRole("button", { name: /全部游戏/ }).click();
  await page.waitForTimeout(520);
  await page.screenshot({
    path: path.join(directory, "04-category-all.png"),
    animations: "disabled",
  });
  const switched = await readState(page);
  check(
    switched.count !== initial.count && switched.countParent === "bigscreen-shelf__identity",
    viewport.name + " category change did not update the title-adjacent count",
  );

  check(errors.length === 0, viewport.name + " browser errors: " + errors.join(" | "));
  report[viewport.name] = {
    initial,
    moved,
    selectionStress,
    launch,
    restoring,
    restored,
    switched,
    errors,
  };
  console.log(viewport.name, JSON.stringify(report[viewport.name]));
  await page.close();
}

const controlPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await controlPage.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
await controlPage.waitForSelector(".bigscreen-hero");
await controlPage.keyboard.press("m");
await controlPage.waitForSelector(".bigscreen-control");
await controlPage.waitForTimeout(320);
await controlPage.screenshot({
  path: path.join(outputRoot, "1920x1080", "06-control.png"),
  animations: "disabled",
});
const controlMotion = await controlPage.evaluate(() => ({
  backdropAnimation: getComputedStyle(document.querySelector(".bigscreen-control-backdrop"))
    .animationName,
  panelAnimation: getComputedStyle(document.querySelector(".bigscreen-control")).animationName,
}));
check(
  controlMotion.backdropAnimation.includes("bigscreen-control-mask-in") &&
    controlMotion.panelAnimation.includes("bigscreen-control-panel-in"),
  "control menu entrance animation is missing: " + JSON.stringify(controlMotion),
);
await controlPage.keyboard.press("Escape");
await controlPage.waitForFunction(() =>
  document.querySelector(".bigscreen-control")?.classList.contains("is-closing"),
);
const controlClosing = await controlPage.evaluate(() => ({
  backdrop: document.querySelector(".bigscreen-control-backdrop")?.classList.contains("is-closing"),
  panel: document.querySelector(".bigscreen-control")?.classList.contains("is-closing"),
}));
check(
  controlClosing.backdrop === true && controlClosing.panel === true,
  "control menu exit animation did not start: " + JSON.stringify(controlClosing),
);
await controlPage.waitForSelector(".bigscreen-control", { state: "detached" });
report.control = { controlMotion, controlClosing };
console.log("control", JSON.stringify(report.control));
await controlPage.close();

const reducedPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await reducedPage.emulateMedia({ reducedMotion: "reduce" });
await reducedPage.goto(baseUrl + "/#/big-screen", { waitUntil: "networkidle" });
await reducedPage.waitForSelector(".bigscreen-hero");
await reducedPage.waitForTimeout(350);
const reduced = await readState(reducedPage);
await reducedPage.screenshot({
  path: path.join(outputRoot, "1920x1080", "05-reduced-motion.png"),
  animations: "disabled",
});
check(
  reduced.copyAnimation === "none" &&
    reduced.countAnimation === "none" &&
    reduced.markerBefore?.animationName === "none" &&
    reduced.launchFocus?.animationName === "none" &&
    reduced.selectedTransform === "none",
  "reduced motion still animates the new shelf states: " + JSON.stringify(reduced),
);
report.reducedMotion = reduced;
console.log("reduced-motion", JSON.stringify(reduced));

await reducedPage.keyboard.press("m");
await reducedPage.waitForSelector(".bigscreen-control");
const reducedControl = await reducedPage.evaluate(() => ({
  backdropAnimation: getComputedStyle(document.querySelector(".bigscreen-control-backdrop"))
    .animationName,
  panelAnimation: getComputedStyle(document.querySelector(".bigscreen-control")).animationName,
}));
const controlClosedAt = Date.now();
await reducedPage.keyboard.press("Escape");
await reducedPage.waitForSelector(".bigscreen-control", { state: "detached", timeout: 250 });
const closeElapsed = Date.now() - controlClosedAt;
check(
  reducedControl.backdropAnimation === "none" &&
    reducedControl.panelAnimation === "none" &&
    closeElapsed < 160,
  "reduced-motion control overlay still animates or waits",
);
report.reducedControl = { ...reducedControl, closeElapsed };
console.log("reduced-control", JSON.stringify(report.reducedControl));
await reducedPage.close();

await browser.close();
await fs.writeFile(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2));
if (failures.length > 0) {
  console.error("FAILURES:\n" + failures.map((line) => "- " + line).join("\n"));
  process.exitCode = 1;
} else {
  console.log("screens: " + outputRoot);
}
