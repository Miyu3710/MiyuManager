import { Check, Clock3, History, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import { Hint } from "../../design-system/components/Hint";
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

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function weekdayLabel(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", { weekday: "short" });
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
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

  const totalSeconds =
    sessions.data?.reduce((total, session) => total + session.durationSec, 0) ?? 0;

  return (
    <div className="session-history">
      <header className="session-history__head">
        <div className="session-history__title">
          <h2>游玩记录</h2>
          {sessions.data && sessions.data.length > 0 ? (
            <p>
              共 {sessions.data.length} 次 · {formatPlaytimeSeconds(totalSeconds)}
            </p>
          ) : null}
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

      {sessions.isPending ? (
        <div className="session-log session-log--empty">
          <p>正在读取游玩记录…</p>
        </div>
      ) : sessions.isError ? (
        <div className="session-log session-log--empty">
          <p>无法读取游玩记录：{String(sessions.error)}</p>
        </div>
      ) : sessions.data.length === 0 ? (
        <div className="session-log session-log--empty">
          <History size={18} strokeWidth={1.6} aria-hidden="true" />
          <p>启动游戏后会自动记录。</p>
        </div>
      ) : (
        <ol className="session-log" aria-label="会话记录">
          {sessions.data.map((session) => (
            <li className="session-entry" key={session.id}>
              <time className="session-entry__date" dateTime={session.startedAt}>
                <b>{dateLabel(session.startedAt)}</b>
                <span>{weekdayLabel(session.startedAt)}</span>
              </time>
              <div className="session-entry__content">
                <div className="session-entry__headline">
                  <span className="session-entry__range">
                    <time dateTime={session.startedAt}>{timeLabel(session.startedAt)}</time>
                    {session.endedAt ? (
                      <>
                        <span aria-hidden="true">–</span>
                        <time dateTime={session.endedAt}>{timeLabel(session.endedAt)}</time>
                      </>
                    ) : null}
                  </span>
                  <strong>{formatPlaytimeSeconds(session.durationSec)}</strong>
                </div>
                <div className="session-entry__meta">
                  <span
                    className={
                      session.status !== "ended"
                        ? "session-entry__state is-live"
                        : "session-entry__state"
                    }
                  >
                    {session.status !== "ended" ? (
                      <Clock3 size={11} strokeWidth={1.8} aria-hidden="true" />
                    ) : null}
                    {statusLabel(session)}
                  </span>
                  {session.corrected ? <span className="session-entry__badge">已修正</span> : null}
                </div>
                {session.note ? <p className="session-entry__note">{session.note}</p> : null}
              </div>
              <div className="session-entry__actions">
                <Hint label="编辑时间与备注" side="top">
                  <button
                    type="button"
                    aria-label="编辑会话"
                    disabled={busy || session.status !== "ended"}
                    onClick={() => beginEdit(session)}
                  >
                    <Pencil size={13} strokeWidth={1.7} />
                  </button>
                </Hint>
                <Hint label="删除记录" side="top">
                  <button
                    type="button"
                    aria-label="删除会话"
                    disabled={busy || session.status !== "ended"}
                    onClick={() => void remove(session)}
                  >
                    <Trash2 size={13} strokeWidth={1.7} />
                  </button>
                </Hint>
              </div>
            </li>
          ))}
        </ol>
      )}
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
