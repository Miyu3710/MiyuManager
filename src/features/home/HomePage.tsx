import { ArrowRight, ArrowUpRight, Clock3, Play } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CoverArt } from "../../design-system/components/CoverArt";
import { Button } from "../../design-system/components/Button";
import { Tag } from "../../design-system/components/Tag";
import { featuredGame, recentGames, recentlyAdded, statusLabels } from "../../lib/game-data";
import "./home.css";

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <section className="home-hero">
        <span className="home-hero__kanji" aria-hidden="true">
          月
        </span>
        <div className="home-hero__glow" aria-hidden="true" />
        <div className="home-hero__copy">
          <p className="app-kicker">
            <span className="app-status-dot" />
            上次游玩 · {featuredGame.lastPlayed}
          </p>
          <h1>{featuredGame.title}</h1>
          <p className="home-hero__original">
            {featuredGame.originalTitle}
            <span>{featuredGame.romaji}</span>
          </p>
          <p className="home-hero__desc">{featuredGame.description}</p>
          <div className="home-tags">
            {featuredGame.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
            <Tag tone="data">{featuredGame.ageRating}</Tag>
          </div>
          <div className="home-meta">
            <span>{featuredGame.engine}</span>
            <i />
            <span>{featuredGame.edition}</span>
            <i />
            <span>{featuredGame.source}</span>
          </div>
          <div className="home-actions">
            <Button variant="primary" onClick={() => toast("原型预览：启动器将在 C3 接入。")}>
              <Play size={14} fill="currentColor" strokeWidth={0} />
              启动游戏
              <span className="home-actions__meta">{featuredGame.edition}</span>
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/work/${featuredGame.id}`)}>
              游戏详情
              <ArrowUpRight size={14} strokeWidth={1.6} />
            </Button>
          </div>
          <div className="home-signal">
            <span>累计 {featuredGame.playtime}</span>
            <i />
            <span>{featuredGame.launchCount} 次启动</span>
            <i />
            <span>{featuredGame.installedSize}</span>
          </div>
        </div>

        <div className="home-hero__poster">
          <span className="home-hero__no">
            {featuredGame.catalogNo} / {featuredGame.year}
          </span>
          <CoverArt work={featuredGame} />
          <p>
            <span>上次游玩</span>
            {featuredGame.lastPlayed}
          </p>
        </div>

        <div className="home-hero__side" aria-hidden="true">
          <span>PLAYER ONE / LOCAL</span>
          <i />
          <span>LIB 128</span>
        </div>
      </section>

      <section className="home-section">
        <header className="home-section__head">
          <div>
            <span className="home-section__index">02</span>
            <h2>最近启动</h2>
            <em>再次启动上次玩过的游戏</em>
          </div>
          <Link to="/library">
            全部游戏
            <ArrowRight size={13} strokeWidth={1.5} />
          </Link>
        </header>
        <div className="home-recent">
          {recentGames.map((game) => (
            <Link to={`/work/${game.id}`} className="home-recent__card" key={game.id}>
              <CoverArt work={game} />
              <div className="home-recent__copy">
                <span className="home-card-status">{statusLabels[game.status]}</span>
                <h3>{game.title}</h3>
                <p>{game.originalTitle}</p>
                <small>
                  <Clock3 size={10} strokeWidth={1.6} />
                  {game.playtime} · 上次 {game.lastPlayed}
                </small>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <header className="home-section__head">
          <div>
            <span className="home-section__index">03</span>
            <h2>最近入库</h2>
            <em>本周新增 6 部</em>
          </div>
          <Link to="/library">
            管理游戏库
            <ArrowRight size={13} strokeWidth={1.5} />
          </Link>
        </header>
        <div className="home-added">
          {recentlyAdded.map((game) => (
            <Link to={`/work/${game.id}`} className="home-added__item" key={game.id}>
              <CoverArt work={game} />
              <div>
                <h3>{game.title}</h3>
                <p>{game.developer}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
