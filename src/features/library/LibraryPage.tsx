import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDownAZ,
  ArrowUpDown,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  FolderOpen,
  FolderPlus,
  Gamepad2,
  Grid2X2,
  HardDrive,
  History,
  Image as ImageIcon,
  LayoutGrid,
  ListChecks,
  List,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Rows2,
  Rows3,
  Rows4,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { DropdownMenu } from "radix-ui";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAppearance } from "../../app/useAppearance";
import { Button } from "../../design-system/components/Button";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import { CoverArt } from "../../design-system/components/CoverArt";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Hint, HintProvider } from "../../design-system/components/Hint";
import { PageHeader } from "../../design-system/components/PageHeader";
import { Tag } from "../../design-system/components/Tag";
import { cn } from "../../lib/cn";
import { formatBytes, formatRelativeDate } from "../../lib/format";
import { libraryItemId, libraryItemToGame, removeLibraryWork } from "../../lib/library-api";
import type {
  LibraryCounts,
  LibraryFilter,
  LibraryItem,
  LibrarySort,
  LibraryStatus,
} from "../../lib/library-types";
import { workLinkState, workOrigins } from "../../lib/work-navigation";
import { ScanImportDialog } from "./ScanImportDialog";
import { WorkContextMenu } from "./WorkContextMenu";
import { BatchScrapeDialog } from "../metadata/BatchScrapeDialog";
import { SteamLibraryDialog } from "./SteamLibraryDialog";
import {
  useInvalidateLibrary,
  useLibraryInfinite,
  useLibraryRoots,
  useLibrarySummary,
} from "./useLibrary";
import { useLibraryScan } from "./useLibraryScan";
import { useDeepLinkFocus } from "../../lib/use-deep-link-focus";
import {
  DEFAULT_LIBRARY_SORT,
  useLibraryPreferences,
  type LibraryCardContent,
  type LibraryViewMode,
} from "./useLibraryPreferences";
import "./library.css";
import "./library-final.css";

const libraryDetailState = workLinkState(workOrigins.library);

interface FilterHighlight {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ContextMenuState {
  item: LibraryItem;
  x: number;
  y: number;
}

interface ScrollRailState {
  visible: boolean;
  top: number;
  height: number;
  thumbHeight: number;
}

const MIN_SCROLL_RAIL_THUMB = 44;

function getScrollRailThumbHeight(element: HTMLElement, railHeight: number) {
  const contentRatio = element.clientHeight / Math.max(1, element.scrollHeight);
  return Math.min(railHeight, Math.max(MIN_SCROLL_RAIL_THUMB, contentRatio * railHeight));
}

interface LibraryMarquee {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface MarqueeDragState {
  pointerId: number;
  startX: number;
  startY: number;
  startClientX: number;
  startClientY: number;
  base: Set<number>;
  active: boolean;
}

type FilterEntryId = LibraryFilter | "favorite";

const filters: { id: FilterEntryId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "all", label: "全部", icon: LayoutGrid },
  { id: "unclassified", label: "未分类", icon: CircleDashed },
  { id: "playing", label: "在玩", icon: Play },
  { id: "queued", label: "想玩", icon: Bookmark },
  { id: "finished", label: "已通关", icon: CircleCheck },
  { id: "paused", label: "搁置", icon: Pause },
  { id: "favorite", label: "收藏", icon: Star },
];

const statusLabels: Record<LibraryStatus, string> = {
  unclassified: "未分类",
  playing: "在玩",
  queued: "想玩",
  finished: "已通关",
  paused: "搁置",
};

const sortOptions: { id: LibrarySort; label: string; icon: typeof LayoutGrid }[] = [
  { id: "added_desc", label: "最近入库", icon: CalendarDays },
  { id: "title_asc", label: "标题", icon: ArrowDownAZ },
  { id: "size_desc", label: "安装大小", icon: HardDrive },
  { id: "last_played_desc", label: "最近启动", icon: History },
];

const cardContentOptions: {
  id: LibraryCardContent;
  label: string;
  icon: typeof Rows2;
}[] = [
  { id: "detailed", label: "详细", icon: Rows4 },
  { id: "balanced", label: "适中", icon: Rows3 },
  { id: "concise", label: "简略", icon: Rows2 },
  { id: "textless", label: "无字", icon: ImageIcon },
];

const emptyCounts: LibraryCounts = {
  all: 0,
  unclassified: 0,
  playing: 0,
  queued: 0,
  finished: 0,
  paused: 0,
  favorite: 0,
};

function statusTone(status: LibraryStatus): "status" | "data" | "muted" {
  if (status === "playing") {
    return "status";
  }
  if (status === "finished") {
    return "data";
  }
  return "muted";
}

const LibraryCard = memo(function LibraryCard({
  item,
  revealDelay,
  content,
  onContextMenu,
  onMenuButton,
  selectable,
  selected,
  onToggleSelect,
}: {
  item: LibraryItem;
  revealDelay: number;
  content: LibraryCardContent;
  onContextMenu: (event: ReactMouseEvent, item: LibraryItem) => void;
  onMenuButton: (item: LibraryItem, x: number, y: number) => void;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (workId: number) => void;
}) {
  const game = libraryItemToGame(item);
  const activityLine = game.isLocal
    ? (game.installedSize === "—" ? "大小未知" : game.installedSize) +
      "　入库 " +
      formatRelativeDate(item.addedAt)
    : game.playtime + "　上次 " + game.lastPlayed;

  return (
    <div
      className={cn("library-card-wrap", selectable && "is-selectable", selected && "is-selected")}
      style={{ animationDelay: revealDelay + "ms" }}
      onContextMenu={(event) => onContextMenu(event, item)}
      data-work-id={item.workId}
    >
      <Hint label={content === "textless" ? game.title : ""} side="bottom" sideOffset={6}>
        <Link
          to={"/work/" + libraryItemId(item)}
          state={libraryDetailState}
          className="library-card"
          draggable={false}
          aria-label={content === "textless" ? game.title : undefined}
          onClick={(event) => {
            if (selectable) {
              event.preventDefault();
              onToggleSelect(item.workId);
            }
          }}
        >
          <div className="library-card__cover">
            <CoverArt work={game} />
            {selectable ? (
              <span className={cn("library-select", selected && "is-on")}>
                {selected ? <Check size={12} strokeWidth={2.2} /> : null}
              </span>
            ) : null}
          </div>
          {content !== "textless" ? (
            <div className={cn("library-card__meta", "is-" + content)}>
              <h3>
                <span>{game.title}</span>
                {content !== "concise" && game.favorite ? (
                  <span className="library-card__favorite" aria-label="已收藏">
                    <Star size={11} fill="currentColor" strokeWidth={0} />
                  </span>
                ) : null}
              </h3>
              {content === "detailed" ? (
                game.originalTitle ? (
                  <p>{game.originalTitle}</p>
                ) : (
                  <p>本地副本</p>
                )
              ) : null}
              {content !== "concise" ? (
                <span className={cn("library-card__meta-line", "is-" + item.status)}>
                  <span className="library-card__status-label">{statusLabels[item.status]}</span>
                  <span aria-hidden="true"> · </span>
                  {game.developer || "开发商未记录"}
                  {game.year ? " · " + game.year : ""}
                </span>
              ) : null}
              {content === "detailed" ? (
                <span className="library-card__activity">{activityLine}</span>
              ) : null}
            </div>
          ) : null}
        </Link>
      </Hint>
      {!selectable ? (
        <button
          type="button"
          className="library-card__menu"
          aria-label={"更多操作：" + game.title}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            onMenuButton(item, rect.right - 8, rect.bottom + 4);
          }}
        >
          <MoreHorizontal size={14} strokeWidth={1.6} />
        </button>
      ) : null}
    </div>
  );
});

