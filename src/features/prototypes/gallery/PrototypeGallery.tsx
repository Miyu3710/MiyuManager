import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CoverArt } from "../../../design-system/components/CoverArt";
import { WindowBar } from "../components/WindowBar";
import { continueWorks, directionList, featuredWork, recentWorks } from "../data";
import type { Direction } from "../types";
import "../shared.css";
import "../gallery.css";

function ScreeningPreview() {
  return (
    <div className="mini mini--screening" aria-hidden="true">
      <div className="mini-rail">
        <img className="mini-mark" src="/miyu-manager.png" alt="" />
        <span className="mini-rail__item mini-rail__item--active" />
        <span className="mini-rail__item" />
        <span className="mini-rail__item" />
        <span className="mini-rail__item" />
        <span className="mini-rail__foot" />
      </div>
      <div className="mini-stage">
        <div className="mini-topbar">
          <span>最近启动</span>
          <span className="mini-topbar__search">搜索游戏</span>
        </div>
        <div className="mini-hero">
          <div className="mini-hero__copy">
            <span className="mini-eyebrow">23:18 · 游戏启动器</span>
            <strong>{featuredWork.title}</strong>
            <span className="mini-jp">{featuredWork.originalTitle}</span>
            <span className="mini-pill">启动游戏</span>
          </div>
          <CoverArt work={featuredWork} className="mini-hero__cover" />
        </div>
        <div className="mini-shelf">
          {continueWorks.slice(1).map((work) => (
            <div className="mini-shelf__item" key={work.id}>
              <CoverArt work={work} />
              <span />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArchivePreview() {
  return (
    <div className="mini mini--archive" aria-hidden="true">
      <div className="mini-archive__masthead">
        <span className="mini-archive__wordmark">MIYU</span>
        <span>GAME SHELF</span>
        <span className="mini-archive__no">库中 0128</span>
      </div>
      <div className="mini-archive__rule" />
      <div className="mini-archive__hero">
        <div className="mini-archive__copy">
          <span className="mini-archive__kicker">最近添加 / 第 128 号</span>
          <strong>{featuredWork.title}</strong>
          <em>{featuredWork.originalTitle}</em>
          <span>
            {featuredWork.developer} · {featuredWork.year}
          </span>
          <span className="mini-archive__link">查看资料 →</span>
        </div>
        <CoverArt work={featuredWork} className="mini-archive__cover" />
      </div>
      <div className="mini-archive__index">
        <span>编号</span>
        <span>题名</span>
        <span>年份</span>
        <span>状态</span>
        {recentWorks.slice(0, 3).map((work) => (
          <span className="mini-archive__row" key={work.id}>
            <i>{work.catalogNo}</i>
            <b>{work.title}</b>
            <i>{work.year}</i>
            <i>{work.status === "finished" ? "已通关" : "在玩"}</i>
          </span>
        ))}
      </div>
    </div>
  );
}

function ChannelPreview() {
  return (
    <div className="mini mini--channel" aria-hidden="true">
      <div className="mini-channel__top">
        <span className="mini-channel__brand">MIYU / CH 04</span>
        <span className="mini-channel__live">
          <i /> LIVE
        </span>
        <time>23:18</time>
      </div>
      <div className="mini-channel__still">
        <div className="mini-channel__backdrop" aria-hidden="true">
          <CoverArt work={featuredWork} />
        </div>
        <div className="mini-channel__poster">
          <CoverArt work={featuredWork} />
        </div>
        <div className="mini-channel__osd">
          <span>LAST PLAYED</span>
          <strong>{featuredWork.title}</strong>
          <em>{featuredWork.originalTitle}</em>
          <div className="mini-channel__bar">
            <i style={{ width: "42%" }} />
          </div>
        </div>
        <span className="mini-channel__channel">04</span>
      </div>
      <div className="mini-channel__guide">
        <span>
          <b>21:00</b> 月影工房
        </span>
        <span>
          <b>22:30</b> 星屑唱片
        </span>
        <span>
          <b>00:10</b> 夜行性恋人
        </span>
      </div>
    </div>
  );
}

const previews: Record<Direction, () => ReactNode> = {
  screening: ScreeningPreview,
  archive: ArchivePreview,
  channel: ChannelPreview,
};

export function PrototypeGallery() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) {
        return;
      }
      const match = ["1", "2", "3"].indexOf(event.key);
      if (match >= 0) {
        const direction = directionList[match];
        if (direction) {
          navigate(`/prototype/${direction.id}`);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  return (
    <div className="app-window gallery-root">
      <WindowBar context="视觉方向评审" />
      <main className="gallery-main">
        <header className="gallery-head">
          <div className="gallery-head__title">
            <p className="gallery-kicker">
              <span>MiyuManager</span>
              <span className="gallery-kicker__rule" />
              <span>C1 / 原型 01</span>
            </p>
            <h1>
              选择你的
              <br />
              游戏库。
            </h1>
          </div>
          <div className="gallery-head__lede">
            <p>
              同一组
              Galgame、同一套信息，三种不同的组织方式。每一套都可以在首页、游戏库和游戏详情之间走动。
            </p>
            <p className="gallery-head__note">数据为本地 mock，封面为程序生成的 Galgame 占位图。</p>
          </div>
        </header>

        <section className="gallery-grid" aria-label="视觉方向原型">
          {directionList.map((direction) => {
            const Preview = previews[direction.id];
            return (
              <article className={`gallery-card gallery-card--${direction.id}`} key={direction.id}>
                <div className="gallery-card__preview">
                  <span className="gallery-card__letter">{direction.index}</span>
                  <Preview />
                </div>
                <div className="gallery-card__info">
                  <div className="gallery-card__meta">
                    <span>{direction.subtitle}</span>
                    <span className="gallery-card__no">{direction.index} / 03</span>
                  </div>
                  <h2>{direction.name}</h2>
                  <p>{direction.pitch}</p>
                  <div className="gallery-card__palette" aria-label="配色">
                    {direction.palette.map((color) => (
                      <span key={color.value} title={`${color.name} ${color.value}`}>
                        <i style={{ background: color.value }} />
                        {color.name}
                      </span>
                    ))}
                  </div>
                  <div className="gallery-card__footer">
                    <span className="gallery-card__type">{direction.typeLabel}</span>
                    <Link to={`/prototype/${direction.id}`} className="gallery-card__open">
                      打开原型
                      <ArrowUpRight size={15} strokeWidth={1.5} />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <footer className="gallery-foot">
          <span>三个方向 · 共用同一组本地数据</span>
          <span className="gallery-foot__hint">
            按 1 / 2 / 3 快速打开
            <ArrowRight size={13} strokeWidth={1.5} />
          </span>
        </footer>
      </main>
    </div>
  );
}
