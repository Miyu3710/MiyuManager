import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  AppPreferences,
  BackupInfo,
  DatabaseHealth,
  RestoreOutcome,
  UpdateCheck,
} from "./app-types";

const PREVIEW_KEY = "miyu-preferences-preview";

const previewDefaults: AppPreferences = {
  proxyMode: "system",
  proxyUrl: "",
  defaultMonitor: null,
  launchFullscreen: false,
  wrappers: [
    { id: "locale-emulator", path: "", args: [] },
    { id: "magpie", path: "", args: ["-t"] },
  ],
  updateManifestUrl: "",
  onboardingCompleted: true,
  launchAtStartup: false,
  silentStartup: false,
  closeBehavior: "tray",
  bangumiProgressSync: false,
};

function previewPreferences(): AppPreferences {
  try {
    const raw = window.localStorage.getItem(PREVIEW_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<AppPreferences>;
      return {
        ...previewDefaults,
        ...stored,
        wrappers: stored.wrappers ?? previewDefaults.wrappers,
      };
    }
  } catch {
    // Ignore a broken preview preference and fall back to defaults.
  }
  return { ...previewDefaults };
}

export async function getPreferences(): Promise<AppPreferences> {
  if (!isTauri()) {
    return previewPreferences();
  }
  return invoke<AppPreferences>("preferences_get");
}

export async function updatePreferences(input: AppPreferences): Promise<AppPreferences> {
  if (!isTauri()) {
    window.localStorage.setItem(PREVIEW_KEY, JSON.stringify(input));
    return input;
  }
  return invoke<AppPreferences>("preferences_update", { input });
}

export async function completeOnboarding(): Promise<AppPreferences> {
  if (!isTauri()) {
    const preferences = { ...previewPreferences(), onboardingCompleted: true };
    window.localStorage.setItem(PREVIEW_KEY, JSON.stringify(preferences));
    return preferences;
  }
  return invoke<AppPreferences>("onboarding_complete");
}

export async function openDataDirectory(): Promise<void> {
  if (!isTauri()) {
    throw new Error("浏览器预览没有本地数据目录");
  }
  await invoke("open_data_dir");
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await invoke("open_external_url", { url });
}

export async function quitApp(): Promise<void> {
  if (!isTauri()) {
    throw new Error("浏览器预览不会退出应用");
  }
  await invoke("app_quit");
}

export async function checkForUpdates(): Promise<UpdateCheck> {
  if (!isTauri()) {
    return {
      currentVersion: "0.1.0-preview",
      configured: false,
      latestVersion: null,
      updateAvailable: false,
      notes: null,
      url: null,
      message: "浏览器预览不会检查更新。安装包与更新流程将在 C9 提供。",
    };
  }
  return invoke<UpdateCheck>("update_check");
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  if (!isTauri()) {
    return {
      dbPath: "浏览器预览不使用本地数据库",
      backupDir: "",
      logDir: "",
      sizeBytes: 0,
      integrity: "preview",
      appliedMigrations: 0,
      pendingMigrations: [],
      backupCount: 0,
      latestBackup: null,
    };
  }
  return invoke<DatabaseHealth>("database_health");
}

export async function createDatabaseBackup(destination?: string): Promise<BackupInfo> {
  if (!isTauri()) {
    throw new Error("浏览器预览不会创建数据库备份");
  }
  if (destination) {
    return invoke<BackupInfo>("database_backup", { destination });
  }
  return invoke<BackupInfo>("database_backup_default");
}

export async function restoreDatabase(sourcePath: string): Promise<RestoreOutcome> {
  if (!isTauri()) {
    throw new Error("浏览器预览不会恢复数据库");
  }
  return invoke<RestoreOutcome>("database_restore", { sourcePath });
}

export async function openBackupDirectory(): Promise<void> {
  if (!isTauri()) {
    throw new Error("浏览器预览没有本地备份目录");
  }
  await invoke("open_backup_dir");
}

export async function openLogDirectory(): Promise<void> {
  if (!isTauri()) {
    throw new Error("浏览器预览没有本地日志目录");
  }
  await invoke("open_log_dir");
}

export async function reportFrontendError(input: {
  kind: string;
  message: string;
  stack?: string;
  componentStack?: string;
  route?: string;
}): Promise<void> {
  if (!isTauri()) {
    console.error("[MiyuManager]", input.kind, input.message, input.stack);
    return;
  }
  await invoke("report_frontend_error", { input });
}
