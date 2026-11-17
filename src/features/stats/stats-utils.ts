import { Moon, MoonStar, Sun, Sunrise } from "lucide-react";

export function formatCompactDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0m";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, "") : Math.round(hours)}h`;
}

export const timeIcons = { Sunrise, Sun, Moon, MoonStar };
