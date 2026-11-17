import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const cdpUrl = "http://127.0.0.1:9222";
const outputDir = path.resolve("outputs", "app", "c9");

async function openPage() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const browser = await chromium.connectOverCDP(cdpUrl);
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((candidate) => candidate.url().includes("tauri.localhost"));
    if (page) return { browser, page };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Tauri WebView page not found");
}

async function waitForTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${cdpUrl}/json`);
      if (response.ok) {
        const targets = await response.json();
        if (targets.some((target) => target.url?.includes("tauri.localhost"))) return;
      }
    } catch {
      // The old WebView is expected to disappear during restart.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("restarted Tauri WebView was not available");
}

const first = await openPage();
const invokeFirst = (command, args = {}) =>
  first.page.evaluate(
    ([name, payload]) => window.__TAURI_INTERNALS__.invoke(name, payload),
    [command, args],
  );

await first.page.waitForSelector(".app-window");
const original = await invokeFirst("preferences_get");
const backup = await invokeFirst("database_backup_default");
const probeUrl =
  original.updateManifestUrl === "https://example.com/c9-restore-probe"
    ? ""
    : "https://example.com/c9-restore-probe";
await invokeFirst("preferences_update", {
  input: { ...original, updateManifestUrl: probeUrl },
});
const changed = await invokeFirst("preferences_get");
if (changed.updateManifestUrl !== probeUrl) {
  throw new Error("probe preference was not saved before restore");
}
void first.page
  .evaluate(
    ([sourcePath]) => window.__TAURI_INTERNALS__.invoke("database_restore", { sourcePath }),
    [backup.path],
  )
  .catch(() => undefined);
await new Promise((resolve) => setTimeout(resolve, 750));
await waitForTarget();

const second = await openPage();
const invokeSecond = (command, args = {}) =>
  second.page.evaluate(
    ([name, payload]) => window.__TAURI_INTERNALS__.invoke(name, payload),
    [command, args],
  );
await second.page.waitForSelector(".app-window, .onboarding-panel");
const after = await invokeSecond("preferences_get");
const health = await invokeSecond("database_health");
await second.page.evaluate(() => {
  window.location.hash = "#/settings";
});
await second.page.waitForSelector(".settings-page");
await second.page.screenshot({ path: path.join(outputDir, "tauri-after-restore.png") });

const result = {
  originalUpdateManifestUrl: original.updateManifestUrl,
  changedUpdateManifestUrl: changed.updateManifestUrl,
  restoredUpdateManifestUrl: after.updateManifestUrl,
  health,
};
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(
  path.join(outputDir, "tauri-restore-result.json"),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
await second.browser.close();

if (after.updateManifestUrl !== original.updateManifestUrl) {
  throw new Error("restored preference did not return to the snapshot value");
}
