import { invoke, isTauri } from "@tauri-apps/api/core";

export interface ScreenshotItem {
  workId: number | null;
  workTitle: string;
  folder: string;
  fileName: string;
  relativePath: string;
  thumbnailPath: string;
  path: string;
  capturedAt: string;
  sizeBytes: number;
}

function screenshotUrl(relativePath: string): string {
  return "http://miyu-shot.localhost/?path=" + encodeURIComponent(relativePath);
}

export function screenshotThumbUrl(item: ScreenshotItem): string {
  return screenshotUrl(item.thumbnailPath || item.relativePath);
}

export function screenshotFullUrl(item: ScreenshotItem): string {
  return screenshotUrl(item.relativePath);
}

export async function listScreenshots(workId?: number): Promise<ScreenshotItem[]> {
  if (!isTauri()) {
    return [];
  }
  return invoke<ScreenshotItem[]>("screenshots_list", { workId: workId ?? null });
}

export async function openScreenshotDirectory(): Promise<void> {
  if (!isTauri()) {
    return;
  }
  await invoke("screenshots_open_dir");
}

export async function revealScreenshot(path: string): Promise<void> {
  if (!isTauri()) {
    return;
  }
  await invoke("screenshot_reveal", { path });
}