const LibraryRow = memo(function LibraryRow({
  item,
  revealDelay,
  onContextMenu,
  selectable,
  selected,
  onToggleSelect,
}: {
  item: LibraryItem;
  revealDelay: number;
  onContextMenu: (event: ReactMouseEvent, item: LibraryItem) => void;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (workId: number) => void;
}) {
  const game = libraryItemToGame(item);
  const sourceLabel = item.steamAppId ? "Steam" : game.isLocal ? "本地安装" : game.engine;
  const sizeLabel = game.isLocal ? formatBytes(item.sizeBytes) : game.playtime;
  const activityLabel = item.lastPlayedAt
    ? "上次 " + formatRelativeDate(item.lastPlayedAt)
    : "入库 " + formatRelativeDate(item.addedAt);
  return (
    <Link
      to={"/work/" + libraryItemId(item)}
      state={libraryDetailState}
      className={cn("library-row", selectable && "is-selectable", selected && "is-selected")}
      draggable={false}
      data-work-id={item.workId}
      style={{ animationDelay: revealDelay + "ms" }}
      onContextMenu={(event) => onContextMenu(event, item)}
      onClick={(event) => {
        if (selectable) {
          event.preventDefault();
          onToggleSelect(item.workId);
        }
      }}
    >
      {selectable ? (
        <span className={cn("library-select", selected && "is-on")}>
          {selected ? <Check size={12} strokeWidth={2.2} /> : null}
        </span>
      ) : null}
      <CoverArt work={game} />
      <div className="library-row__title">
        <h3>
          <span>{game.title}</span>
          {game.favorite ? (
            <span className="library-row__favorite" aria-label="已收藏">
              <Star size={11} fill="currentColor" strokeWidth={0} />
            </span>
          ) : null}
        </h3>
        <p>{game.originalTitle || "本地副本"}</p>
      </div>
      <span className="library-row__developer">{game.developer}</span>
      <span className="library-row__source">{sourceLabel}</span>
      <span className="library-row__size">{sizeLabel}</span>
      <span className="library-row__activity" title={activityLabel}>
        {activityLabel}
      </span>
      <span className="library-row__tail">
        <Tag tone={statusTone(item.status)} className={"library-row__status is-" + item.status}>
          {statusLabels[item.status]}
        </Tag>
        <ChevronRight className="library-row__chevron" size={14} strokeWidth={1.7} />
      </span>
    </Link>
  );
});

