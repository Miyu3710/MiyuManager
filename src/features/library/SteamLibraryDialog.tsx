import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { AlertTriangle, Check, ChevronDown, Gamepad2, Loader2, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { Tag } from "../../design-system/components/Tag";
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
import "./steam-library.css";

type SteamStep = "scanning" | "review" | "importing" | "done";

interface SteamLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

function gameKey(game: SteamGameScan): string {
  return String(game.appId);
}

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
  const [chosenExe, setChosenExe] = useState<Record<string, number>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<{ imported: number; updated: number } | null>(
    null,
  );

  const games = report?.games ?? [];
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
      nextSelected[key] = game.candidates.length > 0 && !game.alreadyImported;
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

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && step !== "importing") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, open, step]);

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
      if (result.imported > 0) parts.push(`新增 ${result.imported} 部`);
      if (result.updated > 0) parts.push(`更新 ${result.updated} 部`);
      toast.success(parts.join("，") || "Steam 游戏已更新");
    } catch (nextError) {
      setError(String(nextError));
      setStep("review");
    }
  };

  const percent = progress
    ? Math.round((progress.completed / Math.max(1, progress.total)) * 100)
    : 0;

  return (
    <div
      className="steam-overlay"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && step !== "importing") {
          onClose();
        }
      }}
    >
      <div className="steam-dialog" role="dialog" aria-modal="true" aria-labelledby="steam-title">
        <header className="steam-head">
          <div>
            <p className="app-kicker">STEAM LIBRARY / 自动嗅探</p>
            <h2 id="steam-title">
              {step === "scanning"
                ? "正在扫描 Steam 库"
                : step === "done"
                  ? "导入完成"
                  : "选择要入库的 Steam 游戏"}
            </h2>
            <p>
              从注册表和 `libraryfolders.vdf` 定位 Steam 库，读取 appmanifest
              后扫描安装目录；只读取目录与 exe，不修改游戏文件。
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="关闭 Steam 扫描"
            disabled={step === "importing"}
            onClick={onClose}
          >
            <X size={15} />
          </Button>
        </header>

        {error ? (
          <div className="steam-notice steam-notice--error">
            <AlertTriangle size={14} />
            <span>{error}</span>
            {step === "scanning" ? (
              <Button variant="ghost" size="sm" onClick={() => void runScan()}>
                <RotateCcw size={12} /> 重试
              </Button>
            ) : null}
          </div>
        ) : null}

        {step === "scanning" ? (
          <div className="steam-scanning">
            <div className="steam-scanning__mark">
              <Gamepad2 size={24} strokeWidth={1.3} />
              <Loader2 size={16} className="steam-spin" />
            </div>
            <div className="steam-scanning__body">
              <b>{progress?.currentGame || "正在定位 Steam 库…"}</b>
              <span>{progress?.currentLibrary || "读取注册表与 libraryfolders.vdf"}</span>
            </div>
            {progress ? (
              <>
                <div className="steam-progress__track">
                  <i style={{ width: percent + "%" }} />
                </div>
                <div className="steam-progress__stats">
                  <span>
                    {progress.completed} / {progress.total} 部
                  </span>
                  <span>{progress.foundCandidates} 个候选</span>
                  <span>{progress.scannedDirs} 个目录</span>
                </div>
              </>
            ) : null}
            <footer className="steam-actions">
              <span>扫描在后台进行，可取消。</span>
              <Button variant="ghost" size="sm" onClick={() => void cancel()}>
                取消扫描
              </Button>
            </footer>
          </div>
        ) : null}

        {step === "review" || step === "importing" ? (
          <div className="steam-review">
            <div className="steam-libraries">
              <div>
                <b>Steam 根目录</b>
                <span title={report?.steamRoot}>{report?.steamRoot}</span>
              </div>
              {report?.libraries.map((library) => (
                <Tag tone="data" key={library.path} title={library.path}>
                  {library.path.split("\\").filter(Boolean).slice(-1)[0] || library.path} ·{" "}
                  {library.appCount}
                </Tag>
              ))}
            </div>
            {report?.errors.length ? (
              <div className="steam-notice steam-notice--warning">
                <AlertTriangle size={14} />
                <span>{report.errors.join("；")}</span>
              </div>
            ) : null}
            <div className="steam-review__summary">
              <span>
                <b>{games.length}</b> 部游戏
              </span>
              <span>
                <b>{availableGames.length}</b> 部有 exe 候选
              </span>
              <span>
                <b>{selectedGames.length}</b> 部已选
              </span>
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
              <Button variant="ghost" size="sm" onClick={() => setSelected({})}>
                清空
              </Button>
            </div>
            <div className="steam-game-list">
              {games.map((game) => {
                const key = gameKey(game);
                const candidate = game.candidates[chosenExe[key] ?? 0];
                const canImport = game.candidates.length > 0 && !game.alreadyImported;
                return (
                  <div
                    key={key}
                    className={cn(
                      "steam-game",
                      selected[key] && canImport && "is-selected",
                      game.alreadyImported && "is-existing",
                      !candidate && "is-empty",
                    )}
                  >
                    <label className="steam-game__check">
                      <input
                        type="checkbox"
                        aria-label={`选择 ${game.name}`}
                        checked={Boolean(selected[key] && canImport)}
                        disabled={!canImport}
                        onChange={() =>
                          setSelected((current) => ({ ...current, [key]: !current[key] }))
                        }
                      />
                    </label>
                    <div className="steam-game__body">
                      <div className="steam-game__title">
                        <b>{game.name}</b>
                        <Tag tone="data">Steam #{game.appId}</Tag>
                        {game.alreadyImported ? <Tag tone="status">已在库中</Tag> : null}
                      </div>
                      <span className="steam-game__path" title={game.installDir}>
                        {game.installDir}
                      </span>
                      <div className="steam-game__meta">
                        <span>
                          {game.sizeOnDisk > 0 ? formatBytes(game.sizeOnDisk) : "大小未知"}
                        </span>
                        <span>{updateTime(game.lastUpdated)}</span>
                      </div>
                      {candidate ? (
                        <div className="steam-game__controls">
                          <label>
                            <span>显示名称</span>
                            <input
                              value={names[key] ?? game.name}
                              onChange={(event) =>
                                setNames((current) => ({ ...current, [key]: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>主程序</span>
                            <select
                              value={chosenExe[key] ?? 0}
                              onChange={(event) =>
                                setChosenExe((current) => ({
                                  ...current,
                                  [key]: Number(event.target.value),
                                }))
                              }
                            >
                              {game.candidates.map((item, index) => (
                                <option value={index} key={item.exeKey}>
                                  {item.exePath.split("\\").slice(-1)[0]} · {item.confidence}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={12} />
                          </label>
                        </div>
                      ) : (
                        <p className="steam-game__error">{game.error ?? "没有找到可启动的 exe"}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <footer className="steam-actions">
              <span>{error ?? "默认选择未被移除且找到主程序的作品；可逐项改选。"}</span>
              <div>
                <Button variant="ghost" size="sm" onClick={onClose} disabled={step === "importing"}>
                  稍后处理
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={step === "importing" || selectedGames.length === 0}
                  onClick={() => void importSelected()}
                >
                  {step === "importing" ? (
                    <Loader2 size={14} className="steam-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  {step === "importing" ? "导入中" : `导入 ${selectedGames.length} 部`}
                </Button>
              </div>
            </footer>
          </div>
        ) : null}

        {step === "done" && importResult ? (
          <div className="steam-done">
            <div className="steam-done__mark">
              <Check size={22} />
            </div>
            <b>Steam 游戏已入库</b>
            <p>
              新增 {importResult.imported} 部，更新 {importResult.updated} 部。
              {report?.cancelled ? "扫描被取消，已完成部分仍可导入。" : ""}
            </p>
            <Button variant="primary" size="sm" onClick={onClose}>
              完成
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
