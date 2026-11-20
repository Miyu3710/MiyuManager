import { ChevronLeft, ChevronRight, FolderOpen, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect } from "react";
import { toast } from "sonner";
import { formatBytes, formatRelativeDate } from "../../lib/format";
import {
  revealScreenshot,
  screenshotFullUrl,
  type ScreenshotItem,
} from "../../lib/screenshots-api";

interface ScreenshotLightboxProps {
  items: ScreenshotItem[];
  index: number | null;
  onIndex: (index: number | null) => void;
}

function clockLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function ScreenshotLightbox({ items, index, onIndex }: ScreenshotLightboxProps) {
  const open = index !== null && Boolean(items[index]);
  const item = index === null ? null : items[index];

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && index !== null && index > 0) {
        event.preventDefault();
        onIndex(index - 1);
      }
      if (event.key === "ArrowRight" && index !== null && index < items.length - 1) {
        event.preventDefault();
        onIndex(index + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, items.length, onIndex, open]);

  if (!item || index === null) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onIndex(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="screenshot-lightbox__overlay" />
        <Dialog.Content className="screenshot-lightbox">
          <Dialog.Description className="sr-only">截图全屏预览</Dialog.Description>
          <header className="screenshot-lightbox__head">
            <div className="screenshot-lightbox__copy">
              <Dialog.Title>{item.workTitle}</Dialog.Title>
              <span>
                {formatRelativeDate(item.capturedAt)} {clockLabel(item.capturedAt)} ·{" "}
                {formatBytes(item.sizeBytes)}
              </span>
            </div>
            <div className="screenshot-lightbox__actions">
              <button
                type="button"
                onClick={() => {
                  void revealScreenshot(item.path).catch((error) => toast.error(String(error)));
                }}
              >
                <FolderOpen size={15} strokeWidth={1.8} /> 在文件夹中显示
              </button>
              <Dialog.Close asChild>
                <button type="button" className="screenshot-lightbox__close" aria-label="关闭">
                  <X size={18} strokeWidth={1.8} />
                </button>
              </Dialog.Close>
            </div>
          </header>
          <div className="screenshot-lightbox__stage">
            <span
              className="screenshot-lightbox__ambient"
              style={{ backgroundImage: `url("${screenshotFullUrl(item)}")` }}
              aria-hidden="true"
            />
            {index > 0 ? (
              <button
                type="button"
                className="screenshot-lightbox__arrow is-prev"
                onClick={() => onIndex(index - 1)}
                aria-label="上一张截图"
              >
                <ChevronLeft size={24} strokeWidth={1.6} />
              </button>
            ) : null}
            <img src={screenshotFullUrl(item)} alt={item.workTitle + " 截图"} />
            {index < items.length - 1 ? (
              <button
                type="button"
                className="screenshot-lightbox__arrow is-next"
                onClick={() => onIndex(index + 1)}
                aria-label="下一张截图"
              >
                <ChevronRight size={24} strokeWidth={1.6} />
              </button>
            ) : null}
          </div>
          <footer className="screenshot-lightbox__foot">
            <span>{item.fileName}</span>
            <span>
              {index + 1} / {items.length}
            </span>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

ScreenshotLightbox.displayName = "ScreenshotLightbox";
