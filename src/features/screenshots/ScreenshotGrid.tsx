import { Camera } from "lucide-react";
import { formatRelativeDate } from "../../lib/format";
import { screenshotThumbUrl, type ScreenshotItem } from "../../lib/screenshots-api";
import { cn } from "../../lib/cn";

interface ScreenshotGridProps {
  items: ScreenshotItem[];
  onOpen: (index: number) => void;
  showGame?: boolean;
  className?: string;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function ScreenshotGrid({ items, onOpen, showGame = false, className }: ScreenshotGridProps) {
  return (
    <div className={cn("screenshot-grid", className)}>
      {items.map((item, index) => (
        <button
          type="button"
          className="screenshot-card"
          key={item.relativePath}
          onClick={() => onOpen(index)}
          aria-label={`打开截图 ${item.fileName}`}
        >
          <span className="screenshot-card__media">
            <img src={screenshotThumbUrl(item)} alt="" loading="lazy" />
            <span className="screenshot-card__shade" aria-hidden="true" />
            <span className="screenshot-card__open" aria-hidden="true">
              <Camera size={15} strokeWidth={1.9} />
            </span>
          </span>
          <span className="screenshot-card__caption">
            <span className="screenshot-card__title">
              {showGame ? item.workTitle : item.fileName.replace(/\.png$/i, "")}
            </span>
            <span className="screenshot-card__meta">
              {formatRelativeDate(item.capturedAt)} {dateLabel(item.capturedAt)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function ScreenshotEmpty({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("screenshot-empty", compact && "is-compact")}>
      <span className="screenshot-empty__icon">
        <Camera size={22} strokeWidth={1.5} />
      </span>
      <div>
        <b>还没有截图</b>
        <span>启动游戏后按下截图快捷键，画面会保存在这里。</span>
      </div>
    </div>
  );
}
