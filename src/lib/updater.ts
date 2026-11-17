import { isTauri } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";

export interface AppUpdateInfo {
  currentVersion: string;
  version: string;
  date: string | null;
  notes: string | null;
}

export interface UpdateProgress {
  phase: "downloading" | "installing";
  downloaded: number;
  total: number | null;
}

let pendingUpdate: Update | null = null;
let pendingCheck: Promise<AppUpdateInfo | null> | null = null;

function describe(update: Update): AppUpdateInfo {
  return {
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date ?? null,
    notes: update.body ?? null,
  };
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!isTauri()) {
    return null;
  }
  if (pendingUpdate) {
    return describe(pendingUpdate);
  }
  if (pendingCheck) {
    return pendingCheck;
  }
  pendingCheck = (async () => {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: 20_000 });
    if (!update) {
      return null;
    }
    pendingUpdate = update;
    return describe(update);
  })();
  try {
    return await pendingCheck;
  } finally {
    pendingCheck = null;
  }
}

export async function installAppUpdate(
  onProgress: (progress: UpdateProgress) => void,
): Promise<void> {
  if (!isTauri()) {
    throw new Error("浏览器预览不能安装应用更新");
  }
  if (!pendingUpdate) {
    await checkForAppUpdate();
  }
  if (!pendingUpdate) {
    throw new Error("没有可安装的更新");
  }
  let downloaded = 0;
  let total: number | null = null;
  await pendingUpdate.downloadAndInstall(
    (event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? null;
        downloaded = 0;
        onProgress({ phase: "downloading", downloaded, total });
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        onProgress({ phase: "downloading", downloaded, total });
      } else {
        onProgress({ phase: "installing", downloaded, total });
      }
    },
    { timeout: 10 * 60 * 1000, restartAfterInstall: true },
  );
  pendingUpdate = null;
}

export async function relaunchAfterUpdate(): Promise<void> {
  if (!isTauri()) {
    return;
  }
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
