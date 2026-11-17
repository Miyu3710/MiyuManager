import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ListChecks,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../design-system/components/Button";
import { Tag } from "../../design-system/components/Tag";
import { useDialogFocus } from "../../design-system/useDialogFocus";
import {
  applyMetadataBatch,
  cancelMetadataBatch,
  listMetadataProviders,
  pauseMetadataBatch,
  previewMetadataBatchForUi,
  startMetadataBatch,
} from "../../lib/library-api";
import type {
  BatchApplyResult,
  BatchComplete,
  BatchProgress,
  BatchWorkResult,
  MergePreview,
  MetadataProvider,
  MetadataValue,
} from "../../lib/library-types";
import { cn } from "../../lib/cn";
import "./batch.css";

type BatchStep = "setup" | "scanning" | "review" | "applying" | "done";

interface BatchScrapeDialogProps {
  open: boolean;
  workIds: number[];
  onClose: () => void;
  onApplied: () => void;
}

function valueText(value: MetadataValue, limit = 72): string {
  if (value === null || value === "") {
    return "空";
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "空" : value.join("、");
  }
  const text = String(value);
  return text.length > limit ? text.slice(0, limit).trimEnd() + "…" : text;
}

function statusLabel(status: string): string {
  switch (status) {
    case "proposed":
      return "有提案";
    case "applied":
      return "已应用";
    case "skipped":
      return "跳过";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

function statusTone(status: string): "status" | "data" | "muted" | "accent" {
  if (status === "applied" || status === "proposed") {
    return "status";
  }
  if (status === "failed") {
    return "accent";
  }
  return "muted";
}

function ProposalPreview({ preview }: { preview: MergePreview }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="batch-proposal">
      <button
        type="button"
        className="batch-proposal__toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{preview.fields.length} 个字段</span>
        <span>{preview.covers.length} 张封面</span>
        <ChevronDown size={12} className={cn(open && "is-open")} />
      </button>
      {open ? (
        <div className="batch-proposal__fields">
          {preview.fields.map((field) => (
            <div className="batch-proposal__field" key={field.field}>
              <b>{field.label}</b>
              <span>{valueText(field.current, 34)}</span>
              <span className="batch-proposal__arrow">→</span>
              <span className="batch-proposal__next">
                {field.candidates[0] ? valueText(field.candidates[0].value, 54) : "无候选"}
              </span>
              <em>{field.candidates[0]?.providerName ?? "—"}</em>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function BatchScrapeDialog({ open, workIds, onClose, onApplied }: BatchScrapeDialogProps) {
  const providersQuery = useQuery({
    queryKey: ["metadata-providers"],
    queryFn: listMetadataProviders,
    staleTime: 5_000,
  });
  const providers = useMemo(
    () => (providersQuery.data ?? []).filter((provider) => provider.enabled),
    [providersQuery.data],
  );
  const [step, setStep] = useState<BatchStep>("setup");
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[] | null>(null);
  const [includeCovers, setIncludeCovers] = useState(true);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [results, setResults] = useState<BatchWorkResult[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<BatchApplyResult | null>(null);
  const [selectedWorks, setSelectedWorks] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useDialogFocus<HTMLDivElement>({
    open,
    onEscape: () => {
      if (step !== "scanning" && step !== "applying") {
        onClose();
      }
    },
  });

  const selectedProviders = selectedProviderIds ?? providers.map((provider) => provider.id);

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
    register<BatchProgress>("metadata-batch-progress", (payload) => setProgress(payload));
    register<BatchWorkResult>("metadata-batch-work", (payload) => {
      setResults((current) => {
        const next = current.filter((item) => item.workId !== payload.workId);
        next.push(payload);
        return next.sort((left, right) => left.workId - right.workId);
      });
      if (payload.preview) {
        setSelectedWorks((current) => new Set(current).add(payload.workId));
      }
    });
    register<BatchComplete>("metadata-batch-complete", (payload) => {
      setProgress((current) =>
        current
          ? {
              ...current,
              completed: payload.completed,
              failed: payload.failed,
              cancelled: payload.cancelled,
            }
          : current,
      );
      setStep("review");
    });
    register<BatchProgress>("metadata-batch-apply-progress", (payload) => setProgress(payload));
    return () => {
      disposed = true;
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const runScan = async (targetWorkIds = workIds) => {
    if (targetWorkIds.length === 0) {
      setError("至少选择一部作品");
      return;
    }
    setStep("scanning");
    setError(null);
    setResults([]);
    setSelectedWorks(new Set());
    setApplyResult(null);
    setProgress({
      jobId: "pending",
      total: targetWorkIds.length,
      completed: 0,
      failed: 0,
      skipped: 0,
      paused: false,
      cancelled: false,
      currentWorkId: null,
      currentTitle: "",
      message: "准备批量匹配…",
    });
    if (!isTauri()) {
      try {
        const next = await previewMetadataBatchForUi(targetWorkIds, selectedProviders);
        setResults(next);
        setSelectedWorks(new Set(next.filter((item) => item.preview).map((item) => item.workId)));
        setProgress((current) =>
          current
            ? {
                ...current,
                completed: next.length,
                failed: next.filter((item) => item.status === "failed").length,
                skipped: next.filter((item) => item.status === "skipped").length,
                message: "匹配完成",
              }
            : current,
        );
        setStep("review");
      } catch (nextError) {
        setError(String(nextError));
        setStep("setup");
      }
      return;
    }
    try {
      const start = await startMetadataBatch({
        workIds: targetWorkIds,
        providerIds: selectedProviders,
        includeCovers,
      });
      setJobId(start.jobId);
    } catch (nextError) {
      setError(String(nextError));
      setStep("setup");
    }
  };

  const togglePause = async () => {
    if (!jobId) {
      return;
    }
    const paused = !progress?.paused;
    await pauseMetadataBatch(jobId, paused);
    setProgress((current) => (current ? { ...current, paused } : current));
  };

  const cancelScan = async () => {
    if (jobId) {
      await cancelMetadataBatch(jobId);
    }
    setStep("setup");
    setProgress(null);
    setJobId(null);
  };

  const apply = async () => {
    const selectedIds = results
      .filter((item) => item.preview && selectedWorks.has(item.workId))
      .map((item) => item.workId);
    if (selectedIds.length === 0) {
      setError("没有选择可应用的作品");
      return;
    }
    setStep("applying");
    setError(null);
    setBusy(true);
    try {
      const result = await applyMetadataBatch({
        jobId: jobId ?? "preview-batch",
        workIds: selectedIds,
        includeCovers,
      });
      setApplyResult(result);
      setStep("done");
      onApplied();
    } catch (nextError) {
      setError(String(nextError));
      setStep("review");
    } finally {
      setBusy(false);
    }
  };

  const proposed = results.filter((item) => item.preview).length;
  const failed = results.filter((item) => item.status === "failed").length;
  const skipped = results.filter((item) => item.status === "skipped").length;
  const percent = progress
    ? Math.round((progress.completed / Math.max(1, progress.total)) * 100)
    : 0;

  return createPortal(
    <div
      className="batch-overlay"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && step !== "scanning" && step !== "applying") {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="batch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-title"
        tabIndex={-1}
      >
        <header className="batch-head">
          <div>
            <h2 id="batch-title">
              {step === "setup"
                ? "批量补全元数据"
                : step === "scanning"
                  ? "正在匹配来源"
                  : step === "applying"
                    ? "正在应用提案"
                    : step === "done"
                      ? "批量任务完成"
                      : "检查批量提案"}
            </h2>
            <p>{workIds.length} 部作品；默认只填空白字段，已有资料需要明确选择才会覆盖。</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="关闭批量刮削"
            disabled={step === "scanning" || step === "applying"}
            onClick={onClose}
          >
            <X size={15} />
          </Button>
        </header>

        {error ? (
          <div className="batch-notice batch-notice--error">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        ) : null}

        {step === "setup" ? (
          <div className="batch-setup">
            <section>
              <div className="batch-section-head">
                <b>参与匹配的来源</b>
                <span>按设置中的全局顺序排列；后续新增来源会自动出现。</span>
              </div>
              {providersQuery.isPending ? (
                <div className="batch-loading">
                  <Loader2 size={14} className="batch-spin" /> 正在读取来源…
                </div>
              ) : providers.length === 0 ? (
                <p className="batch-hint">没有启用的来源，请先到设置中启用。</p>
              ) : (
                <div className="batch-providers">
                  {providers.map((provider: MetadataProvider) => {
                    const checked = selectedProviders.includes(provider.id);
                    const unavailable = provider.requiresAuth && !provider.connected;
                    return (
                      <label
                        className={cn(
                          "batch-provider",
                          checked && "is-selected",
                          unavailable && "is-disabled",
                        )}
                        key={provider.id}
                      >
                        <input
                          type="checkbox"
                          aria-label={provider.name}
                          checked={checked}
                          disabled={unavailable}
                          onChange={() =>
                            setSelectedProviderIds((current) =>
                              (current ?? providers.map((item) => item.id)).includes(provider.id)
                                ? (current ?? providers.map((item) => item.id)).filter(
                                    (id) => id !== provider.id,
                                  )
                                : [...(current ?? providers.map((item) => item.id)), provider.id],
                            )
                          }
                        />
                        <span>
                          <b>{provider.name}</b>
                          <em>{provider.description}</em>
                        </span>
                        <Tag tone={unavailable || !provider.enabled ? "muted" : "status"}>
                          {unavailable ? "待登录" : provider.enabled ? "启用" : "停用"}
                        </Tag>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="batch-options">
              <label>
                <input
                  type="checkbox"
                  aria-label="同时补全封面"
                  checked={includeCovers}
                  onChange={() => setIncludeCovers((current) => !current)}
                />
                <span>
                  <b>同时补全封面</b>
                  <em>只对当前没有封面且未锁定的作品下载首选封面。</em>
                </span>
              </label>
              <div className="batch-safety">
                <ListChecks size={14} />
                <span>
                  两阶段执行：先匹配并生成提案，确认后才会写入。非空字段不会自动覆盖，失败项可以单独重试。
                </span>
              </div>
            </section>
            <footer className="batch-actions">
              <span>已选择 {workIds.length} 部作品</span>
              <div>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  取消
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={workIds.length === 0 || selectedProviders.length === 0}
                  onClick={() => void runScan()}
                >
                  <ListChecks size={14} /> 开始匹配
                </Button>
              </div>
            </footer>
          </div>
        ) : null}

        {step === "scanning" ? (
          <div className="batch-progress">
            <div className="batch-progress__top">
              <div>
                <b>{progress?.message ?? "正在准备…"}</b>
                <span>{progress?.currentTitle || "正在读取作品和来源"}</span>
              </div>
              <strong>{percent}%</strong>
            </div>
            <div className="batch-progress__track">
              <i style={{ width: percent + "%" }} />
            </div>
            <div className="batch-progress__stats">
              <span>
                完成 {progress?.completed ?? 0} / {progress?.total ?? workIds.length}
              </span>
              <span>有提案 {proposed}</span>
              <span>失败 {progress?.failed ?? failed}</span>
              <span>跳过 {progress?.skipped ?? skipped}</span>
            </div>
            <div className="batch-actions">
              <span>{progress?.paused ? "已暂停，队列保留" : "队列运行中，界面仍可操作"}</span>
              <div>
                <Button variant="secondary" size="sm" onClick={() => void togglePause()}>
                  {progress?.paused ? <Play size={13} /> : <Pause size={13} />}
                  {progress?.paused ? "继续" : "暂停"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void cancelScan()}>
                  取消任务
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {step === "review" || step === "applying" ? (
          <div className="batch-review">
            <div className="batch-review__summary">
              <span>
                <b>{proposed}</b> 部有提案
              </span>
              <span>
                <b>{failed}</b> 部失败
              </span>
              <span>
                <b>{skipped}</b> 部跳过
              </span>
              <span>
                已选 <b>{selectedWorks.size}</b> 部应用
              </span>
            </div>
            <div className="batch-review__list">
              {results.map((item) => {
                const canSelect = Boolean(item.preview);
                const checked = selectedWorks.has(item.workId);
                return (
                  <div
                    className={cn(
                      "batch-work",
                      checked && "is-selected",
                      item.status === "failed" && "is-failed",
                    )}
                    key={item.workId}
                  >
                    <label className="batch-work__check">
                      <input
                        type="checkbox"
                        aria-label={`选择 ${item.title}`}
                        checked={checked}
                        disabled={!canSelect}
                        onChange={() =>
                          setSelectedWorks((current) => {
                            const next = new Set(current);
                            if (next.has(item.workId)) {
                              next.delete(item.workId);
                            } else {
                              next.add(item.workId);
                            }
                            return next;
                          })
                        }
                      />
                    </label>
                    <div className="batch-work__body">
                      <div className="batch-work__title">
                        <b>{item.title}</b>
                        <Tag tone={statusTone(item.status)}>{statusLabel(item.status)}</Tag>
                      </div>
                      {item.preview ? (
                        <>
                          <div className="batch-work__sources">
                            {item.preview.matched.map((match) => (
                              <span key={`${match.provider}:${match.sourceId}`}>
                                {match.providerName}，{Math.round(match.score * 100)}%
                              </span>
                            ))}
                          </div>
                          <ProposalPreview preview={item.preview} />
                        </>
                      ) : item.error ? (
                        <p className="batch-work__error">{item.error}</p>
                      ) : (
                        <p className="batch-work__error">没有可填充的空白字段或封面。</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {step === "applying" ? (
              <div className="batch-applying">
                <Loader2 size={15} className="batch-spin" />
                {progress?.message ?? "正在应用提案…"}
              </div>
            ) : null}
            <footer className="batch-actions">
              <span>应用前再次检查空字段；已有值不会被覆盖。</span>
              <div>
                {failed > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void runScan(
                        results
                          .filter((item) => item.status === "failed")
                          .map((item) => item.workId),
                      )
                    }
                  >
                    <RotateCcw size={13} /> 重试失败项
                  </Button>
                ) : null}
                <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
                  稍后处理
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy || selectedWorks.size === 0 || step === "applying"}
                  onClick={() => void apply()}
                >
                  {busy ? <Loader2 size={14} className="batch-spin" /> : <Check size={14} />}
                  {busy ? "应用中" : `应用 ${selectedWorks.size} 部`}
                </Button>
              </div>
            </footer>
          </div>
        ) : null}

        {step === "done" && applyResult ? (
          <div className="batch-done">
            <div className="batch-done__mark">
              <Check size={22} />
            </div>
            <div className="batch-done__summary">
              <b>已应用 {applyResult.appliedWorks} 部作品</b>
              <p>
                {applyResult.appliedFields} 个字段，{applyResult.coverApplied} 张封面，跳过{" "}
                {applyResult.skippedWorks} 部，失败 {applyResult.failedWorks} 部
              </p>
            </div>
            <div className="batch-done__list">
              {applyResult.works.map((item) => (
                <div className="batch-done__row" key={item.workId}>
                  <span>{item.title}</span>
                  <Tag tone={statusTone(item.status)}>{statusLabel(item.status)}</Tag>
                  <em>
                    {item.applied.length > 0 ? `${item.applied.length} 个字段` : "无字段"}
                    {item.coverApplied ? "，封面" : ""}
                  </em>
                </div>
              ))}
            </div>
            <footer className="batch-actions">
              <span>结果已写入；详情页和游戏库会刷新。</span>
              <Button variant="primary" size="sm" onClick={onClose}>
                完成
              </Button>
            </footer>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
