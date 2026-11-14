import { Minus, Square, X } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type WindowAction = "minimize" | "maximize" | "close";

async function performWindowAction(action: WindowAction) {
  if (!isTauri()) {
    return;
  }

  const window = getCurrentWindow();
  if (action === "minimize") {
    await window.minimize();
  } else if (action === "maximize") {
    await window.toggleMaximize();
  } else {
    await window.close();
  }
}

interface WindowBarProps {
  context: string;
  center?: ReactNode;
  className?: string;
}

export function WindowBar({ context, center, className }: WindowBarProps) {
  return (
    <header className={cn("ds-window-bar", className)}>
      <div className="ds-window-bar__identity" data-tauri-drag-region>
        <span className="ds-window-mark" aria-hidden="true">
          M
        </span>
        <span className="ds-window-bar__product">MiyuManager</span>
        <span className="ds-window-bar__divider" aria-hidden="true" />
        <span className="ds-window-bar__context">{context}</span>
      </div>
      <div className="ds-window-bar__drag">
        <div
          className="ds-window-bar__drag-space"
          data-tauri-drag-region
          onDoubleClick={() => void performWindowAction("maximize")}
        />
        {center ? <div className="ds-window-bar__center">{center}</div> : null}
        <div
          className="ds-window-bar__drag-space"
          data-tauri-drag-region
          onDoubleClick={() => void performWindowAction("maximize")}
        />
      </div>
      <div className="ds-window-bar__controls">
        <button
          type="button"
          className="ds-window-bar__control"
          title="最小化"
          aria-label="最小化窗口"
          onClick={() => void performWindowAction("minimize")}
        >
          <Minus size={14} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="ds-window-bar__control"
          title="最大化"
          aria-label="最大化或还原窗口"
          onClick={() => void performWindowAction("maximize")}
        >
          <Square size={11} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="ds-window-bar__control ds-window-bar__control--close"
          title="关闭"
          aria-label="关闭窗口"
          onClick={() => void performWindowAction("close")}
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
