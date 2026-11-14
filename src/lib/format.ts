export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "—";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit >= 3 ? 1 : unit === 0 ? 0 : 1;
  return value.toFixed(digits) + " " + units[unit];
}

export function formatPlaytime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "尚未记录";
  }
  const whole = Math.floor(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) {
    return rest + " 分";
  }
  return rest === 0 ? hours + " 小时" : hours + " 小时 " + rest + " 分";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function formatRelativeDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
  if (days === 0) {
    return "今天";
  }
  if (days === 1) {
    return "昨天";
  }
  if (days > 1 && days < 7) {
    return days + " 天前";
  }
  return formatDate(value);
}

export function pluralizeGames(count: number): string {
  return count + " 部游戏";
}
