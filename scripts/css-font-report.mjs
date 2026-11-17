import fs from "node:fs/promises";
import path from "node:path";

const roots = [
  "src/app",
  "src/design-system",
  "src/features/collections",
  "src/features/home",
  "src/features/library",
  "src/features/metadata",
  "src/features/onboarding",
  "src/features/search",
  "src/features/settings",
  "src/features/stats",
  "src/features/work-detail",
  "src/styles",
];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(location)));
    if (entry.isFile() && entry.name.endsWith(".css")) files.push(location);
  }
  return files;
}

const files = (await Promise.all(roots.map(walk))).flat();
const exceptions = [
  ".app-rail::after",
  ".home-hero__vertical",
  ".detail-poster__label",
  ".cover-art__jp",
  ".cover-art__credit",
  ".cover-art__title",
  ".home-hero__stage-label",
];

for (const file of files) {
  const css = await fs.readFile(file, "utf8");
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  const rows = [];
  for (const match of css.matchAll(pattern)) {
    const selector = match[1].replace(/\s+/g, " ").trim();
    if (!selector || selector.startsWith("@") || !match[2].includes("font-size")) continue;
    for (const declaration of match[2].matchAll(/font-size\s*:\s*([^;]+);/g)) {
      const value = declaration[1].trim();
      const pixels = Number.parseFloat(value);
      if (value.endsWith("px") && Number.isFinite(pixels) && pixels < 12) {
        rows.push({ selector, value });
      }
    }
  }
  if (rows.length > 0) {
    console.log(`\n# ${file}`);
    for (const row of rows) {
      const ignored = exceptions.some((selector) => row.selector.includes(selector));
      console.log(`${ignored ? "skip" : "fix "} ${row.value.padEnd(7)} ${row.selector}`);
    }
  }
}
