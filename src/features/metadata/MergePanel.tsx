import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Image as ImageIcon,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { EmptyState } from "../../design-system/components/EmptyState";
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
      className={cn("merge-cover", selected && "is-selected")}
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
        <em>{cover.kind === "header" ? "横幅" : cover.kind === "capsule" ? "胶囊" : "封面"}</em>
      </span>
    </button>
  );
}

function CandidateChip({
  candidate,
  selected,
  disabled,
  onToggle,
}: {
  candidate: MergeFieldCandidate;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={cn("merge-candidate", selected && "is-selected")}
      disabled={disabled}
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
    <div className={cn("merge-field", field.locked && "is-locked")}>
      <div className="merge-field__label">
        <b>{field.label}</b>
        <span title={valueText(field.current, 200)}>{valueText(field.current, 38)}</span>
      </div>
      <div className="merge-field__candidates">
        {field.candidates.map((candidate) => (
          <CandidateChip
            key={`${candidate.provider}:${candidate.sourceId}`}
            candidate={candidate}
            selected={
              selected?.provider === candidate.provider && selected?.sourceId === candidate.sourceId
            }
            disabled={field.locked}
            onToggle={() => onToggle(candidate)}
          />
        ))}
      </div>
      <div className="merge-field__state">
        {field.locked ? (
          <Tag tone="muted">
            <Lock size={10} /> 已锁定
          </Tag>
        ) : field.conflict ? (
          <Tag tone="accent">冲突</Tag>
        ) : (
          <Tag tone="neutral">一致</Tag>
        )}
      </div>
    </div>
  );
}

export function MergePanel({ detail, onChanged }: MergePanelProps) {
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
        if (field.defaultSelected && !field.locked && field.candidates[0]) {
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
    if (field.locked) {
      return;
    }
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
      });
      const pieces = [];
      if (result.applied.length > 0) pieces.push(`${result.applied.length} 个字段`);
      if (result.coverApplied) pieces.push("封面");
      if (result.skippedLocked.length > 0)
        pieces.push(`跳过 ${result.skippedLocked.length} 个锁定项`);
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

  return (
    <section className="merge-panel">
      <header className="merge-panel__head">
        <div>
          <p className="app-kicker">MERGE / 多源合并</p>
          <h2>一次比较所有来源</h2>
          <p>
            按字段优先级自动匹配每个来源的候选，冲突会并列显示。应用前可以改选或跳过；锁定字段不会被覆盖。
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void loadPreview()} disabled={loading}>
          {loading ? <Loader2 size={14} className="merge-spin" /> : <Sparkles size={14} />}
          {loading ? "匹配中" : preview ? "重新匹配" : "开始多源匹配"}
        </Button>
      </header>

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
            {preview.matched.map((match) => (
              <span className="merge-source" key={`${match.provider}:${match.sourceId}`}>
                <b>{match.providerName}</b>
                <span>{match.title}</span>
                <em>{match.sourceId}</em>
                <Tag tone={match.score >= 0.8 ? "status" : "accent"}>
                  {Math.round(match.score * 100)}%
                </Tag>
              </span>
            ))}
            {preview.matched.length === 0 ? (
              <span className="merge-sources__none">没有匹配到候选</span>
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
                  <span>候选值 · 点击选择</span>
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
                      <h3>封面候选</h3>
                      <p>选择一张封面；已有手动封面时默认不勾选。</p>
                    </div>
                    {cover ? (
                      <Button variant="ghost" size="sm" onClick={() => setCover(null)}>
                        <X size={12} /> 不更换封面
                      </Button>
                    ) : null}
                  </div>
                  <div className="merge-cover-grid">
                    {preview.covers.map((candidate) => (
                      <CoverTile
                        key={`${candidate.provider}:${candidate.sourceId}:${candidate.url}`}
                        cover={candidate}
                        selected={cover?.url === candidate.url}
                        onSelect={() => setCover(cover?.url === candidate.url ? null : candidate)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <footer className="merge-actions">
                <span>
                  已选 {selected.size} 个字段{cover ? " · 1 张封面" : ""}；应用时再次检查锁定状态。
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
                    disabled={applying || (selected.size === 0 && !cover)}
                    onClick={() => void apply()}
                  >
                    {applying ? <Loader2 size={14} className="merge-spin" /> : <Check size={14} />}
                    {applying ? "应用中" : `应用 ${selected.size} 个字段${cover ? " + 封面" : ""}`}
                  </Button>
                </div>
              </footer>
            </>
          )}
        </div>
      ) : (
        <div className="merge-placeholder">
          <Sparkles size={20} strokeWidth={1.3} />
          <div>
            <b>把 VNDB、Bangumi、Steam 和后续来源放在同一张工作台上</b>
            <p>
              点击“开始多源匹配”后，系统会按标题为每个来源找最可能的候选，并列出字段差异。不会自动写入任何值。
            </p>
          </div>
          <ArrowRight size={18} strokeWidth={1.3} />
        </div>
      )}
    </section>
  );
}
