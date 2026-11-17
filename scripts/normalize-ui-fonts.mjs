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

const tokenForPixels = (pixels) => {
  if (pixels < 12.75) return "var(--text-caption)";
  if (pixels < 13.75) return "var(--text-meta)";
  if (pixels < 14.75) return "var(--text-ui)";
  if (pixels < 15.75) return "var(--text-body)";
  return null;
};

let changed = 0;
for (const file of (await Promise.all(roots.map(walk))).flat()) {
  const source = await fs.readFile(file, "utf8");
  let next = source;
  next = next.replace(/font-size\s*:\s*([0-9.]+)px(\s*!important)?;/g, (match, raw, important) => {
    const pixels = Number.parseFloat(raw);
    const token = tokenForPixels(pixels);
    if (!token) return match;
    changed += 1;
    return `font-size: ${token}${important ?? ""};`;
  });
  if (next !== source) await fs.writeFile(file, next);
}

console.log(`Replaced ${changed} fixed font sizes with product type tokens.`);
