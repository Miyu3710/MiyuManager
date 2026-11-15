import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Lock,
  LockOpen,
  Search,
  Globe2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Tag } from "../../design-system/components/Tag";
import {
  cancelMetadataSearch,
  adoptMetadataClaim,
  assetUrl,
  getMetadataPreview,
  getMetadataWorkState,
  importMetadata,
  listMetadataProviders,
  searchMetadataPreview,
  setMetadataFieldLock,
  startMetadataSearch,
} from "../../lib/library-api";
import type {
  LibraryItemDetail,
  MetadataFieldState,
  MetadataClaim,
  MetadataPreview,
  MetadataProvider,
  MetadataProviderFailure,
  MetadataSearchCandidate,
  MetadataSearchComplete,
  MetadataSearchProgress,
  MetadataValue,
  PreviewField,
} from "../../lib/library-types";
import { formatRelativeDate } from "../../lib/format";
import { cn } from "../../lib/cn";
import "./metadata.css";

interface MetadataPanelProps {
  detail: LibraryItemDetail;
  onChanged: () => void;
}

function providerName(providers: MetadataProvider[] | undefined, id: string | null): string {
  if (!id) {
    return "未记录";
  }
  if (id === "manual") {
    return "手动编辑";
  }
  if (id === "local") {
    return "本地发现";
  }
  if (id === "online") {
    return "在线下载";
  }
  return providers?.find((provider) => provider.id === id)?.name ?? id;
}

function valueText(value: MetadataValue, limit = 90): string {
  if (value === null || value === "") {
    return "空";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "空";
    }
    return value.join("、");
  }
  const text = String(value);
  if (text.length <= limit) {
    return text;
  }
  return text.slice(0, limit).trimEnd() + "…";
}

function coverValueText(value: MetadataValue): string {
  if (value === "local") {
    return "本地发现";
  }
  if (value === "online") {
    return "在线下载";
  }
  if (value === "manual") {
    return "手动选择";
  }
  return valueText(value, 70);
}

