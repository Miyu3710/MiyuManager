import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Check,
  ChevronDown,
  FolderInput,
  FolderPlus,
  Gamepad2,
  Grid2X2,
  ListChecks,
  List,
  MoreHorizontal,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAppearance } from "../../app/useAppearance";
import { Button } from "../../design-system/components/Button";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import { CoverArt } from "../../design-system/components/CoverArt";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Tag } from "../../design-system/components/Tag";
import { cn } from "../../lib/cn";
import { formatBytes, formatRelativeDate } from "../../lib/format";
import {
  libraryItemId,
  libraryItemToGame,
  removeLibraryWork,
  setLibraryFavorite,
  setLibraryStatus,
} from "../../lib/library-api";
import type {
  LibraryCounts,
  LibraryFilter,
  LibraryItem,
  LibrarySort,
  LibraryStatus,
} from "../../lib/library-types";
import { ScanImportDialog } from "./ScanImportDialog";
import { BatchScrapeDialog } from "../metadata/BatchScrapeDialog";
import { SteamLibraryDialog } from "./SteamLibraryDialog";
import { useInvalidateLibrary, useLibraryInfinite, useLibraryRoots } from "./useLibrary";
import { useLibraryScan } from "./useLibraryScan";
import "./library.css";

type ViewMode = "grid" | "list";

interface ContextMenuState {
  item: LibraryItem;
  left: number;
  top: number;
}

const filters: { id: LibraryFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "unclassified", label: "未分类" },
  { id: "playing", label: "在玩" },
  { id: "queued", label: "想玩" },
  { id: "finished", label: "已通关" },
  { id: "paused", label: "搁置" },
];

const statusOptions: LibraryStatus[] = ["unclassified", "playing", "queued", "finished", "paused"];

const statusLabels: Record<LibraryStatus, string> = {
  unclassified: "未分类",
  playing: "在玩",
  queued: "想玩",
  finished: "已通关",
  paused: "搁置",
};

const sortOptions: { id: LibrarySort; label: string }[] = [
  { id: "added_desc", label: "最近入库" },
  { id: "title_asc", label: "标题" },
  { id: "size_desc", label: "安装大小" },
  { id: "last_played_desc", label: "最近启动" },
];

const emptyCounts: LibraryCounts = {
  all: 0,
  unclassified: 0,
  playing: 0,
  queued: 0,
  finished: 0,
  paused: 0,
};

function menuPosition(x: number, y: number) {
  return {
    left: Math.min(x, Math.max(12, window.innerWidth - 244)),
    top: Math.min(y, Math.max(12, window.innerHeight - 372)),
  };
}

function statusTone(status: LibraryStatus): "status" | "data" | "muted" {
  if (status === "playing") {
    return "status";
  }
  if (status === "finished") {
    return "data";
  }
  return "muted";
}

