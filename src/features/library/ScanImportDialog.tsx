import { AlertTriangle, ChevronDown, FolderSearch, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../design-system/components/Button";
import { Hint } from "../../design-system/components/Hint";
import { Tag } from "../../design-system/components/Tag";
import { useDialogFocus } from "../../design-system/useDialogFocus";
import { cn } from "../../lib/cn";
import { formatBytes } from "../../lib/format";
import type { ImportCandidateInput, ScanCandidate } from "../../lib/library-types";
import type { ScanView } from "./useLibraryScan";
import {
  ImportCount,
  ImportDialogFrame,
  ImportEmpty,
  ImportMetric,
  ImportNotice,
  ImportProgress,
  ImportSourceBar,
  ImportSummary,
} from "./ImportDialogShell";

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

interface CandidateGroup {
  key: string;
  workingDir: string;
  rootPath: string;
  candidates: ScanCandidate[];
  defaultIndex: number;
  alreadyImported: boolean;
}

interface SelectionState {
  key: string;
  selected: Record<string, boolean>;
  names: Record<string, string>;
  chosen: Record<string, number>;
}

function groupCandidates(candidates: ScanCandidate[]): CandidateGroup[] {
  const grouped = new Map<string, ScanCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.workingDir.toLocaleLowerCase();
    const group = grouped.get(key);
    if (group) {
      group.push(candidate);
    } else {
      grouped.set(key, [candidate]);
    }
  }

  return [...grouped.entries()]
    .map(([key, groupCandidates]) => {
      const ordered = [...groupCandidates].sort(
        (a, b) => Number(a.alreadyImported) - Number(b.alreadyImported),
      );
      const firstImportable = ordered.findIndex((candidate) => !candidate.alreadyImported);
      return {
        key,
        workingDir: ordered[0]?.workingDir ?? "",
        rootPath: ordered[0]?.rootPath ?? "",
        candidates: ordered,
        defaultIndex: Math.max(0, firstImportable),
        alreadyImported: ordered.every((candidate) => candidate.alreadyImported),
      };
    })
    .sort((a, b) => Number(a.alreadyImported) - Number(b.alreadyImported));
}