function RemoteCover({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="metadata-cover-fallback" aria-label={`${title} 无封面`}>
        <ImageIcon size={18} strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <img
      className="metadata-cover"
      src={url}
      alt={`${title} 封面`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function PreviewRow({
  field,
  checked,
  onToggle,
}: {
  field: PreviewField;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className={cn("metadata-preview-row", field.locked && "is-locked")}>
      <input type="checkbox" checked={checked} disabled={field.locked} onChange={onToggle} />
      <span className="metadata-preview-row__label">{field.label}</span>
      <span className="metadata-preview-row__values">
        <span>{valueText(field.current, 48)}</span>
        <ArrowRight size={12} strokeWidth={1.5} />
        <b>{valueText(field.candidate, 64)}</b>
      </span>
      {field.locked ? (
        <Tag tone="muted" className="metadata-lock-tag">
          <Lock size={11} /> 已锁定
        </Tag>
      ) : field.existing.length > 0 ? (
        <span className="metadata-existing">{field.existing.length} 个来源值</span>
      ) : null}
    </label>
  );
}

function LedgerRow({
  field,
  providers,
  onLock,
  onAdopt,
  adoptingId,
  coverPreviewUrl,
}: {
  field: MetadataFieldState;
  providers: MetadataProvider[] | undefined;
  onLock: () => void;
  onAdopt: (claim: MetadataClaim) => void;
  adoptingId: number | null;
  coverPreviewUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const latest = field.claims[0];
  const currentText =
    field.field === "cover" ? coverValueText(field.current) : valueText(field.current, 70);
  return (
    <div className="metadata-ledger__row-wrap">
      <div className="metadata-ledger__row">
        <span className="metadata-ledger__field">
          {field.label}
          {field.conflict ? <Tag tone="accent">冲突</Tag> : null}
        </span>
        <span className="metadata-ledger__value" title={currentText}>
          {field.field === "cover" ? (
            <span className="metadata-ledger__cover-current">
              <span className="metadata-claim-cover">
                <RemoteCover url={coverPreviewUrl} title={field.label} />
              </span>
              <em>{coverValueText(field.current)}</em>
            </span>
          ) : (
            currentText
          )}
        </span>
        <span>{providerName(providers, field.source)}</span>
        <span>{latest ? formatRelativeDate(latest.fetchedAt) : "—"}</span>
        <button
          type="button"
          className={cn("metadata-lock-button", field.locked && "is-locked")}
          onClick={onLock}
          title={field.locked ? "解锁此字段" : "锁定此字段，后续导入不覆盖"}
        >
          {field.locked ? <Lock size={12} /> : <LockOpen size={12} />}
          {field.locked ? "已锁定" : "锁定"}
        </button>
      </div>
      {field.claims.length > 0 ? (
        <div className="metadata-ledger__claims-wrap">
          <button
            type="button"
            className="metadata-ledger__claims-toggle"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <span>
              {field.claims.length} 个来源值
              {field.conflict ? "，需要确认" : ""}
            </span>
            <ChevronRight size={12} className={cn(open && "is-open")} />
          </button>
          {open ? (
            <div className="metadata-ledger__claim-list">
              {field.claims.map((claim) => (
                <div
                  key={claim.id}
                  className={cn(
                    "metadata-ledger__claim-row",
                    claim.id === field.currentClaimId && "is-current",
                    claim.locked && "is-locked",
                  )}
                >
                  <span className="metadata-ledger__claim-source">
                    <b>{claim.providerName}</b>
                    <em>#{claim.sourceId || "手动"}</em>
                  </span>
                  <span
                    className="metadata-ledger__claim-value"
                    title={field.field === "cover" ? undefined : valueText(claim.value, 400)}
                  >
                    {field.field === "cover" ? (
                      <span className="metadata-claim-cover">
                        <RemoteCover
                          url={typeof claim.value === "string" ? claim.value : null}
                          title={claim.providerName}
                        />
                      </span>
                    ) : (
                      valueText(claim.value, 120)
                    )}
                  </span>
                  <span className="metadata-ledger__claim-time">
                    {formatRelativeDate(claim.fetchedAt)}
                  </span>
                  {claim.id === field.currentClaimId ? (
                    <Tag tone="status">当前</Tag>
                  ) : field.locked ? (
                    <Tag tone="muted">
                      <Lock size={10} /> 已锁定
                    </Tag>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={adoptingId === claim.id}
                      onClick={() => onAdopt(claim)}
                    >
                      {adoptingId === claim.id ? (
                        <Loader2 size={11} className="metadata-spin" />
                      ) : null}
                      采用此值
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MetadataPanel({ detail, onChanged }: MetadataPanelProps) {
  const workId = detail.workId;
  const providersQuery = useQuery({
    queryKey: ["metadata-providers"],
    queryFn: listMetadataProviders,
    staleTime: 5_000,
  });
  const stateQuery = useQuery({
    queryKey: ["metadata-work-state", workId],
    queryFn: () => getMetadataWorkState(workId),
    staleTime: 2_000,
  });
  const [query, setQuery] = useState(detail.originalTitle || detail.title);
  const [providerFilter, setProviderFilter] = useState("all");
  const [results, setResults] = useState<MetadataSearchCandidate[] | null>(null);
  const [errors, setErrors] = useState<MetadataProviderFailure[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [progress, setProgress] = useState<MetadataSearchProgress | null>(null);
  const [selected, setSelected] = useState<MetadataSearchCandidate | null>(null);
  const [preview, setPreview] = useState<MetadataPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [adoptingClaim, setAdoptingClaim] = useState<number | null>(null);
  const activeJob = useRef<string | null>(null);

  const providers = stateQuery.data?.providers ?? providersQuery.data;
  const coverPreviewUrl = assetUrl(detail.coverThumbPath) ?? assetUrl(detail.coverPath);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const register = <T,>(event: string, handler: (payload: T) => void) => {
      void listen<T>(event, (eventPayload) => {
        if (!disposed) {
          handler(eventPayload.payload);
        }
      })
        .then((cleanup) => {
          if (disposed) {
            cleanup();
          } else {
            cleanups.push(cleanup);
          }
        })
        .catch(() => undefined);
    };
    register<MetadataSearchProgress>("metadata-search-progress", (payload) => {
      if (payload.workId === workId) {
        setProgress(payload);
      }
    });
    register<MetadataSearchComplete>("metadata-search-complete", (payload) => {
      if (
        payload.workId !== workId ||
        (activeJob.current !== null && payload.jobId !== activeJob.current)
      ) {
        return;
      }
      setResults(payload.results);
      setErrors(payload.errors);
      setSearching(false);
      setProgress(null);
      activeJob.current = null;
      if (payload.cancelled) {
        toast.message("已取消元数据搜索");
      }
    });
    register<{ jobId: string; workId: number; message: string }>(
      "metadata-search-error",
      (payload) => {
        if (
          payload.workId !== workId ||
          (activeJob.current !== null && payload.jobId !== activeJob.current)
        ) {
          return;
        }
        setSearchError(payload.message);
        setSearching(false);
        setProgress(null);
        activeJob.current = null;
      },
    );
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [workId]);

  const clearPreview = () => {
    setSelected(null);
    setPreview(null);
    setSelectedFields(new Set());
    setSelectedCoverUrl(null);
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      return;
    }
    if (activeJob.current) {
      await cancelMetadataSearch(activeJob.current).catch(() => false);
      activeJob.current = null;
    }
    setSearching(true);
    setSearchError(null);
    setErrors([]);
    setResults(null);
    clearPreview();
    setProgress(null);
    try {
      if (!isTauri()) {
        const complete = await searchMetadataPreview(
          workId,
          query,
          providerFilter === "all" ? null : providerFilter,
        );
        setResults(complete.results);
        setErrors(complete.errors);
        setSearching(false);
        return;
      }
      const start = await startMetadataSearch(
        workId,
        query,
        providerFilter === "all" ? null : providerFilter,
      );
      activeJob.current = start.jobId;
    } catch (error) {
      setSearchError(String(error));
      setSearching(false);
    }
  };

  const handleCancel = async () => {
    if (!activeJob.current) {
      return;
    }
    try {
      await cancelMetadataSearch(activeJob.current);
      setProgress((current) => (current ? { ...current, message: "正在取消…" } : current));
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleSelect = async (candidate: MetadataSearchCandidate) => {
    setSelected(candidate);
    setPreview(null);
    setPreviewing(true);
    try {
      const next = await getMetadataPreview(workId, candidate.provider, candidate.sourceId);
      setPreview(next);
      setSelectedFields(
        new Set(next.fields.filter((field) => field.defaultSelected).map((field) => field.field)),
      );
      const coverOptions = next.coverOptions ?? (next.cover ? [next.cover] : []);
      setSelectedCoverUrl(
        coverOptions.find((cover) => cover.defaultSelected)?.candidateUrl ?? null,
      );
    } catch (error) {
      toast.error(String(error));
      setSelected(null);
    } finally {
      setPreviewing(false);
    }
  };

  const toggleField = (field: PreviewField) => {
    if (field.locked) {
      return;
    }
    setSelectedFields((current) => {
      const next = new Set(current);
      if (next.has(field.field)) {
        next.delete(field.field);
      } else {
        next.add(field.field);
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (!preview) {
      return;
    }
    setImporting(true);
    try {
      const result = await importMetadata({
        workId,
        provider: preview.provider,
        sourceId: preview.sourceId,
        selectedFields: Array.from(selectedFields),
        selectedCover: Boolean(selectedCoverUrl),
        coverUrl: selectedCoverUrl,
      });
      if (result.applied.length === 0 && !result.coverApplied) {
        toast.message("没有选择可导入的字段");
      } else {
        const fieldText = result.applied.length > 0 ? `已导入 ${result.applied.length} 个字段` : "";
        toast.success(
          result.applied.length > 0
            ? `${fieldText}${result.coverApplied ? "和封面" : ""}`
            : "已导入封面",
        );
      }
      if (result.skippedLocked.length > 0) {
        toast.message(`${result.skippedLocked.length} 个锁定字段已跳过`);
      }
      await stateQuery.refetch();
      onChanged();
      clearPreview();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setImporting(false);
    }
  };

  const handleLock = async (field: MetadataFieldState) => {
    try {
      await setMetadataFieldLock(workId, field.field, !field.locked);
      await stateQuery.refetch();
      toast.success(field.locked ? `${field.label}已解锁` : `${field.label}已锁定`);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleAdopt = async (claim: MetadataClaim) => {
    setAdoptingClaim(claim.id);
    try {
      const result = await adoptMetadataClaim(workId, claim.id);
      toast.success(
        result.applied.length > 0
          ? `已采用 ${claim.providerName} 的${claim.field === "cover" ? "封面" : "值"}`
          : "已采用该来源值",
      );
      if (result.skippedLocked.length > 0) {
        toast.message("字段已锁定，请先解锁");
      }
      await stateQuery.refetch();
      onChanged();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setAdoptingClaim(null);
    }
  };

  const providerOptions = providers ?? [];
  const previewCoverOptions = preview
    ? (preview.coverOptions ?? (preview.cover ? [preview.cover] : []))
    : [];
  const progressPercent = progress
    ? Math.round((progress.completed / Math.max(1, progress.total)) * 100)
    : 0;

  return (
    <div className="metadata-panel">
      <section className="metadata-local">
        <div className="detail-source-row">
          <span>本地安装</span>
          <p title={detail.exePath}>{detail.exePath}</p>
          <em>{formatRelativeDate(detail.addedAt)}</em>
          <Tag tone="status">可追溯</Tag>
        </div>
        {detail.coverPath ? (
          <div className="detail-source-row">
            <span>封面缓存</span>
            <p title={detail.coverPath}>{detail.coverPath}</p>
            <em>{detail.coverUpdatedAt ? formatRelativeDate(detail.coverUpdatedAt) : "—"}</em>
            <Tag tone="data">
              {detail.coverSource === "online"
                ? "在线下载"
                : detail.coverSource === "local"
                  ? "本地发现"
                  : "手动选择"}
            </Tag>
          </div>
        ) : null}
      </section>

      <div className="metadata-heading">
        <div>
          <p className="app-kicker">在线来源</p>
          <h2>搜索并导入元数据</h2>
          <p>先按优先级查询所有启用的来源；导入只填空白和未锁定字段，手动资料不会被静默覆盖。</p>
        </div>
        <Link to="/settings#source-settings">
          <Button variant="secondary" size="sm">
            来源优先级
          </Button>
        </Link>
      </div>

      <div className="metadata-searchbar">
        <Search size={15} strokeWidth={1.6} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleSearch();
            }
          }}
          placeholder="标题、别名，或 Steam AppID / 商店链接"
          aria-label="元数据搜索词"
        />
        <select
          value={providerFilter}
          onChange={(event) => setProviderFilter(event.target.value)}
          aria-label="搜索来源"
        >
          <option value="all">全部来源（按优先级）</option>
          {providerOptions.map((provider) => (
            <option key={provider.id} value={provider.id} disabled={!provider.enabled}>
              {provider.name}
              {provider.enabled ? "" : "（已停用）"}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleSearch()}
          disabled={searching || !query.trim()}
        >
          {searching ? <Loader2 size={14} className="metadata-spin" /> : <Search size={14} />}
          {searching ? "搜索中" : "搜索"}
        </Button>
        {searching ? (
          <Button variant="ghost" size="sm" onClick={() => void handleCancel()}>
            取消
          </Button>
        ) : null}
      </div>
      {providerFilter === "steam" ? (
        <p className="metadata-search-hint">
          Steam 可以直接输入 AppID（如
          324160）或粘贴商店链接；名称搜索会过滤原声带、画集等附加内容。
        </p>
      ) : null}

      {progress ? (
        <div className="metadata-progress" role="status">
          <div>
            <span>{progress.message}</span>
            <b>
              {progress.completed} / {progress.total}
            </b>
          </div>
          <div className="metadata-progress__track">
            <i style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}

      {searchError ? (
        <div className="metadata-notice metadata-notice--error">
          <AlertTriangle size={14} />
          <span>{searchError}</span>
          <Button variant="ghost" size="sm" onClick={() => void handleSearch()}>
            重试
          </Button>
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="metadata-notice metadata-notice--warning">
          <AlertTriangle size={14} />
          <span>{errors.map((error) => `${error.providerName}：${error.message}`).join("；")}</span>
        </div>
      ) : null}

      <div className="metadata-workbench">
        <section className="metadata-results" aria-live="polite">
          <header>
            <h3>候选</h3>
            <span>{results?.length ?? 0} 条</span>
          </header>
          {results === null ? (
            <div className="metadata-placeholder">
              <Globe2 size={18} strokeWidth={1.4} />
              <p>
                输入作品名开始搜索。VNDB 和 Bangumi 会按设置中的来源顺序出现；候选不会自动写入。
              </p>
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              title="没有找到候选"
              description="换一个中文、日文或英文标题，或者检查来源是否启用和网络是否可用。"
              className="metadata-empty"
            />
          ) : (
            <div className="metadata-candidate-list">
              {results.map((candidate) => (
                <button
                  type="button"
                  key={`${candidate.provider}:${candidate.sourceId}`}
                  className={cn(
                    "metadata-candidate",
                    selected?.provider === candidate.provider &&
                      selected.sourceId === candidate.sourceId &&
                      "is-selected",
                  )}
                  onClick={() => void handleSelect(candidate)}
                >
                  <RemoteCover url={candidate.coverUrl} title={candidate.title} />
                  <span className="metadata-candidate__body">
                    <span className="metadata-candidate__top">
                      <Tag tone="data">{providerName(providers, candidate.provider)}</Tag>
                      <span>#{candidate.sourceId}</span>
                      {candidate.score ? <b>{candidate.score.toFixed(1)}</b> : null}
                    </span>
                    <b className="metadata-candidate__title">{candidate.title}</b>
                    {candidate.originalTitle && candidate.originalTitle !== candidate.title ? (
                      <span className="metadata-candidate__original">
                        {candidate.originalTitle}
                      </span>
                    ) : null}
                    <span className="metadata-candidate__meta">
                      {candidate.year ?? "年份未知"}，{candidate.developer ?? "开发商未知"}
                    </span>
                    {candidate.summary ? <p>{candidate.summary}</p> : null}
                  </span>
                  <ChevronRight size={15} strokeWidth={1.5} />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="metadata-preview">
          <header>
            <div>
              <h3>导入预览</h3>
              <span>
                {selected
                  ? `${providerName(providers, selected.provider)} #${selected.sourceId}`
                  : "选择左侧候选"}
              </span>
            </div>
            {preview ? (
              <button
                type="button"
                className="metadata-preview__close"
                onClick={clearPreview}
                aria-label="关闭导入预览"
              >
                <X size={14} />
              </button>
            ) : null}
          </header>
          {previewing ? (
            <div className="metadata-placeholder metadata-placeholder--compact">
              <Loader2 size={18} className="metadata-spin" />
              <p>正在读取候选详情…</p>
            </div>
          ) : preview ? (
            <div className="metadata-preview__content">
              <div className="metadata-preview__summary">
                <RemoteCover url={preview.candidate.coverUrl} title={preview.candidate.title} />
                <div>
                  <b>{preview.candidate.title}</b>
                  {preview.candidate.originalTitle &&
                  preview.candidate.originalTitle !== preview.candidate.title ? (
                    <span>{preview.candidate.originalTitle}</span>
                  ) : null}
                  <span>
                    {preview.candidate.year ?? "年份未知"} ·{" "}
                    {preview.candidate.developer ?? "开发商未知"}
                  </span>
                </div>
              </div>
              {previewCoverOptions.length > 0 ? (
                <div className="metadata-cover-picker">
                  <div className="metadata-cover-picker__head">
                    <div>
                      <b>封面候选</b>
                      <span>
                        {previewCoverOptions[0]?.locked
                          ? "封面字段已锁定，导入时跳过"
                          : previewCoverOptions[0]?.currentSource
                            ? `已有${previewCoverOptions[0].currentSource === "online" ? "在线" : "本地"}封面，默认不替换`
                            : `共 ${previewCoverOptions.length} 张，选择要使用的图片`}
                      </span>
                    </div>
                    {selectedCoverUrl ? (
                      <Button variant="ghost" size="sm" onClick={() => setSelectedCoverUrl(null)}>
                        <X size={12} /> 不更换封面
                      </Button>
                    ) : null}
                  </div>
                  <div className="metadata-cover-grid">
                    {previewCoverOptions.map((cover) => {
                      const selected = selectedCoverUrl === cover.candidateUrl;
                      return (
                        <button
                          type="button"
                          key={cover.candidateUrl}
                          className={cn("metadata-cover-option", selected && "is-selected")}
                          aria-pressed={selected}
                          disabled={cover.locked}
                          onClick={() => setSelectedCoverUrl(selected ? null : cover.candidateUrl)}
                        >
                          <span className="metadata-cover-option__image">
                            <RemoteCover url={cover.candidateUrl} title={preview.candidate.title} />
                            {selected ? (
                              <i className="metadata-cover-option__check">
                                <Check size={12} />
                              </i>
                            ) : null}
                          </span>
                          <span className="metadata-cover-option__meta">
                            <b>{preview.providerName}</b>
                            <em>
                              {cover.kind === "header"
                                ? "横幅"
                                : cover.kind === "capsule"
                                  ? "胶囊"
                                  : "封面"}
                            </em>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="metadata-preview__fields">
                {preview.fields.map((field) => (
                  <PreviewRow
                    key={field.field}
                    field={field}
                    checked={selectedFields.has(field.field)}
                    onToggle={() => toggleField(field)}
                  />
                ))}
              </div>
              {preview.candidate.related.length > 0 ? (
                <div className="metadata-related">
                  <span>关联作品</span>
                  {preview.candidate.related.map((related) => (
                    <em key={`${related.sourceId}:${related.title}`}>
                      {related.relation}，{related.title}
                    </em>
                  ))}
                </div>
              ) : null}
              <footer className="metadata-preview__actions">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleImport()}
                  disabled={importing || (selectedFields.size === 0 && !selectedCoverUrl)}
                >
                  {importing ? <Loader2 size={14} className="metadata-spin" /> : null}
                  {importing ? "导入中" : `导入 ${selectedFields.size} 个字段`}
                </Button>
                <Button variant="ghost" size="sm" onClick={clearPreview} disabled={importing}>
                  取消
                </Button>
              </footer>
            </div>
          ) : (
            <div className="metadata-placeholder metadata-placeholder--compact">
              <ChevronRight size={18} strokeWidth={1.4} />
              <p>选择候选后在这里确认字段、封面和覆盖范围。</p>
            </div>
          )}
        </section>
      </div>

      <section className="metadata-ledger">
        <header>
          <div>
            <h3>字段来源</h3>
            <p>
              当前值、采用来源和抓取时间。锁定字段在后续导入中保持不变；手动编辑会自动留下锁定记录。
            </p>
          </div>
          <Link to="/settings#source-settings">
            <Button variant="ghost" size="sm">
              管理来源
            </Button>
          </Link>
        </header>
        {stateQuery.isPending ? (
          <div className="metadata-placeholder metadata-placeholder--compact">
            <Loader2 size={16} className="metadata-spin" />
            <p>正在读取字段来源…</p>
          </div>
        ) : stateQuery.isError ? (
          <div className="metadata-notice metadata-notice--error">
            <AlertTriangle size={14} />
            <span>{String(stateQuery.error)}</span>
            <Button variant="ghost" size="sm" onClick={() => void stateQuery.refetch()}>
              重试
            </Button>
          </div>
        ) : (
          <div className="metadata-ledger__table">
            <div className="metadata-ledger__head">
              <span>字段</span>
              <span>当前值</span>
              <span>采用来源</span>
              <span>更新时间</span>
              <span>保护</span>
            </div>
            {(stateQuery.data?.fields ?? []).map((field) => (
              <LedgerRow
                key={field.field}
                field={field}
                providers={providers}
                onLock={() => void handleLock(field)}
                onAdopt={(claim) => void handleAdopt(claim)}
                adoptingId={adoptingClaim}
                coverPreviewUrl={coverPreviewUrl}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