function LibrarySkeleton({ columns }: { columns: number }) {
  return (
    <div
      className="library-grid library-grid--skeleton"
      style={{ gridTemplateColumns: "repeat(" + columns + ", minmax(0, 1fr))" }}
    >
      {Array.from({ length: columns * 2 }, (_, index) => (
        <div className="library-skeleton" key={index}>
          <div className="library-skeleton__cover" />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function LibraryMarqueeMask({
  bounds,
  motionOff,
}: {
  bounds: LibraryMarquee | null;
  motionOff: boolean;
}) {
  return (
    <AnimatePresence>
      {bounds ? (
        <motion.div
          className="library-marquee"
          style={{
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
          }}
          initial={motionOff ? false : { opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={motionOff ? undefined : { opacity: 0, scale: 0.99 }}
          transition={motionOff ? { duration: 0 } : { duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
        ></motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function LibraryScrollRail({
  scrollRef,
  layoutKey,
  contentKey,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  layoutKey: string;
  contentKey: string;
}) {
  const [rail, setRail] = useState<ScrollRailState>({
    visible: false,
    top: 0,
    height: 0,
    thumbHeight: 44,
  });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const thumbTopRef = useRef(0);

  const applyThumbTop = useCallback((thumbTop: number) => {
    thumbTopRef.current = thumbTop;
    if (thumbRef.current) {
      thumbRef.current.style.transform = "translate3d(0, " + thumbTop + "px, 0)";
    }
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      setRail((current) => (current.visible ? { ...current, visible: false } : current));
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const windowBar = document.querySelector<HTMLElement>(".ds-window-bar");
      const top = windowBar ? Math.max(0, windowBar.getBoundingClientRect().bottom) : 0;
      const height = Math.max(1, window.innerHeight - top);
      const maxScroll = element.scrollHeight - element.clientHeight;
      const visible = maxScroll > 2;
      const thumbHeight = visible ? getScrollRailThumbHeight(element, height) : 0;
      const track = Math.max(1, height - thumbHeight);
      const thumbTop = visible ? (element.scrollTop / maxScroll) * track : 0;
      applyThumbTop(thumbTop);
      setRail((current) => {
        if (
          current.visible === visible &&
          Math.abs(current.top - top) < 0.5 &&
          Math.abs(current.height - height) < 0.5 &&
          Math.abs(current.thumbHeight - thumbHeight) < 0.5
        ) {
          return current;
        }
        return {
          visible,
          top,
          height,
          thumbHeight,
        };
      });
    };
    const schedule = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(update);
      }
    };
    update();
    element.addEventListener("scroll", schedule, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(element);
    window.addEventListener("resize", schedule);
    const settle = window.setTimeout(update, 340);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      element.removeEventListener("scroll", schedule);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [applyThumbTop, contentKey, layoutKey, scrollRef]);

  useLayoutEffect(() => {
    if (rail.visible) {
      applyThumbTop(thumbTopRef.current);
    }
  }, [applyThumbTop, rail.visible, rail.top, rail.height, rail.thumbHeight]);

  if (typeof document === "undefined" || !rail.visible) {
    return null;
  }

  const scrollToPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const track = Math.max(1, rect.height - rail.thumbHeight);
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientY - rect.top - rail.thumbHeight / 2) / track),
    );
    element.scrollTop = ratio * (element.scrollHeight - element.clientHeight);
  };

  return createPortal(
    <div
      className={cn("library-scrollbar", dragging && "is-dragging")}
      style={{ top: rail.top, height: rail.height }}
      aria-hidden="true"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          scrollToPointer(event);
        }
      }}
    >
      <div
        className="library-scrollbar__thumb"
        ref={thumbRef}
        style={{ height: rail.thumbHeight }}
        onPointerDown={(event) => {
          const element = scrollRef.current;
          if (!element) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { startY: event.clientY, startScroll: element.scrollTop };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const element = scrollRef.current;
          const drag = dragRef.current;
          if (!element || !drag) {
            return;
          }
          const thumbHeight = getScrollRailThumbHeight(element, rail.height);
          const track = Math.max(1, rail.height - thumbHeight);
          const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
          element.scrollTop =
            drag.startScroll + ((event.clientY - drag.startY) / track) * maxScroll;
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          dragRef.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragging(false);
        }}
      />
    </div>,
    document.body,
  );
}

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const invalidate = useInvalidateLibrary();
  const density = useAppearance((state) => state.density);
  const reduceMotion = useAppearance((state) => state.reduceMotion);
  const prefersReducedMotion = useReducedMotion();
  const motionOff = reduceMotion || Boolean(prefersReducedMotion);
  const roots = useLibraryRoots();
  const scan = useLibraryScan();
  useDeepLinkFocus();
  const {
    state: scanState,
    importing,
    start: startScan,
    pickAndStart,
    cancel: cancelScan,
    close: closeScan,
    importSelected,
    retry: retryScan,
  } = scan;

  const q = searchParams.get("q") ?? "";
  const favoriteOnly = searchParams.get("favorite") === "1";
  const [queryInput, setQueryInput] = useState(q);
  const [filter, setFilter] = useState<LibraryFilter>(() => {
    if (searchParams.get("favorite") === "1") {
      return "all";
    }
    const status = searchParams.get("status");
    return filters.some((entry) => entry.id === status) ? (status as LibraryFilter) : "all";
  });
  const storedSort = useLibraryPreferences((state) => state.sort);
  const storedView = useLibraryPreferences((state) => state.view);
  const cardContent = useLibraryPreferences((state) => state.cardContent);
  const setStoredSort = useLibraryPreferences((state) => state.setSort);
  const setStoredView = useLibraryPreferences((state) => state.setView);
  const setCardContent = useLibraryPreferences((state) => state.setCardContent);
  const [sort, setSortState] = useState<LibrarySort>(() => {
    const value = searchParams.get("sort");
    return sortOptions.some((entry) => entry.id === value) ? (value as LibrarySort) : storedSort;
  });
  const [view, setViewState] = useState<LibraryViewMode>(storedView);
  const setSort = useCallback(
    (nextSort: LibrarySort) => {
      setSortState(nextSort);
      setStoredSort(nextSort);
    },
    [setStoredSort],
  );
  const setView = useCallback(
    (nextView: LibraryViewMode) => {
      setViewState(nextView);
      setStoredView(nextView);
    },
    [setStoredView],
  );
  const [rootMenuOpen, setRootMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [confirmBatchRemove, setConfirmBatchRemove] = useState(false);
  const [batchRemoveBusy, setBatchRemoveBusy] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedWorkIds, setSelectedWorkIds] = useState<Set<number>>(new Set());
  const [marquee, setMarquee] = useState<LibraryMarquee | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [steamOpen, setSteamOpen] = useState(false);
  const handledRequest = useRef<string | null>(null);
  const appliedUrlSort = useRef<string | null>(null);
  const marqueeDrag = useRef<MarqueeDragState | null>(null);
  const suppressCardClick = useRef(false);

  useEffect(() => {
    const value = searchParams.get("sort");
    if (!value) {
      appliedUrlSort.current = null;
      setSortState(storedSort);
      return;
    }
    if (value === appliedUrlSort.current) {
      return;
    }
    if (!sortOptions.some((entry) => entry.id === value)) {
      return;
    }
    appliedUrlSort.current = value;
    setSortState(value as LibrarySort);
  }, [searchParams, storedSort]);

  const toggleSelectedWork = useCallback((workId: number) => {
    setSelectedWorkIds((current) => {
      const next = new Set(current);
      if (next.has(workId)) {
        next.delete(workId);
      } else {
        next.add(workId);
      }
      return next;
    });
  }, []);

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedWorkIds(new Set());
    setBatchOpen(false);
    setMarquee(null);
    marqueeDrag.current = null;
  };

  useEffect(() => {
    if (!selectionMode) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !batchOpen) {
        exitSelectionMode();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [batchOpen, selectionMode]);

  useEffect(() => {
    setQueryInput(q);
  }, [q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextValue = queryInput.trim();
      if (nextValue === q) {
        return;
      }
      const next = new URLSearchParams(searchParams);
      if (nextValue) {
        next.set("q", nextValue);
      } else {
        next.delete("q");
      }
      setSearchParams(next, { replace: true });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [q, queryInput, searchParams, setSearchParams]);

  useEffect(() => {
    const importRequested = searchParams.get("import");
    const scanRequested = searchParams.get("scanRoot");
    const request = importRequested
      ? "import:" + importRequested
      : scanRequested
        ? "scan:" + scanRequested
        : null;

    if (!request) {
      handledRequest.current = null;
      return;
    }
    if (handledRequest.current === request) {
      return;
    }
    handledRequest.current = request;

    const next = new URLSearchParams(searchParams);
    next.delete("import");
    next.delete("scanRoot");
    setSearchParams(next, { replace: true });

    if (importRequested) {
      void pickAndStart();
    } else if (scanRequested) {
      void startScan(scanRequested);
    }
  }, [pickAndStart, searchParams, setSearchParams, startScan]);

  const library = useLibraryInfinite({
    search: q,
    status: favoriteOnly ? "all" : filter,
    sort,
    favoriteOnly,
  });
  const summary = useLibrarySummary();
  const items = useMemo(
    () => library.data?.pages.flatMap((page) => page.items) ?? [],
    [library.data],
  );
  const counts = summary.data?.counts ?? library.data?.pages[0]?.counts ?? emptyCounts;
  const total = library.data?.pages[0]?.total ?? 0;
  const currentSort =
    sortOptions.find((option) => option.id === sort) ??
    sortOptions.find((option) => option.id === DEFAULT_LIBRARY_SORT)!;
  const currentCardContent =
    cardContentOptions.find((option) => option.id === cardContent) ?? cardContentOptions[0]!;
  const CurrentContentIcon = currentCardContent.icon;
  const resultsKey = (favoriteOnly ? "favorite" : filter) + "|" + sort;
  const activeFilterKey = favoriteOnly ? "favorite" : filter;
  const filtersRef = useRef<HTMLDivElement>(null);
  const [filterHighlight, setFilterHighlight] = useState<FilterHighlight | null>(null);

  useLayoutEffect(() => {
    const container = filtersRef.current;
    if (!container) {
      return;
    }
    const update = () => {
      const button = container.querySelector<HTMLElement>(
        '[data-filter-key="' + activeFilterKey + '"]',
      );
      if (!button) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const next = {
        left: buttonRect.left - containerRect.left,
        top: buttonRect.top - containerRect.top,
        width: buttonRect.width,
        height: buttonRect.height,
      };
      setFilterHighlight((current) => {
        if (
          current &&
          Math.abs(current.left - next.left) < 0.5 &&
          Math.abs(current.top - next.top) < 0.5 &&
          Math.abs(current.width - next.width) < 0.5 &&
          Math.abs(current.height - next.height) < 0.5
        ) {
          return current;
        }
        return next;
      });
    };

    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(container);
    container.querySelectorAll<HTMLElement>("[data-filter-key]").forEach((button) => {
      observer?.observe(button);
    });
    return () => observer?.disconnect();
  }, [activeFilterKey, counts]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const wheelTargetRef = useRef(0);
  const wheelLastAtRef = useRef(0);
  const [viewportWidth, setViewportWidth] = useState(1100);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const update = () => setViewportWidth(element.clientWidth);
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [items.length, resultsKey, view]);

  useEffect(() => {
    const element = scrollRef.current;
    const page = element?.closest<HTMLElement>(".app-page");
    if (!element || !page) {
      return;
    }

    wheelTargetRef.current = element.scrollTop;
    wheelLastAtRef.current = 0;

    const relayWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey) {
        return;
      }
      if (event.target instanceof Node && element.contains(event.target)) {
        wheelTargetRef.current = element.scrollTop;
        return;
      }
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }
      const multiplier =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const now = performance.now();
      const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
      const base = now - wheelLastAtRef.current < 180 ? wheelTargetRef.current : element.scrollTop;
      const target = Math.min(maxScroll, Math.max(0, base + event.deltaY * multiplier));
      if (Math.abs(target - element.scrollTop) < 0.5) {
        return;
      }
      wheelTargetRef.current = target;
      wheelLastAtRef.current = now;
      event.preventDefault();
      element.scrollTo({ top: target, behavior: motionOff ? "auto" : "smooth" });
    };

    page.addEventListener("wheel", relayWheel, { passive: false });
    return () => page.removeEventListener("wheel", relayWheel);
  }, [items.length, motionOff, resultsKey, view]);

  const columns = useMemo(() => {
    const comfortable =
      viewportWidth >= 1520
        ? 7
        : viewportWidth >= 1080
          ? 6
          : viewportWidth >= 960
            ? 5
            : viewportWidth >= 760
              ? 4
              : viewportWidth >= 560
                ? 3
                : 2;
    return density === "compact" ? Math.min(7, comfortable + 1) : comfortable;
  }, [density, viewportWidth]);

  const gap = 18;
  const cardWidth = Math.max(120, (viewportWidth - gap * (columns - 1)) / columns);
  const cardMetaHeight =
    cardContent === "detailed"
      ? 126
      : cardContent === "balanced"
        ? 88
        : cardContent === "concise"
          ? 64
          : 32;
  const gridRowHeight = Math.round(cardWidth * 1.5 + cardMetaHeight);
  const rowCount = Math.ceil(items.length / columns);
  const [, setLayoutRevision] = useState(0);

  // TanStack Virtual exposes imperative measurement methods by design.
  // One virtualizer serves both views. A second, inactive instance would keep
  // listening to the same scroll container and re-render the page for ranges
  // it never displays. Direct DOM updates plus deferred React updates keep
  // scrolling off the render path; rows have fixed heights, so their inline
  // transforms only need to change when the visible range changes.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: view === "grid" ? rowCount : items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (view === "grid" ? gridRowHeight : 82),
    initialRect: { width: viewportWidth, height: 720 },
    overscan: view === "grid" ? 2 : 6,
    directDomUpdates: true,
    useFlushSync: false,
  });
  const virtualRows = virtualizer.getVirtualItems();

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTop = 0;
    }
    marqueeDrag.current = null;
    suppressCardClick.current = false;
    setMarquee(null);
  }, [favoriteOnly, filter, q, sort, view]);

  useLayoutEffect(() => {
    virtualizer.measure();
    // `measure()` clears the old row offsets, but direct DOM updates skip a
    // React render while the visible range is unchanged. Bump this revision
    // so the rows receive the new `row.start` values in the same commit.
    setLayoutRevision((revision) => revision + 1);
  }, [columns, gridRowHeight, resultsKey, view, virtualizer]);

  useEffect(() => {
    if (!library.hasNextPage || library.isFetchingNextPage) {
      return;
    }
    const last = virtualRows[virtualRows.length - 1];
    if (!last) {
      return;
    }
    const threshold = view === "grid" ? rowCount - 2 : items.length - 8;
    if (last.index >= threshold) {
      void library.fetchNextPage();
    }
  }, [items.length, library, rowCount, view, virtualRows]);

  useEffect(() => {
    if (!rootMenuOpen) {
      return;
    }
    const close = () => setRootMenuOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [rootMenuOpen]);

  const openContextMenu = useCallback((event: ReactMouseEvent, item: LibraryItem) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ item, x: event.clientX, y: event.clientY });
  }, []);

  const openMenuButton = useCallback((item: LibraryItem, x: number, y: number) => {
    setContextMenu({ item, x, y });
  }, []);

  const selectWorksInMarquee = (bounds: LibraryMarquee, canvas: HTMLElement, base: Set<number>) => {
    const canvasRect = canvas.getBoundingClientRect();
    const next = new Set(base);
    canvas.querySelectorAll<HTMLElement>("[data-work-id]").forEach((node) => {
      const workId = Number(node.dataset.workId);
      if (!Number.isInteger(workId)) {
        return;
      }
      const rect = node.getBoundingClientRect();
      const left = rect.left - canvasRect.left;
      const top = rect.top - canvasRect.top;
      const intersects =
        left < bounds.left + bounds.width &&
        left + rect.width > bounds.left &&
        top < bounds.top + bounds.height &&
        top + rect.height > bounds.top;
      if (intersects) {
        next.add(workId);
      }
    });
    setSelectedWorkIds((current) => {
      if (current.size === next.size && [...next].every((workId) => current.has(workId))) {
        return current;
      }
      return next;
    });
  };

  const startMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!selectionMode || event.button !== 0 || event.pointerType === "touch") {
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest("button, input, textarea, select")) {
      return;
    }
    const canvas = event.currentTarget.querySelector<HTMLElement>(".library-virtual-canvas");
    if (!canvas) {
      return;
    }
    const canvasRect = canvas.getBoundingClientRect();
    marqueeDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX - canvasRect.left,
      startY: event.clientY - canvasRect.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
      base: new Set(selectedWorkIds),
      active: false,
    };
    suppressCardClick.current = false;
    setMarquee(null);
  };

  const moveMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = marqueeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (
      !drag.active &&
      Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) < 5
    ) {
      return;
    }
    const canvas = event.currentTarget.querySelector<HTMLElement>(".library-virtual-canvas");
    if (!canvas) {
      return;
    }
    if (!drag.active) {
      drag.active = true;
      suppressCardClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    const canvasRect = canvas.getBoundingClientRect();
    const currentX = Math.min(Math.max(0, event.clientX - canvasRect.left), canvas.clientWidth);
    const currentY = Math.min(Math.max(0, event.clientY - canvasRect.top), canvas.scrollHeight);
    const bounds = {
      left: Math.min(drag.startX, currentX),
      top: Math.min(drag.startY, currentY),
      width: Math.abs(currentX - drag.startX),
      height: Math.abs(currentY - drag.startY),
    };
    setMarquee(bounds);
    selectWorksInMarquee(bounds, canvas, drag.base);
  };

  const finishMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = marqueeDrag.current;
    if (!drag) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }
    if (drag.active) {
      window.setTimeout(() => {
        suppressCardClick.current = false;
      }, 0);
    }
    marqueeDrag.current = null;
    setMarquee(null);
  };

  const blockClickAfterMarquee = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressCardClick.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const selectFilter = (nextFilter: LibraryFilter) => {
    setFilter(nextFilter);
    if (favoriteOnly) {
      const next = new URLSearchParams(searchParams);
      next.delete("favorite");
      next.delete("status");
      setSearchParams(next, { replace: true });
    }
  };

  const toggleFavoriteFilter = () => {
    setFilter("all");
    const next = new URLSearchParams(searchParams);
    if (favoriteOnly) {
      next.delete("favorite");
    } else {
      next.set("favorite", "1");
      next.delete("status");
    }
    setSearchParams(next, { replace: true });
  };

  const beginSelectionWith = (item: LibraryItem) => {
    setContextMenu(null);
    setSelectionMode(true);
    setSelectedWorkIds(new Set([item.workId]));
  };

  const confirmBatchRemoveWorks = async () => {
    const ids = [...selectedWorkIds];
    if (ids.length === 0) {
      setConfirmBatchRemove(false);
      return;
    }
    setBatchRemoveBusy(true);
    try {
      const results = await Promise.allSettled(ids.map((workId) => removeLibraryWork(workId)));
      const failedIds = ids.filter((_, index) => results[index]?.status === "rejected");
      invalidate();
      setConfirmBatchRemove(false);
      if (failedIds.length === 0) {
        toast.success("已移除 " + ids.length + " 部作品；游戏文件未删除。");
        exitSelectionMode();
      } else {
        setSelectedWorkIds(new Set(failedIds));
        toast.error("有 " + failedIds.length + " 部作品移除失败，已保留选择。");
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBatchRemoveBusy(false);
    }
  };

  const clearFilters = () => {
    setQueryInput("");
    setFilter("all");
    const next = new URLSearchParams(searchParams);
    next.delete("q");
    next.delete("favorite");
    next.delete("status");
    setSearchParams(next, { replace: true });
  };

  return (
    <HintProvider>
      <div className={cn("library-page", selectionMode && "is-selecting")}>
        <PageHeader
          title="游戏库"
          actions={
            <div className="library-head__actions">
              <div
                className="library-root-picker"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!roots.data?.length}
                  onClick={() => setRootMenuOpen((value) => !value)}
                >
                  <RefreshCw size={13} strokeWidth={1.6} />
                  重新扫描
                  <ChevronDown size={12} strokeWidth={1.6} />
                </Button>
                <AnimatePresence>
                  {rootMenuOpen && roots.data?.length ? (
                    <motion.div
                      className="library-root-menu"
                      role="menu"
                      initial={motionOff ? false : { opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.985 }}
                      transition={
                        motionOff ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }
                      }
                    >
                      <p className="library-root-menu__title">重新扫描目录</p>
                      {roots.data.map((root) => (
                        <button
                          type="button"
                          key={root.id}
                          role="menuitem"
                          aria-label={"重新扫描 " + root.path}
                          onClick={() => {
                            setRootMenuOpen(false);
                            void startScan(root.path);
                          }}
                        >
                          <span className="library-root-menu__icon" aria-hidden="true">
                            <FolderOpen size={15} strokeWidth={1.7} />
                          </span>
                          <span className="library-root-menu__copy">
                            <span className="library-root-menu__path">{root.path}</span>
                            <em>
                              {root.lastScannedAt
                                ? "上次 " + formatRelativeDate(root.lastScannedAt)
                                : "尚未扫描"}
                            </em>
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
              <Button variant="primary" size="sm" onClick={() => void pickAndStart()}>
                <FolderPlus size={14} strokeWidth={1.8} />
                添加目录
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setSteamOpen(true)}>
                <Gamepad2 size={14} strokeWidth={1.7} />
                扫描 Steam 库
              </Button>
            </div>
          }
        />

        <div className="library-toolbar" id="library-toolbar">
          <div className="library-filters" role="group" aria-label="游戏库筛选" ref={filtersRef}>
            {filterHighlight ? (
              <motion.span
                className="library-filter__active"
                aria-hidden="true"
                initial={false}
                animate={{
                  x: filterHighlight.left,
                  y: filterHighlight.top,
                  width: filterHighlight.width,
                  height: filterHighlight.height,
                }}
                transition={
                  motionOff ? { duration: 0 } : { type: "spring", stiffness: 430, damping: 36 }
                }
              />
            ) : null}
            {filters.map((entry) => {
              const Icon = entry.icon;
              const isFavorite = entry.id === "favorite";
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="library-filter"
                  data-filter-key={entry.id}
                  aria-pressed={isFavorite ? favoriteOnly : !favoriteOnly && filter === entry.id}
                  onClick={() => {
                    if (entry.id === "favorite") {
                      toggleFavoriteFilter();
                    } else {
                      selectFilter(entry.id);
                    }
                  }}
                >
                  <Icon
                    className="library-filter__icon"
                    size={13}
                    strokeWidth={1.7}
                    aria-hidden="true"
                  />
                  <span className="library-filter__label">{entry.label}</span>
                  <span className="library-filter__count">{counts[entry.id]}</span>
                </button>
              );
            })}
          </div>
          <div className="library-view-tools" role="group" aria-label="搜索与管理工具">
            <Hint label={selectionMode ? "退出多选" : "进入多选后可拖动框选作品"} side="bottom">
              <Button
                variant={selectionMode ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={selectionMode}
                onClick={() => {
                  if (selectionMode) {
                    exitSelectionMode();
                  } else {
                    setSelectionMode(true);
                    setSelectedWorkIds(new Set());
                  }
                }}
              >
                <ListChecks size={13} strokeWidth={1.6} />
                {selectionMode ? "退出多选" : "多选"}
              </Button>
            </Hint>
            <label className="library-search">
              <Search size={13} strokeWidth={1.6} />
              <input
                aria-label="搜索游戏库"
                placeholder="搜索标题、会社、路径"
                value={queryInput}
                onChange={(event) => setQueryInput(event.currentTarget.value)}
              />
              {queryInput ? (
                <button type="button" aria-label="清除搜索" onClick={() => setQueryInput("")}>
                  <X size={12} strokeWidth={1.7} />
                </button>
              ) : null}
            </label>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="library-sort-trigger"
                  aria-label={"排序方式：" + currentSort.label}
                >
                  <ArrowUpDown className="library-sort-trigger__icon" size={14} strokeWidth={1.7} />
                  <span>{currentSort.label}</span>
                  <ChevronDown
                    className="library-sort-trigger__chevron"
                    size={13}
                    strokeWidth={1.7}
                  />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="library-sort-menu"
                  align="end"
                  sideOffset={8}
                  collisionPadding={12}
                >
                  <p className="library-sort-menu__head">排序方式</p>
                  <DropdownMenu.RadioGroup
                    value={sort}
                    onValueChange={(value) => setSort(value as LibrarySort)}
                  >
                    {sortOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <DropdownMenu.RadioItem
                          key={option.id}
                          value={option.id}
                          className="library-sort-menu__item"
                        >
                          <Icon size={14} strokeWidth={1.7} aria-hidden="true" />
                          <span>{option.label}</span>
                          <DropdownMenu.ItemIndicator className="library-sort-menu__check">
                            <Check size={13} strokeWidth={2} />
                          </DropdownMenu.ItemIndicator>
                        </DropdownMenu.RadioItem>
                      );
                    })}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            {view === "grid" ? (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="library-sort-trigger library-content-trigger"
                    aria-label={"卡片内容：" + currentCardContent.label}
                  >
                    <CurrentContentIcon
                      className="library-sort-trigger__icon"
                      size={14}
                      strokeWidth={1.7}
                    />
                    <span>{currentCardContent.label}</span>
                    <ChevronDown
                      className="library-sort-trigger__chevron"
                      size={13}
                      strokeWidth={1.7}
                    />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="library-sort-menu library-content-menu"
                    align="end"
                    sideOffset={8}
                    collisionPadding={12}
                  >
                    <p className="library-sort-menu__head">卡片内容</p>
                    <DropdownMenu.RadioGroup
                      value={cardContent}
                      onValueChange={(value) => setCardContent(value as LibraryCardContent)}
                    >
                      {cardContentOptions.map((option) => {
                        const Icon = option.icon;
                        return (
                          <DropdownMenu.RadioItem
                            key={option.id}
                            value={option.id}
                            className="library-sort-menu__item"
                          >
                            <Icon size={14} strokeWidth={1.7} aria-hidden="true" />
                            <span>{option.label}</span>
                            <DropdownMenu.ItemIndicator className="library-sort-menu__check">
                              <Check size={13} strokeWidth={2} />
                            </DropdownMenu.ItemIndicator>
                          </DropdownMenu.RadioItem>
                        );
                      })}
                    </DropdownMenu.RadioGroup>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ) : null}
            <span className="library-view-toggle" role="group" aria-label="视图切换">
              <Hint label="封面视图" side="top">
                <button
                  type="button"
                  aria-label="封面视图"
                  aria-pressed={view === "grid"}
                  onClick={() => setView("grid")}
                >
                  {view === "grid" ? (
                    <motion.span
                      className="library-view-toggle__active"
                      layoutId="library-view-active"
                      transition={
                        motionOff
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 460, damping: 38 }
                      }
                      aria-hidden="true"
                    />
                  ) : null}
                  <Grid2X2 size={15} strokeWidth={1.7} />
                </button>
              </Hint>
              <Hint label="列表视图" side="top">
                <button
                  type="button"
                  aria-label="列表视图"
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  {view === "list" ? (
                    <motion.span
                      className="library-view-toggle__active"
                      layoutId="library-view-active"
                      transition={
                        motionOff
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 460, damping: 38 }
                      }
                      aria-hidden="true"
                    />
                  ) : null}
                  <List size={15} strokeWidth={1.7} />
                </button>
              </Hint>
            </span>
          </div>
        </div>

        {library.isPending ? (
          <div className="library-state library-state--loading">
            <LibrarySkeleton columns={columns} />
          </div>
        ) : library.isError ? (
          <div className="library-state">
            <EmptyState
              title="无法读取游戏库"
              description={String(library.error)}
              action={
                <Button variant="secondary" size="sm" onClick={() => void library.refetch()}>
                  重试
                </Button>
              }
            />
          </div>
        ) : items.length === 0 ? (
          <div className="library-state">
            <EmptyState
              title={q || filter !== "all" || favoriteOnly ? "没有找到游戏" : "游戏库还是空的"}
              description={
                q || filter !== "all" || favoriteOnly
                  ? "换个关键词，或清除当前筛选。"
                  : "选择包含游戏的文件夹，扫描后确认主程序。"
              }
              action={
                q || filter !== "all" || favoriteOnly ? (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    清除筛选
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => void pickAndStart()}>
                    <FolderPlus size={14} strokeWidth={1.8} />
                    添加游戏目录
                  </Button>
                )
              }
            />
          </div>
        ) : view === "grid" ? (
          <div
            id="library-grid"
            className={cn("library-scroll", selectionMode && "is-selection-mode")}
            key={"grid|" + resultsKey}
            ref={scrollRef}
            aria-label="游戏列表"
            onPointerDown={startMarquee}
            onPointerMove={moveMarquee}
            onPointerUp={finishMarquee}
            onPointerCancel={finishMarquee}
            onClickCapture={blockClickAfterMarquee}
          >
            <div className="library-virtual-canvas" ref={virtualizer.containerRef}>
              {virtualRows.map((row) => (
                <div
                  className="library-virtual-row"
                  key={row.key}
                  style={{
                    transform: "translateY(" + row.start + "px)",
                    gridTemplateColumns: "repeat(" + columns + ", minmax(0, 1fr))",
                    gap: "30px " + gap + "px",
                  }}
                >
                  {items
                    .slice(row.index * columns, row.index * columns + columns)
                    .map((item, columnIndex) => (
                      <LibraryCard
                        key={libraryItemId(item)}
                        item={item}
                        revealDelay={Math.min(row.index, 4) * 28 + columnIndex * 20}
                        content={cardContent}
                        onContextMenu={openContextMenu}
                        onMenuButton={openMenuButton}
                        selectable={selectionMode}
                        selected={selectedWorkIds.has(item.workId)}
                        onToggleSelect={toggleSelectedWork}
                      />
                    ))}
                </div>
              ))}
              <LibraryMarqueeMask bounds={marquee} motionOff={motionOff} />
            </div>
          </div>
        ) : (
          <div className="library-list-shell">
            <div
              className={cn("library-list-head", selectionMode && "is-selectable")}
              aria-hidden="true"
            >
              {selectionMode ? <span /> : null}
              <span />
              <span>作品</span>
              <span>开发商</span>
              <span>来源</span>
              <span>容量</span>
              <span>最近活动</span>
              <span>状态</span>
            </div>
            <div
              id="library-grid"
              className={cn("library-scroll is-list-view", selectionMode && "is-selection-mode")}
              key={"list|" + resultsKey}
              ref={scrollRef}
              aria-label="游戏列表"
              onPointerDown={startMarquee}
              onPointerMove={moveMarquee}
              onPointerUp={finishMarquee}
              onPointerCancel={finishMarquee}
              onClickCapture={blockClickAfterMarquee}
            >
              <div
                className="library-virtual-canvas library-virtual-canvas--list"
                ref={virtualizer.containerRef}
              >
                {virtualRows.map((row) => {
                  const item = items[row.index];
                  if (!item) {
                    return null;
                  }
                  return (
                    <div
                      className="library-virtual-list-row"
                      key={row.key}
                      style={{ transform: "translateY(" + row.start + "px)" }}
                    >
                      <LibraryRow
                        item={item}
                        revealDelay={row.index < 8 ? row.index * 16 : 0}
                        onContextMenu={openContextMenu}
                        selectable={selectionMode}
                        selected={selectedWorkIds.has(item.workId)}
                        onToggleSelect={toggleSelectedWork}
                      />
                    </div>
                  );
                })}
                <LibraryMarqueeMask bounds={marquee} motionOff={motionOff} />
              </div>
            </div>
          </div>
        )}

        <LibraryScrollRail
          scrollRef={scrollRef}
          layoutKey={view + "|" + resultsKey}
          contentKey={items.length + "|" + total}
        />

        <AnimatePresence>
          {selectionMode ? (
            <motion.div
              className="library-batch-bar"
              role="region"
              aria-label="多选操作"
              initial={motionOff ? false : { opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.985 }}
              transition={
                motionOff ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }
              }
            >
              <div>
                <ListChecks size={15} strokeWidth={1.6} />
                <span>
                  已选 <b>{selectedWorkIds.size}</b> 部作品
                </span>
                <span className="library-batch-bar__hint">
                  {view === "grid" ? "拖动框选" : "拖动列表行框选"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="library-batch-exit"
                  onClick={exitSelectionMode}
                >
                  <X size={13} strokeWidth={1.7} />
                  退出多选
                </Button>
              </div>
              <div className="library-batch-bar__actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelectedWorkIds((current) => {
                      const next = new Set(current);
                      for (const item of items) {
                        next.add(item.workId);
                      }
                      return next;
                    })
                  }
                >
                  全选
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedWorkIds(new Set())}>
                  清空
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="library-batch-remove"
                  disabled={selectedWorkIds.size === 0}
                  onClick={() => setConfirmBatchRemove(true)}
                >
                  <Trash2 size={13} strokeWidth={1.7} />
                  批量移除
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={selectedWorkIds.size === 0}
                  onClick={() => setBatchOpen(true)}
                >
                  <ListChecks size={14} /> 批量刮削
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <WorkContextMenu
          anchor={contextMenu}
          detailState={libraryDetailState}
          onClose={() => setContextMenu(null)}
          onBeginSelection={beginSelectionWith}
        />

        <ScanImportDialog
          state={scanState}
          importing={importing}
          onCancel={() => void cancelScan()}
          onClose={closeScan}
          onRetry={() => void retryScan()}
          onPickAnother={() => {
            closeScan();
            void pickAndStart();
          }}
          onImport={(candidates) => {
            void importSelected(candidates)
              .then((result) => {
                const parts: string[] = [];
                if (result.imported) {
                  parts.push("新增 " + result.imported + " 部");
                }
                if (result.updated) {
                  parts.push("更新 " + result.updated + " 部");
                }
                toast.success(parts.join("，") || "已更新游戏库");
              })
              .catch((error) => toast.error(String(error)));
          }}
        />

        {batchOpen ? (
          <BatchScrapeDialog
            open
            workIds={[...selectedWorkIds]}
            onClose={() => {
              setBatchOpen(false);
              invalidate();
            }}
            onApplied={invalidate}
          />
        ) : null}

        {steamOpen ? (
          <SteamLibraryDialog open onClose={() => setSteamOpen(false)} onImported={invalidate} />
        ) : null}

        <ConfirmDialog
          open={confirmBatchRemove}
          onOpenChange={(open) => {
            if (!open) {
              setConfirmBatchRemove(false);
            }
          }}
          title={"从库中移除所选 " + selectedWorkIds.size + " 部作品？"}
          description="只会删除 MiyuManager 的管理记录，不会删除游戏文件。后续扫描会跳过它们；可在设置 → 游戏库 → 管理排除项中恢复。"
          confirmLabel={"移除 " + selectedWorkIds.size + " 部"}
          busy={batchRemoveBusy}
          onConfirm={() => void confirmBatchRemoveWorks()}
        />
      </div>
    </HintProvider>
  );
}
