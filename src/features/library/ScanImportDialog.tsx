import { AlertTriangle, Check, FolderSearch, Loader2, ScanSearch, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../design-system/components/Button";
import { CoverArt } from "../../design-system/components/CoverArt";
import { Tag } from "../../design-system/components/Tag";
import { cn } from "../../lib/cn";
import { formatBytes } from "../../lib/format";
import type { ImportCandidateInput, ScanCandidate } from "../../lib/library-types";
import type { ScanView } from "./useLibraryScan";
import "./scan-dialog.css";

interface ScanImportDialogProps {
  state: ScanView;
  importing: boolean;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
  onPickAnother: () => void;
  onImport: (candidates: ImportCandidateInput[]) => void;
}

const confidenceLabels = {
  high: "高置信",
  medium: "中置信",
  low: "低置信",
} as const;

const EMPTY_CANDIDATES: ScanCandidate[] = [];

interface SelectionState {
  key: string;
  selected: Record<string, boolean>;
  names: Record<string, string>;
}

function buildSelection(candidates: ScanCandidate[]): SelectionState {
  const selected: Record<string, boolean> = {};
  const names: Record<string, string> = {};
  for (const candidate of candidates) {
    selected[candidate.id] = !candidate.alreadyImported;
    names[candidate.id] = candidate.suggestedTitle;
  }
  return { key: candidates.map((candidate) => candidate.id).join("|"), selected, names };
}

function confidenceTone(confidence: ScanCandidate["confidence"]): "status" | "data" | "muted" {
  if (confidence === "high") {
    return "status";
  }
  if (confidence === "medium") {
    return "data";
  }
  return "muted";
}

export function ScanImportDialog({
  state,
  importing,
  onCancel,
  onClose,
  onRetry,
  onPickAnother,
  onImport,
}: ScanImportDialogProps) {
  const [selectionState, setSelectionState] = useState<SelectionState>(() => buildSelection([]));

  const candidates = state.status === "review" ? state.candidates : EMPTY_CANDIDATES;
  const candidateKey = useMemo(
    () => candidates.map((candidate) => candidate.id).join("|"),
    [candidates],
  );
  const defaults = useMemo(() => buildSelection(candidates), [candidates]);
  const activeSelection = selectionState.key === candidateKey ? selectionState : defaults;
  const selected = activeSelection.selected;
  const names = activeSelection.names;

  useEffect(() => {
    if (state.status === "idle") {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || importing) {
        return;
      }
      if (state.status === "scanning") {
        onCancel();
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [importing, onCancel, onClose, state.status]);

  if (state.status === "idle") {
    return null;
  }

  const selectedCandidates = candidates.filter(
    (candidate) => selected[candidate.id] && !candidate.alreadyImported,
  );
  const canImport =
    selectedCandidates.length > 0 &&
    selectedCandidates.every((candidate) => (names[candidate.id] ?? "").trim().length > 0) &&
    !importing;

  const toggleAll = () => {
    const importable = candidates.filter((candidate) => !candidate.alreadyImported);
    const allSelected = importable.every((candidate) => selected[candidate.id]);
    const next: Record<string, boolean> = {};
    for (const candidate of candidates) {
      next[candidate.id] = candidate.alreadyImported ? false : !allSelected;
    }
    setSelectionState({
      key: candidateKey,
      selected: next,
      names: activeSelection.names,
    });
  };

  const handleImport = () => {
    onImport(
      selectedCandidates.map((candidate) => ({
        exePath: candidate.exePath,
        workingDir: candidate.workingDir,
        displayName: (names[candidate.id] ?? candidate.suggestedTitle).trim(),
        rootPath: candidate.rootPath,
        sizeBytes: candidate.sizeBytes,
      })),
    );
  };

  const title =
    state.status === "scanning"
      ? state.manual
        ? "正在扫描目录（手动导入）"
        : "正在扫描目录"
      : state.status === "error"
        ? "扫描没有完成"
        : state.cancelled
          ? "已取消扫描"
          : "确认要入库的游戏";

  return (
    <div
      className="scan-overlay"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && state.status !== "scanning" && !importing) {
          onClose();
        }
      }}
    >
      <section
        className="scan-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-dialog-title"
      >
        <header className="scan-dialog__head">
          <div className="scan-dialog__mark" aria-hidden="true">
            {state.status === "error" ? (
              <AlertTriangle size={20} strokeWidth={1.5} />
            ) : state.status === "scanning" ? (
              <ScanSearch size={20} strokeWidth={1.5} />
            ) : (
              <FolderSearch size={20} strokeWidth={1.5} />
            )}
          </div>
          <div className="scan-dialog__head-copy">
            <p className="app-kicker">LOCAL SCAN / 本地扫描</p>
            <h2 id="scan-dialog-title">{title}</h2>
            <p title={state.rootPath}>{state.rootPath || "尚未选择目录"}</p>
          </div>
          <button
            type="button"
            className="scan-dialog__close"
            aria-label="关闭扫描窗口"
            disabled={importing}
            onClick={() => (state.status === "scanning" ? onCancel() : onClose())}
          >
            <X size={16} strokeWidth={1.6} />
          </button>
        </header>

        <div className="scan-dialog__body">
          {state.status === "scanning" ? (
            <div className="scan-progress">
              <div className="scan-progress__bar" aria-hidden="true">
                <span />
              </div>
              <div className="scan-progress__metrics">
                <div>
                  <b>{state.progress?.scannedDirs ?? 0}</b>
                  <span>已浏览目录</span>
                </div>
                <div>
                  <b>{state.progress?.foundCandidates ?? 0}</b>
                  <span>候选程序</span>
                </div>
                <div>
                  <b>{Math.round((state.progress?.elapsedMs ?? 0) / 1000)}s</b>
                  <span>已用时</span>
                </div>
              </div>
              <div className="scan-progress__path" title={state.progress?.currentPath}>
                <Loader2 size={13} strokeWidth={1.6} className="scan-spin" />
                <code>
                  {state.cancelling
                    ? "正在停止扫描并保留已发现的结果…"
                    : (state.progress?.currentPath ?? "正在读取目录…")}
                </code>
              </div>
              <p className="scan-hint">
                扫描只读取目录、可执行文件名和大小；不会移动、修改或启动游戏文件。遇到大量文件时可以在
                确认页只导入需要的候选。
              </p>
            </div>
          ) : null}

          {state.status === "error" ? (
            <div className="scan-error">
              <AlertTriangle size={24} strokeWidth={1.4} />
              <h3>无法完成扫描</h3>
              <p>{state.message}</p>
              <div className="scan-error__actions">
                {state.rootPath ? (
                  <Button variant="secondary" size="sm" onClick={onRetry}>
                    重试
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={onClose}>
                  关闭
                </Button>
              </div>
            </div>
          ) : null}

          {state.status === "review" ? (
            <>
              <div className="scan-summary">
                <div>
                  <b>{state.candidates.length}</b>
                  <span>个候选程序</span>
                </div>
                <div>
                  <b>{selectedCandidates.length}</b>
                  <span>个已选择</span>
                </div>
                <div>
                  <b>{state.stats?.scannedDirs ?? "—"}</b>
                  <span>个目录</span>
                </div>
                <div className="scan-summary__tags">
                  {state.manual ? <Tag tone="data">手动导入</Tag> : null}
                  {state.cancelled ? <Tag tone="muted">已取消 · 部分结果</Tag> : null}
                  {state.stats?.truncated ? <Tag tone="accent">目录过多 · 提前结束</Tag> : null}
                  {state.candidates.some((candidate) => candidate.alreadyImported) ? (
                    <Tag tone="data">包含已在库项目</Tag>
                  ) : null}
                </div>
              </div>

              {state.candidates.length === 0 ? (
                <div className="scan-empty">
                  <ScanSearch size={26} strokeWidth={1.3} />
                  <h3>没有发现可执行文件</h3>
                  <p>
                    这个目录可能只包含压缩包、安装器或非 Windows
                    游戏。请选择包含游戏主程序的文件夹， 或者先在游戏目录中确认 .exe 的位置。
                  </p>
                </div>
              ) : (
                <>
                  <div className="scan-list-toolbar">
                    <button type="button" className="scan-check" onClick={toggleAll}>
                      <span
                        className={cn(
                          "scan-check__box",
                          selectedCandidates.length > 0 && "is-checked",
                        )}
                      >
                        {selectedCandidates.length > 0 ? (
                          <Check size={11} strokeWidth={2.4} />
                        ) : null}
                      </span>
                      全选可导入项
                    </button>
                    <span>点击标题可修改入库名称</span>
                  </div>

                  <div className="scan-candidates">
                    {state.candidates.map((candidate) => {
                      const checked = Boolean(selected[candidate.id]);
                      const importable = !candidate.alreadyImported;
                      return (
                        <div
                          className={cn(
                            "scan-candidate",
                            checked && "is-selected",
                            !importable && "is-imported",
                          )}
                          key={candidate.id}
                        >
                          <label className="scan-candidate__check">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!importable || importing}
                              onChange={(event) =>
                                setSelectionState((previous) => {
                                  const base = previous.key === candidateKey ? previous : defaults;
                                  return {
                                    key: candidateKey,
                                    selected: {
                                      ...base.selected,
                                      [candidate.id]: event.currentTarget.checked,
                                    },
                                    names: base.names,
                                  };
                                })
                              }
                              aria-label={"选择 " + candidate.suggestedTitle}
                            />
                            <span className="scan-check__box">
                              {checked ? <Check size={11} strokeWidth={2.4} /> : null}
                            </span>
                          </label>

                          <div className="scan-candidate__cover">
                            <CoverArt
                              work={{
                                title: candidate.suggestedTitle,
                                originalTitle: "",
                                developer: "本地扫描",
                                year: null,
                                cover: null,
                              }}
                            />
                          </div>

                          <div className="scan-candidate__main">
                            <input
                              className="scan-candidate__title"
                              value={names[candidate.id] ?? candidate.suggestedTitle}
                              disabled={!importable || importing}
                              aria-label={"入库名称 " + candidate.suggestedTitle}
                              onChange={(event) =>
                                setSelectionState((previous) => {
                                  const base = previous.key === candidateKey ? previous : defaults;
                                  return {
                                    key: candidateKey,
                                    selected: base.selected,
                                    names: {
                                      ...base.names,
                                      [candidate.id]: event.currentTarget.value,
                                    },
                                  };
                                })
                              }
                            />
                            <code className="scan-candidate__path" title={candidate.exePath}>
                              {candidate.exePath}
                            </code>
                            <p title={candidate.reason}>{candidate.reason || "本地扫描候选"}</p>
                          </div>

                          <div className="scan-candidate__meta">
                            <span>{formatBytes(candidate.sizeBytes)}</span>
                            <small>
                              exe {formatBytes(candidate.fileSizeBytes)}
                              {candidate.sizeIsEstimate ? " · 估算" : ""}
                            </small>
                            <div>
                              <Tag tone={confidenceTone(candidate.confidence)}>
                                {confidenceLabels[candidate.confidence]}
                              </Tag>
                              {candidate.alreadyImported ? <Tag tone="muted">已在库中</Tag> : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>

        <footer className="scan-dialog__foot">
          <p>
            {state.status === "review" && state.candidates.length > 0
              ? state.manual
                ? "手动导入包含已排除的游戏；确认导入后会清除对应扫描排除。"
                : "导入只会写入本地数据库和扫描路径，不会改动游戏目录。"
              : state.status === "scanning"
                ? "可以取消扫描，已发现的候选不会自动入库。"
                : "扫描和导入都在本机完成。"}
          </p>
          <div className="scan-dialog__actions">
            {state.status === "scanning" ? (
              <Button variant="secondary" size="sm" disabled={state.cancelling} onClick={onCancel}>
                {state.cancelling ? "正在取消…" : "取消扫描"}
              </Button>
            ) : null}
            {state.status === "review" ? (
              <>
                <Button variant="ghost" size="sm" onClick={onPickAnother}>
                  重新选择目录
                </Button>
                <Button variant="primary" size="sm" disabled={!canImport} onClick={handleImport}>
                  {importing ? <Loader2 size={13} className="scan-spin" /> : null}
                  {importing ? "正在导入…" : "导入选中 " + selectedCandidates.length + " 部"}
                </Button>
              </>
            ) : null}
            {state.status === "error" ? (
              <Button variant="ghost" size="sm" onClick={onClose}>
                关闭
              </Button>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  );
}
