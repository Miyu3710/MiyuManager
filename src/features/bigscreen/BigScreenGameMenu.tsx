import { Check, ChevronLeft, Info, ListChecks, Play, Square, Star, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import type { LibraryItem, LibraryStatus } from "../../lib/library-types";
import { bigScreenStatusLabel, bigScreenStatusOptions } from "./bigScreenStatus";

interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MenuItemProps {
  focusKey: string;
  activeKey: string | null;
  icon: ReactNode;
  label: string;
  detail?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  role?: "menuitem" | "menuitemradio";
  onFocusKey: (key: string) => void;
  onClick: () => void;
}

function MenuItem({
  focusKey,
  activeKey,
  icon,
  label,
  detail,
  danger,
  disabled,
  checked,
  role = "menuitem",
  onFocusKey,
  onClick,
}: MenuItemProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "menuitemradio" ? checked : undefined}
      className={cn("bigscreen-menu__item", danger && "is-danger")}
      data-bigscreen-focus={focusKey}
      data-bigscreen-zone="menu"
      tabIndex={activeKey === focusKey ? 0 : -1}
      disabled={disabled}
      onFocus={() => onFocusKey(focusKey)}
      onClick={onClick}
    >
      <span className="bigscreen-menu__icon">{icon}</span>
      <span className="bigscreen-menu__label">{label}</span>
      {detail ? <span className="bigscreen-menu__detail">{detail}</span> : null}
      {checked ? <Check size={18} strokeWidth={2} className="bigscreen-menu__check" /> : null}
    </button>
  );
}

interface BigScreenGameMenuProps {
  item: LibraryItem;
  anchor: MenuAnchor;
  view: "main" | "status";
  running: boolean;
  busy: boolean;
  activeKey: string | null;
  onFocusKey: (key: string) => void;
  onLaunch: () => void;
  onOpenDetail: () => void;
  onToggleFavorite: () => void;
  onOpenStatus: () => void;
  onSetStatus: (status: LibraryStatus) => void;
  onBackFromStatus: () => void;
  onClose: () => void;
}

export function BigScreenGameMenu({
  item,
  anchor,
  view,
  running,
  busy,
  activeKey,
  onFocusKey,
  onLaunch,
  onOpenDetail,
  onToggleFavorite,
  onOpenStatus,
  onSetStatus,
  onBackFromStatus,
  onClose,
}: BigScreenGameMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    const place = () => {
      const menu = menuRef.current;
      if (!menu) return;
      const margin = 22;
      const rect = menu.getBoundingClientRect();
      let left = anchor.x + anchor.width + 12;
      if (anchor.width === 0 && anchor.height === 0) {
        left = anchor.x + 10;
      }
      if (left + rect.width > window.innerWidth - margin) {
        left = anchor.x - rect.width - 12;
      }
      if (left < margin) {
        left = Math.max(margin, window.innerWidth - rect.width - margin);
      }
      let top = anchor.y;
      if (top + rect.height > window.innerHeight - margin) {
        top = anchor.y + anchor.height - rect.height;
      }
      if (top < margin) {
        top = margin;
      }
      if (top + rect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - rect.height - margin);
      }
      setPosition({ left, top });
    };

    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor, view]);

  return (
    <>
      <div className="bigscreen-menu-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={menuRef}
        className="bigscreen-menu"
        role="menu"
        aria-label={`${item.title} 游戏菜单`}
        data-bigscreen-scope="game-menu"
        style={{ left: position.left, top: position.top }}
      >
        <header className="bigscreen-menu__head">
          <div>
            <b>{item.title}</b>
          </div>
          <span className="bigscreen-menu__status">{bigScreenStatusLabel(item.status)}</span>
        </header>

        {view === "status" ? (
          <div className="bigscreen-menu__list">
            <MenuItem
              focusKey="menu-status-back"
              activeKey={activeKey}
              icon={<ChevronLeft size={19} strokeWidth={1.8} />}
              label="返回菜单"
              onFocusKey={onFocusKey}
              onClick={onBackFromStatus}
            />
            <div className="bigscreen-menu__divider" />
            {bigScreenStatusOptions.map((option) => (
              <MenuItem
                key={option.value}
                focusKey={`menu-status-${option.value}`}
                activeKey={activeKey}
                icon={<span className={cn("bigscreen-status-dot", "is-" + option.value)} />}
                label={option.label}
                checked={item.status === option.value}
                role="menuitemradio"
                disabled={busy}
                onFocusKey={onFocusKey}
                onClick={() => onSetStatus(option.value)}
              />
            ))}
          </div>
        ) : (
          <div className="bigscreen-menu__list">
            <MenuItem
              focusKey="menu-launch"
              activeKey={activeKey}
              icon={
                running ? (
                  <Square size={18} fill="currentColor" strokeWidth={0} />
                ) : (
                  <Play size={19} fill="currentColor" strokeWidth={0} />
                )
              }
              label={running ? "停止游戏" : "启动游戏"}
              detail={running ? "运行中" : undefined}
              danger={running}
              disabled={busy || item.installStatus === "missing"}
              onFocusKey={onFocusKey}
              onClick={onLaunch}
            />
            <MenuItem
              focusKey="menu-detail"
              activeKey={activeKey}
              icon={<Info size={19} strokeWidth={1.8} />}
              label="查看详情"
              onFocusKey={onFocusKey}
              onClick={onOpenDetail}
            />
            <MenuItem
              focusKey="menu-favorite"
              activeKey={activeKey}
              icon={
                <Star size={19} fill={item.favorite ? "currentColor" : "none"} strokeWidth={1.7} />
              }
              label={item.favorite ? "取消收藏" : "收藏"}
              disabled={busy}
              onFocusKey={onFocusKey}
              onClick={onToggleFavorite}
            />
            <MenuItem
              focusKey="menu-status"
              activeKey={activeKey}
              icon={<ListChecks size={19} strokeWidth={1.8} />}
              label="游玩状态"
              detail={bigScreenStatusLabel(item.status)}
              disabled={busy}
              onFocusKey={onFocusKey}
              onClick={onOpenStatus}
            />
            <div className="bigscreen-menu__divider" />
            <MenuItem
              focusKey="menu-close"
              activeKey={activeKey}
              icon={<X size={19} strokeWidth={1.8} />}
              label="关闭"
              onFocusKey={onFocusKey}
              onClick={onClose}
            />
          </div>
        )}
      </div>
    </>
  );
}
