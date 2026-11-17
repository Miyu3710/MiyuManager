import { Loader2, Pencil, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { syncBangumiComment } from "../../lib/bangumi-api";
import { updateWork } from "../../lib/library-api";
import type { LibraryItemDetail, WorkUpdateInput } from "../../lib/library-types";

interface UserReviewCardProps {
  detail: LibraryItemDetail;
  bangumiLinked: boolean;
  bangumiConnected: boolean;
  bangumiSubjectId: string | null;
  onSaved: () => void;
}

function workInput(detail: LibraryItemDetail, notes: string): WorkUpdateInput {
  return {
    title: detail.title,
    originalTitle: detail.originalTitle,
    aliases: detail.aliases,
    description: detail.description,
    year: detail.year,
    developer: detail.developer,
    publisher: detail.publisher,
    edition: detail.edition,
    language: detail.language,
    releaseDate: detail.releaseDate,
    tags: detail.tags,
    notes,
    rating: detail.rating,
    status: detail.status,
    favorite: detail.favorite,
  };
}

export function UserReviewCard({
  detail,
  bangumiLinked,
  bangumiConnected,
  bangumiSubjectId,
  onSaved,
}: UserReviewCardProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(detail.notes);
  const [saving, setSaving] = useState(false);
  const [syncToBangumi, setSyncToBangumi] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bangumiLength = Array.from(draft.trim()).length;
  const bangumiLengthValid = bangumiLength <= 380;

  useEffect(() => {
    if (!editing) {
      return;
    }
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [editing]);

  const startEditing = () => {
    setDraft(detail.notes);
    setSyncToBangumi(false);
    setEditing(true);
  };

  const cancel = () => {
    if (saving) {
      return;
    }
    setDraft(detail.notes);
    setSyncToBangumi(false);
    setEditing(false);
  };

  const save = async () => {
    if (saving) {
      return;
    }
    const notes = draft.trim();
    setSaving(true);
    try {
      await updateWork(detail.workId, workInput(detail, notes));
      onSaved();
      setEditing(false);
      toast.success("评价已保存");
      if (syncToBangumi && notes && bangumiLinked && bangumiLengthValid) {
        try {
          const outcome = await syncBangumiComment(detail.workId);
          if (outcome.status === "synced") {
            toast.success(outcome.message);
            if (bangumiSubjectId) {
              void queryClient.invalidateQueries({
                queryKey: ["bangumi-comments", bangumiSubjectId],
              });
            }
          } else {
            toast(outcome.message);
          }
        } catch (error) {
          toast.error("评价已保存在本地，但同步 Bangumi 失败：" + String(error));
        }
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="detail-review-card" aria-labelledby="detail-review-title">
      <header className="detail-review-head">
        <h2 id="detail-review-title">用户评价</h2>
        <span className="detail-review-source">本地</span>
      </header>

      {editing ? (
        <div className="user-review-editor">
          <textarea
            ref={textareaRef}
            className="user-review-editor__input"
            aria-label="评价内容"
            value={draft}
            maxLength={4000}
            rows={5}
            disabled={saving}
            placeholder="写下这部作品的评价，或记录想在下周目注意的地方。"
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                void save();
              }
            }}
          />
          <div className="user-review-editor__meta">
            <span>{draft.length} / 4000</span>
            {bangumiLinked ? (
              bangumiConnected ? (
                <label className="user-review-editor__sync">
                  <input
                    type="checkbox"
                    checked={syncToBangumi}
                    disabled={saving || bangumiLength === 0 || !bangumiLengthValid}
                    onChange={(event) => setSyncToBangumi(event.currentTarget.checked)}
                  />
                  <span>同步到 Bangumi 吐槽</span>
                </label>
              ) : (
                <span className="user-review-editor__sync-note">连接 Bangumi 后可同步评价</span>
              )
            ) : null}
          </div>
          {bangumiLinked && bangumiConnected && !bangumiLengthValid ? (
            <p className="user-review-editor__warning">
              Bangumi 吐槽最多 380 个字符；当前内容只保存在本地。
            </p>
          ) : null}
          <div className="user-review-editor__actions">
            <Button variant="ghost" size="sm" disabled={saving} onClick={cancel}>
              取消
            </Button>
            <Button variant="primary" size="sm" disabled={saving} onClick={() => void save()}>
              {saving ? (
                <Loader2 size={13} className="detail-spin" />
              ) : (
                <Send size={13} strokeWidth={1.7} />
              )}
              {saving ? "正在保存…" : "保存评价"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {detail.notes ? (
            <p className="detail-review-copy">{detail.notes}</p>
          ) : (
            <p className="detail-review-empty">还没有写下评价。</p>
          )}
          <Button variant="ghost" size="sm" onClick={startEditing}>
            <Pencil size={13} strokeWidth={1.6} />
            {detail.notes ? "编辑评价" : "写评价"}
          </Button>
        </>
      )}
    </section>
  );
}
