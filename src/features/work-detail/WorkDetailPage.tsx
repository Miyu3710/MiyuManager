import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  FolderOpen,
  HardDrive,
  ImagePlus,
  Images,
  Loader2,
  Monitor,
  Pencil,
  Play,
  StopCircle,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { CoverArt } from "../../design-system/components/CoverArt";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Tag } from "../../design-system/components/Tag";
import { statusLabels } from "../../lib/game-data";
import {
  assetUrl,
  clearWorkCover,
  discoverWorkCovers,
  getLaunchState,
  libraryItemToGame,
  pickImageFile,
  setWorkCover,
  startWork,
  stopWork,
  validateWork,
} from "../../lib/library-api";
import type { CoverCandidate, LaunchSnapshot, ValidationReport } from "../../lib/library-types";
import { formatDate, formatPlaytime, formatRelativeDate } from "../../lib/format";
import { cn } from "../../lib/cn";
import { useInvalidateLibrary, useLibraryDetail, useMonitors } from "../library/useLibrary";
import { LaunchConfigPanel } from "./LaunchConfigPanel";
import { MetadataPanel } from "./MetadataPanel";
import { WorkEditDialog } from "./WorkEditDialog";
import "./work-detail.css";

type Tab = "overview" | "sessions" | "launch" | "sources";

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "概览" },
  { id: "sessions", label: "游玩记录" },
  { id: "launch", label: "启动配置" },
  { id: "sources", label: "来源与字段" },
];

function tabFrom(value: string | null): Tab {
  return tabs.some((tab) => tab.id === value) ? (value as Tab) : "overview";
}

function launchLabel(snapshot: LaunchSnapshot | null): string {
  if (!snapshot) {
    return "尚未运行";
  }
  if (snapshot.state === "running") {
    return "运行中 · PID " + snapshot.pid;
  }
  if (snapshot.exitCode === null) {
    return "已退出";
  }
  return "已退出 · 退出码 " + snapshot.exitCode;
}

