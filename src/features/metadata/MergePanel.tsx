import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  ListChecks,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Hint } from "../../design-system/components/Hint";
import { Tag } from "../../design-system/components/Tag";
import { applyMetadataMerge, getMetadataMergePreview } from "../../lib/library-api";
import type {
  LibraryItemDetail,
  MergeCoverCandidate,
  MergeFieldCandidate,
  MergeFieldState,
  MergePreview,
  MetadataValue,
} from "../../lib/library-types";
import { cn } from "../../lib/cn";
import "./merge.css";

interface MergePanelProps {
  detail: LibraryItemDetail;
  onChanged: () => void;
  embedded?: boolean;
}

function valueText(value: MetadataValue, limit = 64): string {
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
  return text.length > limit ? text.slice(0, limit).trimEnd() + "…" : text;
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

function CoverTile({
  cover,
  selected,
  onSelect,
}: {
  cover: MergeCoverCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={cn(
        "merge-cover",
        `merge-cover--${coverKind(cover.kind)}`,
        selected && "is-selected",
      )}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="merge-cover__image">
        {failed ? (
          <ImageIcon size={18} strokeWidth={1.4} />
        ) : (
          <img
            src={cover.url}
            alt={`${cover.providerName} 封面`}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}
        {selected ? (
          <i className="merge-cover__check">
            <Check size={12} />
          </i>
        ) : null}
      </span>
      <span className="merge-cover__meta">
        <b>{cover.providerName}</b>
      </span>
    </button>
  );
}

function CandidateChip({
  candidate,
  selected,
  onToggle,
}: {
  candidate: MergeFieldCandidate;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={cn("merge-candidate", selected && "is-selected")}
      aria-pressed={selected}
      onClick={onToggle}
    >
      <span className="merge-candidate__source">{candidate.providerName}</span>
      <span className="merge-candidate__value">{valueText(candidate.value)}</span>
      {selected ? <Check size={12} /> : null}
    </button>
  );
}

function FieldRow({
  field,
  selected,
  onToggle,
}: {
  field: MergeFieldState;
  selected: MergeFieldCandidate | undefined;
  onToggle: (candidate: MergeFieldCandidate) => void;
}) {
  return (
    <div className="merge-field">
      <div className="merge-field__label">
        <b>{field.label}</b>
        <Hint label={valueText(field.current, 200)} side="bottom" align="start">
          <span>{valueText(field.current, 38)}</span>
        </Hint>
      </div>
      <div className="merge-field__candidates">
        {field.candidates.map((candidate) => (
          <CandidateChip
            key={`${candidate.provider}:${candidate.sourceId}`}
            candidate={candidate}
            selected={
              selected?.provider === candidate.provider && selected?.sourceId === candidate.sourceId
            }
            onToggle={() => onToggle(candidate)}
          />
        ))}
      </div>
      <div className="merge-field__state">
        {field.conflict ? <Tag tone="accent">冲突</Tag> : <Tag tone="neutral">一致</Tag>}
      </div>
    </div>
  );
}

export function MergePanel({ detail, onChanged, embedded = false }: MergePanelProps) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, MergeFieldCandidate>>(new Map());
  const [cover, setCover] = useState<MergeCoverCandidate | null>(null);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getMetadataMergePreview(detail.workId);
      setPreview(next);
      const defaults = new Map<string, MergeFieldCandidate>();
      for (const field of next.fields) {
        if (field.defaultSelected && field.candidates[0]) {
          defaults.set(field.field, field.candidates[0]);
        }
      }
      setSelected(defaults);
      setCover(next.covers.find((item) => item.defaultSelected) ?? null);
    } catch (nextError) {
      setError(String(nextError));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleField = (field: MergeFieldState, candidate: MergeFieldCandidate) => {
    setSelected((current) => {
      const next = new Map(current);
      const active = next.get(field.field);
      if (active?.provider === candidate.provider && active.sourceId === candidate.sourceId) {
        next.delete(field.field);
      } else {
        next.set(field.field, candidate);
      }
      return next;
    });
  };

  const apply = async () => {
    if (!preview) {
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const result = await applyMetadataMerge({
        workId: detail.workId,
        selections: [...selected.entries()].map(([field, candidate]) => ({
          field,
          provider: candidate.provider,
          sourceId: candidate.sourceId,
        })),
        cover: cover
          ? {
              field: "cover",
              provider: cover.provider,
              sourceId: cover.sourceId,
              url: cover.url,
            }
          : null,
        sourceLinks: preview.matched.map((matched) => ({
          provider: matched.provider,
          sourceId: matched.sourceId,
          title: matched.title,
        })),
      });
      const pieces = [];
      if (result.applied.length > 0) pieces.push(`${result.applied.length} 个字段`);
      if (result.coverApplied) pieces.push("封面");
      if (pieces.length === 0 && preview.matched.length > 0) {
        pieces.push(`${preview.matched.length} 个来源编号`);
      }
      toast.success(pieces.length > 0 ? `已应用 ${pieces.join("、")}` : "没有可应用的变更");
      if (result.errors.length > 0) {
        toast.error(result.errors.join("；"));
      }
      await queryClient.invalidateQueries({ queryKey: ["metadata-work-state"] });
      onChanged();
      setPreview(null);
      setSelected(new Map());
      setCover(null);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setApplying(false);
    }
  };

  const coverGroups = preview
    ? [
        {
          id: "cover" as const,
          label: "封面",
          items: preview.covers.filter((item) => coverKind(item.kind) === "cover"),
        },
        {
          id: "capsule" as const,
          label: "胶囊",
          items: preview.covers.filter((item) => coverKind(item.kind) === "capsule"),
        },
        {
          id: "header" as const,
          label: "横幅",
          items: preview.covers.filter((item) => coverKind(item.kind) === "header"),
        },
      ].filter((group) => group.items.length > 0)
    : [];

  return (
    <section className={cn("merge-panel", embedded && "is-embedded")}>
      {!embedded ? (
        <header className="merge-panel__head">
          <div>
            <h2>一次比较所有来源</h2>
            <p>按字段优先级自动匹配每个来源的候选，冲突会并列显示。应用前可以改选或跳过。</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadPreview()}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="merge-spin" /> : <ListChecks size={14} />}
            {loading ? "匹配中" : preview ? "重新匹配" : "开始多源匹配"}
          </Button>
        </header>
      ) : null}

      {error ? (
        <div className="merge-notice merge-notice--error">
          <AlertTriangle size={14} />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void loadPreview()}>
            <RefreshCw size={12} /> 重试
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="merge-loading">
          <Loader2 size={18} className="merge-spin" />
          <span>正在按标题匹配并读取各来源详情…</span>
        </div>
      ) : preview ? (
        <div className="merge-content">
          <div className="merge-sources">
            <span className="merge-sources__label">匹配来源</span>
            <div className="merge-sources__grid">
              {preview.matched.map((match) => (
                <Hint
                  key={`${match.provider}:${match.sourceId}`}
                  label={`${match.title} · #${match.sourceId}`}
                  side="bottom"
                  align="start"
                >
                  <span className="merge-source">
                    <b>{match.providerName}</b>
                    <span>{match.title}</span>
                    <Tag tone={match.score >= 0.8 ? "status" : "accent"}>
                      {Math.round(match.score * 100)}%
                    </Tag>
                  </span>
                </Hint>
              ))}
              {preview.matched.length === 0 ? (
                <span className="merge-sources__none">没有匹配到候选</span>
              ) : null}
            </div>
            {embedded ? (
              <Button
                variant="ghost"
                size="sm"
                className="merge-sources__action"
                onClick={() => void loadPreview()}
                disabled={loading}
              >
                {loading ? <Loader2 size={12} className="merge-spin" /> : <RefreshCw size={12} />}
                {loading ? "匹配中" : "重新匹配"}
              </Button>
            ) : null}
          </div>
          {preview.errors.length > 0 ? (
            <div className="merge-notice merge-notice--warning">
              <AlertTriangle size={14} />
              <span>
                {preview.errors.map((item) => `${item.providerName}：${item.message}`).join("；")}
              </span>
            </div>
          ) : null}
          {preview.fields.length === 0 && preview.covers.length === 0 ? (
            <EmptyState
              title="没有可比较的字段"
              description="换一个更接近原标题的查询，或在下方手动搜索具体候选。"
              className="merge-empty"
            />
          ) : (
            <>
              <div className="merge-fields">
                <div className="merge-fields__head">
                  <span>字段 / 当前值</span>
                  <span>候选值，点击选择</span>
                  <span>状态</span>
                </div>
                {preview.fields.map((field) => (
                  <FieldRow
                    key={field.field}
                    field={field}
                    selected={selected.get(field.field)}
                    onToggle={(candidate) => toggleField(field, candidate)}
                  />
                ))}
              </div>

              {preview.covers.length > 0 ? (
                <div className="merge-covers">
                  <div className="merge-covers__head">
                    <div>
                      <h3>图片候选</h3>
                      <p>按图片类型分组；已有手动封面时默认不勾选。</p>
                    </div>
                    {cover ? (
                      <Button variant="ghost" size="sm" onClick={() => setCover(null)}>
                        <X size={12} /> 不更换封面
                      </Button>
                    ) : null}
                  </div>
                  <div className="merge-cover-groups">
                    {coverGroups.map((group) => (
                      <section className={`merge-cover-group is-${group.id}`} key={group.id}>
                        <header>
                          <h4>{group.label}</h4>
                          <span>{group.items.length}</span>
                        </header>
                        <div className="merge-cover-grid">
                          {group.items.map((candidate) => (
                            <CoverTile
                              key={`${candidate.provider}:${candidate.sourceId}:${candidate.url}`}
                              cover={candidate}
                              selected={cover?.url === candidate.url}
                              onSelect={() =>
                                setCover(cover?.url === candidate.url ? null : candidate)
                              }
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              ) : null}

              <footer className="merge-actions">
                <span>
                  已选 {selected.size} 个字段{cover ? "，1 张封面" : ""}
                  ；应用时同步匹配来源编号并再次检查锁定状态。
                </span>
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={applying || (selected.size === 0 && !cover)}
                    onClick={() => {
                      setSelected(new Map());
                      setCover(null);
                    }}
                  >
                    清空选择
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={
                      applying || (selected.size === 0 && !cover && preview.matched.length === 0)
                    }
                    onClick={() => void apply()}
                  >
                    {applying ? <Loader2 size={14} className="merge-spin" /> : <Check size={14} />}
                    {applying
                      ? "应用中"
                      : selected.size === 0 && !cover
                        ? "同步来源编号"
                        : `应用 ${selected.size} 个字段${cover ? " + 封面" : ""}`}
                  </Button>
                </div>
              </footer>
            </>
          )}
        </div>
      ) : (
        <div className="merge-placeholder">
          <ListChecks size={20} strokeWidth={1.3} />
          <div>
            <b>匹配结果会出现在这里</b>
            <p>按标题查找已启用的来源，应用前逐项确认；不会自动写入。</p>
          </div>
          {embedded ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void loadPreview()}
              disabled={loading}
            >
              {loading ? <Loader2 size={13} className="merge-spin" /> : <ListChecks size={13} />}
              {loading ? "匹配中" : "开始多源匹配"}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
