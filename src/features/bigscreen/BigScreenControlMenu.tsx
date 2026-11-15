import { ArrowLeft, Check, Gamepad2, Monitor, RefreshCw, Tv, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import type { MonitorInfo } from "../../lib/library-types";
import type { GamepadStatus } from "./useBigScreenInput";

interface BigScreenControlMenuProps {
  monitors: MonitorInfo[];
  selectedDisplay: number | null;
  gamepad: GamepadStatus;
  activeKey: string | null;
  busyDisplay: number | null;
  onFocusKey: (key: string) => void;
  onSelectDisplay: (index: number) => void;
  onRefresh: () => void;
  onReturnMain: () => void;
  onClose: () => void;
}

function Key({ children }: { children: ReactNode }) {
  return <span className="bigscreen-key">{children}</span>;
}

export function BigScreenControlMenu({
  monitors,
  selectedDisplay,
  gamepad,
  activeKey,
  busyDisplay,
  onFocusKey,
  onSelectDisplay,
  onRefresh,
  onReturnMain,
  onClose,
}: BigScreenControlMenuProps) {
  return (
    <>
      <div className="bigscreen-control-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="bigscreen-control"
        role="dialog"
        aria-modal="true"
        aria-label="大屏控制菜单"
        data-bigscreen-scope="control"
      >
        <header className="bigscreen-control__head">
          <div>
            <b>大屏控制</b>
          </div>
          <button
            type="button"
            className="bigscreen-icon-button"
            aria-label="关闭大屏控制菜单"
            data-bigscreen-focus="control-close"
            data-bigscreen-zone="control"
            tabIndex={activeKey === "control-close" ? 0 : -1}
            onFocus={() => onFocusKey("control-close")}
            onClick={onClose}
          >
            <X size={22} strokeWidth={1.7} />
          </button>
        </header>

        <div className="bigscreen-control__body">
          <section className="bigscreen-control__section">
            <header>
              <Tv size={18} strokeWidth={1.7} />
              <h2>显示器</h2>
            </header>
            <div className="bigscreen-display-list">
              {monitors.length === 0 ? (
                <p className="bigscreen-control__muted">正在读取显示器…</p>
              ) : (
                monitors.map((monitor) => {
                  const focusKey = `control-display-${monitor.index}`;
                  const selected = selectedDisplay === monitor.index;
                  return (
                    <button
                      key={monitor.index}
                      type="button"
                      className={cn("bigscreen-display", selected && "is-selected")}
                      data-bigscreen-focus={focusKey}
                      data-bigscreen-zone="control"
                      tabIndex={activeKey === focusKey ? 0 : -1}
                      disabled={busyDisplay !== null}
                      onFocus={() => onFocusKey(focusKey)}
                      onClick={() => onSelectDisplay(monitor.index)}
                    >
                      <span className="bigscreen-display__mark">
                        {busyDisplay === monitor.index ? (
                          <RefreshCw size={18} className="bigscreen-spin" />
                        ) : (
                          <Monitor size={19} strokeWidth={1.7} />
                        )}
                      </span>
                      <span className="bigscreen-display__copy">
                        <b>
                          {monitor.name}
                          {selected ? <Check size={16} strokeWidth={2.2} /> : null}
                        </b>
                        <em>
                          {monitor.width} × {monitor.height} ·{" "}
                          {Math.round(monitor.scaleFactor * 100)}%
                        </em>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="bigscreen-control__section">
            <header>
              <Gamepad2 size={18} strokeWidth={1.7} />
              <h2>手柄</h2>
            </header>
            <div className="bigscreen-pad-state">
              <span
                className={cn(
                  "bigscreen-status-dot",
                  gamepad.connected ? "is-playing" : "is-unclassified",
                )}
              />
              <div>
                <b>{gamepad.connected ? "已连接" : gamepad.supported ? "未连接" : "不可用"}</b>
                {gamepad.connected && gamepad.id ? <p>{gamepad.id}</p> : null}
              </div>
            </div>
            <div className="bigscreen-control__keys">
              <div>
                <Key>A</Key>
                <span>确认</span>
              </div>
              <div>
                <Key>B</Key>
                <span>返回</span>
              </div>
              <div>
                <Key>Y</Key>
                <span>游戏菜单</span>
              </div>
              <div>
                <Key>START</Key>
                <span>控制菜单</span>
              </div>
              <div>
                <Key>LB</Key>
                <Key>RB</Key>
                <span>切换区域</span>
              </div>
            </div>
            <p className="bigscreen-control__note">键盘：C 菜单 · M 控制 · Tab 区域</p>
          </section>

          <section className="bigscreen-control__section">
            <header>
              <RefreshCw size={18} strokeWidth={1.7} />
              <h2>游戏库</h2>
            </header>
            <button
              type="button"
              className="bigscreen-control__row"
              data-bigscreen-focus="control-refresh"
              data-bigscreen-zone="control"
              tabIndex={activeKey === "control-refresh" ? 0 : -1}
              onFocus={() => onFocusKey("control-refresh")}
              onClick={onRefresh}
            >
              <span>
                <RefreshCw size={18} strokeWidth={1.7} />
              </span>
              <b>刷新游戏库</b>
            </button>
          </section>
        </div>

        <footer className="bigscreen-control__footer">
          <button
            type="button"
            className="bigscreen-action bigscreen-action--secondary"
            data-bigscreen-focus="control-return"
            data-bigscreen-zone="control"
            tabIndex={activeKey === "control-return" ? 0 : -1}
            onFocus={() => onFocusKey("control-return")}
            onClick={onReturnMain}
          >
            <ArrowLeft size={19} strokeWidth={1.8} />
            返回主窗口
          </button>
        </footer>
      </aside>
    </>
  );
}
