import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppPreferences, UpdateCheck } from "./app-types";

const PREVIEW_KEY = "miyu-preferences-preview";

const previewDefaults: AppPreferences = {
  proxyMode: "system",
  proxyUrl: "",
  defaultMonitor: null,
  launchFullscreen: false,
  wrapperPath: "",
  wrapperArgs: [],
  updateManifestUrl: "",
  onboardingCompleted: true,
};

function previewPreferences(): AppPreferences {
  try {
    const raw = window.localStorage.getItem(PREVIEW_KEY);
    if (raw) {
      return { ...previewDefaults, ...(JSON.parse(raw) as Partial<AppPreferences>) };
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