export function WorkDetailPage() {
  const { id } = useParams();
  const detail = useLibraryDetail(id);
  const invalidate = useInvalidateLibrary();
  const monitors = useMonitors();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFrom(searchParams.get("tab"));
  const [editOpen, setEditOpen] = useState(false);
  const [coverCandidates, setCoverCandidates] = useState<CoverCandidate[] | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [launchSnapshot, setLaunchSnapshot] = useState<LaunchSnapshot | null>(null);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [validation, setValidation] = useState<ValidationReport | null>(null);

  const workId = detail.data?.workId;
  const launch = launchSnapshot?.workId === workId ? launchSnapshot : null;

  useEffect(() => {
    if (!workId || !isTauri()) {
      return;
    }
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getLaunchState(workId)
      .then((snapshot) => {
        if (!disposed) {
          setLaunchSnapshot(snapshot);
        }
      })
      .catch(() => undefined);
    void listen<LaunchSnapshot>("launch-state", (event) => {
      if (event.payload.workId !== workId) {
        return;
      }
      setLaunchSnapshot(event.payload);
      if (event.payload.state === "exited") {
        invalidate();
      }
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [invalidate, workId]);

  if (detail.isPending) {
    return (
      <div className="detail-page">
        <EmptyState
          title="正在读取作品"
          description="正在从本地数据库读取安装副本、启动路径和用户状态。"
        />
      </div>
    );
  }

  if (detail.isError) {
    return (
      <div className="detail-page">
        <EmptyState
          title="无法读取作品"
          description={String(detail.error)}
          action={
            <div className="detail-error-actions">
              <Button variant="secondary" size="sm" onClick={() => void detail.refetch()}>
                重试
              </Button>
              <Link to="/library">
                <Button variant="ghost" size="sm">
                  返回游戏库
                </Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="detail-page">
        <EmptyState
          title="没有找到这部作品"
          description="它可能已经从库中移除，或者这个链接来自旧的本地数据。"
          action={
            <Link to="/library">
              <Button variant="secondary" size="sm">
                返回游戏库
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const item = detail.data;
  const game = libraryItemToGame(item);
  const coverUrl = assetUrl(item.coverPath) ?? assetUrl(item.coverThumbPath);
  const coverWork = { ...game, coverUrl };
  const hasLocalCopy = Boolean(item.localCopyId);
  const isRunning = launch?.state === "running";
  const playtime = item.playtimeMinutes > 0 ? formatPlaytime(item.playtimeMinutes) : "尚未记录";
  const lastPlayed = item.lastPlayedAt ? formatRelativeDate(item.lastPlayedAt) : game.lastPlayed;

  const selectTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    setSearchParams(params, { replace: true });
  };

  const handleLaunch = async () => {
    if (!workId) {
      return;
    }
    setLaunchBusy(true);
    try {
      const snapshot = await startWork(workId);
      setLaunchSnapshot((current) =>
        current?.launchId === snapshot.launchId && current.state === "exited" ? current : snapshot,
      );
      invalidate();
      toast.success("游戏进程已启动");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLaunchBusy(false);
    }
  };

  const handleStop = async () => {
    if (!workId) {
      return;
    }
    try {
      const stopped = await stopWork(workId);
      toast(stopped ? "已请求结束游戏进程树" : "这个进程没有启用作业对象跟踪，无法从应用内结束");
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleValidate = async () => {
    if (!workId) {
      return;
    }
    try {
      const report = await validateWork(workId);
      setValidation(report);
      invalidate();
      toast(report.valid ? "安装路径可用" : "安装路径需要修复");
    } catch (error) {
      setValidation(null);
      toast.error(String(error));
    }
  };

  const handlePickCover = async () => {
    if (!workId) {
      return;
    }
    const selected = await pickImageFile();
    if (!selected) {
      return;
    }
    setCoverBusy(true);
    try {
      await setWorkCover(workId, selected);
      invalidate();
      toast.success("封面已缓存");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCoverBusy(false);
    }
  };

  const handleDiscoverCover = async () => {
    if (!workId) {
      return;
    }
    if (!isTauri()) {
      toast("浏览器预览不读取游戏目录；请在 Tauri 窗口中发现本地图片。");
      return;
    }
    try {
      const candidates = await discoverWorkCovers(workId);
      setCoverCandidates(candidates);
      if (candidates.length === 0) {
        toast("游戏目录附近没有找到常见封面图片");
      }
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleApplyCandidate = async (candidate: CoverCandidate) => {
    if (!workId) {
      return;
    }
    setCoverBusy(true);
    try {
      await setWorkCover(workId, candidate.path, true);
      setCoverCandidates(null);
      invalidate();
      toast.success("已使用本地封面图片");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCoverBusy(false);
    }
  };

  const handleClearCover = async () => {
    if (!workId) {
      return;
    }
    if (!window.confirm("清除这部作品的封面缓存？游戏文件不会被删除。")) {
      return;
    }
    setCoverBusy(true);
    try {
      await clearWorkCover(workId);
      invalidate();
      toast.success("已清除封面");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCoverBusy(false);
    }
  };

  return (
    <div className="detail-page">
      <div className="detail-back">
        <Link to="/library">
          <ArrowLeft size={14} strokeWidth={1.5} />
          游戏库
        </Link>
        <span>/</span>
        <em>{game.title}</em>
      </div>

      <div className="detail-hero">
        <div className="detail-poster">
          <CoverArt work={coverWork} />
          <div className="detail-poster__meta">
            <span>{game.catalogNo}</span>
            <span>{game.year ?? "年份未知"}</span>
          </div>
          <div className="detail-poster__actions">
            <Button
              variant="secondary"
              size="sm"
              disabled={coverBusy}
              onClick={() => void handlePickCover()}
            >
              <ImagePlus size={13} strokeWidth={1.6} />
              {coverUrl ? "更换封面" : "选择封面"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={coverBusy}
              onClick={() => void handleDiscoverCover()}
            >
              <Images size={13} strokeWidth={1.6} /> 本地图片
            </Button>
            {coverUrl ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={coverBusy}
                onClick={() => void handleClearCover()}
              >
                清除
              </Button>
            ) : null}
          </div>
          {coverCandidates ? (
            <div className="detail-cover-candidates" aria-live="polite">
              <header>
                <b>找到 {coverCandidates.length} 张本地图片</b>
                <button type="button" onClick={() => setCoverCandidates(null)}>
                  关闭
                </button>
              </header>
              {coverCandidates.length === 0 ? (
                <p>游戏目录和常见封面子目录里没有匹配的图片。</p>
              ) : (
                coverCandidates.map((candidate) => (
                  <button
                    type="button"
                    className="detail-cover-candidate"
                    key={candidate.path}
                    disabled={coverBusy}
                    title={candidate.path}
                    onClick={() => void handleApplyCandidate(candidate)}
                  >
                    <span>{candidate.fileName}</span>
                    <em>
                      {candidate.width}×{candidate.height}
                    </em>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div className="detail-copy">
          <p className="app-kicker">
            <span className="app-status-dot" />
            {hasLocalCopy ? "LOCAL COPY / 本地副本" : "Galgame / AVG"} · {game.year ?? "年份未知"} ·{" "}
            {game.developer}
          </p>
          <h1>{game.title}</h1>
          {game.originalTitle ? (
            <p className="detail-original">
              {game.originalTitle}
              {game.romaji ? <span>{game.romaji}</span> : null}
            </p>
          ) : null}
          {detail.data.aliases.length > 0 ? (
            <p className="detail-aliases">别名：{detail.data.aliases.join(" / ")}</p>
          ) : null}
          <div className="detail-tags">
            {game.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
            {hasLocalCopy ? <Tag tone="status">本地扫描</Tag> : null}
            {game.ageRating !== "未标记" ? <Tag tone="data">{game.ageRating}</Tag> : null}
            {game.edition !== "未标记" ? <Tag tone="muted">{game.edition}</Tag> : null}
            {item.installStatus === "missing" ? <Tag tone="accent">路径缺失</Tag> : null}
          </div>
          <p className="detail-score">
            {game.rating > 0 ? "个人评分 " + game.rating.toFixed(1) + " / 10" : "尚未评分"} ·{" "}
            {game.launchCount} 次启动
          </p>
          <p className="detail-desc">{game.description}</p>
          <div className="detail-stats">
            <div>
              <b>{playtime}</b>
              <span>累计时长</span>
            </div>
            <div>
              <b>{lastPlayed}</b>
              <span>上次游玩</span>
            </div>
            <div>
              <b>{game.launchCount}</b>
              <span>启动次数</span>
            </div>
            <div>
              <b>{statusLabels[game.status]}</b>
              <span>游玩状态</span>
            </div>
          </div>
          <div className="detail-actions">
            {isRunning ? (
              <Button
                variant="danger"
                onClick={() => void handleStop()}
                disabled={launchBusy || !launch?.jobTracked}
                title={launch?.jobTracked ? "结束整个游戏进程树" : "此进程未启用作业对象跟踪"}
              >
                <StopCircle size={14} strokeWidth={1.6} /> 停止游戏
              </Button>
            ) : (
              <Button variant="primary" onClick={() => void handleLaunch()} disabled={launchBusy}>
                {launchBusy ? (
                  <Loader2 size={14} className="detail-spin" />
                ) : (
                  <Play size={14} fill="currentColor" strokeWidth={0} />
                )}
                {launchBusy ? "正在启动…" : "启动游戏"}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil size={13} strokeWidth={1.6} /> 编辑资料
            </Button>
            <Button variant="ghost" onClick={() => selectTab("launch")}>
              启动配置
              <ArrowUpRight size={14} strokeWidth={1.6} />
            </Button>
          </div>
          <p className={cn("detail-launch-status", isRunning && "is-running")}>
            <span />
            {launchLabel(launch)}
            {launch?.state === "exited" && launch.message ? " · " + launch.message : null}
          </p>
        </div>

        <aside className="detail-side">
          <header>
            <span>最近游玩</span>
            <em>共 {game.launchCount} 次启动</em>
          </header>
          {game.sessions.length > 0 ? (
            game.sessions.slice(0, 3).map((session) => (
              <div className="detail-session" key={session.id}>
                <span>
                  {session.date} {session.time}
                </span>
                <b>{session.duration}</b>
                <i style={{ width: Math.min(session.minutes / 1.4, 100) + "%" }} />
              </div>
            ))
          ) : (
            <p className="detail-side__empty">
              还没有游玩记录。C3 会记录启动时间和次数；自动会话与时长统计在 C6 接入。
            </p>
          )}
          <div className="detail-install">
            <span>本地安装</span>
            <p title={game.exePath}>
              <FolderOpen size={13} strokeWidth={1.5} />
              <span>{game.exePath}</span>
            </p>
            <p title={game.installedPath}>
              <HardDrive size={13} strokeWidth={1.5} />
              <span>{game.installedPath}</span>
            </p>
            <p>
              <Monitor size={13} strokeWidth={1.5} />
              <span>
                {game.installedSize} · {game.edition}
              </span>
            </p>
            <button type="button" onClick={() => void handleValidate()}>
              <Check size={12} strokeWidth={1.6} />
              校验路径
            </button>
            {validation ? (
              <div className="detail-path-check">
                <span className={validation.exe.ok ? "is-ok" : "is-error"}>
                  {validation.exe.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {validation.exe.message}
                </span>
                <span className={validation.workingDir.ok ? "is-ok" : "is-error"}>
                  {validation.workingDir.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {validation.workingDir.message}
                </span>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <div className="detail-tabs" role="tablist" aria-label="作品详情分区">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={cn(tab === entry.id && "is-active")}
            onClick={() => selectTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="detail-panel">
        {tab === "overview" ? (
          <div className="detail-overview">
            <section>
              <h2>关于这部作品</h2>
              <p>{game.description}</p>
              {detail.data.aliases.length > 0 ? (
                <p>
                  <b>别名：</b>
                  {detail.data.aliases.join(" / ")}
                </p>
              ) : null}
              <p>
                管理器只管理本地安装、启动路径、用户状态和可追溯元数据；不会读取游戏内章节、路线、存档或成就。
              </p>
            </section>
            <section>
              <h2>游戏资料</h2>
              <dl className="detail-ledger">
                <div>
                  <dt>原题</dt>
                  <dd>{game.originalTitle || "未填写"}</dd>
                </div>
                <div>
                  <dt>发售</dt>
                  <dd>
                    {detail.data.releaseDate
                      ? formatDate(detail.data.releaseDate)
                      : game.year
                        ? game.year + " 年"
                        : "未知"}
                  </dd>
                </div>
                <div>
                  <dt>开发商</dt>
                  <dd>{game.developer}</dd>
                </div>
                <div>
                  <dt>发行商</dt>
                  <dd>{item.publisher ?? "未填写"}</dd>
                </div>
                <div>
                  <dt>版本</dt>
                  <dd>{game.edition}</dd>
                </div>
                <div>
                  <dt>语言</dt>
                  <dd>{detail.data.language ?? "未识别"}</dd>
                </div>
                <div>
                  <dt>平台</dt>
                  <dd>{detail.data.platform}</dd>
                </div>
                <div>
                  <dt>安装大小</dt>
                  <dd>{game.installedSize}</dd>
                </div>
                <div>
                  <dt>库编号</dt>
                  <dd>{game.catalogNo}</dd>
                </div>
              </dl>
            </section>
            <section>
              <h2>用户备注</h2>
              <p className="detail-note">
                {detail.data.notes || "尚未添加备注。备注是手动内容，不是游戏内自动读取的状态。"}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                编辑资料与备注
              </Button>
            </section>
          </div>
        ) : null}

        {tab === "sessions" ? (
          <div className="detail-sessions">
            <header>
              <div>
                <h2>游玩记录</h2>
                <p>会话由启动器开始和结束时间计算；C3 只记录启动，自动时长统计在 C6 接入。</p>
              </div>
              <Button variant="secondary" size="sm" disabled>
                C6 接入补录
              </Button>
            </header>
            <div className="detail-session-table">
              <div className="detail-session-table__head">
                <span>开始时间</span>
                <span>时长</span>
                <span>结束方式</span>
                <span>操作</span>
              </div>
              {game.sessions.length > 0 ? (
                game.sessions.map((session) => (
                  <div className="detail-session-table__row" key={session.id}>
                    <span>
                      {session.date} {session.time}
                    </span>
                    <b>{session.duration}</b>
                    <span>{session.ended}</span>
                    <span className="detail-session-table__locked">C6</span>
                  </div>
                ))
              ) : (
                <p className="detail-empty-row">
                  还没有会话。启动游戏后这里会显示启动记录；完整会话和时长在 C6 接入。
                </p>
              )}
            </div>
          </div>
        ) : null}

        {tab === "launch" && hasLocalCopy ? (
          <LaunchConfigPanel
            key={detail.data.workId}
            detail={detail.data}
            monitors={monitors.data ?? []}
            onSaved={invalidate}
            onLaunch={() => void handleLaunch()}
          />
        ) : null}

        {tab === "launch" && !hasLocalCopy ? (
          <div className="detail-sources">
            <header>
              <h2>没有本地安装副本</h2>
              <p>启动配置只对本地安装副本生效。</p>
            </header>
          </div>
        ) : null}

        {tab === "sources" ? (
          <MetadataPanel key={detail.data.workId} detail={detail.data} onChanged={invalidate} />
        ) : null}
      </div>

      <WorkEditDialog
        detail={detail.data}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={invalidate}
      />
    </div>
  );
}
