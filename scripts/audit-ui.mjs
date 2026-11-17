import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:1420";
const outputRoot = path.resolve("outputs", "ui-audit");
const requested = process.env.AUDIT_VIEWPORT;
const viewports = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1120x720", width: 1120, height: 720 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "390x844", width: 390, height: 844 },
].filter((viewport) => !requested || viewport.name === requested);

const routes = [
  { name: "home", path: "/", ready: ".home-page" },
  { name: "library", path: "/library", ready: ".library-page" },
  { name: "detail", path: "/work/moonlit-atelier", ready: ".detail-page" },
  { name: "stats", path: "/stats", ready: ".stats-page" },
  { name: "settings", path: "/settings", ready: ".settings-page" },
  { name: "collections", path: "/collections", ready: ".collections-page" },
  { name: "onboarding", path: "/onboarding", ready: ".onboarding-panel" },
  { name: "big-screen", path: "/big-screen", ready: ".bigscreen-root" },
];

function indent(value) {
  return JSON.stringify(value, null, 2);
}

await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-crash-reporter"],
});

const report = {};

for (const viewport of viewports) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  report[viewport.name] = {};

  for (const route of routes) {
    await page.goto(`${baseUrl}/#${route.path}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".app-window, .bigscreen-root");
    await page.waitForSelector(route.ready);
    await page.evaluate(async () => {
      await document.fonts.ready;
      document.documentElement.dataset.capture = "true";
    });
    await page.waitForTimeout(240);

    const data = await page.evaluate((routeName) => {
      const compactSelector = (element) => {
        if (!element || element === document.documentElement) return "html";
        if (element === document.body) return "body";
        const tag = element.tagName.toLowerCase();
        if (element.id) return `${tag}#${element.id}`;
        const classes = [...element.classList]
          .filter((name) => !name.startsWith("lucide"))
          .slice(0, 3)
          .map((name) => `.${name}`)
          .join("");
        return `${tag}${classes}`;
      };
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity) > 0.01
        );
      };
      const directText = (element) =>
        [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      const sampleText = (element) => {
        const value = directText(element) || element.getAttribute("aria-label") || "";
        return value.slice(0, 90);
      };

      const root = document.querySelector(".app-page, .bigscreen-main") ?? document.body;
      const rootRect = root.getBoundingClientRect();
      const all = [...document.querySelectorAll("*")].filter(isVisible);
      const tinyText = all
        .filter((element) => directText(element).length > 0)
        .map((element) => {
          const style = getComputedStyle(element);
          return {
            selector: compactSelector(element),
            parent: compactSelector(element.parentElement),
            text: sampleText(element),
            size: Number.parseFloat(style.fontSize),
            color: style.color,
            weight: style.fontWeight,
            lineHeight: style.lineHeight,
          };
        })
        .filter((entry) => entry.size < 12)
        .sort((a, b) => a.size - b.size)
        .slice(0, 80);

      const smallTargets = all
        .filter((element) =>
          element.matches(
            "button, a[href], input, select, textarea, [role='button'], [role='tab']",
          ),
        )
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            selector: compactSelector(element),
            parent: compactSelector(element.parentElement),
            text: sampleText(element),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .filter((entry) => entry.width < 32 || entry.height < 32)
        .slice(0, 100);

      const clippedText = all
        .filter((element) => directText(element).length > 0)
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            (style.overflow === "hidden" || style.overflowX === "hidden") &&
            (element.scrollWidth > element.clientWidth + 1 ||
              element.scrollHeight > element.clientHeight + 1)
          );
        })
        .map((element) => ({
          selector: compactSelector(element),
          parent: compactSelector(element.parentElement),
          text: sampleText(element),
          client: [element.clientWidth, element.clientHeight],
          scroll: [element.scrollWidth, element.scrollHeight],
        }))
        .slice(0, 80);

      const horizontalOverflow = [...root.querySelectorAll("*")]
        .filter(isVisible)
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.right > rootRect.right + 1 || rect.left < rootRect.left - 1;
        })
        .filter((element) => {
          let parent = element.parentElement;
          while (parent && parent !== root) {
            const style = getComputedStyle(parent);
            if (["auto", "scroll"].includes(style.overflowX)) return false;
            parent = parent.parentElement;
          }
          return true;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            selector: compactSelector(element),
            parent: compactSelector(element.parentElement),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
          };
        })
        .slice(0, 40);

      const missingNames = all
        .filter((element) => element.matches("button, a[href], input, select, textarea"))
        .filter((element) => {
          if (element.matches("input[type='hidden']")) return false;
          const name =
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            element.textContent?.trim() ||
            (element.labels &&
              [...element.labels]
                .map((label) => label.textContent)
                .join(" ")
                .trim());
          return !name;
        })
        .map(compactSelector)
        .slice(0, 30);

      const missingAlt = all
        .filter((element) => element.tagName === "IMG" && !element.hasAttribute("alt"))
        .map(compactSelector)
        .slice(0, 20);

      const fontFamilies = {};
      const fontSizes = {};
      const radii = {};
      for (const element of all) {
        const style = getComputedStyle(element);
        if (directText(element).length > 0) {
          fontFamilies[style.fontFamily] = (fontFamilies[style.fontFamily] ?? 0) + 1;
          const size = style.fontSize;
          fontSizes[size] = (fontSizes[size] ?? 0) + 1;
        }
        if (
          element.matches("button, a[href], input, select, textarea, [role='button'], [role='tab']")
        ) {
          const radius = style.borderRadius;
          radii[radius] = (radii[radius] ?? 0) + 1;
        }
      }

      const headers = [
        ...document.querySelectorAll(
          ".home-head, .library-head, .stats-head, .settings-head, .collections-head, .detail-hero, .onboarding-panel",
        ),
      ].filter(isVisible);
      const pageHeading = [...document.querySelectorAll("h1")].find(isVisible) ?? null;
      const pageHeadingRect = pageHeading?.getBoundingClientRect() ?? null;
      const anchorSelectors = [
        ".app-page-header",
        ".home-hero",
        ".home-ledger",
        ".home-section",
        ".library-toolbar",
        ".library-grid, .library-list-shell",
        ".stats-summary",
        ".stats-trend",
        ".settings-layout",
        ".settings-content",
        ".collections-grid",
        ".collection-works",
        ".detail-hero",
        ".detail-tabs",
        ".onboarding-panel",
        ".bigscreen-hero",
        ".bigscreen-shelf",
      ];
      const anchors = Object.fromEntries(
        anchorSelectors.flatMap((selector) => {
          const element = document.querySelector(selector);
          if (!element || !isVisible(element)) return [];
          const rect = element.getBoundingClientRect();
          return [
            [
              selector,
              {
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                top: Math.round(rect.top),
                bottom: Math.round(rect.bottom),
                width: Math.round(rect.width),
              },
            ],
          ];
        }),
      );

      return {
        route: routeName,
        viewport: [window.innerWidth, window.innerHeight],
        document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        scrollRoot: {
          client: [root.clientWidth, root.clientHeight],
          scroll: [root.scrollWidth, root.scrollHeight],
        },
        pageHeading: pageHeading
          ? {
              text: pageHeading.textContent?.trim(),
              left: Math.round(pageHeadingRect.left),
              top: Math.round(pageHeadingRect.top),
              right: Math.round(pageHeadingRect.right),
              size: getComputedStyle(pageHeading).fontSize,
            }
          : null,
        tinyText,
        smallTargets,
        clippedText,
        horizontalOverflow,
        missingNames,
        missingAlt,
        fontFamilies,
        fontSizes,
        controlRadii: radii,
        anchors,
      };
    }, route.name);

    report[viewport.name][route.name] = data;
    const summary = {
      document: data.document,
      scrollRoot: data.scrollRoot,
      tinyText: data.tinyText.length,
      smallestText: data.tinyText[0]?.size ?? null,
      smallTargets: data.smallTargets.length,
      clippedText: data.clippedText.length,
      horizontalOverflow: data.horizontalOverflow.length,
      missingNames: data.missingNames.length,
      missingAlt: data.missingAlt.length,
    };
    console.log(viewport.name, route.name, indent(summary));
  }

  await page.close();
}

await browser.close();
const reportPath = path.join(
  outputRoot,
  `audit-${viewports.map((viewport) => viewport.name).join("-")}.json`,
);
await fs.writeFile(reportPath, indent(report));
console.log(`Audit saved to ${reportPath}`);