function LibraryCard({
  item,
  onContextMenu,
  onMenuButton,
  selectable,
  selected,
  onToggleSelect,
}: {
  item: LibraryItem;
  onContextMenu: (event: ReactMouseEvent, item: LibraryItem) => void;
  onMenuButton: (item: LibraryItem, x: number, y: number) => void;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
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
      onContextMenu={(event) => onContextMenu(event, item)}
      data-work-id={item.workId}
    >
      <Link
        to={"/work/" + libraryItemId(item)}
        className="library-card"
        onClick={(event) => {
          if (selectable) {
            event.preventDefault();
            onToggleSelect();
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
          {item.steamAppId ? (
            <span className="library-origin" title={`Steam 库 AppID ${item.steamAppId}`}>
              Steam
            </span>
          ) : null}
          {game.favorite ? (
            <span className="library-favorite" aria-label="已收藏">
              <Star size={11} fill="currentColor" strokeWidth={0} />
            </span>
          ) : null}
        </div>
        <div className="library-card__meta">
          <h3>{game.title}</h3>
          {game.originalTitle ? <p>{game.originalTitle}</p> : <p>本地副本</p>}
          <span className={cn("library-card__meta-line", "is-" + game.status)}>
            {statusLabels[game.status]}
            {game.developer ? "　" + game.developer : ""}
            {game.year ? "，" + game.year : ""}
          </span>
          <span className="library-card__activity">{activityLine}</span>
        </div>
      </Link>
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
}

function LibraryRow({
  item,
  onContextMenu,
  selectable,
  selected,
  onToggleSelect,
}: {
  item: LibraryItem;
  onContextMenu: (event: ReactMouseEvent, item: LibraryItem) => void;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const game = libraryItemToGame(item);
  return (
    <Link
      to={"/work/" + libraryItemId(item)}
      className={cn("library-row", selectable && "is-selectable", selected && "is-selected")}
      onContextMenu={(event) => onContextMenu(event, item)}
      onClick={(event) => {
        if (selectable) {
          event.preventDefault();
          onToggleSelect();
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
        <h3>{game.title}</h3>
        <p>{game.originalTitle || "本地副本"}</p>
      </div>
      <span>{game.developer}</span>
      <span>{item.steamAppId ? "Steam 本地安装" : game.isLocal ? "本地安装" : game.engine}</span>
      <span>{game.isLocal ? formatBytes(item.sizeBytes) : game.playtime}</span>
      <span>
        {game.isLocal ? "入库 " + formatRelativeDate(item.addedAt) : "上次 " + game.lastPlayed}
      </span>
      <Tag tone={statusTone(item.status)}>{statusLabels[item.status]}</Tag>
    </Link>
  );
}

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

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const invalidate = useInvalidateLibrary();
  const density = useAppearance((state) => state.density);
  const roots = useLibraryRoots();
  const scan = useLibraryScan();
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
    const status = searchParams.get("status");
    return filters.some((entry) => entry.id === status) ? (status as LibraryFilter) : "all";
  });
  const [sort, setSort] = useState<LibrarySort>(() => {
    const value = searchParams.get("sort");
    return sortOptions.some((entry) => entry.id === value) ? (value as LibrarySort) : "added_desc";
  });
  const [view, setView] = useState<ViewMode>("grid");
  const [rootMenuOpen, setRootMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<LibraryItem | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedWorkIds, setSelectedWorkIds] = useState<Set<number>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [steamOpen, setSteamOpen] = useState(false);
  const handledRequest = useRef<string | null>(null);

  const toggleSelectedWork = (workId: number) => {
    setSelectedWorkIds((current) => {
      const next = new Set(current);
      if (next.has(workId)) {
        next.delete(workId);
      } else {
        next.add(workId);
      }
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedWorkIds(new Set());
    setBatchOpen(false);
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

  const library = useLibraryInfinite({ search: q, status: filter, sort, favoriteOnly });
  const items = useMemo(
    () => library.data?.pages.flatMap((page) => page.items) ?? [],
    [library.data],
  );
  const counts = library.data?.pages[0]?.counts ?? emptyCounts;
  const total = library.data?.pages[0]?.total ?? 0;

  const scrollRef = useRef<HTMLDivElement>(null);
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
  }, [items.length, view]);

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
              : 3;
    return density === "compact" ? Math.min(7, comfortable + 1) : comfortable;
  }, [density, viewportWidth]);

  const gap = 16;
  const cardWidth = Math.max(120, (viewportWidth - gap * (columns - 1)) / columns);
  const gridRowHeight = Math.round(cardWidth * 1.5 + 124);
  const rowCount = Math.ceil(items.length / columns);

  // TanStack Virtual exposes imperative measurement methods by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const gridVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => gridRowHeight,
    initialRect: { width: viewportWidth, height: 720 },
    overscan: 2,
  });
  const listVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 68,
    initialRect: { width: viewportWidth, height: 720 },
    overscan: 6,
  });
  const virtualizer = view === "grid" ? gridVirtualizer : listVirtualizer;
  const virtualRows = virtualizer.getVirtualItems();

  useEffect(() => {
    virtualizer.measure();
  }, [columns, gridRowHeight, view, virtualizer]);

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
    if (!contextMenu) {
      return;
    }
    const close = () => setContextMenu(null);
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
  }, [contextMenu]);

  useEffect(() => {
    if (!rootMenuOpen) {
      return;
    }
    const close = () => setRootMenuOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [rootMenuOpen]);

  const openContextMenu = (event: ReactMouseEvent, item: LibraryItem) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ item, ...menuPosition(event.clientX, event.clientY) });
  };

  const openMenuButton = (item: LibraryItem, x: number, y: number) => {
    setContextMenu({ item, ...menuPosition(x, y) });
  };

  const changeStatus = async (item: LibraryItem, status: LibraryStatus) => {
    setContextMenu(null);
    try {
      await setLibraryStatus(item.workId, status);
      invalidate();
      toast.success("已标记为" + statusLabels[status]);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const toggleFavorite = async (item: LibraryItem) => {
    setContextMenu(null);
    try {
      await setLibraryFavorite(item.workId, !item.favorite);
      invalidate();
      toast.success(item.favorite ? "已取消收藏" : "已收藏");
    } catch (error) {
      toast.error(String(error));
    }
  };

  const removeWork = (item: LibraryItem) => {
    setContextMenu(null);
    setConfirmRemove(item);
  };

  const confirmRemoveWork = async () => {
    if (!confirmRemove) {
      return;
    }
    setRemoveBusy(true);
    try {
      await removeLibraryWork(confirmRemove.workId);
      invalidate();
      setConfirmRemove(null);
      toast.success("已从库中移除；后续扫描会跳过，需要重新加入时使用手动导入。");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setRemoveBusy(false);
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
    <div className="library-page">
      <header className="library-head">
        <div>
          <h1>游戏库</h1>
          <p className="library-head__summary">
            {total} 部游戏，{counts.playing} 部在玩，{roots.data?.length ?? 0} 个扫描目录
            {q ? "，搜索“" + q + "”" : ""}
          </p>
        </div>
        <div className="library-head__actions">
          <div className="library-root-picker" onPointerDown={(event) => event.stopPropagation()}>
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
            {rootMenuOpen && roots.data?.length ? (
              <div className="library-root-menu" role="menu">
                <p>选择扫描根目录</p>
                {roots.data.map((root) => (
                  <button
                    type="button"
                    key={root.id}
                    onClick={() => {
                      setRootMenuOpen(false);
                      void startScan(root.path);
                    }}
                  >
                    <span>{root.path}</span>
                    <em>
                      {root.lastScannedAt
                        ? "上次 " + formatRelativeDate(root.lastScannedAt)
                        : "尚未扫描"}
                    </em>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <Button variant="primary" size="sm" onClick={() => void pickAndStart()}>
            <FolderPlus size={14} strokeWidth={1.8} />
            添加目录
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setSteamOpen(true)}>
            <Gamepad2 size={14} strokeWidth={1.7} />
            扫描 Steam 库
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="选择单个游戏目录，包含已排除的游戏"
            onClick={() => void pickAndStart(true)}
          >
            <FolderInput size={14} strokeWidth={1.8} />
            手动导入
          </Button>
        </div>
      </header>

      <div className="library-toolbar">
        <div className="library-filters" role="group" aria-label="游玩状态筛选">
          {filters.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={filter === entry.id}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
              <span>{counts[entry.id]}</span>
            </button>
          ))}
          <button
            type="button"
            aria-pressed={favoriteOnly}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              if (favoriteOnly) {
                next.delete("favorite");
              } else {
                next.set("favorite", "1");
              }
              setSearchParams(next, { replace: true });
            }}
          >
            <Star size={12} strokeWidth={1.6} /> 收藏
          </button>
        </div>
        <div className="library-view-tools">
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
            {selectionMode ? "退出批量" : "批量刮削"}
          </Button>
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
          <label className="library-sort">
            <span className="sr-only">排序方式</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.currentTarget.value as LibrarySort)}
            >
              {sortOptions.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={12} strokeWidth={1.6} />
          </label>
          <span className="library-view-toggle">
            <button
              type="button"
              aria-label="封面视图"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <Grid2X2 size={14} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="列表视图"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={14} strokeWidth={1.5} />
            </button>
          </span>
        </div>
      </div>

      {library.isPending ? (
        <LibrarySkeleton columns={columns} />
      ) : library.isError ? (
        <EmptyState
          title="无法读取游戏库"
          description={String(library.error)}
          action={
            <Button variant="secondary" size="sm" onClick={() => void library.refetch()}>
              重试
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={q || filter !== "all" || favoriteOnly ? "没有找到游戏" : "游戏库还是空的"}
          description={
            q || filter !== "all" || favoriteOnly
              ? "换一个标题、会社或路径，或者清除当前搜索和筛选条件。"
              : "选择包含 Galgame / AVG 的文件夹，扫描可执行文件并确认主程序。扫描只读取文件名和大小，不修改游戏目录。"
          }
          action={
            q || filter !== "all" || favoriteOnly ? (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                清除搜索和筛选
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => void pickAndStart()}>
                <FolderPlus size={14} strokeWidth={1.8} />
                添加游戏目录
              </Button>
            )
          }
        />
      ) : view === "grid" ? (
        <div className="library-scroll" ref={scrollRef}>
          <div
            className="library-virtual-canvas"
            style={{ height: gridVirtualizer.getTotalSize() }}
          >
            {gridVirtualizer.getVirtualItems().map((row) => (
              <div
                className="library-virtual-row"
                key={row.key}
                style={{
                  transform: "translateY(" + row.start + "px)",
                  gridTemplateColumns: "repeat(" + columns + ", minmax(0, 1fr))",
                  gap: "26px " + gap + "px",
                }}
              >
                {items.slice(row.index * columns, row.index * columns + columns).map((item) => (
                  <LibraryCard
                    key={libraryItemId(item)}
                    item={item}
                    onContextMenu={openContextMenu}
                    onMenuButton={openMenuButton}
                    selectable={selectionMode}
                    selected={selectedWorkIds.has(item.workId)}
                    onToggleSelect={() => toggleSelectedWork(item.workId)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="library-scroll" ref={scrollRef}>
          <div
            className="library-virtual-canvas library-virtual-canvas--list"
            style={{ height: listVirtualizer.getTotalSize() }}
          >
            {listVirtualizer.getVirtualItems().map((row) => {
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
                    onContextMenu={openContextMenu}
                    selectable={selectionMode}
                    selected={selectedWorkIds.has(item.workId)}
                    onToggleSelect={() => toggleSelectedWork(item.workId)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {items.length > 0 ? (
        <footer className="library-foot">
          <span>
            已显示 {items.length} / {total}
          </span>
          <span>
            {library.isFetchingNextPage
              ? "正在加载更多…"
              : library.hasNextPage
                ? "继续滚动加载更多"
                : "已显示全部"}
          </span>
        </footer>
      ) : null}

      {selectionMode ? (
        <div className="library-batch-bar" role="region" aria-label="批量刮削选择">
          <div>
            <ListChecks size={15} strokeWidth={1.6} />
            <span>
              已选 <b>{selectedWorkIds.size}</b> 部作品
            </span>
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
              全选已加载
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedWorkIds(new Set())}>
              清空
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={selectedWorkIds.size === 0}
              onClick={() => setBatchOpen(true)}
            >
              <ListChecks size={14} /> 开始批量刮削
            </Button>
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <div
          className="library-context"
          style={{ left: contextMenu.left, top: contextMenu.top }}
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => navigate("/work/" + libraryItemId(contextMenu.item))}
          >
            打开详情
          </button>
          <div className="library-context__group">
            <p>游玩状态</p>
            {statusOptions.map((status) => (
              <button
                type="button"
                key={status}
                onClick={() => void changeStatus(contextMenu.item, status)}
              >
                <span>{statusLabels[status]}</span>
                {contextMenu.item.status === status ? <Check size={12} strokeWidth={1.8} /> : null}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void toggleFavorite(contextMenu.item)}>
            <Star size={12} strokeWidth={1.6} />
            {contextMenu.item.favorite ? "取消收藏" : "加入收藏"}
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() => void removeWork(contextMenu.item)}
          >
            <Trash2 size={12} strokeWidth={1.6} />
            从库中移除
          </button>
        </div>
      ) : null}

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
        open={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmRemove(null);
          }
        }}
        title={"从库中移除「" + (confirmRemove?.title ?? "") + "」？"}
        description="只会删除 MiyuManager 的管理记录，不会删除游戏文件。后续扫描会跳过它；需要重新加入时使用“手动导入”。"
        confirmLabel="从库中移除"
        busy={removeBusy}
        onConfirm={() => void confirmRemoveWork()}
      />
    </div>
  );
}
