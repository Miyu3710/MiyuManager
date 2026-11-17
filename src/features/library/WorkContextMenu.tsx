import { isTauri } from "@tauri-apps/api/core";
import {
  Bookmark,
  Check,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Copy,
  ExternalLink,
  FolderHeart,
  FolderOpen,
  FolderPlus,
  Gamepad2,
  History,
  MoreHorizontal,
  Pause,
  Play,
  SquareDashedMousePointer,
  Star,
  Tags,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import "../../design-system/menu.css";
import { cn } from "../../lib/cn";
import {
  addCollectionWorks,
  libraryItemId,
  removeLibraryWork,
  revealWorkPath,
  setLibraryFavorite,
  setLibraryStatus,
  startWork,
} from "../../lib/library-api";
import type { LibraryItem, LibraryStatus } from "../../lib/library-types";
import { workLinkState, workOrigins } from "../../lib/work-navigation";
import { useCollections, useInvalidateCollections } from "../collections/useCollections";
import { useInvalidateLibrary } from "./useLibrary";

export interface WorkMenuAnchor {
  item: LibraryItem;
  x: number;
  y: number;
}

interface WorkContextMenuProps {
  anchor: WorkMenuAnchor | null;
  detailState?: unknown;
  onClose: () => void;
  onBeginSelection?: (item: LibraryItem) => void;
}

type ContextSubmenu = "status" | "collections" | "more";

const statusOptions: LibraryStatus[] = ["unclassified", "playing", "queued", "finished", "paused"];

const statusLabels: Record<LibraryStatus, string> = {
  unclassified: "未分类",
  playing: "在玩",
  queued: "想玩",
  finished: "已通关",
  paused: "搁置",
};

const statusIcons: Record<LibraryStatus, typeof Tags> = {
  unclassified: CircleDashed,
  playing: Play,
  queued: Bookmark,
  finished: CircleCheck,
  paused: Pause,
};

export function WorkContextMenu({
  anchor,
  detailState,
  onClose,
  onBeginSelection,
}: WorkContextMenuProps) {
  const navigate = useNavigate();
  const invalidate = useInvalidateLibrary();
  const invalidateCollections = useInvalidateCollections();
  const collections = useCollections();
  const prefersReducedMotion = useReducedMotion();
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuCloseTimer = useRef<number | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const [submenu, setSubmenu] = useState<ContextSubmenu | null>(null);
  const [removeTarget, setRemoveTarget] = useState<LibraryItem | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const item = anchor?.item ?? null;
  const resolvedDetailState = detailState ?? workLinkState(workOrigins.library);
  const menuLeft = coords?.x ?? anchor?.x ?? 0;
  const submenuLeft = menuLeft + 248 + 232 > window.innerWidth - 12;

  const closeMenu = useCallback(() => {
    setSubmenu(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (submenuCloseTimer.current) {
        window.clearTimeout(submenuCloseTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!anchor) {
      return;
    }
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [anchor]);

  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) {
      return;
    }
    const width = menuRef.current.offsetWidth;
    const height = menuRef.current.offsetHeight;
    const margin = 12;
    setCoords({
      x: Math.min(Math.max(margin, anchor.x), Math.max(margin, window.innerWidth - width - margin)),
      y: Math.min(
        Math.max(margin, anchor.y),
        Math.max(margin, window.innerHeight - height - margin),
      ),
    });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeMenu();
        const previous = returnFocusRef.current;
        if (previous?.isConnected) {
          previous.focus({ preventScroll: true });
        }
      }
    };
    const dismiss = () => closeMenu();
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
  }, [anchor, closeMenu]);

  const openSubmenu = (next: ContextSubmenu) => {
    if (submenuCloseTimer.current) {
      window.clearTimeout(submenuCloseTimer.current);
      submenuCloseTimer.current = null;
    }
    setSubmenu(next);
  };

  const scheduleSubmenuClose = () => {
    if (submenuCloseTimer.current) {
      window.clearTimeout(submenuCloseTimer.current);
    }
    submenuCloseTimer.current = window.setTimeout(() => {
      submenuCloseTimer.current = null;
      setSubmenu(null);
    }, 160);
  };

  const changeStatus = async (target: LibraryItem, status: LibraryStatus) => {
    closeMenu();
    try {
      await setLibraryStatus(target.workId, status);
      invalidate();
      toast.success("已标记为" + statusLabels[status]);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const toggleFavorite = async (target: LibraryItem) => {
    closeMenu();
    try {
      await setLibraryFavorite(target.workId, !target.favorite);
      invalidate();
      toast.success(target.favorite ? "已取消收藏" : "已收藏");
    } catch (error) {
      toast.error(String(error));
    }
  };

  const launchGame = async (target: LibraryItem) => {
    closeMenu();
    if (!isTauri()) {
      toast.info("浏览器预览不会启动本地程序；请在 Tauri 窗口中使用。");
      return;
    }
    try {
      await startWork(target.workId);
      toast.success("正在启动「" + target.title + "」");
    } catch (error) {
      toast.error(String(error));
    }
  };

  const revealGame = async (target: LibraryItem) => {
    closeMenu();
    if (!isTauri()) {
      toast.info("在桌面版中可以直接定位游戏目录。");
      return;
    }
    try {
      await revealWorkPath(target.exePath || target.workingDir);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const copyText = async (value: string, label: string) => {
    closeMenu();
    if (!value) {
      toast.error("没有可复制的内容。");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label);
    } catch {
      toast.error("复制失败，请检查系统剪贴板权限。");
    }
  };

  const addToCollection = async (target: LibraryItem, collectionId: number, name: string) => {
    closeMenu();
    try {
      const added = await addCollectionWorks(collectionId, [target.workId]);
      invalidateCollections();
      toast.success(added > 0 ? "已加入「" + name + "」" : "它已经在「" + name + "」中。");
    } catch (error) {
      toast.error(String(error));
    }
  };

  const openDetail = (target: LibraryItem, tab?: "launch" | "sessions") => {
    closeMenu();
    const path =
      "/work/" + libraryItemId(target) + (tab ? "?tab=" + tab + "&focus=detail-tabs" : "");
    navigate(path, { state: resolvedDetailState });
  };

  const requestRemove = (target: LibraryItem) => {
    closeMenu();
    setRemoveTarget(target);
  };

  const confirmRemove = async () => {
    if (!removeTarget) {
      return;
    }
    setRemoveBusy(true);
    try {
      await removeLibraryWork(removeTarget.workId);
      invalidate();
      setRemoveTarget(null);
      toast.success("已从库中移除；后续扫描会跳过，可在设置中恢复。");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setRemoveBusy(false);
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ??
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

  const menu =
    anchor && item ? (
      <motion.div
        ref={menuRef}
        className="app-menu work-context"
        role="menu"
        aria-label={item.title + " 操作"}
        tabIndex={-1}
        style={{ left: coords?.x ?? anchor.x, top: coords?.y ?? anchor.y }}
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
          disabled={item.installStatus !== "installed" || !item.exePath}
          onClick={() => void launchGame(item)}
        >
          <Play size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>启动游戏</span>
          {item.installStatus === "installed" ? (
            <em className="app-menu__meta">本地</em>
          ) : (
            <em className="app-menu__meta is-muted">缺失</em>
          )}
        </button>
        <button
          type="button"
          role="menuitem"
          className="app-menu__item"
          onClick={() => openDetail(item)}
        >
          <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>打开详情</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="app-menu__item"
          onClick={() => void revealGame(item)}
        >
          <FolderOpen size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>在文件夹中显示</span>
        </button>

        <hr className="app-menu__divider" />

        <div
          className="app-menu__submenu-wrap"
          onMouseEnter={() => openSubmenu("status")}
          onMouseLeave={scheduleSubmenuClose}
        >
          <button
            type="button"
            role="menuitem"
            className="app-menu__item"
            aria-haspopup="menu"
            aria-expanded={submenu === "status"}
            onFocus={() => openSubmenu("status")}
            onClick={() => setSubmenu((current) => (current === "status" ? null : "status"))}
          >
            <Tags size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>标记为</span>
            <em className="app-menu__meta">{statusLabels[item.status]}</em>
            <ChevronRight
              className="app-menu__chevron"
              size={14}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
          <AnimatePresence>
            {submenu === "status" ? (
              <motion.div
                className={cn("app-menu__submenu", submenuLeft && "is-left")}
                role="menu"
                aria-label="标记为"
                initial={prefersReducedMotion ? false : { opacity: 0, x: submenuLeft ? 5 : -5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: submenuLeft ? 4 : -4 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { duration: 0.14, ease: [0.16, 1, 0.3, 1] }
                }
                onMouseEnter={() => openSubmenu("status")}
              >
                {statusOptions.map((status) => {
                  const Icon = statusIcons[status];
                  return (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={item.status === status}
                      key={status}
                      className={cn("app-menu__item", item.status === status && "is-current")}
                      onClick={() => void changeStatus(item, status)}
                    >
                      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                      <span>{statusLabels[status]}</span>
                      {item.status === status ? (
                        <Check size={13} strokeWidth={2} aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <button
          type="button"
          role="menuitem"
          className="app-menu__item"
          onClick={() => void toggleFavorite(item)}
        >
          <Star
            size={16}
            strokeWidth={1.75}
            fill={item.favorite ? "currentColor" : "none"}
            aria-hidden="true"
          />
          <span>{item.favorite ? "取消收藏" : "加入收藏"}</span>
        </button>

        <div
          className="app-menu__submenu-wrap"
          onMouseEnter={() => openSubmenu("collections")}
          onMouseLeave={scheduleSubmenuClose}
        >
          <button
            type="button"
            role="menuitem"
            className="app-menu__item"
            aria-haspopup="menu"
            aria-expanded={submenu === "collections"}
            onFocus={() => openSubmenu("collections")}
            onClick={() =>
              setSubmenu((current) => (current === "collections" ? null : "collections"))
            }
          >
            <FolderHeart size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>加入收藏集</span>
            <em className="app-menu__meta">{collections.data?.length ?? 0}</em>
            <ChevronRight
              className="app-menu__chevron"
              size={14}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
          <AnimatePresence>
            {submenu === "collections" ? (
              <motion.div
                className={cn("app-menu__submenu", "is-up", submenuLeft && "is-left")}
                role="menu"
                aria-label="加入收藏集"
                initial={prefersReducedMotion ? false : { opacity: 0, x: submenuLeft ? 5 : -5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: submenuLeft ? 4 : -4 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { duration: 0.14, ease: [0.16, 1, 0.3, 1] }
                }
                onMouseEnter={() => openSubmenu("collections")}
              >
                {collections.isPending ? (
                  <p className="app-menu__empty">正在读取收藏集…</p>
                ) : collections.isError ? (
                  <p className="app-menu__empty">无法读取收藏集</p>
                ) : collections.data?.length ? (
                  collections.data.map((collection) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={collection.id}
                      className="app-menu__item"
                      onClick={() => void addToCollection(item, collection.id, collection.name)}
                    >
                      <FolderHeart size={16} strokeWidth={1.75} aria-hidden="true" />
                      <span>{collection.name}</span>
                      <em className="app-menu__meta">{collection.workCount}</em>
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="app-menu__item"
                    onClick={() => {
                      closeMenu();
                      navigate("/collections?focus=collections-new");
                    }}
                  >
                    <FolderPlus size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span>新建收藏集</span>
                  </button>
                )}
                <hr className="app-menu__divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="app-menu__item"
                  onClick={() => {
                    closeMenu();
                    navigate("/collections?focus=collections-grid");
                  }}
                >
                  <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>管理收藏集</span>
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div
          className="app-menu__submenu-wrap"
          onMouseEnter={() => openSubmenu("more")}
          onMouseLeave={scheduleSubmenuClose}
        >
          <button
            type="button"
            role="menuitem"
            className="app-menu__item"
            aria-haspopup="menu"
            aria-expanded={submenu === "more"}
            onFocus={() => openSubmenu("more")}
            onClick={() => setSubmenu((current) => (current === "more" ? null : "more"))}
          >
            <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>更多操作</span>
            <ChevronRight
              className="app-menu__chevron"
              size={14}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
          <AnimatePresence>
            {submenu === "more" ? (
              <motion.div
                className={cn("app-menu__submenu", "is-up", submenuLeft && "is-left")}
                role="menu"
                aria-label="更多操作"
                initial={prefersReducedMotion ? false : { opacity: 0, x: submenuLeft ? 5 : -5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: submenuLeft ? 4 : -4 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { duration: 0.14, ease: [0.16, 1, 0.3, 1] }
                }
                onMouseEnter={() => openSubmenu("more")}
              >
                {onBeginSelection ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="app-menu__item"
                    onClick={() => {
                      closeMenu();
                      onBeginSelection(item);
                    }}
                  >
                    <SquareDashedMousePointer size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span>从此项开始多选</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className="app-menu__item"
                  onClick={() => openDetail(item, "launch")}
                >
                  <Gamepad2 size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>打开启动配置</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="app-menu__item"
                  onClick={() => openDetail(item, "sessions")}
                >
                  <History size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>打开游玩记录</span>
                </button>
                <hr className="app-menu__divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="app-menu__item"
                  onClick={() => void copyText(item.title, "标题已复制。")}
                >
                  <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>复制标题</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="app-menu__item"
                  onClick={() => void copyText(item.exePath, "安装路径已复制。")}
                >
                  <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>复制安装路径</span>
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <hr className="app-menu__divider" />

        <button
          type="button"
          role="menuitem"
          className="app-menu__item is-danger"
          onClick={() => requestRemove(item)}
        >
          <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>从库中移除</span>
        </button>
      </motion.div>
    ) : null;

  return (
    <>
      {createPortal(
        <AnimatePresence>{anchor && item ? menu : null}</AnimatePresence>,
        document.body,
      )}
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(null);
          }
        }}
        title={"从库中移除「" + (removeTarget?.title ?? "") + "」？"}
        description="只会删除 MiyuManager 的管理记录，不会删除游戏文件。后续扫描会跳过它；可在设置 → 游戏库 → 管理排除项中恢复。"
        confirmLabel="从库中移除"
        busy={removeBusy}
        onConfirm={() => void confirmRemove()}
      />
    </>
  );
}
