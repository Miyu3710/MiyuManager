import { Minus, Square, X } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Link, useLocation } from "react-router-dom";
import { directionList, directionOrder } from "../data";

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
}

export function WindowBar({ context }: WindowBarProps) {
  const location = useLocation();
  const activeDirection = directionOrder.find((direction) =>
    location.pathname.startsWith(`/prototype/${direction}`),
  );
  const suffix = activeDirection
    ? location.pathname.replace(`/prototype/${activeDirection}`, "")
    : "";

  return (
    <header className="window-bar">
      <div className="window-bar__identity" data-tauri-drag-region>
        <span className="window-mark" aria-hidden="true">
          M
        </span>
        <span className="window-bar__product">MiyuManager</span>
        <span className="window-bar__divider" aria-hidden="true" />
        <span className="window-bar__context">{context}</span>
      </div>

      <div className="window-bar__drag">
        <div
          className="window-bar__drag-space"
          data-tauri-drag-region
          onDoubleClick={() => void performWindowAction("maximize")}
        />
        <nav className="prototype-switch" aria-label="切换视觉原型">
          <Link
            to="/design-prototypes"
            className="prototype-switch__overview"
            aria-current={activeDirection ? undefined : "page"}
          >
            总览
          </Link>
          {directionList.map((direction) => (
            <Link
              key={direction.id}
              to={`/prototype/${direction.id}${suffix}`}
              aria-current={activeDirection === direction.id ? "page" : undefined}
            >
              <span className="prototype-switch__index">{direction.index}</span>
              {direction.name}
            </Link>
          ))}
        </nav>
        <div
          className="window-bar__drag-space"
          data-tauri-drag-region
          onDoubleClick={() => void performWindowAction("maximize")}
        />
      </div>

      <div className="window-bar__controls">
        <button
          className="window-bar__control"
          type="button"
          title="最小化"
          aria-label="最小化窗口"
          onClick={() => void performWindowAction("minimize")}
        >
          <Minus size={14} strokeWidth={1.5} />
        </button>
        <button
          className="window-bar__control"
          type="button"
          title="最大化"
          aria-label="最大化或还原窗口"
          onClick={() => void performWindowAction("maximize")}
        >
          <Square size={11} strokeWidth={1.5} />
        </button>
        <button
          className="window-bar__control window-bar__control--close"
          type="button"
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
