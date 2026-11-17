import { ArrowLeft, Eye, EyeOff, LogOut, Power, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface BigScreenControlMenuProps {
  activeKey: string | null;
  closing: boolean;
  hintsVisible: boolean;
  view: "menu" | "quit";
  onFocusKey: (key: string) => void;
  onRefresh: () => void;
  onToggleHints: () => void;
  onExitBigScreen: () => void;
  onRequestQuit: () => void;
  onCancelQuit: () => void;
  onConfirmQuit: () => void;
  onClose: () => void;
}

export function BigScreenControlMenu({
  activeKey,
  closing,
  hintsVisible,
  view,
  onFocusKey,
  onRefresh,
  onToggleHints,
  onExitBigScreen,
  onRequestQuit,
  onCancelQuit,
  onConfirmQuit,
  onClose,
}: BigScreenControlMenuProps) {
  const row = (
    key: string,
    label: string,
    icon: ReactNode,
    onClick: () => void,
    danger = false,
  ) => (
    <button
      key={key}
      type="button"
      className={cn("bigscreen-control__row", danger && "is-danger")}
      data-bigscreen-focus={key}
      data-bigscreen-zone="control"
      tabIndex={activeKey === key ? 0 : -1}
      onFocus={() => onFocusKey(key)}
      onClick={onClick}
    >
      <span>{icon}</span>
      <b>{label}</b>
    </button>
  );

  return (
    <>
      <div
        className={cn("bigscreen-control-backdrop", closing && "is-closing")}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn("bigscreen-control", closing && "is-closing")}
        role="dialog"
        aria-modal="true"
        aria-label="大屏控制菜单"
        data-bigscreen-scope="control"
      >
        <header className="bigscreen-control__head">
          <div>
            <b>{view === "quit" ? "关闭 Miyu？" : "大屏控制"}</b>
          </div>
        </header>

        <div className="bigscreen-control__body">
          <div className="bigscreen-control__list">
            {view === "quit" ? (
              <>
                {row(
                  "control-quit-cancel",
                  "取消",
                  <ArrowLeft size={18} strokeWidth={1.7} />,
                  onCancelQuit,
                )}
                {row(
                  "control-quit-confirm",
                  "关闭 Miyu",
                  <Power size={18} strokeWidth={1.7} />,
                  onConfirmQuit,
                  true,
                )}
              </>
            ) : (
              <>
                {row("control-back", "返回", <ArrowLeft size={18} strokeWidth={1.7} />, onClose)}
                {row(
                  "control-refresh",
                  "刷新游戏库",
                  <RefreshCw size={18} strokeWidth={1.7} />,
                  onRefresh,
                )}
                {row(
                  "control-hints",
                  hintsVisible ? "隐藏按键提示" : "显示按键提示",
                  hintsVisible ? (
                    <EyeOff size={18} strokeWidth={1.7} />
                  ) : (
                    <Eye size={18} strokeWidth={1.7} />
                  ),
                  onToggleHints,
                )}
                {row(
                  "control-exit",
                  "退出大屏幕模式",
                  <LogOut size={18} strokeWidth={1.7} />,
                  onExitBigScreen,
                )}
                {row(
                  "control-quit",
                  "关闭 Miyu",
                  <Power size={18} strokeWidth={1.7} />,
                  onRequestQuit,
                  true,
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
