import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  CirclePlay,
  Clock3,
  Database,
  FolderOpen,
  HardDrive,
  Heart,
  History,
  LayoutDashboard,
  Loader2,
  Pencil,
  Play,
  SlidersHorizontal,
  Star,
  StopCircle,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { CoverArt } from "../../design-system/components/CoverArt";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Hint } from "../../design-system/components/Hint";
import { Tag } from "../../design-system/components/Tag";
import { openExternalUrl } from "../../lib/app-api";
import { statusLabels } from "../../lib/game-data";
import {
  assetUrl,
  getLaunchState,
  getMetadataWorkState,
  libraryItemToGame,
  startWork,
  stopWork,
  validateWork,
} from "../../lib/library-api";
import type { LaunchSnapshot, MetadataWorkState, ValidationReport } from "../../lib/library-types";
import { formatDate, formatPlaytimeSeconds, formatRelativeDate } from "../../lib/format";
import { cn } from "../../lib/cn";
import { useInvalidateLibrary, useLibraryDetail, useWorkSessions } from "../library/useLibrary";
import { usePreferences } from "../../app/usePreferences";
import { useAppearance } from "../../app/useAppearance";
import { workOriginFromState, workOrigins } from "../../lib/work-navigation";
import { useDeepLinkFocus } from "../../lib/use-deep-link-focus";
import { LaunchConfigPanel } from "./LaunchConfigPanel";
import { SourceWorkspace } from "./SourceWorkspace";
import { WorkEditPanel } from "./WorkEditPanel";
import { SessionHistory } from "./SessionHistory";
import "./work-detail.css";

type Tab = "overview" | "sessions" | "launch" | "sources";

const tabs: { id: Tab; label: string; shortLabel: string; icon: LucideIcon }[] = [
  { id: "overview", label: "概览", shortLabel: "概览", icon: LayoutDashboard },
  { id: "sessions", label: "游玩记录", shortLabel: "记录", icon: History },
  { id: "launch", label: "启动配置", shortLabel: "启动", icon: SlidersHorizontal },
  { id: "sources", label: "来源与字段", shortLabel: "来源", icon: Database },
];

function tabFrom(value: string | null): Tab {
  return tabs.some((tab) => tab.id === value) ? (value as Tab) : "overview";
}

function launchLabel(snapshot: LaunchSnapshot | null): string {
  if (!snapshot) {
    return "尚未运行";
  }
  if (snapshot.state === "running") {
    return "运行中，PID " + snapshot.pid;
  }
  if (snapshot.exitCode === null) {
    return "已退出";
  }
  return "已退出，退出码 " + snapshot.exitCode;
}

function sourceIdFor(state: MetadataWorkState | undefined, provider: string): string | null {
  const linked = state?.sourceLinks?.find((link) => link.provider === provider);
  if (linked?.sourceId.trim()) {
    return linked.sourceId;
  }
  for (const field of state?.fields ?? []) {
    if (field.source === provider && field.sourceId?.trim()) {
      return field.sourceId;
    }
    const claim = field.claims.find(
      (candidate) => candidate.source === provider && candidate.sourceId.trim(),
    );
    if (claim) {
      return claim.sourceId;
    }
  }
  return null;
}

