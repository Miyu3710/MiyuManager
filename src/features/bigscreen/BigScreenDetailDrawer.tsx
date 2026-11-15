import { ArrowLeft, Info, Play, Square, X } from "lucide-react";
import { CoverArt } from "../../design-system/components/CoverArt";
import { cn } from "../../lib/cn";
import { formatBytes, formatPlaytimeSeconds, formatRelativeDate } from "../../lib/format";
import { libraryItemToGame } from "../../lib/library-api";
import type { LibraryItem } from "../../lib/library-types";
import { bigScreenStatusLabel } from "./bigScreenStatus";

interface BigScreenDetailDrawerProps {
  item: LibraryItem;
  running: boolean;
  busy: boolean;
  activeKey: string | null;
  onFocusKey: (key: string) => void;
  onLaunch: () => void;
  onOpenDesktop: () => void;
  onClose: () => void;
}

export function BigScreenDetailDrawer({
  item,
  running,
  busy,
  activeKey,
  onFocusKey,
  onLaunch,
  onOpenDesktop,
  onClose,
}: BigScreenDetailDrawerProps) {
  const game = libraryItemToGame(item);
  const playtime = formatPlaytimeSeconds(item.playtimeSeconds ?? item.playtimeMinutes * 60);
  const missing = item.installStatus === "missing";

  return (
    <>
      <div className="bigscreen-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="bigscreen-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.title} 详情`}
        data-bigscreen-scope="drawer"
      >
        <header className="bigscreen-drawer__head">
          <div>
            <b>作品详情</b>
          </div>
          <button
            type="button"
            className="bigscreen-icon-button"
            aria-label="关闭详情"
            data-bigscreen-focus="drawer-close"
            data-bigscreen-zone="drawer"
            tabIndex={activeKey === "drawer-close" ? 0 : -1}
            onFocus={() => onFocusKey("drawer-close")}
            onClick={onClose}
          >
            <X size={22} strokeWidth={1.7} />
          </button>
        </header>

        <div className="bigscreen-drawer__body">
          <div className="bigscreen-drawer__identity">
            <div className="bigscreen-drawer__cover">
              <CoverArt work={game} />
            </div>
            <div className="bigscreen-drawer__titles">
              <p className="bigscreen-drawer__kicker">
                <span className={cn("bigscreen-status-dot", "is-" + item.status)} />
                {bigScreenStatusLabel(item.status)}
                {item.favorite ? <span className="bigscreen-drawer__favorite">已收藏</span> : null}
              </p>
              <h2>{item.title}</h2>
              {item.originalTitle ? (
                <p className="bigscreen-drawer__original">{item.originalTitle}</p>
              ) : null}
              <p className="bigscreen-drawer__credit">
                {item.developer ?? "未知会社"}
                {item.year ? <span>· {item.year}</span> : null}
                {item.edition ? <span>· {item.edition}</span> : null}
              </p>
              {item.tags.length > 0 ? (
                <div className="bigscreen-drawer__tags">
                  {item.tags.slice(0, 6).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="bigscreen-drawer__data">
            <div>
              <span>累计游玩</span>
              <b>{playtime}</b>
            </div>
            <div>
              <span>启动次数</span>
              <b>{item.launchCount} 次</b>
            </div>
            <div>
              <span>上次启动</span>
              <b>{item.lastPlayedAt ? formatRelativeDate(item.lastPlayedAt) : "尚未启动"}</b>
            </div>
            <div>
              <span>安装大小</span>
              <b>{formatBytes(item.sizeBytes)}</b>
            </div>
          </div>

          <div className="bigscreen-drawer__section">
            <h3>简介</h3>
            <p>{item.description || "暂无简介"}</p>
          </div>

          <div className="bigscreen-drawer__section bigscreen-drawer__install">
            <h3>本地安装</h3>
            {missing ? <p>主程序不可用</p> : null}
            <code title={item.exePath}>{item.exePath}</code>
          </div>
        </div>

        <footer className="bigscreen-drawer__actions">
          <button
            type="button"
            className="bigscreen-action bigscreen-action--primary"
            data-bigscreen-focus="drawer-launch"
            data-bigscreen-zone="drawer"
            tabIndex={activeKey === "drawer-launch" ? 0 : -1}
            disabled={busy || missing}
            onFocus={() => onFocusKey("drawer-launch")}
            onClick={onLaunch}
          >
            {running ? (
              <Square size={19} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={20} fill="currentColor" strokeWidth={0} />
            )}
            {missing ? "安装缺失" : running ? "停止游戏" : "启动游戏"}
          </button>
          <button
            type="button"
            className="bigscreen-action bigscreen-action--secondary"
            data-bigscreen-focus="drawer-desktop"
            data-bigscreen-zone="drawer"
            tabIndex={activeKey === "drawer-desktop" ? 0 : -1}
            disabled={busy}
            onFocus={() => onFocusKey("drawer-desktop")}
            onClick={onOpenDesktop}
          >
            <Info size={19} strokeWidth={1.8} />
            游戏详情
          </button>
          <button
            type="button"
            className="bigscreen-action bigscreen-action--ghost"
            data-bigscreen-focus="drawer-back"
            data-bigscreen-zone="drawer"
            tabIndex={activeKey === "drawer-back" ? 0 : -1}
            onFocus={() => onFocusKey("drawer-back")}
            onClick={onClose}
          >
            <ArrowLeft size={19} strokeWidth={1.8} />
            返回
          </button>
        </footer>
      </aside>
    </>
  );
}
