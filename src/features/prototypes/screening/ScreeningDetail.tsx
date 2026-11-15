import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock3,
  FolderOpen,
  Monitor,
  Play,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CoverArt } from "../../../design-system/components/CoverArt";
import { statusLabels } from "../data";
import type { Work } from "../types";

export function ScreeningDetail({ work }: { work: Work }) {
  return (
    <div className="screening-detail">
      <div className="screening-back">
        <Link to="/prototype/screening/library">
          <ArrowLeft size={14} strokeWidth={1.5} />
          游戏库
        </Link>
        <span>/</span>
        <em>{work.title}</em>
      </div>

      <div className="screening-detail__hero">
        <div className="screening-detail__poster">
          <CoverArt work={work} />
          <div className="screening-detail__poster-meta">
            <span>{work.catalogNo}</span>
            <span>{work.year}</span>
          </div>
        </div>

        <div className="screening-detail__copy">
          <p className="screening-kicker">
            <span className="status-dot" />
            Galgame / AVG · {work.year} · {work.developer}
          </p>
          <h1>{work.title}</h1>
          <p className="screening-detail__original">
            {work.originalTitle}
            <span>{work.romaji}</span>
          </p>
          <div className="screening-tags">
            {work.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
            <span className="screening-tags__rating">{work.ageRating}</span>
          </div>
          <p className="screening-detail__score">个人评分 {work.score.toFixed(1)} / 10</p>
          <p className="screening-detail__desc">{work.description}</p>
          <div className="screening-detail__stats">
            <div>
              <b>{work.playtime}</b>
              <span>累计时长</span>
            </div>
            <div>
              <b>{work.lastPlayed}</b>
              <span>上次游玩</span>
            </div>
            <div>
              <b>{work.launchCount}</b>
              <span>启动次数</span>
            </div>
            <div>
              <b>{statusLabels[work.status]}</b>
              <span>游玩状态</span>
            </div>
          </div>
          <div className="screening-detail__actions">
            <button
              type="button"
              className="screening-button screening-button--primary"
              onClick={() => toast("原型预览：启动功能在主应用作品详情页中提供。")}
            >
              <Play size={14} fill="currentColor" strokeWidth={0} />
              启动游戏
            </button>
            <button type="button" className="screening-button screening-button--quiet">
              编辑启动配置
              <ArrowUpRight size={14} strokeWidth={1.6} />
            </button>
          </div>
        </div>

        <aside className="screening-session">
          <header>
            <span>游玩记录</span>
            <em>共 {work.launchCount} 次启动</em>
          </header>
          <div className="screening-session__item">
            <span>昨晚 23:18</span>
            <b>1 小时 42 分</b>
            <i style={{ width: "68%" }} />
          </div>
          <div className="screening-session__item">
            <span>11 月 11 日</span>
            <b>2 小时 06 分</b>
            <i style={{ width: "84%" }} />
          </div>
          <div className="screening-session__item">
            <span>11 月 09 日</span>
            <b>0 小时 54 分</b>
            <i style={{ width: "36%" }} />
          </div>
          <div className="screening-launch">
            <span>启动配置</span>
            <p>
              <FolderOpen size={13} strokeWidth={1.5} />
              D:\Games\月影工房\game.exe
            </p>
            <p>
              <Monitor size={13} strokeWidth={1.5} />
              主显示器 · 全屏
            </p>
            <p>
              <ShieldCheck size={13} strokeWidth={1.5} />
              Locale Emulator · 已配置
            </p>
            <p>
              <Clock3 size={13} strokeWidth={1.5} />
              {work.installedSize} · {work.edition}
            </p>
            <button
              type="button"
              onClick={() => toast("原型预览：路径校验在主应用作品详情页中提供。")}
            >
              <Check size={12} strokeWidth={1.6} />
              校验配置
            </button>
          </div>
        </aside>
      </div>

      <div className="screening-detail__lower">
        <section>
          <h2>游戏简介</h2>
          <p>{work.description}</p>
          <p>原型预览使用虚构条目。正式数据将支持标题别名、发行版本、本地安装和字段级来源追溯。</p>
        </section>
        <section>
          <h2>元数据来源</h2>
          <div className="screening-source">
            <span>VNDB</span>
            <p>标题、原题、开发商、标签</p>
            <em>3 天前更新</em>
          </div>
          <div className="screening-source">
            <span>Bangumi</span>
            <p>中文标题、简介、发行日期</p>
            <em>3 天前更新</em>
          </div>
        </section>
        <section>
          <h2>本地安装</h2>
          <div className="screening-path">
            <span>
              <Clock3 size={13} strokeWidth={1.5} />
              D:\Games\月影工房
            </span>
            <button type="button">在资源管理器中打开</button>
          </div>
        </section>
      </div>
    </div>
  );
}