export function WorkDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const origin = workOriginFromState(location.state) ?? workOrigins.library;
  const detail = useLibraryDetail(id);
  const invalidate = useInvalidateLibrary();
  const preferences = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFrom(searchParams.get("tab"));
  const [launchSnapshot, setLaunchSnapshot] = useState<LaunchSnapshot | null>(null);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [validationBusy, setValidationBusy] = useState(false);
  const [editorRequest, setEditorRequest] = useState(0);
  const tabListRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pendingTabScrollRef = useRef<number | null>(null);
  const jumpToTabsRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const reduceMotionPreference = useAppearance((state) => state.reduceMotion);
  const motionOff = reduceMotionPreference || Boolean(reduceMotion);
  useDeepLinkFocus({ ready: Boolean(detail.data) });

  const workId = detail.data?.workId;
  const sessions = useWorkSessions(workId);
  const metadataState = useQuery({
    queryKey: ["metadata-work-state", workId],
    queryFn: () => getMetadataWorkState(workId as number),
    enabled: Number.isInteger(workId),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const launch = launchSnapshot?.workId === workId ? launchSnapshot : null;

  useEffect(() => {
    if (!workId || !isTauri()) {
      return;
    }
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let unlistenSession: (() => void) | undefined;
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
    void listen("play-session", () => {
      invalidate();
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlistenSession = cleanup;
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
      unlistenSession?.();
    };
  }, [invalidate, workId]);

  useLayoutEffect(() => {
    const pendingScroll = pendingTabScrollRef.current;
    const panel = panelRef.current;
    const scroller = panel?.closest<HTMLElement>(".app-page");
    if (pendingScroll === null || !panel || !scroller) {
      return;
    }

    pendingTabScrollRef.current = null;
    panel.style.minHeight = "";
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    scroller.scrollTop = Math.min(pendingScroll, Math.max(0, maxScroll));
  }, [tab]);

  useEffect(() => {
    if (!editorRequest || tab !== "sources") {
      return;
    }
    const panel = document.getElementById("work-edit-panel");
    if (!panel) {
      return;
    }
    if (typeof panel.scrollIntoView === "function") {
      panel.scrollIntoView({ behavior: motionOff ? "auto" : "smooth", block: "start" });
    }
    panel.focus({ preventScroll: true });
  }, [editorRequest, motionOff, tab]);

  useEffect(() => {
    if (!jumpToTabsRef.current) {
      return;
    }
    jumpToTabsRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("detail-tabs")?.scrollIntoView({
        behavior: motionOff ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [motionOff, tab]);

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
  const playtimeSeconds = item.playtimeSeconds ?? item.playtimeMinutes * 60;
  const playtime = playtimeSeconds > 0 ? formatPlaytimeSeconds(playtimeSeconds) : "尚未记录";
  const lastPlayed = item.lastPlayedAt ? formatRelativeDate(item.lastPlayedAt) : game.lastPlayed;
  const bangumiSourceId = sourceIdFor(metadataState.data, "bangumi");
  const kungalSourceId = sourceIdFor(metadataState.data, "nextmoe");
  const bangumiUrl = bangumiSourceId
    ? "https://bgm.tv/subject/" + encodeURIComponent(bangumiSourceId)
    : null;
  const kungalUrl = kungalSourceId
    ? "https://www.kungal.com/galgame/" + encodeURIComponent(kungalSourceId)
    : null;

  const selectTab = (next: Tab) => {
    if (next === tab) {
      return;
    }
    const scroller = tabListRef.current?.closest<HTMLElement>(".app-page");
    pendingTabScrollRef.current = scroller?.scrollTop ?? null;
    const params = new URLSearchParams(searchParams);
    if (next === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    setSearchParams(params, { replace: true, state: location.state });
  };

  const scrollToDetailTabs = () => {
    document.getElementById("detail-tabs")?.scrollIntoView({
      behavior: motionOff ? "auto" : "smooth",
      block: "start",
    });
  };

  const openAllSessions = () => {
    if (tab === "sessions") {
      scrollToDetailTabs();
      return;
    }
    jumpToTabsRef.current = true;
    selectTab("sessions");
  };

  const openInlineEditor = () => {
    setEditorRequest((current) => current + 1);
    selectTab("sources");
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) {
      return;
    }
    selectTab(next.id);
    document.getElementById("detail-tab-" + next.id)?.focus({ preventScroll: true });
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
    setValidationBusy(true);
    try {
      const report = await validateWork(workId);
      setValidation(report);
      invalidate();
    } catch (error) {
      setValidation(null);
      toast.error(String(error));
    } finally {
      setValidationBusy(false);
    }
  };

  return (
    <div className="detail-page">
      <div className="detail-back">
        <Link to={origin.to}>
          <ArrowLeft size={14} strokeWidth={1.5} />
          {origin.label}
        </Link>
        <span>/</span>
        <Hint label={game.title} side="bottom">
          <em>{game.title}</em>
        </Hint>
      </div>

      <motion.div
        className="detail-hero"
        initial={motionOff ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={motionOff ? { duration: 0 } : { duration: 0.44, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="detail-poster">
          <div className="detail-poster__backdrop" aria-hidden="true">
            <CoverArt work={coverWork} />
          </div>
          <motion.figure
            className="detail-poster__figure"
            initial={motionOff ? false : { opacity: 0, y: 16, scale: 0.975 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={motionOff ? { duration: 0 } : { duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="detail-poster__mat">
              <div className="detail-poster__frame">
                <CoverArt work={coverWork} />
                <span className="detail-poster__glint" aria-hidden="true" />
              </div>
            </div>
          </motion.figure>
        </div>

        <div className="detail-copy">
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
          <p className="detail-score">
            <Star size={12} fill="currentColor" strokeWidth={0} />
            {game.rating > 0 ? `${game.rating.toFixed(1)} / 10` : "尚未评分"}
            <span>{game.launchCount} 次启动</span>
          </p>
          <div className="detail-synopsis">
            <p className="detail-desc">{game.description}</p>
          </div>
          <div className="detail-command-deck">
            <div className="detail-command-actions">
              <div className="detail-actions">
                {isRunning ? (
                  <Hint
                    label={launch?.jobTracked ? "结束整个游戏进程树" : "此进程未启用作业对象跟踪"}
                    side="bottom"
                  >
                    <Button
                      variant="danger"
                      onClick={() => void handleStop()}
                      disabled={launchBusy || !launch?.jobTracked}
                    >
                      <StopCircle size={14} strokeWidth={1.6} /> 停止游戏
                    </Button>
                  </Hint>
                ) : (
                  <Button
                    variant="primary"
                    className="detail-launch-button"
                    onClick={() => void handleLaunch()}
                    disabled={launchBusy}
                  >
                    {launchBusy ? (
                      <Loader2 size={14} className="detail-spin" />
                    ) : (
                      <Play size={14} fill="currentColor" strokeWidth={0} />
                    )}
                    {launchBusy ? "正在启动…" : "启动游戏"}
                  </Button>
                )}
                <Hint label="编辑游戏资料" side="bottom">
                  <Button
                    variant="secondary"
                    className="detail-edit-button"
                    aria-label="编辑游戏资料"
                    onClick={openInlineEditor}
                  >
                    <Pencil size={13} strokeWidth={1.6} /> 编辑
                  </Button>
                </Hint>
                {bangumiUrl ? (
                  <Hint label="在 Bangumi 查看" side="bottom">
                    <button
                      type="button"
                      className="detail-site-link"
                      aria-label="打开 Bangumi 页面"
                      onClick={() => void openExternalUrl(bangumiUrl)}
                    >
                      <img src="/bangumi-icon.png" alt="" width={16} height={16} />
                      <span>Bangumi</span>
                    </button>
                  </Hint>
                ) : null}
                {kungalUrl ? (
                  <Hint label="在 Kungal 查看" side="bottom">
                    <button
                      type="button"
                      className="detail-site-link"
                      aria-label="打开 Kungal 页面"
                      onClick={() => void openExternalUrl(kungalUrl)}
                    >
                      <img src="/kungal-icon.png" alt="" width={18} height={18} />
                      <span>Kungal</span>
                    </button>
                  </Hint>
                ) : null}
              </div>
              <p className={cn("detail-launch-status", isRunning && "is-running")}>
                <span />
                {launchLabel(launch)}
                {launch?.state === "exited" && launch.message ? "，" + launch.message : null}
              </p>
            </div>
            <dl className="detail-stats" aria-label="游玩数据">
              <div>
                <dt>
                  <span className="detail-stat__icon" aria-hidden="true">
                    <Clock3 size={14} strokeWidth={1.8} />
                  </span>
                  累计时长
                </dt>
                <dd>{playtime}</dd>
              </div>
              <div>
                <dt>
                  <span className="detail-stat__icon" aria-hidden="true">
                    <CalendarClock size={14} strokeWidth={1.8} />
                  </span>
                  上次游玩
                </dt>
                <dd>{lastPlayed}</dd>
              </div>
              <div>
                <dt>
                  <span className="detail-stat__icon" aria-hidden="true">
                    <CirclePlay size={14} strokeWidth={1.8} />
                  </span>
                  启动次数
                </dt>
                <dd>{game.launchCount}</dd>
              </div>
              <div>
                <dt>
                  <span className="detail-stat__icon" aria-hidden="true">
                    <Heart size={14} strokeWidth={1.8} />
                  </span>
                  游玩状态
                </dt>
                <dd>{statusLabels[game.status]}</dd>
              </div>
            </dl>
          </div>
        </div>
      </motion.div>

      <div className="detail-play-strip">
        <section className="detail-recent-card">
          <header className="detail-card-head">
            <div>
              <h2>最近游玩</h2>
              <p>共 {game.launchCount} 次启动</p>
            </div>
            <button type="button" className="detail-card-link" onClick={openAllSessions}>
              全部记录
              <ArrowRight size={13} strokeWidth={1.8} />
            </button>
          </header>
          {sessions.data && sessions.data.length > 0 ? (
            <div className="detail-session-list">
              {sessions.data.slice(0, 3).map((session) => (
                <div className="detail-session" key={session.id}>
                  <div className="detail-session__line">
                    <span>
                      {new Date(session.startedAt).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <b>{formatPlaytimeSeconds(session.durationSec)}</b>
                  </div>
                  <i
                    style={{
                      width: Math.min(session.durationSec / 60 / 1.4, 100) + "%",
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="detail-side__empty">还没有游玩记录。启动游戏后会自动开始计时。</p>
          )}
        </section>

        <section className="detail-install-card">
          <header className="detail-card-head">
            <div>
              <h2>本地安装</h2>
              <p>{item.installStatus === "missing" ? "路径需要修复" : "本地副本可启动"}</p>
            </div>
            <button
              type="button"
              className={cn(
                "detail-card-link detail-validate",
                validation?.valid && "is-ok",
                validation && !validation.valid && "is-error",
              )}
              onClick={() => void handleValidate()}
              disabled={validationBusy}
            >
              {validationBusy ? (
                <Loader2 size={13} className="detail-spin" />
              ) : validation ? (
                validation.valid ? (
                  <CheckCircle2 size={13} strokeWidth={1.8} />
                ) : (
                  <XCircle size={13} strokeWidth={1.8} />
                )
              ) : (
                <Check size={13} strokeWidth={1.8} />
              )}
              {validationBusy
                ? "校验中"
                : validation
                  ? validation.valid
                    ? "路径可用"
                    : "需要修复"
                  : "校验路径"}
            </button>
          </header>
          <div className="detail-install-paths">
            <Hint label={validation?.exe.message ?? game.exePath} side="bottom" align="start">
              <p className={cn(validation && (validation.exe.ok ? "is-ok" : "is-error"))}>
                {validation ? (
                  validation.exe.ok ? (
                    <CheckCircle2 size={14} strokeWidth={1.6} />
                  ) : (
                    <XCircle size={14} strokeWidth={1.6} />
                  )
                ) : (
                  <FolderOpen size={14} strokeWidth={1.5} />
                )}
                <span>{game.exePath}</span>
              </p>
            </Hint>
            <Hint
              label={validation?.workingDir.message ?? game.installedPath}
              side="bottom"
              align="start"
            >
              <p className={cn(validation && (validation.workingDir.ok ? "is-ok" : "is-error"))}>
                {validation ? (
                  validation.workingDir.ok ? (
                    <CheckCircle2 size={14} strokeWidth={1.6} />
                  ) : (
                    <XCircle size={14} strokeWidth={1.6} />
                  )
                ) : (
                  <HardDrive size={14} strokeWidth={1.5} />
                )}
                <span>{game.installedPath}</span>
              </p>
            </Hint>
          </div>
          <div className="detail-install-meta">
            <div>
              <span>安装状态</span>
              <b className={item.installStatus === "missing" ? "is-error" : "is-ok"}>
                {item.installStatus === "missing" ? "路径缺失" : "已安装"}
              </b>
            </div>
            <div>
              <span>平台</span>
              <b>{detail.data.platform}</b>
            </div>
            <div>
              <span>版本</span>
              <b>{game.edition}</b>
            </div>
            <div>
              <span>安装大小</span>
              <b>{game.installedSize}</b>
            </div>
          </div>
        </section>
      </div>

      <div
        id="detail-tabs"
        className="detail-tabs"
        role="tablist"
        aria-label="作品详情分区"
        ref={tabListRef}
      >
        {tabs.map((entry, index) => {
          const Icon = entry.icon;
          const active = tab === entry.id;
          return (
            <button
              key={entry.id}
              id={"detail-tab-" + entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="detail-tab-panel"
              tabIndex={active ? 0 : -1}
              className={cn(active && "is-active")}
              onClick={() => selectTab(entry.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {active ? (
                <motion.span
                  className="detail-tabs__active"
                  layoutId="detail-tab-active"
                  transition={
                    motionOff
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 520, damping: 40, mass: 0.7 }
                  }
                  aria-hidden="true"
                />
              ) : null}
              <Icon className="detail-tabs__icon" size={14} strokeWidth={1.7} />
              <span className="detail-tabs__label detail-tabs__label--full">{entry.label}</span>
              <span className="detail-tabs__label detail-tabs__label--short">
                {entry.shortLabel}
              </span>
            </button>
          );
        })}
      </div>

      <motion.div
        ref={panelRef}
        id="detail-tab-panel"
        className="detail-panel"
        role="tabpanel"
        aria-labelledby={"detail-tab-" + tab}
        key={tab}
        initial={motionOff ? false : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={motionOff ? { duration: 0 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {tab === "overview" ? (
          <div className="detail-overview">
            <div className="detail-overview__main">
              <section className="detail-about-card">
                <h2>关于这部作品</h2>
                <p className="detail-about-description">{game.description}</p>
                {detail.data.aliases.length > 0 ? (
                  <p>
                    <b>别名：</b>
                    {detail.data.aliases.join(" / ")}
                  </p>
                ) : null}
                <div className="detail-about-tags">
                  {game.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                  {hasLocalCopy ? <Tag tone="status">本地扫描</Tag> : null}
                  {detail.data.steamAppId ? (
                    <Tag tone="data">Steam 库 {detail.data.steamAppId}</Tag>
                  ) : null}
                  {game.ageRating !== "未标记" ? <Tag tone="data">{game.ageRating}</Tag> : null}
                  {game.edition !== "未标记" ? <Tag tone="muted">{game.edition}</Tag> : null}
                  {item.installStatus === "missing" ? <Tag tone="accent">路径缺失</Tag> : null}
                </div>
                <div className="detail-about-facts">
                  <h3>游戏资料</h3>
                  <dl className="detail-about-ledger">
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
                    {detail.data.steamAppId ? (
                      <div>
                        <dt>来源</dt>
                        <dd>Steam 库 AppID {detail.data.steamAppId}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>安装大小</dt>
                      <dd>{game.installedSize}</dd>
                    </div>
                    <div>
                      <dt>库编号</dt>
                      <dd>{game.catalogNo}</dd>
                    </div>
                  </dl>
                </div>
                <p className="detail-about-note">
                  管理器只管理本地安装、启动路径、用户状态和可追溯元数据；不会读取游戏内章节、路线、存档或成就。
                </p>
              </section>
              <section className="detail-review-card" aria-labelledby="detail-review-title">
                <header className="detail-review-head">
                  <h2 id="detail-review-title">用户评价</h2>
                  <span className="detail-review-source">本地</span>
                </header>
                {detail.data.notes ? (
                  <p className="detail-review-copy">{detail.data.notes}</p>
                ) : (
                  <p className="detail-review-empty">还没有写下评价。</p>
                )}
                <Button variant="ghost" size="sm" onClick={openInlineEditor}>
                  <Pencil size={13} strokeWidth={1.6} />
                  {detail.data.notes ? "编辑评价" : "写评价"}
                </Button>
              </section>
            </div>
          </div>
        ) : null}

        {tab === "sessions" ? (
          <div className="detail-sessions">
            <SessionHistory workId={item.workId} onChanged={invalidate} />
          </div>
        ) : null}

        {tab === "launch" && hasLocalCopy ? (
          <LaunchConfigPanel
            key={detail.data.workId}
            detail={detail.data}
            preferences={
              preferences.data ?? {
                proxyMode: "system",
                proxyUrl: "",
                defaultMonitor: null,
                launchFullscreen: false,
                wrappers: [],
                updateManifestUrl: "",
                onboardingCompleted: true,
              }
            }
            onSaved={invalidate}
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
          <>
            <WorkEditPanel
              key={"work-edit-" + detail.data.workId}
              detail={detail.data}
              onChanged={invalidate}
            />
            <SourceWorkspace
              key={"source-workspace-" + detail.data.workId}
              detail={detail.data}
              onChanged={invalidate}
            />
          </>
        ) : null}
      </motion.div>
    </div>
  );
}
