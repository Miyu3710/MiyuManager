import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { getPreferences } from "../lib/app-api";
import { checkForAppUpdate } from "../lib/updater";

const LAST_CHECK_KEY = "miyu-last-update-check";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
let scheduled = false;

export function useAutomaticUpdates() {
  useEffect(() => {
    if (!isTauri() || import.meta.env.DEV || scheduled) {
      return;
    }
    scheduled = true;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const preferences = await getPreferences();
        if (!preferences.autoUpdateCheck || cancelled) {
          return;
        }
        const lastCheck = Number(window.localStorage.getItem(LAST_CHECK_KEY) ?? 0);
        if (Date.now() - lastCheck < CHECK_INTERVAL_MS) {
          return;
        }
        const update = await checkForAppUpdate();
        window.localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
        if (update && !cancelled) {
          toast.info(`MiyuManager ${update.version} 可用`, {
            description: "可在设置中下载并安装。",
            action: {
              label: "查看更新",
              onClick: () => {
                window.location.hash = "#/settings";
              },
            },
          });
        }
      } catch {
        // Offline startup and a temporarily unavailable release manifest are non-fatal.
      }
    }, 5_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
}
