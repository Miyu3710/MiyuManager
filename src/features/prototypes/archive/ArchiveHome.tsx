import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CoverArt } from "../../../design-system/components/CoverArt";
import { continueWorks, featuredWork, recentWorks } from "../data";

export function ArchiveHome() {
  return (
    <div className="archive-home">
      <section className="archive-hero">
        <div className="archive-hero__object">
          <span className="archive-stamp">最近入库</span>
          <span className="archive-edition">{featuredWork.edition}</span>
          <div className="archive-cover-mat">
            <CoverArt work={featuredWork} />
          </div>
          <div className="archive-object-caption">
            <span>{featuredWork.catalogNo}</span>
            <span>封面 / 包装 1200 × 1800</span>
          </div>
        </div>

        <div className="archive-hero__copy">
          <p className="archive-kicker">个人收藏 / 最近游玩</p>
          <h1>{featuredWork.title}</h1>
          <p className="archive-original">
            {featuredWork.originalTitle}
            <span>{featuredWork.romaji}</span>
          </p>
          <p className="archive-route">
            个人评分 {featuredWork.score.toFixed(1)} / 10 · 已入库 {featuredWork.addedAt}
          </p>
          <p className="archive-hero__desc">{featuredWork.description}</p>
          <dl className="archive-facts">
            <div>
              <dt>发售</dt>
              <dd>{featuredWork.year}</dd>
            </div>
            <div>
              <dt>开发商</dt>
              <dd>{featuredWork.developer}</dd>
            </div>
            <div>
              <dt>类型</dt>
              <dd>{featuredWork.tags.join(" / ")}</dd>
            </div>
            <div>
              <dt>游玩状态</dt>
              <dd>{featuredWork.status === "reading" ? "在玩" : "已入库"}</dd>
            </div>
          </dl>
          <div className="archive-actions">
            <button
              type="button"
              className="archive-button archive-button--primary"
              onClick={() => toast("原型预览：启动功能在主应用作品详情页中提供。")}
            >
              启动游戏
              <ArrowRight size={14} strokeWidth={1.6} />
            </button>
            <Link
              to={`/prototype/archive/work/${featuredWork.id}`}
              className="archive-button archive-button--link"
            >
              查看游戏资料
              <ArrowUpRight size={13} strokeWidth={1.6} />
            </Link>
          </div>
        </div>

        <aside className="archive-staff-note">
          <span>最近游玩</span>
          <b>昨晚 23:18</b>
          <p>
            本次 {featuredWork.lastSession}
            <br />
            累计 {featuredWork.playtime}
          </p>
        </aside>

        <aside className="archive-hero__margin">
          <div>
            <span>库中游戏</span>
            <b>128</b>
            <em>部游戏</em>
          </div>
          <div>
            <span>本周游玩</span>
            <b>6.4</b>
            <em>小时</em>
          </div>
          <p>所有条目均保存在本机。元数据来源可追溯，字段可手动校正。</p>
        </aside>
      </section>

      <section className="archive-section archive-section--continue">
        <header className="archive-section__head">
          <div>
            <span className="archive-section__index">01</span>
            <h2>最近启动</h2>
            <em>按上次游玩时间排序</em>
          </div>
          <Link to="/prototype/archive/library">
            游戏库
            <ArrowRight size={12} strokeWidth={1.5} />
          </Link>
        </header>
        <div className="archive-continue__grid">
          {continueWorks.slice(0, 3).map((work, index) => (
            <Link
              to={`/prototype/archive/work/${work.id}`}
              className="archive-continue__item"
              key={work.id}
            >
              <span className="archive-continue__no">{String(index + 1).padStart(2, "0")}</span>
              <CoverArt work={work} />
              <div>
                <span className="archive-item-status">
                  {work.status === "reading"
                    ? "在玩"
                    : work.status === "finished"
                      ? "已通关"
                      : work.status === "paused"
                        ? "搁置"
                        : "想玩"}
                </span>
                <h3>{work.title}</h3>
                <p>{work.originalTitle}</p>
                <small>
                  {work.playtime} · 上次 {work.lastPlayed}
                </small>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="archive-section archive-section--recent">
        <header className="archive-section__head">
          <div>
            <span className="archive-section__index">02</span>
            <h2>最近添加</h2>
            <em>最近 30 天入库</em>
          </div>
          <button type="button">
            全部最近添加
            <ArrowRight size={12} strokeWidth={1.5} />
          </button>
        </header>
        <div className="archive-recent__grid">
          {recentWorks.slice(0, 5).map((work, index) => (
            <Link
              to={`/prototype/archive/work/${work.id}`}
              className="archive-recent__item"
              key={work.id}
            >
              <span className="archive-recent__index">{String(index + 1).padStart(2, "0")}</span>
              <CoverArt work={work} />
              <div className="archive-recent__meta">
                <h3>{work.title}</h3>
                <p>{work.originalTitle}</p>
                <span>
                  {work.year} · {work.developer}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
