import { Dialog } from "radix-ui";
import { BarChart3, Clock3, FolderHeart, Home, Library, Search, Settings2, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CoverArt } from "../../design-system/components/CoverArt";
import { Tag } from "../../design-system/components/Tag";
import { statusLabels } from "../../lib/game-data";
import { libraryItemToGame } from "../../lib/library-api";
import type { CollectionSummary, LibraryItem } from "../../lib/library-types";
import { useGlobalSearchResults } from "../library/useLibrary";
import { useCollections } from "../collections/useCollections";
import { workLinkState, workOriginForPath } from "../../lib/work-navigation";
import "./global-search.css";

const RECENT_KEY = "miyu-recent-searches";
const MAX_RECENT = 6;

type ResultItem =
  | { kind: "work"; id: string; label: string; detail: string; item: LibraryItem }
  | { kind: "collection"; id: string; label: string; detail: string; collection: CollectionSummary }
  | { kind: "action"; id: string; label: string; detail: string; to: string };

function readRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const value = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

function writeRecentSearches(value: string[]) {
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(value.slice(0, MAX_RECENT)));
}

interface GlobalSearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchPalette({ open, onOpenChange }: GlobalSearchPaletteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() => readRecentSearches());
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);
  const works = useGlobalSearchResults(deferredQuery);
  const collections = useCollections();
  const trimmed = deferredQuery.trim();

  const collectionResults = useMemo(() => {
    const entries = collections.data ?? [];
    if (!trimmed) {
      return [];
    }
    const needle = trimmed.toLocaleLowerCase();
    return entries
      .filter((collection) => collection.name.toLocaleLowerCase().includes(needle))
      .slice(0, 4);
  }, [collections.data, trimmed]);

  const results = useMemo<ResultItem[]>(() => {
    if (!trimmed) {
      return [];
    }
    const workResults: ResultItem[] = (works.data?.items ?? []).map((item) => ({
      kind: "work",
      id: "work-" + item.workId,
      label: item.title,
      detail: [item.originalTitle, item.developer, statusLabels[item.status]]
        .filter(Boolean)
        .join("，"),
      item,
    }));
    const collectionItems: ResultItem[] = collectionResults.map((collection) => ({
      kind: "collection",
      id: "collection-" + collection.id,
      label: collection.name,
      detail: collection.workCount + " 部作品",
      collection,
    }));
    return [
      ...workResults,
      ...collectionItems,
      {
        kind: "action",
        id: "view-all",
        label: "在游戏库查看全部结果",
        detail: trimmed,
        to: "/library?q=" + encodeURIComponent(trimmed),
      },
    ];
  }, [collectionResults, trimmed, works.data?.items]);

  const recordSearch = (value: string) => {
    const next = [value, ...recent.filter((entry) => entry !== value)].slice(0, MAX_RECENT);
    setRecent(next);
    writeRecentSearches(next);
  };

  const choose = (result: ResultItem) => {
    if (trimmed) {
      recordSearch(trimmed);
    }
    onOpenChange(false);
    if (result.kind === "work") {
      navigate("/work/" + result.item.workId, {
        state: workLinkState(workOriginForPath(location)),
      });
    } else if (result.kind === "collection") {
      navigate("/collections/" + result.collection.id);
    } else {
      navigate(result.to);
    }
  };

  const quickActions: ResultItem[] = [
    { kind: "action", id: "home", label: "首页", detail: "最近游玩与本地游戏库概览", to: "/" },
    {
      kind: "action",
      id: "library",
      label: "游戏库",
      detail: "筛选、排序和管理本地作品",
      to: "/library",
    },
    {
      kind: "action",
      id: "collections",
      label: "收藏集",
      detail: "整理手动收藏的作品分组",
      to: "/collections",
    },
    { kind: "action", id: "stats", label: "统计", detail: "游玩时长与会话记录", to: "/stats" },
    {
      kind: "action",
      id: "settings",
      label: "设置",
      detail: "扫描、来源、启动器与数据",
      to: "/settings",
    },
  ];
  const visibleItems = trimmed ? results : quickActions;

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(visibleItems.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      const active = visibleItems[activeIndex];
      if (active) {
        event.preventDefault();
        choose(active);
      }
    }
  };

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const groups = trimmed
    ? [
        { label: "作品", items: results.filter((item) => item.kind === "work") },
        { label: "收藏集", items: results.filter((item) => item.kind === "collection") },
        { label: "操作", items: results.filter((item) => item.kind === "action") },
      ].filter((group) => group.items.length > 0)
    : [{ label: "快速前往", items: quickActions }];

  let runningIndex = 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="global-search__overlay" />
        <Dialog.Content
          className="global-search"
          aria-describedby="global-search-description"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <Dialog.Title className="sr-only">全局搜索</Dialog.Title>
          <Dialog.Description id="global-search-description" className="sr-only">
            搜索作品标题、原题、别名、标签和收藏集。
          </Dialog.Description>
          <header className="global-search__head">
            <Search size={18} strokeWidth={1.6} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="搜索作品、别名、标签或收藏集"
              aria-label="全局搜索"
              role="combobox"
              aria-expanded="true"
              aria-controls="global-search-results"
              aria-activedescendant={
                visibleItems[activeIndex]
                  ? "global-search-" + visibleItems[activeIndex].id
                  : undefined
              }
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                className="global-search__clear"
                aria-label="清空搜索"
                onClick={() => setQuery("")}
              >
                <X size={14} strokeWidth={1.8} />
              </button>
            ) : (
              <kbd>Esc</kbd>
            )}
          </header>

          <div
            className="global-search__body"
            id="global-search-results"
            role="listbox"
            ref={listRef}
          >
            {!trimmed ? (
              recent.length > 0 ? (
                <section className="global-search__section" aria-label="最近搜索">
                  <p className="global-search__label">
                    <Clock3 size={12} strokeWidth={1.6} /> 最近搜索
                  </p>
                  <div className="global-search__recent">
                    {recent.map((entry) => (
                      <button
                        type="button"
                        key={entry}
                        className="global-search__chip"
                        onClick={() => {
                          setQuery(entry);
                          setActiveIndex(0);
                        }}
                      >
                        {entry}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null
            ) : null}

            {trimmed && works.isPending ? (
              <p className="global-search__hint">正在搜索本地作品…</p>
            ) : null}
            {trimmed && works.isError ? (
              <p className="global-search__hint is-error">无法读取搜索结果，仍可直接打开游戏库。</p>
            ) : null}
            {trimmed && !works.isPending && results.length === 1 ? (
              <p className="global-search__hint">库里没有匹配的作品或收藏集。</p>
            ) : null}

            {groups.map((group) => (
              <section
                className="global-search__section"
                key={group.label}
                aria-label={group.label}
              >
                <p className="global-search__label">{group.label}</p>
                {group.items.map((item) => {
                  const index = runningIndex++;
                  const active = index === activeIndex;
                  return (
                    <button
                      type="button"
                      key={item.kind + item.id}
                      id={"global-search-" + item.id}
                      role="option"
                      aria-selected={active}
                      tabIndex={-1}
                      data-active={active}
                      className="global-search__item"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(item)}
                    >
                      {item.kind === "work" ? (
                        <span className="global-search__cover">
                          <CoverArt work={libraryItemToGame(item.item)} />
                        </span>
                      ) : item.kind === "collection" ? (
                        <span className="global-search__icon is-collection">
                          <FolderHeart size={15} strokeWidth={1.6} />
                        </span>
                      ) : (
                        <span className="global-search__icon">
                          {item.id === "library" ? (
                            <Library size={15} strokeWidth={1.6} />
                          ) : item.id === "collections" ? (
                            <FolderHeart size={15} strokeWidth={1.6} />
                          ) : item.id === "stats" ? (
                            <BarChart3 size={15} strokeWidth={1.6} />
                          ) : item.id === "settings" ? (
                            <Settings2 size={15} strokeWidth={1.6} />
                          ) : (
                            <Home size={15} strokeWidth={1.6} />
                          )}
                        </span>
                      )}
                      <span className="global-search__copy">
                        <b>{item.label}</b>
                        <small>{item.detail}</small>
                      </span>
                      {item.kind === "collection" && item.collection.workCount > 0 ? (
                        <Tag tone="muted">{item.collection.workCount}</Tag>
                      ) : null}
                    </button>
                  );
                })}
              </section>
            ))}
          </div>

          <footer className="global-search__foot">
            <span>↑↓ 选择</span>
            <span>Enter 打开</span>
            <span>Esc 关闭</span>
            <span className="global-search__foot-brand">Miyu 本地搜索</span>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
