import { Dialog } from "radix-ui";
import { Loader2, RotateCcw, Search, ShieldCheck, X } from "lucide-react";
import { useDeferredValue, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "../../design-system/components/Button";
import { Hint } from "../../design-system/components/Hint";
import { Tag } from "../../design-system/components/Tag";
import type { ScanExclusion } from "../../lib/library-types";

interface ScanExclusionsDialogProps {
  entries: ScanExclusion[];
  onRestore: (exeKey: string) => Promise<void> | void;
  children: ReactNode;
}

export function ScanExclusionsDialog({ entries, onRestore, children }: ScanExclusionsDialogProps) {
  const [query, setQuery] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const filtered = useMemo(() => {
    if (!deferredQuery) {
      return entries;
    }
    return entries.filter((entry) =>
      [entry.exePath, entry.workingDir, entry.reason]
        .join(" ")
        .toLocaleLowerCase()
        .includes(deferredQuery),
    );
  }, [deferredQuery, entries]);

  const restore = async (exeKey: string) => {
    setRestoring(exeKey);
    try {
      await onRestore(exeKey);
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Dialog.Root onOpenChange={(open) => !open && setQuery("")}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="scan-exclusions-dialog__overlay" />
        <Dialog.Content
          className="scan-exclusions-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <header className="scan-exclusions-dialog__head">
            <span className="scan-exclusions-dialog__mark" aria-hidden="true">
              <ShieldCheck size={19} strokeWidth={1.7} />
            </span>
            <div className="scan-exclusions-dialog__copy">
              <p>扫描排除</p>
              <Dialog.Title>已排除的游戏</Dialog.Title>
              <Dialog.Description>
                自动扫描会跳过这些程序；恢复后，下次扫描可以重新发现它们。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="scan-exclusions-dialog__close" aria-label="关闭">
                <X size={17} />
              </button>
            </Dialog.Close>
          </header>

          <div className="scan-exclusions-dialog__toolbar">
            <label className="scan-exclusions-search">
              <Search size={14} aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索路径或排除原因"
                aria-label="搜索排除项"
              />
            </label>
            <span className="scan-exclusions-dialog__count" aria-live="polite">
              {filtered.length} / {entries.length}
            </span>
          </div>

          <div className="scan-exclusions-dialog__list" role="list">
            {filtered.length === 0 ? (
              <div className="scan-exclusions-dialog__empty">
                <ShieldCheck size={22} strokeWidth={1.5} />
                <b>{entries.length === 0 ? "没有排除项" : "没有匹配的排除项"}</b>
                <span>
                  {entries.length === 0
                    ? "移除作品后，自动扫描跳过的程序会出现在这里。"
                    : "换一个路径或原因关键词试试。"}
                </span>
              </div>
            ) : (
              filtered.map((entry, index) => (
                <div className="scan-exclusion-item" role="listitem" key={entry.exeKey}>
                  <b className="scan-exclusion-item__index">{String(index + 1).padStart(2, "0")}</b>
                  <div className="scan-exclusion-item__copy">
                    <Hint label={entry.exePath} side="bottom" align="start">
                      <b>{entry.exePath}</b>
                    </Hint>
                    <span>
                      {entry.reason === "removed_from_library" ? "已从库中移除" : entry.reason}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={restoring !== null}
                    onClick={() => void restore(entry.exeKey)}
                  >
                    {restoring === entry.exeKey ? (
                      <Loader2 size={13} className="settings-spin" />
                    ) : (
                      <RotateCcw size={13} />
                    )}
                    恢复扫描
                  </Button>
                </div>
              ))
            )}
          </div>

          <footer className="scan-exclusions-dialog__foot">
            <Tag tone="muted">共 {entries.length} 个排除项</Tag>
            <Dialog.Close asChild>
              <Button variant="secondary" size="sm">
                关闭
              </Button>
            </Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
