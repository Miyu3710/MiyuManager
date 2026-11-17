import { ChevronDown, FolderSearch } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../design-system/components/Button";
import { Hint } from "../../design-system/components/Hint";
import { Tag } from "../../design-system/components/Tag";
import { cn } from "../../lib/cn";
import { formatBytes } from "../../lib/format";
import type { ScanCandidate } from "../../lib/library-types";
import { ImportCount, ImportEmpty, ImportSourceBar, ImportSummary } from "./ImportDialogShell";
import type { ReviewScanState, ScanSelection } from "./useScanSelection";

const confidenceLabels = {
  high: "高置信",
  medium: "中置信",
  low: "低置信",
} as const;

function confidenceTone(confidence: ScanCandidate["confidence"]): "status" | "data" | "muted" {
  if (confidence === "high") {
    return "status";
  }
  if (confidence === "medium") {
    return "data";
  }
  return "muted";
}

interface ScanReviewProps {
  state: ReviewScanState;
  selection: ScanSelection;
  importing: boolean;
  showSource?: boolean;
  emptyAction?: ReactNode;
  className?: string;
}

export function ScanReview({
  state,
  selection,
  importing,
  showSource = true,
  emptyAction,
  className,
}: ScanReviewProps) {
  const { groups, selected, names, chosen, selectedGroups } = selection;
  const importableGroups = groups.filter((group) => !group.alreadyImported);
  const allSelected =
    importableGroups.length > 0 && importableGroups.every((group) => selected[group.key]);

  return (
    <div className={cn("import-review", "scan-review", className)}>
      {showSource ? <ImportSourceBar label="扫描目录" value={state.rootPath} /> : null}
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
            <Button variant="ghost" size="sm" onClick={selection.toggleAll}>
              {allSelected ? "取消全选" : "全选可导入"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={selectedGroups.length === 0}
              onClick={selection.clearSelection}
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
          action={emptyAction}
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
                      onChange={(event) =>
                        selection.toggleGroup(group, event.currentTarget.checked)
                      }
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
                    </div>
                  </div>

                  <div className="import-row__controls">
                    <label className="import-field">
                      <span>显示名称</span>
                      <input
                        value={names[group.key] ?? candidate.suggestedTitle}
                        disabled={!importable || importing}
                        aria-label={"显示名称 " + candidate.suggestedTitle}
                        onChange={(event) =>
                          selection.setGroupName(group, event.currentTarget.value)
                        }
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
                            selection.chooseExecutable(group, Number(event.currentTarget.value))
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
  );
}
