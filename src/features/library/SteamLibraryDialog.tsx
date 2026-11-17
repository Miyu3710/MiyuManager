import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AlertTriangle, Check, ChevronDown, Gamepad2, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { Hint } from "../../design-system/components/Hint";
import { Tag } from "../../design-system/components/Tag";
import { useDialogFocus } from "../../design-system/useDialogFocus";
import {
  cancelSteamScan,
  importLibraryCandidates,
  previewSteamScanReport,
  startSteamScan,
} from "../../lib/library-api";
import type {
  ImportCandidateInput,
  SteamGameScan,
  SteamScanProgress,
  SteamScanReport,
} from "../../lib/library-types";
import { formatBytes, formatRelativeDate } from "../../lib/format";
import { cn } from "../../lib/cn";
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

type SteamStep = "scanning" | "review" | "importing" | "done";

interface SteamLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

function gameKey(game: SteamGameScan): string {
  return String(game.appId);
}

const confidenceLabels = {
  high: "高置信",
  medium: "中置信",
  low: "低置信",
} as const;

function updateTime(value: number | null): string {
  if (!value) {
    return "更新时间未知";
  }
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return "更新时间未知";
  }
  return "更新 " + formatRelativeDate(date.toISOString());
}

export function SteamLibraryDialog({ open, onClose, onImported }: SteamLibraryDialogProps) {
  const [step, setStep] = useState<SteamStep>("scanning");
  const [report, setReport] = useState<SteamScanReport | null>(null);
  const [progress, setProgress] = useState<SteamScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const requestClose = useCallback(() => {
    if (step === "importing") {
      return;
    }
    if (step === "scanning") {
      void cancelSteamScan().catch(() => false);
    }
    onClose();
  }, [onClose, step]);
  const dialogRef = useDialogFocus<HTMLDivElement>({
    open,
    onEscape: requestClose,
  });
  const [chosenExe, setChosenExe] = useState<Record<string, number>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<{ imported: number; updated: number } | null>(
    null,
  );

  const games = useMemo(() => {
    const ranked = (report?.games ?? []).map((game) => ({
      ...game,
      candidates: [...game.candidates].sort(
        (a, b) => Number(a.alreadyImported) - Number(b.alreadyImported),
      ),
    }));
    return ranked.sort((a, b) => {
      const rank = (game: SteamGameScan) =>
        game.alreadyImported ? 2 : game.candidates.length === 0 ? 1 : 0;
      return rank(a) - rank(b);
    });
  }, [report]);
  const availableGames = games.filter((game) => game.candidates.length > 0);
  const importableGames = availableGames.filter((game) => !game.alreadyImported);
  const selectedGames = useMemo(
    () => importableGames.filter((game) => selected[gameKey(game)]),
    [importableGames, selected],
  );

  const initializeSelection = useCallback((nextReport: SteamScanReport) => {
    const nextSelected: Record<string, boolean> = {};
    const nextChosen: Record<string, number> = {};
    const nextNames: Record<string, string> = {};
    for (const game of nextReport.games) {
      const key = gameKey(game);
      nextSelected[key] = false;
      nextChosen[key] = 0;
      nextNames[key] = game.name;
    }
    setSelected(nextSelected);
    setChosenExe(nextChosen);
    setNames(nextNames);
  }, []);

  const applyReport = useCallback(
    (nextReport: SteamScanReport) => {
      setReport(nextReport);
      setError(null);
      initializeSelection(nextReport);
      setStep("review");
    },
    [initializeSelection],
  );

  const runScan = async () => {
    setStep("scanning");
    setReport(null);
    setProgress(null);
    setError(null);
    setImportResult(null);
    if (!isTauri()) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      applyReport(previewSteamScanReport());
      return;
    }
    try {
      await startSteamScan();
    } catch (nextError) {
      setError(String(nextError));
      setStep("scanning");
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    let disposed = false;
    const timer = window.setTimeout(
      () => {
        if (disposed) {
          return;
        }
        if (!isTauri()) {
          const nextReport = previewSteamScanReport();
          setReport(nextReport);
          initializeSelection(nextReport);
          setStep("review");
          return;
        }
        void startSteamScan().catch((nextError) => {
          if (!disposed) {
            setError(String(nextError));
          }
        });
      },
      isTauri() ? 80 : 650,
    );
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [initializeSelection, open]);

  useEffect(() => {
    if (!open || !isTauri()) {
      return;
    }
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const register = <T,>(event: string, handler: (payload: T) => void) => {
      void listen<T>(event, (eventPayload) => {
        if (!disposed) {
          handler(eventPayload.payload);
        }
      }).then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          cleanups.push(cleanup);
        }
      });
    };
    register<SteamScanProgress>("steam-scan-progress", setProgress);
    register<SteamScanReport>("steam-scan-complete", (payload) => {
      setProgress(null);
      applyReport(payload);
    });
    register<{ jobId: string; message: string }>("steam-scan-error", (payload) => {
      setError(payload.message);
      setProgress(null);
    });
    return () => {
      disposed = true;
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [applyReport, open]);

  if (!open) {
    return null;
  }

  const cancel = async () => {
    await cancelSteamScan().catch(() => false);
    onClose();
  };

  const importSelected = async () => {
    const candidates: ImportCandidateInput[] = [];
    for (const game of selectedGames) {
      const key = gameKey(game);
      const candidate = game.candidates[chosenExe[key] ?? 0];
      const displayName = (names[key] ?? game.name).trim();
      if (!candidate || !displayName) {
        continue;
      }
      candidates.push({
        exePath: candidate.exePath,
        workingDir: candidate.workingDir,
        displayName,
        rootPath: candidate.rootPath,
        sizeBytes: candidate.sizeBytes,
        steamAppId: game.appId,
      });
    }
    if (candidates.length === 0) {
      setError("没有选择可导入的 Steam 游戏");
      return;
    }
    setStep("importing");
    setError(null);

    try {
      const result = await importLibraryCandidates(candidates);
      setImportResult(result);
      setStep("done");
      onImported();
      const parts = [];
      if (result.imported > 0) parts.push("新增 " + result.imported + " 部");
      if (result.updated > 0) parts.push("更新 " + result.updated + " 部");
      toast.success(parts.join("，") || "Steam 游戏已更新");
    } catch (nextError) {
      setError(String(nextError));
      setStep("review");
    }
  };

  const percent = progress
    ? Math.round((progress.completed / Math.max(1, progress.total)) * 100)
    : 0;

  const title =
    step === "scanning"
      ? "正在扫描 Steam 库"
      : step === "done"
        ? "导入完成"
        : "选择要入库的 Steam 游戏";
  const description =
    step === "done"
      ? "扫描和导入都在本机完成。"
      : "从注册表和 libraryfolders.vdf 定位 Steam 库，只读取目录与 exe，不改动游戏文件。";

  const footerNote =
    step === "scanning"
      ? "扫描在后台进行，可取消。"
      : step === "done"
        ? "扫描和导入都在本机完成。"
        : "默认不勾选；可全选可导入项，或逐项选择主程序。";

  const footerActions =
    step === "scanning" ? (
      <Button variant="secondary" size="sm" onClick={() => void cancel()}>
        取消扫描
      </Button>
    ) : step === "review" || step === "importing" ? (
      <>
        <Button variant="ghost" size="sm" disabled={step === "importing"} onClick={onClose}>
          稍后处理
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={step === "importing" || selectedGames.length === 0}
          onClick={() => void importSelected()}
        >
          {step === "importing" ? (
            <Loader2 size={14} className="import-spin" />
          ) : (
            <Check size={14} />
          )}
          {step === "importing" ? "导入中" : "导入 " + selectedGames.length + " 部"}
        </Button>
      </>
    ) : (
      <Button variant="primary" size="sm" onClick={onClose}>
        完成
      </Button>
    );

  return (
    <ImportDialogFrame
      title={title}
      titleId="steam-title"
      description={description}
      closeLabel="关闭 Steam 扫描"
      onClose={requestClose}
      busy={step === "importing"}
      dialogRef={dialogRef}
      footerNote={footerNote}
      footerActions={footerActions}
    >
      {error && step !== "done" ? (
        <ImportNotice tone="error">
          <AlertTriangle size={14} />
          <span>{error}</span>
          {step === "scanning" ? (
            <Button variant="ghost" size="sm" onClick={() => void runScan()}>
              <RotateCcw size={12} />
              重试
            </Button>
          ) : null}
        </ImportNotice>
      ) : null}

      {step === "scanning" ? (
        <ImportProgress
          icon={<Gamepad2 size={20} strokeWidth={1.5} />}
          label={progress?.currentGame || "正在定位 Steam 库…"}
          detail={progress?.currentLibrary || "读取注册表与 libraryfolders.vdf"}
          percent={progress ? percent : undefined}
          metrics={
            <>
              <ImportMetric
                value={progress ? progress.completed + " / " + progress.total : "—"}
                label="已扫描游戏"
              />
              <ImportMetric value={progress?.foundCandidates ?? 0} label="候选程序" />
              <ImportMetric value={progress?.scannedDirs ?? 0} label="已浏览目录" />
            </>
          }
        />
      ) : null}

      {step === "review" || step === "importing" ? (
        <div className="import-review">
          <ImportSourceBar
            label="Steam 根目录"
            value={report?.steamRoot || "—"}
            badges={report?.libraries.map((library) => (
              <Hint key={library.path} label={library.path} side="bottom" align="start">
                <Tag tone="data">
                  {library.path.split("\\").filter(Boolean).slice(-1)[0] || library.path} ·{" "}
                  {library.appCount}
                </Tag>
              </Hint>
            ))}
          />
          {report?.errors.length ? (
            <ImportNotice tone="warning">
              <AlertTriangle size={14} />
              <span>{report.errors.join("；")}</span>
            </ImportNotice>
          ) : null}
          <ImportSummary
            actions={
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    for (const game of games)
                      next[gameKey(game)] = game.candidates.length > 0 && !game.alreadyImported;
                    setSelected(next);
                  }}
                >
                  全选可导入
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={selectedGames.length === 0}
                  onClick={() => setSelected({})}
                >
                  清空
                </Button>
              </>
            }
          >
            <ImportCount value={games.length} label="部游戏" />
            <ImportCount value={availableGames.length} label="部有 exe 候选" />
            <ImportCount value={selectedGames.length} label="部已选" />
          </ImportSummary>

          <div className="import-list-scroll">
            <div className="import-list">
              {games.map((game) => {
                const key = gameKey(game);
                const candidate = game.candidates[chosenExe[key] ?? 0];
                const canImport = game.candidates.length > 0 && !game.alreadyImported;
                return (
                  <div
                    key={key}
                    className={cn(
                      "import-row",
                      "import-row--controls",
                      selected[key] && canImport && "is-selected",
                      game.alreadyImported && "is-imported",
                      !candidate && "is-empty",
                    )}
                  >
                    <label className="import-row__check">
                      <input
                        type="checkbox"
                        aria-label={"选择 " + game.name}
                        checked={Boolean(selected[key] && canImport)}
                        disabled={!canImport}
                        onChange={() =>
                          setSelected((current) => ({ ...current, [key]: !current[key] }))
                        }
                      />
                    </label>
                    <div className="import-row__main">
                      <div className="import-row__title">
                        <b>{game.name}</b>
                        <Tag tone="data">Steam #{game.appId}</Tag>
                        {game.alreadyImported ? <Tag tone="status">已在库中</Tag> : null}
                      </div>
                      <Hint label={game.installDir} side="bottom" align="start">
                        <code className="import-row__path">{game.installDir}</code>
                      </Hint>
                      <div className="import-row__submeta">
                        <span>
                          {game.sizeOnDisk > 0 ? formatBytes(game.sizeOnDisk) : "大小未知"}
                        </span>
                        <span>{updateTime(game.lastUpdated)}</span>
                      </div>
                      {!candidate ? (
                        <p className="import-row__error">{game.error ?? "没有找到可启动的 exe"}</p>
                      ) : null}
                    </div>
                    {candidate ? (
                      <div className="import-row__controls">
                        <label className="import-field">
                          <span>显示名称</span>
                          <input
                            value={names[key] ?? game.name}
                            disabled={!canImport}
                            onChange={(event) =>
                              setNames((current) => ({ ...current, [key]: event.target.value }))
                            }
                            aria-label={"显示名称 " + game.name}
                          />
                        </label>
                        <label className="import-field">
                          <span>主程序</span>
                          <span className="import-field__select">
                            <select
                              value={chosenExe[key] ?? 0}
                              disabled={!canImport}
                              aria-label={"主程序 " + game.name}
                              onChange={(event) =>
                                setChosenExe((current) => ({
                                  ...current,
                                  [key]: Number(event.target.value),
                                }))
                              }
                            >
                              {game.candidates.map((item, index) => (
                                <option value={index} key={item.exeKey}>
                                  {item.exePath.split("\\").slice(-1)[0]}，
                                  {confidenceLabels[item.confidence]}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={12} />
                          </span>
                        </label>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {step === "done" && importResult ? (
        <ImportEmpty
          icon={<Check size={22} strokeWidth={1.8} />}
          title="Steam 游戏已入库"
          description={
            "新增 " +
            importResult.imported +
            " 部，更新 " +
            importResult.updated +
            " 部。" +
            (report?.cancelled ? "扫描被取消，已完成部分仍可导入。" : "")
          }
        />
      ) : null}
    </ImportDialogFrame>
  );
}
