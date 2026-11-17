import { Minus, Square, Tv, X } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Hint } from "./Hint";

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
  onOpenBigScreen?: () => void;
}

export function WindowBar({ context, center, className, onOpenBigScreen }: WindowBarProps) {
  return (
    <header className={cn("ds-window-bar", className)}>
      <div className="ds-window-bar__identity" data-tauri-drag-region>
        <img className="ds-window-mark" src="/miyu-manager.png" alt="" aria-hidden="true" />
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
        {onOpenBigScreen ? (
          <Hint label="大屏模式" side="bottom">
            <button
              type="button"
              className="ds-window-bar__control ds-window-bar__control--bigscreen"
              aria-label="打开大屏模式"
              onClick={onOpenBigScreen}
            >
              <Tv size={14} strokeWidth={1.6} />
            </button>
          </Hint>
        ) : null}
        <Hint label="最小化" side="bottom">
          <button
            type="button"
            className="ds-window-bar__control"
            aria-label="最小化窗口"
            onClick={() => void performWindowAction("minimize")}
          >
            <Minus size={14} strokeWidth={1.5} />
          </button>
        </Hint>
        <Hint label="最大化或还原" side="bottom">
          <button
            type="button"
            className="ds-window-bar__control"
            aria-label="最大化或还原窗口"
            onClick={() => void performWindowAction("maximize")}
          >
            <Square size={11} strokeWidth={1.5} />
          </button>
        </Hint>
        <Hint label="隐藏到托盘" side="bottom" align="end">
          <button
            type="button"
            className="ds-window-bar__control ds-window-bar__control--close"
            aria-label="隐藏窗口到系统托盘"
            onClick={() => void performWindowAction("close")}
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </Hint>
      </div>
    </header>
  );
}
