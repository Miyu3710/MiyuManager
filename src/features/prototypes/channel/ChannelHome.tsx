import { ArrowRight, Play, Radio } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CoverArt } from "../../../design-system/components/CoverArt";
import { continueWorks, featuredWork, recentWorks } from "../data";

export function ChannelHome() {
  return (
    <div className="channel-home">
      <section className="channel-hero">
        <div className="channel-hero__still">
          <div className="channel-hero__backdrop" aria-hidden="true">
            <CoverArt work={featuredWork} />
          </div>
          <div className="channel-hero__poster">
            <CoverArt work={featuredWork} />
          </div>
          <div className="channel-hero__scanlines" aria-hidden="true" />
          <div className="channel-hero__osd">
            <p className="channel-now">
              <span>LAST PLAYED</span>
              <i />
              昨晚 23:18 · 本次 1 小时 42 分
            </p>
            <h1>{featuredWork.title}</h1>
            <p className="channel-hero__original">
              {featuredWork.originalTitle}
              <span>{featuredWork.romaji}</span>
            </p>
            <div className="channel-tags">
              {featuredWork.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
              <span className="channel-tags__rating">{featuredWork.ageRating}</span>
            </div>
            <p className="channel-route">
              个人评分 {featuredWork.score.toFixed(1)} / 10 · 已入库 {featuredWork.addedAt}
            </p>
            <div className="channel-actions">
              <button
                type="button"
                className="channel-button channel-button--primary"
                onClick={() => toast("原型预览：启动功能在主应用作品详情页中提供。")}
              >
                <Play size={14} fill="currentColor" strokeWidth={0} />
                启动游戏
              </button>
              <Link
                to={`/prototype/channel/work/${featuredWork.id}`}
                className="channel-button channel-button--ghost"
              >
                游戏资料
              </Link>
            </div>
            <div className="channel-hero__session">
              <span>累计 {featuredWork.playtime}</span>
              <i />
              <span>{featuredWork.launchCount} 次启动</span>
              <i />
              <span>{featuredWork.installedSize}</span>
            </div>
          </div>
          <span className="channel-hero__number" aria-hidden="true">
            04
          </span>
        </div>

        <aside className="channel-guide">
          <header>
            <span>最近游玩</span>
            <time>23:18</time>
          </header>
          <div className="channel-guide__item channel-guide__item--active">
            <span>23:18</span>
            <div>
              <b>月影工房</b>
              <p>昨晚 · 1 小时 42 分</p>
            </div>
            <i>最近</i>
          </div>
          <div className="channel-guide__item">
            <span>21:04</span>
            <div>
              <b>星屑唱片</b>
              <p>11.11 · 2 小时 06 分</p>
            </div>
            <i>已记录</i>
          </div>
          <div className="channel-guide__item">
            <span>11.09</span>
            <div>
              <b>冬灯</b>
              <p>22:40 · 54 分</p>
            </div>
            <i>已记录</i>
          </div>
          <div className="channel-guide__item">
            <span>11.07</span>
            <div>
              <b>玻璃庭院</b>
              <p>20:12 · 1 小时 18 分</p>
            </div>
            <i>已记录</i>
          </div>
          <div className="channel-guide__footer">
            <span>
              <Radio size={12} strokeWidth={1.5} />
              本地游戏库 · 自动记录时长
            </span>
            <Link to="/prototype/channel/library">
              查看游戏库
              <ArrowRight size={12} strokeWidth={1.5} />
            </Link>
          </div>
        </aside>
      </section>

      <section className="channel-row">
        <header className="channel-section-head">
          <div>
            <span>01</span>
            <h2>最近启动</h2>
            <em>再次启动上次玩过的游戏</em>
          </div>
          <Link to="/prototype/channel/library">
            全部游戏
            <ArrowRight size={12} strokeWidth={1.5} />
          </Link>
        </header>
        <div className="channel-cards">
          {continueWorks.map((work, index) => (
            <Link to={`/prototype/channel/work/${work.id}`} className="channel-card" key={work.id}>
              <div className="channel-card__still">
                <div className="channel-card__backdrop" aria-hidden="true">
                  <CoverArt work={work} />
                </div>
                <div className="channel-card__poster">
                  <CoverArt work={work} />
                </div>
                <span className="channel-card__no">{String(index + 1).padStart(2, "0")}</span>
                <span className="channel-card__play">
                  <Play size={10} fill="currentColor" strokeWidth={0} />
                </span>
              </div>
              <div className="channel-card__copy">
                <span className="channel-card__status">
                  {work.status === "reading"
                    ? "在玩"
                    : work.status === "finished"
                      ? "已通关"
                      : "想玩"}
                </span>
                <h3>{work.title}</h3>
                <p>{work.originalTitle}</p>
                <small>
                  累计 {work.playtime} · 上次 {work.lastPlayed}
                </small>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="channel-lower">
        <section className="channel-upnext">
          <header className="channel-section-head">
            <div>
              <span>02</span>
              <h2>想玩清单</h2>
              <em>按加入时间</em>
            </div>
            <button type="button">管理想玩</button>
          </header>
          <div className="channel-upnext__list">
            {recentWorks.slice(0, 4).map((work, index) => (
              <Link
                to={`/prototype/channel/work/${work.id}`}
                className="channel-upnext__item"
                key={work.id}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <CoverArt work={work} focus="top" />
                <div>
                  <b>{work.title}</b>
                  <p>{work.originalTitle}</p>
                </div>
                <em>{work.year}</em>
              </Link>
            ))}
          </div>
        </section>
        <aside className="channel-signal">
          <header>
            <span>库状态</span>
            <em>LOCAL</em>
          </header>
          <div className="channel-signal__bars" aria-hidden="true">
            {[18, 38, 64, 46, 72, 88, 54, 34, 62, 80, 44, 26].map((height, index) => (
              <i key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="channel-signal__stats">
            <div>
              <b>128</b>
              <span>库中</span>
            </div>
            <div>
              <b>34</b>
              <span>在玩</span>
            </div>
            <div>
              <b>6.4h</b>
              <span>本周</span>
            </div>
          </div>
          <p>所有游戏来自本地目录。离线也能启动和记录时长。</p>
        </aside>
      </div>
    </div>
  );
}
