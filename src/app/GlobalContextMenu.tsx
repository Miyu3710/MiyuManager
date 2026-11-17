import {
  ArrowLeft,
  BarChart3,
  FolderHeart,
  Home,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import "../design-system/menu.css";
import { useAppearance } from "./useAppearance";

interface MenuPoint {
  x: number;
  y: number;
}

interface GlobalContextMenuProps {
  canGoBack: boolean;
  onBack: () => void;
  onSearch: () => void;
}

const destinations = [
  { to: "/", label: "首页", icon: Home, isCurrent: (path: string) => path === "/" },
  {
    to: "/library",
    label: "游戏库",
    icon: Library,
    isCurrent: (path: string) => path.startsWith("/library"),
  },
  {
    to: "/collections",
    label: "收藏集",
    icon: FolderHeart,
    isCurrent: (path: string) => path.startsWith("/collections"),
  },
  {
    to: "/stats",
    label: "统计",
    icon: BarChart3,
    isCurrent: (path: string) => path.startsWith("/stats"),
  },
];

function isEditable(target: Element | null) {
  return Boolean(
    target?.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='textbox'], [role='combobox']",
    ),
  );
}

function shouldKeepNativeMenu(target: Element) {
  if (isEditable(target)) {
    return true;
  }
  if (target.closest(".global-context, [data-radix-popper-content-wrapper]")) {
    return true;
  }
  if (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    )
  ) {
    return true;
  }
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

export function GlobalContextMenu({ canGoBack, onBack, onSearch }: GlobalContextMenuProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const railCollapsed = useAppearance((state) => state.railCollapsed);
  const toggleRail = useAppearance((state) => state.toggleRail);
  const prefersReducedMotion = useReducedMotion();
  const menuRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [point, setPoint] = useState<MenuPoint | null>(null);
  const [coords, setCoords] = useState<MenuPoint | null>(null);

  const close = useCallback((restoreFocus = false) => {
    setPoint(null);
    setCoords(null);
    if (restoreFocus) {
      const previous = returnFocusRef.current;
      if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    }
    returnFocusRef.current = null;
  }, []);

  const select = useCallback(
    (action: () => void) => {
      close();
      action();
    },
    [close],
  );

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (!target || shouldKeepNativeMenu(target)) {
        return;
      }
      event.preventDefault();
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setCoords(null);
      setPoint({ x: event.clientX, y: event.clientY });
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  useLayoutEffect(() => {
    if (!point || !menuRef.current) {
      return;
    }
    const width = menuRef.current.offsetWidth;
    const height = menuRef.current.offsetHeight;
    const margin = 12;
    setCoords({
      x: Math.min(Math.max(margin, point.x), Math.max(margin, window.innerWidth - width - margin)),
      y: Math.min(
        Math.max(margin, point.y),
        Math.max(margin, window.innerHeight - height - margin),
      ),
    });
  }, [point]);

  useEffect(() => {
    if (!point) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [point]);

  useEffect(() => {
    if (!point) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    const dismiss = () => close();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [close, point]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ??
        [],
    );
    if (!items.length) {
      return;
    }
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[activeIndex < 0 ? 0 : (activeIndex + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[activeIndex <= 0 ? items.length - 1 : activeIndex - 1]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  return createPortal(
    <AnimatePresence>
      {point ? (
        <motion.div
          ref={menuRef}
          className="app-menu global-context"
          role="menu"
          aria-label="应用菜单"
          tabIndex={-1}
          style={{ left: coords?.x ?? point.x, top: coords?.y ?? point.y }}
          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.975, y: -3 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.985, y: -2 }}
          transition={
            prefersReducedMotion ? { duration: 0 } : { duration: 0.16, ease: [0.16, 1, 0.3, 1] }
          }
          onKeyDown={onMenuKeyDown}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            className="app-menu__item"
            disabled={!canGoBack}
            onClick={() => select(onBack)}
          >
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>返回</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="app-menu__item"
            onClick={() => select(() => window.location.reload())}
          >
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>刷新</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="app-menu__item"
            onClick={() => select(onSearch)}
          >
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>搜索</span>
            <kbd>Ctrl K</kbd>
          </button>

          <hr className="app-menu__divider" />

          {destinations.map((destination) => {
            const Icon = destination.icon;
            const current = destination.isCurrent(location.pathname);
            return (
              <button
                type="button"
                role="menuitem"
                className={current ? "app-menu__item is-current" : "app-menu__item"}
                aria-current={current ? "page" : undefined}
                key={destination.to}
                onClick={() => select(() => navigate(destination.to))}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>{destination.label}</span>
                {current ? <i className="app-menu__current" aria-hidden="true" /> : null}
              </button>
            );
          })}

          <hr className="app-menu__divider" />

          <button
            type="button"
            role="menuitem"
            className={
              location.pathname === "/settings" ? "app-menu__item is-current" : "app-menu__item"
            }
            aria-current={location.pathname === "/settings" ? "page" : undefined}
            onClick={() => select(() => navigate("/settings"))}
          >
            <Settings2 size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>设置</span>
            {location.pathname === "/settings" ? (
              <i className="app-menu__current" aria-hidden="true" />
            ) : null}
          </button>
          <button
            type="button"
            role="menuitem"
            className="app-menu__item"
            onClick={() => select(toggleRail)}
          >
            {railCollapsed ? (
              <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={16} strokeWidth={1.75} aria-hidden="true" />
            )}
            <span>{railCollapsed ? "展开侧栏" : "收起侧栏"}</span>
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
