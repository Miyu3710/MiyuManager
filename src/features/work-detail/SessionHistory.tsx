import { Check, Clock3, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import { createSession, deleteSession, updateSession } from "../../lib/library-api";
import type { PlaySessionWithWork } from "../../lib/library-types";
import { formatPlaytimeSeconds } from "../../lib/format";
import { useWorkSessions } from "../library/useLibrary";

interface SessionHistoryProps {
  workId: number;
  onChanged: () => void;
}

interface SessionForm {
  startedAt: string;
  endedAt: string;
  note: string;
}

function toLocalInput(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultForm(): SessionForm {
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - 60 * 60_000);
  return {
    startedAt: toLocalInput(startedAt.toISOString()),
    endedAt: toLocalInput(endedAt.toISOString()),
    note: "",
  };
}

function reasonLabel(reason: string | null): string {
  switch (reason) {
    case "exited":
      return "正常退出";
    case "manual_stop":
      return "手动停止";
    case "recovered":
      return "异常恢复";
    case "app_closed":
      return "管理器关闭";
    case "manual":
      return "手动补录";
    default:
      return "未记录";
  }
}

function statusLabel(session: PlaySessionWithWork): string {
  if (session.status === "paused") {
    return "后台暂停";
  }
  if (session.status === "running") {
    return "计时中";
  }
  return reasonLabel(session.endReason);
}

export function SessionHistory({ workId, onChanged }: SessionHistoryProps) {
  const sessions = useWorkSessions(workId);
  const [editor, setEditor] = useState<"new" | number | null>(null);
  const [form, setForm] = useState<SessionForm>(defaultForm);
  const [busy, setBusy] = useState(false);
  const [confirmSession, setConfirmSession] = useState<PlaySessionWithWork | null>(null);

  const beginCreate = () => {
    setEditor("new");
    setForm(defaultForm());
  };

  const beginEdit = (session: PlaySessionWithWork) => {
    setEditor(session.id);
    setForm({
      startedAt: toLocalInput(session.startedAt),
      endedAt: toLocalInput(session.endedAt ?? session.lastHeartbeatAt),
      note: session.note,
    });
  };

  const submit = async () => {
    const startedAt = new Date(form.startedAt);
    const endedAt = new Date(form.endedAt);
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
      toast.error("请填写有效的开始和结束时间");
      return;
    }
    if (endedAt <= startedAt) {
      toast.error("结束时间必须晚于开始时间");
      return;
    }
    setBusy(true);
    try {
      if (editor === "new") {
        await createSession({
          workId,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          note: form.note,
        });
        toast.success("会话已补录");
      } else if (typeof editor === "number") {
        await updateSession(editor, {
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          note: form.note,
        });
        toast.success("会话已修正");
      }
      setEditor(null);
      await sessions.refetch();
      onChanged();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = (session: PlaySessionWithWork) => {
    setConfirmSession(session);
  };

  const confirmRemove = async () => {
    const session = confirmSession;
    if (!session) {
      return;
    }
    setBusy(true);
    try {
      await deleteSession(session.id);
      if (editor === session.id) {
        setEditor(null);
      }
      await sessions.refetch();
      onChanged();
      setConfirmSession(null);
      toast.success("游玩记录已删除");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="session-history">
      <header>
        <div>
          <h2>游玩记录</h2>
          <p>自动记录启动器产生的会话；异常中断的时长会在下次启动时截断到最后心跳。</p>
        </div>
        <Button variant="secondary" size="sm" onClick={beginCreate} disabled={busy}>
          <Plus size={13} strokeWidth={1.7} /> 补录会话
        </Button>
      </header>

      {editor ? (
        <form
          className="session-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="session-editor__fields">
            <label>
              <span>开始时间</span>
              <input
                type="datetime-local"
                value={form.startedAt}
                onChange={(event) =>
                  setForm((value) => ({ ...value, startedAt: event.target.value }))
                }
                disabled={busy}
                required
              />
            </label>
            <label>
              <span>结束时间</span>
              <input
                type="datetime-local"
                value={form.endedAt}
                onChange={(event) =>
                  setForm((value) => ({ ...value, endedAt: event.target.value }))
                }
                disabled={busy}
                required
              />
            </label>
            <label className="session-editor__note">
              <span>备注</span>
              <input
                value={form.note}
                maxLength={2000}
                placeholder="可选，例如：补记二周目"
                onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))}
                disabled={busy}
              />
            </label>
          </div>
          <div className="session-editor__actions">
            <Button type="submit" size="sm" disabled={busy}>
              <Check size={13} strokeWidth={1.8} />
              {editor === "new" ? "保存补录" : "保存修正"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditor(null)}
              disabled={busy}
            >
              <X size={13} strokeWidth={1.8} /> 取消
            </Button>
          </div>
        </form>
      ) : null}

      <div className="detail-session-table">
        <div className="detail-session-table__head detail-session-table__head--c6">
          <span>开始时间</span>
          <span>结束 / 状态</span>
          <span>时长</span>
          <span>备注</span>
          <span>操作</span>
        </div>
        {sessions.isPending ? (
          <p className="detail-empty-row">正在读取游玩记录…</p>
        ) : sessions.isError ? (
          <p className="detail-empty-row">无法读取游玩记录：{String(sessions.error)}</p>
        ) : sessions.data.length === 0 ? (
          <p className="detail-empty-row">
            还没有会话。启动游戏后这里会自动出现记录，也可以手动补录。
          </p>
        ) : (
          sessions.data.map((session) => (
            <div
              className="detail-session-table__row detail-session-table__row--c6"
              key={session.id}
            >
              <span>
                {new Date(session.startedAt).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span
                className={session.status !== "ended" ? "session-state session-state--live" : ""}
              >
                {session.status === "ended" ? (
                  <>
                    {statusLabel(session)}
                    {session.corrected ? <i>已修正</i> : null}
                    {session.source === "manual" ? <i>手动</i> : null}
                  </>
                ) : (
                  <>
                    <Clock3 size={11} strokeWidth={1.8} /> {statusLabel(session)}
                  </>
                )}
              </span>
              <b>{formatPlaytimeSeconds(session.durationSec)}</b>
              <span className="session-note">{session.note || "—"}</span>
              <span className="session-actions">
                <button
                  type="button"
                  aria-label="编辑会话"
                  title="编辑时间与备注"
                  disabled={busy || session.status !== "ended"}
                  onClick={() => beginEdit(session)}
                >
                  <Pencil size={12} strokeWidth={1.7} />
                </button>
                <button
                  type="button"
                  aria-label="删除会话"
                  title="删除记录"
                  disabled={busy || session.status !== "ended"}
                  onClick={() => void remove(session)}
                >
                  <Trash2 size={12} strokeWidth={1.7} />
                </button>
              </span>
            </div>
          ))
        )}
      </div>
      <ConfirmDialog
        open={confirmSession !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmSession(null);
          }
        }}
        title="删除这条游玩记录？"
        description="累计时长会重新计算，游戏文件不会受影响。"
        confirmLabel="删除记录"
        busy={busy}
        onConfirm={() => void confirmRemove()}
      />
    </div>
  );
}
