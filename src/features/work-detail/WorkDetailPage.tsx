import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock3,
  FolderOpen,
  HardDrive,
  Monitor,
  Play,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { CoverArt } from "../../design-system/components/CoverArt";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Tag } from "../../design-system/components/Tag";
import { statusLabels } from "../../lib/game-data";
import { libraryItemToGame } from "../../lib/library-api";
import { cn } from "../../lib/cn";
import { useLibraryDetail } from "../library/useLibrary";
import "./work-detail.css";

type Tab = "overview" | "sessions" | "launch" | "sources";

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "概览" },
  { id: "sessions", label: "游玩记录" },
  { id: "launch", label: "启动配置" },
  { id: "sources", label: "来源与字段" },
];

export function WorkDetailPage() {
  const { id } = useParams();
  const detail = useLibraryDetail(id);
  const [tab, setTab] = useState<Tab>("overview");

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

  const game = libraryItemToGame(detail.data);
  const isLocal = Boolean(game.isLocal);

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
          <CoverArt work={game} />
          <div className="detail-poster__meta">
            <span>{game.catalogNo}</span>
            <span>{game.year ?? "年份未知"}</span>
          </div>
        </div>

        <div className="detail-copy">
          <p className="app-kicker">
            <span className="app-status-dot" />
            {isLocal ? "LOCAL COPY / 本地副本" : "Galgame / AVG"} · {game.year ?? "年份未知"} ·{" "}
            {game.developer}
          </p>
          <h1>{game.title}</h1>
          {game.originalTitle ? (
            <p className="detail-original">
              {game.originalTitle}
              {game.romaji ? <span>{game.romaji}</span> : null}
            </p>
          ) : null}
          <div className="detail-tags">
            {game.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
            {isLocal ? <Tag tone="status">本地扫描</Tag> : null}
            {game.ageRating !== "未标记" ? <Tag tone="data">{game.ageRating}</Tag> : null}
            {game.edition !== "未标记" ? <Tag tone="muted">{game.edition}</Tag> : null}
          </div>
          <p className="detail-score">
            {game.rating > 0 ? "个人评分 " + game.rating.toFixed(1) + " / 10" : "尚未评分"} ·{" "}
            {game.launchCount} 次启动
          </p>
          <p className="detail-desc">{game.description}</p>
          <div className="detail-stats">
            <div>
              <b>{game.playtime}</b>
              <span>累计时长</span>
            </div>
            <div>
              <b>{game.lastPlayed}</b>
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
            <Button
              variant="primary"
              onClick={() =>
                toast(
                  isLocal
                    ? "启动器将在 C3 接入；当前只保存本地启动路径。"
                    : "原型预览：启动器将在 C3 接入。",
                )
              }
            >
              <Play size={14} fill="currentColor" strokeWidth={0} />
              启动游戏
            </Button>
            <Button variant="secondary" onClick={() => setTab("launch")}>
              查看启动路径
              <ArrowUpRight size={14} strokeWidth={1.6} />
            </Button>
          </div>
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
              {isLocal
                ? "还没有游玩记录。启动器与自动计时将在 C3/C6 接入。"
                : "还没有游玩记录。启动游戏后会自动生成会话。"}
            </p>
          )}
          <div className="detail-install">
            <span>本地安装</span>
            <p title={game.exePath}>
              <FolderOpen size={13} strokeWidth={1.5} />
              <span>{game.exePath}</span>
            </p>
            <p>
              <HardDrive size={13} strokeWidth={1.5} />
              <span>
                {game.installedSize} · {game.edition}
              </span>
            </p>
            <button type="button" onClick={() => toast("路径校验将在 C3 接入。")}>
              <Check size={12} strokeWidth={1.6} />
              校验路径
            </button>
          </div>
        </aside>
      </div>

      <div className="detail-tabs" role="tablist" aria-label="作品详情分区">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={cn(tab === item.id && "is-active")}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="detail-panel">
        {tab === "overview" ? (
          <div className="detail-overview">
            <section>
              <h2>关于这部作品</h2>
              <p>
                {isLocal
                  ? "本地副本已记录。MiyuManager 只管理本地安装、启动路径、用户状态和可追溯元数据。"
                  : game.description}
              </p>
              <p>
                {isLocal
                  ? "管理器不会读取游戏内章节、路线、存档或成就；封面、发行信息和更多资料将在 C3/C4 完善。"
                  : "原型使用虚构条目。正式版本会在这里显示可追溯的字段来源、发行版本和本地安装；游戏内章节、路线与存档不在管理器的自动读取范围内。"}
              </p>
            </section>
            <section>
              <h2>游戏资料</h2>
              <dl className="detail-ledger">
                <div>
                  <dt>发售</dt>
                  <dd>{game.year ? game.year + " 年" : "未知"}</dd>
                </div>
                <div>
                  <dt>开发商</dt>
                  <dd>{game.developer}</dd>
                </div>
                <div>
                  <dt>引擎</dt>
                  <dd>{game.engine}</dd>
                </div>
                <div>
                  <dt>语言</dt>
                  <dd>{isLocal ? "未识别" : "日语 / 简体中文"}</dd>
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
                {game.notes
                  ? game.notes
                  : isLocal
                    ? "尚未添加备注。备注是手动内容，不是游戏内自动读取的状态；编辑功能将在 C3 接入。"
                    : "二周目想再走一遍月夜线。手动备注，不是游戏内自动读取的状态。"}
              </p>
              <Button variant="ghost" size="sm" disabled={isLocal}>
                编辑备注
              </Button>
            </section>
          </div>
        ) : null}

        {tab === "sessions" ? (
          <div className="detail-sessions">
            <header>
              <div>
                <h2>游玩记录</h2>
                <p>
                  {isLocal
                    ? "启动器将在 C3 接入；C6 接入后会自动生成会话并统计时长。"
                    : "会话由启动器开始与结束时间计算，可手动修正。"}
                </p>
              </div>
              <Button variant="secondary" size="sm" disabled={isLocal}>
                补录会话
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
                    <span>
                      <button type="button">编辑</button>
                      <button type="button">删除</button>
                    </span>
                  </div>
                ))
              ) : (
                <p className="detail-empty-row">
                  {isLocal
                    ? "还没有会话。C6 接入后，从启动器启动游戏会自动生成第一条记录。"
                    : "还没有会话。启动游戏后会在这里生成第一条记录。"}
                </p>
              )}
            </div>
          </div>
        ) : null}

        {tab === "launch" ? (
          <div className="detail-launch-grid">
            <section>
              <h2>启动路径</h2>
              <dl className="detail-ledger">
                <div>
                  <dt>可执行文件</dt>
                  <dd>{game.exePath}</dd>
                </div>
                <div>
                  <dt>工作目录</dt>
                  <dd>{game.installedPath}</dd>
                </div>
                <div>
                  <dt>启动参数</dt>
                  <dd className="detail-code">—</dd>
                </div>
                <div>
                  <dt>环境变量</dt>
                  <dd className="detail-code">—</dd>
                </div>
              </dl>
            </section>
            <section>
              <h2>显示与兼容</h2>
              <div className="detail-launch-row">
                <Monitor size={13} strokeWidth={1.5} />
                <span>主显示器 · 全屏（C3 接入）</span>
              </div>
              <div className="detail-launch-row">
                <ShieldCheck size={13} strokeWidth={1.5} />
                <span>Locale Emulator · 未配置</span>
              </div>
              <div className="detail-launch-row">
                <Clock3 size={13} strokeWidth={1.5} />
                <span>启动后自动记录会话（C6）</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => toast("路径校验和启动配置编辑将在 C3 接入。")}
              >
                校验并保存
              </Button>
            </section>
          </div>
        ) : null}

        {tab === "sources" ? (
          <div className="detail-sources">
            <header>
              <h2>元数据来源</h2>
              <p>
                {isLocal
                  ? "当前只有本地安装来源。VNDB、Bangumi、Steam 会在 C4/C5 接入，每个字段保留来源和锁定状态。"
                  : "每个字段保留来源、更新时间和锁定状态。"}
              </p>
            </header>
            {isLocal ? (
              <>
                <div className="detail-source-row">
                  <span>本地安装</span>
                  <p>{game.exePath}</p>
                  <em>{game.addedAt}</em>
                  <Tag tone="status">可追溯</Tag>
                </div>
                <div className="detail-source-row detail-source-row--placeholder">
                  <span>在线元数据</span>
                  <p>尚未接入 VNDB / Bangumi / Steam。</p>
                  <em>C4 / C5</em>
                  <Tag tone="muted">待接入</Tag>
                </div>
              </>
            ) : (
              [
                ["VNDB", "原题、开发商、标签", "11 月 11 日"],
                ["Bangumi", "中文标题、简介", "11 月 11 日"],
                ["本地", "封面、安装目录、启动路径", "11 月 12 日"],
              ].map(([source, fields, updated]) => (
                <div className="detail-source-row" key={source}>
                  <span>{source}</span>
                  <p>{fields}</p>
                  <em>{updated}</em>
                  <Tag tone={source === "本地" ? "status" : "data"}>可追溯</Tag>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
