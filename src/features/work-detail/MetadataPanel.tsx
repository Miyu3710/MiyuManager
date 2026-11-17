import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Search,
  Globe2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Hint } from "../../design-system/components/Hint";
import { Tag } from "../../design-system/components/Tag";
import {
  cancelMetadataSearch,
  getMetadataPreview,
  getMetadataWorkState,
  importMetadata,
  listMetadataProviders,
  searchMetadataPreview,
  startMetadataSearch,
} from "../../lib/library-api";
import type {
  LibraryItemDetail,
  MetadataPreview,
  MetadataProvider,
  MetadataProviderFailure,
  MetadataSearchCandidate,
  MetadataSearchComplete,
  MetadataSearchProgress,
  MetadataValue,
  PreviewCover,
  PreviewField,
} from "../../lib/library-types";
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

function coverKind(kind: string): "cover" | "capsule" | "header" {
  if (kind === "header") {
    return "header";
  }
  if (kind === "capsule") {
    return "capsule";
  }
  return "cover";
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
    <label className="metadata-preview-row">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="metadata-preview-row__label">{field.label}</span>
      <span className="metadata-preview-row__values">
        <span>{valueText(field.current, 48)}</span>
        <ArrowRight size={12} strokeWidth={1.5} />
        <b>{valueText(field.candidate, 64)}</b>
      </span>
      {field.existing.length > 0 ? (
        <span className="metadata-existing">{field.existing.length} 个来源值</span>
      ) : null}
    </label>
  );
}

function CoverOption({
  cover,
  title,
  providerName,
  selected,
  onSelect,
}: {
  cover: PreviewCover;
  title: string;
  providerName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Hint label={providerName + " · " + cover.kind} side="top" align="center">
      <button
        type="button"
        className={cn(
          "metadata-cover-option",
          `is-${coverKind(cover.kind)}`,
          selected && "is-selected",
        )}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="metadata-cover-option__image">
          <RemoteCover url={cover.candidateUrl} title={title} />
          {selected ? (
            <i className="metadata-cover-option__check">
              <Check size={12} />
            </i>
          ) : null}
        </span>
      </button>
    </Hint>
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
  const activeJob = useRef<string | null>(null);

  const providers = stateQuery.data?.providers ?? providersQuery.data;

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
      await stateQuery.refetch();
      onChanged();
      clearPreview();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setImporting(false);
    }
  };

  const providerOptions = providers ?? [];
  const currentProviderLabel =
    providerFilter === "all"
      ? "全部来源（按优先级）"
      : (providerOptions.find((provider) => provider.id === providerFilter)?.name ??
        providerFilter);
  const previewCoverOptions = preview
    ? (preview.coverOptions ?? (preview.cover ? [preview.cover] : []))
    : [];
  const previewCoverGroups = [
    {
      id: "cover" as const,
      label: "封面",
      items: previewCoverOptions.filter((cover) => coverKind(cover.kind) === "cover"),
    },
    {
      id: "capsule" as const,
      label: "胶囊",
      items: previewCoverOptions.filter((cover) => coverKind(cover.kind) === "capsule"),
    },
    {
      id: "header" as const,
      label: "横幅",
      items: previewCoverOptions.filter((cover) => coverKind(cover.kind) === "header"),
    },
  ].filter((group) => group.items.length > 0);
  const progressPercent = progress
    ? Math.round((progress.completed / Math.max(1, progress.total)) * 100)
    : 0;
  const showWorkbench = results !== null || previewing || Boolean(preview);

  return (
    <div className="metadata-panel">
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
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="metadata-source-trigger"
              aria-label={"搜索来源：" + currentProviderLabel}
            >
              <span>{currentProviderLabel}</span>
              <ChevronDown
                className="metadata-source-trigger__chevron"
                size={13}
                strokeWidth={1.7}
              />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="metadata-source-menu"
              align="end"
              sideOffset={8}
              collisionPadding={12}
            >
              <p className="metadata-source-menu__head">来源</p>
              <DropdownMenu.RadioGroup value={providerFilter} onValueChange={setProviderFilter}>
                <DropdownMenu.RadioItem value="all" className="metadata-source-menu__item">
                  <span>全部来源（按优先级）</span>
                  <DropdownMenu.ItemIndicator className="metadata-source-menu__check">
                    <Check size={13} strokeWidth={2} />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
                {providerOptions.map((provider) => (
                  <DropdownMenu.RadioItem
                    key={provider.id}
                    value={provider.id}
                    disabled={!provider.enabled}
                    className="metadata-source-menu__item"
                  >
                    <span>
                      {provider.name}
                      {provider.enabled ? "" : "（已停用）"}
                    </span>
                    <DropdownMenu.ItemIndicator className="metadata-source-menu__check">
                      <Check size={13} strokeWidth={2} />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
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

      {showWorkbench ? (
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
                        <b>图片候选</b>
                        <span>
                          {previewCoverOptions[0]?.currentSource
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
                    <div className="metadata-cover-groups">
                      {previewCoverGroups.map((group) => (
                        <section className={`metadata-cover-group is-${group.id}`} key={group.id}>
                          <header>
                            <b>{group.label}</b>
                            <span>{group.items.length}</span>
                          </header>
                          <div className="metadata-cover-grid">
                            {group.items.map((cover) => (
                              <CoverOption
                                key={cover.candidateUrl}
                                cover={cover}
                                title={preview.candidate.title}
                                providerName={preview.providerName}
                                selected={selectedCoverUrl === cover.candidateUrl}
                                onSelect={() =>
                                  setSelectedCoverUrl(
                                    selectedCoverUrl === cover.candidateUrl
                                      ? null
                                      : cover.candidateUrl,
                                  )
                                }
                              />
                            ))}
                          </div>
                        </section>
                      ))}
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
      ) : (
        <div className="metadata-idle">
          <Globe2 size={20} strokeWidth={1.4} />
          <div>
            <b>从来源补齐资料</b>
            <p>搜索标题、别名或 Steam AppID；候选不会自动写入。</p>
          </div>
        </div>
      )}
    </div>
  );
}
