import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Clock3, FolderHeart, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { HOME_SEARCH_FOCUS_EVENT } from "../../app/global-search-events";
import { CoverArt } from "../../design-system/components/CoverArt";
import { statusLabels } from "../../lib/game-data";
import { libraryItemToGame } from "../../lib/library-api";
import type { CollectionSummary, LibraryItem } from "../../lib/library-types";
import { workLinkState, workOriginForPath } from "../../lib/work-navigation";
import { useCollections } from "../collections/useCollections";
import { useGlobalSearchResults } from "../library/useLibrary";
import "./home-search.css";

const RECENT_KEY = "miyu-recent-searches";
const MAX_RECENT = 6;

type SearchItem =
  | { kind: "work"; id: string; label: string; detail: string; item: LibraryItem }
  | {
      kind: "collection";
      id: string;
      label: string;
      detail: string;
      collection: CollectionSummary;
    }
  | { kind: "history"; id: string; label: string; value: string };

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

export function HomeSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() => readRecentSearches());
  const [activeIndex, setActiveIndex] = useState(-1);
  const deferredQuery = useDeferredValue(query);
  const works = useGlobalSearchResults(deferredQuery);
  const collections = useCollections();
  const trimmed = deferredQuery.trim();
  const listId = "home-search-results";

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

  const items = useMemo<SearchItem[]>(() => {
    if (!trimmed) {
      return recent.map((entry, index) => ({
        kind: "history",
        id: `history-${index}`,
        label: entry,
        value: entry,
      }));
    }
    const workItems: SearchItem[] = (works.data?.items ?? []).map((item) => ({
      kind: "work",
      id: "work-" + item.workId,
      label: item.title,
      detail: [item.originalTitle, item.developer, statusLabels[item.status]]
        .filter(Boolean)
        .join(" · "),
      item,
    }));
    const collectionItems: SearchItem[] = collectionResults.map((collection) => ({
      kind: "collection",
      id: "collection-" + collection.id,
      label: collection.name,
      detail: collection.workCount + " 部作品",
      collection,
    }));
    return [...workItems, ...collectionItems];
  }, [collectionResults, recent, trimmed, works.data?.items]);

  const activeItem = items[activeIndex];

  useEffect(() => {
    const onFocusRequest = () => {
      setOpen(true);
      setActiveIndex(-1);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    };
    window.addEventListener(HOME_SEARCH_FOCUS_EVENT, onFocusRequest);
    return () => window.removeEventListener(HOME_SEARCH_FOCUS_EVENT, onFocusRequest);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-active='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const recordSearch = (value: string) => {
    const next = [value, ...recent.filter((entry) => entry !== value)].slice(0, MAX_RECENT);
    setRecent(next);
    writeRecentSearches(next);
  };

  const removeRecent = (value: string) => {
    const next = recent.filter((entry) => entry !== value);
    setRecent(next);
    writeRecentSearches(next);
    setActiveIndex(-1);
  };

  const clearRecent = () => {
    setRecent([]);
    writeRecentSearches([]);
    setActiveIndex(-1);
  };

  const choose = (item: SearchItem) => {
    if (item.kind === "history") {
      setQuery(item.value);
      setActiveIndex(-1);
      inputRef.current?.focus();
      return;
    }
    if (trimmed) {
      recordSearch(trimmed);
    }
    setOpen(false);
    if (item.kind === "work") {
      navigate("/work/" + item.item.workId, {
        state: workLinkState(workOriginForPath(location)),
      });
    } else {
      navigate("/collections/" + item.collection.id);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        items.length === 0 ? -1 : current < 0 ? 0 : Math.min(items.length - 1, current + 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        items.length === 0
          ? -1
          : current < 0
            ? items.length - 1
            : Math.max(0, current - 1),
      );
    } else if (event.key === "Enter") {
      const item = activeItem ?? (trimmed ? items[0] : undefined);
      if (item) {
        event.preventDefault();
        choose(item);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    } else if (
      event.key === "Delete" &&
      !trimmed &&
      activeItem?.kind === "history"
    ) {
      event.preventDefault();
      removeRecent(activeItem.value);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className={`home-search${open ? " is-open" : ""}`} ref={rootRef}>
      <label className="home-search__field" htmlFor="home-search-input">
        <Search className="home-search__icon" size={16} strokeWidth={1.8} aria-hidden="true" />
        <input
          id="home-search-input"
          ref={inputRef}
          className="home-search__input"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={onKeyDown}
          placeholder="搜索游戏、别名、标签或收藏集"
          aria-label="搜索游戏、别名、标签或收藏集"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && activeItem ? `home-search-${activeIndex}` : undefined}
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            className="home-search__clear"
            aria-label="清空搜索"
            onClick={(event) => {
              event.preventDefault();
              setQuery("");
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        ) : (
          <kbd className="home-search__kbd">Ctrl K</kbd>
        )}
      </label>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="home-search__popover"
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <div
              className="home-search__list"
              id={listId}
              role="listbox"
              aria-label="搜索历史与结果"
              ref={listRef}
            >
              {!trimmed ? (
                <section className="home-search__section" aria-label="搜索历史">
                  <div className="home-search__section-head">
                    <p className="home-search__label">搜索历史</p>
                    {items.length > 0 ? (
                      <button
                        type="button"
                        className="home-search__clear-history"
                        aria-label="清除全部搜索历史"
                        onClick={clearRecent}
                      >
                        清除
                      </button>
                    ) : null}
                  </div>
                  {items.length > 0 ? (
                    items.map((item, index) => {
                      if (item.kind !== "history") {
                        return null;
                      }
                      const active = index === activeIndex;
                      return (
                        <div
                          className="home-search__history-row"
                          role="presentation"
                          key={item.id}
                        >
                          <button
                            type="button"
                            role="option"
                            id={`home-search-${index}`}
                            aria-selected={active}
                            tabIndex={-1}
                            data-active={active}
                            className="home-search__item is-history"
                            onMouseEnter={() => setActiveIndex(index)}
                            onMouseLeave={() => setActiveIndex(-1)}
                            onClick={() => choose(item)}
                          >
                            <span className="home-search__row-icon">
                              <Clock3 size={15} strokeWidth={1.7} />
                            </span>
                            <span className="home-search__copy">
                              <b>{item.label}</b>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="home-search__remove"
                            aria-label={`删除搜索记录：${item.value}`}
                            tabIndex={-1}
                            onClick={(event) => {
                              event.stopPropagation();
                              removeRecent(item.value);
                            }}
                          >
                            <X size={13} strokeWidth={1.8} />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="home-search__empty">暂无搜索历史</p>
                  )}
                </section>
              ) : null}

              {trimmed && works.isPending ? (
                <p className="home-search__hint">正在搜索本地作品…</p>
              ) : null}
              {trimmed && works.isError ? (
                <p className="home-search__hint is-error">无法读取搜索结果。</p>
              ) : null}
              {trimmed && !works.isPending && !works.isError && items.length === 0 ? (
                <p className="home-search__empty">没有匹配的结果</p>
              ) : null}

              {trimmed && items.length > 0 ? (
                <>
                  {items.some((item) => item.kind === "work") ? (
                    <section className="home-search__section" aria-label="作品">
                      <p className="home-search__label">作品</p>
                      {items.map((item, index) => {
                        if (item.kind !== "work") {
                          return null;
                        }
                        const active = index === activeIndex;
                        return (
                          <button
                            type="button"
                            role="option"
                            id={`home-search-${index}`}
                            aria-selected={active}
                            tabIndex={-1}
                            data-active={active}
                            className="home-search__item"
                            key={item.id}
                            onMouseEnter={() => setActiveIndex(index)}
                            onMouseLeave={() => setActiveIndex(-1)}
                            onClick={() => choose(item)}
                          >
                            <span className="home-search__cover" aria-hidden="true">
                              <CoverArt work={libraryItemToGame(item.item)} />
                            </span>
                            <span className="home-search__copy">
                              <b>{item.label}</b>
                              <small>{item.detail}</small>
                            </span>
                          </button>
                        );
                      })}
                    </section>
                  ) : null}

                  {items.some((item) => item.kind === "collection") ? (
                    <section className="home-search__section" aria-label="收藏集">
                      <p className="home-search__label">收藏集</p>
                      {items.map((item, index) => {
                        if (item.kind !== "collection") {
                          return null;
                        }
                        const active = index === activeIndex;
                        return (
                          <button
                            type="button"
                            role="option"
                            id={`home-search-${index}`}
                            aria-selected={active}
                            tabIndex={-1}
                            data-active={active}
                            className="home-search__item"
                            key={item.id}
                            onMouseEnter={() => setActiveIndex(index)}
                            onMouseLeave={() => setActiveIndex(-1)}
                            onClick={() => choose(item)}
                          >
                            <span className="home-search__row-icon is-collection">
                              <FolderHeart size={15} strokeWidth={1.7} />
                            </span>
                            <span className="home-search__copy">
                              <b>{item.label}</b>
                              <small>{item.detail}</small>
                            </span>
                          </button>
                        );
                      })}
                    </section>
                  ) : null}
                </>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
