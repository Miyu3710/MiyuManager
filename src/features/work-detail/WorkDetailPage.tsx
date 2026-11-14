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
import { Tag } from "../../design-system/components/Tag";
import { getGame, statusLabels } from "../../lib/game-data";
import { cn } from "../../lib/cn";
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
  const game = getGame(id);
  const [tab, setTab] = useState<Tab>("overview");

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
            <span>{game.year}</span>
          </div>
        </div>

        <div className="detail-copy">
          <p className="app-kicker">
            <span className="app-status-dot" />
            Galgame / AVG · {game.year} · {game.developer}
          </p>
          <h1>{game.title}</h1>
          <p className="detail-original">
            {game.originalTitle}
            <span>{game.romaji}</span>
          </p>
          <div className="detail-tags">
            {game.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
            <Tag tone="data">{game.ageRating}</Tag>
            <Tag tone="muted">{game.edition}</Tag>
          </div>
          <p className="detail-score">
            个人评分 {game.rating.toFixed(1)} / 10 · {game.launchCount} 次启动
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
            <Button variant="primary" onClick={() => toast("原型预览：启动器将在 C3 接入。")}>
              <Play size={14} fill="currentColor" strokeWidth={0} />
              启动游戏
            </Button>
            <Button variant="secondary" onClick={() => setTab("launch")}>
              编辑启动配置
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
                <i style={{ width: `${Math.min(session.minutes / 1.4, 100)}%` }} />
              </div>
            ))
          ) : (
            <p className="detail-side__empty">还没有游玩记录。启动游戏后会自动生成会话。</p>
          )}
          <div className="detail-install">
            <span>本地安装</span>
            <p>
              <FolderOpen size={13} strokeWidth={1.5} />
              {game.exePath}
            </p>
            <p>
              <HardDrive size={13} strokeWidth={1.5} />
              {game.installedSize} · {game.edition}
            </p>
            <button type="button" onClick={() => toast("原型预览：资源管理器将在 C3 接入。")}>
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
              <p>{game.description}</p>
              <p>
                原型使用虚构条目。正式版本会在这里显示可追溯的字段来源、发行版本和本地安装；游戏内章节、路线与存档不在管理器的自动读取范围内。
              </p>
            </section>
            <section>
              <h2>游戏资料</h2>
              <dl className="detail-ledger">
                <div>
                  <dt>发售</dt>
                  <dd>{game.year} 年</dd>
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
                  <dd>日语 / 简体中文</dd>
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
                二周目想再走一遍月夜线。手动备注，不是游戏内自动读取的状态。
              </p>
              <Button variant="ghost" size="sm">
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
                <p>会话由启动器开始与结束时间计算，可手动修正。</p>
              </div>
              <Button variant="secondary" size="sm">
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
                <p className="detail-empty-row">还没有会话。启动游戏后会在这里生成第一条记录。</p>
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
                <span>主显示器 · 全屏</span>
              </div>
              <div className="detail-launch-row">
                <ShieldCheck size={13} strokeWidth={1.5} />
                <span>Locale Emulator · 日语</span>
              </div>
              <div className="detail-launch-row">
                <Clock3 size={13} strokeWidth={1.5} />
                <span>启动后自动记录会话</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => toast("原型预览：路径校验将在 C3 接入。")}
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
              <p>每个字段保留来源、更新时间和锁定状态。</p>
            </header>
            {[
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
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