function buildSelection(groups: CandidateGroup[]): SelectionState {
  const selected: Record<string, boolean> = {};
  const names: Record<string, string> = {};
  const chosen: Record<string, number> = {};
  for (const group of groups) {
    const candidate = group.candidates[group.defaultIndex] ?? group.candidates[0];
    selected[group.key] = false;
    names[group.key] = candidate?.suggestedTitle ?? "";
    chosen[group.key] = group.defaultIndex;
  }
  return {
    key: groups.map((group) => group.key).join("|"),
    selected,
    names,
    chosen,
  };
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
  const dialogRef = useDialogFocus<HTMLDivElement>({
    open: state.status !== "idle",
    onEscape: () => {
      if (importing) {
        return;
      }
      if (state.status === "scanning") {
        onCancel();
      } else {
        onClose();
      }
    },
  });

  const candidates = state.status === "review" ? state.candidates : EMPTY_CANDIDATES;
  const groups = useMemo(() => groupCandidates(candidates), [candidates]);
  const groupKey = useMemo(() => groups.map((group) => group.key).join("|"), [groups]);
  const defaults = useMemo(() => buildSelection(groups), [groups]);
  const activeSelection = selectionState.key === groupKey ? selectionState : defaults;
  const selected = activeSelection.selected;
  const names = activeSelection.names;
  const chosen = activeSelection.chosen;

  if (state.status === "idle") {
    return null;
  }

  const selectedGroups = groups.filter((group) => selected[group.key] && !group.alreadyImported);
  const canImport =
    selectedGroups.length > 0 &&
    selectedGroups.every((group) => {
      const candidate = group.candidates[chosen[group.key] ?? group.defaultIndex];
      return Boolean(candidate) && (names[group.key] ?? "").trim().length > 0;
    }) &&
    !importing;

  const toggleAll = () => {
    const importable = groups.filter((group) => !group.alreadyImported);
    const allSelected = importable.every((group) => selected[group.key]);
    const next: Record<string, boolean> = {};
    for (const group of groups) {
      next[group.key] = group.alreadyImported ? false : !allSelected;
    }
    setSelectionState({
      key: groupKey,
      selected: next,
      names: activeSelection.names,
      chosen: activeSelection.chosen,
    });
  };

  const clearSelection = () => {
    setSelectionState({
      key: groupKey,
      selected: {},
      names: activeSelection.names,
      chosen: activeSelection.chosen,
    });
  };

  const chooseExecutable = (group: CandidateGroup, nextIndex: number) => {
    setSelectionState((previous) => {
      const base = previous.key === groupKey ? previous : defaults;
      const previousIndex = base.chosen[group.key] ?? group.defaultIndex;
      const previousCandidate = (group.candidates[previousIndex] ?? group.candidates[0])!;
      const nextCandidate = (group.candidates[nextIndex] ?? group.candidates[0])!;
      const currentName = base.names[group.key] ?? previousCandidate.suggestedTitle;
      const followsSuggestion = currentName.trim() === previousCandidate.suggestedTitle.trim();
      return {
        key: groupKey,
        selected: base.selected,
        names: {
          ...base.names,
          [group.key]: followsSuggestion ? nextCandidate.suggestedTitle : currentName,
        },
        chosen: {
          ...base.chosen,
          [group.key]: nextIndex,
        },
      };
    });
  };

  const handleImport = () => {
    const nextCandidates: ImportCandidateInput[] = [];
    for (const group of selectedGroups) {
      const candidate = (group.candidates[chosen[group.key] ?? group.defaultIndex] ??
        group.candidates[0])!;
      const displayName = (names[group.key] ?? candidate.suggestedTitle).trim();
      if (!candidate || !displayName) {
        continue;
      }
      nextCandidates.push({
        exePath: candidate.exePath,
        workingDir: candidate.workingDir,
        displayName,
        rootPath: candidate.rootPath,
        sizeBytes: candidate.sizeBytes,
      });
    }
    onImport(nextCandidates);
  };

  const title =
    state.status === "scanning"
      ? "正在扫描目录"
      : state.status === "error"
        ? "扫描没有完成"
        : state.cancelled
          ? "扫描已取消"
          : "选择要入库的游戏";
  const description =
    state.status === "scanning"
      ? "读取目录、可执行文件名和大小；不会移动、修改或启动游戏文件。"
      : state.status === "error"
        ? "已选目录保留，可以重试或重新选择。"
        : state.cancelled
          ? "已保留扫描到的部分结果，导入前仍可逐项确认。"
          : "从扫描目录中读取可执行文件与安装大小，只读取，不改动游戏文件。";

  const footerNote =
    state.status === "scanning"
      ? "可以取消扫描，已发现的候选不会自动入库。"
      : state.status === "error"
        ? "扫描和导入都在本机完成。"
        : state.cancelled
          ? "扫描被取消，仍可导入已发现的候选。"
          : "导入只写入本地数据库和扫描路径，不改动游戏目录。";

  const footerActions =
    state.status === "scanning" ? (
      <Button variant="secondary" size="sm" disabled={state.cancelling} onClick={onCancel}>
        {state.cancelling ? "正在取消…" : "取消扫描"}
      </Button>
    ) : state.status === "review" ? (
      <>
        <Button variant="ghost" size="sm" disabled={importing} onClick={onPickAnother}>
          重新选择目录
        </Button>
        <Button variant="primary" size="sm" disabled={!canImport} onClick={handleImport}>
          {importing ? <Loader2 size={13} className="import-spin" /> : null}
          {importing ? "正在导入…" : "导入选中 " + selectedGroups.length + " 部"}
        </Button>
      </>
    ) : (
      <Button variant="ghost" size="sm" onClick={onClose}>
        关闭
      </Button>
    );

  return (
    <ImportDialogFrame
      title={title}
      titleId="scan-dialog-title"
      description={description}
      closeLabel={state.status === "scanning" ? "取消扫描" : "关闭扫描窗口"}
      onClose={() => (state.status === "scanning" ? onCancel() : onClose())}
      busy={importing}
      dialogRef={dialogRef}
      footerNote={footerNote}
      footerActions={footerActions}
    >
      {state.status === "scanning" ? (
        <>
          <ImportSourceBar label="扫描目录" value={state.rootPath || "尚未选择目录"} />
          <ImportProgress
            icon={<Loader2 size={18} className="import-spin" />}
            label={state.cancelling ? "正在停止扫描…" : "正在读取目录"}
            detail={state.progress?.currentPath ?? state.rootPath}
            metrics={
              <>
                <ImportMetric value={state.progress?.scannedDirs ?? 0} label="已浏览目录" />
                <ImportMetric value={state.progress?.foundCandidates ?? 0} label="候选程序" />
                <ImportMetric
                  value={Math.round((state.progress?.elapsedMs ?? 0) / 1000) + "s"}
                  label="已用时"
                />
              </>
            }
          />
        </>
      ) : null}

      {state.status === "error" ? (
        <>
          <ImportNotice tone="error">
            <AlertTriangle size={14} />
            <span>{state.message}</span>
          </ImportNotice>
          <ImportEmpty
            icon={<AlertTriangle size={22} strokeWidth={1.5} />}
            title="无法完成扫描"
            description="检查目录是否可访问，或重新选择包含游戏主程序的文件夹。"
            action={
              state.rootPath ? (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                  重试扫描
                </Button>
              ) : undefined
            }
          />
        </>
      ) : null}

      {state.status === "review" ? (
        <div className="import-review">
          <ImportSourceBar label="扫描目录" value={state.rootPath} />
          <ImportSummary
            tags={
              <>
                {state.cancelled ? <Tag tone="muted">已取消，部分结果</Tag> : null}
                {state.stats?.truncated ? <Tag tone="accent">目录过多，提前结束</Tag> : null}
                {groups.some((group) => group.alreadyImported) ? (
                  <Tag tone="data">包含已在库项目</Tag>
                ) : null}
              </>
            }
            actions={
              <>
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  全选可导入
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={selectedGroups.length === 0}
                  onClick={clearSelection}
                >
                  清空
                </Button>
              </>
            }
          >
            <ImportCount value={groups.length} label="个游戏" />
            <ImportCount value={selectedGroups.length} label="个已选" />
            <ImportCount value={state.stats?.scannedDirs ?? "—"} label="个目录" />
          </ImportSummary>

          {groups.length === 0 ? (
            <ImportEmpty
              icon={<FolderSearch size={22} strokeWidth={1.5} />}
              title="没有发现可执行文件"
              description="这个目录可能只包含压缩包、安装器或非 Windows 游戏。选择包含游戏主程序的文件夹再扫描。"
            />
          ) : (
            <div className="import-list-scroll">
              <div className="import-list">
                {groups.map((group) => {
                  const chosenIndex = chosen[group.key] ?? group.defaultIndex;
                  const candidate = (group.candidates[chosenIndex] ?? group.candidates[0])!;
                  const checked = Boolean(selected[group.key]);
                  const importable = !group.alreadyImported;
                  return (
                    <div
                      className={cn(
                        "import-row",
                        "import-row--controls",
                        checked && "is-selected",
                        !importable && "is-imported",
                      )}
                      key={group.key}
                    >
                      <label className="import-row__check">
                        <input
                          type="checkbox"
                          checked={checked && importable}
                          disabled={!importable || importing}
                          onChange={(event) => {
                            const nextChecked = event.currentTarget.checked;
                            setSelectionState((previous) => {
                              const base = previous.key === groupKey ? previous : defaults;
                              return {
                                key: groupKey,
                                selected: {
                                  ...base.selected,
                                  [group.key]: nextChecked,
                                },
                                names: base.names,
                                chosen: base.chosen,
                              };
                            });
                          }}
                          aria-label={"选择 " + candidate.suggestedTitle}
                        />
                      </label>

                      <div className="import-row__main">
                        <div className="import-row__title">
                          <b>{candidate.suggestedTitle}</b>
                          <Tag tone={confidenceTone(candidate.confidence)}>
                            {confidenceLabels[candidate.confidence]}
                          </Tag>
                          {candidate.alreadyImported ? <Tag tone="muted">已在库中</Tag> : null}
                        </div>
                        <Hint label={group.workingDir} side="bottom" align="start">
                          <code className="import-row__path">{group.workingDir}</code>
                        </Hint>
                        <div className="import-row__submeta">
                          <span>{formatBytes(candidate.sizeBytes)}</span>
                          <span>{group.candidates.length} 个可执行文件</span>
                          <Hint label={candidate.reason || "本地扫描候选"} side="top" align="start">
                            <span className="import-row__reason">
                              {candidate.reason || "本地扫描候选"}
                            </span>
                          </Hint>
                        </div>
                      </div>

                      <div className="import-row__controls">
                        <label className="import-field">
                          <span>显示名称</span>
                          <input
                            value={names[group.key] ?? candidate.suggestedTitle}
                            disabled={!importable || importing}
                            aria-label={"显示名称 " + candidate.suggestedTitle}
                            onChange={(event) => {
                              const nextName = event.currentTarget.value;
                              setSelectionState((previous) => {
                                const base = previous.key === groupKey ? previous : defaults;
                                return {
                                  key: groupKey,
                                  selected: base.selected,
                                  names: {
                                    ...base.names,
                                    [group.key]: nextName,
                                  },
                                  chosen: base.chosen,
                                };
                              });
                            }}
                          />
                        </label>
                        <label className="import-field">
                          <span>主程序</span>
                          <span className="import-field__select">
                            <select
                              value={chosenIndex}
                              disabled={!importable || importing}
                              aria-label={"主程序 " + candidate.suggestedTitle}
                              onChange={(event) =>
                                chooseExecutable(group, Number(event.currentTarget.value))
                              }
                            >
                              {group.candidates.map((item, index) => (
                                <option value={index} key={item.id} disabled={item.alreadyImported}>
                                  {item.exePath.split("\\").slice(-1)[0]}，
                                  {confidenceLabels[item.confidence]}
                                  {item.alreadyImported ? "（已在库）" : ""}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={12} />
                          </span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </ImportDialogFrame>
  );
}
