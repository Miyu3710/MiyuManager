import { Delete, Eraser, Keyboard, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "../../lib/cn";
import "./bigscreen-search.css";

interface BigScreenSearchProps {
  query: string;
  onQueryChange: (value: string) => void;
  closing: boolean;
  onClose: () => void;
}

const KEY_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "⌫"],
  ["Z", "X", "C", "V", "B", "N", "M", "空格"],
] as const;

const SEARCH_LIMIT = 48;

const KEY_SHORTCUTS: Record<string, string> = {
  "⌫": "X",
  空格: "Y",
  清空: "RB",
  关闭: "B",
};

function keyId(key: string): string {
  if (key === "⌫") return "backspace";
  if (key === "空格") return "space";
  if (key === "清空") return "clear";
  if (key === "关闭") return "close";
  return key.toLowerCase();
}

function keyLabel(key: string): string {
  return key === "⌫" ? "退格" : key;
}

export function BigScreenSearch({ query, onQueryChange, closing, onClose }: BigScreenSearchProps) {
  const keyboardRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();

  useEffect(() => {
    keyboardRef.current?.querySelector<HTMLElement>("[data-bigscreen-focus]")?.focus();
  }, []);

  const pressKey = (key: string) => {
    if (key === "⌫") {
      onQueryChange(query.slice(0, -1));
      return;
    }
    if (key === "空格") {
      onQueryChange((query + " ").slice(0, SEARCH_LIMIT));
      return;
    }
    if (key === "清空") {
      onQueryChange("");
      return;
    }
    if (key === "关闭") {
      onClose();
      return;
    }
    onQueryChange((query + key).slice(0, SEARCH_LIMIT));
  };

  return (
    <div className={cn("bigscreen-search-layer", closing && "is-closing")}>
      <div className="bigscreen-search-backdrop" aria-hidden="true" onClick={onClose} />
      <section
        className={cn("bigscreen-search", closing && "is-closing")}
        data-bigscreen-scope="search"
        role="dialog"
        aria-modal="true"
        aria-label="搜索作品"
      >
        <header className="bigscreen-search__head">
          <div className="bigscreen-search__title">
            <span className="bigscreen-search__title-icon">
              <Search size={18} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span>搜索作品</span>
          </div>
          <button
            type="button"
            className="bigscreen-search__close"
            data-bigscreen-focus="search-close"
            data-bigscreen-zone="field"
            onClick={onClose}
            aria-label="关闭搜索"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </header>

        <div className="bigscreen-search__field" aria-label="搜索词">
          <Search size={20} strokeWidth={1.6} aria-hidden="true" />
          <div className="bigscreen-search__query-line">
            <span
              className={cn("bigscreen-search__query", !trimmed && "is-empty")}
              aria-live="polite"
            >
              {trimmed ? query : "输入作品名"}
            </span>
            {trimmed ? <span className="bigscreen-search__caret" aria-hidden="true" /> : null}
          </div>
        </div>

        <section className="bigscreen-search__keyboard" aria-label="手柄键盘">
          <div className="bigscreen-search__section-head">
            <span className="bigscreen-search__section-label">
              <Keyboard size={16} strokeWidth={1.8} aria-hidden="true" />
              手柄键盘
            </span>
            <span className="bigscreen-search__section-hints">
              <kbd>A</kbd> 输入 <span aria-hidden="true">·</span> <kbd>B</kbd> 返回
            </span>
          </div>
          <div className="bigscreen-search__keys" ref={keyboardRef}>
            {KEY_ROWS.flat().map((key) => {
              const shortcut = KEY_SHORTCUTS[key];
              const isBackspace = key === "⌫";
              const isSpace = key === "空格";
              return (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "bigscreen-search__key",
                    isBackspace && "is-delete",
                    isSpace && "is-space",
                  )}
                  data-bigscreen-focus={`search-key-${keyId(key)}`}
                  data-bigscreen-zone="keyboard"
                  onClick={() => pressKey(key)}
                  aria-label={shortcut ? `${keyLabel(key)}，${shortcut}` : keyLabel(key)}
                >
                  {isBackspace ? (
                    <Delete size={18} strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <span className="bigscreen-search__key-label">{key}</span>
                  )}
                  {shortcut ? <b className="bigscreen-search__key-hint">{shortcut}</b> : null}
                </button>
              );
            })}
          </div>
        </section>

        <footer className="bigscreen-search__footer">
          <span className="bigscreen-search__count" aria-hidden="true">
            <b>{query.length}</b>
            <span> / {SEARCH_LIMIT}</span>
          </span>
          <div className="bigscreen-search__actions">
            {(["清空", "关闭"] as const).map((action) => {
              const shortcut = KEY_SHORTCUTS[action];
              const ActionIcon = action === "清空" ? Eraser : X;
              return (
                <button
                  key={action}
                  type="button"
                  className={cn("bigscreen-search__action", action === "关闭" && "is-close")}
                  data-bigscreen-focus={`search-key-${keyId(action)}`}
                  data-bigscreen-zone="keyboard"
                  onClick={() => pressKey(action)}
                  aria-label={shortcut ? `${action}，${shortcut}` : action}
                >
                  <ActionIcon size={16} strokeWidth={1.8} aria-hidden="true" />
                  <span>{action}</span>
                  {shortcut ? <b className="bigscreen-search__key-hint">{shortcut}</b> : null}
                </button>
              );
            })}
          </div>
        </footer>
      </section>
    </div>
  );
}
